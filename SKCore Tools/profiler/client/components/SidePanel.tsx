/**
 * Sağ Panel — Bulgular (Findings) + Hızlı Özet
 *
 * OmniProfiler'ın "pasif gözlem"den "aktif tavsiye"ye geçtiği yer:
 * GC spike, ardışık hitch, heap büyümesi, log spam ve sızıntı bulguları
 * otomatik üretilir, önem derecesine göre sıralanır ve tıklanınca ilgili
 * kareye/log grubuna atlar.
 */
import React, { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { fmtClock, fmtInt, fmtNum } from '../lib/format';

const KIND_LABEL: Record<string, string> = {
  gc: 'GC', hitch: 'HITCH', heap: 'HEAP', leak: 'LEAK', logspam: 'SPAM',
};

export default function SidePanel() {
  const findings = useStore((s) => s.findings);
  const selectFrame = useStore((s) => s.selectFrame);
  const setTab = useStore((s) => s.setTab);
  const leaks = useStore((s) => s.leaks);
  const logStats = useStore((s) => s.logStats);
  const wire = useStore((s) => s.wire);
  const stats = useStore((s) => s.stats);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const sev = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return findings
      .filter((f) => !filter || f.kind === filter)
      .slice()
      .sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3) || b.ts - a.ts)
      .slice(0, 200);
  }, [findings, filter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of findings) m[f.kind] = (m[f.kind] ?? 0) + 1;
    return m;
  }, [findings]);

  const risky = leaks.filter((l) => l.spawned >= 30 && l.destroyRatio < 0.55 && l.slopePerSec > 0.35);

  return (
    <div className="side">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Bulgular</span>
          <span className="badge">{findings.length}</span>
          <div className="spacer" />
          <select className="inp" value={filter ?? ''} onChange={(e) => setFilter(e.target.value || null)}>
            <option value="">hepsi</option>
            {Object.keys(KIND_LABEL).map((k) => <option key={k} value={k}>{KIND_LABEL[k]} ({counts[k] ?? 0})</option>)}
          </select>
        </div>
        <div className="panel-body scroll-y">
          {!rows.length ? (
            <div className="empty">
              Bulgu yok.<br />
              <span className="hint">GC spike, ardışık hitch, heap büyümesi, log spam ve sızıntı otomatik işaretlenir.</span>
            </div>
          ) : rows.map((f) => (
            <div className="finding" key={f.id} onClick={() => { if (f.frameId != null) selectFrame(f.frameId); if (f.kind === 'leak') setTab('leak'); if (f.kind === 'logspam') setTab('flame'); }}>
              <div className="sev" style={{ background: f.severity === 'high' ? 'var(--bad)' : f.severity === 'medium' ? 'var(--warn)' : 'var(--fg-3)' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row tight">
                  <span className="kind">{KIND_LABEL[f.kind] ?? f.kind}</span>
                  <span className="t" style={{ flex: 1 }}>{f.title}</span>
                </div>
                <div className="m">
                  t+{fmtClock(f.tRel)} {f.frameId != null ? `· kare ${f.frameId}` : ''} · {f.severity}
                  <button className="btn sm ghost" style={{ marginLeft: 6, padding: '0 3px' }} onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [f.id]: !o[f.id] })); }}>
                    {open[f.id] ? 'gizle' : 'detay'}
                  </button>
                </div>
                {open[f.id] ? (
                  <dl className="kv" style={{ marginTop: 4 }}>
                    {Object.entries(f.detail ?? {}).filter(([k]) => k !== 'hint').slice(0, 10).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{typeof v === 'number' ? (Math.abs(v) > 10000 ? fmtInt(v) : fmtNum(v, 2)) : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : null}
                {open[f.id] && f.detail?.hint ? <div className="hint" style={{ marginTop: 4 }}>{f.detail.hint}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ flex: '0 0 auto', maxHeight: '38%' }}>
        <div className="panel-head">
          <span className="panel-title">Maliyet Panosu</span>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => setTab('leak')}>sızıntı →</button>
        </div>
        <div className="panel-body" style={{ overflow: 'auto' }}>
          <div className="card" style={{ borderRadius: 0, border: 0, borderBottom: '1px solid var(--border-soft)' }}>
            <h4>Sızıntı Adayları</h4>
            {!risky.length ? <div className="hint">Şu an sızıntı adayı yok.</div> : risky.slice(0, 5).map((r) => (
              <div className="row tight" key={`${r.type}:${r.prefab}`} style={{ justifyContent: 'space-between' }}>
                <span className="mono" style={{ fontSize: 11 }}>{r.prefab ?? r.type}</span>
                <span className="badge bad">canlı {fmtInt(r.live)} · oran {fmtNum(r.destroyRatio, 2)}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ borderRadius: 0, border: 0 }}>
            <h4>OmniProfiler Overhead</h4>
            <dl className="kv">
              <dt>Log sıkıştırma</dt><dd>%{fmtNum((logStats.ratio ?? 0) * 100, 1)} ({fmtInt(logStats.raw)} → {fmtInt(logStats.groups)})</dd>
              <dt>Bastırılan log</dt><dd>{fmtInt(logStats.suppressed)}</dd>
              <dt>SQLite yazımı</dt><dd>{fmtInt(wire.dbWrites)}</dd>
              <dt>Panel WS trafiği</dt><dd>{fmtInt(wire.sentBytes / 1024)} KB / {fmtInt(wire.sentMessages)} mesaj</dd>
              <dt>Grafik noktaları</dt><dd>{fmtInt(stats?.frames ?? 0)}</dd>
            </dl>
            <div className="hint" style={{ marginTop: 5 }}>
              Unity tarafında yalnızca ölçüm + UDP gönderimi yapılır; parse, agregasyon, grafik ve disk yazımı
              burada (ayrı süreçte) gerçekleşir. Bu yüzden ajanın oyun üzerindeki maliyeti Deep Profile'a göre
              ihmal edilebilir düzeydedir.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
