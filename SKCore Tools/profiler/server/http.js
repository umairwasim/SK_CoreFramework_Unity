/**
 * OmniProfiler — HTTP / REST Katmanı
 *
 * Amaçlar:
 *  1) Canlı akışın dışındaki sorgular (kare detayı, örneklem ağacı, A/B karşılaştırma)
 *  2) TARİHSEL ANALİZ: SQLite'taki ESKİ oturumları listele/aç/kıyasla.
 *     Unity Profiler'da bu kavram hiç yok — oturum kapanınca veri de kapanır.
 *  3) Dışa aktarma (CSV/JSON) — rapor ve CI entegrasyonu için.
 */
import { FRAME_FIELDS } from '../shared/protocol.js';

/** A/B karşılaştırmada gösterilecek metrikler ve "iyi yön" bilgisi. */
export const COMPARE_METRICS = [
  { key: 'dtMs', label: 'Frame Time', unit: 'ms', better: 'lower', digits: 2 },
  { key: 'fps', label: 'FPS', unit: '', better: 'higher', digits: 1 },
  { key: 'gcAllocBytes', label: 'GC Alloc', unit: 'KB', better: 'lower', digits: 1, scale: 1 / 1024 },
  { key: 'monoUsed', label: 'Mono Used', unit: 'MB', better: 'lower', digits: 1, scale: 1 / 1048576 },
  { key: 'monoHeap', label: 'Mono Heap', unit: 'MB', better: 'lower', digits: 1, scale: 1 / 1048576 },
  { key: 'totalReserved', label: 'Total Reserved', unit: 'MB', better: 'lower', digits: 1, scale: 1 / 1048576 },
  { key: 'gfxDriver', label: 'Gfx Driver', unit: 'MB', better: 'lower', digits: 2, scale: 1 / 1048576 },
  { key: 'drawCalls', label: 'Draw Calls', unit: '', better: 'lower', digits: 0 },
  { key: 'batches', label: 'Batches', unit: '', better: 'lower', digits: 0 },
  { key: 'setPassCalls', label: 'SetPass Calls', unit: '', better: 'lower', digits: 0 },
  { key: 'triangles', label: 'Triangles', unit: '', better: 'lower', digits: 0 },
  { key: 'vertices', label: 'Vertices', unit: '', better: 'lower', digits: 0 },
  { key: 'mainThreadMs', label: 'Main Thread', unit: 'ms', better: 'lower', digits: 2 },
  { key: 'renderThreadMs', label: 'Render Thread', unit: 'ms', better: 'lower', digits: 2 },
  { key: 'gpuMs', label: 'GPU (wait)', unit: 'ms', better: 'lower', digits: 2 },
  { key: 'physicsMs', label: 'Physics', unit: 'ms', better: 'lower', digits: 2 },
  { key: 'animMs', label: 'Animation', unit: 'ms', better: 'lower', digits: 2 },
];

export function compareFrames(a, b) {
  const rows = [];
  for (const m of COMPARE_METRICS) {
    const av = (a?.[m.key] ?? 0) * (m.scale ?? 1);
    const bv = (b?.[m.key] ?? 0) * (m.scale ?? 1);
    const delta = bv - av;
    const pct = av !== 0 ? (delta / Math.abs(av)) * 100 : bv !== 0 ? 100 : 0;
    const betterWhen = m.better === 'lower' ? delta < 0 : delta > 0;
    rows.push({
      key: m.key, label: m.label, unit: m.unit, digits: m.digits,
      a: Number(av.toFixed(m.digits)), b: Number(bv.toFixed(m.digits)),
      delta: Number(delta.toFixed(m.digits)), pct: Number(pct.toFixed(1)),
      verdict: Math.abs(pct) < 1 ? 'same' : betterWhen ? 'better' : 'worse',
    });
  }
  return rows;
}

/**
 * Örneklem ağaçlarını fonksiyon adına göre toplam maliyet üzerinden kıyaslar.
 * Düğüm adları sayı içerebilir ("EnemyAI.Update() x34", "SetPass Calls x58");
 * bunlar normalize edilmezse aynı iş iki ayrı satır gibi görünür ve diff çöp olur.
 */
const NAME_NORMALIZE_RE = /(\bx|count=|:|\s)\d+(\.\d+)?\b/g;
export function normalizeSampleName(name) {
  return String(name ?? '').replace(NAME_NORMALIZE_RE, '$1#');
}

