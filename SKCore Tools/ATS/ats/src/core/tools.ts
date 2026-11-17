/** Locates external binaries (ffmpeg, ffprobe, FBX2glTF). Handles Electron asar unpacking. */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ToolStatus } from '../shared/types';

const require = createRequire(import.meta.url);

const unasar = (p: string | null | undefined) => (p ? p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : null);

function which(bin: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const e of exts) {
      const p = path.join(dir, bin + e);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

let cache: ToolStatus | null = null;

export function tools(): ToolStatus {
  if (cache) return cache;
  let ffmpeg: string | null = process.env.ATS_FFMPEG ?? null;
  let ffprobe: string | null = process.env.ATS_FFPROBE ?? null;
  try {
    ffmpeg ??= unasar(require('ffmpeg-static') as string);
  } catch { /* optional */ }
  try {
    ffprobe ??= unasar((require('ffprobe-static') as { path: string }).path);
  } catch { /* optional */ }
  if (!ffmpeg || !existsSync(ffmpeg)) ffmpeg = which('ffmpeg');
  if (!ffprobe || !existsSync(ffprobe)) ffprobe = which('ffprobe');

  let fbx2gltf: string | null = process.env.ATS_FBX2GLTF ?? null;
  if (!fbx2gltf) {
    fbx2gltf = which('FBX2glTF') ?? which('fbx2gltf');
    if (!fbx2gltf) {
      try {
        // optional npm package "fbx2gltf" ships per-platform binaries
        const pkg = path.dirname(require.resolve('fbx2gltf/package.json'));
        const sub = process.platform === 'win32' ? 'Windows_NT/FBX2glTF.exe' : process.platform === 'darwin' ? 'Darwin/FBX2glTF' : 'Linux/FBX2glTF';
        const p = unasar(path.join(pkg, 'bin', sub));
        if (p && existsSync(p)) fbx2gltf = p;
      } catch { /* not installed */ }
    }
  }
  let sharpV: string | null = null;
  try {
    sharpV = (require('sharp') as { versions: { vips: string } }).versions.vips;
  } catch { /* */ }
  cache = { ffmpeg, ffprobe, fbx2gltf, sharp: sharpV ? `libvips ${sharpV}` : null };
  return cache;
}
