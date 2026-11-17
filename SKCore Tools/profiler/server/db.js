/**
 * OmniProfiler — Yerel Depolama (SQLite / better-sqlite3)
 *
 * Neden SQLite? Unity Profiler bir ring-buffer'dır: son ~300 kareyi tutar ve
 * oturum biter bitmez veri kaybolur. OmniProfiler TÜM oturumu diske yazar;
 * böylece "10. dakikadaki GC spike'ı" ile "1. dakikayı" karşılaştırabilir,
 * hatta geçen haftaki oturumla bugünkünü kıyaslayabilirsiniz.
 *
 * Yazma stratejisi (kritik):
 *  - better-sqlite3 senkrondur ve çok hızlıdır, ama her kare için ayrı INSERT
 *    yapmak 60 fps'te diske 60 transaction/saniye demek olur.
 *  - Bu yüzden yazmalar WAL modunda, tek bir transaction içinde, ~250 ms'de
 *    bir "flush" edilir. Renderer'a giden veri ise bellekten (Store) akar —
 *    disk hiçbir zaman UI yolunu bloklamaz.
 *
 * Electron'a taşırken: bu dosya olduğu gibi `electron/main/db.js` olur.
 * Tek değişiklik `dbPath`'in `app.getPath('userData')` altına alınmasıdır.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { FRAME_FIELDS } from '../shared/protocol.js';

const FLUSH_INTERVAL_MS = 250;

export class Storage {
  #buffer;
  #flushTx;
  #timer;
  #pruneTimer;

  /**
   * @param {string} dbPath
   * @param {object} [opts]
   * @param {boolean} [opts.persistSamples=true]  örneklem ağaçlarını (flamegraph) diske yaz.
   *        KAPATILIRSA disk kullanımı ~%95 azalır; flamegraph yalnızca canlı bellekteki
   *        son ~600 kare için kullanılabilir olur (çoğu hata ayıklama için yeterli).
   * @param {number|null} [opts.retentionMinutes=null] null = sonsuza dek sakla.
   *        Sayı verilirse bu pencereden eski `samples` (ve `retentionFramesToo=true` ise
   *        `frames`) satırları periyodik olarak silinir.
   * @param {boolean} [opts.retentionFramesToo=false] kareleri de buda (tarihsel analizi bozar!)
   * @param {number} [opts.pruneEveryMs=30000] budama döngüsü aralığı
   */
  constructor(dbPath, opts = {}) {
    this.opts = {
      persistSamples: opts.persistSamples !== false,
      retentionMinutes: opts.retentionMinutes ?? null,
      retentionFramesToo: !!opts.retentionFramesToo,
      pruneEveryMs: opts.pruneEveryMs ?? 30_000,
      dbPath,
    };
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL'); // veri kaybı riski düşük, hız yüksek
    this.db.pragma('cache_size = -32000');  // 32 MB
    this.#migrate();

    // Hazır statement'lar (better-sqlite3'te prepared statement cache'i hayati)
    this.stmt = {
      insertSession: this.db.prepare(`INSERT OR REPLACE INTO sessions
        (id, started_at, ended_at, app, platform, unity, device, target_fps, deep_profile, frames, logs, events)
        VALUES (@id,@started_at,@ended_at,@app,@platform,@unity,@device,@target_fps,@deep_profile,@frames,@logs,@events)`),
      insertFrame: this.db.prepare(`INSERT INTO frames
        (session_id, frame_id, t_rel, ts, dt_ms, fps, gc_alloc, total_reserved, total_allocated,
         mono_heap, mono_used, gfx, draw_calls, batches, set_pass, triangles, vertices,
         main_ms, render_ms, gpu_ms, physics_ms, anim_ms, scene, samples, compressed)
        VALUES (@session_id,@frame_id,@t_rel,@ts,@dt_ms,@fps,@gc_alloc,@total_reserved,@total_allocated,
         @mono_heap,@mono_used,@gfx,@draw_calls,@batches,@set_pass,@triangles,@vertices,
         @main_ms,@render_ms,@gpu_ms,@physics_ms,@anim_ms,@scene,@samples,@compressed)`),
      insertSample: this.db.prepare(
        `INSERT INTO samples (session_id, frame_id, name, self_us, total_us, depth, idx) VALUES (?,?,?,?,?,?,?)`),
      insertLog: this.db.prepare(`INSERT INTO logs
        (session_id, ts, frame_id, level, tag, msg, stack, fingerprint, group_count, context_json, first_frame)
        VALUES (@session_id,@ts,@frame_id,@level,@tag,@msg,@stack,@fingerprint,@group_count,@context_json,@first_frame)`),
      insertEvent: this.db.prepare(`INSERT INTO events
        (session_id, ts, frame_id, name, kind, payload_json) VALUES (@session_id,@ts,@frame_id,@name,@kind,@payload_json)`),
      insertObj: this.db.prepare(`INSERT INTO object_events
        (session_id, ts, frame_id, op, type, prefab) VALUES (@session_id,@ts,@frame_id,@op,@type,@prefab)`),
      insertFinding: this.db.prepare(`INSERT INTO findings
        (session_id, ts, kind, severity, title, detail_json, frame_id)
        VALUES (@session_id,@ts,@kind,@severity,@title,@detail_json,@frame_id)`),
    };

    this.#buffer = { frames: [], samples: [], logs: [], events: [], objs: [], findings: [] };
    this.#flushTx = this.db.transaction(() => {
      const b = this.#buffer;
      for (const f of b.frames) this.stmt.insertFrame.run(f);
      for (const s of b.samples) this.stmt.insertSample.run(...s);
      for (const l of b.logs) this.stmt.insertLog.run(l);
      for (const e of b.events) this.stmt.insertEvent.run(e);
      for (const o of b.objs) this.stmt.insertObj.run(o);
      for (const f of b.findings) this.stmt.insertFinding.run(f);
      b.frames.length = b.samples.length = b.logs.length = 0;
      b.events.length = b.objs.length = b.findings.length = 0;
    });
    this.#timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    this.#timer.unref?.();
    this.writes = 0;
    this.pruned = { samples: 0, frames: 0, runs: 0 };
    this.#pruneTimer = setInterval(() => this.prune(), this.opts.pruneEveryMs);
    this.#pruneTimer.unref?.();
  }

  /** Örneklem satırlarını kuyruğa al (saklama politikası kapalıysa hiç yazılmaz). */
  queueSamplesIfEnabled(rows) {
    if (!this.opts.persistSamples) return 0;
    this.queueSamples(rows);
    return rows.length;
  }

  /**
   * Saklama politikası: eski örneklem/kare satırlarını sil.
   *
   * Neden gerekli? 60 fps'te her kare için ~25-40 örneklem satırı yazmak, saatte
   * ~9 milyon satır = GB'larca disk demek. Ölçüm: 19 dakikada 364 MB.
   * Kareler (frames) tarihsel analizin belkemiği olduğu için varsayılan olarak
   * KORUNUR; budanan yalnızca hacimli örneklem verisidir.
   */
  prune() {
    const mins = this.opts.retentionMinutes;
    if (mins == null || mins <= 0) return this.pruned;
    this.flush();
    const cutoff = Date.now() - mins * 60_000;
    try {
      const r1 = this.db.prepare(`DELETE FROM samples WHERE session_id IN (SELECT id FROM sessions WHERE started_at < ?)`).run(cutoff);
      this.pruned.samples += r1.changes;
      if (this.opts.retentionFramesToo) {
        const r2 = this.db.prepare(`DELETE FROM frames WHERE session_id IN (SELECT id FROM sessions WHERE started_at < ?)`).run(cutoff);
        this.pruned.frames += r2.changes;
      }
      this.pruned.runs++;
    } catch (e) {
      this.pruned.lastError = String(e?.message ?? e);
    }
    return this.pruned;
  }

  /** Disk ve satır sayaçları (panelde "Disk & Saklama" kartı bunu gösterir). */
  diskStats() {
    this.flush();
    let fileSize = 0;
    if (this.opts.dbPath !== ':memory:') {
      try {
        const st = fs.statSync(this.opts.dbPath);
        fileSize = st.size;
        for (const suffix of ['-wal', '-shm']) {
          try { fileSize += fs.statSync(this.opts.dbPath + suffix).size; } catch { /* yok */ }
        }
      } catch { /* henüz oluşmadı */ }
    }
    const count = (t) => { try { return this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { return 0; } };
    const pages = this.db.pragma('page_count', { simple: true }) ?? 0;
    const freelist = this.db.pragma('freelist_count', { simple: true }) ?? 0;
    return {
      dbPath: this.opts.dbPath,
      fileSize,
      pages, freelist,
      reclaimableBytes: freelist * (this.db.pragma('page_size', { simple: true }) ?? 4096),
      rows: {
        sessions: count('sessions'), frames: count('frames'), samples: count('samples'),
        logs: count('logs'), events: count('events'), object_events: count('object_events'),
        findings: count('findings'),
      },
      writes: this.writes,
      pruned: { ...this.pruned },
      policy: { ...this.opts, pruneEveryMs: undefined },
    };
  }

  /** Boş sayfaları dosyadan geri kazan (VACUUM). Kapatırken veya elle çağrılır. */
  vacuum() {
    try { this.flush(); this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.exec('VACUUM'); return true; }
    catch (e) { this.pruned.vacuumError = String(e?.message ?? e); return false; }
  }

  #migrate() {
    this.db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER,
      app          TEXT, platform TEXT, unity TEXT, device TEXT,
      target_fps   INTEGER, deep_profile INTEGER DEFAULT 0,
      frames       INTEGER DEFAULT 0, logs INTEGER DEFAULT 0, events INTEGER DEFAULT 0,
      notes        TEXT
    );
    CREATE TABLE IF NOT EXISTS frames (
      id             INTEGER PRIMARY KEY,
      session_id     TEXT NOT NULL,
      frame_id       INTEGER NOT NULL,
      t_rel          REAL NOT NULL,          -- oturum başından saniye (grafik ekseni)
      ts             INTEGER NOT NULL,
      dt_ms          REAL, fps REAL,
      gc_alloc       INTEGER,                -- kare başına managed alloc (byte)
      total_reserved INTEGER, total_allocated INTEGER,
      mono_heap      INTEGER, mono_used INTEGER, gfx INTEGER,
      draw_calls     INTEGER, batches INTEGER, set_pass INTEGER,
      triangles      INTEGER, vertices INTEGER,
      main_ms REAL, render_ms REAL, gpu_ms REAL, physics_ms REAL, anim_ms REAL,
      scene          TEXT,
      samples        INTEGER DEFAULT 0,      -- bu karede örneklem ağacı var mı
      compressed     INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_frames_session_t ON frames(session_id, t_rel);
    CREATE INDEX IF NOT EXISTS idx_frames_fid ON frames(session_id, frame_id);

    CREATE TABLE IF NOT EXISTS samples (
      session_id TEXT NOT NULL, frame_id INTEGER NOT NULL,
      name TEXT, self_us INTEGER, total_us INTEGER, depth INTEGER, idx INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_samples ON samples(session_id, frame_id, idx);

    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY,
      session_id  TEXT NOT NULL,
      ts          INTEGER NOT NULL,
      frame_id    INTEGER,
      level       TEXT, tag TEXT,
      msg         TEXT, stack TEXT,
      fingerprint TEXT,
      group_count INTEGER DEFAULT 1,         -- agregasyon: bu satır kaç ham logu temsil ediyor
      context_json TEXT,                     -- hata anındaki FPS/bellek/sahne anlık görüntüsü
      first_frame INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_logs_session_ts ON logs(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_logs_fp ON logs(session_id, fingerprint);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL,
      ts INTEGER NOT NULL, frame_id INTEGER, name TEXT, kind TEXT, payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, ts);

    CREATE TABLE IF NOT EXISTS object_events (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL,
      ts INTEGER NOT NULL, frame_id INTEGER, op TEXT, type TEXT, prefab TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_obj_session ON object_events(session_id, ts);

    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, ts INTEGER NOT NULL,
      kind TEXT, severity TEXT, title TEXT, detail_json TEXT, frame_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_findings ON findings(session_id, ts);
    `);
  }

  /* ----------------------------- yazma kuyruğu ---------------------------- */
  queueFrame(f) { this.#buffer.frames.push(f); }
  queueSamples(rows) { for (const r of rows) this.#buffer.samples.push(r); }
  queueLog(l) { this.#buffer.logs.push(l); }
  queueEvent(e) { this.#buffer.events.push(e); }
  queueObj(o) { this.#buffer.objs.push(o); }
  queueFinding(f) { this.#buffer.findings.push(f); }

  flush() {
    const b = this.#buffer;
    if (!b.frames.length && !b.samples.length && !b.logs.length && !b.events.length && !b.objs.length && !b.findings.length) return 0;
    const n = b.frames.length + b.samples.length + b.logs.length + b.events.length + b.objs.length + b.findings.length;
    this.#flushTx();
    this.writes += n;
    return n;
  }

  upsertSession(s) { this.stmt.insertSession.run(s); }

  /* ------------------------------- sorgular ------------------------------- */
  listSessions(limit = 50) {
    return this.db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?`).all(limit);
  }

  /** Tarihsel analiz: bir oturumun özet istatistikleri (SQLite tarafında hesaplanır). */
  sessionStats(sessionId) {
    return this.db.prepare(`
      SELECT COUNT(*) AS frames,
             AVG(fps) AS fps_avg, MIN(fps) AS fps_min,
             AVG(dt_ms) AS dt_avg, MAX(dt_ms) AS dt_max,
             SUM(gc_alloc) AS gc_total, MAX(gc_alloc) AS gc_max_frame,
             MAX(mono_used) AS mono_used_max, MAX(total_reserved) AS reserved_max,
             AVG(draw_calls) AS dc_avg, MAX(draw_calls) AS dc_max,
             AVG(set_pass) AS sp_avg, MAX(set_pass) AS sp_max,
             AVG(triangles) AS tri_avg
      FROM frames WHERE session_id = ?`).get(sessionId);
  }

  /**
   * 1% / 0.1% low hesabı SQL ile: en kötü %1'lik dilimin ORTALAMA fps'i.
   * Unity Profiler'da bu yoktur; stutter analizinin kalbidir.
   */
  lowPercentiles(sessionId) {
    const rows = this.db.prepare(`SELECT fps FROM frames WHERE session_id=? AND fps IS NOT NULL ORDER BY fps ASC`).all(sessionId);
    const fps = rows.map((r) => r.fps);
    if (!fps.length) return null;
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const take = (p) => {
      const n = Math.max(1, Math.round(fps.length * p));
      return avg(fps.slice(0, n));
    };
    return { count: fps.length, avg: avg(fps), min: fps[0], p01: take(0.01), p001: take(0.001), p50: fps[Math.floor(fps.length * 0.5)] };
  }

  /** GC spike listesi — diskteki tüm oturumdan (ring buffer değil!). */
  gcSpikes(sessionId, thresholdBytes, limit = 200) {
    return this.db.prepare(`
      SELECT frame_id, t_rel, fps, gc_alloc, mono_used, scene FROM frames
      WHERE session_id=? AND gc_alloc >= ? ORDER BY gc_alloc DESC LIMIT ?`).all(sessionId, thresholdBytes, limit);
  }

  /**
   * Log spam sıralaması: hangi fingerprint en çok tekrar etmiş.
   * Gruplama ANAHTARI fingerprint'tir (mesaj zaten normalize edilerek üretildi);
   * ham msg GROUP BY'a girerse "Raycast hit 132/194/..." gibi sayı içeren
   * mesajlar aynı spam'i yüzlerce gruba böler. Temsilci mesaj = en erken satır.
   */
  topLogGroups(sessionId, limit = 30) {
    return this.db.prepare(`
      SELECT fingerprint, level, tag,
             SUM(group_count) AS hits,
             MIN(ts) AS first_ts, MAX(ts) AS last_ts, MIN(frame_id) AS first_frame,
             (SELECT l2.msg FROM logs l2
               WHERE l2.session_id = logs.session_id AND l2.fingerprint = logs.fingerprint
               ORDER BY l2.ts ASC, l2.rowid ASC LIMIT 1) AS msg
      FROM logs WHERE session_id=?
      GROUP BY fingerprint, level, tag
      ORDER BY hits DESC LIMIT ?`).all(sessionId, limit);
  }

  /** Sızıntı doğrulaması: tip bazında instantiate/destroy dengesi (disk üzerinden). */
  objectBalance(sessionId) {
    return this.db.prepare(`
      SELECT type, prefab,
             SUM(CASE WHEN op='instantiate' THEN 1 ELSE 0 END) AS spawned,
             SUM(CASE WHEN op='destroy' THEN 1 ELSE 0 END) AS destroyed
      FROM object_events WHERE session_id=? GROUP BY type, prefab ORDER BY spawned DESC`).all(sessionId);
  }

  frameSamples(sessionId, frameId) {
    return this.db.prepare(`SELECT name, self_us, total_us, depth, idx FROM samples
      WHERE session_id=? AND frame_id=? ORDER BY idx ASC`).all(sessionId, frameId);
  }

  sessionFrames(sessionId, fromT, toT) {
    return this.db.prepare(`SELECT * FROM frames WHERE session_id=? AND t_rel BETWEEN ? AND ? ORDER BY t_rel ASC`).all(sessionId, fromT, toT);
  }

  close() {
    clearInterval(this.#timer);
    clearInterval(this.#pruneTimer);
    this.flush();
    try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* yoksay */ }
    this.db.close();
  }
}

export const FRAME_COLUMNS = FRAME_FIELDS;
