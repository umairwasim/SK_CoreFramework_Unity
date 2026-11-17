/**
 * OmniProfiler — Akıllı Log Motoru
 *
 * Unity Console'un iki büyük sorunu vardır:
 *   1) Spam: aynı NullReferenceException 10.000 kez listelenir, panel kilitlenir.
 *   2) Bağlamsızlık: "hata oldu" dersin ama o anda FPS kaçtı, hangi sahnedeydin,
 *      bellek ne durumdaydı — bilmezsin.
 *
 * Bu motor üç iş yapar:
 *   A) ETİKETLEME  : "[Physics] ..." -> tag = "Physics" (UI'da renkli chip)
 *   B) PARSE       : stack trace'ten dosya/satır çıkarır, "suçlu kare"yi bulur
 *                     (Unity içi kareleri atlayıp ilk kullanıcı kodunu işaretler)
 *   C) AGREGASYON  : mesajı normalize edip fingerprint çıkarır; aynı fingerprint
 *                     tekrarlandıkça TEK satırda sayaç olarak toplar (x50) ve
 *                     ilk/son görülme zamanını + bağlam anlık görüntüsünü saklar.
 */

/* --------------------------------- A) etiket -------------------------------- */

const TAG_RE = /^\s*\[([A-Za-z0-9_.\-/ ]{1,32})\]\s*/;

/** "[Network] Player 7 disconnected" -> { tag:'Network', text:'Player 7 disconnected' } */
export function extractTag(msg) {
  const m = TAG_RE.exec(msg || '');
  if (!m) return { tag: null, text: msg || '' };
  return { tag: m[1].trim(), text: (msg || '').slice(m[0].length) };
}

/* --------------------------------- B) parse --------------------------------- */

const FRAME_RE = /(?:at\s+)?([A-Za-z0-9_$.<>+[\]]+)\s*\(.*?\)?\s*\(?(?:at\s+)?([^()\s]+\.(?:cs|ts|js|cpp)):(\d+)\)?/g;
const SIMPLE_RE = /([^()\s]+\.(?:cs|ts|js)):(\d+)/g;

/** Unity/mono içi kareler: sızıntının kaynağı bunlar değil, kullanıcı kodu. */
const INTERNAL_RE = /^(UnityEngine\.|UnityEditor\.|Unity\.|TMPro\.|System\.|Microsoft\.|Mono\.|Internal\.)|UnityEngine\.cs$|<0x[0-9a-f]+>/;

/**
 * Stack trace'i yapılandırılmış karelere ayırır ve "suçlu" kareyi seçer.
 * @returns {{frames: Array<{fn:string,file:string,line:number,internal:boolean}>, culprit: object|null}}
 */
export function parseStack(stack) {
  if (!stack) return { frames: [], culprit: null };
  const frames = [];
  FRAME_RE.lastIndex = 0;
  let m;
  while ((m = FRAME_RE.exec(stack)) && frames.length < 64) {
    const fn = m[1];
    const file = m[2];
    const line = Number(m[3]);
    const internal = INTERNAL_RE.test(fn) || INTERNAL_RE.test(file);
    frames.push({ fn, file, line, internal });
  }
  if (!frames.length) {
    SIMPLE_RE.lastIndex = 0;
    while ((m = SIMPLE_RE.exec(stack)) && frames.length < 64) {
      frames.push({ fn: '?', file: m[1], line: Number(m[2]), internal: false });
    }
  }
  const culprit = frames.find((f) => !f.internal) ?? frames[0] ?? null;
  return { frames, culprit };
}

/* ------------------------------- C) agregasyon ------------------------------ */

/**
 * Mesaj normalizasyonu: agregasyonun kalbi.
 * "Player 42 health 13" ve "Player 7 health 90" aynı parmak izine düşmeli,
 * yoksa spam gruplanmaz. Bu yüzden sayılar, hex'ler, GUID'ler, tırnaklı
 * metinler ve yollar placeholder'a çevrilir.
 */
