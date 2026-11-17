/**
 * Apply pipeline for one asset.
 *
 *   1. source step   → writes a temp file in <project>/.ats/tmp (never inside Assets/)
 *   2. importer step → patches .meta text in memory (GUID line untouched)
 *   3. commit        → back up every file about to be replaced into ATS_Backup/<op>/…,
 *                      atomically rename temp files into place, then re-read the .meta
 *                      and verify the GUID. On mismatch: restore from backup and fail.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ApplyRequest, AssetInfo, AudioInfo, JobItemResult } from '../shared/types';
import type { AssetRow } from './db';
import { patchAudioMeta, patchModelMeta, patchTextureMeta } from './importers';
import { MetaEditor, newGuid, readGuid, readImporterType, replaceGuid } from './meta';
import { safeResolve, splitRel } from './paths';
import { audioSourceIsNoop, processAudio } from './processors/audio';
import { fbxToGlb, processGltf } from './processors/model';
import { processTexture } from './processors/texture';

export interface TransformCtx {
  root: string;
  tmpDir: string;
  backupDir: string; // <root>/ATS_Backup/<op-id>_<stamp>
  ensureInfo(asset: AssetRow): Promise<AssetInfo | null>;
  suppress(abs: string): void;
}

export interface CommitRecord {
  result: JobItemResult;
  backedUp: string[]; // project-relative paths copied into backupDir
  created: string[]; // project-relative paths that did not exist before
  touched: string[]; // assets to re-index
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** Atomic replace. Same filesystem (temp lives under the project root) → rename is atomic. */
export async function moveInto(src: string, dst: string) {
  try {
    await fs.rename(src, dst);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV' && (e as NodeJS.ErrnoException).code !== 'EPERM') throw e;
    await fs.copyFile(src, dst);
    await fs.unlink(src);
  }
}

export function sanitizeSuffix(s: string) {
  return s.replace(/[^A-Za-z0-9_.-]/g, '');
}

