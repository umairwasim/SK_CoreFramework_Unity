import { create } from 'zustand';
import { sink, type Frame } from './sink';

/* --------------------------------- tipler --------------------------------- */

export type LogLevel = 'log' | 'warn' | 'error' | 'exception' | 'assert';

export type Culprit = { fn: string; file: string; line: number; internal: boolean } | null;

export type LogContext = {
  fps?: number; dtMs?: number; monoUsedMB?: number; totalReservedMB?: number;
  gcAllocKB?: number; drawCalls?: number; setPass?: number; scene?: string;
};

export type LogGroup = {
  id: string;
  level: LogLevel;
  tag: string | null;
  title: string;
  count: number;
  isSpam: boolean;
  firstTs: number;
  lastTs: number;
  firstFrame: number;
  lastFrame: number;
  firstSample?: string;
  lastSample?: string;
  stack?: string | null;
  culprit?: Culprit;
  context?: LogContext | null;
  exceptionType?: string | null;
  instances?: Array<{ ts: number; frame: number; msg: string }>;
};

export type OmniEvent = {
  ts: number; tRel: number; frame: number; name: string;
  kind: 'default' | 'good' | 'bad' | 'scene' | string;
  payload: Record<string, unknown>; context?: LogContext | null;
};

export type LeakRow = {
  type: string; prefab: string | null; spawned: number; destroyed: number;
  live: number; peak: number; destroyRatio: number; slopePerSec: number;
};

export type Finding = {
  id: string; ts: number; kind: 'leak' | 'gc' | 'hitch' | 'heap' | 'logspam' | string;
  severity: 'low' | 'medium' | 'high' | string; title: string;
  detail: Record<string, any>; tRel: number; frameId: number | null;
};

export type Snapshot = {
  latest: Frame & Record<string, any> | null;
  low: { avg: number; p01: number; p001: number; min: number };
  window: number;
  gcPerSec: number;
  durationSec: number;
  frames: number;
  scene: string;
  agent: AgentInfo;
};

export type AgentInfo = {
  connected: boolean; lastSeq: number; seqGaps: number; packets: number;
  bytes: number; lostRatio: number; lastSeen: number; transport: string | null;
  session?: SessionInfo | null; bye?: string;
};

export type SessionInfo = {
  id: string; startedAt: number; app: string; platform: string; unity: string;
  device: string; targetFps: number; deepProfile: boolean; endedAt?: number | null;
};

export type SimStatus = {
  running: boolean; transport: 'inproc' | 'udp'; fps: number; lossRate: number;
  deepProfile: boolean; sessionId: string; scene: string | null; frameId: number;
  elapsedSec: number; leakedBullets: number; udpPort: number;
  sent: Record<string, number>; mem: Record<string, number>;
};

export type LogFilters = {
  levels: LogLevel[];
  tags: string[];
  search: string;
  spamOnly: boolean;
  mode: 'grouped' | 'raw';
  paused: boolean;
  maxRows: number;
};

type RawLogRow = {
  ts: number; frame: number; level: LogLevel; tag: string | null; msg: string;
  stack?: string | null; fingerprint: string; culprit?: Culprit; context?: LogContext | null;
};

type State = {
  connected: boolean;
  lastError: string | null;
  session: SessionInfo | null;
  agent: AgentInfo;
  scene: string;
  snapshot: Snapshot | null;
  wire: { sentFrames: number; sentBytes: number; sentMessages: number; clients: number; dbWrites: number };
  stats: Record<string, any>;

  groups: LogGroup[];
  rawLogs: RawLogRow[];
  filters: LogFilters;
  expanded: Record<string, boolean>;
  tags: string[];
  logStats: { raw: number; suppressed: number; groups: number; spamGroups: number; ratio: number };

  events: OmniEvent[];
  leaks: LeakRow[];
  findings: Finding[];
  sim: SimStatus | null;
  theme: 'dark' | 'light';

  selectedFrameId: number | null;
  compareA: number | null;
  compareB: number | null;
  inspectorTab: 'flame' | 'compare' | 'leak' | 'history' | 'events';
  lowWindowSec: number;
  showSamplesOnly: boolean;

  // aksiyonlar
  setConnected: (v: boolean, err?: string | null) => void;
  applyState: (s: any) => void;
  applyHistory: (frames: Frame[], events: OmniEvent[]) => void;
  applyFrames: (frames: Frame[]) => void;
  applySnapshot: (msg: any) => void;
  applyLogs: (msg: any) => void;
  applyEvents: (evs: OmniEvent[]) => void;
  applyObjs: (objs: any[]) => void;
  applyFindings: (f: Finding[]) => void;
  setFilters: (patch: Partial<LogFilters>) => void;
  toggleExpanded: (id: string) => void;
  selectFrame: (id: number | null) => void;
  pinCompare: (slot: 'a' | 'b', id: number | null) => void;
  setTab: (t: State['inspectorTab']) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setLowWindow: (sec: number) => void;
  clearLogs: () => void;
  reset: () => void;
};

const MAX_GROUPS = 1200;
const MAX_RAW = 4000;
const MAX_EVENTS = 800;
const MAX_FINDINGS = 300;

