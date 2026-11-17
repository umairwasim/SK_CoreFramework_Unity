import { BUILTIN_PRESETS } from '@shared/defaults';
import { encodeRelPath, RPC_METHODS } from '@shared/rpc';
import type { AtsApi, AtsEvent } from '@shared/types';
import { getAssetUrl, getThumbUrl, getMetaFile, AUDIO_WAVEFORM_SVG } from './fileRegistry';

interface Bridge {
  rpc(method: string, args: unknown[]): Promise<unknown>;
  openDialog(): Promise<unknown>;
  onEvent(cb: (e: AtsEvent) => void): () => void;
  platform: string;
}
declare global {
  interface Window {
    atsBridge?: Bridge;
  }
}

const cleanError = (e: unknown) => new Error(String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));

function electronApi(b: Bridge): AtsApi {
  const api: Record<string, unknown> = {
    mode: 'electron',
    openWorkspaceDialog: () => b.openDialog(),
    fileUrl: (a: { relPath: string; mtimeMs: number }) => `ats://file/${encodeRelPath(a.relPath)}?v=${Math.floor(a.mtimeMs)}`,
    thumbUrl: (a: { id: number; mtimeMs: number }) => `ats://thumb/${a.id}?v=${Math.floor(a.mtimeMs)}`,
    onEvent: (cb: (e: AtsEvent) => void) => b.onEvent(cb),
  };
  for (const m of RPC_METHODS) api[m] = (...args: unknown[]) => b.rpc(m, args).catch((e) => Promise.reject(cleanError(e)));
  return api as unknown as AtsApi;
}

const MOCK_WORKSPACE = {
  path: 'Assets/SampleProject',
  name: 'Unity 6 Sample Project',
  unityVersion: '6000.0.32f1 (Unity 6 LTS)',
  counts: { texture: 5, model: 3, audio: 2, total: 10 },
  lastScanMs: Date.now(),
};

const MOCK_ASSETS: any[] = [
  { id: 1, name: 'Hero_Albedo.png', relPath: 'Assets/Textures/Characters/Hero_Albedo.png', kind: 'texture', ext: 'png', size: 1048576, mtimeMs: Date.now() - 3600000, guid: 'e3b0c44298fc1c149afbf4c8996fb924', tags: ['character', 'hero', 'albedo'] },
  { id: 2, name: 'Hero_Normal.png', relPath: 'Assets/Textures/Characters/Hero_Normal.png', kind: 'texture', ext: 'png', size: 1048576, mtimeMs: Date.now() - 3600000, guid: 'f1d2d2f924e986ac86fdf7b36c94bcdf', tags: ['character', 'hero', 'normal'] },
  { id: 3, name: 'Grass_Ground_Roughness.jpg', relPath: 'Assets/Textures/Environment/Grass_Ground_Roughness.jpg', kind: 'texture', ext: 'jpg', size: 524288, mtimeMs: Date.now() - 7200000, guid: 'c3499c2729730a7f807efb8676a92dcb', tags: ['environment', 'ground'] },
  { id: 4, name: 'UI_Atlas_HUD.png', relPath: 'Assets/Textures/UI/UI_Atlas_HUD.png', kind: 'texture', ext: 'png', size: 2097152, mtimeMs: Date.now() - 14400000, guid: 'a6acaa60b949bc930773d57eb54f7690', tags: ['ui', 'hud'] },
  { id: 5, name: 'Slash_VFX_Trail.png', relPath: 'Assets/Textures/VFX/Slash_VFX_Trail.png', kind: 'texture', ext: 'png', size: 262144, mtimeMs: Date.now() - 86400000, guid: '25d80d216f4cf24d1a5862b9a7b93a8d', tags: ['vfx', 'slash'] },
  { id: 6, name: 'Knight_Character.glb', relPath: 'Assets/Models/Characters/Knight_Character.glb', kind: 'model', ext: 'glb', size: 3145728, mtimeMs: Date.now() - 5000000, guid: '9b71d224bd62f3785d96d46ad3ea3d73', tags: ['character', 'knight', 'animated'] },
  { id: 7, name: 'Broadsword.glb', relPath: 'Assets/Models/Weapons/Broadsword.glb', kind: 'model', ext: 'glb', size: 1048576, mtimeMs: Date.now() - 12000000, guid: '6a422313b40e11e0a5860800200c9a66', tags: ['weapon', 'sword'] },
  { id: 8, name: 'TreasureChest_Prop.glb', relPath: 'Assets/Models/Props/TreasureChest_Prop.glb', kind: 'model', ext: 'glb', size: 819200, mtimeMs: Date.now() - 25000000, guid: '4d13d7c0f180f1e095860800200c9a66', tags: ['prop', 'loot'] },
  { id: 9, name: 'Sword_Slash_Impact.wav', relPath: 'Assets/Audio/SFX/Sword_Slash_Impact.wav', kind: 'audio', ext: 'wav', size: 524288, mtimeMs: Date.now() - 3000000, guid: '550e8400e29b41d4a716446655440000', tags: ['sfx', 'combat'] },
  { id: 10, name: 'Ambient_Dungeon_Loop.ogg', relPath: 'Assets/Audio/Music/Ambient_Dungeon_Loop.ogg', kind: 'audio', ext: 'ogg', size: 4194304, mtimeMs: Date.now() - 60000000, guid: '6ba7b8109dad11d180b400c04fd430c8', tags: ['music', 'ambient', 'loop'] },
];

