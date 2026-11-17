/**
 * OmniProfiler — Bellek İçi Metrik Deposu (Store)
 *
 * İki katmanlı tasarım:
 *   1) Ring buffer (typed arrays)  -> grafikler, 1%/0.1% low, canlı üst bar
 *   2) SQLite (db.js)              -> kalıcı, oturumlar arası tarihsel analiz
 *
 * UI yolu asla diske dokunmaz; disk yazması arka planda 250 ms'de bir flush edilir.
 */
import { FRAME_FIELDS, F } from '../shared/protocol.js';

const RING_CAPACITY = 120_000; // ~60 fps ile 33 dakika; aşılınca en eski veri düşer (diskte kalır)

function avg(a, from, to) {
  if (to <= from) return 0;
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return s / (to - from);
}

/**
 * 1% Low / 0.1% Low FPS
 * --------------------
 * Ortalama FPS, tek bir uzun takılmayı tamamen gizler. Oyun hissiyatını
 * belirleyen şey en kötü karelerdir.
 *   - 1% Low   : en kötü %1'lik karelerin ortalaması
 *   - 0.1% Low : en kötü %0.1'lik karelerin ortalaması (ani hitch'ler)
 * Bu değerler, pencere içindeki fps dizisinin kopyalanıp sıralanmasıyla hesaplanır.
 * Pencere boyutu (varsayılan 600 kare ≈ 10 sn) UI'dan değiştirilebilir.
 */
export function computeLowPercentiles(fpsWindow) {
  const n = fpsWindow.length;
  if (!n) return { avg: 0, p01: 0, p001: 0, min: 0 };
  const sorted = Float64Array.from(fpsWindow).sort();
  const mean = (from, to) => {
    let s = 0;
    for (let i = from; i < to; i++) s += sorted[i];
    return s / Math.max(1, to - from);
  };
  const n01 = Math.max(1, Math.floor(n * 0.01));
  const n001 = Math.max(1, Math.floor(n * 0.001));
  return {
    avg: mean(0, n),
    p01: mean(0, n01),
    p001: mean(0, n001),
    min: sorted[0],
  };
}

export class MetricsStore {
  constructor({ db, capacity = RING_CAPACITY } = {}) {
    this.db = db;
    this.capacity = capacity;
    this.cols = {};
    for (const name of FRAME_FIELDS) this.cols[name] = new Float64Array(capacity);
    this.fps = new Float64Array(capacity);
    this.tRel = new Float64Array(capacity);
    this.scene = new Array(capacity).fill('');
    this.hasSamples = new Uint8Array(capacity);
    this.count = 0;      // toplam yazılan kare
    this.head = 0;       // ring buffer yazma konumu
    this.session = null;
    this.startedAt = 0;
    // Ajan sağlık / veri kalitesi
    this.agent = { connected: false, lastSeq: -1, seqGaps: 0, packets: 0, bytes: 0, lostRatio: 0, lastSeen: 0, transport: null };
    // Sıkıştırma istatistiği (rapor için: "ne kadar bant genişliği kazandık")
    this.wireBytes = 0;
    this.wireFrames = 0;
  }

  reset(session) {
    this.session = session;
    this.startedAt = session?.startedAt ?? Date.now();
    this.count = 0;
    this.head = 0;
    this.cols.scene?.fill?.('');
    this.scene.fill('');
    this.hasSamples.fill(0);
  }

  /**
   * Tek bir kareyi ekler.
   * @param {Record<string, number>} m FRAME_FIELDS anahtarlı metrik nesnesi
   * @param {{scene?:string, hasSamples?:boolean, ts?:number}} extra
   */
  push(m, extra = {}) {
    const i = this.head;
    for (const name of FRAME_FIELDS) this.cols[name][i] = m[name] ?? 0;
    const dt = m.dtMs > 0 ? m.dtMs : 16.6667;
    this.fps[i] = 1000 / dt;
    this.tRel[i] = ((extra.ts ?? Date.now()) - this.startedAt) / 1000;
    this.scene[i] = extra.scene ?? this.lastScene ?? '';
    this.lastScene = this.scene[i];
    this.hasSamples[i] = extra.hasSamples ? 1 : 0;
    this.head = (i + 1) % this.capacity;
    this.count++;
    return this.frameAt(this.size - 1);
  }

