/**
 * Frame Timeline / Alev Grafiği (Flamegraph)
 *
 * Girdi: ajanın Profiler.BeginSample/EndSample yığınından ürettiği DÜZ
 * pre-order dizi. Her düğüm: [name, selfUs, totalUs, childCount, depth].
 *
 * Çizim: her derinlik bir satır, her düğüm `totalUs` genişliğinde bir blok.
 * Blok rengeri isimden türetilir (aynı fonksiyon her karede aynı renk),
 * parlaklık ise SELF payına göre artar — "kendi içinde yakan" fonksiyonlar
 * görsel olarak öne çıkar.
 *
 * Etkileşim: bloğa tıkla → o bloğu kök kabul edip zoom yap (Escape → sıfırla),
 * hover → self/total/% tooltip.
 */
import React, { useMemo, useState } from 'react';
import { flameColor, fmtUs, hashHue } from '../lib/format';

export type SampleNode = [string, number, number, number, number];

const ROW_H = 16;
const MIN_BLOCK_PX = 1.2;

type Layout = {
  name: string; selfUs: number; totalUs: number; childCount: number; depth: number;
  x: number; // 0..1 (zoom köküne göre normalize)
  w: number; // 0..1
  idx: number;
  selfShare: number;
};

export default function FlameGraph({ flat, totalUs, height = 210, title }: {
  flat: SampleNode[]; totalUs?: number; height?: number; title?: string;
}) {
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; l: Layout } | null>(null);

  const layout = useMemo(() => {
    if (!flat?.length) return { rows: [] as Layout[][], rootTotal: 0, maxDepth: 0 };
    const rootTotal = flat[0][2] || totalUs || 1;
    // x ofsetleri: derinlik başına imleç
    const cursor: number[] = [];
    const rows: Layout[][] = [];
    for (let i = 0; i < flat.length; i++) {
      const [name, selfUs, totalUsN, childCount, depth] = flat[i];
      const d = depth ?? 0;
      while (rows.length <= d) rows.push([]);
      while (cursor.length <= d) cursor.push(0);
      const x = d === 0 ? 0 : cursor[d];
      const w = (totalUsN || 0) / rootTotal;
      rows[d].push({ name, selfUs, totalUs: totalUsN, childCount, depth: d, x, w, idx: i, selfShare: totalUsN ? selfUs / totalUsN : 0 });
      cursor[d] = x + w;
    }
    const maxDepth = rows.length;
    return { rows, rootTotal, maxDepth };
  }, [flat, totalUs]);

  const zoom = zoomIdx != null ? flat[zoomIdx] : null;
  const zoomRange = useMemo(() => {
    if (!zoom) return null;
    const l = layout.rows[zoom[4]]?.find((x) => x.idx === zoomIdx);
    if (!l) return null;
    return { from: l.x, to: l.x + l.w };
  }, [zoom, zoomIdx, layout.rows]);

  const maxDepth = layout.maxDepth;
  const contentH = Math.max(height, maxDepth * ROW_H + 18);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomIdx(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!flat?.length) {
    return (
      <div className="empty">
        Bu kare için örneklem ağacı yok.<br />
        <span className="hint">Ajan <span className="mono">Profiler.BeginSample/EndSample</span> (veya <span className="mono">OmniProfiler.Sample()</span>) verisi gönderdiğinde flamegraph burada oluşur. Kare listesinde <b>◆</b> işareti örneklem verisi olan kareleri gösterir.</span>
      </div>
    );
  }

  const scale = zoomRange ? 1 / Math.max(1e-9, zoomRange.to - zoomRange.from) : 1;
  const offset = zoomRange ? zoomRange.from : 0;

  return (
    <div>
      <div className="row tight" style={{ marginBottom: 4 }}>
        {title ? <span className="panel-title">{title}</span> : null}
        <span className="badge">kök {fmtUs(layout.rootTotal)}</span>
        <span className="badge">{flat.length} düğüm</span>
        <span className="badge">{maxDepth} derinlik</span>
        {zoom ? <button className="btn sm" onClick={() => setZoomIdx(null)}>zoom: {zoom[0]} ✕</button> : null}
        <div className="spacer" />
        <span className="hint">bloğa tıkla → zoom · Esc → sıfırla</span>
      </div>
      <div className="flame" style={{ height: contentH }} onMouseLeave={() => setHover(null)}>
        {layout.rows.map((row, d) => (
          <div className="flame-row" key={d} style={{ top: d * ROW_H, height: ROW_H }}>
            {row.map((l) => {
              const x = (l.x - offset) * scale;
              const w = l.w * scale;
              if (x + w < 0 || x > 1 || w * 1000 < MIN_BLOCK_PX) return null;
              const showLabel = w > 0.045;
              return (
                <div
                  key={l.idx}
                  className="flame-block"
                  style={{
                    left: `${(x * 100).toFixed(3)}%`,
                    width: `${(w * 100).toFixed(3)}%`,
                    background: flameColor(l.name, l.selfShare),
                  }}
                  onClick={(e) => { e.stopPropagation(); setZoomIdx(l.depth === 0 && zoomIdx == null ? null : l.idx); }}
                  onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, l })}
                >
                  {showLabel ? l.name : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flame-scale">
        <span>0</span>
        <span>{fmtUs((zoomRange ? zoomRange.to - zoomRange.from : 1) * layout.rootTotal / 2)}</span>
        <span>{fmtUs((zoomRange ? zoomRange.to - zoomRange.from : 1) * layout.rootTotal)}</span>
      </div>
      <TopSelfTimes flat={flat} rootTotal={layout.rootTotal} />
      {hover ? (
        <div className="tooltip" style={{ left: Math.min((window.innerWidth ?? 1200) - 300, hover.x + 14), top: hover.y + 12 }}>
          <div style={{ fontWeight: 700, color: `hsl(${hashHue(hover.l.name)} 70% 70%)` }}>{hover.l.name}</div>
          <div>total <b>{fmtUs(hover.l.totalUs)}</b> · self <b>{fmtUs(hover.l.selfUs)}</b></div>
          <div>kökün %{((hover.l.totalUs / layout.rootTotal) * 100).toFixed(1)}'i · self payı %{(hover.l.selfShare * 100).toFixed(0)}</div>
          <div>derinlik {hover.l.depth} · çocuk {hover.l.childCount}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Self time'a göre en pahalı fonksiyonlar — flamegraph'ın tablo özeti. */
export function TopSelfTimes({ flat, rootTotal, limit = 10 }: { flat: SampleNode[]; rootTotal: number; limit?: number }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; self: number; total: number; calls: number }>();
    for (const [rawName, selfUs, totalUs] of flat || []) {
      const name = String(rawName).replace(/(x|count=|:|\s)\d+(\.\d+)?\b/g, '$1#');
      const e = m.get(name) ?? { name, self: 0, total: 0, calls: 0 };
      e.self += selfUs; e.total = Math.max(e.total, totalUs); e.calls++;
      m.set(name, e);
    }
    return [...m.values()].sort((a, b) => b.self - a.self).slice(0, limit);
  }, [flat, limit]);
  if (!rows.length) return null;
  const maxSelf = rows[0]?.self || 1;
  return (
    <div className="card" style={{ marginTop: 6 }}>
      <h4>Self Time — En Pahalı {rows.length} Fonksiyon</h4>
      <table className="grid">
        <thead><tr><th>Fonksiyon</th><th>Self</th><th>%</th><th>Çağrı</th><th style={{ width: '28%' }}>pay</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="name" style={{ color: `hsl(${hashHue(r.name)} 65% 72%)` }}>{r.name}</td>
              <td>{fmtUs(r.self)}</td>
              <td>{((r.self / rootTotal) * 100).toFixed(1)}</td>
              <td>{r.calls}</td>
              <td style={{ textAlign: 'left' }}>
                <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(r.self / maxSelf) * 100}%`, height: '100%', background: flameColor(r.name, 0.5) }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
