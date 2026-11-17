/**
 * OmniProfiler — Mock Unity Agent (Simülatör)
 *
 * Gerçek bir Unity Editörü/Cihazı yerine, ajanın WIRE PROTOCOL'ünü birebir
 * taklit eden deterministik bir simülatör. İki modu vardır:
 *
 *   - 'inproc' : mesajlar doğrudan ingestion pipeline'ına enjekte edilir (varsayılan)
 *   - 'udp'    : mesajlar gerçekten 127.0.0.1:8790 adresine UDP datagram olarak
 *                gönderilir; sunucunun UDP dinleyicisi ve paket-birleştirme
 *                (chunking) kodu gerçek yoldan test edilir.
 *
 * Neden deterministik? Çünkü "Kare 1050 ile Kare 1000'i karşılaştır" özelliğini
 * anlatabilmek için aynı senaryonun tekrar üretilebilir olması gerekir. RNG,
 * kare numarasından türetilen bir seed ile çalışır.
 *
 * Senaryo (96 saniyelik döngü):
 *   0-12s   MainMenu      : sakin, düşük draw call
 *   12-40s  Level_01      : oynanış, ~8 sn'de bir GC spike (düşman dalgası)
 *   40-66s  Level_02_Combat: BulletPrefab LEAK'İ (destroy edilmiyor), yüksek draw call
 *   66-84s  Level_03_UI   : Canvas rebuild spam'i + [UI] NullReferenceException yağmuru
 *   84-96s  Boss_Arena    : ağır hitch'ler, 2+ MB GC alloc, PlayerDied olayları
 */
import dgram from 'node:dgram';

const TAU = Math.PI * 2;
const MB = 1048576;
const KB = 1024;

