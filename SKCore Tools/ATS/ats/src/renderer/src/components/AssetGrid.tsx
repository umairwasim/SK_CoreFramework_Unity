import { BUILTIN_PRESETS, cloneSettings, UNITY6_DEFAULTS } from '@shared/defaults';
import type { AssetRecord, AudioInfo, ModelInfo, TextureInfo } from '@shared/types';
import { ArrowDownAZ, ArrowUpAZ, AudioLines, Box, CheckSquare, Loader2, Search, Sparkles, Wand2, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { modelThumbnail } from '@/lib/three';
import { cn, fmtDuration, formatBytes } from '@/lib/utils';
import { ConfirmApply } from './ConfirmApply';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Slider } from './ui/slider';

function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

function ModelThumb({ asset }: { asset: AssetRecord }) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    modelThumbnail(`${asset.id}-${asset.mtimeMs}`, api.fileUrl(asset), asset.ext)
      .then((d) => alive && setSrc(d))
      .catch((e) => {
        console.warn('[ATS] model thumbnail failed', asset.relPath, e);
        if (alive) setErr(true);
      });
    return () => {
      alive = false;
    };
  }, [visible, asset.id, asset.mtimeMs]);
  return (
    <div ref={ref} className="grid size-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#1e293b,#0b0b0f_70%)]">
      {src ? <img src={src} className="size-full object-contain" draggable={false} /> : err ? <Box className="size-10 text-zinc-600" /> : <Loader2 className="size-5 animate-spin text-zinc-600" />}
    </div>
  );
}

const AssetCard = memo(function AssetCard({ asset, selected, size }: { asset: AssetRecord; selected: boolean; size: number }) {
  const select = useStore((s) => s.select);
  const patchAsset = useStore((s) => s.patchAsset);
  const [ref, visible] = useVisible<HTMLDivElement>();
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    if (visible && !asset.info) void api.getAssetInfo(asset.id).then((info) => info && patchAsset({ ...asset, info }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, asset.id, asset.mtimeMs]);

  let detail = '';
  let warn: string | null = null;
  if (asset.info) {
    if (asset.kind === 'texture') {
      const i = asset.info as TextureInfo;
      detail = `${i.width}×${i.height}`;
      if (Math.max(i.width, i.height) > 2048) warn = `>${2048}`;
    } else if (asset.kind === 'audio') {
      const i = asset.info as AudioInfo;
      detail = `${fmtDuration(i.durationSec)} · ${i.channels === 1 ? 'mono' : 'stereo'} · ${(i.sampleRate / 1000).toFixed(1)}k`;
      if (i.channels > 1 && i.durationSec < 10) warn = 'stereo SFX';
    } else {
      const i = asset.info as ModelInfo;
      if (i.triangles != null) detail = `${i.triangles.toLocaleString()} tris`;
    }
  }

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        select(asset.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-panel-2 transition-[border-color,box-shadow]',
        selected ? 'border-sky-400/80 shadow-[0_0_0_1px_rgba(56,189,248,.6),0_8px_24px_-8px_rgba(56,189,248,.35)]' : 'border-border hover:border-zinc-600'
      )}
      style={{ width: size }}
      title={asset.relPath}
    >
      <div className={cn('relative w-full overflow-hidden', asset.kind === 'texture' && 'checker')} style={{ height: asset.kind === 'audio' ? size * 0.55 : size }}>
        {visible && asset.kind === 'texture' && !imgErr && (
          <img src={api.thumbUrl(asset)} onError={() => setImgErr(true)} className="size-full object-contain p-1.5" draggable={false} loading="lazy" />
        )}
        {visible && asset.kind === 'audio' && (
          <div className="grid size-full place-items-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-2">
            {!imgErr ? <img src={api.thumbUrl(asset)} onError={() => setImgErr(true)} className="h-3/4 w-full opacity-90" draggable={false} /> : <AudioLines className="size-8 text-zinc-600" />}
          </div>
        )}
        {visible && asset.kind === 'model' && <ModelThumb asset={asset} />}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          <Badge className="bg-black/60 text-zinc-200 backdrop-blur">.{asset.ext}</Badge>
          {!asset.guid && <Badge variant="amber" title="No .meta – Unity has not imported this file yet">no meta</Badge>}
        </div>
        {warn && (
          <div className="absolute right-1.5 top-1.5">
            <Badge variant="amber" className="bg-amber-500/25 backdrop-blur">{warn}</Badge>
          </div>
        )}
        {selected && <div className="absolute inset-0 bg-sky-400/10" />}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-border/60 px-2 py-1.5">
        <div className="truncate text-[12px] font-medium text-zinc-100">{asset.name}</div>
        <div className="flex items-center justify-between gap-2 text-[10.5px] text-zinc-500">
          <span className="truncate">{detail || '\u00a0'}</span>
          <span className="shrink-0 tabular-nums">{formatBytes(asset.size)}</span>
        </div>
      </div>
    </div>
  );
});

