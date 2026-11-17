/**
 * Özel Telemetri — OmniProfiler.TrackEvent(...) olaylarının tablo görünümü.
 *
 * Kod tarafında:
 *     OmniProfiler.TrackEvent("PlayerDied", new { Score = 100, Level = 5 });
 * Panel tarafında: olay, FPS/bellek grafiklerinin ALTINDAKİ zaman çizelgesinde
 * işaretlenir; burada da her olayın gerçekleştiği ANDAKİ metrik anlık görüntüsü
 * (bağlam enjeksiyonu) listelenir. "Oyuncu öldüğü anda FPS neden düştü?"
 * sorusunun cevabı tek tıkla açılır.
 */
import React, { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { fmtClock, fmtInt, fmtNum } from '../lib/format';

export default function EventsPanel() {
  const events = useStore((s) => s.events);
  const selectFrame = useStore((s) => s.selectFrame);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return events
      .filter((e) => (!kind || e.kind === kind) && (!s || e.name.toLowerCase().includes(s) || JSON.stringify(e.payload).toLowerCase().includes(s)))
      .slice(-600)
      .reverse();
  }, [events, q, kind]);

  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind))], [events]);
  const byName = useMemo(() => {
    const m = new Map<string, { name: string; n: number; last: number; avgFps: number[] }>();
    for (const e of events) {
      const r = m.get(e.name) ?? { name: e.name, n: 0, last: 0, avgFps: [] as number[] };
      r.n++; r.last = e.tRel;
      const fps = (e.context as any)?.fps;
      if (typeof fps === 'number') r.avgFps.push(fps);
      m.set(e.name, r);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [events]);

  return (
    <div className="inspector" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
      <div className="insp-col">
        <div className="card">
          <div className="row tight">
            <h4 style={{ margin: 0 }}>Olay Akışı ({fmtInt(rows.length)})</h4>
            <input className="inp" placeholder="olay adı veya payload ara…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">tüm tipler</option>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {!rows.length ? <div className="empty">Olay yok. Ajan <span className="mono">TrackEvent</span> gönderdiğinde burada listelenir.</div> : (
            <div className="scroll-y" style={{ maxHeight: 300, marginTop: 6 }}>
              <table className="grid">
                <thead><tr><th>t+</th><th>Kare</th><th>Olay</th><th>Payload</th><th>O anki FPS</th><th>O anki GC</th><th>Sahne</th></tr></thead>
                <tbody>
                  {rows.map((e, i) => {
                    const ctx: any = e.context ?? {};
                    return (
                      <tr key={`${e.frame}-${e.name}-${i}`} style={{ cursor: 'pointer' }} onClick={() => selectFrame(e.frame)}>
                        <td>{fmtClock(e.tRel)}</td>
                        <td>{fmtInt(e.frame)}</td>
                        <td className="name">
                          <span className={`badge ${e.kind === 'bad' ? 'bad' : e.kind === 'good' ? 'ok' : e.kind === 'scene' ? '' : ''}`} style={{ marginRight: 5 }}>{e.kind}</span>
                          {e.name}
                        </td>
                        <td className="name" style={{ color: 'var(--fg-2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {Object.entries(e.payload ?? {}).map(([k, v]) => `${k}=${String(v)}`).join('  ') || '—'}
                        </td>
                        <td style={{ color: ctx.fps != null && ctx.fps < 45 ? 'var(--bad)' : undefined }}>{ctx.fps != null ? fmtNum(ctx.fps, 0) : '—'}</td>
                        <td style={{ color: ctx.gcAllocKB > 200 ? 'var(--warn)' : undefined }}>{ctx.gcAllocKB != null ? `${fmtNum(ctx.gcAllocKB, 0)} KB` : '—'}</td>
                        <td>{ctx.scene ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="insp-col">
        <div className="card">
          <h4>Olay Özeti</h4>
          {!byName.length ? <div className="hint">Veri bekleniyor…</div> : (
            <table className="grid">
              <thead><tr><th>Olay</th><th>Adet</th><th>Son</th><th>Ort. FPS (olay anı)</th></tr></thead>
              <tbody>
                {byName.slice(0, 20).map((r) => {
                  const avg = r.avgFps.length ? r.avgFps.reduce((a, b) => a + b, 0) / r.avgFps.length : null;
                  return (
                    <tr key={r.name}>
                      <td className="name">{r.name}</td>
                      <td>{fmtInt(r.n)}</td>
                      <td>{fmtClock(r.last)}</td>
                      <td style={{ color: avg != null && avg < 45 ? 'var(--bad)' : undefined }}>{avg != null ? fmtNum(avg, 1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="hint" style={{ marginTop: 6 }}>
            “Ort. FPS (olay anı)” sütunu, o olay gerçekleşirkenki kare hızının ortalamasıdır.
            Bir olay türü düşük FPS ile korelasyon gösteriyorsa, regresyonun tetikleyicisi büyük olasılıkla odur.
          </div>
        </div>
        <div className="card">
          <h4>Kullanım (Unity tarafı)</h4>
          <pre className="stack" style={{ marginTop: 0 }}>{`OmniProfiler.TrackEvent("PlayerDied",
    new { Score = 100, Level = 5 });

using (OmniProfiler.Sample("Inventory.Resort"))
{
    ResortItems();   // BeginSample/EndSample
}`}</pre>
        </div>
      </div>
    </div>
  );
}