export function compareSamples(flatA, flatB) {
  const agg = (flat) => {
    const m = new Map();
    for (const [rawName, selfUs, totalUs, , depth] of flat || []) {
      const name = normalizeSampleName(rawName);
      const e = m.get(name) ?? { name, selfUs: 0, totalUs: 0, calls: 0, maxDepth: 0 };
      e.selfUs += selfUs; e.totalUs += totalUs; e.calls++; e.maxDepth = Math.max(e.maxDepth, depth ?? 0);
      m.set(name, e);
    }
    return m;
  };
  const A = agg(flatA);
  const B = agg(flatB);
  const names = new Set([...A.keys(), ...B.keys()]);
  const rows = [];
  for (const name of names) {
    const a = A.get(name);
    const b = B.get(name);
    const aSelf = a?.selfUs ?? 0;
    const bSelf = b?.selfUs ?? 0;
    rows.push({
      name,
      aSelfUs: aSelf, bSelfUs: bSelf,
      aCalls: a?.calls ?? 0, bCalls: b?.calls ?? 0,
      deltaUs: bSelf - aSelf,
      pct: aSelf ? Number((((bSelf - aSelf) / aSelf) * 100).toFixed(1)) : bSelf ? 100 : 0,
      onlyIn: a && !b ? 'A' : b && !a ? 'B' : null,
    });
  }
  rows.sort((x, y) => Math.abs(y.deltaUs) - Math.abs(x.deltaUs));
  return rows.slice(0, 40);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function csv(res, filename, header, rows) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const body = [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
  });
  res.end(body);
}

