import type { AssetKind, AssetRecord, AudioInfo, ModelInfo, TextureInfo } from '@shared/types';
import { Check, ChevronDown, Copy, FileCode2, Lock, MousePointerClick, Plus, Save, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn, fmtDuration, formatBytes } from '@/lib/utils';
import { ConfirmApply } from './ConfirmApply';
import { AudioPreview } from './previews/AudioPreview';
import { ModelPreview } from './previews/ModelPreview';
import { TexturePreview } from './previews/TexturePreview';
import { SettingsEditor } from './SettingsEditor';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';

function parseLabels(meta: string | null): string[] {
  if (!meta) return [];
  const m = /^labels:\r?\n((?:- .*\r?\n?)+)/m.exec(meta);
  return m ? m[1].split(/\r?\n/).map((l) => l.replace(/^- /, '').trim()).filter(Boolean) : [];
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[2px] text-[12px]">
      <span className="shrink-0 text-zinc-500">{k}</span>
      <span className={cn('min-w-0 truncate text-right text-zinc-200', mono && 'font-mono text-[11px]')}>{v}</span>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="text-zinc-500 hover:text-zinc-200"
      title="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      {ok ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

function PresetBar() {
  const presets = useStore((s) => s.presets);
  const presetId = useStore((s) => s.presetId);
  const dirty = useStore((s) => s.dirty);
  const loadPreset = useStore((s) => s.loadPreset);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const current = presets.find((p) => p.id === presetId);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Select value={presetId} onChange={loadPreset} options={presets.map((p) => ({ value: p.id, label: `${p.name}${p.builtIn ? '' : ' ★'}` }))} className="flex-1" />
        {dirty && <Badge variant="amber" title="Settings differ from the preset">modified</Badge>}
        <Button variant="ghost" size="icon" title="Save current settings as preset" onClick={() => setSaving(!saving)}>
          <Save />
        </Button>
        {current && !current.builtIn && (
          <Button variant="ghost" size="icon" title="Delete preset" onClick={() => void deletePreset(current.id)}>
            <Trash2 />
          </Button>
        )}
      </div>
      {current?.description && !saving && <p className="text-[11px] leading-snug text-zinc-500">{current.description}</p>}
      {saving && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void savePreset(name).then(() => {
              setSaving(false);
              setName('');
            });
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name, e.g. Mobile Low" className="h-7" />
          <Button size="sm" type="submit">Save</Button>
        </form>
      )}
    </div>
  );
}

