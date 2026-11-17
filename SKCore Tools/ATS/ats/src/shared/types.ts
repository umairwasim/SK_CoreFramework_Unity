// Shared types used by core (Node), Electron main/preload and the React renderer.
// Keep this file free of Node or DOM imports.

export type AssetKind = 'texture' | 'model' | 'audio';

export interface AssetRecord {
  id: number;
  /** Path relative to the project root, always with forward slashes, e.g. "Assets/Art/hero.png" */
  relPath: string;
  /** Folder relative to the project root, e.g. "Assets/Art" */
  folder: string;
  name: string;
  ext: string; // lower-case, without dot
  kind: AssetKind;
  size: number;
  mtimeMs: number;
  /** GUID read from the sibling .meta file (null when there is no .meta yet) */
  guid: string | null;
  /** Unity asset labels (from .meta) + ATS tags (from DB), de-duplicated */
  tags: string[];
  /** Lazily extracted media info (dimensions, duration, etc.) */
  info: AssetInfo | null;
}

export interface TextureInfo {
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
  format: string;
}
export interface AudioInfo {
  durationSec: number;
  channels: number;
  sampleRate: number;
  codec: string;
  bitRate?: number;
}
export interface ModelInfo {
  meshes?: number;
  vertices?: number;
  triangles?: number;
  materials?: number;
  textures?: number;
  animations?: number;
  note?: string;
}
export type AssetInfo = TextureInfo | AudioInfo | ModelInfo;

// ---------------------------------------------------------------------------
// Settings (two layers)
//  1. `source`   – changes the actual file bytes (resize, re-encode, resample …)
//  2. `importer` – Unity importer settings, written into the .meta YAML
//                  (the GUID line is never touched)
// ---------------------------------------------------------------------------

export interface TextureSettings {
  source: {
    enabled: boolean;
    maxSize: number; // longest edge in px, 0 = keep
    powerOfTwo: 'keep' | 'nearest' | 'down';
    outputFormat: 'keep' | 'png' | 'jpg' | 'tga'; // no WebP: Unity's TextureImporter can't read it
    quality: number; // 1..100 (jpg)
    pngCompressionLevel: number; // 0..9
    stripAlphaIfOpaque: boolean;
  };
  importer: {
    enabled: boolean;
    textureType: 'keep' | 'default' | 'sprite' | 'normal';
    maxTextureSize: number; // 32..16384
    mipmaps: 'keep' | 'on' | 'off' | 'auto'; // auto: off for Sprite/UI, on otherwise
    sRGB: 'keep' | 'on' | 'off';
    readWrite: 'keep' | 'on' | 'off';
    mobileFormat: 'keep' | 'ASTC_4x4' | 'ASTC_6x6' | 'ASTC_8x8' | 'ETC2_RGBA8';
    pcFormat: 'keep' | 'BC7' | 'DXT5' | 'DXT1';
  };
}

export interface ModelSettings {
  source: {
    enabled: boolean;
    /** gltf/glb only */
    dedup: boolean;
    prune: boolean;
    weld: boolean;
    simplifyRatio: number; // 1 = off, 0.5 = half the triangles
    meshCompression: 'none' | 'meshopt' | 'draco' | 'quantize';
    textureMaxSize: number; // resize embedded textures, 0 = keep
    /** fbx → glb (Save as New only, requires FBX2glTF binary) */
    convertFbxToGlb: boolean;
  };
  importer: {
    enabled: boolean;
    meshCompression: 'keep' | 'off' | 'low' | 'medium' | 'high';
    optimizeGameObjects: 'keep' | 'on' | 'off';
    importAnimation: 'keep' | 'on' | 'off';
    normals: 'keep' | 'import' | 'calculate' | 'none';
    readWrite: 'keep' | 'on' | 'off';
  };
}

export interface AudioSettings {
  source: {
    enabled: boolean;
    forceMono: boolean;
    sampleRate: 0 | 22050 | 32000 | 44100 | 48000; // 0 = keep
    outputFormat: 'keep' | 'wav' | 'ogg' | 'mp3';
    quality: number; // ogg vorbis q 0..10 ; mp3 VBR 0(best)..9 is derived
    normalize: boolean;
    trimSilence: boolean;
  };
  importer: {
    enabled: boolean;
    forceToMono: 'keep' | 'on' | 'off' | 'auto'; // auto: SFX mono, music stereo
    loadType: 'keep' | 'decompressOnLoad' | 'compressedInMemory' | 'streaming' | 'auto';
    compressionFormat: 'keep' | 'pcm' | 'vorbis' | 'adpcm';
    quality: number; // 1..100 (Vorbis quality in importer)
    sampleRate: 'keep' | 'preserve' | 'optimize' | 'auto' | 44100 | 22050; // auto: SFX 22050, music preserve (≤44100)
  };
}