export function attachRoutes({ server, ctx }) {
  const { store, db, pipeline, aggregator, leaks, findings, sim, stats } = ctx;

  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const q = url.searchParams;
    if (!p.startsWith('/api/')) return; // statik dosyalar vite'a ait
    try {
      /* ------------------------------ canlı durum ----------------------------- */
      if (p === '/api/state') {
        return json(res, 200, pipeline.fullState());
      }

      if (p === '/api/series') {
        const maxPoints = Number(q.get('maxPoints') ?? 4000);
        const fromT = q.get('from') != null ? Number(q.get('from')) : null;
        const toT = q.get('to') != null ? Number(q.get('to')) : null;
        const fields = (q.get('fields') ?? 'dtMs,fps,gcAllocBytes,monoUsed,totalReserved,drawCalls').split(',');
        return json(res, 200, store.series({ fields, maxPoints, fromT, toT }));
      }

      if (p === '/api/logs') {
        const levels = q.get('levels') ? q.get('levels').split(',') : null;
        const tags = q.get('tags') ? q.get('tags').split(',') : null;
        return json(res, 200, {
          groups: aggregator.list({ levels, tags, search: q.get('search') ?? '', spamOnly: q.get('spam') === '1', limit: Number(q.get('limit') ?? 800) }),
          stats: aggregator.stats,
          tags: aggregator.allTags(),
        });
      }

      if (p.startsWith('/api/logs/')) {
        const g = aggregator.get(decodeURIComponent(p.slice('/api/logs/'.length)));
        if (!g) return json(res, 404, { error: 'group not found' });
        return json(res, 200, g);
      }

      if (p === '/api/events') return json(res, 200, { events: pipeline.recentEvents.slice(-500) });

      if (p === '/api/leaks') {
        return json(res, 200, {
          types: leaks.snapshot(),
          findings: pipeline.recentFindings(200).filter((f) => f.kind === 'leak'),
        });
      }

      if (p === '/api/findings') {
        return json(res, 200, { findings: pipeline.recentFindings(Number(q.get('limit') ?? 200)) });
      }

      if (p === '/api/frames') {
        const fromId = Number(q.get('from'));
        const toId = Number(q.get('to'));
        const out = [];
        for (let i = 0; i < store.size; i++) {
          const f = store.frameAt(i);
          if (!f) continue;
          if (!Number.isNaN(fromId) && f.frameId < fromId) continue;
          if (!Number.isNaN(toId) && f.frameId > toId) continue;
          out.push(f);
          if (out.length > 5000) break;
        }
        return json(res, 200, { frames: out });
      }

      if (p === '/api/frame') {
        const id = Number(q.get('id'));
        const detail = pipeline.frameDetail(id);
        if (!detail) return json(res, 404, { error: `frame ${id} bulunamadı (ring buffer dışında olabilir)` });
        return json(res, 200, detail);
      }

      if (p === '/api/samples') {
        const id = Number(q.get('id'));
        // Ajan bant genişliğini kısmak için örneklem ağacını her karede değil
        // örnekleme aralığında (varsayılan: her 2 karede bir) gönderir.
        // Bu yüzden istenen karede veri yoksa en yakın komşu kareye bakılır.
        let s = pipeline.getSamples(id);
        let usedFrame = id;
        if (!s) { for (const d of [1, -1, 2, -2]) { const cand = pipeline.getSamples(id + d); if (cand) { s = cand; usedFrame = id + d; break; } } }
        if (!s) return json(res, 200, { frameId: id, usedFrame: null, flat: [], totalUs: 0, reason: 'bu kare için örneklem ağacı yok (deep profile kapalı olabilir)' });
        return json(res, 200, { frameId: id, usedFrame, flat: s.flat, totalUs: s.totalUs });
      }

      /* --------------------------- A/B karşılaştırma --------------------------- */
      if (p === '/api/compare') {
        const aId = Number(q.get('a'));
        const bId = Number(q.get('b'));
        const a = store.frameById(aId);
        const b = store.frameById(bId);
        if (!a || !b) return json(res, 404, { error: 'kare(ler) bulunamadı', a: !!a, b: !!b });
        const sa = pipeline.getSamples(aId)?.flat ?? [];
        const sb = pipeline.getSamples(bId)?.flat ?? [];
        return json(res, 200, {
          a: { frameId: aId, ...a }, b: { frameId: bId, ...b },
          rows: compareFrames(a, b),
          samples: compareSamples(sa, sb),
          logsA: pipeline.recentLogs.filter((l) => l.frame === aId).length,
          logsB: pipeline.recentLogs.filter((l) => l.frame === bId).length,
        });
      }

      /* -------------------------- tarihsel analiz (SQLite) --------------------- */
      if (p === '/api/sessions') {
        const sessions = db.listSessions(50);
        return json(res, 200, { current: store.session?.id ?? null, sessions });
      }

      if (p === '/api/history') {
        const sid = q.get('sessionId') ?? store.session?.id;
        if (!sid) return json(res, 404, { error: 'sessionId gerekli' });
        db.flush();
        const statsRow = db.sessionStats(sid);
        const low = db.lowPercentiles(sid);
        return json(res, 200, {
          sessionId: sid,
          stats: statsRow,
          low,
          gcSpikes: db.gcSpikes(sid, Number(q.get('gcThreshold') ?? 200_000), 50),
          topLogGroups: db.topLogGroups(sid, 20),
          objectBalance: db.objectBalance(sid).slice(0, 40),
        });
      }

      /* ------------------------------ simülatör -------------------------------- */
      if (p === '/api/sim' && req.method === 'POST') {
        const body = await readBody(req);
        const out = sim.control(body || {});
        return json(res, 200, out);
      }
      if (p === '/api/sim') return json(res, 200, sim.status());

      /* -------------------------------- dışa aktar ------------------------------ */
      if (p === '/api/export/frames.csv') {
        db.flush();
        const sid = q.get('sessionId') ?? store.session?.id;
        const rows = db.sessionFrames(sid, Number(q.get('from') ?? 0), Number(q.get('to') ?? 1e9));
        const header = ['frame_id', 't_rel', 'fps', 'dt_ms', 'gc_alloc', 'mono_used', 'mono_heap', 'total_reserved', 'gfx', 'draw_calls', 'batches', 'set_pass', 'triangles', 'vertices', 'main_ms', 'render_ms', 'gpu_ms', 'physics_ms', 'anim_ms', 'scene'];
        return csv(res, `omniprofiler-frames-${sid}.csv`, header, rows.map((r) => [r.frame_id, r.t_rel, r.fps, r.dt_ms, r.gc_alloc, r.mono_used, r.mono_heap, r.total_reserved, r.gfx, r.draw_calls, r.batches, r.set_pass, r.triangles, r.vertices, r.main_ms, r.render_ms, r.gpu_ms, r.physics_ms, r.anim_ms, r.scene]));
      }

      if (p === '/api/export/logs.csv') {
        db.flush();
        const sid = q.get('sessionId') ?? store.session?.id;
        const groups = db.topLogGroups(sid, 1000);
        return csv(res, `omniprofiler-logs-${sid}.csv`,
          ['level', 'tag', 'hits', 'first_ts', 'last_ts', 'first_frame', 'message'],
          groups.map((g) => [g.level, g.tag ?? '', g.hits, g.first_ts, g.last_ts, g.first_frame, g.msg]));
      }

      if (p === '/api/db') return json(res, 200, db.diskStats());

      if (p === '/api/db/prune' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.vacuum) db.vacuum();
        else db.prune();
        return json(res, 200, db.diskStats());
      }

      if (p === '/api/health') {
        return json(res, 200, {
          ok: true,
          uptimeSec: Number(process.uptime().toFixed(1)),
          clients: ctx.hub.clientCount,
          framesIngested: pipeline.counts.frames,
          dbWrites: db.writes,
          protocol: { frameFields: FRAME_FIELDS.length },
          disk: (() => { try { const d = db.diskStats(); return { fileSize: d.fileSize, rows: d.rows, policy: d.policy }; } catch { return null; } })(),
          startedAt: stats.startedAt,
        });
      }

      return json(res, 404, { error: 'unknown endpoint', path: p });
    } catch (err) {
      return json(res, 500, { error: String(err?.message ?? err), stack: String(err?.stack ?? '').split('\n').slice(0, 6) });
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
