/**
 * OmniProfiler — Ingestion Pipeline
 *
 * Ajan mesajlarını alır, normalize eder, analiz motorlarından geçirir,
 * (1) bellek içi Store'a, (2) SQLite'a, (3) WebSocket yayın kuyruğuna yazar.
 *
 * Sıralama önemli: analiz motorları "o anki bağlamı" (FPS, bellek, sahne)
 * log kaydına enjekte edebilsin diye önce metrikler işlenir.
 */
import { FRAME_FIELDS, rowToFrame } from '../shared/protocol.js';
import { pickBottleneck } from './analysis.js';

export class IngestPipeline {
  /**
   * @param {object} deps
   * @param {import('./store.js').MetricsStore} deps.store
   * @param {import('./db.js').Storage} deps.db
   * @param {import('./aggregator.js').LogAggregator} deps.logs
   * @param {import('./analysis.js').LeakDetector} deps.leaks
   * @param {import('./analysis.js').FindingsEngine} deps.findings
   * @param {import('./hub.js').Hub} deps.hub
   * @param {() => object} deps.sessionInfo
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.pendingSamples = new Map(); // frameId -> {chunks: [], received: 0, total: 0}
    this.frameSamples = new Map();   // frameId -> flat node array (son ~600 kare)
    this.maxFrameSamples = 600;
    this.recentEvents = [];
    this.maxRecentEvents = 500;
    this.recentLogs = [];            // ham log satırları (Frame Inspector için)
    this.maxRecentLogs = 5000;
    this.scene = 'Bootstrap';
    this.counts = { frames: 0, logs: 0, events: 0, objs: 0, samples: 0, dropped: 0 };
    this.findingsBuf = [];
    this.maxFindings = 500;
  }

  /**
   * Bağlam anlık görüntüsü — log satırlarına enjekte edilir ("Bağlam Enjeksiyonu").
   *
   * Dikkat: log'un karesi ring buffer'dan düşmüş olabilir. Bu durumda "en yeni
   * kareyi" bağlam diye eklemek YANLIŞ olur (1. dakikadaki hataya 10. dakikanın
   * FPS'ini iliştirmek). Bu yüzden yalnızca ±2 sn içindeki en yakın kare kullanılır;
   * bulunamazsa bağlam `approx: true` ile işaretlenir veya sadece sahne yazılır.
   */
  context(frameId) {
    let f = this.store.frameById(frameId);
    let approx = false;
    if (!f && frameId) {
      const near = this.store.nearestByFrameId(frameId);
      // 60 fps varsayımıyla ±2 sn ≈ ±120 kare
      if (near.frame && Math.abs(near.frame.frameId - frameId) <= 120) { f = near.frame; approx = true; }
    }
    if (!f) return { scene: this.scene, approx: true, missingFrame: frameId };
    if (approx) { /* yakın kare kullanıldı */ }
    return {
      fps: Number(f.fps.toFixed(1)),
      dtMs: Number(f.dtMs.toFixed(2)),
      monoUsedMB: Number((f.monoUsed / 1048576).toFixed(1)),
      totalReservedMB: Number((f.totalReserved / 1048576).toFixed(1)),
      gcAllocKB: Number((f.gcAllocBytes / 1024).toFixed(1)),
      drawCalls: f.drawCalls,
      setPass: f.setPassCalls,
      scene: this.scene,
      approx: approx || undefined,
    };
  }

  /* ------------------------------- mesaj yönlendirici ------------------------------ */

  /**
   * @param {object} msg ayrıştırılmış ajan mesajı
   * @param {{bytes:number, transport:'udp'|'ws'|'inproc'}} meta
   */
  handle(msg, meta = {}) {
    switch (msg.t) {
      case 'hello': return this.onHello(msg, meta);
      case 'frame': return this.onFrames(msg, meta);
      case 'log': return this.onLog(msg);
      case 'event': return this.onEvent(msg);
      case 'obj': return this.onObjects(msg);
      case 'scene': return this.onScene(msg);
      case 'samples': return this.onSamples(msg);
      case 'bye': return this.onBye(msg);
      default:
        this.counts.dropped++;
        return null;
    }
  }