function ApplyFooter({ ids, kinds }: { ids: number[]; kinds: AssetKind[] }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const suffix = useStore((s) => s.suffix);
  const setSuffix = useStore((s) => s.setSuffix);
  const apply = useStore((s) => s.apply);
  const jobs = useStore((s) => s.jobs);
  const [confirm, setConfirm] = useState(false);
  const busy = Object.values(jobs).some((j) => j.state === 'running' || j.state === 'queued');
  const go = () => void apply(ids);
  return (
    <div className="shrink-0 space-y-2 border-t border-border bg-panel p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5">
        {(['overwrite', 'saveAsNew'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'h-7 rounded-md text-[12px] font-medium transition-colors',
              mode === m ? (m === 'overwrite' ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200') : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {m === 'overwrite' ? 'Overwrite' : 'Save as New'}
          </button>
        ))}
      </div>
      {mode === 'saveAsNew' ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11.5px] text-zinc-500">Suffix</span>
          <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} className="h-7" />
          {['_optimized', '_mobile'].map((s) => (
            <button key={s} onClick={() => setSuffix(s)} className="shrink-0 text-[10.5px] text-zinc-500 hover:text-sky-300">{s}</button>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="size-3.5 text-emerald-400" /> GUID kept · backup in ATS_Backup · undoable
        </p>
      )}
      <Button className="w-full" size="lg" onClick={() => (mode === 'overwrite' && ids.length > 1 ? setConfirm(true) : go())} disabled={!ids.length}>
        <Zap /> {mode === 'overwrite' ? 'Apply & Overwrite' : 'Apply & Save as New'}
        {ids.length > 1 ? ` (${ids.length})` : ''}
        {busy && <span className="ml-1 text-[10.5px] opacity-70">· queued</span>}
      </Button>
      {kinds.length > 1 && <p className="text-center text-[10.5px] text-zinc-500">Each asset uses the section for its type.</p>}
      {confirm && <ConfirmApply count={ids.length} label="The current Inspector settings" onCancel={() => setConfirm(false)} onConfirm={() => (setConfirm(false), go())} />}
    </div>
  );
}

function TagsEditor({ asset, locked }: { asset: AssetRecord; locked: string[] }) {
  const patchAsset = useStore((s) => s.patchAsset);
  const [v, setV] = useState('');
  const custom = asset.tags.filter((t) => !locked.includes(t));
  const save = async (tags: string[]) => {
    const r = await api.setTags(asset.id, tags);
    if (r) patchAsset({ ...r, info: asset.info });
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {locked.map((t) => (
        <Badge key={t} variant="violet" title="Unity asset label (from .meta)">
          <Lock className="size-2.5" />
          {t}
        </Badge>
      ))}
      {custom.map((t) => (
        <Badge key={t} variant="accent">
          {t}
          <button onClick={() => void save(custom.filter((x) => x !== t))}>
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) void save([...custom, v.trim()]).then(() => setV(''));
        }}
        className="flex items-center"
      >
        <Plus className="size-3 text-zinc-600" />
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="add tag" className="w-20 bg-transparent text-[11.5px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none" />
      </form>
    </div>
  );
}

function SingleInspector({ asset }: { asset: AssetRecord }) {
  const [info, setInfo] = useState(asset.info);
  const [meta, setMeta] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const assetsTick = useStore((s) => s.assetsTick);

  useEffect(() => {
    setInfo(asset.info);
    void api.getAssetInfo(asset.id).then(setInfo);
    void api.readMeta(asset.id).then(setMeta);
  }, [asset.id, asset.mtimeMs, assetsTick]);

  const labels = useMemo(() => parseLabels(meta), [meta]);
  const importer = /^([A-Za-z]+Importer):/m.exec(meta ?? '')?.[1];

  return (
    <>
      <div className="h-[280px] shrink-0 border-b border-border">
        {asset.kind === 'texture' && <TexturePreview asset={asset} />}
        {asset.kind === 'model' && <ModelPreview asset={asset} />}
        {asset.kind === 'audio' && <AudioPreview asset={asset} />}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-zinc-50" title={asset.name}>{asset.name}</h3>
            <Badge>.{asset.ext}</Badge>
          </div>
          <div className="truncate text-[11px] text-zinc-500" title={asset.relPath}>{asset.relPath}</div>
        </div>
        <div className="rounded-lg border border-border bg-zinc-900/40 px-2.5 py-1.5">
          <KV k="Size" v={formatBytes(asset.size)} />
          <KV
            k="GUID"
            mono
            v={
              asset.guid ? (
                <span className="flex items-center justify-end gap-1.5">
                  {asset.guid}
                  <CopyBtn text={asset.guid} />
                </span>
              ) : (
                <span className="text-amber-300">no .meta yet</span>
              )
            }
          />
          {importer && <KV k="Importer" v={importer} />}
          {info && asset.kind === 'texture' && (
            <>
              <KV k="Dimensions" v={`${(info as TextureInfo).width} × ${(info as TextureInfo).height}`} />
              <KV k="Format" v={`${(info as TextureInfo).format} · ${(info as TextureInfo).hasAlpha ? 'alpha' : 'opaque'}`} />
            </>
          )}
          {info && asset.kind === 'audio' && (
            <>
              <KV k="Duration" v={fmtDuration((info as AudioInfo).durationSec)} />
              <KV k="Channels" v={(info as AudioInfo).channels === 1 ? 'Mono' : `Stereo (${(info as AudioInfo).channels})`} />
              <KV k="Sample rate" v={`${(info as AudioInfo).sampleRate} Hz`} />
              <KV k="Codec" v={`${(info as AudioInfo).codec}${(info as AudioInfo).bitRate ? ` · ${Math.round((info as AudioInfo).bitRate! / 1000)} kbps` : ''}`} />
            </>
          )}
          {info && asset.kind === 'model' && ((info as ModelInfo).triangles != null ? (
            <>
              <KV k="Triangles" v={(info as ModelInfo).triangles!.toLocaleString()} />
              <KV k="Vertices" v={(info as ModelInfo).vertices?.toLocaleString()} />
              <KV k="Meshes / Materials" v={`${(info as ModelInfo).meshes ?? '–'} / ${(info as ModelInfo).materials ?? '–'}`} />
            </>
          ) : (
            <KV k="Info" v={(info as ModelInfo).note} />
          ))}
          <div className="pt-1.5">
            <TagsEditor asset={asset} locked={labels} />
          </div>
        </div>

        <PresetBar />
        <SettingsEditor kinds={[asset.kind]} />

        <div className="rounded-lg border border-border">
          <button className="flex h-8 w-full items-center gap-2 px-2.5 text-[12px] text-zinc-300" onClick={() => setShowMeta(!showMeta)}>
            <ChevronDown className={cn('size-3.5 text-zinc-500 transition-transform', !showMeta && '-rotate-90')} />
            <FileCode2 className="size-3.5 text-zinc-500" /> .meta (read-only)
          </button>
          {showMeta && (
            <pre className="max-h-72 overflow-auto border-t border-border bg-zinc-950 p-2.5 font-mono text-[10.5px] leading-[1.45] text-zinc-400 select-text">
              {meta ?? 'No .meta file'}
            </pre>
          )}
        </div>
      </div>
      <ApplyFooter ids={[asset.id]} kinds={[asset.kind]} />
    </>
  );
}

function MultiInspector({ assets }: { assets: AssetRecord[] }) {
  const kinds = [...new Set(assets.map((a) => a.kind))];
  const bytes = assets.reduce((n, a) => n + a.size, 0);
  const byExt = assets.reduce<Record<string, number>>((m, a) => ((m[a.ext] = (m[a.ext] ?? 0) + 1), m), {});
  return (
    <>
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-sky-500/15 text-lg font-bold text-sky-300">{assets.length}</div>
          <div>
            <div className="text-[14px] font-semibold text-zinc-50">assets selected</div>
            <div className="text-[11.5px] text-zinc-500">{formatBytes(bytes)} total</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(byExt).map(([e, n]) => (
            <Badge key={e} variant="outline">.{e} × {n}</Badge>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <PresetBar />
        <SettingsEditor kinds={kinds} />
      </div>
      <ApplyFooter ids={assets.map((a) => a.id)} kinds={kinds} />
    </>
  );
}

export function Inspector() {
  const selected = useStore((s) => s.selected);
  const assets = useStore((s) => s.assets);
  const sel = useMemo(() => {
    const m = new Map(assets.map((a) => [a.id, a]));
    return selected.map((id) => m.get(id)).filter((a): a is AssetRecord => !!a);
  }, [selected, assets]);

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Inspector</div>
      {sel.length === 0 && (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="space-y-2 text-zinc-500">
            <MousePointerClick className="mx-auto size-8 text-zinc-700" />
            <p className="text-[12.5px]">Select an asset to preview and edit its settings.</p>
            <p className="text-[11.5px] text-zinc-600">
              <kbd className="rounded bg-zinc-800 px-1">Ctrl</kbd>/<kbd className="rounded bg-zinc-800 px-1">⌘</kbd> + click to add ·{' '}
              <kbd className="rounded bg-zinc-800 px-1">Shift</kbd> + click for a range · <kbd className="rounded bg-zinc-800 px-1">Ctrl+A</kbd> all
            </p>
          </div>
        </div>
      )}
      {sel.length === 1 && <SingleInspector key={sel[0].id} asset={sel[0]} />}
      {sel.length > 1 && <MultiInspector assets={sel} />}
    </aside>
  );
}
