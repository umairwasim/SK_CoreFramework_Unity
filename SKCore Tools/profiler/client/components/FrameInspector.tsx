/**
 * Alt Panel — Frame Inspector
 *
 * Grafikten seçilen TEK karenin derinlemesine incelenmesi:
 *   • tüm metrikler + darboğaz tespiti (main / render / gpu / physics)
 *   • o karenin alev grafiği (varsa)
 *   • o karede üretilen loglar (bağlam enjeksiyonuyla)
 *   • o kareye denk gelen özel olaylar
 *   • A/B karşılaştırma için pinleme (A / B slotları)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest as api } from '../lib/transport';
import { useStore } from '../lib/store';
import { sink } from '../lib/sink';
import FlameGraph, { type SampleNode } from './FlameGraph';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtUs, dtColor, LEVEL_COLOR, LEVEL_LABEL, tagColor } from '../lib/format';

type Detail = {
  frame: any;
  samples: { flat: SampleNode[]; totalUs: number } | null;
  logs: any[];
  events: any[];
};

export default function FrameInspector() {
  const frameId = useStore((s) => s.selectedFrameId);
  const selectFrame = useStore((s) => s.selectFrame);
  const pinCompare = useStore((s) => s.pinCompare);
  const compareA = useStore((s) => s.compareA);
  const compareB = useStore((s) => s.compareB);
  const setTab = useStore((s) => s.setTab);
  const targetFps = useStore((s) => s.session?.targetFps ?? 60);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: number) => {
    setLoading(true); setErr(null);
    try {
      const d = await api<Detail>(`/frame?id=${id}`);
      setDetail(d);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setDetail(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (frameId != null) load(frameId); }, [frameId, load]);

  // örneklem verisi kare geldikten SONRA ulaşabilir; kısa bir yoklama ile tazele
  useEffect(() => {
    if (frameId == null || detail?.samples) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 6) return clearInterval(t);
      load(frameId);
    }, 700);
    return () => clearInterval(t);
  }, [frameId, detail?.samples, load]);

  const jump = useCallback((delta: number) => {
    if (frameId == null) return;
    const i = sink.indexOfFrameId(frameId);
    if (i < 0) return;
    const j = Math.max(0, Math.min(sink.length - 1, i + delta));
    selectFrame(sink.frames[j].frameId);
  }, [frameId, selectFrame]);

  const jumpToCondition = useCallback((pred: (f: any) => boolean, dir: 1 | -1) => {
    if (frameId == null) return;
    const i = sink.indexOfFrameId(frameId);
    if (i < 0) return;
    for (let k = i + dir; k >= 0 && k < sink.length; k += dir) {
      if (pred(sink.frames[k])) return selectFrame(sink.frames[k].frameId);
    }
  }, [frameId, selectFrame]);

  const f = detail?.frame ?? (frameId != null ? sink.byFrameId(frameId) : null);

  const rows = useMemo(() => {
    if (!f) return [] as Array<[string, string, string?]>;
    return [
      ['Kare', `#${fmtInt(f.frameId)}`, undefined],
      ['Frame Time', fmtMs(f.dtMs ?? f.dt), dtColor(f.dtMs ?? f.dt ?? 0, targetFps)],
      ['FPS', fmtNum(f.fps, 1), dtColor(f.dtMs ?? f.dt ?? 0, targetFps)],
      ['Main Thread', fmtMs(f.mainThreadMs ?? f.main), undefined],
      ['Render Thread', fmtMs(f.renderThreadMs ?? f.rend), undefined],
      ['GPU (wait)', fmtMs(f.gpuMs ?? f.gpu), undefined],
      ['Physics', fmtMs(f.physicsMs ?? f.phys), undefined],
      ['Animation', fmtMs(f.animMs ?? f.anim), undefined],
      ['GC Alloc', fmtBytes(f.gcAllocBytes ?? f.gc), (f.gcAllocBytes ?? f.gc ?? 0) > 200_000 ? 'var(--bad)' : undefined],
      ['Mono Used', fmtBytes(f.monoUsed ?? f.mono), undefined],
      ['Mono Heap', fmtBytes(f.monoHeap ?? f.heap), undefined],
      ['Total Reserved', fmtBytes(f.totalReserved ?? f.res), undefined],
      ['Gfx Driver', fmtBytes(f.gfxDriver ?? f.gfx), undefined],
      ['Draw Calls', fmtInt(f.drawCalls ?? f.dc), undefined],
      ['Batches', fmtInt(f.batches), undefined],
      ['SetPass Calls', fmtInt(f.setPassCalls ?? f.sp), (f.setPassCalls ?? f.sp ?? 0) > 120 ? 'var(--warn)' : undefined],
      ['Triangles', fmtInt(f.triangles ?? f.tri), undefined],
      ['Vertices', fmtInt(f.vertices ?? f.vert), undefined],
      ['Scene', String(f.scene ?? '—'), undefined],
      ['Samples', f.hasSamples || detail?.samples ? `present (${fmtUs(detail?.samples?.totalUs ?? 0)})` : 'none', undefined],
    ];
  }, [f, detail?.samples, targetFps]);

  if (frameId == null) {
    return <div className="empty">Click a frame in the chart or use the “go to frame” link in the log entries.</div>;
  }

  return (
    <div className="inspector">
      <div className="insp-col">
        <div className="card">
          <h4>Frame #{fmtInt(frameId)} {loading ? <span className="badge">loading…</span> : null}</h4>
          {err ? <div className="hint" style={{ color: 'var(--bad)' }}>{err}</div> : null}
          {f?.bottleneck ? (
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="badge bad">BOTTLENECK: {f.bottleneck.name}</span>
              <span className="hint mono">{fmtMs(f.bottleneck.ms)} · {Math.round((f.bottleneck.share ?? 0) * 100)}% of frame</span>
            </div>
          ) : null}
          <dl className="kv">
            {rows.map(([k, v, c]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd style={c ? { color: c } : undefined}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
          <div className="row tight" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => jump(-1)}>← prev</button>
            <button className="btn sm" onClick={() => jump(1)}>next →</button>
            <button className="btn sm" onClick={() => jumpToCondition((x) => x.dt >= 33, -1)}>← hitch</button>
            <button className="btn sm" onClick={() => jumpToCondition((x) => x.dt >= 33, 1)}>hitch →</button>
            <button className="btn sm" onClick={() => jumpToCondition((x) => x.gc >= 200_000, 1)}>GC spike →</button>
            <div className="spacer" />
            <button className={`btn sm ${compareA === frameId ? 'on' : ''}`} onClick={() => { pinCompare('a', frameId); setTab('compare'); }} title="Pin this frame to slot A">Pin as A</button>
            <button className={`btn sm ${compareB === frameId ? 'on' : ''}`} onClick={() => { pinCompare('b', frameId); setTab('compare'); }} title="Pin this frame to slot B">Pin as B</button>
            <button className="btn sm ghost" onClick={() => load(frameId)}>↻</button>
          </div>
          {(compareA != null || compareB != null) ? (
            <div className="hint" style={{ marginTop: 5 }}>
              A/B: <b className="mono">{compareA ?? '—'}</b> ↔ <b className="mono">{compareB ?? '—'}</b>
              {compareA != null && compareB != null ? <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setTab('compare')}>Open Comparison</button> : null}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h4>Logs In This Frame ({detail?.logs?.length ?? 0})</h4>
          {!detail?.logs?.length ? <div className="hint">No logs in this frame.</div> : (
            <div className="scroll-y" style={{ maxHeight: 120 }}>
              {detail.logs.map((l, i) => (
                <div key={i} className="row" style={{ gap: 6, padding: '2px 0', alignItems: 'flex-start' }}>
                  <span className="log-level" style={{ color: LEVEL_COLOR[l.level], background: 'var(--bg-3)' }}>{LEVEL_LABEL[l.level]}</span>
                  {l.tag ? <span className="tag-pill" style={{ color: tagColor(l.tag) }}>{l.tag}</span> : null}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h4>Events In This Frame ({detail?.events?.length ?? 0})</h4>
          {!detail?.events?.length ? <div className="hint">No custom events.</div> : (
            <div className="row">
              {detail.events.map((e, i) => (
                <span key={i} className={`badge ${e.kind === 'bad' ? 'bad' : e.kind === 'good' ? 'ok' : ''}`}>
                  {e.name} {Object.entries(e.payload ?? {}).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="insp-col">
        <FlameGraph flat={detail?.samples?.flat ?? []} totalUs={detail?.samples?.totalUs} title="Frame Timeline (Flame Graph)" height={190} />
      </div>
    </div>
  );
}
