/**
 * Minimal TGA codec (libvips / sharp cannot read Targa, which is common in Unity projects).
 * Decodes: uncompressed & RLE true-color (16/24/32 bpp), grayscale (8 bpp), color-mapped (8 bpp index).
 * Encodes: RLE true-color 24/32 bpp, bottom-left origin (the most compatible variant).
 */
export interface RawImage {
  width: number;
  height: number;
  channels: 4;
  data: Buffer; // RGBA, top-left origin
  hasAlpha: boolean;
}

export function isTga(buf: Buffer): boolean {
  if (buf.length < 18) return false;
  const type = buf[2];
  return [1, 2, 3, 9, 10, 11].includes(type) && buf.readUInt16LE(12) > 0 && buf.readUInt16LE(14) > 0;
}

export function readTgaHeader(buf: Buffer) {
  return {
    idLength: buf[0],
    colorMapType: buf[1],
    imageType: buf[2],
    cmFirst: buf.readUInt16LE(3),
    cmLength: buf.readUInt16LE(5),
    cmDepth: buf[7],
    width: buf.readUInt16LE(12),
    height: buf.readUInt16LE(14),
    bpp: buf[16],
    descriptor: buf[17],
  };
}

export function decodeTga(buf: Buffer): RawImage {
  const h = readTgaHeader(buf);
  const { width, height, bpp, imageType } = h;
  if (!isTga(buf)) throw new Error('Not a supported TGA file');
  const rle = imageType >= 9;
  const base = imageType & 7; // 1 colormap, 2 truecolor, 3 gray
  let off = 18 + h.idLength;

  let palette: Buffer | null = null;
  if (h.colorMapType === 1) {
    const cmBytes = Math.ceil(h.cmDepth / 8);
    palette = buf.subarray(off, off + h.cmLength * cmBytes);
    off += h.cmLength * cmBytes;
  }

  const bytesPP = Math.ceil(bpp / 8);
  const n = width * height;
  const out = Buffer.alloc(n * 4);
  let hasAlpha = false;
  const alphaBits = h.descriptor & 0x0f;

  const writePixel = (dst: number, src: Buffer, so: number) => {
    let r = 0, g = 0, b = 0, a = 255;
    if (base === 3) {
      r = g = b = src[so];
      if (bytesPP === 2) a = src[so + 1];
    } else if (base === 1) {
      const idx = (bytesPP === 2 ? src.readUInt16LE(so) : src[so]) - h.cmFirst;
      const cb = Math.ceil(h.cmDepth / 8);
      const p = palette!;
      const po = idx * cb;
      if (cb === 2) {
        const v = p.readUInt16LE(po);
        r = ((v >> 10) & 31) * 255 / 31; g = ((v >> 5) & 31) * 255 / 31; b = (v & 31) * 255 / 31;
      } else {
        b = p[po]; g = p[po + 1]; r = p[po + 2];
        if (cb === 4) a = p[po + 3];
      }
    } else if (bytesPP === 2) {
      const v = src.readUInt16LE(so);
      r = ((v >> 10) & 31) * 255 / 31; g = ((v >> 5) & 31) * 255 / 31; b = (v & 31) * 255 / 31;
      if (alphaBits) a = v & 0x8000 ? 255 : 0;
    } else {
      b = src[so]; g = src[so + 1]; r = src[so + 2];
      if (bytesPP === 4) a = alphaBits ? src[so + 3] : 255;
    }
    if (a !== 255) hasAlpha = true;
    out[dst] = r; out[dst + 1] = g; out[dst + 2] = b; out[dst + 3] = a;
  };

  // decode into a linear pixel stream (file order)
  let px = 0;
  if (!rle) {
    for (; px < n; px++, off += bytesPP) writePixel(px * 4, buf, off);
  } else {
    while (px < n && off < buf.length) {
      const c = buf[off++];
      const count = (c & 0x7f) + 1;
      if (c & 0x80) {
        const so = off;
        off += bytesPP;
        for (let k = 0; k < count && px < n; k++, px++) writePixel(px * 4, buf, so);
      } else {
        for (let k = 0; k < count && px < n; k++, px++, off += bytesPP) writePixel(px * 4, buf, off);
      }
    }
  }

  // re-orient to top-left
  const topOrigin = (h.descriptor & 0x20) !== 0;
  const rightOrigin = (h.descriptor & 0x10) !== 0;
  if (!topOrigin || rightOrigin) {
    const fixed = Buffer.alloc(out.length);
    for (let y = 0; y < height; y++) {
      const sy = topOrigin ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const sx = rightOrigin ? width - 1 - x : x;
        out.copy(fixed, (y * width + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
      }
    }
    return { width, height, channels: 4, data: fixed, hasAlpha };
  }
  return { width, height, channels: 4, data: out, hasAlpha };
}

/** Encode RGBA (top-left) as RLE TGA. Drops alpha (24 bpp) when `withAlpha` is false. */
export function encodeTga(rgba: Buffer, width: number, height: number, withAlpha: boolean): Buffer {
  const bpp = withAlpha ? 4 : 3;
  const header = Buffer.alloc(18);
  header[2] = 10; // RLE truecolor
  header.writeUInt16LE(width, 12);
  header.writeUInt16LE(height, 14);
  header[16] = bpp * 8;
  header[17] = withAlpha ? 8 : 0; // bottom-left origin, 8 alpha bits
  const chunks: Buffer[] = [header];
  const px = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return withAlpha
      ? [rgba[o + 2], rgba[o + 1], rgba[o], rgba[o + 3]]
      : [rgba[o + 2], rgba[o + 1], rgba[o]];
  };
  const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
  for (let yy = height - 1; yy >= 0; yy--) {
    const row: number[] = [];
    let x = 0;
    while (x < width) {
      // run-length packet?
      const p = px(x, yy);
      let run = 1;
      while (x + run < width && run < 128 && same(px(x + run, yy), p)) run++;
      if (run > 1) {
        row.push(0x80 | (run - 1), ...p);
        x += run;
        continue;
      }
      // raw packet
      const raw: number[] = [];
      let count = 0;
      while (x < width && count < 128) {
        const cur = px(x, yy);
        if (x + 1 < width && same(px(x + 1, yy), cur)) break;
        raw.push(...cur);
        x++;
        count++;
      }
      row.push(count - 1, ...raw);
    }
    chunks.push(Buffer.from(row));
  }
  // TGA 2.0 footer
  const footer = Buffer.alloc(26);
  footer.write('TRUEVISION-XFILE.\0', 8, 'binary');
  chunks.push(footer);
  return Buffer.concat(chunks);
}
