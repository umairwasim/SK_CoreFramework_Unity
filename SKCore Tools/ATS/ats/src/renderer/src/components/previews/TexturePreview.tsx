import type { AssetRecord } from '@shared/types';
import { Loader2, Maximize, Scan } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getTgaDataUrl } from '@/lib/fileRegistry';
import { cn } from '@/lib/utils';

type Ch = 'r' | 'g' | 'b' | 'a';
const CH_COLORS: Record<Ch, string> = { r: 'text-rose-300 bg-rose-500/20 ring-rose-500/40', g: 'text-emerald-300 bg-emerald-500/20 ring-emerald-500/40', b: 'text-sky-300 bg-sky-500/20 ring-sky-500/40', a: 'text-zinc-200 bg-zinc-500/25 ring-zinc-400/40' };

/** 2D preview: wheel-zoom around cursor, drag to pan, per-channel RGBA isolation. */
export function TexturePreview({ asset }: { asset: AssetRecord }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<ImageData | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [channels, setChannels] = useState<Record<Ch, boolean>>({ r: true, g: true, b: true, a: true });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; rgba: number[] } | null>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  const fit = useCallback((w: number, h: number) => {
    const el = wrap.current;
    if (!el) return;
    const z = Math.min((el.clientWidth - 16) / w, (el.clientHeight - 16) / h, 1);
    setView({ zoom: z, x: (el.clientWidth - w * z) / 2, y: (el.clientHeight - h * z) / 2 });
  }, []);

  // load
  useEffect(() => {
    setErr(null);
    setSize(null);
    source.current = null;
    let alive = true;

    async function loadImage() {
      try {
        let srcUrl = api.fileUrl(asset);
        if (asset.ext === 'tga') {
          const tgaUrl = await getTgaDataUrl(asset);
          if (tgaUrl) srcUrl = tgaUrl;
        }
        if (!alive) return;

        const img = new Image();
        if (!srcUrl.startsWith('blob:') && !srcUrl.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
          if (!alive) return;
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          source.current = ctx.getImageData(0, 0, c.width, c.height);
          setSize({ w: c.width, h: c.height });
          fit(c.width, c.height);
        };
        img.onerror = () => {
          if (alive) setErr('Could not decode image');
        };
        img.src = srcUrl;
      } catch {
        if (alive) setErr('Could not decode image');
      }
    }

    void loadImage();
    return () => {
      alive = false;
    };
  }, [asset.id, asset.mtimeMs, fit]);

  // channel compositing
  useEffect(() => {
    const src = source.current;
    const c = canvas.current;
    if (!src || !c) return;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    const on = (Object.keys(channels) as Ch[]).filter((k) => channels[k]);
    if (on.length === 4) return void ctx.putImageData(src, 0, 0);
    const out = new ImageData(src.width, src.height);
    const s = src.data;
    const d = out.data;
    const single = on.length === 1 ? on[0] : null;
    const idx = { r: 0, g: 1, b: 2, a: 3 } as const;
    for (let i = 0; i < s.length; i += 4) {
      if (single) {
        const v = s[i + idx[single]];
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      } else {
        d[i] = channels.r ? s[i] : 0;
        d[i + 1] = channels.g ? s[i + 1] : 0;
        d[i + 2] = channels.b ? s[i + 2] : 0;
        d[i + 3] = channels.a ? s[i + 3] : 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [channels, size]);

  const onWheel = (e: React.WheelEvent) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const z = Math.min(32, Math.max(0.02, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      return { zoom: z, x: mx - ((mx - v.x) * z) / v.zoom, y: my - ((my - v.y) * z) / v.zoom };
    });
  };

  const onMove = (e: React.MouseEvent) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    if (drag.current) {
      setView((v) => ({ ...v, x: drag.current!.vx + e.clientX - drag.current!.sx, y: drag.current!.vy + e.clientY - drag.current!.sy }));
    }
    const src = source.current;
    if (src) {
      const px = Math.floor((e.clientX - r.left - view.x) / view.zoom);
      const py = Math.floor((e.clientY - r.top - view.y) / view.zoom);
      if (px >= 0 && py >= 0 && px < src.width && py < src.height) {
        const o = (py * src.width + px) * 4;
        setHover({ x: px, y: py, rgba: [src.data[o], src.data[o + 1], src.data[o + 2], src.data[o + 3]] });
      } else setHover(null);
    }
  };

  const toggle = (k: Ch, solo: boolean) =>
    setChannels((c) => (solo ? { r: k === 'r', g: k === 'g', b: k === 'b', a: k === 'a' } : { ...c, [k]: !c[k] }));

  return (
    <div className="flex h-full flex-col">
      <div
        ref={wrap}
        className="checker relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={(e) => (drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y })}
        onMouseMove={onMove}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => {
          drag.current = null;
          setHover(null);
        }}
        onDoubleClick={() => size && fit(size.w, size.h)}
      >
        {!size && !err && <Loader2 className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
        {err && <div className="absolute inset-0 grid place-items-center text-rose-300">{err}</div>}
        <canvas
          ref={canvas}
          className={cn('absolute left-0 top-0 origin-top-left', view.zoom > 2 && 'pixelated')}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, display: size ? 'block' : 'none' }}
        />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t border-border bg-panel px-2 text-[11px]">
        {(['r', 'g', 'b', 'a'] as Ch[]).map((k) => (
          <button
            key={k}
            onClick={(e) => toggle(k, e.altKey || e.shiftKey)}
            title={`Toggle ${k.toUpperCase()} (Shift/Alt+click to solo)`}
            className={cn('h-5 w-6 rounded font-bold uppercase ring-1 ring-inset', channels[k] ? CH_COLORS[k] : 'text-zinc-600 ring-zinc-700')}
          >
            {k}
          </button>
        ))}
        <span className="ml-1 text-zinc-500">{hover ? `(${hover.x}, ${hover.y}) rgba(${hover.rgba.join(', ')})` : size ? `${size.w}×${size.h}` : ''}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-12 text-right tabular-nums text-zinc-400">{Math.round(view.zoom * 100)}%</span>
          <button className="grid size-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Fit" onClick={() => size && fit(size.w, size.h)}>
            <Maximize className="size-3.5" />
          </button>
          <button
            className="grid size-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="1:1"
            onClick={() => {
              const el = wrap.current;
              if (el && size) setView({ zoom: 1, x: (el.clientWidth - size.w) / 2, y: (el.clientHeight - size.h) / 2 });
            }}
          >
            <Scan className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