export interface SettingsBundle {
  texture: TextureSettings;
  model: ModelSettings;
  audio: AudioSettings;
}

export interface Preset {
  id: string;
  name: string;
  builtIn: boolean;
  description?: string;
  settings: SettingsBundle;
}

export type ApplyMode = 'overwrite' | 'saveAsNew';

export interface ApplyRequest {
  assetIds: number[];
  mode: ApplyMode;
  /** suffix for Save as New, e.g. "_optimized" or "_mobile" */
  suffix: string;
  settings: SettingsBundle;
  presetName?: string;
}

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobItemResult {
  assetId: number;
  relPath: string;
  outputRelPath?: string;
  ok: boolean;
  skipped?: boolean;
  message: string;
  bytesBefore?: number;
  bytesAfter?: number;
  guidBefore?: string | null;
  guidAfter?: string | null;
}

export interface JobStatus {
  id: string;
  label: string;
  state: JobState;
  total: number;
  done: number;
  current?: string;
  startedAt?: number;
  finishedAt?: number;
  results: JobItemResult[];
  operationId?: number;
}

export interface HistoryEntry {
  id: number;
  operationId: number;
  createdAt: number;
  mode: ApplyMode;
  presetName: string | null;
  relPath: string;
  outputRelPath: string | null;
  ok: boolean;
  message: string;
  bytesBefore: number | null;
  bytesAfter: number | null;
  settingsJson: string;
  undone: boolean;
}

export interface OperationSummary {
  id: number;
  createdAt: number;
  mode: ApplyMode;
  presetName: string | null;
  itemCount: number;
  okCount: number;
  undone: boolean;
  backupDir: string | null;
}

export interface WorkspaceInfo {
  root: string;
  name: string;
  unityVersion: string | null;
  counts: Record<AssetKind, number>;
  totalBytes: number;
  scannedAt: number;
}

export interface FolderNode {
  path: string; // "Assets/Art"
  name: string;
  count: number; // assets in this folder (recursive) for the current kind
  children: FolderNode[];
}

export interface AssetQuery {
  kind: AssetKind;
  folder?: string | null; // recursive prefix
  search?: string;
  formats?: string[];
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  sort?: 'name' | 'size' | 'mtime';
  sortDir?: 'asc' | 'desc';
}

export interface ToolStatus {
  ffmpeg: string | null;
  ffprobe: string | null;
  fbx2gltf: string | null;
  sharp: string | null;
}

export type AtsEvent =
  | { type: 'workspace'; workspace: WorkspaceInfo | null }
  | { type: 'scan-progress'; scanned: number; phase: 'walking' | 'indexing' | 'done' }
  | { type: 'assets-changed'; kinds: AssetKind[]; relPaths: string[] }
  | { type: 'job'; job: JobStatus }
  | { type: 'history-changed' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

/** The API surface exposed to the renderer (via Electron preload or the web-preview HTTP bridge). */
export interface AtsApi {
  mode: 'electron' | 'web';
  openWorkspaceDialog(): Promise<WorkspaceInfo | null>;
  openWorkspace(root: string): Promise<WorkspaceInfo>;
  getWorkspace(): Promise<WorkspaceInfo | null>;
  rescan(): Promise<WorkspaceInfo | null>;
  listAssets(q: AssetQuery): Promise<AssetRecord[]>;
  getFolderTree(kind: AssetKind): Promise<FolderNode>;
  getFacets(kind: AssetKind): Promise<{ formats: string[]; tags: string[] }>;
  getAsset(id: number): Promise<AssetRecord | null>;
  getAssetInfo(id: number): Promise<AssetInfo | null>;
  readMeta(id: number): Promise<string | null>;
  setTags(id: number, tags: string[]): Promise<AssetRecord | null>;
  listPresets(): Promise<Preset[]>;
  savePreset(p: Omit<Preset, 'builtIn'>): Promise<Preset[]>;
  deletePreset(id: string): Promise<Preset[]>;
  apply(req: ApplyRequest): Promise<JobStatus>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<JobStatus[]>;
  listOperations(): Promise<OperationSummary[]>;
  listHistory(operationId?: number): Promise<HistoryEntry[]>;
  undoOperation(operationId?: number): Promise<{ restored: number; removed: number; message: string }>;
  toolStatus(): Promise<ToolStatus>;
  fileUrl(asset: Pick<AssetRecord, 'relPath' | 'mtimeMs'>): string;
  thumbUrl(asset: Pick<AssetRecord, 'id' | 'mtimeMs'>): string;
  onEvent(cb: (e: AtsEvent) => void): () => void;
}
