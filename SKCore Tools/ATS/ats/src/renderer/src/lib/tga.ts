/**
 * Browser-native TGA (Truevision Targa) Decoder.
 * Decodes uncompressed & RLE TrueColor, Grayscale, and Color-Mapped TGAs into ImageData and PNG DataURL.
 */

export function isTgaBuffer(u8: Uint8Array): boolean {
  if (u8.length < 18) return false;
  const type = u8[2];
  const w = u8[12] | (u8[13] << 8);
  const h = u8[14] | (u8[15] << 8);
  return [1, 2, 3, 9, 10, 11].includes(type) && w > 0 && h > 0;
}

export function decodeTgaToImageData(u8: Uint8Array): ImageData {
  const idLength = u8[0];
  const colorMapType = u8[1];
  const imageType = u8[2];
  const cmFirst = u8[3] | (u8[4] << 8);
  const cmLength = u8[5] | (u8[6] << 8);
  const cmDepth = u8[7];
  const width = u8[12] | (u8[13] << 8);
  const height = u8[14] | (u8[15] << 8);
  const bpp = u8[16];
  const descriptor = u8[17];

  const rle = imageType >= 9;
  const base = imageType & 7;
  let off = 18 + idLength;

  let palette: Uint8Array | null = null;
  if (colorMapType === 1) {
    const cmBytes = Math.ceil(cmDepth / 8);
    palette = u8.subarray(off, off + cmLength * cmBytes);
    off += cmLength * cmBytes;
  }

  const bytesPP = Math.ceil(bpp / 8);
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  const alphaBits = descriptor & 0x0f;

  const writePixel = (dst: number, so: number) => {
    let r = 0, g = 0, b = 0, a = 255;
    if (base === 3) {
      r = g = b = u8[so];
      if (bytesPP === 2) a = u8[so + 1];
    } else if (base === 1 && palette) {
      const idx = (bytesPP === 2 ? (u8[so] | (u8[so + 1] << 8)) : u8[so]) - cmFirst;
      const cb = Math.ceil(cmDepth / 8);
      const po = idx * cb;
      if (cb === 2) {
        const v = palette[po] | (palette[po + 1] << 8);
        r = Math.round(((v >> 10) & 31) * 255 / 31);
        g = Math.round(((v >> 5) & 31) * 255 / 31);
        b = Math.round((v & 31) * 255 / 31);
      } else {
        b = palette[po]; g = palette[po + 1]; r = palette[po + 2];
        if (cb === 4) a = palette[po + 3];
      }
    } else if (bytesPP === 2) {
      const v = u8[so] | (u8[so + 1] << 8);
      r = Math.round(((v >> 10) & 31) * 255 / 31);
      g = Math.round(((v >> 5) & 31) * 255 / 31);
      b = Math.round((v & 31) * 255 / 31);
      if (alphaBits) a = v & 0x8000 ? 255 : 0;
    } else {
      b = u8[so]; g = u8[so + 1]; r = u8[so + 2];
      if (bytesPP === 4) a = alphaBits ? u8[so + 3] : 255;
    }
    out[dst] = r; out[dst + 1] = g; out[dst + 2] = b; out[dst + 3] = a;
  };

  let px = 0;
  if (!rle) {
    for (; px < n; px++, off += bytesPP) writePixel(px * 4, off);
  } else {
    while (px < n && off < u8.length) {
      const c = u8[off++];
      const count = (c & 0x7f) + 1;
      if (c & 0x80) {
        const so = off;
        off += bytesPP;
        for (let k = 0; k < count && px < n; k++, px++) writePixel(px * 4, so);
      } else {
        for (let k = 0; k < count && px < n; k++, px++, off += bytesPP) writePixel(px * 4, off);
      }
    }
  }

  const topOrigin = (descriptor & 0x20) !== 0;
  const rightOrigin = (descriptor & 0x10) !== 0;
  if (!topOrigin || rightOrigin) {
    const fixed = new Uint8ClampedArray(out.length);
    for (let y = 0; y < height; y++) {
      const sy = topOrigin ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const sx = rightOrigin ? width - 1 - x : x;
        const di = (y * width + x) * 4;
        const si = (sy * width + sx) * 4;
        fixed[di] = out[si];
        fixed[di + 1] = out[si + 1];
        fixed[di + 2] = out[si + 2];
        fixed[di + 3] = out[si + 3];
      }
    }
    return new ImageData(fixed, width, height);
  }

  return new ImageData(out, width, height);
}

export function decodeTgaToDataUrl(u8: Uint8Array): string {
  try {
    const imgData = decodeTgaToImageData(u8);
    const canvas = document.createElement('canvas');
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[ATS] TGA decode failed', e);
    return '';
  }
}