export async function transformAsset(ctx: TransformCtx, asset: AssetRow, req: ApplyRequest): Promise<CommitRecord> {
  const rel = asset.rel_path;
  const abs = safeResolve(ctx.root, rel);
  const metaAbs = abs + '.meta';
  const { folder, name, ext } = splitRel(rel);
  const notes: string[] = [];
  const temps: string[] = [];
  const tmp = (e: string) => {
    const p = path.join(ctx.tmpDir, `${randomUUID()}.${e}`);
    temps.push(p);
    return p;
  };

  const originalMeta = await readText(metaAbs);
  const guidBefore = readGuid(originalMeta);
  const sizeBefore = (await fs.stat(abs)).size;

  let outExt = ext;
  let sourceTmp: string | null = null;
  let newMeta: string | null = null;
  let converted = false; // importer type changes (fbx→glb) → do not carry the .meta over
  let scaleFactor: number | undefined;

  try {
    // ---------------- 1. source step ----------------
    if (asset.kind === 'texture') {
      const s = req.settings.texture.source;
      const wanted = s.outputFormat === 'keep' ? ext : s.outputFormat;
      if (req.mode === 'overwrite' && wanted !== ext && !(wanted === 'jpg' && ext === 'jpeg')) {
        notes.push(`format change ignored in Overwrite mode (would break the ${ext}.meta binding) – use Save as New`);
      } else if (wanted !== ext && !(wanted === 'jpg' && ext === 'jpeg')) outExt = wanted;
      if (s.enabled) {
        const spriteSheet = /^\s*spriteMode:\s*2\s*$/m.test(originalMeta ?? '');
        const out = tmp(outExt);
        const r = await processTexture(abs, ext, out, outExt === 'jpeg' ? 'jpg' : outExt, s, { allowResize: !spriteSheet });
        const outSize = (await fs.stat(out)).size;
        const worthIt = r.changed || (ext === 'png' && outSize < sizeBefore * 0.98);
        if (worthIt) {
          sourceTmp = out;
          notes.push(...r.notes);
          if (!r.changed) notes.push('PNG recompressed');
          if (r.width !== r.srcWidth) scaleFactor = r.width / r.srcWidth;
        } else notes.push(r.notes.find((n) => n.startsWith('resize skipped')) ?? 'source already within limits');
      }
    } else if (asset.kind === 'audio') {
      const s = req.settings.audio.source;
      const info = (await ctx.ensureInfo(asset)) as AudioInfo | null;
      const wanted = s.outputFormat === 'keep' ? ext : s.outputFormat;
      if (req.mode === 'overwrite' && wanted !== ext) notes.push('format change ignored in Overwrite mode – use Save as New');
      else outExt = wanted;
      const effective = { ...s, outputFormat: outExt as typeof s.outputFormat };
      if (s.enabled && !audioSourceIsNoop(effective, ext, info)) {
        const out = tmp(outExt);
        const r = await processAudio(abs, out, outExt, effective, info);
        sourceTmp = out;
        notes.push(...r.notes);
        if (outExt !== ext) notes.push(`format ${ext} → ${outExt}`);
      } else if (s.enabled) notes.push('audio source unchanged (nothing to do)');
    } else if (asset.kind === 'model') {
      const s = req.settings.model.source;
      if (s.enabled) {
        if (ext === 'glb' || (ext === 'gltf' && req.mode === 'saveAsNew')) {
          const out = tmp('glb');
          const r = await processGltf(abs, out, s);
          sourceTmp = out;
          outExt = 'glb';
          notes.push(...r.notes);
          if (ext === 'gltf') notes.push('packed .gltf + resources → single .glb');
        } else if (ext === 'gltf') {
          notes.push('.gltf overwrite skipped (multi-file asset) – use Save as New to get an optimized .glb');
        } else if (ext === 'fbx' && s.convertFbxToGlb) {
          if (req.mode !== 'saveAsNew') notes.push('FBX→GLB conversion only runs in Save as New mode');
          else {
            const glb1 = tmp('glb');
            await fbxToGlb(abs, glb1);
            const out = tmp('glb');
            const r = await processGltf(glb1, out, s);
            sourceTmp = out;
            outExt = 'glb';
            converted = true;
            notes.push('converted FBX → GLB (FBX2glTF)', ...r.notes);
          }
        }
      }
    }

    // ---------------- target path ----------------
    const suffix = sanitizeSuffix(req.suffix || '_optimized');
    const targetRel = req.mode === 'overwrite' ? rel : `${folder ? folder + '/' : ''}${name}${suffix}.${outExt}`;
    if (req.mode === 'saveAsNew' && targetRel === rel) throw new Error('Save as New needs a suffix or a different format');
    const targetAbs = safeResolve(ctx.root, targetRel);
    const targetMetaAbs = targetAbs + '.meta';
    const targetExisted = req.mode === 'overwrite' || (await exists(targetAbs));
    const targetMetaText = req.mode === 'overwrite' ? originalMeta : await readText(targetMetaAbs);

    // ---------------- 2. importer step ----------------
    const origImporter = readImporterType(originalMeta);
    const targetIsGlb = outExt === 'glb' || outExt === 'gltf';
    let metaBase: string | null = null;
    let expectedGuid: string | null = null;
    if (targetMetaText) {
      metaBase = targetMetaText; // overwrite, or re-running Save as New → keep that file's identity
      expectedGuid = readGuid(targetMetaText);
    } else if (req.mode === 'saveAsNew' && originalMeta && !converted && !(targetIsGlb && ext !== outExt)) {
      expectedGuid = newGuid();
      metaBase = replaceGuid(originalMeta, expectedGuid); // copy importer settings, new identity
      notes.push('new .meta cloned from source with a fresh GUID');
    }

    if (metaBase) {
      const ed = new MetaEditor(metaBase);
      const type = ed.importerType;
      if (asset.kind === 'texture' && req.settings.texture.importer.enabled && type === 'TextureImporter') {
        notes.push(...patchTextureMeta(ed, req.settings.texture.importer, { relPath: rel, scaleFactor }));
      } else if (asset.kind === 'texture' && scaleFactor && type === 'TextureImporter') {
        // importer layer disabled, but sprite PPU must still follow the resize
        notes.push(...patchTextureMeta(ed, { enabled: true, textureType: 'keep', maxTextureSize: 0, mipmaps: 'keep', sRGB: 'keep', readWrite: 'keep', mobileFormat: 'keep', pcFormat: 'keep' }, { relPath: rel, scaleFactor }));
      } else if (asset.kind === 'audio' && req.settings.audio.importer.enabled && type === 'AudioImporter') {
        const info = (await ctx.ensureInfo(asset)) as AudioInfo | null;
        notes.push(...patchAudioMeta(ed, req.settings.audio.importer, { relPath: rel, durationSec: info?.durationSec, sampleRate: info?.sampleRate }));
      } else if (asset.kind === 'model' && req.settings.model.importer.enabled) {
        if (type === 'ModelImporter') notes.push(...patchModelMeta(ed, req.settings.model.importer));
        else if (type) notes.push(`${type} (.${outExt}) – ModelImporter settings not applicable`);
      }
      if (ed.changes.length) notes.push(`.meta: ${ed.changes.length} importer field(s) updated`);
      const out = ed.toString();
      if (readGuid(out) !== expectedGuid) throw new Error('internal: GUID changed during patch – aborted');
      if (out !== targetMetaText) newMeta = out;
    } else if (!originalMeta) {
      notes.push('no .meta yet (open the project in Unity once) – importer step skipped');
    } else if (origImporter && req.mode === 'saveAsNew') {
      notes.push('importer differs for the new format – Unity will create a fresh .meta');
    }

    // ---------------- nothing to do? ----------------
    if (req.mode === 'overwrite' && !sourceTmp && !newMeta) {
      return {
        result: { assetId: asset.id, relPath: rel, ok: true, skipped: true, message: notes.join(' · ') || 'nothing to change', bytesBefore: sizeBefore, bytesAfter: sizeBefore, guidBefore, guidAfter: guidBefore },
        backedUp: [],
        created: [],
        touched: [],
      };
    }

    // ---------------- 3. commit ----------------
    const backedUp: string[] = [];
    const created: string[] = [];
    const backup = async (fileAbs: string, fileRel: string) => {
      if (!(await exists(fileAbs))) return false;
      const dst = path.join(ctx.backupDir, ...fileRel.split('/'));
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(fileAbs, dst);
      backedUp.push(fileRel);
      return true;
    };
    ctx.suppress(targetAbs);
    const willWriteAsset = !!sourceTmp || req.mode === 'saveAsNew';
    if (willWriteAsset && !(await backup(targetAbs, targetRel))) created.push(targetRel);
    if (newMeta && !(await backup(targetMetaAbs, targetRel + '.meta'))) created.push(targetRel + '.meta');

    try {
      if (sourceTmp) await moveInto(sourceTmp, targetAbs);
      else if (req.mode === 'saveAsNew') await fs.copyFile(abs, targetAbs);
      if (newMeta) {
        const mt = tmp('meta');
        await fs.writeFile(mt, newMeta, 'utf8');
        await moveInto(mt, targetMetaAbs);
      }
      // verify identity on disk
      const onDisk = await readText(targetMetaAbs);
      if (expectedGuid && readGuid(onDisk) !== expectedGuid) throw new Error(`GUID verification failed (${expectedGuid} → ${readGuid(onDisk)})`);
      if (req.mode === 'overwrite' && guidBefore && readGuid(onDisk) !== guidBefore) throw new Error('GUID verification failed after overwrite');
    } catch (e) {
      // roll back this item
      for (const r of backedUp) await fs.copyFile(path.join(ctx.backupDir, ...r.split('/')), safeResolve(ctx.root, r)).catch(() => undefined);
      for (const r of created) await fs.unlink(safeResolve(ctx.root, r)).catch(() => undefined);
      throw new Error(`${(e as Error).message} – rolled back`);
    }

    const sizeAfter = (await fs.stat(targetAbs)).size;
    const guidAfter = readGuid(await readText(targetMetaAbs));
    if (targetExisted && req.mode === 'saveAsNew') notes.push('existing output refreshed (its GUID kept)');
    return {
      result: { assetId: asset.id, relPath: rel, outputRelPath: targetRel, ok: true, message: notes.join(' · '), bytesBefore: sizeBefore, bytesAfter: sizeAfter, guidBefore, guidAfter },
      backedUp,
      created,
      touched: [rel, targetRel],
    };
  } finally {
    for (const t of temps) await fs.unlink(t).catch(() => undefined);
  }
}

/** Undo = restore every backed-up file and delete every file the operation created. */
export async function undoItems(root: string, backupDir: string, items: { backedUp: string[]; created: string[] }[], suppress: (abs: string) => void) {
  let restored = 0;
  let removed = 0;
  const missing: string[] = [];
  for (const it of [...items].reverse()) {
    for (const r of it.created) {
      const p = safeResolve(root, r);
      suppress(p.replace(/\.meta$/, ''));
      try {
        await fs.unlink(p);
        removed++;
      } catch { /* already gone */ }
    }
    for (const r of it.backedUp) {
      const src = path.join(backupDir, ...r.split('/'));
      const dst = safeResolve(root, r);
      suppress(dst.replace(/\.meta$/, ''));
      try {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(src, dst);
        restored++;
      } catch {
        missing.push(r);
      }
    }
  }
  return { restored, removed, missing };
}
