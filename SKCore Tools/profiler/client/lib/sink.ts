/**
 * FrameSink — kare verisinin "hızlı yolu".
 *
 * React state'ine 60 fps kare verisi koymak, her karede tüm ağacı
 * yeniden render ettirir (Unity Profiler'ın kendisinin yaptığı hata).
 * Bu yüzden kareler Zustand'ın dışında, düz bir dizide tutulur ve grafikler
 * bu diziyi requestAnimationFrame ritminde OKUR. React yalnızca ~4 Hz'de
 * güncellenen özet (snapshot) verisiyle render olur.
 */
export type Frame = {
  t: number;        // oturum başından saniye
  frameId: number;
  dt: number;       // ms
  fps: number;
  gc: number;       // byte
  mono: number;     // byte
  heap: number;     // byte
  res: number;      // byte
  gfx: number;      // byte
  dc: number;
  batches: number;
  sp: number;
  tri: number;
  vert: number;
  main: number;
  rend: number;
  gpu: number;
  phys: number;
  anim: number;
  scene: string;
  samples: number;
};

type Listener = () => void;

export const MAX_FRAMES = 240_000;

class FrameSink {
  frames: Frame[] = [];
  private listeners = new Set<Listener>();
  private indexById = new Map<number, number>();
  trimmed = 0;

  push(f: Frame) {
    this.frames.push(f);
    this.indexById.set(f.frameId, this.frames.length - 1);
    if (this.frames.length > MAX_FRAMES) {
      const drop = this.frames.length - MAX_FRAMES;
      this.frames.splice(0, drop);
      this.trimmed += drop;
      this.indexById.clear();
      for (let i = 0; i < this.frames.length; i++) this.indexById.set(this.frames[i].frameId, i);
    }
  }

  pushMany(list: Frame[]) {
    for (const f of list) this.push(f);
  }

  /** Geçmiş (history) verisini başa ekler; grafikler için sıralı tutulur. */
  prependHistory(list: Frame[]) {
    if (!list.length) return;
    const firstLive = this.frames.length ? this.frames[0].t : Infinity;
    const older = list.filter((f) => f.t < firstLive);
    if (!older.length) return;
    this.frames = older.concat(this.frames);
    this.indexById.clear();
    for (let i = 0; i < this.frames.length; i++) this.indexById.set(this.frames[i].frameId, i);
  }

  clear() {
    this.frames = [];
    this.indexById.clear();
    this.trimmed = 0;
  }

  get length() { return this.frames.length; }
  last(): Frame | null { return this.frames.length ? this.frames[this.frames.length - 1] : null; }

  byFrameId(id: number): Frame | null {
    const i = this.indexById.get(id);
    if (i != null && this.frames[i]?.frameId === id) return this.frames[i];
    // indeks bayatlamışsa doğrusal arama (seyrek yol)
    for (let k = this.frames.length - 1; k >= 0; k--) if (this.frames[k].frameId === id) return this.frames[k];
    return null;
  }

  indexOfFrameId(id: number): number {
    for (let k = this.frames.length - 1; k >= 0; k--) if (this.frames[k].frameId === id) return k;
    return -1;
  }

  /** t zamanına en yakın kare. */
  nearestByTime(t: number): Frame | null {
    if (!this.frames.length) return null;
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const a = this.frames[Math.max(0, lo - 1)];
    const b = this.frames[lo];
    return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() { for (const l of this.listeners) l(); }
}

export const sink = new FrameSink();
