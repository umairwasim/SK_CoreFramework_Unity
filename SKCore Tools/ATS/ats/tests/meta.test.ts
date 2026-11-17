import { describe, expect, it } from 'vitest';
import { patchAudioMeta, patchModelMeta, patchTextureMeta } from '../src/core/importers';
import { MetaEditor, readGuid, readImporterType, readLabels, replaceGuid } from '../src/core/meta';
import { UNITY6_DEFAULTS } from '../src/shared/defaults';
import { audioMeta, modelMeta, textureMeta } from './fixtures/metaTemplates';

const G = '0123456789abcdef0123456789abcdef';

describe('meta basics', () => {
  it('reads guid, labels and importer type', () => {
    const t = textureMeta({ guid: G, labels: ['UI', 'Hero'] });
    expect(readGuid(t)).toBe(G);
    expect(readLabels(t)).toEqual(['UI', 'Hero']);
    expect(readImporterType(t)).toBe('TextureImporter');
  });
  it('refuses to touch guid', () => {
    const ed = new MetaEditor(textureMeta({ guid: G }));
    expect(() => ed.set(['guid'], 'x')).toThrow();
  });
  it('replaceGuid only changes the guid line', () => {
    const t = textureMeta({ guid: G });
    const n = replaceGuid(t, 'f'.repeat(32));
    expect(readGuid(n)).toBe('f'.repeat(32));
    expect(n.replace('f'.repeat(32), G)).toBe(t);
  });
  it('a no-op edit is byte-identical, CRLF preserved', () => {
    const t = textureMeta({ guid: G, crlf: true });
    const ed = new MetaEditor(t);
    ed.set(['TextureImporter', 'isReadable'], 0); // already 0
    expect(ed.toString()).toBe(t);
    ed.set(['TextureImporter', 'isReadable'], 1);
    expect(ed.toString().split('\r\n').length).toBe(t.split('\r\n').length);
    expect(ed.toString()).toContain('  isReadable: 1\r\n');
  });
  it('never invents keys', () => {
    const ed = new MetaEditor(textureMeta({ guid: G }));
    expect(ed.set(['TextureImporter', 'doesNotExist'], 1)).toBe(false);
    expect(ed.changed).toBe(false);
  });
});

describe('texture importer patch', () => {
  it('applies Unity 6 defaults and adds platform overrides', () => {
    const t = textureMeta({ guid: G, maxTextureSize: 8192, isReadable: 1, platforms: ['Standalone'] });
    const ed = new MetaEditor(t);
    patchTextureMeta(ed, UNITY6_DEFAULTS.texture.importer, { relPath: 'Assets/Art/a.png' });
    const out = ed.toString();
    expect(readGuid(out)).toBe(G);
    expect(ed.get(['TextureImporter', 'maxTextureSize'])).toBe('2048');
    expect(ed.get(['TextureImporter', 'isReadable'])).toBe('0');
    expect(ed.get(['TextureImporter', 'mipmaps', 'enableMipMap'])).toBe('1'); // 3D texture
    expect(ed.listPlatforms()).toEqual(['DefaultTexturePlatform', 'Standalone', 'Android', 'iPhone']);
    // Standalone patched in place → BC7 (25), Android/iPhone cloned → ASTC 6x6 (50)
    expect(out).toMatch(/buildTarget: Standalone\n    maxTextureSize: 2048\n    resizeAlgorithm: 0\n    textureFormat: 25/);
    expect(out).toMatch(/buildTarget: Android\n    maxTextureSize: 2048\n    resizeAlgorithm: 0\n    textureFormat: 50/);
    expect((out.match(/overridden: 1/g) ?? []).length).toBe(3);
    // everything after platformSettings is intact
    expect(out).toContain('  spriteSheet:\n    serializedVersion: 2');
    expect(out.endsWith('assetBundleVariant: \n')).toBe(true);
  });
  it('auto mipmaps: off for sprites / UI', () => {
    const ed = new MetaEditor(textureMeta({ guid: G, textureType: 8, spriteMode: 1 }));
    patchTextureMeta(ed, UNITY6_DEFAULTS.texture.importer, { relPath: 'Assets/Game/coin.png' });
    expect(ed.get(['TextureImporter', 'mipmaps', 'enableMipMap'])).toBe('0');
    const ed2 = new MetaEditor(textureMeta({ guid: G }));
    patchTextureMeta(ed2, UNITY6_DEFAULTS.texture.importer, { relPath: 'Assets/UI/bg.png' });
    expect(ed2.get(['TextureImporter', 'mipmaps', 'enableMipMap'])).toBe('0');
  });
  it('keeps sprite world size after downscale (PPU + 9-slice border)', () => {
    const ed = new MetaEditor(textureMeta({ guid: G, textureType: 8, spriteMode: 1, ppu: 100, border: [128, 96, 128, 96] }));
    patchTextureMeta(ed, { ...UNITY6_DEFAULTS.texture.importer }, { relPath: 'Assets/UI/p.png', scaleFactor: 0.5 });
    expect(ed.get(['TextureImporter', 'spritePixelsToUnits'])).toBe('50');
    expect(ed.get(['TextureImporter', 'spriteBorder'])).toBe('{x: 64, y: 48, z: 64, w: 48}');
  });
});

describe('audio + model importer patch', () => {
  it('SFX → mono, decompress on load, 22050', () => {
    const ed = new MetaEditor(audioMeta({ guid: G }));
    patchAudioMeta(ed, UNITY6_DEFAULTS.audio.importer, { relPath: 'Assets/Audio/SFX/hit.wav', durationSec: 0.8, sampleRate: 48000 });
    expect(ed.get(['AudioImporter', 'forceToMono'])).toBe('1');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'loadType'])).toBe('0');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'sampleRateSetting'])).toBe('2');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'sampleRateOverride'])).toBe('22050');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'quality'])).toBe('0.7');
    expect(readGuid(ed.toString())).toBe(G);
  });
  it('Music → stereo, streaming, preserve 44.1k', () => {
    const ed = new MetaEditor(audioMeta({ guid: G }));
    patchAudioMeta(ed, UNITY6_DEFAULTS.audio.importer, { relPath: 'Assets/Audio/Music/theme.ogg', durationSec: 180, sampleRate: 44100 });
    expect(ed.get(['AudioImporter', 'forceToMono'])).toBe('0');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'loadType'])).toBe('2');
    expect(ed.get(['AudioImporter', 'defaultSettings', 'sampleRateSetting'])).toBe('0');
  });
  it('model: mesh compression, optimize GOs, read/write', () => {
    const ed = new MetaEditor(modelMeta({ guid: G }));
    patchModelMeta(ed, UNITY6_DEFAULTS.model.importer);
    expect(ed.get(['ModelImporter', 'meshes', 'meshCompression'])).toBe('2');
    expect(ed.get(['ModelImporter', 'animations', 'optimizeGameObjects'])).toBe('1');
    expect(ed.get(['ModelImporter', 'animations', 'isReadable'])).toBe('0');
    expect(ed.get(['ModelImporter', 'importAnimation'])).toBe('1'); // 'keep'
    expect(readGuid(ed.toString())).toBe(G);
  });
});