export function FilterBar() {
  const f = useStore((s) => s.filters[s.tab]);
  const setFilter = useStore((s) => s.setFilter);
  const assets = useStore((s) => s.assets);
  const gridSize = useStore((s) => s.gridSize);
  const setGridSize = useStore((s) => s.setGridSize);
  const selectAll = useStore((s) => s.selectAll);
  const loading = useStore((s) => s.loading);
  const [q, setQ] = useState(f.search);
  useEffect(() => setQ(f.search), [f.search]);
  useEffect(() => {
    const t = setTimeout(() => q !== f.search && setFilter({ search: q }), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or path…" className="pl-8" />
        {q && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" onClick={() => setQ('')}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {f.folder && (
        <Badge variant="accent" className="h-6 cursor-default">
          {f.folder.replace(/^Assets\/?/, '') || 'Assets'}
          <button onClick={() => setFilter({ folder: null })}>
            <X className="size-3" />
          </button>
        </Badge>
      )}
      <span className="text-[11.5px] text-zinc-500">
        {loading ? <Loader2 className="inline size-3 animate-spin" /> : `${assets.length} item${assets.length === 1 ? '' : 's'}`}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Select
          value={f.sort}
          onChange={(v) => setFilter({ sort: v })}
          options={[
            { value: 'name', label: 'Sort: Path' },
            { value: 'size', label: 'Sort: Size' },
            { value: 'mtime', label: 'Sort: Modified' },
          ]}
          className="w-36"
        />
        <Button variant="ghost" size="icon" onClick={() => setFilter({ sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' })} title="Toggle sort direction">
          {f.sortDir === 'asc' ? <ArrowDownAZ /> : <ArrowUpAZ />}
        </Button>
        <div className="flex w-28 items-center gap-2" title="Thumbnail size">
          <Slider min={100} max={260} step={10} value={[gridSize]} onValueChange={([v]) => setGridSize(v)} />
        </div>
        <Button variant="ghost" size="sm" onClick={selectAll} title="Select all (Ctrl+A)">
          <CheckSquare /> All
        </Button>
      </div>
    </div>
  );
}

export function AssetGrid() {
  const assets = useStore((s) => s.assets);
  const selected = useStore((s) => s.selected);
  const gridSize = useStore((s) => s.gridSize);
  const clear = useStore((s) => s.clearSelection);
  const ws = useStore((s) => s.workspace);
  const sel = new Set(selected);

  if (!ws) return <div className="grid flex-1 place-items-center text-zinc-500">Open a Unity project to begin.</div>;
  return (
    <div
      className="min-h-0 flex-1 overflow-auto p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) clear();
      }}
    >
      {assets.length === 0 ? (
        <div className="grid h-full place-items-center text-zinc-500">No assets match the current filters.</div>
      ) : (
        <div className="flex flex-wrap content-start gap-2.5" onMouseDown={(e) => e.target === e.currentTarget && clear()}>
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} selected={sel.has(a.id)} size={gridSize} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SelectionBar() {
  const selected = useStore((s) => s.selected);
  const assets = useStore((s) => s.assets);
  const presets = useStore((s) => s.presets);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const suffix = useStore((s) => s.suffix);
  const setSuffix = useStore((s) => s.setSuffix);
  const apply = useStore((s) => s.apply);
  const clear = useStore((s) => s.clearSelection);
  const [presetId, setPresetId] = useState(BUILTIN_PRESETS[1].id);
  const [confirm, setConfirm] = useState<null | { label: string; run: () => void }>(null);
  if (selected.length < 2) return null;
  const bytes = assets.filter((a) => selected.includes(a.id)).reduce((n, a) => n + a.size, 0);
  const preset = presets.find((p) => p.id === presetId);

  const run = (label: string, fn: () => void) => (mode === 'overwrite' ? setConfirm({ label, run: fn }) : fn());

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-panel to-panel px-3">
        <Badge variant="accent" className="h-6 px-2 text-[11.5px]">{selected.length} selected</Badge>
        <span className="text-[11.5px] text-zinc-400">{formatBytes(bytes)}</span>
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="flex overflow-hidden rounded-md border border-border">
          {(['overwrite', 'saveAsNew'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('h-7 px-2.5 text-[11.5px]', mode === m ? (m === 'overwrite' ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200') : 'text-zinc-400 hover:text-zinc-200')}>
              {m === 'overwrite' ? 'Overwrite' : 'Save as New'}
            </button>
          ))}
        </div>
        {mode === 'saveAsNew' && <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} className="h-7 w-28" placeholder="_optimized" />}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => run('Apply Defaults (Unity 6)', () => void apply(selected, { settings: cloneSettings(UNITY6_DEFAULTS), presetName: 'Unity 6 Default' }))}>
            <Sparkles /> Apply Defaults
          </Button>
          <div className="flex items-center">
            <Select value={presetId} onChange={setPresetId} options={presets.map((p) => ({ value: p.id, label: p.name }))} className="w-40 [&_select]:rounded-r-none" />
            <Button size="sm" className="rounded-l-none" onClick={() => preset && run(`Apply preset “${preset.name}”`, () => void apply(selected, { settings: cloneSettings(preset.settings), presetName: preset.name }))}>
              <Wand2 /> Apply Preset
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={clear} title="Clear selection (Esc)">
            <X />
          </Button>
        </div>
      </div>
      {confirm && (
        <ConfirmApply
          count={selected.length}
          label={confirm.label}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
