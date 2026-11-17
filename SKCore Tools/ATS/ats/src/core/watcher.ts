import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { kindForExt } from '../shared/defaults';
import type { AssetKind } from '../shared/types';
import type { ProjectDb } from './db';
import { toRel, unityIgnored } from './paths';
import { indexFile } from './scanner';

/**
 * Live-syncs the SQLite index with <root>/Assets.
 * Changes are debounced and reported as one `assets-changed` batch.
 */
export class AssetWatcher {
  private watcher: FSWatcher | null = null;
  private pending = new Map<string, 'upsert' | 'delete'>();
  private timer: NodeJS.Timeout | null = null;
  /** Paths ATS itself is writing right now – ignored to avoid feedback loops during a job. */
  readonly suppressed = new Set<string>();

  constructor(
    private root: string,
    private db: ProjectDb,
    private onChange: (kinds: AssetKind[], relPaths: string[]) => void
  ) {}

  start() {
    const assets = path.join(this.root, 'Assets');
    this.watcher = chokidar.watch(assets, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
      ignored: (p: string) => {
        const base = path.basename(p);
        return p !== assets && unityIgnored(base);
      },
    });
    const handle = (kind: 'upsert' | 'delete') => (abs: string) => {
      let target = abs;
      if (abs.endsWith('.meta')) target = abs.slice(0, -5); // meta changed → re-read GUID/labels of its asset
      if (!kindForExt(path.extname(target).slice(1))) return;
      if (this.suppressed.has(target)) return;
      this.pending.set(target, abs.endsWith('.meta') ? 'upsert' : kind);
      this.schedule();
    };
    this.watcher.on('add', handle('upsert')).on('change', handle('upsert')).on('unlink', handle('delete'));
    return this;
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 250);
  }

  async flush() {
    const items = [...this.pending];
    this.pending.clear();
    if (!items.length) return;
    const kinds = new Set<AssetKind>();
    const rels: string[] = [];
    for (const [abs, op] of items) {
      const rel = toRel(this.root, abs);
      const k = kindForExt(path.extname(abs).slice(1));
      if (k) kinds.add(k);
      rels.push(rel);
      if (op === 'delete') this.db.deleteAsset(rel);
      else {
        const f = await indexFile(this.root, abs);
        if (f) this.db.upsertAsset(f);
        else this.db.deleteAsset(rel);
      }
    }
    this.onChange([...kinds], rels);
  }

  async stop() {
    if (this.timer) clearTimeout(this.timer);
    await this.watcher?.close();
    this.watcher = null;
  }
}
