import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import type { TextureInfo, TextureSettings } from '../../shared/types';
import { decodeTga, encodeTga, readTgaHeader } from './tga';

sharp.cache(false); // never keep file handles open (Windows would lock the asset)

async function load(absPath: string, ext: string): Promise<{ img: sharp.Sharp; width: number; height: number; hasAlpha: boolean }> {
  if (ext === 'tga') {
    const raw = decodeTga(await fs.readFile(absPath));
    return {
      img: sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }),
      width: raw.width,
      height: raw.height,
      hasAlpha: raw.hasAlpha,
    };
  }
  const buf = await fs.readFile(absPath); // read into memory → no lingering handle
  const img = sharp(buf, { failOn: 'none' });
  const m = await img.metadata();
  return { img, width: m.width ?? 0, height: m.height ?? 0, hasAlpha: !!m.hasAlpha };
}

export async function textureInfo(absPath: string, ext: string): Promise<TextureInfo> {
  if (ext === 'tga') {
    const buf = await fs.readFile(absPath);
    const h = readTgaHeader(buf);
    return {
      width: h.width,
      height: h.height,
      channels: h.bpp === 32 ? 4 : h.bpp === 8 && h.imageType % 8 === 3 ? 1 : 3,
      hasAlpha: h.bpp === 32 && (h.descriptor & 0x0f) > 0,
      format: `tga${h.imageType >= 9 ? ' (RLE)' : ''} ${h.bpp}bpp`,
    };
  }
  const m = await sharp(await fs.readFile(absPath)).metadata();
  return {
    width: m.width ?? 0,
    height: m.height ?? 0,
    channels: m.channels ?? 0,
    hasAlpha: !!m.hasAlpha,
    format: `${m.format}${m.bitsPerSample && m.bitsPerSample !== 8 ? ` ${m.bitsPerSample}-bit` : ''}${m.isPalette ? ' (palette)' : ''}`,
  };
}

function pot(n: number, mode: 'nearest' | 'down'): number {
  const lower = 2 ** Math.floor(Math.log2(n));
  if (mode === 'down') return lower;
  const upper = lower * 2;
  return n - lower <= upper - n ? lower : upper;
}

export function computeTargetSize(w: number, h: number, s: TextureSettings['source']): { width: number; height: number } {
  let tw = w;
  let th = h;
  if (s.maxSize > 0 && Math.max(w, h) > s.maxSize) {
    const k = s.maxSize / Math.max(w, h);
    tw = Math.max(1, Math.round(w * k));
    th = Math.max(1, Math.round(h * k));
  }
  if (s.powerOfTwo !== 'keep') {
    tw = pot(tw, s.powerOfTwo);
    th = pot(th, s.powerOfTwo);
    if (s.maxSize > 0) {
      tw = Math.min(tw, s.maxSize);
      th = Math.min(th, s.maxSize);
    }
  }
  return { width: tw, height: th };
}

export interface TextureResult {
  outExt: string;
  changed: boolean;
  width: number;
  height: number;
  srcWidth: number;
  srcHeight: number;
  notes: string[];
}

/**
 * Transform a texture into `outPath` (a temp file). `outExt` decides the encoder.
 * `allowResize=false` is used for sprite sheets (Multiple mode) whose rects are in pixels.
 */
export async function processTexture(
  absIn: string,
  ext: string,
  outPath: string,
  outExt: string,
  s: TextureSettings['source'],
  opts: { allowResize: boolean }
): Promise<TextureResult> {
  const notes: string[] = [];
  const { img, width, height, hasAlpha } = await load(absIn, ext);
  let target = computeTargetSize(width, height, s);
  if (!opts.allowResize && (target.width !== width || target.height !== height)) {
    notes.push('resize skipped: sprite sheet (Multiple) rects are stored in pixels');
    target = { width, height };
  }
  const resized = target.width !== width || target.height !== height;
  let pipe = img;
  if (resized) {
    pipe = pipe.resize(target.width, target.height, { fit: 'fill', kernel: 'lanczos3' });
    notes.push(`resized ${width}×${height} → ${target.width}×${target.height}`);
  }

  let keepAlpha = hasAlpha;
  if (hasAlpha && s.stripAlphaIfOpaque) {
    const st = await img.clone().stats();
    if (st.isOpaque) {
      keepAlpha = false;
      pipe = pipe.removeAlpha();
      notes.push('alpha channel removed (fully opaque)');
    }
  }

  switch (outExt) {
    case 'png':
      await pipe.png({ compressionLevel: s.pngCompressionLevel, adaptiveFiltering: true, palette: false }).toFile(outPath);
      break;
    case 'jpg':
    case 'jpeg':
      if (hasAlpha) notes.push('JPEG has no alpha – transparency flattened to black');
      await pipe.flatten({ background: '#000000' }).jpeg({ quality: s.quality, mozjpeg: true, chromaSubsampling: s.quality >= 90 ? '4:4:4' : '4:2:0' }).toFile(outPath);
      break;
    case 'tga': {
      const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      await fs.writeFile(outPath, encodeTga(data, info.width, info.height, keepAlpha));
      break;
    }
    default:
      throw new Error(`Unsupported texture output format: ${outExt}`);
  }
  if (outExt !== ext) notes.push(`format ${ext} → ${outExt}`);
  return {
    outExt,
    changed: resized || outExt !== ext || keepAlpha !== hasAlpha,
    width: target.width,
    height: target.height,
    srcWidth: width,
    srcHeight: height,
    notes,
  };
}

/** Grid thumbnail (webp, ≤256px) – written to the .ats cache, never into Assets/. */
export async function textureThumbnail(absIn: string, ext: string, outPath: string): Promise<void> {
  const { img } = await load(absIn, ext);
  await img.resize(256, 256, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(outPath);
}

/** Full-resolution PNG for previewing formats the browser can't display (TGA). */
export async function texturePreviewPng(absIn: string, ext: string): Promise<Buffer> {
  const { img } = await load(absIn, ext);
  return img.png({ compressionLevel: 3 }).toBuffer();
}
