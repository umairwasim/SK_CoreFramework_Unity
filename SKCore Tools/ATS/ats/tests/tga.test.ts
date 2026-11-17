import { describe, expect, it } from 'vitest';
import { decodeTga, encodeTga } from '../src/core/processors/tga';

describe('tga codec', () => {
  it('round-trips RGBA through RLE', () => {
    const w = 37, h = 19;
    const px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      px[i * 4] = x < 10 ? 255 : (i * 7) & 255; px[i * 4 + 1] = x < 10 ? 0 : (i * 13) & 255; px[i * 4 + 2] = 40; px[i * 4 + 3] = x % 3 ? 255 : 128;
    }
    const d = decodeTga(encodeTga(px, w, h, true));
    expect([d.width, d.height, d.hasAlpha]).toEqual([w, h, true]);
    expect(Buffer.compare(d.data, px)).toBe(0);
  });
  it('24-bit drops alpha', () => {
    const px = Buffer.from([1, 2, 3, 99, 4, 5, 6, 99]);
    const d = decodeTga(encodeTga(px, 2, 1, false));
    expect([...d.data]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });
});
