/**
 * Orta/Üst Panel — Zaman Serisi Grafikleri (TradingView Lightweight Charts v5)
 *
 * Performans kararları:
 *  • Veri Zustand'a DEĞİL, düz bir diziye (FrameSink) akar. Grafikler bu diziyi
 *    ~120 ms'de bir okur ve yalnızca YENİ noktaları `series.update()` ile ekler
 *    (append-only). Her tick'te tüm seriyi `setData()` ile yeniden vermek
 *    60 fps'te O(n) kopyalama + tam yeniden çizim demektir — Unity Profiler'ın
 *    kendisi de tam olarak bu yüzden hantallaşır.
 *  • 5 grafik tek bir zaman aralığını paylaşır (senkron kaydırma/zoom) ve
 *    crosshair birbirine bağlıdır.
 *  • Frame-time histogramı kare başına RENKLENDİRİLİR: bütçe içinde yeşil,
 *    aşınca amber, 2x bütçede kırmızı. Takılmalar grafikte anında görünür.
 *  • 1% / 0.1% Low serileri saniyede bir hesaplanır (kare başına değil).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, createSeriesMarkers,
  AreaSeries, LineSeries, HistogramSeries,
  CrosshairMode, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { useStore } from '../lib/store';
import { sink, type Frame } from '../lib/sink';
import { MB, fmtNum, fmtBytes, fmtInt } from '../lib/format';

const COLORS = {
  dtOk: '#2fbf7f',
  dtWarn: '#e8a33d',
  dtBad: '#ef4d5f',
  fps: '#4ea1ff',
  p01: '#ffb547',
  p001: '#ff5c6c',
  mono: '#7c5cff',
  res: '#3ddc97',
  gfx: '#ff8ac2',
  heap: '#5b6b86',
  gc: '#4ea1ff',
  dc: '#3ddc97',
  sp: '#ffb547',
  main: '#c0c8d6',
  render: '#8f7bff',
  gpu: '#ff8ac2',
};

const MAX_POINTS = 40_000;  // grafik başına tutulacak en fazla nokta (aşılırsa kompaktlama)
const LIVE_WINDOW = 900;    // canlı modda görünür nokta sayısı (~15 sn @60fps)
const TICK_MS = 120;        // grafik tazeleme ritmi

type Point = { time: UTCTimestamp; value: number; color?: string };

type Series = {
  s: ISeriesApi<any>;
  data: Point[];
  added: number;          // sink.frames üzerinden kaç kare işlendi
  pick: (f: Frame) => number | null;
  color?: (f: Frame) => string | undefined;
};

export default function ChartsPanel() {
  const theme = useStore((s) => s.theme);
  const selectFrame = useStore((s) => s.selectFrame);
  const selectedFrameId = useStore((s) => s.selectedFrameId);
  const events = useStore((s) => s.events);
  const targetFps = useStore((s) => s.session?.targetFps ?? 60);
  const snapshot = useStore((s) => s.snapshot);

  const elFrame = useRef<HTMLDivElement | null>(null);
  const elFps = useRef<HTMLDivElement | null>(null);
  const elMem = useRef<HTMLDivElement | null>(null);
  const elGc = useRef<HTMLDivElement | null>(null);
  const elDc = useRef<HTMLDivElement | null>(null);

  const [hover, setHover] = useState<Partial<Frame> | null>(null);
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 0, to: 1 });
  const [follow, setFollow] = useState(true);

  const R = useRef<any>({});
  const followRef = useRef(follow); followRef.current = follow;
  const selRef = useRef<number | null>(selectedFrameId); selRef.current = selectedFrameId;

  useEffect(() => {
    const palette = theme === 'light'
      ? { text: '#384356', grid: 'rgba(0,0,0,.06)', border: '#d6deea' }
      : { text: '#7d8797', grid: 'rgba(255,255,255,.05)', border: '#212a3a' };

    const charts: IChartApi[] = [];
    const mk = (el: HTMLElement | null): IChartApi | null => {
      if (!el) return null;
      const c = createChart(el, {
        layout: { background: { color: 'transparent' as any }, textColor: palette.text, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#4ea1ff', width: 1, style: 2, labelBackgroundColor: '#4ea1ff' },
          horzLine: { color: '#4ea1ff', width: 1, style: 2, labelBackgroundColor: '#4ea1ff' },
        },
        rightPriceScale: { borderColor: palette.border, scaleMargins: { top: 0.14, bottom: 0.08 } },
        timeScale: {
          borderColor: palette.border, rightOffset: 3, barSpacing: 6,
          timeVisible: true, secondsVisible: true, lockVisibleTimeRangeOnResize: true,
          tickMarkFormatter: (time: Time) => {
            const s = Number(time);
            const m = Math.floor(s / 60);
            return `${String(m).padStart(2, '0')}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`;
          },
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false } },
        width: el.clientWidth, height: el.clientHeight,
      } as any);
      charts.push(c);
      return c;
    };

    const cFrame = mk(elFrame.current), cFps = mk(elFps.current), cMem = mk(elMem.current), cGc = mk(elGc.current), cDc = mk(elDc.current);
    if (!cFrame || !cFps || !cMem || !cGc || !cDc) return;
    const all = [cFrame, cFps, cMem, cGc, cDc];
    const budget = 1000 / targetFps;

    /* ------------------------------- seriler ------------------------------- */
    const reg: Series[] = [];
    const add = (chart: IChartApi, type: any, opts: any, pick: (f: Frame) => number | null, color?: (f: Frame) => string | undefined): ISeriesApi<any> => {
      const s = chart.addSeries(type, opts);
      reg.push({ s, data: [], added: 0, pick, color });
      return s;
    };

    const dtColor = (f: Frame) => (f.dt <= budget * 1.15 ? COLORS.dtOk : f.dt <= budget * 2 ? COLORS.dtWarn : COLORS.dtBad);
    const gcColor = (f: Frame) => (f.gc > 400_000 ? COLORS.dtBad : f.gc > 40_000 ? COLORS.dtWarn : COLORS.gc);

    const sDt = add(cFrame, HistogramSeries, { priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(2)} ms`, minMove: 0.01 }, priceLineVisible: false }, (f) => Number(f.dt.toFixed(3)), dtColor);
    add(cFrame, LineSeries, { color: COLORS.main, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, (f) => (f.main ? Number(f.main.toFixed(3)) : null));
    add(cFrame, LineSeries, { color: COLORS.render, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, (f) => (f.rend ? Number(f.rend.toFixed(3)) : null));
    add(cFrame, LineSeries, { color: COLORS.gpu, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, (f) => (f.gpu ? Number(f.gpu.toFixed(3)) : null));
    sDt.createPriceLine({ price: budget, color: COLORS.dtOk, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${targetFps}fps bütçe` });

    const sFps = add(cFps, LineSeries, { color: COLORS.fps, lineWidth: 2, priceFormat: { type: 'custom', formatter: (v: number) => v.toFixed(0), minMove: 0.1 }, priceLineVisible: false }, (f) => Number(f.fps.toFixed(2)));
    sFps.createPriceLine({ price: targetFps, color: COLORS.dtOk, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'hedef' });
    const sP01 = cFps.addSeries(LineSeries, { color: COLORS.p01, lineWidth: 1, lineStyle: 2, priceLineVisible: false, title: '1% low' });
    const sP001 = cFps.addSeries(LineSeries, { color: COLORS.p001, lineWidth: 1, lineStyle: 2, priceLineVisible: false, title: '0.1% low' });

    add(cMem, AreaSeries, { lineColor: COLORS.mono, topColor: 'rgba(124,92,255,.40)', bottomColor: 'rgba(124,92,255,.03)', lineWidth: 2, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(0)} MB`, minMove: 0.1 }, priceLineVisible: false }, (f) => (f.mono ? Number((f.mono / MB).toFixed(3)) : null));
    add(cMem, LineSeries, { color: COLORS.heap, lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false }, (f) => (f.heap ? Number((f.heap / MB).toFixed(3)) : null));
    add(cMem, LineSeries, { color: COLORS.res, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, (f) => (f.res ? Number((f.res / MB).toFixed(3)) : null));
    add(cMem, LineSeries, { color: COLORS.gfx, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, (f) => (f.gfx ? Number((f.gfx / MB).toFixed(3)) : null));

    add(cGc, HistogramSeries, { color: COLORS.gc, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(0)} KB`, minMove: 0.1 }, priceLineVisible: false }, (f) => Number((f.gc / 1024).toFixed(2)), gcColor);

    add(cDc, LineSeries, { color: COLORS.dc, lineWidth: 2, priceLineVisible: false }, (f) => (f.dc || null));
    add(cDc, LineSeries, { color: COLORS.sp, lineWidth: 1, priceLineVisible: false }, (f) => (f.sp || null));

    const dtMarkers = createSeriesMarkers(sDt, []);
    const gcMarkers = createSeriesMarkers(reg[reg.length - 3].s, []);

    R.current = { reg, all, dtMarkers, gcMarkers, lowBuckets: new Map<number, number[]>(), lowData01: [] as Point[], lowData001: [] as Point[], firstT: null as number | null };

    /* --------------------- senkron kaydırma / crosshair --------------------- */
    let syncing = false;
    const syncRange = (src: IChartApi) => {
      if (syncing) return;
      syncing = true;
      const lr = src.timeScale().getVisibleLogicalRange();
      for (const c of all) if (c !== src && lr) c.timeScale().setVisibleLogicalRange(lr);
      const tr = src.timeScale().getVisibleRange();
      if (tr) setRange({ from: Number(tr.from), to: Number(tr.to) });
      syncing = false;
      setFollow(false);
    };
    for (const c of all) c.timeScale().subscribeVisibleLogicalRangeChange(() => syncRange(c));

    const hoverSync = (src: IChartApi, param: any) => {
      const time = param?.time;
      if (!syncing) {
        syncing = true;
        for (const c of all) {
          if (c === src) continue;
          if (time == null) c.clearCrosshairPosition();
          else { try { c.setCrosshairPosition(undefined as any, time as any, R.current.reg[0].s as any); } catch { /* yoksay */ } }
        }
        syncing = false;
      }
      if (time != null) setHover(sink.nearestByTime(Number(time)));
      else setHover(null);
    };
    for (const c of all) c.subscribeCrosshairMove((p: any) => hoverSync(c, p));
    const onClick = (param: any) => {
      if (param?.time == null) return;
      const f = sink.nearestByTime(Number(param.time));
      if (f) selectFrame(f.frameId);
    };
    for (const c of all) c.subscribeClick(onClick as any);

    /* --------------------------- yeniden boyutlama -------------------------- */
    const els = [elFrame.current, elFps.current, elMem.current, elGc.current, elDc.current];
    const ro = new ResizeObserver(() => {
      for (let i = 0; i < all.length; i++) {
        const el = els[i];
        if (el) all[i].applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    });
    for (const el of els) if (el) ro.observe(el);

    /* --------------------------- veri ekleme döngüsü ------------------------- */
    /** Serileri tam yeniden kur (ilk yükleme, geçmiş enjeksiyonu, kompaktlama). */
    const rebuild = () => {
      const frames = sink.frames;
      for (const r of R.current.reg) {
        r.data = [];
        for (const f of frames) {
          const v = r.pick(f);
          if (v == null) continue;
          r.data.push({ time: f.t as UTCTimestamp, value: v, color: r.color?.(f) });
        }
        r.added = frames.length;
        r.s.setData(r.data as any);
      }
      // 1% / 0.1% low serileri de zaman eksenine yeniden hizalanır
      R.current.lowData01 = [];
      R.current.lowData001 = [];
      R.current.lowBuckets = new Map();
      sP01.setData([]);
      sP001.setData([]);
      R.current.lowRebuiltAt = frames.length;
      R.current.firstT = frames[0]?.t ?? null;
    };

    const flush = () => {
      const frames = sink.frames;
      const total = frames.length;
      const r0 = R.current.reg[0];
      /**
       * Yeniden kurma kararı: hafif kontroller yerine KONUMSAL doğrulama.
       * Serilere eklenmiş son nokta, sink'teki aynı indeksli kareyle hâlâ
       * örtüşmüyorsa (oturum sıfırlandı, ajan yeniden bağlandı, geçmiş başa
       * eklendi, ring buffer taştı) zaman ekseni geri gitmiş demektir ve
       * append-only `update()` "Cannot update oldest data" hatası verir.
       */
      const lastAdded = r0.data.length ? r0.data[r0.data.length - 1] : null;
      const ref = r0.added > 0 && r0.added <= total ? frames[r0.added - 1] : null;
      const drift = !!lastAdded && !!ref && Math.abs(Number(lastAdded.time) - ref.t) > 1e-6;
      const needRebuild = total < r0.added
        || (R.current.firstT != null && frames[0] && frames[0].t !== R.current.firstT)
        || drift;
      if (needRebuild || total === 0) {
        if (total === 0) {
          for (const r of R.current.reg) { r.data = []; r.added = 0; r.s.setData([]); }
          R.current.firstT = null;
          R.current.lowData01 = []; R.current.lowData001 = [];
          R.current.lowBuckets = new Map();
          sP01.setData([]); sP001.setData([]);
        } else rebuild();
      } else {
        // APPEND-ONLY: yalnızca yeni kareler için series.update()
        for (const r of R.current.reg) {
          for (let i = r.added; i < total; i++) {
            const f = frames[i];
            const v = r.pick(f);
            if (v == null) continue;
            const p: Point = { time: f.t as UTCTimestamp, value: v };
            const c = r.color?.(f);
            if (c) p.color = c;
            r.data.push(p);
            r.s.update(p as any);
          }
          r.added = total;
          if (r.data.length > MAX_POINTS) {
            r.data.splice(0, r.data.length - MAX_POINTS);
            r.s.setData(r.data as any);
          }
        }
        // 1% / 0.1% low: saniyelik kovalar (yalnızca yeni eklenen karelerden)
        const buckets: Map<number, number[]> = R.current.lowBuckets;
        const scanFrom = Math.max(R.current.lowRebuiltAt ?? 0, total - 600);
        R.current.lowRebuiltAt = total;
        for (let i = scanFrom; i < total; i++) {
          const f = frames[i];
          const b = Math.floor(f.t);
          const arr = buckets.get(b);
          if (arr) arr.push(f.fps); else buckets.set(b, [f.fps]);
        }
        if (buckets.size > 3) {
          const keys = [...buckets.keys()].sort((a, b) => a - b);
          for (const k of keys.slice(0, keys.length - 1)) {
            const vals = buckets.get(k)!;
            buckets.delete(k);
            if (vals.length < 3) continue;
            const sorted = vals.slice().sort((a, b) => a - b);
            const n01 = Math.max(1, Math.floor(sorted.length * 0.01));
            const n001 = Math.max(1, Math.floor(sorted.length * 0.001));
            const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
            const p1: Point = { time: k as UTCTimestamp, value: Number(avg(sorted.slice(0, n01)).toFixed(2)) };
            const p2: Point = { time: k as UTCTimestamp, value: Number(avg(sorted.slice(0, n001)).toFixed(2)) };
            const prev1 = R.current.lowData01[R.current.lowData01.length - 1];
            R.current.lowData01.push(p1); R.current.lowData001.push(p2);
            if (prev1 && Number(p1.time) < Number(prev1.time)) {
              sP01.setData(R.current.lowData01 as any);
              sP001.setData(R.current.lowData001 as any);
            } else {
              sP01.update(p1 as any); sP001.update(p2 as any);
            }
            if (R.current.lowData01.length > 4000) {
              R.current.lowData01.splice(0, R.current.lowData01.length - 4000);
              R.current.lowData001.splice(0, R.current.lowData001.length - 4000);
              sP01.setData(R.current.lowData01 as any);
              sP001.setData(R.current.lowData001 as any);
            }
          }
        }
      }

      if (followRef.current && total) {
        const lr = { from: Math.max(0, total - LIVE_WINDOW), to: total + 3 };
        for (const c of all) c.timeScale().setVisibleLogicalRange(lr as any);
        const first = frames[Math.max(0, total - LIVE_WINDOW)];
        const last = frames[total - 1];
        if (first && last) setRange({ from: first.t, to: last.t });
      }
    };
    rebuild();
    const timer = setInterval(flush, TICK_MS);

    /* ------------------------------ olay işaretleri -------------------------- */
    const evTimer = setInterval(() => {
      const lastT = sink.frames.length ? sink.frames[sink.frames.length - 1].t : 0;
      const fromT = Math.max(0, lastT - 300);
      const evs = useStore.getState().events.filter((e) => e.tRel >= fromT && (e.kind === 'bad' || e.kind === 'scene')).slice(-80)
        .map((e) => ({
          time: e.tRel as UTCTimestamp,
          position: 'aboveBar' as const,
          color: e.kind === 'scene' ? '#7c5cff' : COLORS.dtBad,
          shape: (e.kind === 'scene' ? 'square' : 'circle') as any,
          text: e.name,
        }));
      const gcs = sink.frames.filter((f) => f.t >= fromT && f.gc > 500_000).slice(-50)
        .map((f) => ({ time: f.t as UTCTimestamp, position: 'aboveBar' as const, color: COLORS.p01, shape: 'arrowDown' as const, text: 'GC' }));
      R.current.dtMarkers.setMarkers(evs);
      R.current.gcMarkers.setMarkers(gcs);
    }, 500);

    return () => {
      clearInterval(timer); clearInterval(evTimer); ro.disconnect();
      for (const c of charts) { try { c.remove(); } catch { /* yoksay */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, targetFps]);

  const live = sink.last();
  const shown: any = hover ?? live ?? {};
  const low = snapshot?.low;

  return (
    <div className="panel charts">
      <div className="panel-head">
        <span className="panel-title">Zaman Serisi</span>
        <span className="badge">{fmtInt(sink.length)} kare</span>
        <span className="badge">{hover ? `kare ${hover.frameId}` : 'canlı'}</span>
        <div className="spacer" />
        <span className="hint mono" style={{ fontSize: 10 }}>tıkla → kareyi incele · tekerlek → zoom · sürükle → kaydır</span>
        <button className={`btn sm ${follow ? 'on' : ''}`} onClick={() => setFollow((f) => !f)} title="Canlı takibi aç/kapat">
          {follow ? '● CANLI' : '○ DURAK'}
        </button>
      </div>
      <div className="charts-body">
        <div className="chart-box" style={{ flex: 1.3 }}>
          <div className="chart-label">Frame Time (ms)</div>
          <div className="chart-legend">
            <Legend c={COLORS.main} k="main" v={shown.main != null ? fmtNum(shown.main, 2) : '—'} />
            <Legend c={COLORS.render} k="render" v={shown.rend != null ? fmtNum(shown.rend, 2) : '—'} />
            <Legend c={COLORS.gpu} k="gpu" v={shown.gpu != null ? fmtNum(shown.gpu, 2) : '—'} />
            <Legend c={COLORS.dtWarn} k="dt" v={shown.dt != null ? fmtNum(shown.dt, 2) : '—'} />
          </div>
          <div className="chart-canvas" ref={elFrame} />
        </div>
        <div className="chart-box">
          <div className="chart-label">FPS · 1% / 0.1% Low</div>
          <div className="chart-legend">
            <Legend c={COLORS.fps} k="fps" v={shown.fps != null ? fmtNum(shown.fps, 1) : '—'} />
            <Legend c={COLORS.p01} k="1% low" v={low ? fmtNum(low.p01, 1) : '—'} />
            <Legend c={COLORS.p001} k="0.1% low" v={low ? fmtNum(low.p001, 1) : '—'} />
          </div>
          <div className="chart-canvas" ref={elFps} />
        </div>
        <div className="chart-box">
          <div className="chart-label">Bellek (MB)</div>
          <div className="chart-legend">
            <Legend c={COLORS.mono} k="mono used" v={fmtBytes(shown.mono ?? 0, 1)} />
            <Legend c={COLORS.heap} k="heap" v={fmtBytes(shown.heap ?? 0, 0)} />
            <Legend c={COLORS.res} k="reserved" v={fmtBytes(shown.res ?? 0, 0)} />
            <Legend c={COLORS.gfx} k="gfx" v={fmtBytes(shown.gfx ?? 0, 0)} />
          </div>
          <div className="chart-canvas" ref={elMem} />
        </div>
        <div className="chart-box" style={{ flex: 0.85 }}>
          <div className="chart-label">GC Alloc (KB / kare)</div>
          <div className="chart-legend"><Legend c={COLORS.gc} k="bu kare" v={fmtBytes(shown.gc ?? 0, 1)} /></div>
          <div className="chart-canvas" ref={elGc} />
        </div>
        <div className="chart-box" style={{ flex: 0.85 }}>
          <div className="chart-label">Draw Calls / SetPass</div>
          <div className="chart-legend">
            <Legend c={COLORS.dc} k="draw calls" v={fmtInt(shown.dc ?? 0)} />
            <Legend c={COLORS.sp} k="setpass" v={fmtInt(shown.sp ?? 0)} />
          </div>
          <div className="chart-canvas" ref={elDc} />
        </div>
        <EventStrip range={range} events={events} onSelectFrame={selectFrame} selectedFrameId={selectedFrameId} />
      </div>
    </div>
  );
}

function Legend({ c, k, v }: { c: string; k: string; v: string }) {
  return <span className="legend-item"><i style={{ background: c }} />{k} <b>{v}</b></span>;
}

/**
 * Özel Telemetri Zaman Çizelgesi: grafiklerin hemen altında, aynı zaman
 * ekseniyle hizalı olay şeridi. "Oyuncu öldüğü anda FPS neden düştü?"
 * sorusunun cevabı burada tek bakışta görünür.
 */
function EventStrip({ range, events, onSelectFrame, selectedFrameId }: {
  range: { from: number; to: number };
  events: Array<{ tRel: number; frame: number; name: string; kind: string; payload: Record<string, unknown> }>;
  onSelectFrame: (id: number) => void;
  selectedFrameId: number | null;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; e: any } | null>(null);
  const span = Math.max(0.001, range.to - range.from);
  const lanes = useMemo(() => {
    const names = new Map<string, number>();
    for (const e of events) {
      if (e.tRel < range.from || e.tRel > range.to) continue;
      if (!names.has(e.name)) names.set(e.name, names.size % 4);
    }
    return names;
  }, [events, range.from, range.to]);
  const visible = useMemo(
    () => events.filter((e) => e.tRel >= range.from - 0.5 && e.tRel <= range.to + 0.5).slice(-500),
    [events, range.from, range.to],
  );
  const selFrame = selectedFrameId != null ? events.find((e) => e.frame === selectedFrameId) : null;
  const colorOf = (kind: string) => (kind === 'bad' ? 'var(--bad)' : kind === 'good' ? 'var(--ok)' : kind === 'scene' ? 'var(--accent-2)' : 'var(--accent)');

  return (
    <div className="event-strip" onMouseLeave={() => setTip(null)}>
      {[0, 1, 2, 3].map((i) => <div key={i} className="lane" style={{ top: 10 + i * 10 }} />)}
      <div style={{ position: 'absolute', left: 6, top: 1, fontSize: 9, letterSpacing: '.08em', color: 'var(--fg-3)', textTransform: 'uppercase', fontWeight: 700 }}>
        Özel Olaylar — OmniProfiler.TrackEvent()
      </div>
      {visible.map((e, i) => {
        const x = ((e.tRel - range.from) / span) * 100;
        const lane = lanes.get(e.name) ?? 0;
        return (
          <div
            key={`${e.frame}-${e.name}-${i}`}
            className="ev"
            style={{ left: `${x}%`, top: 8 + lane * 10, height: 9, background: colorOf(e.kind) }}
            onMouseEnter={(ev) => setTip({ x: ev.clientX, y: ev.clientY, e })}
            onMouseMove={(ev) => setTip({ x: ev.clientX, y: ev.clientY, e })}
            onClick={() => onSelectFrame(e.frame)}
          />
        );
      })}
      {selFrame ? (
        <div className="ev-label" style={{ left: 6, bottom: 3 }}>
          seçili: {selFrame.name} @ kare {selFrame.frame}
        </div>
      ) : (
        <div className="ev-label" style={{ left: 6, bottom: 3 }}>{visible.length} olay · t+{range.from.toFixed(1)}s → t+{range.to.toFixed(1)}s</div>
      )}
      {tip ? (
        <div className="tooltip" style={{ left: Math.min((typeof window !== 'undefined' ? window.innerWidth : 1200) - 330, tip.x + 12), top: tip.y - 10 }}>
          <div style={{ fontWeight: 700 }}>{tip.e.name}</div>
          <div>kare {tip.e.frame} · t+{Number(tip.e.tRel).toFixed(2)}s · {tip.e.kind}</div>
          {Object.entries(tip.e.payload ?? {}).slice(0, 6).map(([k, v]) => (
            <div key={k}>{k}: <b>{String(v)}</b></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
