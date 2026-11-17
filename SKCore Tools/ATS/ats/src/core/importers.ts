/**
 * Maps ATS settings → Unity importer YAML values.
 * Enum values follow Unity's serialized representation (TextureImporterFormat, AudioClipLoadType, …).
 */
import type { AudioSettings, ModelSettings, TextureSettings } from '../shared/types';
import { MetaEditor } from './meta';

// UnityEditor.TextureImporterFormat
export const TEXTURE_FORMAT_CODES: Record<string, number> = {
  DXT1: 10,
  DXT5: 12,
  BC7: 25,
  ETC2_RGBA8: 47,
  ASTC_4x4: 48,
  ASTC_6x6: 50,
  ASTC_8x8: 51,
};
// UnityEditor.TextureImporterType
const TEXTURE_TYPE = { default: 0, normal: 1, sprite: 8 } as const;

const onOff = (v: 'on' | 'off') => (v === 'on' ? 1 : 0);

export function isUiPath(relPath: string) {
  return /(^|\/)(ui|gui|hud|icons?|sprites?)(\/|$)/i.test(relPath);
}

export interface TexturePatchCtx {
  relPath: string;
  /** new/old pixel ratio when the source was resized (e.g. 0.5) – used to keep sprite world size */
  scaleFactor?: number;
}

export function patchTextureMeta(ed: MetaEditor, s: TextureSettings['importer'], ctx: TexturePatchCtx): string[] {
  const R = 'TextureImporter';
  const notes: string[] = [];

  if (s.textureType !== 'keep') {
    ed.set([R, 'textureType'], TEXTURE_TYPE[s.textureType]);
    if (s.textureType === 'sprite' && ed.get([R, 'spriteMode'])?.trim() === '0') ed.set([R, 'spriteMode'], 1);
  }
  const type = Number(ed.get([R, 'textureType']) ?? 0);
  const isSprite = type === 8 || type === 2; // Sprite or legacy GUI
  const isNormal = type === 1;

  if (s.maxTextureSize > 0) {
    ed.set([R, 'maxTextureSize'], s.maxTextureSize);
    ed.setAllPlatforms('maxTextureSize', s.maxTextureSize);
  }

  if (s.mipmaps !== 'keep') {
    const on = s.mipmaps === 'auto' ? !(isSprite || isUiPath(ctx.relPath)) : s.mipmaps === 'on';
    ed.set([R, 'mipmaps', 'enableMipMap'], on ? 1 : 0);
    if (s.mipmaps === 'auto') notes.push(`mipmaps auto → ${on ? 'on (3D texture)' : 'off (Sprite/UI)'}`);
  }

  if (s.sRGB !== 'keep') {
    if (isNormal) notes.push('sRGB ignored for Normal maps (always linear)');
    else ed.set([R, 'mipmaps', 'sRGBTexture'], onOff(s.sRGB));
  }

  if (s.readWrite !== 'keep') ed.set([R, 'isReadable'], onOff(s.readWrite));

  const size = s.maxTextureSize > 0 ? s.maxTextureSize : Number(ed.get([R, 'maxTextureSize']) ?? 2048);
  if (s.mobileFormat !== 'keep') {
    for (const target of ['Android', 'iPhone']) {
      const r = ed.setPlatformOverride(target, { textureFormat: TEXTURE_FORMAT_CODES[s.mobileFormat], overridden: 1, maxTextureSize: size });
      if (r === 'missing') notes.push(`no platformSettings block – ${target} override skipped (open in Unity once)`);
    }
  }
  if (s.pcFormat !== 'keep') {
    const r = ed.setPlatformOverride('Standalone', { textureFormat: TEXTURE_FORMAT_CODES[s.pcFormat], overridden: 1, maxTextureSize: size });
    if (r === 'missing') notes.push('no platformSettings block – Standalone override skipped');
  }

  // Keep sprite world-size and 9-slice borders stable after a source downscale.
  if (ctx.scaleFactor && ctx.scaleFactor !== 1 && isSprite) {
    const ppu = Number(ed.get([R, 'spritePixelsToUnits']) ?? 100);
    const newPpu = +(ppu * ctx.scaleFactor).toFixed(4);
    ed.set([R, 'spritePixelsToUnits'], newPpu);
    const border = ed.get([R, 'spriteBorder']);
    if (border) {
      const scaled = border.replace(/([xyzw]):\s*(-?[\d.]+)/g, (_m, k, v) => `${k}: ${Math.round(Number(v) * ctx.scaleFactor!)}`);
      ed.set([R, 'spriteBorder'], scaled);
    }
    notes.push(`Sprite PPU ${ppu} → ${newPpu} so on-screen size stays the same`);
  }
  return notes;
}

// ---------------------------------------------------------------------------

export function classifyAudio(relPath: string, durationSec: number | null | undefined): 'music' | 'sfx' {
  if (/(^|\/)(music|bgm|soundtracks?|ambien(ce|t)|loops?)(\/|$)/i.test(relPath)) return 'music';
  if (/(^|\/)(sfx|fx|ui|sounds?|effects?|foley|voice|vo)(\/|$)/i.test(relPath)) return 'sfx';
  if (durationSec != null) return durationSec >= 10 ? 'music' : 'sfx';
  return 'sfx';
}

