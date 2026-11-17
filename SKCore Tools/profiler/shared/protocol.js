/**
 * OmniProfiler — Wire Protocol v1
 * --------------------------------
 * Unity Agent  ->  OmniProfiler Main (Electron / Node)
 *
 * Taşıma: UDP (varsayılan, düşük gecikme) veya WebSocket (güvenilir mod).
 * Kodlama: newline-delimited JSON (NDJSON). Tek datagram = 1..N mesaj, '\n' ile ayrılır.
 *
 * UDP'de fragmentasyonu önlemek için hedef datagram boyutu <= 1400 byte.
 * Ajan bu eşiği aşarsa mesajları `part/i/n` alanlarıyla böler (bkz. chunking).
 *
 * Her ajan mesajı monoton artan bir `seq` taşır; alıcı taraf paket kaybını
 * (loss) hesaplayıp UI'da "veri kalitesi" olarak gösterir.
 */

/** @typedef {'hello'|'frame'|'log'|'event'|'obj'|'scene'|'bye'} MsgType */

/**
 * `hello` — ajan bağlandığında bir kez gönderilir.
 * @typedef {Object} HelloMsg
 * @property {'hello'} t
 * @property {number} seq
 * @property {number} ts        ajan tarafı unix ms
 * @property {string} sessionId ajan tarafından üretilen benzersiz oturum kimliği
 * @property {string} app
 * @property {string} platform  'editor' | 'standalone' | 'android' | 'ios' | 'webgl' | 'mock'
 * @property {string} unity
 * @property {string} device
 * @property {number} targetFps
 * @property {boolean} deepProfile
 */

/**
 * `frame` — kare metrikleri. `f` dizisi sıkıştırılmış kolon düzenidir (aşağıdaki FRAME_FIELDS).
 * @typedef {Object} FrameMsg
 * @property {'frame'} t
 * @property {number} seq
 * @property {number} ts
 * @property {Array<Array<number>>} f  her satır bir kare: [frameId, dtMs, gcAllocBytes, ...]
 * @property {Array<number>} [q]       ilgili karelerin "veri kalitesi" bayrakları (0=temiz, 1=tahmini/interpolated)
 */

/** FRAME_FIELDS[i] = f satırındaki i. kolonun adı. Sıra DEĞİŞTİRİLEMEZ (protokol sözleşmesi). */
export const FRAME_FIELDS = [
  'frameId',        // 0  Unity Time.frameCount
  'dtMs',           // 1  Time.deltaTime * 1000
  'gcAllocBytes',   // 2  Profiler.GetMonoUsedSizeLong() delta (kare başına managed alloc)
  'totalReserved',  // 3  Profiler.GetTotalReservedMemoryLong()
  'totalAllocated', // 4  Profiler.GetTotalAllocatedMemoryLong()
  'monoHeap',       // 5  Profiler.GetMonoHeapSizeLong()
  'monoUsed',       // 6  Profiler.GetMonoUsedSizeLong()
  'gfxDriver',      // 7  Profiler.GetAllocatedMemoryForGraphicsDriver()
  'drawCalls',      // 8  UnityStats.drawCalls
  'batches',        // 9  UnityStats.batches
  'setPassCalls',   // 10 UnityStats.setPassCalls
  'triangles',      // 11 UnityStats.triangles
  'vertices',       // 12 UnityStats.vertices
  'mainThreadMs',   // 13 Profiler recorder "Main Thread"
  'renderThreadMs', // 14 Profiler recorder "Render Thread"
  'gpuMs',          // 15 Profiler recorder "GFX.WaitForPresent" (yaklaşık GPU)
  'physicsMs',      // 16 Profiler recorder "Physics"
  'animMs',         // 17 Profiler recorder "Animation"
];

/**
 * `log` — Unity Application.logMessageReceivedThreaded yakalaması.
 * @typedef {Object} LogMsg
 * @property {'log'} t
 * @property {number} seq
 * @property {number} ts
 * @property {number} frame
 * @property {'log'|'warn'|'error'|'exception'|'assert'} level
 * @property {string} msg
 * @property {string} [stack]
 * @property {string} [tag]    ajan tarafında [Fizik] gibi köşeli parantezden çıkarıldıysa
 * @property {string} [scene]
 */

/**
 * `event` — OmniProfiler.TrackEvent("PlayerDied", {...})
 * @typedef {Object} EventMsg
 * @property {'event'} t
 * @property {number} seq
 * @property {number} ts
 * @property {number} frame
 * @property {string} name
 * @property {Record<string, any>} [payload]
 * @property {string} [kind]   'default'|'good'|'bad'|'scene'
 */

/**
 * `obj` — Instantiate/Destroy dinleyicisi (bellek sızıntısı dedektörünün ham verisi).
 * `d` dizisi: [type, prefabName, delta, frame, ts]
 * @typedef {Object} ObjMsg
 * @property {'obj'} t
 * @property {number} seq
 * @property {Array<Array<[string,string,number,number,number]>>} d
 */

/**
 * `scene` — sahne yükleme/boşaltma olayı.
 * @typedef {Object} SceneMsg
 * @property {'scene'} t
 * @property {number} seq
 * @property {number} ts
 * @property {number} frame
 * @property {string} name
 * @property {'load'|'unload'} op
 */

/**
 * `bye` — ajan kapanıyor (Editör play-mode çıkışı, uygulama sonlanması).
 * @typedef {Object} ByeMsg
 * @property {'bye'} t
 * @property {number} seq
 * @property {number} ts
 * @property {string} [reason]
 */

/* ------------------------------------------------------------------ */
/* Ajan -> Panel yönlü "örnekleme ağacı" (flamegraph)                   */
/* ------------------------------------------------------------------ */

/**
 * Profiler.BeginSample/EndSample ağacı. Ağaç düz bir diziye pre-order
 * (depth-first) serileştirilir; her düğüm:
 *   [name, selfMicros, totalMicros, childCount, depth]
 * `depth` alanı alıcının ağacı tekrar kurmak için pahalı bir gezinme yapmasını
 * engeller (flamegraph render'ı doğrudan bu düz diziden çizilir).
 * `part/i/n` alanları büyük kareleri birden çok datagrama bölmek içindir.
 *
 * @typedef {Object} SamplesMsg
 * @property {'samples'} t
 * @property {number} seq
 * @property {number} ts
 * @property {number} frame
 * @property {Array<[string, number, number, number, number]>} s
 * @property {number} [part]
 * @property {number} [i]
 * @property {number} [n]
 */

export const MSG_TYPES = ['hello', 'frame', 'log', 'event', 'obj', 'scene', 'samples', 'bye'];

/* ------------------------------------------------------------------ */
/* Panel -> Tarayıcı (WebSocket) mesajları                              */
/* ------------------------------------------------------------------ */
/**
 * @typedef {'hello'|'state'|'frames'|'logs'|'events'|'objs'|'scene'|'agent'|'finding'|'sim'|'session'|'quality'} ClientMsgType
 */

/** Yardımcı: kolon indeksinden okuma (ajan/pipeline ortak kullanır). */
export const F = Object.fromEntries(FRAME_FIELDS.map((name, i) => [name, i]));

/** Tek bir ham kare satırını okunabilir nesneye çevirir. */
export function rowToFrame(row) {
  const o = {};
  for (let i = 0; i < FRAME_FIELDS.length; i++) o[FRAME_FIELDS[i]] = row[i];
  return o;
}

/** Hedef datagram boyutu (byte). Ajan bunu aşan payload'ları böler. */
export const MAX_DATAGRAM = 1400;

export const PROTOCOL_VERSION = 1;
