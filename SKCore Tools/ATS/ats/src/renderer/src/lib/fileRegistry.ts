import { decodeTgaToDataUrl } from './tga';

// In-memory registries for browser mode
const filesById = new Map<number, File>();
const filesByPath = new Map<string, File>();
const metaByPath = new Map<string, File>();

// Cached Object URLs and TGA Data URLs
const objectUrlCache = new Map<number | string, string>();
const tgaDataUrlCache = new Map<number | string, string>();

export const AUDIO_WAVEFORM_SVG = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 48" fill="none">
  <rect width="120" height="48" rx="6" fill="#09090b" fill-opacity="0.8"/>
  <rect x="8" y="18" width="3" height="12" rx="1.5" fill="#38bdf8" opacity="0.5"/>
  <rect x="15" y="14" width="3" height="20" rx="1.5" fill="#38bdf8" opacity="0.6"/>
  <rect x="22" y="8" width="3" height="32" rx="1.5" fill="#38bdf8" opacity="0.85"/>
  <rect x="29" y="16" width="3" height="16" rx="1.5" fill="#38bdf8" opacity="0.7"/>
  <rect x="36" y="6" width="3" height="36" rx="1.5" fill="#38bdf8"/>
  <rect x="43" y="12" width="3" height="24" rx="1.5" fill="#38bdf8" opacity="0.85"/>
  <rect x="50" y="4" width="3" height="40" rx="1.5" fill="#38bdf8"/>
  <rect x="57" y="16" width="3" height="16" rx="1.5" fill="#38bdf8" opacity="0.7"/>
  <rect x="64" y="10" width="3" height="28" rx="1.5" fill="#38bdf8" opacity="0.9"/>
  <rect x="71" y="18" width="3" height="12" rx="1.5" fill="#38bdf8" opacity="0.6"/>
  <rect x="78" y="6" width="3" height="36" rx="1.5" fill="#38bdf8"/>
  <rect x="85" y="12" width="3" height="24" rx="1.5" fill="#38bdf8" opacity="0.8"/>
  <rect x="92" y="16" width="3" height="16" rx="1.5" fill="#38bdf8" opacity="0.65"/>
  <rect x="99" y="8" width="3" height="32" rx="1.5" fill="#38bdf8" opacity="0.85"/>
  <rect x="106" y="20" width="3" height="8" rx="1.5" fill="#38bdf8" opacity="0.45"/>
</svg>`);

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

export function registerAssetFile(id: number, relPath: string, file: File): void {
  filesById.set(id, file);
  filesByPath.set(normalizePath(relPath), file);
}

export function registerMetaFile(relPath: string, file: File): void {
  metaByPath.set(normalizePath(relPath), file);
}

export function getAssetFile(idOrPath: number | string): File | undefined {
  if (typeof idOrPath === 'number') {
    return filesById.get(idOrPath);
  }
  return filesByPath.get(normalizePath(idOrPath));
}

export function getMetaFile(relPath: string): File | undefined {
  return metaByPath.get(normalizePath(relPath));
}

export function clearAssetFiles(): void {
  objectUrlCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  objectUrlCache.clear();
  tgaDataUrlCache.clear();
  filesById.clear();
  filesByPath.clear();
  metaByPath.clear();
}

/**
 * Returns a fast browser-accessible URL (blob: or data:) for the asset.
 */
export function getAssetUrl(asset: { id?: number; relPath: string; ext?: string; mtimeMs?: number }): string {
  const file = (asset.id != null ? filesById.get(asset.id) : undefined) || filesByPath.get(normalizePath(asset.relPath));

  if (!file) {
    // Fallback to static server URL
    return `api/file/${encodeURIComponent(asset.relPath)}?v=${Math.floor(asset.mtimeMs || Date.now())}`;
  }

  // TGA files have pre-generated Data URLs if already decoded
  if (asset.ext === 'tga' || file.name.toLowerCase().endsWith('.tga')) {
    const key = asset.id ?? asset.relPath;
    if (tgaDataUrlCache.has(key)) {
      return tgaDataUrlCache.get(key)!;
    }
  }

  // Check object URL cache
  const cacheKey = asset.id ?? asset.relPath;
  if (objectUrlCache.has(cacheKey)) {
    return objectUrlCache.get(cacheKey)!;
  }

  const url = URL.createObjectURL(file);
  objectUrlCache.set(cacheKey, url);
  return url;
}

/**
 * Asynchronously decode TGA to PNG DataURL and cache it.
 */
export async function getTgaDataUrl(asset: { id?: number; relPath: string }): Promise<string> {
  const key = asset.id ?? asset.relPath;
  if (tgaDataUrlCache.has(key)) return tgaDataUrlCache.get(key)!;

  const file = (asset.id != null ? filesById.get(asset.id) : undefined) || filesByPath.get(normalizePath(asset.relPath));
  if (!file) return '';

  try {
    const buf = await file.arrayBuffer();
    const dataUrl = decodeTgaToDataUrl(new Uint8Array(buf));
    if (dataUrl) {
      tgaDataUrlCache.set(key, dataUrl);
      return dataUrl;
    }
  } catch (e) {
    console.warn('[ATS] Failed to decode TGA file:', asset.relPath, e);
  }
  return '';
}

/**
 * Returns a thumbnail URL:
 * - Audio: Clean SVG waveform
 * - Textures: Direct blob: URL or TGA data URL
 * - Models: Model thumbnailer URL
 */
export function getThumbUrl(asset: { id: number; relPath?: string; kind?: string; ext?: string; mtimeMs?: number }): string {
  if (asset.kind === 'audio') {
    return AUDIO_WAVEFORM_SVG;
  }

  if (asset.kind === 'texture' || !asset.kind) {
    return getAssetUrl({ id: asset.id, relPath: asset.relPath || '', ext: asset.ext, mtimeMs: asset.mtimeMs });
  }

  return `api/thumb/${asset.id}?v=${Math.floor(asset.mtimeMs || Date.now())}`;
}
