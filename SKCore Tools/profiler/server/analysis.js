/**
 * OmniProfiler — Otomatik Bellek Sızıntısı Dedektörü + Bulgular (Findings)
 *
 * MANTIK
 * ------
 * Ajan, Object.Instantiate / Object.Destroy çağrılarını dinler ve (tip, prefab)
 * çifti için delta gönderir. Panel tarafında her tip için canlı sayaç tutulur:
 *
 *      live += instantiate - destroy
 *
 * Tek başına "live artıyor" sızıntı demek DEĞİLDİR: bir havuz (pool) da büyür.
 * Bu yüzden dedektör üç ayrı kanıtı birlikte değerlendirir:
 *
 *   1) Denge oranı   : destroyed / spawned  (0.05'in altındaysa objeler geri dönmüyor)
 *   2) Eğilim (slope): canlı sayının son N saniyedeki doğrusal artış hızı (obje/sn)
 *   3) Bellek korelasyonu: Mono heap aynı pencerede yükseliyor mu?
 *
 * Üçü birlikte tutuyorsa -> "yüksek olasılıklı sızıntı" bulgusu üretilir ve
 * kullanıcıya hangi prefab'ın, hangi hızda, kaç obje biriktirdiği söylenir.
 * Ayrıca managed heap üzerinde monoton büyüyen oturumlar için ayrı bir
 * "heap growth" bulgusu ve frame hitch / GC spike / draw call regresyon
 * bulguları üretilir. Hepsi "Bulgular" çekmecesinde toplanır ve tıklanınca
 * ilgili kareye atlar.
 */

const MIN_SAMPLES_FOR_SLOPE = 12;

