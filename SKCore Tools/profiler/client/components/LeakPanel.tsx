/**
 * Otomatik Bellek Sızıntısı Dedektörü (Memory Leak Tracker) — paneli
 *
 * Ajan Object.Instantiate/Destroy çağrılarını dinler; sunucu tarafındaki
 * dedektör üç kanıtı birlikte değerlendirir:
 *   1) destroy/spawn oranı   2) canlı sayının artış eğimi   3) mono heap eğimi
 *
 * Tablo bu üç kanıtı açıkça gösterir: "canlı 412 obje, destroy oranı 0.04,
 * +3.1 obje/sn, heap +0.9 MB/sn" → yüksek olasılıklı sızıntı.
 */
import React, { useEffect, useState } from 'react';
import { apiRequest as api } from '../lib/transport';
import { useStore, type LeakRow } from '../lib/store';
import { fmtInt, fmtNum } from '../lib/format';

function verdict(r: LeakRow) {
  if (r.spawned < 30) return { label: 'veri az', cls: '', why: 'İstatistik için en az 30 spawn gerekli.' };
  if (r.destroyRatio < 0.12 && r.slopePerSec > 0.35) return { label: 'SIZINTI', cls: 'bad', why: 'Neredeyse hiç Destroy yok ve canlı sayı sürekli artıyor.' };
  if (r.destroyRatio < 0.55 && r.slopePerSec > 0.35) return { label: 'şüpheli', cls: 'warn', why: 'Destroy oranı düşük; objeler birikiyor.' };
  if (r.live < 0 || Math.abs(r.slopePerSec) < 0.05) return { label: 'dengeli', cls: 'ok', why: 'Spawn/destroy dengede — havuz doğru çalışıyor.' };
  return { label: 'izleniyor', cls: '', why: 'Eğim düşük ama oran sınırda.' };
}

export default function LeakPanel() {
  const leaks = useStore((s) => s.leaks);
  const findings = useStore((s) => s.findings);
  const selectFrame = useStore((s) => s.selectFrame);
  const [full, setFull] = useState<LeakRow[]>(leaks);
  const [sqlBalance, setSqlBalance] = useState<any[] | null>(null);

  useEffect(() => { setFull(leaks); }, [leaks]);

  const leakFindings = findings.filter((f) => f.kind === 'leak' || f.kind === 'heap').slice(-12).reverse();

  const loadFromDisk = async () => {
    try {
      const h = await api('/history');
      setSqlBalance(h.objectBalance ?? []);
    } catch { /* yoksay */ }
  };

  return (
    <div className="inspector" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
      <div className="insp-col">
        <div className="card">
          <div className="row tight">
            <h4 style={{ margin: 0 }}>Obje Yaşam Döngüsü Dengesi</h4>
            <div className="spacer" />
            <button className="btn sm ghost" onClick={loadFromDisk} title="SQLite'taki object_events tablosundan doğrula">SQLite'tan doğrula</button>
          </div>
          {!full.length ? <div className="hint">Henüz Instantiate/Destroy verisi gelmedi.</div> : (
            <table className="grid" style={{ marginTop: 6 }}>
              <thead>
                <tr><th>Tip / Prefab</th><th>Spawn</th><th>Destroy</th><th>Canlı</th><th>Zirve</th><th>Destroy oranı</th><th>Eğim (obje/sn)</th><th>Durum</th></tr>
              </thead>
              <tbody>
                {full.slice(0, 24).map((r) => {
                  const v = verdict(r);
                  return (
                    <tr key={`${r.type}:${r.prefab}`}>
                      <td className="name">{r.type}{r.prefab ? <span style={{ color: 'var(--fg-3)' }}> · {r.prefab}</span> : null}</td>
                      <td>{fmtInt(r.spawned)}</td>
                      <td>{fmtInt(r.destroyed)}</td>
                      <td style={{ color: r.live > 50 ? 'var(--bad)' : undefined }}>{fmtInt(r.live)}</td>
                      <td>{fmtInt(r.peak)}</td>
                      <td>
                        <span style={{ color: r.destroyRatio < 0.2 ? 'var(--bad)' : r.destroyRatio < 0.6 ? 'var(--warn)' : 'var(--ok)' }}>
                          {fmtNum(r.destroyRatio, 2)}
                        </span>
                      </td>
                      <td style={{ color: r.slopePerSec > 0.35 ? 'var(--bad)' : undefined }}>{r.slopePerSec > 0 ? '+' : ''}{fmtNum(r.slopePerSec, 2)}</td>
                      <td><span className={`badge ${v.cls}`} title={v.why}>{v.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {sqlBalance ? (
            <div className="card" style={{ marginTop: 8 }}>
              <h4>SQLite Doğrulaması (object_events, tüm oturum)</h4>
              <table className="grid">
                <thead><tr><th>Tip / Prefab</th><th>Spawn</th><th>Destroy</th><th>Net</th></tr></thead>
                <tbody>
                  {sqlBalance.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td className="name">{r.type}{r.prefab ? ` · ${r.prefab}` : ''}</td>
                      <td>{fmtInt(r.spawned)}</td><td>{fmtInt(r.destroyed)}</td>
                      <td style={{ color: r.spawned - r.destroyed > 50 ? 'var(--bad)' : 'var(--ok)' }}>{fmtInt(r.spawned - r.destroyed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hint" style={{ marginTop: 4 }}>
                Bu tablo bellekten değil <span className="mono">disk</span>ten okunur — yani oturum boyunca biriken
                tüm obje olaylarını kapsar (Unity Profiler'da bu geçmiş yoktur).
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="insp-col">
        <div className="card">
          <h4>Sızıntı / Heap Bulguları</h4>
          {!leakFindings.length ? <div className="hint">Sızıntı bulgusu yok. Dedektör 12 saniyelik pencerede eğim + oran + heap korelasyonunu birlikte değerlendirir.</div> : (
            <div className="scroll-y" style={{ maxHeight: 260 }}>
              {leakFindings.map((f) => (
                <div className="finding" key={f.id} onClick={() => f.frameId != null && selectFrame(f.frameId)}>
                  <div className="sev" style={{ background: f.severity === 'high' ? 'var(--bad)' : 'var(--warn)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{f.title}</div>
                    <div className="m">
                      {f.detail?.live != null ? `canlı ${f.detail.live} · ` : ''}
                      {f.detail?.destroyRatio != null ? `destroy oranı ${f.detail.destroyRatio} · ` : ''}
                      {f.detail?.slopePerSec != null ? `+${f.detail.slopePerSec}/sn · ` : ''}
                      {f.detail?.monoUsedMB != null ? `heap ${fmtNum(f.detail.monoUsedMB, 0)} MB` : ''}
                      {f.frameId != null ? ` · kare ${f.frameId}` : ''}
                    </div>
                    {f.detail?.hint ? <div className="hint" style={{ marginTop: 3 }}>{f.detail.hint}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h4>Nasıl çalışır?</h4>
          <div className="hint">
            <b>Yanlış pozitif koruması:</b> havuzlanmış (pooled) objeler de canlı sayıyı artırır, ama destroy oranları
            yüksektir ve eğim bir noktada düzleşir. Dedektör bu yüzden <b>oran + eğim + heap korelasyonu</b> üçlüsünü
            birlikte ister. Tabloda “dengeli” satırları (ör. <span className="mono">HitEffectVFX</span>) bunun kanıtıdır:
            sürekli spawn edilir ama anında destroy edilir.
          </div>
        </div>
      </div>
    </div>
  );
}
