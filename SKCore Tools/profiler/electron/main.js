/**
 * OmniProfiler — Electron Main Process
 *
 * Bu dosya, web prototipindeki `server/index.js` ile AYNI işi yapar; tek fark
 * taşıma katmanıdır:
 *
 *   web prototipi : Hub -> WebSocket -> tarayıcı
 *   Electron      : Hub -> webContents.send('omni', ...) -> preload -> renderer
 *
 * Pipeline (ingest.js), analiz motorları (aggregator.js, analysis.js) ve
 * depolama (db.js) DEĞİŞMEDEN kullanılır. Yani prototipte doğruladığınız
 * davranış, masaüstü uygulamasında da aynıdır.
 *
 * Çalıştırma:
 *   cd electron && npm i && npm run dist   (veya geliştirme: npm start)
 */
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const dgram = require('node:dgram');
const http = require('node:http');

// ESM modüllerini CJS Electron main'den dinamik import ile yüklüyoruz.
let bootPromise = null;

const UDP_PORT = Number(process.env.OMNI_UDP_PORT || 8790);
const API_PORT = Number(process.env.OMNI_PORT || 8787); // REST (CSV export, tarihsel sorgular)

async function boot() {
  const root = path.join(__dirname, '..');
  const [{ Storage }, { MetricsStore }, { LogAggregator }, { LeakDetector, FindingsEngine },
         { IngestPipeline }, { Hub }, { attachRoutes }, { UnityAgentSimulator }] = await Promise.all([
    import(path.join(root, 'server/db.js')),
    import(path.join(root, 'server/store.js')),
    import(path.join(root, 'server/aggregator.js')),
    import(path.join(root, 'server/analysis.js')),
    import(path.join(root, 'server/ingest.js')),
    import(path.join(root, 'server/hub.js')),
    import(path.join(root, 'server/http.js')),
    import(path.join(root, 'tools/mock-unity-agent.js')),
  ]);

  const dbPath = path.join(app.getPath('userData'), 'omniprofiler.db');
  const db = new Storage(dbPath);
  const store = new MetricsStore({ db });
  const aggregator = new LogAggregator({ spamThreshold: 5, updateIntervalMs: 400 });
  const leaks = new LeakDetector({ windowSec: 12, emitEverySec: 2 });
  const findingsEngine = new FindingsEngine({});
  const pipeline = new IngestPipeline({ store, db, logs: aggregator, leaks, findings: findingsEngine, hub: null, sessionInfo: () => store.session });

  // --- Hub: Electron'da yayın hedefi BrowserWindow'dur -----------------------
  // Hub sınıfı WebSocket sunucusu bekler; burada "sahte sunucu" yerine Hub'ı
  // kullanmayıp doğrudan webContents'e yayan ince bir sarmalayıcı kullanıyoruz.
  const hub = {
    clientCount: 0,
    sentFrames: 0, sentBytes: 0, sentMessages: 0,
    _q: [],
    queueFrame(f) { this._q.push(f); },
    broadcast(obj) {
      this.sentMessages++;
      const data = JSON.stringify(obj);
      this.sentBytes += data.length;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('omni', obj);
      }
    },
    close() { clearInterval(this._t); },
  };
  hub._t = setInterval(() => {
    if (!hub._q.length) return;
    const frames = hub._q.splice(0, hub._q.length);
    hub.sentFrames += frames.length;
    hub.broadcast({ type: 'frames', frames });
  }, 100);
  setInterval(() => {
    const snap = store.snapshot({ window: 600 });
    hub.broadcast({
      type: 'snapshot', snapshot: snap, logStats: aggregator.stats, sim: sim.status(),
      leaks: leaks.snapshot().slice(0, 12), findingsCount: pipeline.recentFindings(1000).length,
      tags: aggregator.allTags(),
      wire: { sentFrames: hub.sentFrames, sentBytes: hub.sentBytes, sentMessages: hub.sentMessages, clients: hub.clientCount, dbWrites: db.writes },
    });
  }, 250);
  pipeline.hub = hub;

  // --- REST (CSV export + tarihsel sorgular için küçük HTTP sunucusu) --------
  const server = http.createServer();
  const sim = new UnityAgentSimulator({
    onMessage: (msg, meta) => { store.markAgent(msg.seq, 0, 'inproc'); pipeline.handle(msg, meta ?? { bytes: 0, transport: 'inproc' }); },
    udpPort: UDP_PORT, fps: 60,
  });
  attachRoutes({ server, ctx: { store, db, pipeline, aggregator, leaks, findings: findingsEngine, hub, stats: { startedAt: Date.now() }, sim } });
  await new Promise((r) => server.listen(API_PORT, '127.0.0.1', r));

  // --- UDP dinleyici (gerçek Unity ajanı buraya bağlanır) --------------------
  const udpBuffers = new Map();
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', (buf, rinfo) => {
    const key = `${rinfo.address}:${rinfo.port}`;
    let acc = udpBuffers.get(key);
    if (!acc) { acc = { data: '', last: Date.now() }; udpBuffers.set(key, acc); }
    acc.last = Date.now();
    acc.data += buf.toString('utf8');
    let nl;
    while ((nl = acc.data.indexOf('\n')) >= 0) {
      const line = acc.data.slice(0, nl).trim();
      acc.data = acc.data.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        store.markAgent(msg.seq, buf.length, 'udp');
        pipeline.handle(msg, { bytes: buf.length, transport: 'udp' });
      } catch { /* bozuk paket: atla */ }
    }
  });
  await new Promise((r) => udp.bind(UDP_PORT, '0.0.0.0', r));

  // --- IPC köprüsü -----------------------------------------------------------
  ipcMain.handle('omni:state', () => pipeline.fullState());
  ipcMain.handle('omni:history', () => ({
    type: 'history',
    series: store.series({ maxPoints: 3000 }),
    events: pipeline.recentEvents.slice(-200),
  }));
  ipcMain.handle('omni:api', async (_e, p) => {
    // Renderer POST gövdesini "path#json" biçiminde gönderir (preload yalnızca
    // tek string alır). '#' sonrası varsa istek POST'a çevrilir.
    const hashIdx = String(p).indexOf('#');
    const isPost = hashIdx >= 0;
    const path = isPost ? String(p).slice(0, hashIdx) : String(p);
    const body = isPost ? String(p).slice(hashIdx + 1) : undefined;
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api${path}`, isPost
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body }
      : undefined);
    return res.json();
  });
  ipcMain.handle('omni:sim', async (_e, body) => {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/sim`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    return res.json();
  });
  ipcMain.handle('omni:dbPath', () => dbPath);
  ipcMain.handle('omni:openDbFolder', () => shell.openPath(path.dirname(dbPath)));

  return { db, store, pipeline, aggregator, leaks, sim, udp, server, hub, dbPath };
}