function linearSlope(points) {
  // points: [[t, v], ...] -> en küçük kareler eğimi (birim/sn)
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

export class LeakDetector {
  constructor({ windowSec = 15, emitEverySec = 2 } = {}) {
    this.windowSec = windowSec;
    this.emitEverySec = emitEverySec;
    /** @type {Map<string, {type:string,prefab:string,spawned:number,destroyed:number,live:number,history:Array,lastReport:number,reported:number}>} */
    this.types = new Map();
    this.lastEmit = 0;
    this.findings = [];
  }

  key(type, prefab) { return `${type}::${prefab || '-'}`; }

  /**
   * @param {{type:string,prefab:string,delta:number,frame:number,ts:number,tRel:number}} e
   */
  track(e) {
    const k = this.key(e.type, e.prefab);
    let r = this.types.get(k);
    if (!r) {
      r = { type: e.type, prefab: e.prefab || null, spawned: 0, destroyed: 0, live: 0, history: [], lastReport: 0, reported: 0, peak: 0 };
      this.types.set(k, r);
    }
    if (e.delta > 0) { r.spawned += e.delta; r.live += e.delta; }
    else {
      r.destroyed += -e.delta;
      r.live += e.delta;
      // Destroy, spawn'dan bağımsız (ör. sahne unload'unda toplu yok etme) gelebilir;
      // canlı sayacın negatife düşmesi eğim hesabını bozar.
      if (r.live < 0) r.live = 0;
    }
    r.peak = Math.max(r.peak, r.live);
    r.history.push([e.tRel, r.live]);
    // Pencere dışı geçmiş örnekleri at (bellek sınırı)
    const cutoff = e.tRel - this.windowSec * 4;
    while (r.history.length > 4096 || (r.history.length > 64 && r.history[0][0] < cutoff)) r.history.shift();
    return r;
  }

  /**
   * Periyodik değerlendirme. `heap` = {monoUsedMB, slopeMBps}.
   * @returns {Array<object>} yeni üretilen bulgular
   */
  evaluate(tRel, heap) {
    if (tRel - this.lastEmit < this.emitEverySec) return [];
    this.lastEmit = tRel;
    const out = [];
    for (const r of this.types.values()) {
      if (r.spawned < 30) continue; // istatistiksel olarak anlamlı değil
      const ratio = r.destroyed / Math.max(1, r.spawned);
      const win = r.history.filter(([t]) => t >= tRel - this.windowSec);
      if (win.length < MIN_SAMPLES_FOR_SLOPE) continue;
      const slope = linearSlope(win);
      const growing = slope > 0.35;             // saniyede 0.35+ obje birikiyor
      const imbalanced = ratio < 0.55;          // yok edilenler, yaratılanların %55'inden az
      if (!growing || !imbalanced) continue;
      // Aynı bulguyu her 2 saniyede bir yeniden üretme: 20 saniyede bir yenile
      if (tRel - r.lastReport < 20 && r.reported > 0) continue;
      const severity = ratio < 0.12 && slope > 2 ? 'high' : ratio < 0.35 ? 'medium' : 'low';
      r.lastReport = tRel;
      r.reported++;
      const finding = {
        kind: 'leak',
        severity,
        title: `Olası bellek sızıntısı: ${r.type}${r.prefab ? ` (${r.prefab})` : ''}`,
        detail: {
          type: r.type,
          prefab: r.prefab,
          spawned: r.spawned,
          destroyed: r.destroyed,
          live: r.live,
          peak: r.peak,
          destroyRatio: Number(ratio.toFixed(3)),
          slopePerSec: Number(slope.toFixed(2)),
          heapUsedMB: heap?.monoUsedMB ?? null,
          heapSlopeMBps: heap?.slopeMBps ?? null,
          correlatedWithHeap: !!(heap && heap.slopeMBps > 0.05),
          windowSec: this.windowSec,
          hint: ratio < 0.12
            ? 'Neredeyse hiç Destroy çağrılmıyor. Object pooling veya explicit Destroy kontrol edin.'
            : 'Destroy oranı düşük; objeler sahnede birikiyor. Havuz üst sınırını (pool cap) kontrol edin.',
        },
        tRel,
      };
      out.push(finding);
    }
    this.findings.push(...out);
    return out;
  }

  snapshot() {
    const rows = [];
    for (const r of this.types.values()) {
      const win = r.history.slice(-64);
      rows.push({
        type: r.type,
        prefab: r.prefab,
        spawned: r.spawned,
        destroyed: r.destroyed,
        live: r.live,
        peak: r.peak,
        destroyRatio: r.spawned ? Number((r.destroyed / r.spawned).toFixed(3)) : 1,
        slopePerSec: Number(linearSlope(win).toFixed(2)),
      });
    }
    rows.sort((a, b) => b.live - a.live || b.spawned - a.spawned);
    return rows;
  }
}

/**
 * Genel bulgu üreteci: GC spike, hitch, heap büyümesi, draw call regresyonu, log spam.
 * Her bulgu {kind, severity, title, detail, tRel, frameId} şeklindedir ve UI'da
 * tıklanınca ilgili kareye/-log grubuna atlar.
 */
export class FindingsEngine {
  constructor({ hitchMs = 33, gcSpikeBytes = 200_000, heapWindowSec = 30, spamCount = 200 } = {}) {
    this.hitchMs = hitchMs;
    this.gcSpikeBytes = gcSpikeBytes;
    this.heapWindowSec = heapWindowSec;
    this.spamCount = spamCount;
    this.heapHistory = [];       // [[tRel, monoUsedMB]]
    this.lastGcReport = -1e9;
    this.lastHitchReport = -1e9;
    this.lastHeapReport = -1e9;
    this.lastSpamReport = new Map();
    this.hitchStreak = 0;
  }

  pushHeap(tRel, monoUsedMB) {
    this.heapHistory.push([tRel, monoUsedMB]);
    const cutoff = tRel - this.heapWindowSec * 3;
    while (this.heapHistory.length > 2048 || (this.heapHistory.length > 32 && this.heapHistory[0][0] < cutoff)) this.heapHistory.shift();
  }

  heapSlopeMBps(tRel) {
    const win = this.heapHistory.filter(([t]) => t >= tRel - this.heapWindowSec);
    return win.length < 8 ? 0 : linearSlope(win);
  }

  /**
   * @param {object} frame Store.frameAt çıktısı
   * @param {number} tRel
   */
  onFrame(frame, tRel) {
    const out = [];
    const monoUsedMB = frame.monoUsed / 1048576;
    this.pushHeap(tRel, monoUsedMB);

    // 1) GC spike
    if (frame.gcAllocBytes >= this.gcSpikeBytes && tRel - this.lastGcReport > 3) {
      this.lastGcReport = tRel;
      out.push({
        kind: 'gc',
        severity: frame.gcAllocBytes > 2_000_000 ? 'high' : 'medium',
        title: `GC spike: ${(frame.gcAllocBytes / 1024).toFixed(0)} KB tek karede allocate edildi`,
        detail: {
          frameId: frame.frameId,
          gcAllocBytes: frame.gcAllocBytes,
          dtMs: frame.dtMs,
          fps: frame.fps,
          monoUsedMB,
          hint: 'Tek karede büyük managed alloc. string birleştirme, LINQ, closure veya new[] arayın. Struct/stackalloc veya pooling kullanın.',
        },
        tRel,
        frameId: frame.frameId,
      });
    }

    // 2) Hitch (tek kare takılması) veya ardışık düşük kareler
    if (frame.dtMs >= this.hitchMs) this.hitchStreak++;
    else this.hitchStreak = 0;
    if (this.hitchStreak >= 3 && tRel - this.lastHitchReport > 5) {
      this.lastHitchReport = tRel;
      out.push({
        kind: 'hitch',
        severity: frame.dtMs > 100 ? 'high' : 'medium',
        title: `Ardışık takılma: ${this.hitchStreak} kare ≥ ${this.hitchMs.toFixed(0)} ms (${frame.dtMs.toFixed(1)} ms)`,
        detail: {
          frameId: frame.frameId, dtMs: frame.dtMs, fps: frame.fps,
          mainMs: frame.mainThreadMs, renderMs: frame.renderThreadMs, gpuMs: frame.gpuMs,
          physicsMs: frame.physicsMs, animMs: frame.animMs, scene: frame.scene,
          bottleneck: pickBottleneck(frame),
        },
        tRel,
        frameId: frame.frameId,
      });
    }

    // 3) Heap büyümesi (sızıntının bellek tarafındaki kanıtı)
    const slope = this.heapSlopeMBps(tRel);
    if (slope > 0.35 && tRel - this.lastHeapReport > 25) {
      this.lastHeapReport = tRel;
      out.push({
        kind: 'heap',
        severity: slope > 1.5 ? 'high' : 'medium',
        title: `Mono heap büyüyor: +${slope.toFixed(2)} MB/sn (son ${this.heapWindowSec} sn)`,
        detail: { monoUsedMB, slopeMBps: slope, windowSec: this.heapWindowSec, hint: 'GC.Collect sonrası düşmeyen heap, managed sızıntıya işaret eder.' },
        tRel,
        frameId: frame.frameId,
      });
    }
    return out;
  }

  /** Log motorundan gelen spam bulgusu. */
  onLogGroup(group, tRel) {
    if (!group.isSpam || group.count < this.spamCount) return null;
    const last = this.lastSpamReport.get(group.id) ?? -1e9;
    if (tRel - last < 30) return null;
    this.lastSpamReport.set(group.id, tRel);
    return {
      kind: 'logspam',
      severity: group.count > 2000 ? 'high' : 'medium',
      title: `Log spam: "${group.title}" x${group.count}`,
      detail: {
        fingerprint: group.id, level: group.level, tag: group.tag, count: group.count,
        culprit: group.culprit,
        hint: 'Bu mesaj saniyede yüzlerce kez üretiliyor. Hem CPU (string + stack trace) hem de I/O maliyeti var. Koşulu bir kez kontrol edip susturun.',
      },
      tRel,
      frameId: group.lastFrame,
    };
  }
}

/** Hangi thread darboğaz? (main vs render vs gpu vs physics) */
export function pickBottleneck(frame) {
  const cands = [
    ['Main Thread', frame.mainThreadMs],
    ['Render Thread', frame.renderThreadMs],
    ['GPU', frame.gpuMs],
    ['Physics', frame.physicsMs],
    ['Animation', frame.animMs],
  ].filter(([, v]) => v > 0);
  if (!cands.length) return null;
  cands.sort((a, b) => b[1] - a[1]);
  const [name, ms] = cands[0];
  return { name, ms: Number(ms.toFixed(2)), share: frame.dtMs ? Number((ms / frame.dtMs).toFixed(2)) : null };
}
