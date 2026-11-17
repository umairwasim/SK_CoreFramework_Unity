import { promises as fs } from 'node:fs';
import path from 'node:path';
import { kindForExt } from '../shared/defaults';
import type { AssetKind } from '../shared/types';
import type { ProjectDb } from './db';
import { readGuid, readLabels } from './meta';
import { splitRel, toRel, unityIgnored } from './paths';

export interface IndexedFile {
  rel_path: string;
  folder: string;
  name: string;
  ext: string;
  kind: AssetKind;
  size: number;
  mtime_ms: number;
  guid: string | null;
  labels_json: string;
}

async function readMetaSafe(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs + '.meta', 'utf8');
  } catch {
    return null;
  }
}

/** Stat + .meta read for a single asset file. Returns null if it isn't a tracked asset type. */
export async function indexFile(root: string, abs: string): Promise<IndexedFile | null> {
  const rel = toRel(root, abs);
  const { folder, name, ext } = splitRel(rel);
  const kind = kindForExt(ext);
  if (!kind) return null;
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const meta = await readMetaSafe(abs);
  return {
    rel_path: rel,
    folder,
    name,
    ext,
    kind,
    size: st.size,
    mtime_ms: Math.floor(st.mtimeMs),
    guid: readGuid(meta),
    labels_json: JSON.stringify(readLabels(meta)),
  };
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (unityIgnored(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && !e.name.endsWith('.meta')) yield p;
  }
}

/** Full scan of <root>/Assets. Upserts in batches and removes rows for files that disappeared. */
export async function scanProject(root: string, db: ProjectDb, onProgress?: (n: number, phase: 'walking' | 'indexing' | 'done') => void) {
  const assetsDir = path.join(root, 'Assets');
  const seen = new Set<string>();
  let batch: IndexedFile[] = [];
  let n = 0;
  const flush = () => {
    const b = batch;
    batch = [];
    db.transaction(() => b.forEach((f) => db.upsertAsset(f)));
  };
  const pending: Promise<void>[] = [];
  for await (const abs of walk(assetsDir)) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!kindForExt(ext)) continue;
    pending.push(
      indexFile(root, abs).then((f) => {
        if (!f) return;
        seen.add(f.rel_path);
        batch.push(f);
        n++;
        if (batch.length >= 500) flush();
        if (n % 200 === 0) onProgress?.(n, 'indexing');
      })
    );
    if (pending.length >= 64) await Promise.all(pending.splice(0));
  }
  await Promise.all(pending);
  flush();
  const removed = db.deleteMissing(seen);
  onProgress?.(n, 'done');
  return { count: n, removed };
}
