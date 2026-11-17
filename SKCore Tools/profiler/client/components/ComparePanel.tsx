/**
 * A/B Kare Karşılaştırması
 *
 * Kullanım: Frame Inspector'da bir kareyi "A olarak pinle", sonra kötü kareyi
 * "B olarak pinle". Bu panel iki kare arasındaki tüm metrik farklarını,
 * hangi yönde değiştiklerini (iyi/kötü) ve örneklem ağaçları arasındaki
 * fonksiyon bazlı maliyet farkını yan yana gösterir.
 *
 * "Aynı kareyi iki kez görselleştirmek" yerine "farkı sayısallaştırmak"
 * regresyon avının en hızlı yoludur.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest as api } from '../lib/transport';
import { useStore } from '../lib/store';
import { sink } from '../lib/sink';
import { fmtInt, fmtNum, fmtPct, fmtUs } from '../lib/format';

type CompareResult = {
  a: any; b: any;
  rows: Array<{ key: string; label: string; unit: string; digits: number; a: number; b: number; delta: number; pct: number; verdict: 'better' | 'worse' | 'same' }>;
  samples: Array<{ name: string; aSelfUs: number; bSelfUs: number; aCalls: number; bCalls: number; deltaUs: number; pct: number; onlyIn: 'A' | 'B' | null }>;
  logsA: number; logsB: number;
};

export default function ComparePanel() {
  const a = useStore((s) => s.compareA);
  const b = useStore((s) => s.compareB);
  const pin = useStore((s) => s.pinCompare);
  const selectFrame = useStore((s) => s.selectFrame);
  const setTab = useStore((s) => s.setTab);
  const [res, setRes] = useState<CompareResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (a == null || b == null) { setRes(null); return; }
    let cancelled = false;
    setBusy(true);
    api<CompareResult>(`/compare?a=${a}&b=${b}`)
      .then((r) => { if (!cancelled) { setRes(r); setErr(null); } })
      .catch((e) => { if (!cancelled) setErr(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [a, b]);

  // "En kötü kareyi B yap" kısayolu: ring buffer'daki en yavaş kare
  const worst = useMemo(() => {
    let best: any = null;
    const frames = sink.frames;
    for (let i = frames.length - 1; i >= 0 && i > frames.length - 6000; i--) {
      if (!best || frames[i].dt > best.dt) best = frames[i];
    }
    return best;
  }, [sink.length]);

  const worstGc = useMemo(() => {
    let best: any = null;
    const frames = sink.frames;
    for (let i = frames.length - 1; i >= 0 && i > frames.length - 6000; i--) {
      if (!best || frames[i].gc > best.gc) best = frames[i];
    }
    return best;
  }, [sink.length]);

  if (a == null || b == null) {
    return (
      <div className="inspector" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="card">
          <h4>A / B Frame Comparison</h4>
          <div className="hint" style={{ marginBottom: 8 }}>
            Select two frames: <b>A</b> reference (typically a normal frame), <b>B</b> anomalous frame. Use the
            “Pin as A” / “Pin as B” buttons in Frame Inspector or the quick shortcuts below.
          </div>
          <div className="row">
            <span className="badge">A: {a ?? '—'}</span>
            <span className="badge">B: {b ?? '—'}</span>
            <div className="spacer" />
            {worst ? <button className="btn sm" onClick={() => { pin('a', worst.frameId); pin('b', worst.frameId); }}>Use slowest frame ({fmtNum(worst.dt, 1)} ms)</button> : null}
            {worstGc && worst ? <button className="btn sm" onClick={() => { pin('a', worst.frameId); pin('b', worstGc.frameId); }}>Normal ↔ Highest GC spike</button> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="insp-col">
        <div className="card">
          <div className="row tight">
            <h4 style={{ margin: 0 }}>Metric Differences</h4>
            {busy ? <span className="badge">computing…</span> : null}
            <div className="spacer" />
            <button className="btn sm" onClick={() => selectFrame(a)}>Go to A ({a})</button>
            <button className="btn sm" onClick={() => selectFrame(b)}>Go to B ({b})</button>
            <button className="btn sm ghost" onClick={() => { pin('a', null); pin('b', null); }}>clear</button>
          </div>
          {err ? <div className="hint" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</div> : null}
          {res ? (
            <table className="grid" style={{ marginTop: 6 }}>
              <thead>
                <tr><th>Metric</th><th>A #{res.a.frameId}</th><th>B #{res.b.frameId}</th><th>Δ</th><th>%</th><th></th></tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="name">{r.label}{r.unit ? <span style={{ color: 'var(--fg-3)' }}> ({r.unit})</span> : null}</td>
                    <td>{fmtNum(r.a, r.digits)}</td>
                    <td style={{ color: r.verdict === 'worse' ? 'var(--bad)' : r.verdict === 'better' ? 'var(--ok)' : undefined }}>{fmtNum(r.b, r.digits)}</td>
                    <td>{r.delta >= 0 ? '+' : ''}{fmtNum(r.delta, r.digits)}</td>
                    <td>{fmtPct(r.pct)}</td>
                    <td><span className={`verdict ${r.verdict}`}>{r.verdict === 'better' ? 'BETTER' : r.verdict === 'worse' ? 'WORSE' : '='}</span></td>
                  </tr>
                ))}
                <tr>
                  <td className="name">Logs in frame</td>
                  <td>{fmtInt(res.logsA)}</td><td>{fmtInt(res.logsB)}</td>
                  <td>{res.logsB - res.logsA >= 0 ? '+' : ''}{res.logsB - res.logsA}</td><td>—</td><td />
                </tr>
              </tbody>
            </table>
          ) : null}
          {res?.a?.bottleneck || res?.b?.scene ? (
            <div className="hint" style={{ marginTop: 6 }}>
              A scene: <b className="mono">{res?.a?.scene ?? '—'}</b> · B scene: <b className="mono">{res?.b?.scene ?? '—'}</b>
              {' '}· Metric differences may be caused by scene differences.
            </div>
          ) : null}
        </div>
      </div>

      <div className="insp-col">
        <div className="card">
          <h4>Sample (Function) Diffs — self time</h4>
          {!res?.samples?.length ? (
            <div className="hint">No sample data in these frames or no diff generated.</div>
          ) : (
            <table className="grid">
              <thead><tr><th>Function</th><th>A self</th><th>B self</th><th>Δ</th><th>Calls A→B</th></tr></thead>
              <tbody>
                {res.samples.slice(0, 18).map((r) => (
                  <tr key={r.name}>
                    <td className="name">
                      {r.name}
                      {r.onlyIn ? <span className={`badge ${r.onlyIn === 'B' ? 'bad' : 'warn'}`} style={{ marginLeft: 5 }}>only {r.onlyIn}</span> : null}
                    </td>
                    <td>{fmtUs(r.aSelfUs)}</td>
                    <td style={{ color: r.deltaUs > 0 ? 'var(--bad)' : r.deltaUs < 0 ? 'var(--ok)' : undefined }}>{fmtUs(r.bSelfUs)}</td>
                    <td>{r.deltaUs >= 0 ? '+' : ''}{fmtUs(r.deltaUs)} <span style={{ color: 'var(--fg-3)' }}>({fmtPct(r.pct, 0)})</span></td>
                    <td>{r.aCalls} → {r.bCalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="hint" style={{ marginTop: 6 }}>
            Positive Δ = function is more expensive in frame B. “only B” indicates that the function only ran in the problematic frame.
          </div>
          <div className="row tight" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { selectFrame(b); setTab('flame'); }}>Open Flame Graph for B</button>
            <button className="btn sm" onClick={() => { selectFrame(a); setTab('flame'); }}>Open Flame Graph for A</button>
          </div>
        </div>
      </div>
    </div>
  );
}
