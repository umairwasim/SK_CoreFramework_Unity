import { CheckCircle2, FolderOpen, Info, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AssetGrid, FilterBar, SelectionBar } from './components/AssetGrid';
import { BottomDock } from './components/BottomDock';
import { Modal } from './components/ConfirmApply';
import { KindTabs, TopBar } from './components/Header';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { api } from './lib/api';
import { clearAssetFiles, registerAssetFile, registerMetaFile } from './lib/fileRegistry';
import { useStore } from './lib/store';
import { cn } from './lib/utils';

const TEXTURE_EXTS = new Set(['png', 'jpg', 'jpeg', 'tga', 'psd', 'webp', 'bmp', 'tif', 'tiff']);
const MODEL_EXTS = new Set(['fbx', 'obj', 'glb', 'gltf', 'dae', 'blend']);
const AUDIO_EXTS = new Set(['wav', 'mp3', 'ogg', 'aiff', 'flac']);

const IGNORED_PATH_PATTERNS = [
  '/library/',
  '/temp/',
  '/obj/',
  '/build/',
  '/builds/',
  '/.git/',
  '/.vs/',
  '/.idea/',
  '/logs/',
  '/usersettings/',
  '/memorycaptures/',
  '/recordings/',
  '/deriveddata/',
];

function OpenWorkspaceDialog() {
  const open = useStore((s) => s.openDialog);
  const setOpen = useStore((s) => s.setOpenDialog);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const ws = useStore((s) => s.workspace);
  const recent: string[] = JSON.parse(localStorage.getItem('ats.recent') ?? '[]');
  const [path, setPath] = useState(recent[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    scanned: number;
    total: number;
    percent: number;
    assetCount: number;
    textures: number;
    models: number;
    audio: number;
    currentFolder: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    clearAssetFiles();
    setBusy(true);
    setErr(null);

    const total = fileList.length;
    const firstRel = fileList[0].webkitRelativePath || fileList[0].name;
    const parts = firstRel.split('/');
    const projName = parts.length > 1 ? parts[0] : 'Selected Workspace';

    const assets: any[] = [];
    const folderCounts = new Map<string, number>();
    let textures = 0;
    let models = 0;
    let audio = 0;
    let idCounter = 1;

    let index = 0;
    const CHUNK_SIZE = 3000;

    const processNextChunk = () => {
      const end = Math.min(index + CHUNK_SIZE, total);
      let currentFolder = '';

      for (; index < end; index++) {
        const file = fileList[index];
        const name = file.name;

        const rel = file.webkitRelativePath || name;
        const normalized = rel.replace(/\\/g, '/');
        const lowerNorm = normalized.toLowerCase();

        // Handle .meta files
        if (name.endsWith('.meta')) {
          const assetsIdx = lowerNorm.indexOf('/assets/');
          if (assetsIdx !== -1) {
            registerMetaFile(normalized.substring(assetsIdx + 1), file);
          } else if (lowerNorm.startsWith('assets/')) {
            registerMetaFile(normalized, file);
          }
          continue;
        }

        // STRICT ASSETS FILTER:
        // Must be inside Assets/ folder (either "ProjectName/Assets/..." or "Assets/...")
        let assetRelPath = '';
        const assetsIdx = lowerNorm.indexOf('/assets/');
        if (assetsIdx !== -1) {
          assetRelPath = normalized.substring(assetsIdx + 1); // e.g. "Assets/Textures/Player.png"
        } else if (lowerNorm.startsWith('assets/')) {
          assetRelPath = normalized;
        } else {
          // File is outside Assets/ (e.g. ProjectSettings, Packages, Library, etc.) -> Skip!
          continue;
        }

        const dotIdx = name.lastIndexOf('.');
        if (dotIdx === -1) continue;
        const ext = name.substring(dotIdx + 1).toLowerCase();

        let kind: 'texture' | 'model' | 'audio' | null = null;
        if (TEXTURE_EXTS.has(ext)) {
          kind = 'texture';
          textures++;
        } else if (MODEL_EXTS.has(ext)) {
          kind = 'model';
          models++;
        } else if (AUDIO_EXTS.has(ext)) {
          kind = 'audio';
          audio++;
        }

        if (kind) {
          const slashIdx = assetRelPath.lastIndexOf('/');
          const dir = slashIdx !== -1 ? assetRelPath.substring(0, slashIdx) : 'Assets';
          currentFolder = dir;
          folderCounts.set(dir, (folderCounts.get(dir) || 0) + 1);

          const folderParts = dir.split('/').filter(Boolean);
          const tags = folderParts.slice(1).map((p) => p.toLowerCase());
          const assetId = idCounter++;
          registerAssetFile(assetId, assetRelPath, file);

          assets.push({
            id: assetId,
            guid: 'guid_' + Math.random().toString(36).substring(2, 10),
            relPath: assetRelPath,
            folder: dir,
            name,
            ext,
            kind,
            size: file.size,
            mtimeMs: file.lastModified,
            tags: tags.length ? tags : ['asset'],
            info: null,
          });
        }
      }

      const percent = Math.min(100, Math.round((index / total) * 100));
      setScanProgress({
        scanned: index,
        total,
        percent,
        assetCount: assets.length,
        textures,
        models,
        audio,
        currentFolder: currentFolder || 'Assets',
      });

      if (index < total) {
        // Yield to render loop for smooth 60 FPS progress bar updates
        setTimeout(processNextChunk, 0);
      } else {
        void finishIndexing();
      }
    };

    const finishIndexing = async () => {
      try {
        // Build hierarchical tree with "Assets" as root
        const rootNode = {
          name: 'Assets',
          path: 'Assets',
          count: assets.length,
          children: [] as any[],
        };

        const nodeMap = new Map<string, any>();
        nodeMap.set('Assets', rootNode);

        const sortedDirs = Array.from(folderCounts.keys()).sort(
          (a, b) => a.split('/').length - b.split('/').length
        );

        for (const dir of sortedDirs) {
          if (dir === 'Assets') continue;
          const parts = dir.split('/');
          let cur = parts[0];

          for (let p = 1; p < parts.length; p++) {
            const parent = cur;
            cur = cur + '/' + parts[p];
            if (!nodeMap.has(cur)) {
              const newNode = {
                name: parts[p],
                path: cur,
                count: folderCounts.get(cur) || 0,
                children: [] as any[],
              };
              nodeMap.set(cur, newNode);
              const parentNode = nodeMap.get(parent);
              if (parentNode) {
                parentNode.children.push(newNode);
              }
            }
          }
        }

        const totalBytes = assets.reduce((acc, a) => acc + a.byteSize, 0);
        const workspaceData = {
          root: projName,
          name: projName,
          unityVersion: 'Unity 6.0',
          counts: {
            texture: textures,
            model: models,
            audio: audio,
          },
          totalBytes,
          scannedAt: Date.now(),
          assets,
          tree: rootNode,
          facets: {
            formats: Array.from(new Set(assets.map((a) => a.ext))),
            tags: Array.from(new Set(assets.flatMap((a) => a.tags))),
          },
        };

        await openWorkspace(workspaceData as any);
        localStorage.setItem('ats.recent', JSON.stringify([projName, ...recent.filter((r) => r !== projName)].slice(0, 5)));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
        setScanProgress(null);
      }
    };

    processNextChunk();
  };

  const go = async (p: string) => {
    setBusy(true);
    setErr(null);
    try {
      await openWorkspace(p);
      localStorage.setItem('ats.recent', JSON.stringify([p, ...recent.filter((r) => r !== p)].slice(0, 5)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => ws && setOpen(false)} width={540}>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-sky-500/15 text-sky-400">
          <FolderOpen className="size-5" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-zinc-100">Open Workspace</h3>
          <p className="text-[12px] text-zinc-500">
            Select your Unity project folder or <code className="text-zinc-300">Assets/</code> directory
          </p>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => void handleFiles(e.target.files)}
        // @ts-expect-error webkitdirectory is standard for folder picking
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
      />

      {/* Primary Folder Picker Card */}
      <div
        onClick={() => !busy && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all',
          busy
            ? 'border-sky-500/50 bg-sky-500/10 cursor-wait'
            : 'border-sky-500/30 bg-sky-500/5 hover:border-sky-500/60 hover:bg-sky-500/10'
        )}
      >
        <div className="grid size-12 place-items-center rounded-xl bg-sky-500/20 text-sky-400 transition-transform group-hover:scale-110">
          <FolderOpen className="size-6" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-zinc-200 group-hover:text-sky-300">
            {busy ? 'Scanning & Indexing Project…' : 'Choose Project Folder'}
          </div>
          <p className="mt-1 text-[11.5px] text-zinc-400">
            Click to browse folder or drag and drop your Unity project directory here
          </p>
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="mt-1 bg-sky-600 font-medium text-white hover:bg-sky-500"
        >
          {busy ? 'Indexing…' : 'Browse Folder…'}
        </Button>
      </div>

      {/* Live Animated Progress Bar */}
      {scanProgress && (
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-950/40 p-4 shadow-inner">
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 font-semibold text-sky-300">
              <span className="inline-block size-2 rounded-full bg-sky-400 animate-ping" />
              Scanning &amp; Indexing Assets…
            </span>
            <span className="font-mono font-bold text-sky-300">{scanProgress.percent}%</span>
          </div>

          {/* Bar track */}
          <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full bg-zinc-800/80 p-0.5 border border-zinc-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-500 progress-stripes transition-all duration-100 ease-out"
              style={{ width: `${Math.max(4, scanProgress.percent)}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
            <span>
              {scanProgress.scanned.toLocaleString()} / {scanProgress.total.toLocaleString()} files scanned
            </span>
            <span className="max-w-[210px] truncate" title={scanProgress.currentFolder}>
              📁 {scanProgress.currentFolder}
            </span>
          </div>

          {/* Real-time stats */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-sky-300">
              🖼️ {scanProgress.textures} Textures
            </span>
            <span className="rounded-md border border-purple-500/25 bg-purple-500/10 px-2 py-0.5 text-purple-300">
              🧊 {scanProgress.models} Models
            </span>
            <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              🎵 {scanProgress.audio} Audio
            </span>
            <span className="ml-auto rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 font-semibold text-zinc-200">
              Total: {scanProgress.assetCount}
            </span>
          </div>
        </div>
      )}

      {/* Performance Guidance Tip */}
      <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11.5px] leading-relaxed text-amber-200/80">
        <span className="font-semibold text-amber-300">⚡ Fast-Track Tip:</span> Selecting your project's{' '}
        <code className="rounded bg-amber-500/15 px-1 py-0.5 text-amber-300">Assets/</code> folder directly indexes in &lt;100ms. If selecting the project root, <code className="text-zinc-400">Library/</code> and <code className="text-zinc-400">Temp/</code> caches are automatically skipped.
      </div>

      {err && <p className="mt-2 text-[12px] text-rose-300">{err}</p>}

      {/* Manual Path Fallback Toggle */}
      <div className="mt-4 pt-2">
        <button
          type="button"
          onClick={() => setManual(!manual)}
          className="text-[11px] text-zinc-400 underline hover:text-zinc-200"
        >
          {manual ? 'Hide manual path input' : 'Or specify folder path manually'}
        </button>

        {manual && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void go(path);
            }}
            className="mt-2 space-y-2"
          >
            <Input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. C:/Projects/MyUnityGame"
              className="font-mono text-[12px]"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="submit" disabled={busy || !path.trim()} className="text-[12px]">
                {busy ? 'Indexing…' : 'Open Path'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">Recent Projects</div>
          {recent.map((r) => (
            <button
              key={r}
              onClick={() => void go(r)}
              className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[11.5px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              📁 {r}
            </button>
          ))}
        </div>
      )}

      {ws && (
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-12 right-[416px] z-50 flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] shadow-xl shadow-black/40 backdrop-blur',
            t.kind === 'error' ? 'border-rose-500/40 bg-rose-950/80 text-rose-100' : t.kind === 'success' ? 'border-emerald-500/30 bg-emerald-950/80 text-emerald-100' : 'border-border bg-zinc-900/90 text-zinc-200'
          )}
        >
          {t.kind === 'error' ? <XCircle className="mt-px size-4 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="mt-px size-4 shrink-0" /> : <Info className="mt-px size-4 shrink-0" />}
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (typing) return;
      const s = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.selectAll();
      } else if (e.key === 'Escape') s.clearSelection();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && api.mode === 'web') {
        e.preventDefault();
        s.setOpenDialog(true);
      } else if (e.key === 'F5' && api.mode === 'web') {
        e.preventDefault();
        void api.rescan();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = s.assets.findIndex((a) => a.id === s.selected[s.selected.length - 1]);
        const n = s.assets[Math.max(0, Math.min(s.assets.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
        if (n) s.select(n.id, { shift: e.shiftKey });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!ready) return <div className="grid h-full place-items-center text-zinc-500">Starting ATS…</div>;
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <KindTabs />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <FilterBar />
          <AssetGrid />
          <SelectionBar />
        </main>
        <Inspector />
      </div>
      <BottomDock />
      <Toasts />
      <OpenWorkspaceDialog />
    </div>
  );
}