export interface AudioPatchCtx {
  relPath: string;
  durationSec?: number | null;
  sampleRate?: number | null;
}

// AudioClipLoadType: 0 DecompressOnLoad, 1 CompressedInMemory, 2 Streaming
const LOAD_TYPE = { decompressOnLoad: 0, compressedInMemory: 1, streaming: 2 } as const;
// AudioCompressionFormat: 0 PCM, 1 Vorbis, 2 ADPCM
const COMPRESSION = { pcm: 0, vorbis: 1, adpcm: 2 } as const;

export function patchAudioMeta(ed: MetaEditor, s: AudioSettings['importer'], ctx: AudioPatchCtx): string[] {
  const R = 'AudioImporter';
  const D = [R, 'defaultSettings'];
  const notes: string[] = [];
  const cls = classifyAudio(ctx.relPath, ctx.durationSec);
  const dur = ctx.durationSec ?? null;

  if (s.forceToMono !== 'keep') {
    const on = s.forceToMono === 'auto' ? cls === 'sfx' : s.forceToMono === 'on';
    ed.set([R, 'forceToMono'], on ? 1 : 0);
    if (s.forceToMono === 'auto') notes.push(`classified as ${cls.toUpperCase()} → Force To Mono ${on ? 'on' : 'off'}`);
  }

  if (s.loadType !== 'keep') {
    let lt: keyof typeof LOAD_TYPE;
    if (s.loadType === 'auto') {
      if (dur == null) lt = cls === 'music' ? 'streaming' : 'decompressOnLoad';
      else lt = dur < 10 ? 'decompressOnLoad' : dur < 60 ? 'compressedInMemory' : 'streaming';
      notes.push(`load type auto → ${lt}${dur != null ? ` (${dur.toFixed(1)}s)` : ''}`);
    } else lt = s.loadType;
    ed.set([...D, 'loadType'], LOAD_TYPE[lt]);
  }

  if (s.compressionFormat !== 'keep') ed.set([...D, 'compressionFormat'], COMPRESSION[s.compressionFormat]);
  if (s.compressionFormat === 'vorbis' || (s.compressionFormat === 'keep' && ed.get([...D, 'compressionFormat'])?.trim() === '1')) {
    ed.set([...D, 'quality'], +(Math.min(100, Math.max(1, s.quality)) / 100).toFixed(2));
  }

  if (s.sampleRate !== 'keep') {
    const src = ctx.sampleRate ?? null;
    let setting = 0;
    let override: number | null = null;
    if (s.sampleRate === 'preserve') setting = 0;
    else if (s.sampleRate === 'optimize') setting = 1;
    else if (s.sampleRate === 'auto') {
      const target = cls === 'sfx' ? 22050 : 44100;
      if (src == null || src > target) {
        setting = 2;
        override = target;
      }
      notes.push(`sample rate auto → ${override ? `${override} Hz` : 'preserve'}`);
    } else {
      if (src != null && src <= s.sampleRate) notes.push(`source is ${src} Hz – no upsampling, preserving`);
      else {
        setting = 2;
        override = s.sampleRate;
      }
    }
    ed.set([...D, 'sampleRateSetting'], setting);
    if (override) ed.set([...D, 'sampleRateOverride'], override);
  }
  return notes;
}

// ---------------------------------------------------------------------------

const MESH_COMPRESSION = { off: 0, low: 1, medium: 2, high: 3 } as const;
const NORMALS = { import: 0, calculate: 1, none: 2 } as const;

export function patchModelMeta(ed: MetaEditor, s: ModelSettings['importer']): string[] {
  const R = 'ModelImporter';
  const notes: string[] = [];
  if (s.meshCompression !== 'keep') ed.setFirst(R, 'meshCompression', MESH_COMPRESSION[s.meshCompression], [[R, 'meshes', 'meshCompression']]);
  if (s.optimizeGameObjects !== 'keep') {
    ed.setFirst(R, 'optimizeGameObjects', onOff(s.optimizeGameObjects), [[R, 'animations', 'optimizeGameObjects']]);
    const animType = Number(ed.get([R, 'animationType']) ?? -1);
    if (s.optimizeGameObjects === 'on' && animType !== 2 && animType !== 3) notes.push('Optimize Game Objects only takes effect with a Generic/Humanoid rig');
  }
  if (s.importAnimation !== 'keep') ed.set([R, 'importAnimation'], onOff(s.importAnimation));
  if (s.normals !== 'keep') ed.setFirst(R, 'normalImportMode', NORMALS[s.normals], [[R, 'tangentSpace', 'normalImportMode']]);
  if (s.readWrite !== 'keep') ed.setFirst(R, 'isReadable', onOff(s.readWrite), [[R, 'meshes', 'isReadable'], [R, 'animations', 'isReadable']]);
  return notes;
}
