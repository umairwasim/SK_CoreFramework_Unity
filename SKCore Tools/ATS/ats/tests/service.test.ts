import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readGuid } from '../src/core/meta';
import { AtsService } from '../src/core/service';
import { cloneSettings, UNITY6_DEFAULTS } from '../src/shared/defaults';
import type { AtsEvent, JobStatus } from '../src/shared/types';

let dir: string;
let proj: string;
let svc: AtsService;
let guids: Record<string, string>;
const sha = (p: string) => createHash('sha1').update(readFileSync(p)).digest('hex');
const A = (rel: string) => path.join(proj, 'Assets', ...rel.split('/'));

function waitJob(job: JobStatus): Promise<JobStatus> {
  return new Promise((resolve) => {
    const off = svc.on((e: AtsEvent) => {
      if (e.type === 'job' && e.job.id === job.id && ['done', 'failed', 'cancelled'].includes(e.job.state)) {
        off();
        resolve(e.job);
      }
    });
  });
}
async function idOf(kind: 'texture' | 'model' | 'audio', rel: string) {
  const list = await svc.listAssets({ kind });
  const a = list.find((x) => x.relPath === `Assets/${rel}`);
  if (!a) throw new Error(`not indexed: ${rel}`);
  return a.id;
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ats-test-'));
  proj = path.join(dir, 'Proj');
  execFileSync('npx', ['tsx', 'scripts/make-sample-project.ts', proj], { stdio: 'ignore' });
  guids = JSON.parse(readFileSync(path.join(proj, 'guids.json'), 'utf8'));
  svc = new AtsService({ appDataDir: path.join(dir, 'appdata') });
  await svc.openWorkspace(proj);
});
afterAll(async () => {
  await svc.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('workspace', () => {
  it('indexes Assets by kind with GUIDs and labels', async () => {
    const ws = await svc.getWorkspace();
    expect(ws?.unityVersion).toBe('6000.2.6f1');
    expect(ws?.counts).toEqual({ texture: 7, model: 3, audio: 5 });
    const tex = await svc.listAssets({ kind: 'texture', tags: ['UI'] });
    expect(tex.map((t) => t.name).sort()).toEqual(['buttons_atlas', 'icon_coin', 'panel_9slice']);
    expect(tex.every((t) => t.guid && t.guid.length === 32)).toBe(true);
    const tree = await svc.getFolderTree('texture');
    expect(tree.children.map((c) => c.name)).toEqual(['Art', 'UI']);
  });
  it('extracts info incl. TGA', async () => {
    const info = await svc.getAssetInfo(await idOf('texture', 'Art/Textures/metal_mask.tga'));
    expect(info).toMatchObject({ width: 1024, height: 1024, hasAlpha: true });
    const a = await svc.getAssetInfo(await idOf('audio', 'Audio/SFX/coin_pickup.wav'));
    expect(a).toMatchObject({ channels: 2, sampleRate: 48000 });
  });
});

describe('overwrite keeps GUIDs', () => {
  let opId = 0;
  const before: Record<string, string> = {};
  it('applies Unity 6 Default to all textures', async () => {
    const texRels = ['Art/Textures/hero_albedo_4k.png', 'Art/Textures/metal_mask.tga', 'UI/Panels/panel_9slice.png', 'UI/Atlases/buttons_atlas.png', 'Art/Textures/wood_diffuse.jpg'];
    for (const r of texRels) before[r] = sha(A(r));
    const atlasPixels = await sharp(A('UI/Atlases/buttons_atlas.png')).raw().toBuffer();
    const matBefore = sha(A('Materials/Hero.mat'));
    const ids = await Promise.all(texRels.map((r) => idOf('texture', r)));
    const job = await waitJob(await svc.apply({ assetIds: ids, mode: 'overwrite', suffix: '', settings: cloneSettings(UNITY6_DEFAULTS), presetName: 'Unity 6 Default' }));
    expect(job.state).toBe('done');
    expect(job.results.every((r) => r.ok)).toBe(true);
    opId = job.operationId!;

    for (const r of texRels) expect(readGuid(readFileSync(A(r) + '.meta', 'utf8'))).toBe(guids[r]);
    expect(sha(A('Materials/Hero.mat'))).toBe(matBefore);

    const hero = await sharp(A('Art/Textures/hero_albedo_4k.png')).metadata();
    expect([hero.width, hero.height]).toEqual([2048, 2048]);
    const heroMeta = readFileSync(A('Art/Textures/hero_albedo_4k.png') + '.meta', 'utf8');
    expect(heroMeta).toMatch(/^  maxTextureSize: 2048$/m);
    expect(heroMeta).toMatch(/buildTarget: Android\n    maxTextureSize: 2048\n    resizeAlgorithm: 0\n    textureFormat: 50/);
    expect(heroMeta).toMatch(/^labels:\n- Character\n- HighRes$/m);

    // 9-slice panel: resized 2560→2048 (0.8) → PPU 80, borders scaled
    const panelMeta = readFileSync(A('UI/Panels/panel_9slice.png') + '.meta', 'utf8');
    expect(panelMeta).toMatch(/spritePixelsToUnits: 80$/m);
    expect(panelMeta).toMatch(/spriteBorder: \{x: 102, y: 77, z: 102, w: 77\}/);
    expect(panelMeta).toMatch(/enableMipMap: 0/);

    // Multiple-mode atlas: pixels untouched (rects!), only importer changed
    const atlasMeta = await sharp(A('UI/Atlases/buttons_atlas.png')).metadata();
    expect([atlasMeta.width, atlasMeta.height]).toEqual([2560, 2560]);
    const atlas = job.results.find((r) => r.relPath.endsWith('buttons_atlas.png'))!;
    expect(atlas.message).toMatch(/resize skipped/);
    expect(Buffer.compare(await sharp(A('UI/Atlases/buttons_atlas.png')).raw().toBuffer(), atlasPixels)).toBe(0); // lossless only

    // TGA stays TGA (CRLF meta preserved)
    const tgaMeta = readFileSync(A('Art/Textures/metal_mask.tga') + '.meta', 'utf8');
    expect(tgaMeta.includes('\r\n')).toBe(true);
    expect(tgaMeta.replace(/\r\n/g, '').includes('\n')).toBe(false);

    // jpg: within limits, lossy → source untouched, importer changed (Read/Write off)
    const wood = readFileSync(A('Art/Textures/wood_diffuse.jpg') + '.meta', 'utf8');
    expect(wood).toMatch(/^  isReadable: 0$/m);

    const backups = await fs.readdir(path.join(proj, 'ATS_Backup'));
    expect(backups.length).toBe(1);
    expect(existsSync(path.join(proj, 'Assets', 'ATS_Backup'))).toBe(false); // never inside Assets
  });

  it('history lists every item', async () => {
    const h = await svc.listHistory(opId);
    expect(h.length).toBe(5);
    const ops = await svc.listOperations();
    expect(ops[0]).toMatchObject({ id: opId, itemCount: 5, okCount: 5, undone: false });
  });

  it('undo restores byte-identical files', async () => {
    const r = await svc.undoOperation(opId);
    expect(r.restored).toBeGreaterThan(0);
    for (const rel of Object.keys(before)) expect(sha(A(rel))).toBe(before[rel]);
    const hero = await sharp(A('Art/Textures/hero_albedo_4k.png')).metadata();
    expect(hero.width).toBe(4096);
    await expect(svc.undoOperation(opId)).rejects.toThrow(/already undone/);
  });
});

describe('save as new', () => {
  it('creates a sibling with a fresh GUID and re-runs keep that GUID', async () => {
    const id = await idOf('texture', 'Art/Textures/hero_albedo_4k.png');
    const s = cloneSettings(UNITY6_DEFAULTS);
    s.texture.source.maxSize = 512;
    s.texture.source.outputFormat = 'jpg';
    const j1 = await waitJob(await svc.apply({ assetIds: [id], mode: 'saveAsNew', suffix: '_mobile', settings: s }));
    expect(j1.results[0].ok).toBe(true);
    const out = A('Art/Textures/hero_albedo_4k_mobile.jpg');
    const g1 = readGuid(readFileSync(out + '.meta', 'utf8'));
    expect(g1).toBeTruthy();
    expect(g1).not.toBe(guids['Art/Textures/hero_albedo_4k.png']);
    expect(readGuid(readFileSync(A('Art/Textures/hero_albedo_4k.png') + '.meta', 'utf8'))).toBe(guids['Art/Textures/hero_albedo_4k.png']);
    expect((await sharp(out).metadata()).width).toBe(512);
    const j2 = await waitJob(await svc.apply({ assetIds: [id], mode: 'saveAsNew', suffix: '_mobile', settings: s }));
    expect(j2.results[0].ok).toBe(true);
    expect(readGuid(readFileSync(out + '.meta', 'utf8'))).toBe(g1);
    // undo of the first save-as-new removes the created pair
    await svc.undoOperation(j2.operationId);
    await svc.undoOperation(j1.operationId);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(out + '.meta')).toBe(false);
  });
});

describe('audio + models', () => {
  it('audio: importer auto rules + source downmix', async () => {
    const coin = await idOf('audio', 'Audio/SFX/coin_pickup.wav');
    const theme = await idOf('audio', 'Audio/Music/theme_loop.ogg');
    const s = cloneSettings(UNITY6_DEFAULTS);
    s.audio.source.enabled = true;
    s.audio.source.forceMono = true;
    s.audio.source.sampleRate = 44100;
    const job = await waitJob(await svc.apply({ assetIds: [coin, theme], mode: 'overwrite', suffix: '', settings: s }));
    expect(job.results.every((r) => r.ok)).toBe(true);
    const coinMeta = readFileSync(A('Audio/SFX/coin_pickup.wav') + '.meta', 'utf8');
    expect(coinMeta).toMatch(/^  forceToMono: 1$/m);
    expect(coinMeta).toMatch(/sampleRateOverride: 22050/);
    const themeMeta = readFileSync(A('Audio/Music/theme_loop.ogg') + '.meta', 'utf8');
    expect(themeMeta).toMatch(/^  forceToMono: 0$/m);
    expect(themeMeta).toMatch(/loadType: 2/);
    expect(readGuid(coinMeta)).toBe(guids['Audio/SFX/coin_pickup.wav']);
    const info = await svc.getAssetInfo(coin);
    expect(info).toMatchObject({ channels: 1, sampleRate: 44100 });
  });

  it('glb: weld + prune shrink the mesh, GUID kept; obj: ModelImporter patched', async () => {
    const knot = await idOf('model', 'Models/Props/torus_knot.glb');
    const barrel = await idOf('model', 'Models/Props/barrel.obj');
    const sizeBefore = (await fs.stat(A('Models/Props/torus_knot.glb'))).size;
    const job = await waitJob(await svc.apply({ assetIds: [knot, barrel], mode: 'overwrite', suffix: '', settings: cloneSettings(UNITY6_DEFAULTS) }));
    expect(job.results.every((r) => r.ok)).toBe(true);
    expect((await fs.stat(A('Models/Props/torus_knot.glb'))).size).toBeLessThan(sizeBefore / 2);
    expect(readGuid(readFileSync(A('Models/Props/torus_knot.glb') + '.meta', 'utf8'))).toBe(guids['Models/Props/torus_knot.glb']);
    const bm = readFileSync(A('Models/Props/barrel.obj') + '.meta', 'utf8');
    expect(bm).toMatch(/meshCompression: 2/);
    expect(bm).toMatch(/^    isReadable: 0$/m);
  });

  it('presets: built-ins are read-only, user presets persist', async () => {
    await expect(svc.savePreset({ id: 'unity6-default', name: 'x', settings: UNITY6_DEFAULTS })).rejects.toThrow();
    const list = await svc.savePreset({ id: 'my-switch', name: 'My Switch', settings: UNITY6_DEFAULTS });
    expect(list.find((p) => p.id === 'my-switch')?.builtIn).toBe(false);
    expect(list.filter((p) => p.builtIn).length).toBe(4);
  });
});