  onHello(msg, meta) {
    this.store.markAgent(msg.seq, meta.bytes ?? 0, meta.transport ?? 'udp');
    const session = {
      id: msg.sessionId,
      startedAt: msg.ts || Date.now(),
      app: msg.app || 'Unity App',
      platform: msg.platform || 'unknown',
      unity: msg.unity || '',
      device: msg.device || '',
      targetFps: msg.targetFps ?? 60,
      deepProfile: !!msg.deepProfile,
    };
    this.store.reset(session);
    this.db.upsertSession({
      id: session.id, started_at: session.startedAt, ended_at: null, app: session.app,
      platform: session.platform, unity: session.unity, device: session.device,
      target_fps: session.targetFps, deep_profile: session.deepProfile ? 1 : 0,
      frames: 0, logs: 0, events: 0,
    });
    this.hub.broadcast({ type: 'session', session: { ...session, endedAt: null } });
    this.hub.broadcast({ type: 'agent', agent: { ...this.store.agent, session } });
    return session;
  }

  onFrames(msg, meta) {
    this.store.markAgent(msg.seq, meta.bytes ?? 0, meta.transport ?? 'udp');
    const rows = msg.f || [];
    const sid = this.store.session?.id ?? 'local';
    const startedAt = this.store.startedAt;
    const newFindings = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < FRAME_FIELDS.length) { this.counts.dropped++; continue; }
      const m = rowToFrame(row);
      const ts = (msg.ts ?? Date.now()) + i * Math.max(1, m.dtMs);
      const frameId = m.frameId;
      const samples = this.frameSamples.get(frameId);
      const tRel = (ts - startedAt) / 1000;
      const stored = this.store.push(m, { scene: this.scene, hasSamples: !!samples, ts });
      const fps = stored?.fps ?? (m.dtMs > 0 ? 1000 / m.dtMs : 60);
      this.counts.frames++;

      // --- bulgu motoru ---
      for (const f of this.findings.onFrame({ ...m, fps, scene: this.scene }, tRel)) {
        newFindings.push(this.#emitFinding(f, sid));
      }
      // --- sızıntı dedektörü için heap eğilimi ---
      const heap = {
        monoUsedMB: m.monoUsed / 1048576,
        slopeMBps: this.findings.heapSlopeMBps(tRel),
      };
      for (const f of this.leaks.evaluate(tRel, heap)) {
        f.frameId = frameId;
        newFindings.push(this.#emitFinding(f, sid));
      }

      // --- SQLite (kuyruklanır, 250 ms'de bir transaction ile yazılır) ---
      this.db.queueFrame({
        session_id: sid, frame_id: frameId, t_rel: tRel, ts,
        dt_ms: m.dtMs, fps, gc_alloc: m.gcAllocBytes,
        total_reserved: m.totalReserved, total_allocated: m.totalAllocated,
        mono_heap: m.monoHeap, mono_used: m.monoUsed, gfx: m.gfxDriver,
        draw_calls: m.drawCalls, batches: m.batches, set_pass: m.setPassCalls,
        triangles: m.triangles, vertices: m.vertices,
        main_ms: m.mainThreadMs, render_ms: m.renderThreadMs, gpu_ms: m.gpuMs,
        physics_ms: m.physicsMs, anim_ms: m.animMs, scene: this.scene,
        samples: samples ? 1 : 0, compressed: 0,
      });
      // --- yayın kuyruğu ---
      this.hub.queueFrame({
        t: Number(tRel.toFixed(3)),
        frameId,
        dt: Number(m.dtMs.toFixed(3)),
        fps: Number(stored.fps.toFixed(2)),
        gc: m.gcAllocBytes,
        mono: m.monoUsed,
        heap: m.monoHeap,
        res: m.totalReserved,
        gfx: m.gfxDriver,
        dc: m.drawCalls,
        batches: m.batches,
        sp: m.setPassCalls,
        tri: m.triangles,
        vert: m.vertices,
        main: m.mainThreadMs,
        rend: m.renderThreadMs,
        gpu: m.gpuMs,
        phys: m.physicsMs,
        anim: m.animMs,
        scene: this.scene,
        samples: samples ? 1 : 0,
      });
    }
    if (newFindings.length) this.hub.broadcast({ type: 'finding', findings: newFindings });
    return rows.length;
  }

