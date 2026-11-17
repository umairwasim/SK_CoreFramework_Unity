/**
 * AtsService – the single facade both transports talk to:
 *   - Electron: ipcMain ⇄ preload ⇄ renderer   (src/main)
 *   - Web preview: HTTP RPC + SSE               (src/server)
 * It has no Electron imports, so it can also run in a utilityProcess / worker later.
 */
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { BUILTIN_PRESETS } from '../shared/defaults';
import type {
  ApplyRequest, AssetInfo, AssetKind, AssetQuery, AssetRecord, AtsEvent, FolderNode, HistoryEntry,
  JobStatus, OperationSummary, Preset, ToolStatus, WorkspaceInfo,
} from '../shared/types';
import { type AssetRow, GlobalDb, ProjectDb } from './db';
import { InProcessQueue } from './jobs';
import { safeResolve } from './paths';
import { audioInfo, audioPeaks, peaksToSvg } from './processors/audio';
import { modelInfo } from './processors/model';
import { textureInfo, texturePreviewPng, textureThumbnail } from './processors/texture';
import { indexFile, scanProject } from './scanner';
import { tools } from './tools';
import { type CommitRecord, transformAsset, undoItems } from './transform';
import { AssetWatcher } from './watcher';

export { RPC_METHODS, type RpcMethod } from '../shared/rpc';

interface Workspace {
  root: string;
  dataDir: string;
  db: ProjectDb;
  watcher: AssetWatcher;
  info: WorkspaceInfo;
}

export class AtsService {
  private ws: Workspace | null = null;
  private globalDb: GlobalDb;
  private listeners = new Set<(e: AtsEvent) => void>();
  private queue = new InProcessQueue((job) => this.emit({ type: 'job', job }));
  private infoInflight = new Map<number, Promise<AssetInfo | null>>();
  private thumbInflight = new Map<string, Promise<void>>();

  constructor(opts: { appDataDir: string }) {
    mkdirSync(opts.appDataDir, { recursive: true });
    this.globalDb = new GlobalDb(path.join(opts.appDataDir, 'ats-global.db'));
  }

