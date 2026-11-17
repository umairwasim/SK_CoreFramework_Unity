import type { AssetRecord } from '@shared/types';
import { Loader2, Pause, Play, Repeat, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Slider } from '../ui/slider';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export function AudioPreview({ asset }: { asset: AssetRecord }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    if (!box.current) return;
    setReady(false);
    setErr(null);
    setTime(0);
    setPlaying(false);
    const w = WaveSurfer.create({
      container: box.current,
      url: api.fileUrl(asset),
      height: 'auto',
      waveColor: '#3b4b63',
      progressColor: '#38bdf8',
      cursorColor: '#e0f2fe',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      dragToSeek: true,
    });
    w.setVolume(vol);
    w.on('ready', (d) => {
      setDur(d);
      setReady(true);
    });
    w.on('timeupdate', (t) => setTime(t));
    w.on('play', () => setPlaying(true));
    w.on('pause', () => setPlaying(false));
    w.on('finish', () => {
      if (loopRef.current) void w.play(0);
      else setPlaying(false);
    });
    w.on('error', (e) => setErr(String((e as Error)?.message ?? e)));
    ws.current = w;
    return () => {
      w.destroy();
      ws.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.mtimeMs]);

  useEffect(() => {
    if (ready) ws.current?.zoom(zoom);
  }, [zoom, ready]);
  useEffect(() => ws.current?.setVolume(vol), [vol]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        void ws.current?.playPause();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-zinc-900 to-zinc-950 px-2 py-3">
        <div ref={box} className="h-full" />
        {!ready && !err && <Loader2 className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
        {err && <div className="absolute inset-0 grid place-items-center text-[12px] text-rose-300">{err}</div>}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-t border-border bg-panel px-2">
        <button disabled={!ready} onClick={() => void ws.current?.playPause()} className="grid size-7 place-items-center rounded-full bg-accent text-zinc-950 disabled:opacity-40" title="Play/Pause (Space)">
          {playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
        </button>
        <button disabled={!ready} onClick={() => ws.current?.stop()} className="grid size-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Stop">
          <Square className="size-3" />
        </button>
        <button onClick={() => setLoop(!loop)} className={cn('grid size-6 place-items-center rounded', loop ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400 hover:bg-zinc-800')} title="Loop">
          <Repeat className="size-3" />
        </button>
        <span className="ml-1 whitespace-nowrap font-mono text-[11px] tabular-nums text-zinc-300">
          {fmt(time)} <span className="text-zinc-600">/ {fmt(dur)}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10.5px] text-zinc-500">Zoom</span>
          <Slider className="w-14" min={0} max={400} step={10} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
          <Volume2 className="size-3.5 text-zinc-500" />
          <Slider className="w-12" min={0} max={1} step={0.05} value={[vol]} onValueChange={([v]) => setVol(v)} />
        </div>
      </div>
    </div>
  );
}