const MOCK_FOLDER_TREE = {
  name: 'Assets',
  path: 'Assets',
  count: 10,
  children: [
    {
      name: 'Textures',
      path: 'Assets/Textures',
      count: 5,
      children: [
        { name: 'Characters', path: 'Assets/Textures/Characters', count: 2, children: [] },
        { name: 'Environment', path: 'Assets/Textures/Environment', count: 1, children: [] },
        { name: 'UI', path: 'Assets/Textures/UI', count: 1, children: [] },
        { name: 'VFX', path: 'Assets/Textures/VFX', count: 1, children: [] },
      ],
    },
    {
      name: 'Models',
      path: 'Assets/Models',
      count: 3,
      children: [
        { name: 'Characters', path: 'Assets/Models/Characters', count: 1, children: [] },
        { name: 'Weapons', path: 'Assets/Models/Weapons', count: 1, children: [] },
        { name: 'Props', path: 'Assets/Models/Props', count: 1, children: [] },
      ],
    },
    {
      name: 'Audio',
      path: 'Assets/Audio',
      count: 2,
      children: [
        { name: 'SFX', path: 'Assets/Audio/SFX', count: 1, children: [] },
        { name: 'Music', path: 'Assets/Audio/Music', count: 1, children: [] },
      ],
    },
  ],
};

