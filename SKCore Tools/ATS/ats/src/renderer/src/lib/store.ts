import { BUILTIN_PRESETS, cloneSettings, UNITY6_DEFAULTS } from '@shared/defaults';
import type {
  ApplyMode, AssetKind, AssetRecord, AtsEvent, FolderNode, JobStatus, Preset, SettingsBundle, ToolStatus, WorkspaceInfo,
} from '@shared/types';
import { create } from 'zustand';
import { api } from './api';

export interface Filters {
  folder: string | null;
  search: string;
  formats: string[];
  tags: string[];
  sizeBucket: 'any' | 'lt100k' | '100k-1m' | '1m-10m' | 'gt10m';
  sort: 'name' | 'size' | 'mtime';
  sortDir: 'asc' | 'desc';
}
const emptyFilters = (): Filters => ({ folder: null, search: '', formats: [], tags: [], sizeBucket: 'any', sort: 'name', sortDir: 'asc' });
const SIZE: Record<Filters['sizeBucket'], [number | undefined, number | undefined]> = {
  any: [undefined, undefined],
  lt100k: [undefined, 100 * 1024],
  '100k-1m': [100 * 1024, 1024 * 1024],
  '1m-10m': [1024 * 1024, 10 * 1024 * 1024],
  gt10m: [10 * 1024 * 1024, undefined],
};

export interface LogLine {
  t: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface State {
  ready: boolean;
  workspace: WorkspaceInfo | null;
  scan: { scanned: number; phase: string } | null;
  tab: AssetKind;
  filters: Record<AssetKind, Filters>;
  assets: AssetRecord[];
  loading: boolean;
  tree: FolderNode | null;
  facets: { formats: string[]; tags: string[] };
  selected: number[];
  anchor: number | null;
  presets: Preset[];
  presetId: string;
  settings: SettingsBundle;
  dirty: boolean;
  mode: ApplyMode;
  suffix: string;
  jobs: Record<string, JobStatus>;
  historyTick: number;
  assetsTick: number;
  logs: LogLine[];
  dock: { open: boolean; tab: 'queue' | 'history' | 'log' };
  gridSize: number;
  tools: ToolStatus | null;
  toasts: Toast[];
  openDialog: boolean;

  init(): Promise<void>;
  openWorkspace(path?: string): Promise<void>;
  setTab(k: AssetKind): void;
  setFilter(p: Partial<Filters>): void;
  refresh(): Promise<void>;
  select(id: number, mod: { ctrl?: boolean; shift?: boolean }): void;
  selectAll(): void;
  clearSelection(): void;
  loadPreset(id: string): void;
  updateSettings(fn: (s: SettingsBundle) => void): void;
  setMode(m: ApplyMode): void;
  setSuffix(s: string): void;
  apply(ids: number[], opts?: { settings?: SettingsBundle; presetName?: string }): Promise<void>;
  savePreset(name: string, description?: string): Promise<void>;
  deletePreset(id: string): Promise<void>;
  undo(opId?: number): Promise<void>;
  toast(kind: Toast['kind'], message: string): void;
  setDock(p: Partial<State['dock']>): void;
  setGridSize(n: number): void;
  setOpenDialog(v: boolean): void;
  patchAsset(a: AssetRecord): void;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  workspace: null,
  scan: null,
  tab: 'texture',
  filters: { texture: emptyFilters(), model: emptyFilters(), audio: emptyFilters() },
  assets: [],
  loading: false,
  tree: null,
  facets: { formats: [], tags: [] },
  selected: [],
  anchor: null,
  presets: BUILTIN_PRESETS,
  presetId: 'unity6-default',
  settings: cloneSettings(UNITY6_DEFAULTS),
  dirty: false,
  mode: 'overwrite',
  suffix: '_optimized',
  jobs: {},
  historyTick: 0,
  assetsTick: 0,
  logs: [],
  dock: { open: false, tab: 'queue' },
  gridSize: Number(localStorage.getItem('ats.grid') ?? 150),
  tools: null,
  toasts: [],
  openDialog: false,

  async init() {
    api.onEvent((e: AtsEvent) => {
      switch (e.type) {
        case 'workspace':
          set({ workspace: e.workspace, scan: null });
          void get().refresh();
          break;
        case 'scan-progress':
          set({ scan: e.phase === 'done' ? null : { scanned: e.scanned, phase: e.phase } });
          break;
        case 'assets-changed':
          set((s) => ({ assetsTick: s.assetsTick + 1 }));
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void get().refresh(), 200);
          break;
        case 'job': {
          const prev = get().jobs[e.job.id];
          set((s) => ({ jobs: { ...s.jobs, [e.job.id]: e.job } }));
          if (prev?.state === 'running' && (e.job.state === 'done' || e.job.state === 'failed')) {
            const ok = e.job.results.filter((r) => r.ok).length;
            const failed = e.job.results.length - ok;
            get().toast(failed ? 'error' : 'success', `${e.job.label}: ${ok} ok${failed ? `, ${failed} failed` : ''}`);
          }
          break;
        }
        case 'history-changed':
          set((s) => ({ historyTick: s.historyTick + 1 }));
          break;
        case 'log':
          set((s) => ({ logs: [...s.logs.slice(-499), { t: Date.now(), level: e.level, message: e.message }] }));
          if (e.level !== 'info') get().toast(e.level === 'error' ? 'error' : 'info', e.message);
          break;
      }
    });
    const [workspace, presets, jobs, tools] = await Promise.all([api.getWorkspace(), api.listPresets(), api.listJobs(), api.toolStatus()]);
    set({ workspace, presets, tools, jobs: Object.fromEntries(jobs.map((j) => [j.id, j])), ready: true, openDialog: !workspace });
    if (workspace) await get().refresh();
  },

