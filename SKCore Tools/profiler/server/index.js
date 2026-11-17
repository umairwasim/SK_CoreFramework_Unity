/**
 * OmniProfiler — Ana Süreç (Electron "main" karşılığı)
 *
 *   ┌──────────────┐  UDP :8790 (NDJSON)   ┌────────────────────┐  WS :8787/ws  ┌───────────┐
 *   │ Unity Agent  │ ───────────────────▶  │ OmniProfiler Main  │ ────────────▶ │ Dashboard │
 *   │ (C# / mock)  │                       │ parse → analiz →   │  REST :8787   │ React+TS  │
 *   └──────────────┘                       │ Store + SQLite     │               └───────────┘
 *                                          └────────────────────┘
 *
 * Electron'a taşırken bu dosya `electron/main/index.js` olur:
 *   - hub.broadcast(...)  ->  win.webContents.send('omni', ...)
 *   - HTTP sunucusu       ->  sadece REST kalır (veya tamamen kaldırılır)
 *   - dbPath              ->  path.join(app.getPath('userData'), 'omniprofiler.db')
 */
import http from 'node:http';
import dgram from 'node:dgram';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from './db.js';
import { MetricsStore } from './store.js';
import { LogAggregator } from './aggregator.js';
import { LeakDetector, FindingsEngine } from './analysis.js';
import { IngestPipeline } from './ingest.js';
import { Hub } from './hub.js';
import { attachRoutes } from './http.js';
import { UnityAgentSimulator } from '../tools/mock-unity-agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => process.env[k] ?? d;

const PORT = Number(env('OMNI_PORT', 8787));
const UDP_PORT = Number(env('OMNI_UDP_PORT', 8790));
const HOST = env('OMNI_HOST', '0.0.0.0');
const DB_PATH = env('OMNI_DB', path.join(__dirname, '..', 'data', 'omniprofiler.db'));
const AUTO_SIM = env('OMNI_SIM', '1') === '1';
const SIM_TRANSPORT = env('OMNI_SIM_TRANSPORT', 'inproc'); // 'inproc' | 'udp'

const stats = { startedAt: Date.now() };

/* ------------------------------- 1) depolama ------------------------------- */
const db = new Storage(DB_PATH, {
  // Örneklem (flamegraph) satırları diskin ~%95'ini tüketir; varsayılan olarak
  // yalnızca canlı bellekteki son ~600 kare için tutulur. Tarihsel flamegraph
  // isterseniz OMNI_DB_SAMPLES=1 ile açın.
  persistSamples: env('OMNI_DB_SAMPLES', '0') === '1',
  retentionMinutes: env('OMNI_DB_RETENTION_MIN') ? Number(env('OMNI_DB_RETENTION_MIN')) : null,
  retentionFramesToo: env('OMNI_DB_RETENTION_FRAMES', '0') === '1',
});
const store = new MetricsStore({ db });
const aggregator = new LogAggregator({ spamThreshold: 5, updateIntervalMs: 400 });
const leaks = new LeakDetector({ windowSec: 12, emitEverySec: 2 });
const findingsEngine = new FindingsEngine({ hitchMs: 33, gcSpikeBytes: 200_000, heapWindowSec: 30, spamCount: 150 });

/* ------------------------------- 2) HTTP/WS -------------------------------- */
const server = http.createServer();
const pipeline = new IngestPipeline({ store, db, logs: aggregator, leaks, findings: findingsEngine, hub: null, sessionInfo: () => store.session });

const hub = new Hub({
  server,
  path: '/ws',
  batchMs: 100,
  tickMs: 250,
  onTick: (kind) => {
    if (kind === 'state') return pipeline.fullState();
    if (kind === 'history') {
      const s = store.series({ maxPoints: 3000 });
      return { type: 'history', series: s, events: pipeline.recentEvents.slice(-200) };
    }
    if (kind === 'snapshot') {
      const snap = store.snapshot({ window: 600 });
      return {
        type: 'snapshot',
        snapshot: snap,
        wire: { sentFrames: hub.sentFrames, sentBytes: hub.sentBytes, sentMessages: hub.sentMessages, clients: hub.clientCount, dbWrites: db.writes },
        logStats: aggregator.stats,
        sim: sim.status(),
        leaks: leaks.snapshot().slice(0, 12),
        findingsCount: pipeline.recentFindings(1000).length,
        tags: aggregator.allTags(),
      };
    }
    return null;
  },
});
pipeline.hub = hub;