  /** Mantıksal indeks (0 = en eski hâlâ tutulan kare) -> ring konumu. */
  #slot(logical) {
    const size = Math.min(this.count, this.capacity);
    const start = this.count <= this.capacity ? 0 : this.head;
    return (start + logical) % this.capacity;
  }

  get size() {
    return Math.min(this.count, this.capacity);
  }

  /** logical indeksli karenin tamamını nesne olarak döndürür. */
  frameAt(logical) {
    if (logical < 0 || logical >= this.size) return null;
    const i = this.#slot(logical);
    const o = { tRel: this.tRel[i], fps: this.fps[i], scene: this.scene[i], hasSamples: !!this.hasSamples[i], index: logical };
    for (const name of FRAME_FIELDS) o[name] = this.cols[name][i];
    return o;
  }

  /**
   * frameId (Unity Time.frameCount) -> mantıksal indeks.
   * frameId monoton arttığı için ikili arama yapılır.
   * ÖNEMLİ: tam eşleşme yoksa -1 döner. (Ring buffer'dan düşmüş bir kare için
   * "en yakın" kareyi döndürmek, yanlış veriyi doğru diye göstermek olurdu;
   * örn. 1. dakikadaki log'a 10. dakikanın FPS'ini bağlam olarak eklemek.)
   */
  logicalOfFrameId(frameId) {
    const col = this.cols.frameId;
    let lo = 0;
    let hi = this.size - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = col[this.#slot(mid)];
      if (v === frameId) return mid;
      if (v < frameId) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  frameById(frameId) {
    const l = this.logicalOfFrameId(frameId);
    return l < 0 ? null : this.frameAt(l);
  }

  /**
   * Tam eşleşme yoksa EN YAKIN kareyi döndürür (UI'da "kareye git" için:
   * kare ring buffer'dan düşmüşse kullanıcıyı en yakın zamana götürür ve
   * sonuçta `approx: true` işaretlenir).
   */
  nearestByFrameId(frameId) {
    const exact = this.logicalOfFrameId(frameId);
    if (exact >= 0) return { frame: this.frameAt(exact), approx: false, logical: exact };
    if (!this.size) return { frame: null, approx: false, logical: -1 };
    const col = this.cols.frameId;
    let lo = 0;
    let hi = this.size - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (col[this.#slot(mid)] < frameId) lo = mid + 1; else hi = mid;
    }
    const candidates = [lo - 1, lo, lo + 1].filter((i) => i >= 0 && i < this.size);
    let best = candidates[0];
    for (const i of candidates) {
      if (Math.abs(col[this.#slot(i)] - frameId) < Math.abs(col[this.#slot(best)] - frameId)) best = i;
    }
    return { frame: this.frameAt(best), approx: true, logical: best };
  }

  /** Grafik serileri için sıkıştırılmış zaman serisi (LTTB benzeri min/max koruyucu). */
  series({ fields = ['dtMs', 'fps', 'gcAllocBytes', 'monoUsed', 'totalReserved', 'drawCalls'], maxPoints = 4000, fromT = null, toT = null } = {}) {
    let lo = 0;
    let hi = this.size - 1;
    if (fromT != null || toT != null) {
      const t = this.tRel;
      while (lo < hi && t[this.#slot(lo)] < (fromT ?? -Infinity)) lo++;
      while (hi > lo && t[this.#slot(hi)] > (toT ?? Infinity)) hi--;
    }
    const n = hi - lo + 1;
    if (n <= 0) return { t: [], fields, columns: {} };
    const step = Math.max(1, Math.ceil(n / maxPoints));
    const outT = [];
    const out = {};
    for (const f of fields) out[f] = [];
    for (let k = lo; k <= hi; k += step) {
      // Adım içinde min/max korunur ki spike'lar küçültmede kaybolmasın.
      const end = Math.min(hi, k + step - 1);
      let bestIdx = k;
      if (step > 1) {
        let worst = -1;
        for (let j = k; j <= end; j++) {
          const s = this.#slot(j);
          const v = this.cols.dtMs[s];
          if (v > worst) { worst = v; bestIdx = j; }
        }
      }
      const s = this.#slot(bestIdx);
      outT.push(this.tRel[s]);
      for (const f of fields) out[f].push(f === 'fps' ? this.fps[s] : this.cols[f][s]);
    }
    return { t: outT, fields, columns: out, dropped: n - outT.length, total: n };
  }

  /** Canlı üst bar için anlık özet + low percentile'lar. */
  snapshot({ window = 600 } = {}) {
    const size = this.size;
    if (!size) return null;
    const latest = this.frameAt(size - 1);
    const w = Math.min(window, size);
    const fpsWin = new Float64Array(w);
    for (let k = 0; k < w; k++) fpsWin[k] = this.fps[this.#slot(size - w + k)];
    const low = computeLowPercentiles(fpsWin);
    // GC hızı: son 1 saniyedeki toplam alloc
    const nowT = latest.tRel;
    let gcPerSec = 0;
    for (let k = Math.max(0, size - 240); k < size; k++) {
      const s = this.#slot(k);
      if (nowT - this.tRel[s] <= 1) gcPerSec += this.cols.gcAllocBytes[s];
    }
    return {
      latest,
      low,
      window: w,
      gcPerSec,
      durationSec: nowT,
      frames: this.count,
      scene: latest.scene,
      agent: { ...this.agent },
    };
  }

  markAgent(seq, bytes, transport) {
    const a = this.agent;
    a.packets++;
    a.bytes += bytes;
    a.transport = transport;
    a.lastSeen = Date.now();
    a.connected = true;
    if (seq != null) {
      if (a.lastSeq >= 0 && seq > a.lastSeq + 1) a.seqGaps += seq - a.lastSeq - 1;
      if (seq > a.lastSeq) a.lastSeq = seq;
      const expected = a.lastSeq + 1;
      a.lostRatio = expected > 0 ? Math.min(1, a.seqGaps / expected) : 0;
    }
  }
}

export { FRAME_FIELDS, F };