  async openWorkspace(path) {
    try {
      const ws = path ? await api.openWorkspace(path) : await api.openWorkspaceDialog();
      if (ws) {
        set({ workspace: ws, selected: [], anchor: null, openDialog: false, filters: { texture: emptyFilters(), model: emptyFilters(), audio: emptyFilters() } });
        await get().refresh();
      } else if (api.mode === 'web') set({ openDialog: true });
    } catch (e) {
      get().toast('error', (e as Error).message);
      throw e;
    }
  },

  setTab(k) {
    set({ tab: k, selected: [], anchor: null });
    void get().refresh();
  },

  setFilter(p) {
    const { tab, filters } = get();
    set({ filters: { ...filters, [tab]: { ...filters[tab], ...p } } });
    void get().refresh();
  },

  async refresh() {
    const { workspace, tab, filters } = get();
    if (!workspace) return;
    const f = filters[tab];
    set({ loading: true });
    const [min, max] = SIZE[f.sizeBucket];
    try {
      const [assets, tree, facets] = await Promise.all([
        api.listAssets({ kind: tab, folder: f.folder, search: f.search, formats: f.formats, tags: f.tags, minSize: min, maxSize: max, sort: f.sort, sortDir: f.sortDir }),
        api.getFolderTree(tab),
        api.getFacets(tab),
      ]);
      if (get().tab !== tab) return;
      const ids = new Set(assets.map((a) => a.id));
      set((s) => ({ assets, tree, facets, loading: false, selected: s.selected.filter((id) => ids.has(id)) }));
    } catch (e) {
      set({ loading: false });
      get().toast('error', (e as Error).message);
    }
  },

  select(id, mod) {
    const { selected, anchor, assets } = get();
    if (mod.shift && anchor != null) {
      const a = assets.findIndex((x) => x.id === anchor);
      const b = assets.findIndex((x) => x.id === id);
      if (a >= 0 && b >= 0) {
        const range = assets.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
        set({ selected: mod.ctrl ? [...new Set([...selected, ...range])] : range });
        return;
      }
    }
    if (mod.ctrl) {
      set({ selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], anchor: id });
      return;
    }
    set({ selected: [id], anchor: id });
  },
  selectAll() {
    set((s) => ({ selected: s.assets.map((a) => a.id) }));
  },
  clearSelection() {
    set({ selected: [], anchor: null });
  },

  loadPreset(id) {
    const p = get().presets.find((x) => x.id === id);
    if (p) set({ presetId: id, settings: cloneSettings(p.settings), dirty: false });
  },
  updateSettings(fn) {
    const s = cloneSettings(get().settings);
    fn(s);
    set({ settings: s, dirty: true });
  },
  setMode(m) {
    set({ mode: m });
  },
  setSuffix(s) {
    set({ suffix: s });
  },

  async apply(ids, opts) {
    const { mode, suffix, settings, presets, presetId, dirty } = get();
    const preset = presets.find((p) => p.id === presetId);
    try {
      await api.apply({
        assetIds: ids,
        mode,
        suffix,
        settings: opts?.settings ?? settings,
        presetName: opts?.presetName ?? (preset ? `${preset.name}${dirty ? ' (modified)' : ''}` : undefined),
      });
      set((s) => ({ dock: { ...s.dock, open: true, tab: 'queue' } }));
    } catch (e) {
      get().toast('error', (e as Error).message);
    }
  },

  async savePreset(name, description) {
    const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    try {
      const presets = await api.savePreset({ id, name: name.trim(), description, settings: get().settings });
      set({ presets, presetId: id, dirty: false });
      get().toast('success', `Preset “${name}” saved`);
    } catch (e) {
      get().toast('error', (e as Error).message);
    }
  },
  async deletePreset(id) {
    try {
      const presets = await api.deletePreset(id);
      set({ presets, presetId: 'unity6-default', settings: cloneSettings(UNITY6_DEFAULTS), dirty: false });
    } catch (e) {
      get().toast('error', (e as Error).message);
    }
  },

  async undo(opId) {
    try {
      const r = await api.undoOperation(opId);
      get().toast('success', r.message);
    } catch (e) {
      get().toast('error', (e as Error).message);
    }
  },

  toast(kind, message) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4000);
  },
  setDock(p) {
    set((s) => ({ dock: { ...s.dock, ...p } }));
  },
  setGridSize(n) {
    localStorage.setItem('ats.grid', String(n));
    set({ gridSize: n });
  },
  setOpenDialog(v) {
    set({ openDialog: v });
  },
  patchAsset(a) {
    set((s) => ({ assets: s.assets.map((x) => (x.id === a.id ? a : x)) }));
  },
}));