function webApi(): AtsApi {
  const listeners = new Set<(e: AtsEvent) => void>();
  let es: EventSource | null = null;
  const ensureEs = () => {
    if (es || (typeof window !== 'undefined' && (window.location.protocol === 'file:' || !backendAvailable))) return;
    try {
      es = new EventSource('api/events');
      es.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data) as AtsEvent;
          listeners.forEach((l) => l(ev));
        } catch {}
      };
      es.onerror = () => { try { es?.close(); } catch {} };
    } catch {}
  };

  const api: Record<string, unknown> = {
    mode: 'web',
    openWorkspaceDialog: async () => null,
    fileUrl: (a: { id?: number; relPath: string; ext?: string; mtimeMs: number }) => {
      const url = getAssetUrl(a);
      if (url && (url.startsWith('blob:') || url.startsWith('data:'))) return url;
      return `api/file/${encodeRelPath(a.relPath)}?v=${Math.floor(a.mtimeMs || Date.now())}`;
    },
    thumbUrl: (a: { id: number; relPath?: string; kind?: string; ext?: string; mtimeMs: number }) => {
      if (a.kind === 'audio') return AUDIO_WAVEFORM_SVG;
      const url = getThumbUrl(a);
      if (url && (url.startsWith('blob:') || url.startsWith('data:'))) return url;
      if (a.relPath) return `api/file/${encodeRelPath(a.relPath)}?v=${Math.floor(a.mtimeMs || Date.now())}`;
      return `api/thumb/${a.id}?v=${Math.floor(a.mtimeMs || Date.now())}`;
    },
    onEvent: (cb: (e: AtsEvent) => void) => {
      ensureEs();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  let backendChecked = false;
  let backendAvailable = false;

  for (const m of RPC_METHODS) {
    api[m] = async (...args: unknown[]) => {
      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return mockRpc(m, args);
      }

      if (m === 'openWorkspace' && args[0] && typeof args[0] === 'object' && (args[0] as any).assets) {
        return mockRpc(m, args);
      }

      if (!backendChecked) {
        backendChecked = true;
        try {
          const check = await fetch('api/rpc/toolStatus', { method: 'POST', body: JSON.stringify({ args: [] }) });
          backendAvailable = check.ok;
        } catch {
          backendAvailable = false;
        }
      }

      if (!backendAvailable) {
        return mockRpc(m, args);
      }

      try {
        const r = await fetch(`api/rpc/${m}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ args }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        return j.result;
      } catch {
        return mockRpc(m, args);
      }
    };
  }
  return api as unknown as AtsApi;
}

let activeWorkspace: any = null;
let activeAssets: any[] = [];
let activeFolderTree: any = { name: 'Assets', path: 'Assets', count: 0, children: [] };
let activeFacets: any = { formats: [], tags: [] };

function mockRpc(method: string, args: unknown[]): any {
  switch (method) {
    case 'getWorkspace':
      return activeWorkspace;
    case 'openWorkspace': {
      const arg = args[0];
      if (arg && typeof arg === 'object') {
        activeWorkspace = arg;
        activeAssets = (arg as any).assets || [];
        activeFolderTree = (arg as any).tree || { name: 'Assets', path: 'Assets', count: activeAssets.length, children: [] };
        activeFacets = (arg as any).facets || {
          formats: Array.from(new Set(activeAssets.map((a: any) => a.ext))),
          tags: Array.from(new Set(activeAssets.flatMap((a: any) => a.tags || []))),
        };
        return activeWorkspace;
      }
      const name = typeof arg === 'string' ? arg.split(/[\\/]/).filter(Boolean).pop() || arg : 'Unity Project';
      activeWorkspace = {
        root: typeof arg === 'string' ? arg : 'C:/Projects/' + name,
        name: name,
        unityVersion: 'Unity 6.0',
        assetCount: activeAssets.length,
        sizeBytes: 1024 * 1024 * 8,
        indexedAt: Date.now(),
      };
      return activeWorkspace;
    }
    case 'rescan':
      return { total: activeAssets.length, newCount: 0, updated: 0, removed: 0 };
    case 'listAssets': {
      const opts = (args[0] as any) ?? {};
      let list = [...activeAssets];
      if (opts.kind) list = list.filter((a) => a.kind === opts.kind);
      if (opts.folder) list = list.filter((a) => a.relPath.startsWith(opts.folder));
      if (opts.formats?.length) list = list.filter((a) => opts.formats.includes(a.ext));
      if (opts.tags?.length) list = list.filter((a) => opts.tags.some((t: string) => a.tags.includes(t)));
      return list;
    }
    case 'getFolderTree':
      return activeFolderTree;
    case 'getFacets':
      return activeFacets;
    case 'getAsset': {
      const id = args[0] as number;
      return activeAssets.find((a) => a.id === id) ?? activeAssets[0] ?? null;
    }
    case 'getAssetInfo': {
      const id = args[0] as number;
      const a = activeAssets.find((x) => x.id === id);
      if (!a) return null;
      if (a.info) return a.info;
      if (a.kind === 'texture') return { width: 1024, height: 1024, format: 'RGBA32', hasAlpha: true };
      if (a.kind === 'model') return { triangles: 4850, vertices: 6120, meshes: 2, materials: 2 };
      if (a.kind === 'audio') return { durationSec: 3.4, channels: 2, sampleRate: 44100, codec: 'pcm_s16le', bitRate: 1411000 };
      return null;
    }
    case 'readMeta': {
      const id = args[0] as number;
      const a = activeAssets.find((x) => x.id === id);
      if (a) {
        const metaFile = getMetaFile(a.relPath + '.meta');
        if (metaFile) {
          return metaFile.text();
        }
      }
      return 'fileFormatVersion: 2\nguid: e3b0c44298fc1c149afbf4c8996fb924\nTextureImporter:\n  maxTextureSize: 2048\n  textureFormat: -1\n  sRGBTexture: 1';
    }
    case 'setTags': {
      const id = args[0] as number;
      const tags = args[1] as string[];
      const a = MOCK_ASSETS.find((x) => x.id === id);
      if (a) a.tags = tags;
      return a ?? null;
    }
    case 'listPresets':
      return BUILTIN_PRESETS;
    case 'savePreset':
      return { id: 'custom-' + Date.now(), name: String(args[0]), builtIn: false };
    case 'deletePreset':
      return true;
    case 'listJobs':
      return [];
    case 'cancelJob':
      return true;
    case 'listOperations':
      return [];
    case 'listHistory':
      return [];
    case 'undoOperation':
      return true;
    case 'toolStatus':
      return { sharp: true, fbx2gltf: true, ffmpeg: true, gltfTransform: true };
    case 'apply':
      return { id: 'job-' + Date.now(), label: 'Optimize Batch', state: 'done', results: [{ ok: true }] };
    default:
      return null;
  }
}

export const api: AtsApi = typeof window !== 'undefined' && window.atsBridge ? electronApi(window.atsBridge) : webApi();

