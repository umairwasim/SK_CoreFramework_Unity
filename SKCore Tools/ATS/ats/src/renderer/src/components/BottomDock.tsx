import type { HistoryEntry, JobStatus, OperationSummary } from '@shared/types';
import { CheckCircle2, ChevronDown, ChevronUp, CircleSlash, Clock, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn, formatBytes, timeAgo } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function Delta({ before, after }: { before?: number | null; after?: number | null }) {
  if (before == null || after == null) return null;
  const d = after - before;
  const pct = before ? Math.round((d / before) * 100) : 0;
  return (
    <span className={cn('tabular-nums', d < 0 ? 'text-emerald-400' : d > 0 ? 'text-amber-400' : 'text-zinc-500')}>
      {formatBytes(before)} → {formatBytes(after)} {d !== 0 && `(${pct > 0 ? '+' : ''}${pct}%)`}
    </span>
  );
}

function JobRow({ job }: { job: JobStatus }) {
  const [open, setOpen] = useState(false);
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const failed = job.results.filter((r) => !r.ok).length;
  const saved = job.results.reduce((n, r) => n + ((r.bytesBefore ?? 0) - (r.bytesAfter ?? r.bytesBefore ?? 0)), 0);
  return (
    <div className="rounded-md border border-border bg-zinc-900/40">
      <div className="flex items-center gap-3 px-3 py-2">
        {job.state === 'running' ? <Loader2 className="size-4 animate-spin text-sky-400" /> : job.state === 'queued' ? <Clock className="size-4 text-zinc-500" /> : job.state === 'cancelled' ? <CircleSlash className="size-4 text-zinc-500" /> : failed ? <XCircle className="size-4 text-rose-400" /> : <CheckCircle2 className="size-4 text-emerald-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="truncate font-medium text-zinc-200">{job.label}</span>
            {job.operationId && <span className="text-zinc-600">op #{job.operationId}</span>}
            {job.state === 'done' && saved > 0 && <Badge variant="green">−{formatBytes(saved)}</Badge>}
            {failed > 0 && <Badge variant="red">{failed} failed</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className={cn('h-full rounded-full transition-[width] duration-200', job.state === 'running' ? 'progress-stripes bg-sky-500' : failed ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${job.state === 'queued' ? 0 : pct}%` }} />
            </div>
            <span className="w-24 text-right text-[11px] tabular-nums text-zinc-400">
              {job.done}/{job.total} · {pct}%
            </span>
          </div>
          {job.current && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{job.current}</div>}
        </div>
        {(job.state === 'running' || job.state === 'queued') && (
          <Button variant="ghost" size="xs" onClick={() => void api.cancelJob(job.id)}>Cancel</Button>
        )}
        {job.results.length > 0 && (
          <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-56 overflow-auto border-t border-border/70 px-3 py-1.5">
          {job.results.map((r, i) => (
            <div key={i} className="grid grid-cols-[16px_minmax(0,1.2fr)_minmax(0,2fr)_auto] items-start gap-2 py-1 text-[11.5px]">
              {r.ok ? (r.skipped ? <CircleSlash className="mt-0.5 size-3.5 text-zinc-500" /> : <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-400" />) : <XCircle className="mt-0.5 size-3.5 text-rose-400" />}
              <span className="truncate text-zinc-300" title={r.relPath}>
                {r.relPath.split('/').pop()}
                {r.outputRelPath && r.outputRelPath !== r.relPath && <span className="text-emerald-400"> → {r.outputRelPath.split('/').pop()}</span>}
              </span>
              <span className={cn('text-zinc-500', !r.ok && 'text-rose-300')}>
                {r.message}
                {r.ok && r.guidBefore && r.guidAfter && r.guidBefore === r.guidAfter && <span className="ml-1 text-emerald-500/80">· GUID ✓</span>}
              </span>
              <Delta before={r.bytesBefore} after={r.bytesAfter} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QueuePanel() {
  const jobs = useStore((s) => s.jobs);
  const list = Object.values(jobs).sort((a, b) => (b.startedAt ?? Infinity) - (a.startedAt ?? Infinity));
  if (!list.length) return <Empty>No jobs yet. Select assets and press Apply – heavy work runs in the background queue.</Empty>;
  return <div className="space-y-1.5 p-2">{list.map((j) => <JobRow key={j.id} job={j} />)}</div>;
}

function HistoryPanel() {
  const tick = useStore((s) => s.historyTick);
  const ws = useStore((s) => s.workspace);
  const undo = useStore((s) => s.undo);
  const [ops, setOps] = useState<OperationSummary[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    if (ws) void api.listOperations().then(setOps);
  }, [tick, ws]);
  useEffect(() => {
    if (open != null) void api.listHistory(open).then(setItems);
  }, [open, tick]);
  if (!ops.length) return <Empty>History is empty. Every apply is logged here with its settings and can be undone.</Empty>;
  return (
    <div className="p-2">
      <table className="w-full text-[11.5px]">
        <thead className="text-left text-[10.5px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-2 py-1 font-medium">Op</th>
            <th className="px-2 py-1 font-medium">When</th>
            <th className="px-2 py-1 font-medium">Mode</th>
            <th className="px-2 py-1 font-medium">Preset</th>
            <th className="px-2 py-1 font-medium">Items</th>
            <th className="px-2 py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          {ops.map((o) => (
            <>
              <tr key={o.id} className={cn('cursor-default border-t border-border/60 hover:bg-zinc-800/40', o.undone && 'opacity-50')} onClick={() => setOpen(open === o.id ? null : o.id)}>
                <td className="px-2 py-1.5 font-mono text-zinc-400">#{o.id}</td>
                <td className="px-2 py-1.5 text-zinc-300" title={new Date(o.createdAt).toLocaleString()}>{timeAgo(o.createdAt)}</td>
                <td className="px-2 py-1.5">
                  <Badge variant={o.mode === 'overwrite' ? 'amber' : 'green'}>{o.mode === 'overwrite' ? 'Overwrite' : 'Save as New'}</Badge>
                </td>
                <td className="px-2 py-1.5 text-zinc-300">{o.presetName ?? 'Custom'}</td>
                <td className="px-2 py-1.5 text-zinc-400">
                  {o.okCount}/{o.itemCount} ok
                </td>
                <td className="px-2 py-1.5 text-right">
                  {o.undone ? (
                    <Badge variant="outline">undone</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void undo(o.id);
                      }}
                    >
                      <RotateCcw /> Undo
                    </Button>
                  )}
                </td>
              </tr>
              {open === o.id && (
                <tr key={`${o.id}-items`}>
                  <td colSpan={6} className="bg-zinc-950/60 px-3 py-1.5">
                    {items.map((h) => (
                      <div key={h.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] gap-3 py-0.5 text-[11px]">
                        <span className="truncate text-zinc-300" title={h.relPath}>
                          {h.relPath}
                          {h.outputRelPath && h.outputRelPath !== h.relPath && <span className="text-emerald-400"> → {h.outputRelPath.split('/').pop()}</span>}
                        </span>
                        <span className={cn('truncate', h.ok ? 'text-zinc-500' : 'text-rose-300')} title={h.message}>{h.message}</span>
                        <Delta before={h.bytesBefore} after={h.bytesAfter} />
                      </div>
                    ))}
                    {o.backupDir && <div className="pt-1 text-[10.5px] text-zinc-600">Backup: {o.backupDir}</div>}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogPanel() {
  const logs = useStore((s) => s.logs);
  if (!logs.length) return <Empty>No log messages.</Empty>;
  return (
    <div className="p-2 font-mono text-[11px]">
      {[...logs].reverse().map((l, i) => (
        <div key={i} className={cn('py-0.5', l.level === 'error' ? 'text-rose-300' : l.level === 'warn' ? 'text-amber-300' : 'text-zinc-400')}>
          <span className="text-zinc-600">{new Date(l.t).toLocaleTimeString()}</span> {l.message}
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="grid h-full place-items-center p-4 text-[12px] text-zinc-600">{children}</div>;

export function BottomDock() {
  const dock = useStore((s) => s.dock);
  const setDock = useStore((s) => s.setDock);
  const jobs = useStore((s) => s.jobs);
  const running = Object.values(jobs).find((j) => j.state === 'running');
  const tabs = [
    { id: 'queue' as const, label: 'Queue', extra: running ? `${running.done}/${running.total}` : null },
    { id: 'history' as const, label: 'History', extra: null },
    { id: 'log' as const, label: 'Log', extra: null },
  ];
  return (
    <div className={cn('flex shrink-0 flex-col border-t border-border bg-panel', dock.open ? 'h-56' : 'h-8')}>
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setDock({ tab: t.id, open: true })}
            className={cn('flex h-6 items-center gap-1.5 rounded px-2.5 text-[11.5px] font-medium', dock.tab === t.id && dock.open ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200')}
          >
            {t.label}
            {t.extra && (
              <span className="flex items-center gap-1 text-sky-300">
                <Loader2 className="size-3 animate-spin" />
                {t.extra}
              </span>
            )}
          </button>
        ))}
        {running && !dock.open && (
          <div className="ml-3 h-1 w-40 overflow-hidden rounded-full bg-zinc-800">
            <div className="progress-stripes h-full bg-sky-500" style={{ width: `${(running.done / running.total) * 100}%` }} />
          </div>
        )}
        <button className="ml-auto text-zinc-500 hover:text-zinc-200" onClick={() => setDock({ open: !dock.open })}>
          {dock.open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {dock.open && (
        <div className="min-h-0 flex-1 overflow-auto border-t border-border/70">
          {dock.tab === 'queue' && <QueuePanel />}
          {dock.tab === 'history' && <HistoryPanel />}
          {dock.tab === 'log' && <LogPanel />}
        </div>
      )}
    </div>
  );
}