export function normalizeMessage(msg) {
  return (msg || '')
    .replace(/0x[0-9a-fA-F]+/g, '0x#')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<guid>')
    .replace(/\b\d+(\.\d+)?\b/g, '#')
    .replace(/'[^']*'/g, "'*'")
    .replace(/"[^"]*"/g, '"*"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

/** Küçük, hızlı, deterministik hash (FNV-1a 32-bit). */
export function fingerprint(level, tag, normalized, exceptionType) {
  const s = `${level}|${tag ?? ''}|${exceptionType ?? ''}|${normalized}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const EXCEPTION_RE = /^([A-Za-z0-9_.]*(?:Exception|Error))\b/;

/**
 * Log agregatörü.
 *
 * Davranış: aynı fingerprint `spamThreshold` (varsayılan 5) kez görülünce
 * "spam grubu" olur. Bundan sonra her örnek UI'a TEK TEK gitmez; bunun yerine
 * grup satırı ~`updateIntervalMs` aralıkla güncellenir (sayaç, son görülme,
 * son bağlam). Böylece 10.000 satırlık bir hata UI'da 1 satır = 1 render.
 */
export class LogAggregator {
  constructor({ spamThreshold = 5, updateIntervalMs = 500, maxInstances = 20, maxGroups = 4000 } = {}) {
    this.spamThreshold = spamThreshold;
    this.updateIntervalMs = updateIntervalMs;
    this.maxInstances = maxInstances;
    this.maxGroups = maxGroups;
    /** @type {Map<string, object>} */
    this.groups = new Map();
    this.totalIn = 0;
    this.totalSuppressed = 0;
    this.order = 0;
  }

  get stats() {
    return {
      raw: this.totalIn,
      suppressed: this.totalSuppressed,
      groups: this.groups.size,
      spamGroups: [...this.groups.values()].filter((g) => g.isSpam).length,
      ratio: this.totalIn ? 1 - this.groups.size / this.totalIn : 0,
    };
  }

  /**
   * @param {object} raw {ts, frame, level, msg, stack, tag, scene}
   * @param {object|null} context {fps, monoUsedMB, totalReservedMB, drawCalls, scene}
   * @returns {{action:'new'|'update'|'suppressed', group:object, logRow:object}}
   */
  ingest(raw, context) {
    this.totalIn++;
    const { tag: tagFromMsg, text } = extractTag(raw.msg);
    const tag = raw.tag || tagFromMsg || null;
    const body = tagFromMsg ? text : raw.msg || '';
    const excMatch = EXCEPTION_RE.exec(body.trim());
    const exceptionType = excMatch ? excMatch[1].split('.').pop() : null;
    const normalized = normalizeMessage(body);
    const fp = fingerprint(raw.level, tag, normalized, exceptionType);
    const { frames, culprit } = parseStack(raw.stack);

    let g = this.groups.get(fp);
    const isNew = !g;
    if (isNew) {
      if (this.groups.size >= this.maxGroups) {
        // En eski ve en az görülen grubu düşür (bellek tavanı)
        const oldest = this.groups.keys().next().value;
        this.groups.delete(oldest);
      }
      g = {
        id: fp,
        fingerprint: fp,
        level: raw.level,
        tag,
        exceptionType,
        normalized,
        // Unity exception logları zaten "NullReferenceException: ..." diye başlar;
        // tip adını bir daha öne eklemek "NullReferenceException: NullReferenceException: ..."
        // gibi çirkin bir başlık üretir. Bu yüzden tekrar tespit edilip atlanır.
        title: (exceptionType && !normalized.startsWith(exceptionType)
          ? `${exceptionType}: ${normalized.slice(0, 120)}`
          : normalized.slice(0, 160)) || '(boş mesaj)',
        count: 0,
        firstTs: raw.ts,
        lastTs: raw.ts,
        firstFrame: raw.frame,
        lastFrame: raw.frame,
        firstSample: body,
        lastSample: body,
        stack: raw.stack || null,
        culprit,
        frames,
        context: context || null,
        firstContext: context || null,
        isSpam: false,
        lastBroadcast: 0,
        order: this.order++,
        instances: [],
      };
      this.groups.set(fp, g);
    }

    g.count++;
    g.lastTs = raw.ts;
    g.lastFrame = raw.frame;
    g.lastSample = body;
    if (context) g.context = context;
    if (g.count >= this.spamThreshold) g.isSpam = true;
    if (g.instances.length < this.maxInstances) {
      g.instances.push({ ts: raw.ts, frame: raw.frame, msg: body, context });
    }

    const logRow = {
      ts: raw.ts,
      frame: raw.frame,
      level: raw.level,
      tag,
      msg: body,
      stack: raw.stack || null,
      fingerprint: fp,
      groupCount: 1,
      context,
      culprit,
      scene: raw.scene ?? context?.scene ?? null,
    };

    // Yayın kararı: yeni grup -> hemen. Spam grup -> throttle edilmiş güncelleme.
    // Spam olmayan mevcut grup -> her örnek yayınlanır (kullanıcı akışı görmek ister).
    const now = Date.now();
    let action;
    if (isNew) action = 'new';
    else if (g.isSpam) {
      if (now - g.lastBroadcast >= this.updateIntervalMs) {
        action = 'update';
        g.lastBroadcast = now;
      } else {
        action = 'suppressed';
        this.totalSuppressed++;
      }
    } else action = 'update';

    if (action !== 'suppressed') g.lastBroadcast = now;
    return { action, group: g, logRow };
  }

  /** Filtrelenmiş grup listesi (UI sol paneli bunu kullanır). */
  list({ levels = null, tags = null, search = '', spamOnly = false, limit = 2000 } = {}) {
    let out = [];
    for (const g of this.groups.values()) {
      if (levels && levels.length && !levels.includes(g.level)) continue;
      if (tags && tags.length && !(g.tag && tags.includes(g.tag))) continue;
      if (spamOnly && !g.isSpam) continue;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${g.title} ${g.tag ?? ''} ${g.culprit?.file ?? ''} ${g.culprit?.fn ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(publicGroup(g));
    }
    out.sort((a, b) => b.lastTs - a.lastTs || b.count - a.count);
    if (out.length > limit) out = out.slice(0, limit);
    return out;
  }

  get(id) {
    const g = this.groups.get(id);
    return g ? publicGroup(g) : null;
  }

  allTags() {
    const s = new Set();
    for (const g of this.groups.values()) if (g.tag) s.add(g.tag);
    return [...s].sort();
  }

  clear() {
    this.groups.clear();
    this.totalIn = 0;
    this.totalSuppressed = 0;
  }
}

/** UI'ya giden güvenli/serileştirilebilir grup görünümü. */
export function publicGroup(g) {
  return {
    id: g.id,
    level: g.level,
    tag: g.tag,
    exceptionType: g.exceptionType,
    title: g.title,
    normalized: g.normalized,
    count: g.count,
    isSpam: g.isSpam,
    firstTs: g.firstTs,
    lastTs: g.lastTs,
    firstFrame: g.firstFrame,
    lastFrame: g.lastFrame,
    firstSample: g.firstSample,
    lastSample: g.lastSample,
    stack: g.stack,
    culprit: g.culprit,
    frameCount: g.frames?.length ?? 0,
    context: g.context,
    firstContext: g.firstContext,
    order: g.order,
    instances: g.instances.slice(-8),
  };
}