  on(cb: (e: AtsEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(e: AtsEvent) {
    for (const l of this.listeners) l(e);
  }
  private log(level: 'info' | 'warn' | 'error', message: string) {
    this.emit({ type: 'log', level, message });
  }
  private need(): Workspace {
    if (!this.ws) throw new Error('No workspace open');
    return this.ws;
  }

  // ------------------------------------------------------------------ workspace
  async openWorkspace(root: string): Promise<WorkspaceInfo> {
    root = path.resolve(root);
    // Accept the Assets folder itself as a convenience
    if (path.basename(root) === 'Assets' && !existsSync(path.join(root, 'Assets'))) root = path.dirname(root);
    const st = await fs.stat(path.join(root, 'Assets')).catch(() => null);
    if (!st?.isDirectory()) throw new Error(`"${root}" is not a Unity project root (no Assets/ folder)`);

    await this.close();
    const dataDir = path.join(root, '.ats');
    await fs.mkdir(path.join(dataDir, 'thumbs'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'tmp'), { recursive: true });
    const db = new ProjectDb(path.join(dataDir, 'ats.db'));
    const watcher = new AssetWatcher(root, db, (kinds, relPaths) => {
      this.refreshCounts();
      this.emit({ type: 'assets-changed', kinds, relPaths });
    });
    let unityVersion: string | null = null;
    try {
      const pv = await fs.readFile(path.join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8');
      unityVersion = /m_EditorVersion:\s*(\S+)/.exec(pv)?.[1] ?? null;
    } catch { /* not required */ }
    this.ws = {
      root,
      dataDir,
      db,
      watcher,
      info: { root, name: path.basename(root), unityVersion, counts: { texture: 0, model: 0, audio: 0 }, totalBytes: 0, scannedAt: 0 },
    };
    await this.rescan();
    watcher.start();
    if (unityVersion && !unityVersion.startsWith('6')) this.log('warn', `Project uses Unity ${unityVersion}; defaults target Unity 6.`);
    return this.ws.info;
  }

  async close() {
    if (!this.ws) return;
    await this.ws.watcher.stop();
    this.ws.db.close();
    this.ws = null;
  }

  async getWorkspace() {
    return this.ws?.info ?? null;
  }

  private refreshCounts() {
    if (!this.ws) return;
    const counts: Record<AssetKind, number> = { texture: 0, model: 0, audio: 0 };
    let total = 0;
    for (const c of this.ws.db.counts()) {
      counts[c.kind] = c.n;
      total += c.bytes ?? 0;
    }
    this.ws.info = { ...this.ws.info, counts, totalBytes: total };
  }

  async rescan(): Promise<WorkspaceInfo | null> {
    const ws = this.ws;
    if (!ws) return null;
    this.emit({ type: 'scan-progress', scanned: 0, phase: 'walking' });
    const t0 = Date.now();
    const r = await scanProject(ws.root, ws.db, (n, phase) => this.emit({ type: 'scan-progress', scanned: n, phase }));
    ws.info.scannedAt = Date.now();
    this.refreshCounts();
    this.log('info', `Indexed ${r.count} assets in ${Date.now() - t0} ms${r.removed ? ` (${r.removed} removed)` : ''}`);
    this.emit({ type: 'workspace', workspace: ws.info });
    return ws.info;
  }

  // ------------------------------------------------------------------ queries
  private toRecord(r: AssetRow, dbTags?: string[]): AssetRecord {
    const labels: string[] = JSON.parse(r.labels_json || '[]');
    const tags = [...new Set([...labels, ...(dbTags ?? this.ws!.db.tagsFor(r.rel_path))])];
    return {
      id: r.id, relPath: r.rel_path, folder: r.folder, name: r.name, ext: r.ext, kind: r.kind, size: r.size,
      mtimeMs: r.mtime_ms, guid: r.guid, tags, info: r.info_json ? JSON.parse(r.info_json) : null,
    };
  }

  async listAssets(q: AssetQuery): Promise<AssetRecord[]> {
    const ws = this.need();
    const where = ['kind = ?'];
    const params: unknown[] = [q.kind];
    if (q.folder && q.folder !== 'Assets') {
      where.push('(folder = ? OR folder LIKE ?)');
      params.push(q.folder, `${q.folder}/%`);
    }
    if (q.search?.trim()) {
      where.push('rel_path LIKE ?');
      params.push(`%${q.search.trim()}%`);
    }
    if (q.formats?.length) {
      const f = new Set(q.formats.flatMap((x) => (x === 'jpg' ? ['jpg', 'jpeg'] : [x])));
      where.push(`ext IN (${[...f].map(() => '?').join(',')})`);
      params.push(...f);
    }
    if (q.minSize != null) (where.push('size >= ?'), params.push(q.minSize));
    if (q.maxSize != null) (where.push('size <= ?'), params.push(q.maxSize));
    const col = q.sort === 'size' ? 'size' : q.sort === 'mtime' ? 'mtime_ms' : 'rel_path COLLATE NOCASE';
    const rows = ws.db.queryAssets(where.join(' AND '), params, `${col} ${q.sortDir === 'desc' ? 'DESC' : 'ASC'}`);
    const tagMap = ws.db.allTags();
    let recs = rows.map((r) => this.toRecord(r, tagMap.get(r.rel_path) ?? []));
    if (q.tags?.length) recs = recs.filter((a) => q.tags!.every((t) => a.tags.includes(t)));
    return recs;
  }

  async getFolderTree(kind: AssetKind): Promise<FolderNode> {
    const ws = this.need();
    const root: FolderNode = { path: 'Assets', name: 'Assets', count: 0, children: [] };
    const index = new Map<string, FolderNode>([['Assets', root]]);
    for (const a of ws.db.allOfKind(kind)) {
      const parts = a.folder.split('/');
      let cur = root;
      root.count++;
      for (let i = 1; i < parts.length; i++) {
        const p = parts.slice(0, i + 1).join('/');
        let node = index.get(p);
        if (!node) {
          node = { path: p, name: parts[i], count: 0, children: [] };
          index.set(p, node);
          cur.children.push(node);
        }
        node.count++;
        cur = node;
      }
    }
    const sort = (n: FolderNode) => {
      n.children.sort((a, b) => a.name.localeCompare(b.name));
      n.children.forEach(sort);
    };
    sort(root);
    return root;
  }

  async getFacets(kind: AssetKind) {
    const ws = this.need();
    const rows = ws.db.allOfKind(kind);
    const formats = [...new Set(rows.map((r) => (r.ext === 'jpeg' ? 'jpg' : r.ext)))].sort();
    const tagMap = ws.db.allTags();
    const tags = new Set<string>();
    for (const r of rows) {
      for (const t of JSON.parse(r.labels_json || '[]')) tags.add(t);
      for (const t of tagMap.get(r.rel_path) ?? []) tags.add(t);
    }
    return { formats, tags: [...tags].sort() };
  }

  async getAsset(id: number) {
    const ws = this.need();
    const r = ws.db.getAsset(id);
    return r ? this.toRecord(r) : null;
  }

  private ensureInfo = (row: AssetRow): Promise<AssetInfo | null> => {
    const ws = this.need();
    if (row.info_json && row.info_mtime === row.mtime_ms) return Promise.resolve(JSON.parse(row.info_json));
    let p = this.infoInflight.get(row.id);
    if (!p) {
      const abs = safeResolve(ws.root, row.rel_path);
      p = (async () => {
        try {
          const info: AssetInfo =
            row.kind === 'texture' ? await textureInfo(abs, row.ext) : row.kind === 'audio' ? await audioInfo(abs) : await modelInfo(abs, row.ext);
          ws.db.setInfo(row.id, info, row.mtime_ms);
          return info;
        } catch (e) {
          this.log('warn', `Info for ${row.rel_path}: ${(e as Error).message}`);
          return null;
        } finally {
          this.infoInflight.delete(row.id);
        }
      })();
      this.infoInflight.set(row.id, p);
    }
    return p;
  };

  async getAssetInfo(id: number) {
    const row = this.need().db.getAsset(id);
    return row ? this.ensureInfo(row) : null;
  }

  async readMeta(id: number) {
    const ws = this.need();
    const row = ws.db.getAsset(id);
    if (!row) return null;
    return fs.readFile(safeResolve(ws.root, row.rel_path) + '.meta', 'utf8').catch(() => null);
  }

  async setTags(id: number, tags: string[]) {
    const ws = this.need();
    const row = ws.db.getAsset(id);
    if (!row) return null;
    const labels: string[] = JSON.parse(row.labels_json || '[]');
    ws.db.setTags(row.rel_path, [...new Set(tags.map((t) => t.trim()).filter((t) => t && !labels.includes(t)))]);
    return this.toRecord(row);
  }

  // ------------------------------------------------------------------ files for the renderer
  /** Returns an absolute path (or an in-memory PNG for TGA previews) for a project-relative file. */
  async resolveFile(rel: string, as?: string): Promise<{ path?: string; buffer?: Buffer; mime: string }> {
    const ws = this.need();
    const abs = safeResolve(ws.root, rel);
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (as === 'png' && ext === 'tga') return { buffer: await texturePreviewPng(abs, 'tga'), mime: 'image/png' };
    const mime: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', tga: 'image/x-tga', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
      glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', fbx: 'application/octet-stream', obj: 'text/plain', mtl: 'text/plain',
    };
    return { path: abs, mime: mime[ext] ?? 'application/octet-stream' };
  }

  async getThumbnail(id: number): Promise<{ path: string; mime: string } | null> {
    const ws = this.need();
    const row = ws.db.getAsset(id);
    if (!row || row.kind === 'model') return null;
    const isAudio = row.kind === 'audio';
    const file = path.join(ws.dataDir, 'thumbs', `${row.id}-${Math.floor(row.mtime_ms)}.${isAudio ? 'svg' : 'webp'}`);
    if (!existsSync(file)) {
      let p = this.thumbInflight.get(file);
      if (!p) {
        const abs = safeResolve(ws.root, row.rel_path);
        p = (async () => {
          if (isAudio) await fs.writeFile(file, peaksToSvg(await audioPeaks(abs)));
          else await textureThumbnail(abs, row.ext, file);
        })().finally(() => this.thumbInflight.delete(file));
        this.thumbInflight.set(file, p);
      }
      await p;
    }
    return { path: file, mime: isAudio ? 'image/svg+xml' : 'image/webp' };
  }

  // ------------------------------------------------------------------ presets
  async listPresets(): Promise<Preset[]> {
    return [...BUILTIN_PRESETS, ...this.globalDb.listPresets()];
  }
  async savePreset(p: Omit<Preset, 'builtIn'>) {
    if (BUILTIN_PRESETS.some((b) => b.id === p.id)) throw new Error('Built-in presets are read-only – save under a new name');
    if (!p.name?.trim()) throw new Error('Preset name required');
    this.globalDb.savePreset({ ...p, id: p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    return this.listPresets();
  }
  async deletePreset(id: string) {
    if (BUILTIN_PRESETS.some((b) => b.id === id)) throw new Error('Built-in presets cannot be deleted');
    this.globalDb.deletePreset(id);
    return this.listPresets();
  }

  // ------------------------------------------------------------------ apply
  async apply(req: ApplyRequest): Promise<JobStatus> {
    const ws = this.need();
    const rows = req.assetIds.map((id) => ws.db.getAsset(id)).filter((r): r is AssetRow => !!r);
    if (!rows.length) throw new Error('No assets selected');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    let opId = 0;
    let backupDir = '';
    const records: CommitRecord[] = [];
    const suppressed: string[] = [];
    const suppress = (abs: string) => {
      ws.watcher.suppressed.add(abs);
      suppressed.push(abs);
    };
    const label = `${req.mode === 'overwrite' ? 'Overwrite' : 'Save as New'} · ${rows.length} asset${rows.length > 1 ? 's' : ''}${req.presetName ? ` · ${req.presetName}` : ''}`;

    return this.queue.enqueue<AssetRow>({
      label,
      items: rows,
      labelOf: (r) => r.rel_path,
      onStart: async (job) => {
        opId = ws.db.createOperation(req.mode, req.presetName ?? null, JSON.stringify(req.settings), '');
        backupDir = path.join(ws.root, 'ATS_Backup', `${String(opId).padStart(4, '0')}_${stamp}`);
        ws.db.db.prepare('UPDATE operations SET backup_dir = ? WHERE id = ?').run(backupDir, opId);
        job.operationId = opId;
      },
      run: async (row) => {
        const fresh = ws.db.getAsset(row.id) ?? row;
        try {
          const rec = await transformAsset({ root: ws.root, tmpDir: path.join(ws.dataDir, 'tmp'), backupDir, ensureInfo: this.ensureInfo, suppress }, fresh, req);
          records.push(rec);
          ws.db.addHistory({
            operation_id: opId, rel_path: fresh.rel_path, output_rel_path: rec.result.outputRelPath ?? null, ok: true, message: rec.result.message,
            bytes_before: rec.result.bytesBefore ?? null, bytes_after: rec.result.bytesAfter ?? null, guid_before: rec.result.guidBefore ?? null,
            guid_after: rec.result.guidAfter ?? null, backed_up: rec.backedUp, created: rec.created,
          });
          for (const rel of rec.touched) {
            const f = await indexFile(ws.root, safeResolve(ws.root, rel));
            if (f) ws.db.upsertAsset(f);
          }
          return rec.result;
        } catch (e) {
          const message = (e as Error).message;
          ws.db.addHistory({ operation_id: opId, rel_path: fresh.rel_path, output_rel_path: null, ok: false, message, bytes_before: fresh.size, bytes_after: null, guid_before: fresh.guid, guid_after: null, backed_up: [], created: [] });
          return { assetId: fresh.id, relPath: fresh.rel_path, ok: false, message };
        }
      },
      onFinish: async () => {
        setTimeout(() => suppressed.forEach((s) => ws.watcher.suppressed.delete(s)), 1500);
        if (!records.some((r) => r.backedUp.length)) await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
        this.refreshCounts();
        this.emit({ type: 'assets-changed', kinds: [...new Set(rows.map((r) => r.kind))], relPaths: records.flatMap((r) => r.touched) });
        this.emit({ type: 'workspace', workspace: ws.info });
        this.emit({ type: 'history-changed' });
      },
    });
  }

  async cancelJob(id: string) {
    this.queue.cancel(id);
  }
  async listJobs() {
    return this.queue.list();
  }

  // ------------------------------------------------------------------ history / undo
  async listOperations(): Promise<OperationSummary[]> {
    return this.need().db.listOperations();
  }
  async listHistory(operationId?: number): Promise<HistoryEntry[]> {
    return this.need().db.listHistory(operationId);
  }

  async undoOperation(operationId?: number) {
    const ws = this.need();
    const id = operationId ?? ws.db.lastUndoableOperation();
    if (!id) throw new Error('Nothing to undo');
    const op = ws.db.getOperation(id);
    if (!op) throw new Error(`Operation #${id} not found`);
    if (op.undone) throw new Error(`Operation #${id} was already undone`);
    const rows = ws.db.historyRows(id).filter((r) => r.ok);
    const items = rows.map((r) => ({ backedUp: JSON.parse(r.backed_up_json) as string[], created: JSON.parse(r.created_json) as string[] }));
    const suppressed: string[] = [];
    const res = await undoItems(ws.root, op.backup_dir ?? '', items, (abs) => {
      ws.watcher.suppressed.add(abs);
      suppressed.push(abs);
    });
    ws.db.markUndone(id);
    const touched = new Set(items.flatMap((i) => [...i.backedUp, ...i.created]).map((r) => r.replace(/\.meta$/, '')));
    for (const rel of touched) {
      const f = await indexFile(ws.root, safeResolve(ws.root, rel));
      if (f) ws.db.upsertAsset(f);
      else ws.db.deleteAsset(rel);
    }
    setTimeout(() => suppressed.forEach((s) => ws.watcher.suppressed.delete(s)), 1500);
    this.refreshCounts();
    this.emit({ type: 'assets-changed', kinds: ['texture', 'model', 'audio'], relPaths: [...touched] });
    this.emit({ type: 'workspace', workspace: ws.info });
    this.emit({ type: 'history-changed' });
    const message = `Undid operation #${id}: ${res.restored} file(s) restored, ${res.removed} created file(s) removed${res.missing.length ? `, ${res.missing.length} backup(s) missing` : ''}`;
    this.log(res.missing.length ? 'warn' : 'info', message);
    return { restored: res.restored, removed: res.removed, message };
  }

  async toolStatus(): Promise<ToolStatus> {
    return tools();
  }
}
