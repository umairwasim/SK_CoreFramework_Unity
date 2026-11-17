import type { AssetKind, Preset, SettingsBundle } from './types';

export const EXTENSIONS: Record<AssetKind, string[]> = {
  texture: ['png', 'jpg', 'jpeg', 'tga'],
  model: ['fbx', 'obj', 'gltf', 'glb'],
  audio: ['wav', 'mp3', 'ogg'],
};

export function kindForExt(ext: string): AssetKind | null {
  const e = ext.toLowerCase().replace(/^\./, '');
  for (const k of Object.keys(EXTENSIONS) as AssetKind[]) if (EXTENSIONS[k].includes(e)) return k;
  return null;
}

/**
 * "Unity 6 Default" – the values from the spec, section 3.
 * Source edits are conservative (only downscale oversized textures and clean up glTF);
 * most of the Unity 6 recommendations live in the importer (.meta) layer.
 */
export const UNITY6_DEFAULTS: SettingsBundle = {
  texture: {
    source: {
      enabled: true,
      maxSize: 2048,
      powerOfTwo: 'keep',
      outputFormat: 'keep',
      quality: 90,
      pngCompressionLevel: 9,
      stripAlphaIfOpaque: false,
    },
    importer: {
      enabled: true,
      textureType: 'keep',
      maxTextureSize: 2048,
      mipmaps: 'auto', // off for Sprite/UI, on for 3D textures
      sRGB: 'on',
      readWrite: 'off',
      mobileFormat: 'ASTC_6x6',
      pcFormat: 'BC7',
    },
  },
  model: {
    source: {
      enabled: true,
      dedup: true,
      prune: true,
      weld: true,
      simplifyRatio: 1,
      meshCompression: 'none',
      textureMaxSize: 2048,
      convertFbxToGlb: false,
    },
    importer: {
      enabled: true,
      meshCompression: 'medium',
      optimizeGameObjects: 'on',
      importAnimation: 'keep',
      normals: 'import',
      readWrite: 'off',
    },
  },
  audio: {
    source: {
      enabled: false,
      forceMono: false,
      sampleRate: 0,
      outputFormat: 'keep',
      quality: 6,
      normalize: false,
      trimSilence: false,
    },
    importer: {
      enabled: true,
      forceToMono: 'auto', // SFX mono, music stereo
      loadType: 'auto', // short → Decompress on Load, long → Streaming
      compressionFormat: 'vorbis',
      quality: 70,
      sampleRate: 'auto', // SFX 22050, music preserve
    },
  },
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function derive(mut: (s: SettingsBundle) => void): SettingsBundle {
  const s = clone(UNITY6_DEFAULTS);
  mut(s);
  return s;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'unity6-default',
    name: 'Unity 6 Default',
    builtIn: true,
    description: 'Balanced URP/HDRP defaults: 2048 max, ASTC 6x6 / BC7, Read/Write off, Vorbis.',
    settings: clone(UNITY6_DEFAULTS),
  },
  {
    id: 'mobile-low',
    name: 'Mobile Low',
    builtIn: true,
    description: 'Aggressive memory savings for low-end Android/iOS.',
    settings: derive((s) => {
      s.texture.source.maxSize = 1024;
      s.texture.importer.maxTextureSize = 1024;
      s.texture.importer.mobileFormat = 'ASTC_8x8';
      s.model.source.simplifyRatio = 0.6;
      s.model.source.textureMaxSize = 1024;
      s.model.importer.meshCompression = 'high';
      s.audio.source.enabled = true;
      s.audio.source.forceMono = true;
      s.audio.source.sampleRate = 22050;
      s.audio.importer.forceToMono = 'on';
      s.audio.importer.quality = 50;
      s.audio.importer.sampleRate = 22050;
    }),
  },
  {
    id: 'pc-ultra',
    name: 'PC Ultra',
    builtIn: true,
    description: 'Keeps 4K sources, BC7 everywhere, light-touch mesh compression.',
    settings: derive((s) => {
      s.texture.source.maxSize = 4096;
      s.texture.importer.maxTextureSize = 4096;
      s.texture.importer.mobileFormat = 'ASTC_4x4';
      s.model.source.textureMaxSize = 4096;
      s.model.importer.meshCompression = 'low';
      s.audio.importer.quality = 100;
      s.audio.importer.sampleRate = 'preserve';
    }),
  },
  {
    id: 'web-optimized',
    name: 'Web Optimized',
    builtIn: true,
    description: 'Small downloads for WebGL/WebGPU: 1024 textures, meshopt glTF, compact audio.',
    settings: derive((s) => {
      s.texture.source.maxSize = 1024;
      s.texture.importer.maxTextureSize = 1024;
      s.model.source.meshCompression = 'meshopt';
      s.model.source.textureMaxSize = 1024;
      s.model.importer.meshCompression = 'high';
      s.audio.source.enabled = true;
      s.audio.source.outputFormat = 'ogg';
      s.audio.source.quality = 4;
      s.audio.importer.quality = 50;
      s.audio.importer.loadType = 'compressedInMemory';
    }),
  },
];

export function cloneSettings(s: SettingsBundle): SettingsBundle {
  return clone(s);
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '–';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (Math.abs(v) >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