  onLog(msg) {
    const ctx = this.context(msg.frame);
    const raw = { ts: msg.ts || Date.now(), frame: msg.frame ?? 0, level: msg.level || 'log', msg: msg.msg || '', stack: msg.stack, tag: msg.tag, scene: msg.scene ?? ctx.scene };
    const { action, group, logRow } = this.logs.ingest(raw, ctx);
    this.counts.logs++;

    this.recentLogs.push(logRow);
    if (this.recentLogs.length > this.maxRecentLogs) this.recentLogs.splice(0, this.recentLogs.length - this.maxRecentLogs);

    const sid = this.store.session?.id ?? 'local';
    this.db.queueLog({
      session_id: sid, ts: logRow.ts, frame_id: logRow.frame, level: logRow.level, tag: logRow.tag,
      msg: logRow.msg, stack: logRow.stack, fingerprint: logRow.fingerprint, group_count: 1,
      context_json: ctx ? JSON.stringify(ctx) : null, first_frame: group.firstFrame ?? logRow.frame,
    });

    if (action === 'suppressed') return null;
    this.hub.broadcast({
      type: 'logs',
      action,
      group: {
        id: group.id, level: group.level, tag: group.tag, title: group.title, count: group.count,
        isSpam: group.isSpam, firstTs: group.firstTs, lastTs: group.lastTs, firstFrame: group.firstFrame,
        lastFrame: group.lastFrame, culprit: group.culprit, context: group.context, exceptionType: group.exceptionType,
      },
      row: action === 'new' ? logRow : null,
    });
    const f = this.findings.onLogGroup(group, (logRow.ts - this.store.startedAt) / 1000);
    if (f) { f.frameId = group.lastFrame; this.hub.broadcast({ type: 'finding', findings: [this.#emitFinding(f, sid)] }); }
    return logRow;
  }

  onEvent(msg) {
    const ctx = this.context(msg.frame);
    const ev = {
      ts: msg.ts || Date.now(),
      tRel: Number(((msg.ts || Date.now()) - this.store.startedAt) / 1000).toFixed(3),
      frame: msg.frame ?? 0,
      name: msg.name,
      kind: msg.kind || 'default',
      payload: msg.payload || {},
      context: ctx,
    };
    this.counts.events++;
    this.recentEvents.push(ev);
    if (this.recentEvents.length > this.maxRecentEvents) this.recentEvents.shift();
    this.db.queueEvent({
      session_id: this.store.session?.id ?? 'local', ts: ev.ts, frame_id: ev.frame,
      name: ev.name, kind: ev.kind, payload_json: JSON.stringify(ev.payload),
    });
    this.hub.broadcast({ type: 'events', events: [ev] });
    return ev;
  }

  onObjects(msg) {
    const sid = this.store.session?.id ?? 'local';
    const startedAt = this.store.startedAt;
    const out = [];
    for (const [type, prefab, delta, frame, ts] of msg.d || []) {
      const tRel = ((ts || Date.now()) - startedAt) / 1000;
      const rec = this.leaks.track({ type, prefab, delta, frame, ts: ts || Date.now(), tRel });
      this.counts.objs++;
      this.db.queueObj({
        session_id: sid, ts: ts || Date.now(), frame_id: frame,
        op: delta > 0 ? 'instantiate' : 'destroy', type, prefab: prefab || null,
      });
      out.push({ type, prefab, delta, live: rec.live, spawned: rec.spawned, destroyed: rec.destroyed, frame, tRel: Number(tRel.toFixed(3)) });
    }
    if (out.length) this.hub.broadcast({ type: 'objs', objs: out, snapshot: null });
    return out;
  }

  onScene(msg) {
    this.scene = msg.name || this.scene;
    const ev = { ts: msg.ts, tRel: Number(((msg.ts || Date.now()) - this.store.startedAt) / 1000).toFixed(3), frame: msg.frame, name: `Scene ${msg.op === 'load' ? 'yüklendi' : 'boşaltıldı'}: ${msg.name}`, kind: 'scene', payload: { scene: msg.name, op: msg.op } };
    this.recentEvents.push(ev);
    this.hub.broadcast({ type: 'scene', scene: this.scene, event: ev });
    return ev;
  }

  /**
   * Flamegraph verisi: Profiler.BeginSample/EndSample ağacı.
   * Büyük kareler birden çok datagrama bölünebildiği için burada birleştirilir.
   */
  onSamples(msg) {
    const frameId = msg.frame;
    const n = msg.n ?? 1;
    const i = msg.i ?? 0;
    let buf = this.pendingSamples.get(frameId);
    if (!buf) { buf = { chunks: new Array(n).fill(null), received: 0, total: n, ts: msg.ts }; this.pendingSamples.set(frameId, buf); }
    if (buf.chunks[i] == null) { buf.chunks[i] = msg.s || []; buf.received++; }
    if (buf.received < buf.total) return null;

    const flat = buf.chunks.flat();
    this.pendingSamples.delete(frameId);
    this.frameSamples.set(frameId, { flat, ts: buf.ts, totalUs: flat.length ? flat[0][2] : 0 });
    if (this.frameSamples.size > this.maxFrameSamples) {
      const oldest = this.frameSamples.keys().next().value;
      this.frameSamples.delete(oldest);
    }
    this.counts.samples++;
    const sid = this.store.session?.id ?? 'local';
    const rows = [];
    for (let k = 0; k < flat.length; k++) {
      const [name, selfUs, totalUs, childCount, depth] = flat[k];
      rows.push([sid, frameId, name, selfUs, totalUs, depth ?? 0, k]);
    }
    this.db.queueSamplesIfEnabled(rows);
    this.hub.broadcast({ type: 'samples', frameId, nodes: flat.length, totalUs: this.frameSamples.get(frameId).totalUs });
    return flat;
  }

  getSamples(frameId) {
    return this.frameSamples.get(frameId) ?? null;
  }

  /** Kare detayı: metrik + örneklem ağacı + o kareye ait loglar + olaylar. */
  frameDetail(frameId) {
    let frame = this.store.frameById(frameId);
    let approx = false;
    if (!frame) {
      const near = this.store.nearestByFrameId(frameId);
      if (!near.frame) return null;
      frame = { ...near.frame, requestedFrameId: frameId };
      approx = true;
    }
    let samples = this.frameSamples.get(frameId);
    let samplesFrame = samples ? frameId : null;
    if (!samples) {
      for (const d of [1, -1, 2, -2]) {
        const cand = this.frameSamples.get(frameId + d);
        if (cand) { samples = cand; samplesFrame = frameId + d; break; }
      }
    }
    const logs = [];
    for (let k = this.recentLogs.length - 1; k >= 0 && logs.length < 40; k--) {
      const l = this.recentLogs[k];
      if (l.frame === frameId) logs.unshift(publicLog(l));
    }
    const events = this.recentEvents.filter((e) => e.frame === frameId);
    return {
      approx,
      frame: { ...frame, bottleneck: pickBottleneck(frame) },
      samples: samples ? { flat: samples.flat, totalUs: samples.totalUs, fromFrame: samplesFrame } : null,
      logs,
      events,
    };
  }

  #emitFinding(f, sid) {
    const finding = {
      id: `${f.kind}-${f.tRel?.toFixed?.(2) ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      kind: f.kind,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      tRel: f.tRel,
      frameId: f.frameId ?? f.detail?.frameId ?? null,
    };
    this.db.queueFinding({
      session_id: sid, ts: finding.ts, kind: finding.kind, severity: finding.severity,
      title: finding.title, detail_json: JSON.stringify(finding.detail), frame_id: finding.frameId,
    });
    this.findingsBuf.push(finding);
    if (this.findingsBuf.length > this.maxFindings) this.findingsBuf.shift();
    return finding;
  }

  onBye(msg) {
    this.store.agent.connected = false;
    this.hub.broadcast({ type: 'agent', agent: { ...this.store.agent, bye: msg.reason ?? 'agent closed' } });
  }

  /** WebSocket'e yeni bağlanan istemciye gönderilen tam durum. */
  fullState() {
    const snap = this.store.snapshot();
    return {
      type: 'state',
      session: this.store.session,
      agent: this.store.agent,
      scene: this.scene,
      snapshot: snap,
      lowWindow: snap?.window ?? 0,
      stats: {
        ...this.counts,
        logEngine: this.logs.stats,
        dbWrites: this.db.writes,
        wire: { frames: this.store.wireFrames, bytes: this.store.wireBytes },
      },
      findings: this.recentFindings(),
      leaks: this.leaks.snapshot().slice(0, 40),
      events: this.recentEvents.slice(-200),
      logGroups: this.logs.list({ limit: 400 }),
      tags: this.logs.allTags(),
    };
  }

  recentFindings(limit = 200) {
    return this.findingsBuf.slice(-limit);
  }
}

function publicLog(l) {
  return {
    ts: l.ts, frame: l.frame, level: l.level, tag: l.tag, msg: l.msg,
    stack: l.stack, fingerprint: l.fingerprint, culprit: l.culprit, context: l.context,
  };
}

export { FRAME_FIELDS };
