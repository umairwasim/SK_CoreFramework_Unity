import type { AssetKind } from '@shared/types';
import { AudioLines, Box, FolderOpen, Image as ImageIcon, RefreshCw, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn, formatBytes } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function TopBar() {
  const ws = useStore((s) => s.workspace);
  const scan = useStore((s) => s.scan);
  const tools = useStore((s) => s.tools);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const undo = useStore((s) => s.undo);
  const setOpenDialog = useStore((s) => s.setOpenDialog);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-sky-400 to-indigo-500 text-[10px] font-black text-zinc-950">ATS</div>
        <div className="leading-tight">
          <div className="text-[12.5px] font-semibold text-zinc-100">Asset Transformation Service</div>
        </div>
      </div>
      <div className="h-5 w-px bg-border" />
      {ws ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-zinc-200" title={ws.root}>{ws.name}</span>
          <span className="truncate text-[11.5px] text-zinc-500">
            {ws.counts ? (ws.counts.texture || 0) + (ws.counts.model || 0) + (ws.counts.audio || 0) : 0} assets · {formatBytes(ws.totalBytes || 0)}
          </span>
        </div>
      ) : (
        <span className="text-zinc-500">No workspace</span>
      )}
      {scan && (
        <span className="flex items-center gap-1.5 text-[11.5px] text-sky-300">
          <RefreshCw className="size-3 animate-spin" /> Indexing… {scan.scanned}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {tools && (
          <div className="mr-2 hidden items-center gap-2 text-[10.5px] text-zinc-500 xl:flex">
            <ToolDot ok={!!tools.sharp} label="sharp" />
            <ToolDot ok={!!tools.ffmpeg} label="ffmpeg" />
            <ToolDot ok={!!tools.fbx2gltf} label="FBX2glTF" optional />
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => void undo()} disabled={!ws} title="Undo last operation (restores from ATS_Backup)">
          <Undo2 /> Undo last
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void api.rescan()} disabled={!ws} title="Rescan Assets/ (F5)">
          <RefreshCw /> Rescan
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (api.mode === 'electron' ? void openWorkspace() : setOpenDialog(true))}
          title="File › Open Workspace (Ctrl+O)"
        >
          <FolderOpen /> Open Workspace
        </Button>
      </div>
    </header>
  );
}

function ToolDot({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <span className="flex items-center gap-1" title={ok ? `${label} available` : optional ? `${label} not found (optional – needed for FBX→GLB)` : `${label} missing`}>
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-emerald-400' : optional ? 'bg-zinc-600' : 'bg-rose-500')} />
      {label}
    </span>
  );
}

const TABS: { kind: AssetKind; label: string; icon: typeof ImageIcon }[] = [
  { kind: 'texture', label: '2D & Textures', icon: ImageIcon },
  { kind: 'model', label: '3D Models', icon: Box },
  { kind: 'audio', label: 'Audio', icon: AudioLines },
];

export function KindTabs() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const ws = useStore((s) => s.workspace);
  return (
    <nav className="flex h-10 shrink-0 items-end gap-1 border-b border-border bg-panel px-3">
      {TABS.map((t) => (
        <button
          key={t.kind}
          onClick={() => setTab(t.kind)}
          className={cn(
            'relative flex h-9 items-center gap-2 rounded-t-md px-3.5 text-[12.5px] font-medium transition-colors',
            tab === t.kind ? 'bg-background text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <t.icon className={cn('size-4', tab === t.kind ? 'text-accent' : '')} />
          {t.label}
          <span className={cn('rounded px-1.5 text-[10.5px]', tab === t.kind ? 'bg-sky-500/15 text-sky-300' : 'bg-zinc-800 text-zinc-400')}>{ws?.counts[t.kind] ?? 0}</span>
          {tab === t.kind && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </nav>
  );
}
