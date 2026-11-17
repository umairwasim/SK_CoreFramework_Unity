/**
 * Tarihsel Analiz (SQLite)
 *
 * Unity Profiler oturum kapanınca veriyi kaybeder. OmniProfiler her kareyi
 * SQLite'a yazdığı için:
 *   • önceki oturumlar listelenir
 *   • bir oturumun 1%/0.1% low, GC toplamı, draw call ortalaması SQL'den hesaplanır
 *   • en kötü GC spike'ları ve en çok tekrar eden log grupları diske sorulur
 *   • CSV olarak dışa aktarılır (CI/rapor için)
 */
import React, { useEffect, useState } from 'react';
import { apiRequest as api, simRequest, postRequest } from '../lib/transport';
import { useStore } from '../lib/store';
import { fmtBytes, fmtInt, fmtNum, fmtClock } from '../lib/format';

type SessionRow = {
  id: string; started_at: number; ended_at: number | null; app: string; platform: string;
  unity: string; device: string; target_fps: number; frames: number; logs: number; events: number;
};

export default function HistoryPanel() {
  const session = useStore((s) => s.session);
  const selectFrame = useStore((s) => s.selectFrame);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sel, setSel] = useState<string | null>(session?.id ?? null);
  const [hist, setHist] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ sessions: SessionRow[] }>('/sessions').then((r) => setSessions(r.sessions)).catch(() => { }); }, []);
  useEffect(() => { if (session?.id && !sel) setSel(session.id); }, [session?.id]);

  useEffect(() => {
    if (!sel) return;
    setBusy(true);
    api(`/history?sessionId=${encodeURIComponent(sel)}`)
      .then(setHist)
      .catch(() => setHist(null))
      .finally(() => setBusy(false));
  }, [sel]);

  const st = hist?.stats;
  const low = hist?.low;

  return (
    <div className="inspector" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
      <div className="insp-col">
        <div className="card">
          <h4>Oturumlar (SQLite)</h4>
          {!sessions.length ? <div className="hint">Henüz diske yazılmış oturum yok.</div> : (
            <table className="grid">
              <thead><tr><th>Oturum</th><th>Başlangıç</th><th>Kare</th><th>Log</th><th></th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={s.id === sel ? { background: 'var(--sel)' } : undefined}>
                    <td className="name">
                      {s.app}<br />
                      <span style={{ color: 'var(--fg-3)', fontSize: 10 }}>{s.platform} · {s.id.slice(-14)}</span>
                    </td>
                    <td>{new Date(s.started_at).toLocaleString('tr-TR', { hour12: false })}</td>
                    <td>{fmtInt(s.frames)}</td>
                    <td>{fmtInt(s.logs)}</td>
                    <td><button className="btn sm" onClick={() => setSel(s.id)}>aç</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row tight" style={{ marginTop: 8 }}>
            <a className="btn sm" href={`/api/export/frames.csv?sessionId=${encodeURIComponent(sel ?? '')}`}>Kareleri CSV indir</a>
            <a className="btn sm" href={`/api/export/logs.csv?sessionId=${encodeURIComponent(sel ?? '')}`}>Logları CSV indir</a>
          </div>
        </div>
        <DiskCard />
        <div className="card">
          <h4>Simülatör / Ajan</h4>
          <SimControls />
        </div>
      </div>

      <div className="insp-col">
        {busy ? <div className="hint">SQLite sorgulanıyor…</div> : null}
        {st ? (
          <>
            <div className="card">
              <h4>Oturum Özeti — {sel?.slice(-18)}</h4>
              <dl className="kv">
                <dt>Toplam kare</dt><dd>{fmtInt(st.frames)}</dd>
                <dt>Süre (yaklaşık)</dt><dd>{fmtClock(st.frames ? st.frames / 60 : 0)}</dd>
                <dt>Ortalama FPS</dt><dd>{fmtNum(st.fps_avg, 1)}</dd>
                <dt>1% Low (SQL)</dt><dd style={{ color: 'var(--warn)' }}>{fmtNum(low?.p01, 1)}</dd>
                <dt>0.1% Low (SQL)</dt><dd style={{ color: 'var(--bad)' }}>{fmtNum(low?.p001, 1)}</dd>
                <dt>Medyan FPS</dt><dd>{fmtNum(low?.p50, 1)}</dd>
                <dt>En kötü kare</dt><dd>{fmtNum(st.dt_max, 1)} ms</dd>
                <dt>Toplam GC Alloc</dt><dd>{fmtBytes(st.gc_total ?? 0, 1)}</dd>
                <dt>En kötü tek kare GC</dt><dd>{fmtBytes(st.gc_max_frame ?? 0, 1)}</dd>
                <dt>Mono used zirve</dt><dd>{fmtBytes(st.mono_used_max ?? 0, 1)}</dd>
                <dt>Reserved zirve</dt><dd>{fmtBytes(st.reserved_max ?? 0, 1)}</dd>
                <dt>Draw call ort / max</dt><dd>{fmtNum(st.dc_avg, 0)} / {fmtInt(st.dc_max)}</dd>
                <dt>SetPass ort / max</dt><dd>{fmtNum(st.sp_avg, 0)} / {fmtInt(st.sp_max)}</dd>
                <dt>Üçgen ort.</dt><dd>{fmtInt(st.tri_avg)}</dd>
              </dl>
              <div className="hint" style={{ marginTop: 6 }}>
                Bu değerler SQLite'tan toplu sorguyla hesaplanır — yani oturumun <b>tamamı</b> üzerinden.
                Unity Profiler'ın ring buffer'ı yalnızca son birkaç yüz kareyi bildiği için bu karşılaştırmayı yapamaz.
              </div>
            </div>

            <div className="card">
              <h4>En Büyük GC Spike'ları (diskten)</h4>
              <table className="grid">
                <thead><tr><th>Kare</th><th>t+</th><th>GC</th><th>FPS</th><th>Mono used</th><th>Sahne</th><th></th></tr></thead>
                <tbody>
                  {(hist.gcSpikes ?? []).slice(0, 12).map((g: any) => (
                    <tr key={g.frame_id}>
                      <td>{g.frame_id}</td>
                      <td>{fmtClock(g.t_rel)}</td>
                      <td style={{ color: 'var(--bad)' }}>{fmtBytes(g.gc_alloc, 0)}</td>
                      <td>{fmtNum(g.fps, 0)}</td>
                      <td>{fmtBytes(g.mono_used, 0)}</td>
                      <td>{g.scene}</td>
                      <td><button className="btn sm" onClick={() => selectFrame(g.frame_id)}>incele</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h4>En Çok Tekrar Eden Log Grupları (diskten)</h4>
              <table className="grid">
                <thead><tr><th>Seviye</th><th>Etiket</th><th>Tekrar</th><th>İlk → Son</th><th>Mesaj</th></tr></thead>
                <tbody>
                  {(hist.topLogGroups ?? []).slice(0, 10).map((g: any, i: number) => (
                    <tr key={i}>
                      <td>{g.level}</td>
                      <td>{g.tag ?? '—'}</td>
                      <td style={{ color: g.hits > 200 ? 'var(--bad)' : undefined }}>{fmtInt(g.hits)}</td>
                      <td>{fmtClock((g.first_ts - (sessions.find((s) => s.id === sel)?.started_at ?? g.first_ts)) / 1000)} → {fmtClock((g.last_ts - (sessions.find((s) => s.id === sel)?.started_at ?? g.last_ts)) / 1000)}</td>
                      <td className="name">{String(g.msg).slice(0, 110)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : !busy ? <div className="empty">Bir oturum seçin.</div> : null}
      </div>
    </div>
  );
}

/**
 * Disk & Saklama — SQLite'ın gerçek maliyetini görünür kılar.
 *
 * Neden önemli? 60 fps'te her kare için ~25-40 örneklem (flamegraph) satırı
 * yazmak saatte milyonlarca satır = GB'larca disk demektir (ölçüm: 19 dakikada
 * 364 MB). Bu yüzden örneklem satırları varsayılan olarak DİSKE YAZILMAZ;
 * flamegraph canlı bellekteki son ~600 kare için çalışır. Kareler (frames) ise
 * tarihsel analizin belkemiği olduğu için saklanır.
 */
function DiskCard() {
  const [d, setD] = useState<any>(null);
  const load = () => api('/db').then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!d) return null;
  const rows = d.rows ?? {};
  const total = Object.values(rows).reduce((a: number, b: any) => a + Number(b ?? 0), 0);
  return (
    <div className="card">
      <div className="row tight">
        <h4 style={{ margin: 0 }}>Disk &amp; Saklama</h4>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={load}>↻</button>
        <button className="btn sm" onClick={() => postRequest('/db/prune', { vacuum: true }).then(setD).catch(() => {})} title="Boş sayfaları dosyadan geri kazan (VACUUM)">
          VACUUM
        </button>
      </div>
      <dl className="kv">
        <dt>Dosya boyutu</dt><dd style={{ color: d.fileSize > 500 * 1024 * 1024 ? 'var(--bad)' : undefined }}>{fmtBytes(d.fileSize, 1)}</dd>
        <dt>Toplam satır</dt><dd>{fmtInt(total)}</dd>
        <dt>frames / logs</dt><dd>{fmtInt(rows.frames)} / {fmtInt(rows.logs)}</dd>
        <dt>samples / events</dt><dd>{fmtInt(rows.samples)} / {fmtInt(rows.events)}</dd>
        <dt>obje olayı / bulgu</dt><dd>{fmtInt(rows.object_events)} / {fmtInt(rows.findings)}</dd>
        <dt>Örneklem diske</dt><dd>{d.policy?.persistSamples ? <span className="badge warn">AÇIK (disk şişer)</span> : <span className="badge ok">KAPALI (önerilen)</span>}</dd>
        <dt>Saklama penceresi</dt><dd>{d.policy?.retentionMinutes ? `${d.policy.retentionMinutes} dk` : 'sınırsız'}</dd>
        {d.reclaimableBytes > 1048576 ? (<><dt>Geri kazanılabilir</dt><dd style={{ color: 'var(--warn)' }}>{fmtBytes(d.reclaimableBytes, 1)}</dd></>) : null}
      </dl>
      <div className="hint" style={{ marginTop: 5 }}>
        Örneklem satırlarını da saklamak için sunucuyu <span className="mono">OMNI_DB_SAMPLES=1</span> ile başlatın.
        Süre sınırı için <span className="mono">OMNI_DB_RETENTION_MIN=60</span>.
      </div>
    </div>
  );
}

function SimControls() {
  const sim = useStore((s) => s.sim);
  const [loss, setLoss] = useState<number>((sim?.lossRate ?? 0.004) * 100);
  const [fps, setFps] = useState<number>(sim?.fps ?? 60);
  useEffect(() => { if (sim) { setLoss(sim.lossRate * 100); setFps(sim.fps); } }, [sim?.running, sim?.fps, sim?.lossRate]);

  const post = (body: Record<string, unknown>) => simRequest(body).catch(() => { });

  return (
    <>
      <div className="row tight" style={{ marginBottom: 6 }}>
        <span className={`badge ${sim?.running ? 'ok' : ''}`}>{sim?.running ? 'çalışıyor' : 'durdu'}</span>
        <span className="badge">{sim?.transport}</span>
        <span className="badge">{sim?.scene ?? '—'}</span>
        <div className="spacer" />
        <button className="btn sm primary" onClick={() => post({ action: sim?.running ? 'stop' : 'start' })}>{sim?.running ? 'Durdur' : 'Başlat'}</button>
        <button className="btn sm" onClick={() => post({ action: 'reset' })}>Sıfırla</button>
      </div>
      <div className="row tight" style={{ marginBottom: 6 }}>
        <span className="hint">Taşıma:</span>
        <div className="seg">
          <button className={sim?.transport === 'inproc' ? 'on' : ''} onClick={() => post({ transport: 'inproc' })}>in-process</button>
          <button className={sim?.transport === 'udp' ? 'on' : ''} onClick={() => post({ transport: 'udp', udpPort: sim?.udpPort })}>UDP {sim?.udpPort}</button>
        </div>
        <span className="hint">FPS hedefi</span>
        <input className="inp" style={{ width: 56 }} type="number" value={fps} min={10} max={240} onChange={(e) => setFps(Number(e.target.value))} onBlur={() => post({ fps })} />
      </div>
      <div className="row tight" style={{ marginBottom: 6 }}>
        <span className="hint">UDP paket kaybı %{loss.toFixed(2)}</span>
        <input type="range" min={0} max={5} step={0.1} value={loss} style={{ flex: 1 }} onChange={(e) => setLoss(Number(e.target.value))} onMouseUp={() => post({ lossRate: loss / 100 })} />
        <label className="hint row tight"><input type="checkbox" checked={sim?.deepProfile ?? true} onChange={(e) => post({ deepProfile: e.target.checked })} /> deep profile</label>
      </div>
      <div className="row tight">
        <button className="btn sm" onClick={() => post({ action: 'gcSpike', bytes: 2_400_000 })}>GC spike enjekte et</button>
        <button className="btn sm" onClick={() => post({ action: 'event', name: 'ManualTestEvent', kind: 'bad', payload: { note: 'panelden tetiklendi' } })}>Olay enjekte et</button>
        <button className="btn sm" onClick={() => post({ action: 'log', level: 'error', msg: '[Test] Panelden enjekte edilen hata', stack: 'TestRunner.Fail (at Assets/Tests/SmokeTests.cs:42)' })}>Log enjekte et</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Bu kontroller mock Unity ajanını yönetir. Gerçek Unity tarafında aynı mesajlar
        <span className="mono"> OmniProfilerAgent.cs</span> tarafından üretilir (bkz. <span className="mono">unity/OmniProfilerAgent.cs</span>).
      </div>
      {sim ? (
        <dl className="kv" style={{ marginTop: 6 }}>
          <dt>Gönderilen paket</dt><dd>{fmtInt(sim.sent?.packets)}</dd>
          <dt>Kayıp (simüle)</dt><dd>{fmtInt(sim.sent?.droppedByLoss)}</dd>
          <dt>Kare / log / olay</dt><dd>{fmtInt(sim.sent?.frames)} / {fmtInt(sim.sent?.logs)} / {fmtInt(sim.sent?.events)}</dd>
          <dt>Sızan BulletPrefab</dt><dd style={{ color: 'var(--bad)' }}>{fmtInt(sim.leakedBullets)}</dd>
          <dt>Mono used</dt><dd>{fmtNum(sim.mem?.monoUsedMB, 1)} MB</dd>
          <dt>Oturum süresi</dt><dd>{fmtClock(sim.elapsedSec)}</dd>
        </dl>
      ) : null}
    </>
  );
}