/** Deterministik PRNG (mulberry32). */
function rngFrom(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENES = [
  { name: 'MainMenu', from: 0, to: 12 },
  { name: 'Level_01_Forest', from: 12, to: 40 },
  { name: 'Level_02_Combat', from: 40, to: 66 },
  { name: 'Level_03_UI_Heavy', from: 66, to: 84 },
  { name: 'Boss_Arena', from: 84, to: 96 },
];
const CYCLE = 96;

function sceneAt(t) {
  const c = t % CYCLE;
  for (const s of SCENES) if (c >= s.from && c < s.to) return s.name;
  return SCENES[0].name;
}

/* ------------------------------------------------------------------ */
/* Örneklem ağacı (Profiler.BeginSample / EndSample taklidi)            */
/* ------------------------------------------------------------------ */

/**
 * Pre-order örneklem ağacı kurucusu.
 *
 * Unity tarafındaki karşılığı:
 *     Profiler.BeginSample("Update.ScriptRunBehaviourUpdate");
 *     ...
 *     Profiler.EndSample();
 * Ajan bu Begin/End çiftlerini bir yığında (stack) tutup kare sonunda düz bir
 * diziye serileştirir. Buradaki `scope()/end()` API'si birebir aynı yığını taklit eder.
 *
 * Düğüm biçimi: [name, selfUs, totalUs, childCount, depth]
 */
class TreeBuilder {
  constructor() {
    this.nodes = [];
    /** açık kapsamlar: {idx, depth, childTotal} */
    this.stack = [];
  }

  #add(name, selfUs) {
    const depth = this.stack.length;
    const idx = this.nodes.length;
    this.nodes.push([name, Math.max(0, Math.round(selfUs)), Math.max(0, Math.round(selfUs)), 0, depth]);
    const parent = this.stack[this.stack.length - 1];
    if (parent) {
      this.nodes[parent.idx][3]++;
      parent.childTotal += this.nodes[idx][2];
    }
    return idx;
  }

  /** Çocuksuz düğüm (Begin/End arasında ölçülen saf maliyet). */
  leaf(name, selfUs) { return this.#add(name, selfUs); }

  /** Kapsam açar: sonraki leaf/scope çağrıları bunun çocuğu olur. */
  scope(name, selfUs) {
    const idx = this.#add(name, selfUs);
    this.stack.push({ idx, childTotal: 0 });
    return idx;
  }

  /** Kapsamı kapatır ve total maliyeti (self + çocuklar) geriye doğru yayar. */
  end() {
    const top = this.stack.pop();
    if (!top) return;
    const n = this.nodes[top.idx];
    n[1] = Math.max(0, Math.round(n[1]));          // self
    n[2] = Math.max(0, Math.round(n[1] + top.childTotal)); // total
    const parent = this.stack[this.stack.length - 1];
    if (parent) parent.childTotal += n[2];
  }

  /** Kök düğümle sarıp düz pre-order diziyi döndürür. */
  build(rootName, rootSelfUs) {
    while (this.stack.length) this.end();
    const childTotal = this.nodes.filter((n) => n[4] === 0).reduce((s, n) => s + n[2], 0);
    const childCount = this.nodes.filter((n) => n[4] === 0).length;
    const root = [rootName, Math.max(0, Math.round(rootSelfUs)), Math.max(0, Math.round(rootSelfUs + childTotal)), childCount, 0];
    // kök eklendiği için tüm derinlikleri 1 artır
    for (const n of this.nodes) n[4]++;
    root[3] = childCount;
    return [root, ...this.nodes];
  }
}

/** Bir kare için gerçekçi örneklem ağacı üretir (düz pre-order dizi). */
function buildSamples(frameId, s, rng) {
  const us = (ms) => ms * 1000;
  const b = new TreeBuilder();

  b.scope('Update.ScriptRunBehaviourUpdate', us(s.scriptUpdateMs * 0.12));
  {
    b.scope('PlayerController.Update()', us(s.scriptUpdateMs * 0.1));
    b.leaf('Input.GetAxis (polling)', us(s.scriptUpdateMs * 0.06));
    b.leaf('CharacterController.Move', us(s.scriptUpdateMs * 0.12));
    b.leaf('CameraRig.LateFollow', us(s.scriptUpdateMs * 0.05));
    b.end();

    b.scope(`EnemyAI.Update() x${s.enemies}`, us(s.scriptUpdateMs * (s.scene === 'Boss_Arena' ? 0.14 : 0.1)));
    b.leaf('NavMeshAgent.SetDestination', us(s.scriptUpdateMs * 0.1));
    b.leaf('BehaviourDesigner.Tick', us(s.scriptUpdateMs * 0.14));
    if (s.scene === 'Level_02_Combat') b.leaf('WeaponSystem.Fire (Instantiate)', us(s.bulletSpawnCostMs));
    b.end();

    b.scope('UIHUDController.Update()', us(s.scriptUpdateMs * (s.scene === 'Level_03_UI_Heavy' ? 0.12 : 0.03)));
    b.leaf('Text.set_text (rebuild)', us(s.scriptUpdateMs * (s.scene === 'Level_03_UI_Heavy' ? 0.16 : 0.02)));
    b.leaf('Image.set_fillAmount', us(s.scriptUpdateMs * 0.02));
    b.end();

    if (s.gcWorkMs > 0.05) {
      b.scope('InventoryManager.Resort (GC heavy)', us(s.gcWorkMs * 100));
      b.leaf('List<T>.OrderBy (LINQ alloc)', us(s.gcWorkMs * 0.6));
      b.leaf('string.Concat / Format', us(s.gcWorkMs * 0.3));
      b.end();
    }
  }
  b.end();

  b.scope('Physics.Simulate', us(s.physicsMs * 0.12));
  b.leaf('Physics.FixedUpdate (Broadphase)', us(s.physicsMs * 0.3));
  b.leaf('Physics.Narrowphase + Solver', us(s.physicsMs * 0.4));
  if (s.physicsMs > 3) b.leaf('CharacterController.Collide', us(s.physicsMs * 0.12));
  b.end();

  b.scope('Animation.Update', us(s.animMs * 0.05));
  b.leaf('Animator.Update (Mecanim)', us(s.animMs * 0.7));
  b.leaf('Skinning / Bake', us(s.animMs * 0.25));
  b.end();

  b.scope('Coroutine.DelayedCalls', us(0.04 + rng() * 0.12));
  b.leaf('SpawnWaveCoroutine', us(0.03 + rng() * 0.16));
  b.end();

  b.scope('Render.Thread', us(s.renderMs * 0.1));
  b.leaf('Culling (Frustum + Occlusion)', us(s.renderMs * 0.22));
  b.scope('RenderLoop.Draw (SRP Batcher)', us(s.renderMs * 0.2));
  b.leaf(`SetPass Calls x${Math.round(s.setPass)}`, us(s.renderMs * 0.18));
  b.leaf('Submit CommandBuffer', us(s.renderMs * 0.12));
  b.end();
  b.leaf('ShadowMap Pass', us(s.renderMs * (s.scene === 'Boss_Arena' ? 0.22 : 0.12)));
  if (s.scene === 'Level_03_UI_Heavy') b.leaf('Canvas.BuildBatch (UI rebuild)', us(s.renderMs * 0.3));
  b.end();

  if (s.gcCollectMs > 0.02) {
    b.scope('GC.Collect (incremental)', us(s.gcCollectMs * 0.2));
    b.leaf('Mark & Sweep (managed heap)', us(s.gcCollectMs * 0.8));
    b.end();
  }

  return b.build('PlayerLoop', 0.06 + rng() * 0.04);
}

/* ------------------------------------------------------------------ */
/* Simülatör                                                            */
/* ------------------------------------------------------------------ */

export class UnityAgentSimulator {
  /**
   * @param {object} opts
   * @param {(msg:object, meta:object)=>void} opts.onMessage inproc modda pipeline'a enjeksiyon
   * @param {number} opts.udpPort ajanın UDP gönderdiği port (sunucunun dinlediği)
   * @param {number} opts.fps hedef kare hızı
   */
  constructor({ onMessage, udpPort = 8790, fps = 60, sessionId = null }) {
    this.onMessage = onMessage;
    this.udpPort = udpPort;
    this.fps = fps;
    this.transport = 'inproc';
    this.running = false;
    this.lossRate = 0.004;              // %0.4 UDP paket kaybı (gerçekçi)
    this.deepProfile = true;            // flamegraph verisi üret
    this.seq = 0;
    this.frameId = 4200;
    this.startedAt = Date.now();
    this.t0 = Date.now();
    this.sessionId = sessionId ?? `sim-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    this.socket = null;
    this.timer = null;
    this.acc = 0;
    this.lastTick = Date.now();
    this.sent = { packets: 0, bytes: 0, frames: 0, logs: 0, events: 0, objs: 0, samples: 0, droppedByLoss: 0 };
    this.mem = { monoUsed: 118 * MB, reserved: 420 * MB, heap: 256 * MB, gfx: 96 * MB, sinceCollect: 0 };
    this.leak = { bullets: 0 };
    this.logTimers = {};
    this.currentScene = null;
    this.manualEvents = [];
    this.forcedGc = 0;
  }

  status() {
    return {
      running: this.running,
      transport: this.transport,
      fps: this.fps,
      lossRate: this.lossRate,
      deepProfile: this.deepProfile,
      sessionId: this.sessionId,
      scene: this.currentScene,
      frameId: this.frameId,
      elapsedSec: Number(((Date.now() - this.t0) / 1000).toFixed(1)),
      sent: { ...this.sent },
      mem: {
        monoUsedMB: Number((this.mem.monoUsed / MB).toFixed(1)),
        reservedMB: Number((this.mem.reserved / MB).toFixed(1)),
        heapMB: Number((this.mem.heap / MB).toFixed(1)),
        gfxMB: Number((this.mem.gfx / MB).toFixed(1)),
      },
      leakedBullets: this.leak.bullets,
      udpPort: this.udpPort,
    };
  }

  control(body) {
    if (body.action === 'start') this.start(body.transport);
    if (body.action === 'stop') this.stop();
    if (body.action === 'reset') this.reset();
    if (typeof body.fps === 'number') this.fps = Math.max(5, Math.min(240, body.fps));
    if (typeof body.lossRate === 'number') this.lossRate = Math.min(0.5, Math.max(0, body.lossRate));
    if (typeof body.deepProfile === 'boolean') this.deepProfile = body.deepProfile;
    if (typeof body.transport === 'string' && body.transport !== this.transport) {
      const wasRunning = this.running;
      this.stop();
      this.transport = body.transport;
      if (wasRunning) this.start(body.transport);
    }
    if (body.action === 'event') {
      this.#emit({ t: 'event', seq: this.seq++, ts: Date.now(), frame: this.frameId, name: body.name || 'ManualEvent', kind: body.kind || 'default', payload: body.payload || {} });
      this.sent.events++;
    }
    if (body.action === 'gcSpike') this.forcedGc = body.bytes ?? 1_500_000;
    if (body.action === 'log') {
      this.#emitLog(body.level || 'error', body.msg || '[Test] Manuel log', body.tag, body.stack);
    }
    return this.status();
  }

  async start(transport = this.transport) {
    if (this.running) return this.status();
    this.transport = transport;
    if (transport === 'udp') await this.#openUdp();
    this.running = true;
    this.lastTick = Date.now();
    this.#emit({
      t: 'hello', seq: this.seq++, ts: Date.now(), sessionId: this.sessionId,
      app: 'NeonDrift (Sample)', platform: transport === 'udp' ? 'editor-udp' : 'editor',
      unity: '2023.2.9f1', device: 'DEV-PC / RTX 3060', targetFps: this.fps, deepProfile: this.deepProfile,
    });
    const interval = 1000 / Math.max(5, Math.min(240, this.fps));
    this.timer = setInterval(() => this.#tick(), Math.max(4, Math.min(50, interval)));
    this.timer.unref?.();
    return this.status();
  }

  stop() {
    if (!this.running) return this.status();
    this.#emit({ t: 'bye', seq: this.seq++, ts: Date.now(), reason: 'simulator stopped' });
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.socket) { try { this.socket.close(); } catch { /* yoksay */ } this.socket = null; }
    return this.status();
  }

  reset() {
    this.stop();
    this.seq = 0;
    this.frameId = 4200;
    this.mem = { monoUsed: 118 * MB, reserved: 420 * MB, heap: 256 * MB, gfx: 96 * MB, sinceCollect: 0 };
    this.leak.bullets = 0;
    this.logTimers = {};
    this.currentScene = null;
    this.t0 = Date.now();
    this.sessionId = `sim-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    this.sent = { packets: 0, bytes: 0, frames: 0, logs: 0, events: 0, objs: 0, samples: 0, droppedByLoss: 0 };
    return this.status();
  }

  async #openUdp() {
    if (this.socket) return;
    await new Promise((resolve, reject) => {
      const s = dgram.createSocket('udp4');
      s.on('error', reject);
      s.once('listening', () => { this.socket = s; resolve(); });
      s.bind(0, '127.0.0.1');
    });
  }

  /* ------------------------------ gönderim ------------------------------ */

  #emit(msg) {
    if (this.transport === 'udp') {
      if (!this.socket) return;
      const payload = Buffer.from(JSON.stringify(msg) + '\n', 'utf8');
      // Gerçek ajan gibi paket kaybı simüle et: UI'da "veri kalitesi" göstergesi bunu yakalar
      const r = rngFrom(msg.seq * 2654435761)();
      if (r < this.lossRate && msg.t !== 'hello' && msg.t !== 'bye') {
        this.sent.droppedByLoss++;
        return;
      }
      this.sent.packets++;
      this.sent.bytes += payload.length;
      try { this.socket.send(payload, 0, payload.length, this.udpPort, '127.0.0.1'); } catch { /* yoksay */ }
      return;
    }
    this.sent.packets++;
    this.sent.bytes += JSON.stringify(msg).length + 1;
    const r = rngFrom(msg.seq * 2654435761)();
    if (r < this.lossRate && msg.t !== 'hello' && msg.t !== 'bye') { this.sent.droppedByLoss++; return; }
    this.onMessage?.(msg, { bytes: 0, transport: 'inproc' });
  }

  #emitLog(level, msg, tag, stack) {
    this.#emit({ t: 'log', seq: this.seq++, ts: Date.now(), frame: this.frameId, level, msg: tag ? `[${tag}] ${msg}` : msg, stack, tag, scene: this.currentScene });
    this.sent.logs++;
  }

  /* -------------------------------- tick -------------------------------- */

  #tick() {
    const now = Date.now();
    const elapsed = (now - this.t0) / 1000;
    const scene = sceneAt(elapsed);

    // Sahne değişimi
    if (scene !== this.currentScene) {
      if (this.currentScene) {
        this.#emit({ t: 'scene', seq: this.seq++, ts: now, frame: this.frameId, name: this.currentScene, op: 'unload' });
      }
      this.currentScene = scene;
      this.#emit({ t: 'scene', seq: this.seq++, ts: now, frame: this.frameId, name: scene, op: 'load' });
      this.#emit({ t: 'event', seq: this.seq++, ts: now, frame: this.frameId, name: 'SceneLoaded', kind: 'scene', payload: { scene, elapsed: Number(elapsed.toFixed(1)) } });
      this.sent.events++;
      // Sahne yükleme = kaçınılmaz hitch + büyük GC
      this.#emit({
        t: 'log', seq: this.seq++, ts: now, frame: this.frameId, level: 'log',
        msg: `[Scene] Loaded '${scene}' in ${(200 + rngFrom(this.frameId)() * 500).toFixed(0)} ms (async)`,
        scene,
      });
      this.sent.logs++;
    }

    const rng = rngFrom(this.frameId * 2246822519);
    const rng2 = rngFrom(this.frameId * 3266489917);
    const S = this.#scenario(elapsed, scene, rng, rng2);

    // Bellek modeli: sawtooth + sızıntı kaynaklı taban yükselmesi
    this.mem.sinceCollect += S.gcAllocBytes;
    this.mem.monoUsed += S.gcAllocBytes;
    const collectThreshold = this.mem.heap * 0.82;
    let gcCollectMs = 0;
    if (this.mem.monoUsed > collectThreshold) {
      gcCollectMs = 2.5 + (this.mem.monoUsed / MB) * 0.09 + rng() * 3;
      this.mem.monoUsed = this.mem.heap * 0.34 + rng() * 4 * MB;
      this.mem.sinceCollect = 0;
      if (rng() < 0.55) {
        this.#emitLog('warn', `GC.Collect triggered: heap ${(this.mem.heap / MB).toFixed(0)} MB, pause ${gcCollectMs.toFixed(1)} ms`, 'GC');
      }
    }
    if (this.forcedGc > 0) { S.gcAllocBytes += this.forcedGc; this.forcedGc = 0; }
    // Sızıntı heap'i kalıcı olarak büyütür
    if (scene === 'Level_02_Combat' || scene === 'Boss_Arena') this.mem.heap += 0.012 * MB;
    this.mem.reserved = Math.max(this.mem.reserved, this.mem.heap + this.mem.gfx + 90 * MB);
    this.mem.gfx += (S.drawCalls - 180) * 8;

    const dtMs = S.dtMs;
    const row = [
      this.frameId,
      Number(dtMs.toFixed(3)),
      Math.round(S.gcAllocBytes),
      Math.round(this.mem.reserved),
      Math.round(this.mem.monoUsed + 30 * MB),
      Math.round(this.mem.heap),
      Math.round(this.mem.monoUsed),
      Math.round(this.mem.gfx),
      Math.round(S.drawCalls),
      Math.round(S.batches),
      Math.round(S.setPass),
      Math.round(S.triangles),
      Math.round(S.vertices),
      Number(S.mainMs.toFixed(3)),
      Number(S.renderMs.toFixed(3)),
      Number(S.gpuMs.toFixed(3)),
      Number(S.physicsMs.toFixed(3)),
      Number(S.animMs.toFixed(3)),
    ];

    this.#emit({ t: 'frame', seq: this.seq++, ts: now, f: [row] });
    this.sent.frames++;

    // Flamegraph verisi (deep profile)
    if (this.deepProfile && this.frameId % 2 === 0) {
      const flat = buildSamples(this.frameId, { ...S, gcCollectMs }, rng);
      // Büyük ağaçları ajan gibi böl (chunking) — sunucu birleştirir
      const CHUNK = 220;
      const n = Math.ceil(flat.length / CHUNK);
      for (let i = 0; i < n; i++) {
        this.#emit({ t: 'samples', seq: this.seq++, ts: now, frame: this.frameId, s: flat.slice(i * CHUNK, (i + 1) * CHUNK), part: n > 1 ? 1 : undefined, i: n > 1 ? i : undefined, n: n > 1 ? n : undefined });
      }
      this.sent.samples++;
    }

    // Obje yaşam döngüsü (sızıntı dedektörünün girdisi)
    this.#objectLifecycle(scene, rng, now);
    // Log üretimi
    this.#logScenario(scene, elapsed, rng, now);
    // Özel olaylar (Custom Telemetry)
    this.#eventScenario(scene, elapsed, rng, now, S);

    this.frameId++;
    this.lastTick = now;
  }

  /** Kare senaryosu: dt, GC, draw call, thread maliyetleri. */
  #scenario(elapsed, scene, rng, rng2) {
    const base = {
      MainMenu: { dt: 8.5, gc: 900, dc: 74, tri: 180_000, phys: 0.4, anim: 0.5, render: 2.4, enemies: 0 },
      Level_01_Forest: { dt: 14.2, gc: 4200, dc: 186, tri: 620_000, phys: 1.6, anim: 1.4, render: 4.1, enemies: 12 },
      Level_02_Combat: { dt: 16.8, gc: 9800, dc: 342, tri: 1_180_000, phys: 3.1, anim: 2.6, render: 5.8, enemies: 34 },
      Level_03_UI_Heavy: { dt: 15.1, gc: 26_000, dc: 268, tri: 720_000, phys: 1.1, anim: 1.0, render: 6.9, enemies: 6 },
      Boss_Arena: { dt: 21.5, gc: 42_000, dc: 486, tri: 2_050_000, phys: 4.6, anim: 3.8, render: 8.4, enemies: 48 },
    }[scene] ?? { dt: 16, gc: 4000, dc: 200, tri: 700_000, phys: 1.5, anim: 1.2, render: 4.5, enemies: 10 };

    // Düzenli GC spike: düşman dalgası / envanter sıralaması
    const spikePhase = (elapsed % 8) / 8;
    const isSpike = spikePhase < 0.06;
    const gcSpikeBytes = isSpike ? (scene === 'Boss_Arena' ? 2.4 * MB : scene === 'Level_02_Combat' ? 900 * KB : 320 * KB) * (0.6 + rng() * 0.9) : 0;

    // Deterministik hitch: her 240 karede bir yükleme takılması
    const periodicHitch = this.frameId % 240 === 0;
    // Rastgele hitch (seed'e bağlı, tekrar üretilebilir)
    const randomHitch = rng2() < (scene === 'Boss_Arena' ? 0.055 : scene === 'Level_03_UI_Heavy' ? 0.03 : 0.012);
    const hitchMs = periodicHitch ? 55 + rng() * 40 : randomHitch ? 22 + rng() * 55 : 0;

    const gcAllocBytes = base.gc * (0.6 + rng() * 0.9) + gcSpikeBytes + (randomHitch ? 40 * KB : 0);
    const gcWorkMs = gcSpikeBytes > 200_000 ? gcSpikeBytes / 90_000 : 0;

    let mainMs = base.dt * (0.52 + rng() * 0.1) + gcWorkMs * 0.8 + hitchMs * 0.72;
    let renderMs = base.render * (0.8 + rng() * 0.45) + hitchMs * 0.18;
    let gpuMs = (base.dt * 0.42 + base.tri / 900_000) * (0.85 + rng() * 0.3);
    let physicsMs = base.phys * (0.85 + rng() * 0.3) + (scene === 'Boss_Arena' && randomHitch ? 6 : 0);
    let animMs = base.anim * (0.85 + rng() * 0.3);
    let dtMs = Math.max(mainMs, renderMs * 0.9 + mainMs * 0.55, gpuMs * 0.9) * (0.94 + rng() * 0.12) + hitchMs * 0.35;
    if (isSpike) dtMs += 4 + rng() * 9;

    const setPass = Math.round(base.dc * (scene === 'Level_03_UI_Heavy' ? 0.22 : 0.31) * (0.9 + rng() * 0.2));
    return {
      scene,
      dtMs,
      gcAllocBytes,
      gcWorkMs,
      gcCollectMs: 0,
      mainMs,
      renderMs,
      gpuMs,
      physicsMs,
      animMs,
      drawCalls: base.dc * (0.94 + rng() * 0.12) + (isSpike ? 30 : 0),
      batches: base.dc * 0.62 * (0.94 + rng() * 0.12),
      setPass,
      triangles: base.tri * (0.95 + rng() * 0.1),
      vertices: base.tri * 0.68 * (0.95 + rng() * 0.1),
      enemies: base.enemies,
      bulletSpawnCostMs: scene === 'Level_02_Combat' ? 0.9 + rng() * 1.6 : 0,
      scriptUpdateMs: mainMs * 0.52,
      isSpike,
      hitchMs,
    };
  }

  #objectLifecycle(scene, rng, now) {
    const batch = [];
    if (scene === 'Level_02_Combat' || scene === 'Boss_Arena') {
      // --- SIZINTI: BulletPrefab instantiate ediliyor ama destroy EDİLMİYOR ---
      // Gerçekçi hız: saniyede ~9 mermi (her karede değil). Dedektörün eğim
      // eşiği (obje/sn) anlamlı kalsın diye oran bilinçli olarak düşük tutulur.
      const rate = scene === 'Boss_Arena' ? 0.17 : 0.11; // kare başına olasılık
      if (rng() < rate) {
        const spawn = 1 + Math.floor(rng() * 2);
        this.leak.bullets += spawn;
        batch.push(['GameObject', 'BulletPrefab', spawn, this.frameId, now]);
        // çok seyrek destroy -> destroy/spawn oranı ~0.06'da kalır
        if (rng() < 0.06 && this.leak.bullets > 4) {
          const d = 1;
          this.leak.bullets -= d;
          batch.push(['GameObject', 'BulletPrefab', -d, this.frameId, now]);
        }
      }
      // --- SAĞLIKLI: doğru havuzlanmış obje (dedektörün false-positive üretmediğini gösterir) ---
      if (rng() < 0.3) {
        const hits = 1 + Math.floor(rng() * 3);
        batch.push(['GameObject', 'HitEffectVFX', hits, this.frameId, now]);
        batch.push(['GameObject', 'HitEffectVFX', -hits, this.frameId + 3, now]);
      }
    }
    // --- SAĞLIKLI: Enemy havuzu, spawn/despawn dengeli ---
    if (scene === 'Level_01_Forest' || scene === 'Boss_Arena') {
      if (rng() < 0.05) batch.push(['GameObject', 'EnemyPrefab', 1, this.frameId, now]);
      if (rng() < 0.05) batch.push(['GameObject', 'EnemyPrefab', -1, this.frameId, now]);
    }
    // UI panel sızıntısı (küçük ama sürekli)
    // UI panel sızıntısı (küçük ama sürekli: saniyede ~1 panel)
    if (scene === 'Level_03_UI_Heavy' && rng() < 0.02) {
      batch.push(['GameObject', 'TooltipPanel', 1, this.frameId, now]);
      if (rng() < 0.1) batch.push(['GameObject', 'TooltipPanel', -1, this.frameId, now]);
    }
    if (batch.length) {
      this.#emit({ t: 'obj', seq: this.seq++, d: batch });
      this.sent.objs += batch.length;
    }
  }

  #logScenario(scene, elapsed, rng, now) {
    const every = (key, seconds) => {
      const last = this.logTimers[key] ?? -1e9;
      if (elapsed - last < seconds) return false;
      this.logTimers[key] = elapsed;
      return true;
    };

    // --- SPAM: [Physics] raycast uyarısı (agregasyon motorunu göstermek için) ---
    if (scene !== 'MainMenu' && rng() < 0.55) {
      this.#emitLog('warn', `Raycast hit ${Math.floor(rng() * 400)} colliders in a single frame — consider LayerMask filtering`, 'Physics',
        `UnityEngine.Physics.RaycastAll (at Assets/Scripts/Combat/HitscanWeapon.cs:142)\nHitscanWeapon.Fire (at Assets/Scripts/Combat/HitscanWeapon.cs:88)\nPlayerController.Update (at Assets/Scripts/Player/PlayerController.cs:57)`);
    }
    // --- SPAM: [UI] NullReferenceException (Unity Console'da 10.000 satır olurdu) ---
    if (scene === 'Level_03_UI_Heavy' && rng() < 0.85) {
      this.#emitLog('exception', `NullReferenceException: Object reference not set to an instance of an object`, 'UI',
        `UIHUDController.RefreshHealthBar () (at Assets/Scripts/UI/UIHUDController.cs:214)\nUIHUDController.Update () (at Assets/Scripts/UI/UIHUDController.cs:96)\nUnityEngine.Debug:LogException`);
    }
    // --- ağ hatası ---
    if (scene === 'Level_02_Combat' && rng() < 0.12) {
      this.#emitLog('error', `Network send failed for Player ${Math.floor(rng() * 8)} (code=${Math.floor(rng() * 4)}): timeout after ${(20 + rng() * 80).toFixed(0)} ms`, 'Network',
        `NetClient.Flush (at Assets/Scripts/Net/NetClient.cs:301)\nNetDriver.LateUpdate (at Assets/Scripts/Net/NetDriver.cs:77)`);
    }
    // --- audio ---
    if (rng() < 0.05) {
      this.#emitLog('warn', `Voice limit reached (32/32) — dropping SFX '${['Impact_Metal', 'Gunshot_03', 'Footstep_Gravel', 'UI_Click'][Math.floor(rng() * 4)]}'`, 'Audio');
    }
    // --- periyodik bilgi logları ---
    if (every('fpsinfo', 6)) {
      this.#emitLog('log', `[Perf] last 300 frames avg ${(1000 / 15.5).toFixed(1)} fps, ${Math.floor(rng() * 40)} GC collections`);
    }
    if (every('save', 14)) {
      this.#emitLog('log', `[Save] Checkpoint written to disk in ${(3 + rng() * 12).toFixed(1)} ms (slot ${Math.floor(rng() * 3)})`);
    }
    if (every('shader', 22)) {
      this.#emitLog('warn', `[Shaders] ${Math.floor(2 + rng() * 8)} shader variants compiled at runtime — hitch risk. Pre-warm with ShaderVariantCollection.`);
    }
    if (scene === 'Boss_Arena' && every('boss', 3)) {
      this.#emitLog('error', `[Boss] Phase transition desync: expected HP ${(40 + rng() * 20).toFixed(0)}%, got ${(10 + rng() * 30).toFixed(0)}%`, 'Boss');
    }
  }

  #eventScenario(scene, elapsed, rng, now, S) {
    const ev = (name, kind, payload) => {
      this.#emit({ t: 'event', seq: this.seq++, ts: now, frame: this.frameId, name, kind, payload });
      this.sent.events++;
    };
    if (scene === 'MainMenu' && this.frameId % 420 === 0) ev('MenuOpened', 'default', { menu: 'Main' });
    if (scene === 'Level_01_Forest' && this.frameId % 300 === 0) ev('CheckpointReached', 'good', { index: Math.floor(this.frameId / 300), score: Math.floor(rng() * 5000) });
    if (S.isSpike && this.frameId % 12 < 2) ev('EnemyWaveSpawned', 'bad', { count: Math.floor(6 + rng() * 14), gcKB: Math.round(S.gcAllocBytes / KB) });
    if (scene === 'Level_02_Combat' && this.frameId % 180 === 0) ev('PlayerDamaged', 'bad', { hp: Math.floor(rng() * 100), source: 'BulletPrefab' });
    if (scene === 'Boss_Arena' && this.frameId % 260 === 0) ev('PlayerDied', 'bad', { score: Math.floor(100 + rng() * 9000), level: 5, cause: 'BossSlam' });
    if (scene === 'Boss_Arena' && this.frameId % 520 === 0) ev('BossPhaseChanged', 'default', { phase: 2 + Math.floor(rng() * 2) });
    if (S.hitchMs > 60) ev('HitchDetected', 'bad', { dtMs: Number(S.dtMs.toFixed(1)), hitchMs: Number(S.hitchMs.toFixed(1)) });
  }
}

export { sceneAt, SCENES };
