import type { FolderNode } from '@shared/types';
import { ChevronRight, Folder, FolderOpen, Tag } from 'lucide-react';
import { useState } from 'react';
import { type Filters, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

function TreeNode({ node, depth, selected, onSelect }: { node: FolderNode; depth: number; selected: string | null; onSelect: (p: string | null) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const isSel = (selected ?? 'Assets') === node.path;
  const has = node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => onSelect(node.path === 'Assets' ? null : node.path)}
        onDoubleClick={() => setOpen(!open)}
        className={cn(
          'group flex h-6 items-center gap-1 rounded pr-2 text-[12px]',
          isSel ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-300 hover:bg-zinc-800/60'
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          className={cn('grid size-4 place-items-center rounded text-zinc-500 hover:text-zinc-200', !has && 'invisible')}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        </button>
        {open && has ? <FolderOpen className="size-3.5 text-amber-300/80" /> : <Folder className="size-3.5 text-amber-300/70" />}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[10.5px] text-zinc-500">{node.count}</span>
      </div>
      {open && node.children.map((c) => <TreeNode key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </div>
  );
}

const SIZE_OPTS: { v: Filters['sizeBucket']; l: string }[] = [
  { v: 'any', l: 'Any' },
  { v: 'lt100k', l: '< 100 KB' },
  { v: '100k-1m', l: '100 KB – 1 MB' },
  { v: '1m-10m', l: '1 – 10 MB' },
  { v: 'gt10m', l: '> 10 MB' },
];

export function Sidebar() {
  const tree = useStore((s) => s.tree);
  const tab = useStore((s) => s.tab);
  const f = useStore((s) => s.filters[s.tab]);
  const facets = useStore((s) => s.facets);
  const setFilter = useStore((s) => s.setFilter);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <Section title="Folders">
        <div className="max-h-full overflow-auto px-1.5 pb-2">
          {tree ? <TreeNode key={tab} node={tree} depth={0} selected={f.folder} onSelect={(p) => setFilter({ folder: p })} /> : <div className="px-2 text-zinc-500">–</div>}
        </div>
      </Section>
      <Section title="Format">
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {facets.formats.map((fmt) => (
            <Chip key={fmt} active={f.formats.includes(fmt)} onClick={() => setFilter({ formats: toggle(f.formats, fmt) })}>
              .{fmt}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Size">
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {SIZE_OPTS.map((o) => (
            <Chip key={o.v} active={f.sizeBucket === o.v} onClick={() => setFilter({ sizeBucket: o.v })}>
              {o.l}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Tags / Labels" grow>
        <div className="flex flex-wrap gap-1 overflow-auto px-3 pb-3">
          {facets.tags.length === 0 && <span className="text-[11.5px] text-zinc-600">No labels in this tab</span>}
          {facets.tags.map((t) => (
            <Chip key={t} active={f.tags.includes(t)} onClick={() => setFilter({ tags: toggle(f.tags, t) })}>
              <Tag className="size-2.5" />
              {t}
            </Chip>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children, grow }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={cn('flex min-h-0 flex-col border-b border-border/70 last:border-b-0', grow ? 'flex-1' : title === 'Folders' ? 'max-h-[45%]' : '')}>
      <div className="px-3 pb-1.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] transition-colors',
        active ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-border bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
      )}
    >
      {children}
    </button>
  );
}