export const useStore = create<State>((set, get) => ({
  connected: false,
  lastError: null,
  session: null,
  agent: { connected: false, lastSeq: -1, seqGaps: 0, packets: 0, bytes: 0, lostRatio: 0, lastSeen: 0, transport: null },
  scene: '—',
  snapshot: null,
  wire: { sentFrames: 0, sentBytes: 0, sentMessages: 0, clients: 0, dbWrites: 0 },
  stats: {},
  groups: [],
  rawLogs: [],
  filters: { levels: [], tags: [], search: '', spamOnly: false, mode: 'grouped', paused: false, maxRows: 500 },
  expanded: {},
  tags: [],
  logStats: { raw: 0, suppressed: 0, groups: 0, spamGroups: 0, ratio: 0 },
  events: [],
  leaks: [],
  findings: [],
  sim: null,
  theme: (typeof localStorage !== 'undefined' && ((localStorage.getItem('skcore_theme') || localStorage.getItem('omni.theme')) as any)) || 'dark',
  selectedFrameId: null,
  compareA: null,
  compareB: null,
  inspectorTab: 'flame',
  lowWindowSec: 10,
  showSamplesOnly: false,

  setConnected: (v, err = null) => set({ connected: v, lastError: err }),

  applyState: (s) => {
    set({
      session: s.session ?? null,
      agent: s.agent ?? get().agent,
      scene: s.scene ?? '—',
      snapshot: s.snapshot ?? null,
      stats: s.stats ?? {},
      groups: (s.logGroups ?? []).slice(0, MAX_GROUPS),
      tags: s.tags ?? [],
      events: (s.events ?? []).slice(-MAX_EVENTS),
      leaks: s.leaks ?? [],
      findings: (s.findings ?? []).slice(-MAX_FINDINGS),
    });
  },

  applyHistory: (frames, events) => {
    sink.prependHistory(frames);
    if (events?.length) {
      const merged = [...events, ...get().events];
      merged.sort((a, b) => a.tRel - b.tRel);
      const seen = new Set<string>();
      const uniq = merged.filter((e) => {
        const k = `${e.frame}:${e.name}:${e.ts}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      set({ events: uniq.slice(-MAX_EVENTS) });
    }
  },

  applyFrames: (frames) => {
    sink.pushMany(frames);
    // Seçili kare yoksa en son kareyi takip et (kullanıcı henüz seçmemişse)
    const st = get();
    if (st.selectedFrameId == null && frames.length) {
      const last = frames[frames.length - 1];
      set({ selectedFrameId: last.frameId });
    }
  },

  applySnapshot: (msg) => {
    const patch: Partial<State> = {};
    if (msg.snapshot) {
      patch.snapshot = msg.snapshot;
      patch.scene = msg.snapshot.scene || get().scene;
      patch.agent = msg.snapshot.agent ?? get().agent;
    }
    if (msg.logStats) patch.logStats = msg.logStats;
    if (msg.sim) patch.sim = msg.sim;
    if (msg.leaks) patch.leaks = msg.leaks;
    if (msg.tags) patch.tags = msg.tags;
    if (msg.wire) patch.wire = msg.wire;
    set(patch as any);
  },

  applyLogs: (msg) => {
    const g = msg.group as LogGroup;
    if (!g) return;
    const groups = get().groups.slice();
    const i = groups.findIndex((x) => x.id === g.id);
    if (i >= 0) groups[i] = { ...groups[i], ...g };
    else groups.unshift(g);
    if (groups.length > MAX_GROUPS) groups.length = MAX_GROUPS;
    const patch: Partial<State> = { groups };
    if (msg.row) {
      const raw = get().rawLogs.concat([msg.row]);
      patch.rawLogs = raw.length > MAX_RAW ? raw.slice(raw.length - MAX_RAW) : raw;
    }
    set(patch as any);
  },

  applyEvents: (evs) => {
    const events = get().events.concat(evs);
    set({ events: events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events });
  },

  applyObjs: () => { /* sızıntı tablosu snapshot mesajıyla gelir */ },

  applyFindings: (f) => {
    const findings = get().findings.concat(f);
    set({ findings: findings.length > MAX_FINDINGS ? findings.slice(findings.length - MAX_FINDINGS) : findings });
  },

  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  toggleExpanded: (id) => set({ expanded: { ...get().expanded, [id]: !get().expanded[id] } }),
  selectFrame: (id) => set({ selectedFrameId: id }),
  pinCompare: (slot, id) => set(slot === 'a' ? { compareA: id } : { compareB: id }),
  setTab: (t) => set({ inspectorTab: t }),
  setTheme: (t) => {
    try {
      localStorage.setItem('skcore_theme', t);
      localStorage.setItem('omni.theme', t);
    } catch { /* ignore */ }
    document.documentElement.dataset.theme = t;
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set({ theme: t });
  },
  setLowWindow: (sec) => set({ lowWindowSec: sec }),
  clearLogs: () => set({ groups: [], rawLogs: [], expanded: {} }),
  reset: () => {
    sink.clear();
    set({
      groups: [], rawLogs: [], events: [], findings: [], leaks: [], expanded: {},
      selectedFrameId: null, compareA: null, compareB: null, snapshot: null,
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'skcore_theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
      useStore.getState().setTheme(e.newValue);
    }
  });
}

/** Ham log satırları (Frame Inspector "bu kareye ait loglar" için). */
export function logsForFrame(frameId: number, limit = 50) {
  const out: RawLogRow[] = [];
  const raw = useStore.getState().rawLogs;
  for (let i = raw.length - 1; i >= 0 && out.length < limit; i--) if (raw[i].frame === frameId) out.unshift(raw[i]);
  return out;
}

export function eventsForFrame(frameId: number) {
  return useStore.getState().events.filter((e) => e.frame === frameId);
}