/* ------------------------------- 4) simülatör ------------------------------- */
const sim = new UnityAgentSimulator({
  onMessage: (msg, meta) => {
    store.markAgent(msg.seq, 0, 'inproc');
    pipeline.handle(msg, meta ?? { bytes: 0, transport: 'inproc' });
  },
  udpPort: UDP_PORT,
  fps: Number(env('OMNI_SIM_FPS', 60)),
});

attachRoutes({ server, ctx: { store, db, pipeline, aggregator, leaks, findings: findingsEngine, hub, stats, sim } });

/* ------------------------------- 3) UDP dinleyici --------------------------- */
/**
 * Ajan NDJSON gönderir. UDP sınır korumalıdır ama ajan bir datagrama birden
 * çok mesaj koyabilir; ayrıca MAX_DATAGRAM aşılırsa mesaj bölünebilir.
 * Bu yüzden kaynak (addr:port) başına tampon tutulup '\n' görülene kadar
 * biriktirilir.
 */
const udpBuffers = new Map();
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udp.on('message', (buf, rinfo) => {
  const key = `${rinfo.address}:${rinfo.port}`;
  let acc = udpBuffers.get(key);
  if (!acc) { acc = { data: '', last: Date.now() }; udpBuffers.set(key, acc); }
  acc.last = Date.now();
  acc.data += buf.toString('utf8');
  if (acc.data.length > 4 * 1024 * 1024) acc.data = acc.data.slice(-1024 * 1024); // taşma koruması
  let nl;
  let handled = 0;
  while ((nl = acc.data.indexOf('\n')) >= 0 && handled < 64) {
    const line = acc.data.slice(0, nl).trim();
    acc.data = acc.data.slice(nl + 1);
    handled++;
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      store.markAgent(msg.seq, buf.length, 'udp');
      pipeline.handle(msg, { bytes: buf.length, transport: 'udp' });
    } catch (err) {
      stats.parseErrors = (stats.parseErrors ?? 0) + 1;
    }
  }
});
udp.on('error', (err) => console.error('[omni] UDP hatası:', err.message));
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of udpBuffers) if (now - v.last > 30_000) udpBuffers.delete(k);
}, 30_000).unref?.();

/* ------------------------------- 5) başlat --------------------------------- */
server.listen(PORT, HOST, async () => {
  await new Promise((r) => udp.bind(UDP_PORT, '0.0.0.0', r));
  console.log(`\n  OmniProfiler main hazır`);
  console.log(`  ├─ HTTP/WS  : http://${HOST}:${PORT}  (ws: /ws)`);
  console.log(`  ├─ UDP ajan : ${UDP_PORT}/udp  (NDJSON, ${'shared/protocol.js'} şeması)`);
  console.log(`  ├─ SQLite   : ${DB_PATH}`);
  console.log(`  └─ Simülatör: ${AUTO_SIM ? `açık (${SIM_TRANSPORT})` : 'kapalı'}`);
  if (AUTO_SIM) {
    await sim.start(SIM_TRANSPORT);
    console.log(`  └─ Mock Unity Agent çalışıyor: ${sim.status().sessionId}\n`);
  } else console.log('');
});

const shutdown = (sig) => {
  console.log(`\n[omni] ${sig} — kapatılıyor...`);
  try { sim.stop(); } catch { /* yoksay */ }
  try {
    const sid = store.session?.id;
    if (sid) {
      db.flush();
      const s = db.listSessions(50).find((x) => x.id === sid);
      db.upsertSession({ ...(s ?? { id: sid, started_at: store.startedAt }), id: sid, started_at: store.startedAt, ended_at: Date.now(), app: store.session?.app ?? '', platform: store.session?.platform ?? '', unity: store.session?.unity ?? '', device: store.session?.device ?? '', target_fps: store.session?.targetFps ?? 60, deep_profile: store.session?.deepProfile ? 1 : 0, frames: pipeline.counts.frames, logs: pipeline.counts.logs, events: pipeline.counts.events });
    }
  } catch (e) { console.error('[omni] oturum kapatma hatası', e.message); }
  hub.close();
  db.close();
  udp.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