let ctx = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1720,
    height: 1000,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    title: 'OmniProfiler',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.OMNI_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (ctx) ctx.hub.clientCount = 1;
  win.on('closed', () => { if (ctx) ctx.hub.clientCount = 0; win = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'OmniProfiler',
      submenu: [
        { label: 'Kayıt: Başlat/Durdur (mock ajan)', click: () => ctx?.sim.control({ action: ctx.sim.status().running ? 'stop' : 'start' }) },
        { label: 'GC Spike Enjekte Et', click: () => ctx?.sim.control({ action: 'gcSpike', bytes: 2400000 }) },
        { type: 'separator' },
        { label: 'Veritabanı Klasörünü Aç', click: () => ctx && shell.openPath(path.dirname(ctx.dbPath)) },
        { label: 'Kareleri CSV Dışa Aktar…', click: async () => {
            const r = await dialog.showSaveDialog({ defaultPath: 'omniprofiler-frames.csv' });
            if (r.canceled || !r.filePath) return;
            const res = await fetch(`http://127.0.0.1:${API_PORT}/api/export/frames.csv`);
            require('node:fs').writeFileSync(r.filePath, await res.text());
          } },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Görünüm', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  ctx = await boot();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // Gerçek Unity ajanı beklenirken demo verisi görmek isterseniz satırı açın:
  // ctx.sim.control({ action: 'start' });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
  try { ctx?.sim.stop(); } catch { /* yoksay */ }
  try { ctx?.hub.close(); } catch { /* yoksay */ }
  try { ctx?.udp.close(); } catch { /* yoksay */ }
  try { ctx?.server.close(); } catch { /* yoksay */ }
  try { ctx?.db.close(); } catch { /* yoksay */ }
});
