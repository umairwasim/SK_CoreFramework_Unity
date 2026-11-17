import Database from 'better-sqlite3';
import type { ApplyMode, AssetInfo, AssetKind, HistoryEntry, OperationSummary, Preset } from '../shared/types';

export interface AssetRow {
  id: number;
  rel_path: string;
  folder: string;
  name: string;
  ext: string;
  kind: AssetKind;
  size: number;
  mtime_ms: number;
  guid: string | null;
  labels_json: string;
  info_json: string | null;
  info_mtime: number | null;
}

/** Per-project database: <project>/.ats/ats.db (outside Assets/, so Unity never imports it). */
export class ProjectDb {
  readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rel_path TEXT NOT NULL UNIQUE,
        folder TEXT NOT NULL,
        name TEXT NOT NULL,
        ext TEXT NOT NULL,
        kind TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        guid TEXT,
        labels_json TEXT NOT NULL DEFAULT '[]',
        info_json TEXT,
        info_mtime REAL
      );
      CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind, folder);
      CREATE TABLE IF NOT EXISTS tags (
        rel_path TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (rel_path, tag)
      );
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        mode TEXT NOT NULL,
        preset_name TEXT,
        settings_json TEXT NOT NULL,
        backup_dir TEXT,
        undone INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id INTEGER NOT NULL REFERENCES operations(id),
        created_at INTEGER NOT NULL,
        rel_path TEXT NOT NULL,
        output_rel_path TEXT,
        ok INTEGER NOT NULL,
        message TEXT NOT NULL,
        bytes_before INTEGER,
        bytes_after INTEGER,
        guid_before TEXT,
        guid_after TEXT,
        backed_up_json TEXT NOT NULL DEFAULT '[]',
        created_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_history_op ON history(operation_id);
    `);
  }

  close() {
    this.db.close();
  }

  // --- assets ---------------------------------------------------------------
  upsertAsset(a: Omit<AssetRow, 'id' | 'info_json' | 'info_mtime'>) {
    this.db
      .prepare(
        `INSERT INTO assets (rel_path, folder, name, ext, kind, size, mtime_ms, guid, labels_json)
         VALUES (@rel_path, @folder, @name, @ext, @kind, @size, @mtime_ms, @guid, @labels_json)
         ON CONFLICT(rel_path) DO UPDATE SET
           size=excluded.size, mtime_ms=excluded.mtime_ms, guid=excluded.guid, labels_json=excluded.labels_json,
           info_json = CASE WHEN assets.mtime_ms = excluded.mtime_ms AND assets.size = excluded.size THEN assets.info_json ELSE NULL END`
      )
      .run(a);
  }

  deleteAsset(relPath: string) {
    this.db.prepare('DELETE FROM assets WHERE rel_path = ?').run(relPath);
  }

  deleteMissing(seen: Set<string>): number {
    const all = this.db.prepare('SELECT rel_path FROM assets').all() as { rel_path: string }[];
    const del = this.db.prepare('DELETE FROM assets WHERE rel_path = ?');
    let n = 0;
    for (const r of all) if (!seen.has(r.rel_path)) (del.run(r.rel_path), n++);
    return n;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  getAsset(id: number): AssetRow | undefined {
    return this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
  }

  getAssetByPath(rel: string): AssetRow | undefined {
    return this.db.prepare('SELECT * FROM assets WHERE rel_path = ?').get(rel) as AssetRow | undefined;
  }

  queryAssets(where: string, params: unknown[], order: string): AssetRow[] {
    return this.db.prepare(`SELECT * FROM assets WHERE ${where} ORDER BY ${order}`).all(...params) as AssetRow[];
  }

  allOfKind(kind: AssetKind): AssetRow[] {
    return this.db.prepare('SELECT * FROM assets WHERE kind = ?').all(kind) as AssetRow[];
  }

  counts(): { kind: AssetKind; n: number; bytes: number }[] {
    return this.db.prepare('SELECT kind, COUNT(*) n, SUM(size) bytes FROM assets GROUP BY kind').all() as { kind: AssetKind; n: number; bytes: number }[];
  }

  setInfo(id: number, info: AssetInfo, mtime: number) {
    this.db.prepare('UPDATE assets SET info_json = ?, info_mtime = ? WHERE id = ?').run(JSON.stringify(info), mtime, id);
  }

  // --- tags -----------------------------------------------------------------
  tagsFor(rel: string): string[] {
    return (this.db.prepare('SELECT tag FROM tags WHERE rel_path = ? ORDER BY tag').all(rel) as { tag: string }[]).map((r) => r.tag);
  }

  allTags(): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const r of this.db.prepare('SELECT rel_path, tag FROM tags').all() as { rel_path: string; tag: string }[]) {
      const arr = m.get(r.rel_path) ?? [];
      arr.push(r.tag);
      m.set(r.rel_path, arr);
    }
    return m;
  }

  setTags(rel: string, tags: string[]) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM tags WHERE rel_path = ?').run(rel);
      const ins = this.db.prepare('INSERT OR IGNORE INTO tags (rel_path, tag) VALUES (?, ?)');
      for (const t of tags) ins.run(rel, t);
    });
  }

  // --- operations / history -------------------------------------------------
  createOperation(mode: ApplyMode, presetName: string | null, settingsJson: string, backupDir: string): number {
    return Number(
      this.db.prepare('INSERT INTO operations (created_at, mode, preset_name, settings_json, backup_dir) VALUES (?, ?, ?, ?, ?)').run(Date.now(), mode, presetName, settingsJson, backupDir).lastInsertRowid
    );
  }

  addHistory(h: {
    operation_id: number;
    rel_path: string;
    output_rel_path: string | null;
    ok: boolean;
    message: string;
    bytes_before: number | null;
    bytes_after: number | null;
    guid_before: string | null;
    guid_after: string | null;
    backed_up: string[];
    created: string[];
  }) {
    this.db
      .prepare(
        `INSERT INTO history (operation_id, created_at, rel_path, output_rel_path, ok, message, bytes_before, bytes_after, guid_before, guid_after, backed_up_json, created_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(h.operation_id, Date.now(), h.rel_path, h.output_rel_path, h.ok ? 1 : 0, h.message, h.bytes_before, h.bytes_after, h.guid_before, h.guid_after, JSON.stringify(h.backed_up), JSON.stringify(h.created));
  }

  listOperations(): OperationSummary[] {
    const rows = this.db
      .prepare(
        `SELECT o.id, o.created_at, o.mode, o.preset_name, o.undone, o.backup_dir,
                COUNT(h.id) item_count, COALESCE(SUM(h.ok), 0) ok_count
         FROM operations o LEFT JOIN history h ON h.operation_id = o.id
         GROUP BY o.id ORDER BY o.id DESC LIMIT 200`
      )
      .all() as { id: number; created_at: number; mode: ApplyMode; preset_name: string | null; undone: number; backup_dir: string | null; item_count: number; ok_count: number }[];
    return rows.map((r) => ({ id: r.id, createdAt: r.created_at, mode: r.mode, presetName: r.preset_name, itemCount: r.item_count, okCount: r.ok_count, undone: !!r.undone, backupDir: r.backup_dir }));
  }

  getOperation(id: number) {
    return this.db.prepare('SELECT * FROM operations WHERE id = ?').get(id) as
      | { id: number; created_at: number; mode: ApplyMode; preset_name: string | null; settings_json: string; backup_dir: string | null; undone: number }
      | undefined;
  }

  lastUndoableOperation(): number | null {
    const r = this.db.prepare('SELECT id FROM operations WHERE undone = 0 ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
    return r?.id ?? null;
  }

  markUndone(id: number) {
    this.db.prepare('UPDATE operations SET undone = 1 WHERE id = ?').run(id);
  }

  historyRows(operationId?: number) {
    const sql = `SELECT h.*, o.mode, o.preset_name, o.settings_json, o.undone FROM history h JOIN operations o ON o.id = h.operation_id
                 ${operationId ? 'WHERE h.operation_id = ?' : ''} ORDER BY h.id DESC LIMIT 1000`;
    return (operationId ? this.db.prepare(sql).all(operationId) : this.db.prepare(sql).all()) as {
      id: number; operation_id: number; created_at: number; rel_path: string; output_rel_path: string | null; ok: number; message: string;
      bytes_before: number | null; bytes_after: number | null; backed_up_json: string; created_json: string;
      mode: ApplyMode; preset_name: string | null; settings_json: string; undone: number;
    }[];
  }

  listHistory(operationId?: number): HistoryEntry[] {
    return this.historyRows(operationId).map((r) => ({
      id: r.id,
      operationId: r.operation_id,
      createdAt: r.created_at,
      mode: r.mode,
      presetName: r.preset_name,
      relPath: r.rel_path,
      outputRelPath: r.output_rel_path,
      ok: !!r.ok,
      message: r.message,
      bytesBefore: r.bytes_before,
      bytesAfter: r.bytes_after,
      settingsJson: r.settings_json,
      undone: !!r.undone,
    }));
  }
}

/** App-wide database (user presets). Lives in Electron's userData or ~/.ats for the web preview. */
export class GlobalDb {
  readonly db: Database.Database;
  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, settings_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
  }
  listPresets(): Preset[] {
    return (this.db.prepare('SELECT * FROM presets ORDER BY name').all() as { id: string; name: string; description: string | null; settings_json: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      builtIn: false,
      settings: JSON.parse(r.settings_json),
    }));
  }
  savePreset(p: Omit<Preset, 'builtIn'>) {
    this.db
      .prepare('INSERT INTO presets (id, name, description, settings_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, settings_json=excluded.settings_json, updated_at=excluded.updated_at')
      .run(p.id, p.name, p.description ?? null, JSON.stringify(p.settings), Date.now());
  }
  deletePreset(id: string) {
    this.db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  }
  close() {
    this.db.close();
  }
}
