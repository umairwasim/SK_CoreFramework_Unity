/**
 * OmniProfiler — analiz motoru birim testleri (sunucu tarafı, DOM'suz).
 *
 * Bu testler raporun iddialarını KOD DÜZEYİNDE doğrular:
 *   1) Log agregasyonu gerçekten spam'i katlıyor mu? (x50 -> 1 satır)
 *   2) Etiket (tag) çıkarımı ve stack trace "suçlu kare" tespiti doğru mu?
 *   3) Bağlam enjeksiyonu log'a FPS/bellek/sahne ekliyor mu?
 *   4) 1% / 0.1% low hesabı beklenen değeri veriyor mu?
 *   5) Sızıntı dedektörü gerçek sızıntıyı yakalayıp sağlıklı havuzu AKLIYOR mu?
 *      (yanlış pozitif koruması)
 *   6) A/B karşılaştırma "iyi/kötü" yönünü doğru mu işaretliyor?
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  LogAggregator, normalizeMessage, parseStack, extractTag, fingerprint,
} from '../server/aggregator.js';
import { LeakDetector, FindingsEngine, pickBottleneck } from '../server/analysis.js';
import { computeLowPercentiles, MetricsStore } from '../server/store.js';
import { compareFrames, compareSamples, normalizeSampleName } from '../server/http.js';
import { Storage } from '../server/db.js';
import { IngestPipeline } from '../server/ingest.js';
import { FRAME_FIELDS } from '../shared/protocol.js';

describe('1) Log agregasyonu (spam önleme)', () => {
  it('aynı hatanın 50 tekrarı tek satıra iner ve ilk/son zamanı saklar', () => {
    const agg = new LogAggregator({ spamThreshold: 5, updateIntervalMs: 50 });
    const ctx = { fps: 41.2, monoUsedMB: 148, scene: 'Level_02' };
    let published = 0;
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 12);
    for (let i = 0; i < 50; i++) {
      const r = agg.ingest({
        ts: t0 + i * 660, frame: 1000 + i, level: 'exception',
        msg: 'NullReferenceException: Object reference not set to an instance of an object',
        stack: 'UIHUDController.RefreshHealthBar () (at Assets/Scripts/UI/UIHUDController.cs:214)\nUnityEngine.Canvas.SendWillRenderCanvases ()',
      }, ctx);
      if (r.action !== 'suppressed') published++;
    }
    const groups = agg.list();
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(50);
    expect(groups[0].isSpam).toBe(true);
    // 50 satır yerine çok az sayıda yayın: 1 yeni + throttle edilmiş güncellemeler
    expect(published).toBeLessThan(15);
    expect(agg.stats.suppressed).toBeGreaterThan(35);
    // "İlk: 00:12, Son: 00:45" davranışı
    expect(groups[0].firstTs).toBe(t0);
    expect(groups[0].lastTs).toBe(t0 + 49 * 660);
    expect(groups[0].firstFrame).toBe(1000);
    expect(groups[0].lastFrame).toBe(1049);
  });

  it('değişken sayılar içeren mesajlar aynı parmak izine düşer', () => {
    const a = normalizeMessage('Raycast hit 412 colliders in frame 10233');
    const b = normalizeMessage('Raycast hit 7 colliders in frame 999');
    expect(a).toBe(b);
    expect(fingerprint('warn', 'Physics', a, null)).toBe(fingerprint('warn', 'Physics', b, null));
    // ama farklı seviye/etiket farklı parmak izi üretmeli
    expect(fingerprint('error', 'Physics', a, null)).not.toBe(fingerprint('warn', 'Physics', a, null));
  });

  it('farklı hatalar farklı gruplarda kalır (aşırı birleştirme yok)', () => {
    const agg = new LogAggregator();
    agg.ingest({ ts: 1, frame: 1, level: 'error', msg: '[Network] send failed code=1' }, null);
    agg.ingest({ ts: 2, frame: 2, level: 'error', msg: '[Audio] voice limit reached' }, null);
    agg.ingest({ ts: 3, frame: 3, level: 'error', msg: '[Network] send failed code=2' }, null);
    const g = agg.list();
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.tag === 'Network').count).toBe(2);
    expect(g.find((x) => x.tag === 'Audio').count).toBe(1);
  });
});

describe('2) Etiketleme ve stack trace parse', () => {
  it('[Physics] gibi köşeli parantez etiketini ayırır', () => {
    expect(extractTag('[Physics] Raycast failed')).toEqual({ tag: 'Physics', text: 'Raycast failed' });
    expect(extractTag('düz mesaj').tag).toBe(null);
    expect(extractTag('[Çok Uzun Bir Etiket Adı Buraya Gelirse] x').tag).toBe(null);
  });

  it('suçlu kareyi (ilk kullanıcı kodu) bulur, Unity içi kareleri atlar', () => {
    const { frames, culprit } = parseStack(
      'UnityEngine.Physics.RaycastAll (Int32 mask)\n' +
      'UnityEngine.Debug:LogException (System.Exception)\n' +
      'HitscanWeapon.Fire () (at Assets/Scripts/Combat/HitscanWeapon.cs:142)\n' +
      'PlayerController.Update () (at Assets/Scripts/Player/PlayerController.cs:57)');
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(culprit.file).toBe('Assets/Scripts/Combat/HitscanWeapon.cs');
    expect(culprit.line).toBe(142);
    expect(culprit.fn).toContain('HitscanWeapon.Fire');
    expect(culprit.internal).toBe(false);
  });

  it('stack yoksa zarifçe null döner', () => {
    expect(parseStack(null)).toEqual({ frames: [], culprit: null });
  });
});

describe('3) 1% / 0.1% Low FPS', () => {
  it('en kötü %1 ve %0.1 dilimlerin ortalamasını hesaplar', () => {
    // 1000 kare: 990 kare 60 fps, 9 kare 30 fps, 1 kare 5 fps
    const fps = [];
    for (let i = 0; i < 990; i++) fps.push(60);
    for (let i = 0; i < 9; i++) fps.push(30);
    fps.push(5);
    const low = computeLowPercentiles(fps);
    expect(low.avg).toBeCloseTo((990 * 60 + 9 * 30 + 5) / 1000, 5);
    expect(low.p01).toBeCloseTo((9 * 30 + 5) / 10, 5);   // en kötü 10 kare
    expect(low.p001).toBeCloseTo(5, 5);                    // en kötü 1 kare
    expect(low.min).toBe(5);
    // kritik iddia: ortalama 59.7 iken 1% low 27.5 -> "ortalama iyi ama oyun takılıyor"
    expect(low.avg).toBeGreaterThan(55);
    expect(low.p01).toBeLessThan(35);
  });

  it('boş pencere çökmez', () => {
    expect(computeLowPercentiles([])).toEqual({ avg: 0, p01: 0, p001: 0, min: 0 });
  });
});

describe('4) Bellek sızıntısı dedektörü', () => {
  it('gerçek sızıntıyı yakalar: yüksek spawn, neredeyse hiç destroy', () => {
    const det = new LeakDetector({ windowSec: 10, emitEverySec: 0 });
    for (let t = 0; t < 200; t++) {
      det.track({ type: 'GameObject', prefab: 'BulletPrefab', delta: +1, frame: t, ts: t * 100, tRel: t * 0.1 });
      if (t % 25 === 0) det.track({ type: 'GameObject', prefab: 'BulletPrefab', delta: -1, frame: t, ts: t * 100, tRel: t * 0.1 });
    }
    const findings = det.evaluate(20, { monoUsedMB: 260, slopeMBps: 0.9 });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].kind).toBe('leak');
    expect(findings[0].detail.type).toBe('GameObject');
    expect(findings[0].detail.destroyRatio).toBeLessThan(0.2);
    expect(findings[0].severity).toBe('high');
  });

  it('sağlıklı havuzu AKLAMAZ (yanlış pozitif üretmez)', () => {
    const det = new LeakDetector({ windowSec: 10, emitEverySec: 0 });
    for (let t = 0; t < 200; t++) {
      det.track({ type: 'GameObject', prefab: 'HitEffectVFX', delta: +1, frame: t, ts: t * 100, tRel: t * 0.1 });
      det.track({ type: 'GameObject', prefab: 'HitEffectVFX', delta: -1, frame: t, ts: t * 100, tRel: t * 0.1 });
    }
    const findings = det.evaluate(20, { monoUsedMB: 150, slopeMBps: 0 });
    expect(findings).toHaveLength(0);
    const row = det.snapshot().find((r) => r.prefab === 'HitEffectVFX');
    expect(row.destroyRatio).toBeCloseTo(1, 5);
    expect(row.live).toBe(0);
  });

  it('yavaş büyüme + heap korelasyonu heap bulgusu üretir', () => {
    const fe = new FindingsEngine({ heapWindowSec: 10, hitchMs: 33, gcSpikeBytes: 200_000 });
    let out = [];
    for (let t = 0; t < 400; t++) {
      const frame = {
        frameId: t, dtMs: 12, fps: 83, gcAllocBytes: 3000,
        monoUsed: (150 + t * 0.06) * 1048576, monoHeap: 256 * 1048576, totalReserved: 400 * 1048576,
        gfxDriver: 90 * 1048576, drawCalls: 180, batches: 120, setPassCalls: 55,
        triangles: 600000, vertices: 400000,
        mainThreadMs: 7, renderThreadMs: 4, gpuMs: 6, physicsMs: 1.5, animMs: 1.2,
      };
      out.push(...fe.onFrame(frame, t * 0.1));
    }
    expect(out.some((f) => f.kind === 'heap')).toBe(true);
  });

  it('GC spike ve ardışık hitch bulgularını üretir + darboğazı belirler', () => {
    const fe = new FindingsEngine({});
    const base = {
      frameId: 1, dtMs: 16, fps: 62, gcAllocBytes: 2000, monoUsed: 150 * 1048576,
      monoHeap: 256 * 1048576, totalReserved: 400 * 1048576, gfxDriver: 90 * 1048576,
      drawCalls: 180, batches: 120, setPassCalls: 55, triangles: 6e5, vertices: 4e5,
      mainThreadMs: 8, renderThreadMs: 4, gpuMs: 6, physicsMs: 1.5, animMs: 1.2,
    };
    const spike = fe.onFrame({ ...base, gcAllocBytes: 900_000 }, 1);
    expect(spike.some((f) => f.kind === 'gc')).toBe(true);
    const hitches = [];
    for (let i = 0; i < 5; i++) hitches.push(...fe.onFrame({ ...base, dtMs: 62, mainThreadMs: 55, frameId: 100 + i }, 10 + i));
    expect(hitches.some((f) => f.kind === 'hitch')).toBe(true);
    expect(pickBottleneck({ ...base, dtMs: 62, mainThreadMs: 55, renderThreadMs: 4 }).name).toBe('Main Thread');
  });
});

describe('5) A/B kare karşılaştırması', () => {
  const A = { frameId: 1000, dtMs: 14.0, fps: 71, gcAllocBytes: 4096, monoUsed: 150 * 1048576, drawCalls: 180, setPassCalls: 55, triangles: 600000, mainThreadMs: 8 };
  const B = { frameId: 1050, dtMs: 62.0, fps: 16, gcAllocBytes: 900 * 1024, monoUsed: 210 * 1048576, drawCalls: 420, setPassCalls: 190, triangles: 1900000, mainThreadMs: 55 };

  it('kötüleşen metrikleri "worse", iyileşenleri "better" işaretler', () => {
    const rows = compareFrames(A, B);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.dtMs.verdict).toBe('worse');
    expect(byKey.gcAllocBytes.verdict).toBe('worse');
    expect(byKey.drawCalls.verdict).toBe('worse');
    expect(compareFrames(B, A).find((r) => r.key === 'dtMs').verdict).toBe('better');
    expect(byKey.monoUsed.unit).toBe('MB');
    expect(byKey.monoUsed.a).toBeCloseTo(150, 1);
  });

  it('örneklem farkında sayı içeren adları normalize eder', () => {
    expect(normalizeSampleName('EnemyAI.Update() x34')).toBe('EnemyAI.Update() x#');
    expect(normalizeSampleName('SetPass Calls x58')).toBe('SetPass Calls x#');
    const diff = compareSamples(
      [['EnemyAI.Update() x12', 800, 2000, 3, 2], ['RenderLoop.Draw', 200, 900, 2, 2]],
      [['EnemyAI.Update() x48', 4200, 9000, 3, 2], ['RenderLoop.Draw', 210, 950, 2, 2]],
    );
    const enemy = diff.find((d) => d.name === 'EnemyAI.Update() x#');
    expect(enemy).toBeTruthy();
    expect(enemy.deltaUs).toBe(4200 - 800);
    expect(enemy.onlyIn).toBe(null);
  });

  it('yalnızca B karesinde çalışan fonksiyonu işaretler (regresyon avı)', () => {
    const diff = compareSamples(
      [['PlayerController.Update()', 500, 900, 2, 1]],
      [['PlayerController.Update()', 520, 900, 2, 1], ['BossSlam.Resolve()', 30000, 31000, 4, 1]],
    );
    const boss = diff.find((d) => d.name === 'BossSlam.Resolve()');
    expect(boss.onlyIn).toBe('B');
    expect(diff[0].name).toBe('BossSlam.Resolve()'); // en büyük fark en üstte
  });
});

describe('6) SQLite kalıcılığı (tarihsel analiz)', () => {
  let db;
  beforeAll(() => { db = new Storage(':memory:'); });
  afterAll(() => { db.close(); });

  it('kareler diske yazılır ve toplu istatistik SQL ile hesaplanır', () => {
    db.upsertSession({
      id: 's1', started_at: Date.now(), ended_at: null, app: 'TestGame', platform: 'editor',
      unity: '2023.2', device: 'dev', target_fps: 60, deep_profile: 1, frames: 0, logs: 0, events: 0,
    });
    for (let i = 0; i < 500; i++) {
      db.queueFrame({
        session_id: 's1', frame_id: i, t_rel: i / 60, ts: Date.now() + i * 16,
        dt_ms: i % 50 === 0 ? 90 : 16, fps: i % 50 === 0 ? 11 : 62,
        gc_alloc: i % 50 === 0 ? 900_000 : 3000, total_reserved: 400 * 1048576, total_allocated: 300 * 1048576,
        mono_heap: 256 * 1048576, mono_used: (150 + i * 0.05) * 1048576, gfx: 90 * 1048576,
        draw_calls: 180, batches: 120, set_pass: 55, triangles: 600000, vertices: 400000,
        main_ms: 8, render_ms: 4, gpu_ms: 6, physics_ms: 1.5, anim_ms: 1.2, scene: 'Level_01', samples: 1, compressed: 0,
      });
    }
    db.queueLog({
      session_id: 's1', ts: Date.now(), frame_id: 12, level: 'exception', tag: 'UI',
      msg: 'NullReferenceException', stack: 'x', fingerprint: 'fp1', group_count: 1,
      context_json: JSON.stringify({ fps: 11 }), first_frame: 12,
    });
    db.queueObj({ session_id: 's1', ts: Date.now(), frame_id: 12, op: 'instantiate', type: 'GameObject', prefab: 'BulletPrefab' });
    // Aynı fingerprint, FARKLI ham mesajlar (örn. "hit 132 colliders" / "hit 7 colliders"):
    // tarihsel gruplama bunları TEK grupta toplamalı — msg GROUP BY anahtarı değildir.
    db.queueLog({
      session_id: 's1', ts: Date.now() + 1000, frame_id: 40, level: 'warn', tag: 'Physics',
      msg: 'Raycast hit 7 colliders in a single frame', stack: '', fingerprint: 'fp2', group_count: 3,
      context_json: '{}', first_frame: 40,
    });
    db.queueLog({
      session_id: 's1', ts: Date.now() + 2000, frame_id: 90, level: 'warn', tag: 'Physics',
      msg: 'Raycast hit 132 colliders in a single frame', stack: '', fingerprint: 'fp2', group_count: 4,
      context_json: '{}', first_frame: 90,
    });
    const written = db.flush();
    expect(written).toBe(504);

    const stats = db.sessionStats('s1');
    expect(stats.frames).toBe(500);
    expect(stats.gc_max_frame).toBe(900_000);
    expect(stats.dt_max).toBe(90);

    const low = db.lowPercentiles('s1');
    expect(low.count).toBe(500);
    expect(low.p001).toBeCloseTo(11, 1);          // en kötü 1 kare
    expect(low.p01).toBeLessThan(20);             // en kötü 5 kare
    expect(low.avg).toBeGreaterThan(55);

    const spikes = db.gcSpikes('s1', 200_000);
    expect(spikes.length).toBe(10);               // 500/50
    const groups = db.topLogGroups('s1');
    expect(groups.length).toBe(2);                       // fp1 + fp2 (iki ham msg TEK grupta)
    const raycast = groups.find((g) => g.fingerprint === 'fp2');
    expect(raycast.hits).toBe(7);                        // 3 + 4 birleşti
    expect(raycast.msg).toContain('hit 7 colliders');    // temsilci = en erken satır
    expect(raycast.first_frame).toBe(40);
    expect(db.objectBalance('s1')[0]).toMatchObject({ prefab: 'BulletPrefab', spawned: 1, destroyed: 0 });
  });

  it('saklama politikası: örneklem yazımı kapatılabilir ve disk istatistiği doğru raporlanır', () => {
    const db2 = new Storage(':memory:', { persistSamples: false, retentionMinutes: 1 });
    db2.queueSamplesIfEnabled([['sX', 1, 'A', 1, 2, 0, 0]]);
    expect(db2.flush()).toBe(0);                 // örneklem diske yazılmadı
    const stats = db2.diskStats();
    expect(stats.rows.samples).toBe(0);
    expect(stats.policy.persistSamples).toBe(false);
    expect(stats.policy.retentionMinutes).toBe(1);
    db2.close();

    const db3 = new Storage(':memory:', { persistSamples: true });
    db3.queueSamplesIfEnabled([['sX', 1, 'A', 1, 2, 0, 0]]);
    expect(db3.flush()).toBe(1);                 // açıkken yazılır
    expect(db3.diskStats().rows.samples).toBe(1);
    db3.close();
  });

  it('örneklem ağacı diskten geri okunur (flamegraph sonradan açılabilir)', () => {
    db.queueSamples([['s1', 7, 'PlayerLoop', 100, 5000, 0, 0], ['s1', 7, 'Update', 4900, 4900, 1, 1]]);
    db.flush();
    const rows = db.frameSamples('s1', 7);
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('Update');
    expect(rows[1].depth).toBe(1);
  });
});

describe('7) Uçtan uca ingestion pipeline (ajan protokolü)', () => {
  it('hello -> frame -> log -> event -> obj akışı Store, SQLite ve yayını besler', () => {
    const db = new Storage(':memory:');
    const store = new MetricsStore({ db });
    const aggregator = new LogAggregator({ spamThreshold: 3, updateIntervalMs: 0 });
    const leaks = new LeakDetector({ windowSec: 5, emitEverySec: 0 });
    const findings = new FindingsEngine({});
    const broadcast = [];
    const frameQueue = [];
    // Gerçek Hub, kareleri ~100 ms'de bir partiler halinde yayınlar (frame fırtınasını önlemek için).
    const hub = {
      broadcast: (m) => broadcast.push(m),
      queueFrame: (f) => frameQueue.push(f),
      clientCount: 1,
      flushFrames: () => { if (frameQueue.length) broadcast.push({ type: 'frames', frames: frameQueue.splice(0) }); },
    };
    const pipeline = new IngestPipeline({ store, db, logs: aggregator, leaks, findings, hub, sessionInfo: () => store.session });

    pipeline.handle({ t: 'hello', seq: 1, ts: Date.now(), sessionId: 'e2e', app: 'TestApp', platform: 'editor', unity: '2023.2', device: 'dev', targetFps: 60, deepProfile: true }, { bytes: 10, transport: 'udp' });
    expect(store.session.id).toBe('e2e');
    expect(store.startedAt).toBeGreaterThan(0);

    const row = new Array(FRAME_FIELDS.length).fill(0);
    const set = (name, v) => { row[FRAME_FIELDS.indexOf(name)] = v; };
    set('frameId', 10); set('dtMs', 16.6); set('gcAllocBytes', 4096);
    set('monoUsed', 150 * 1048576); set('monoHeap', 256 * 1048576); set('totalReserved', 400 * 1048576);
    set('drawCalls', 180); set('setPassCalls', 55); set('mainThreadMs', 8); set('renderThreadMs', 4);
    pipeline.handle({ t: 'frame', seq: 2, ts: Date.now(), f: [row] }, { bytes: 20, transport: 'udp' });
    expect(store.size).toBe(1);
    expect(store.frameById(10).fps).toBeCloseTo(60.2, 1);
    expect(pipeline.counts.frames).toBe(1);

    pipeline.handle({ t: 'scene', seq: 3, ts: Date.now(), frame: 10, name: 'Level_02', op: 'load' }, {});
    expect(pipeline.scene).toBe('Level_02');

    for (let i = 0; i < 8; i++) {
      pipeline.handle({
        t: 'log', seq: 10 + i, ts: Date.now(), frame: 10, level: 'exception',
        msg: '[UI] NullReferenceException: ref not set',
        stack: 'UIHUDController.Refresh () (at Assets/Scripts/UI/UIHUDController.cs:214)',
      }, {});
    }
    const g = aggregator.list();
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(8);
    expect(g[0].isSpam).toBe(true);
    expect(g[0].tag).toBe('UI');
    expect(g[0].context.monoUsedMB).toBeCloseTo(150, 0);  // bağlam enjeksiyonu
    expect(g[0].culprit.file).toBe('Assets/Scripts/UI/UIHUDController.cs');

    pipeline.handle({ t: 'event', seq: 30, ts: Date.now(), frame: 10, name: 'PlayerDied', kind: 'bad', payload: { Score: 100, Level: 5 } }, {});
    expect(pipeline.recentEvents.some((e) => e.name === 'PlayerDied')).toBe(true);

    for (let i = 0; i < 60; i++) pipeline.handle({ t: 'obj', seq: 100 + i, d: [['GameObject', 'BulletPrefab', 1, 10 + i, Date.now()]] }, {});
    const leakRows = leaks.snapshot();
    expect(leakRows[0].live).toBe(60);

    // örneklem ağacı: parçalı (chunked) gönderim birleştirilmeli
    pipeline.handle({ t: 'samples', seq: 200, ts: Date.now(), frame: 10, part: 1, i: 0, n: 2, s: [['PlayerLoop', 10, 5000, 2, 0], ['Update', 4000, 4000, 0, 1]] }, {});
    expect(pipeline.getSamples(10)).toBe(null); // henüz eksik parça var
    pipeline.handle({ t: 'samples', seq: 201, ts: Date.now(), frame: 10, part: 1, i: 1, n: 2, s: [['Render', 990, 990, 0, 1]] }, {});
    const s = pipeline.getSamples(10);
    expect(s.flat).toHaveLength(3);
    expect(s.flat[0][0]).toBe('PlayerLoop');
    expect(s.totalUs).toBe(5000);

    const detail = pipeline.frameDetail(10);
    expect(detail.samples.flat).toHaveLength(3);
    expect(detail.logs.length).toBeGreaterThan(0);
    expect(detail.events.some((e) => e.name === 'PlayerDied')).toBe(true);
    expect(detail.frame.bottleneck.name).toBe('Main Thread');

    // paket kaybı ölçümü
    pipeline.handle({ t: 'frame', seq: 9, ts: Date.now(), f: [] }, { bytes: 5, transport: 'udp' });
    expect(store.agent.seqGaps).toBeGreaterThan(0);
    expect(store.agent.lostRatio).toBeGreaterThan(0);

    hub.flushFrames();
    expect(broadcast.some((m) => m.type === 'frames' && m.frames.length >= 1)).toBe(true);
    const state = pipeline.fullState();
    expect(state.type).toBe('state');
    expect(state.logGroups.length).toBe(1);
    expect(state.tags).toContain('UI');
    expect(broadcast.some((m) => m.type === 'frames')).toBe(true);
    db.close();
  });
});

describe('8) Ring buffer (uzun oturum davranışı)', () => {
  it('kapasite aşımında en eski veri düşer ama frameId araması çalışmaya devam eder', () => {
    const store = new MetricsStore({ capacity: 100 });
    store.reset({ id: 'rb', startedAt: Date.now() });
    for (let i = 0; i < 250; i++) {
      store.push({ frameId: 1000 + i, dtMs: 16, gcAllocBytes: 100, monoUsed: 1, monoHeap: 1, totalReserved: 1, drawCalls: 1 }, { scene: 'S', ts: Date.now() + i * 16 });
    }
    expect(store.size).toBe(100);
    expect(store.count).toBe(250);
    expect(store.frameById(1000)).toBe(null);           // düşürüldü
    expect(store.frameById(1249).frameId).toBe(1249);   // en yeni
    expect(store.frameById(1150).frameId).toBe(1150);   // hâlâ tutulan en eski
    const s = store.series({ fields: ['dtMs'], maxPoints: 1000 });
    expect(s.t.length).toBe(100);
  });

  it('series() küçültmede spike\'ları korur (min/max koruyucu örnekleme)', () => {
    const store = new MetricsStore({ capacity: 10000 });
    store.reset({ id: 's2', startedAt: Date.now() });
    for (let i = 0; i < 2000; i++) {
      const spike = i === 1234;
      store.push({ frameId: i, dtMs: spike ? 400 : 16, gcAllocBytes: 0, monoUsed: 0, monoHeap: 0, totalReserved: 0, drawCalls: 0 }, { scene: 'S', ts: Date.now() + i * 16 });
    }
    const s = store.series({ fields: ['dtMs'], maxPoints: 200 });
    expect(s.t.length).toBeLessThan(400);
    expect(Math.max(...s.columns.dtMs)).toBe(400); // spike küçültmede kaybolmadı
  });
});
