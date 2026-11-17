/**
 * Üst Bar — Global Metrikler
 *
 * Her zaman görünür, her zaman güncel. Buradaki sayılar 250 ms'de bir gelen
 * `snapshot` mesajından okunur (kare başına değil): 60 fps'te 60 kez React
 * render'ı tetiklemek yerine saniyede 4 kez tetikleriz.
 */
import React, { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { fmtBytes, fmtInt, fmtNum, fmtClock, dtColor, fpsColor, MB } from '../lib/format';
import { simRequest as postSim } from '../lib/transport';
import { sink } from '../lib/sink';

function Sparkline({ color = 'var(--accent)', height = 18, width = 74, field = 'dt' }: { color?: string; height?: number; width?: number; field?: 'dt' | 'mono' | 'gc' }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = 0;
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== width * dpr) { c.width = width * dpr; c.height = height * dpr; }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const n = Math.min(90, sink.length);
      if (n < 2) return;
      const vals: number[] = [];
      for (let i = sink.length - n; i < sink.length; i++) {
        const f = sink.frames[i];
        vals.push(field === 'dt' ? f.dt : field === 'mono' ? f.mono / MB : f.gc / 1024);
      }
      let min = Infinity, max = -Infinity;
      for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
      if (max - min < 1e-6) max = min + 1;
      g.beginPath();
      for (let i = 0; i < vals.length; i++) {
        const x = (i / (vals.length - 1)) * (width - 2) + 1;
        const y = height - 2 - ((vals[i] - min) / (max - min)) * (height - 4);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = 1.2;
      g.stroke();
      g.lineTo(width - 1, height);
      g.lineTo(1, height);
      g.closePath();
      g.fillStyle = color.replace(')', ' / .13)').replace('rgb', 'rgb').includes('var') ? 'rgba(78,161,255,.12)' : color;
      g.globalAlpha = 0.14;
      g.fill();
      g.globalAlpha = 1;
    };
    const unsub = sink.subscribe(() => { if (!raf) raf = requestAnimationFrame(draw); });
    draw();
    return () => { unsub(); if (raf) cancelAnimationFrame(raf); };
  }, [color, height, width, field]);
  return <canvas ref={ref} className="spark" style={{ width, height }} />;
}

function Metric({ k, v, u, sub, color, wide, spark, sparkField }: {
  k: string; v: string; u?: string; sub?: React.ReactNode; color?: string; wide?: boolean;
  spark?: boolean; sparkField?: 'dt' | 'mono' | 'gc';
}) {
  return (
    <div className={`metric${wide ? ' wide' : ''}`}>
      <div className="metric-k">{k}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div className="metric-v" style={{ color }}>{v}</div>
        {u ? <div className="metric-u">{u}</div> : null}
        <div className="spacer" />
        {spark ? <Sparkline field={sparkField} color={color ?? 'var(--accent)'} /> : null}
      </div>
      {sub ? <div className="metric-s">{sub}</div> : null}
    </div>
  );
}

export default function TopBar() {
  const snapshot = useStore((s) => s.snapshot);
  const session = useStore((s) => s.session);
  const agent = useStore((s) => s.agent);
  const connected = useStore((s) => s.connected);
  const sim = useStore((s) => s.sim);
  const theme = useStore((s) => s.theme);
  const wire = useStore((s) => s.wire);
  const logStats = useStore((s) => s.logStats);
  const findings = useStore((s) => s.findings);
  const setTheme = useStore((s) => s.setTheme);
  const setTab = useStore((s) => s.setTab);

  const latest: any = snapshot?.latest ?? null;
  const low = snapshot?.low;
  const targetFps = session?.targetFps ?? 60;
  const budget = 1000 / targetFps;

  const dt = latest?.dtMs ?? latest?.dt ?? 0;
  const fps = latest?.fps ?? (dt ? 1000 / dt : 0);
  const dc = latest?.drawCalls ?? latest?.dc ?? 0;
  const sp = latest?.setPassCalls ?? latest?.sp ?? 0;
  const batches = latest?.batches ?? 0;
  const tri = latest?.triangles ?? latest?.tri ?? 0;
  const mono = latest?.monoUsed ?? latest?.mono ?? 0;
  const res = latest?.totalReserved ?? latest?.res ?? 0;
  const gfx = latest?.gfxDriver ?? latest?.gfx ?? 0;
  const heapMB = (latest?.monoHeap ?? latest?.heap ?? 0) / MB;

  const lossPct = (agent.lostRatio ?? 0) * 100;

  return (
    <div className="topbar">
      <a
        href="../../index.html"
        className="btn sm ghost"
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginRight: 8,
          color: 'var(--accent)',
          fontWeight: 600,
          border: '1px solid var(--border-soft)',
          padding: '3px 8px',
          borderRadius: 4
        }}
      >
        <span>◂</span> Hub Deck
      </a>
      <div className="brand">
        <div className="brand-logo">Ω</div>
        <div>
          <div className="brand-name">OmniProfiler</div>
          <div className="brand-sub">
            {session ? `${session.app} · ${session.platform}` : 'waiting for agent'}
          </div>
        </div>
      </div>

      <div className="metrics">
        <Metric
          k="FPS"
          v={fmtNum(fps, 0)}
          color={fpsColor(fps, targetFps)}
          spark
          sparkField="dt"
          sub={<span>{fmtNum(dt, 1)} ms · budget {fmtNum(budget, 1)} ms</span>}
        />
        <Metric
          k="1% / 0.1% Low"
          v={low ? fmtNum(low.p01, 0) : '—'}
          u="fps"
          wide
          color={low ? fpsColor(low.p01, targetFps) : undefined}
          sub={
            <span className="lows">
              <span className="low-chip">0.1% <b>{low ? fmtNum(low.p001, 0) : '—'}</b></span>
              <span className="low-chip">avg <b>{low ? fmtNum(low.avg, 0) : '—'}</b></span>
              <span className="low-chip">min <b>{low ? fmtNum(low.min, 0) : '—'}</b></span>
            </span>
          }
        />
        <Metric k="Draw Calls" v={fmtInt(dc)} sub={<span>{fmtInt(batches)} batches · {fmtInt(sp)} setpass</span>} color={sp > 120 ? 'var(--warn)' : undefined} />
        <Metric k="GC Alloc" v={fmtBytes(snapshot?.gcPerSec ?? 0, 0)} u="/sec" spark sparkField="gc" color={(snapshot?.gcPerSec ?? 0) > 300_000 ? 'var(--bad)' : undefined} sub={<span>this frame {fmtBytes(latest?.gcAllocBytes ?? latest?.gc ?? 0, 1)}</span>} />
        <Metric k="Mono Used" v={fmtBytes(mono, 0)} spark sparkField="mono" color={mono / MB > heapMB * 0.9 ? 'var(--warn)' : undefined} sub={<span>heap {fmtNum(heapMB, 0)} MB · res {fmtBytes(res, 0)}</span>} />
        <Metric k="Gfx Driver" v={fmtBytes(gfx, 0)} sub={<span>{fmtInt(tri)} tris</span>} />
        <Metric k="Scene" v={String(latest?.scene ?? snapshot?.scene ?? '—')} wide color="var(--accent)" sub={<span className="mono" style={{ fontSize: 10 }}>frame {fmtInt(latest?.frameId ?? 0)} · {fmtClock(snapshot?.durationSec ?? 0)}</span>} />
      </div>

      <div className="spacer" />

      <div className="controls">
        <div className="metric" style={{ minWidth: 128 }}>
          <div className="metric-k">Agent</div>
          <div className="row tight" style={{ gap: 5 }}>
            <span className={`dot ${connected && agent.connected ? 'on' : connected ? 'idle' : 'off'}`} />
            <span className="mono" style={{ fontSize: 11 }}>
              {connected ? (agent.transport ?? 'connected') : 'disconnected'}
            </span>
          </div>
          <div className="metric-s">
            {fmtInt(agent.packets)} packets · <span style={{ color: lossPct > 1 ? 'var(--bad)' : 'var(--fg-3)' }}>loss {fmtNum(lossPct, 2)}%</span>
          </div>
        </div>

        <div className="metric" style={{ minWidth: 120 }}>
          <div className="metric-k">Engine</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
            {fmtInt(logStats.raw)} logs → <b style={{ color: 'var(--ok)' }}>{fmtInt(logStats.groups)}</b> rows
          </div>
          <div className="metric-s">{fmtInt(wire.dbWrites)} SQLite rows · {fmtBytes(wire.sentBytes, 0)} WS</div>
        </div>

        <button className="btn sm" title="Simulator Control" onClick={() => setTab('history')}>
          {sim?.running ? '■ Sim' : '▶ Sim'}
        </button>
        <button className="btn sm" onClick={() => postSim({ action: 'gcSpike', bytes: 2_400_000 })} title="Trigger manual GC spike (2.4 MB)">
          GC spike
        </button>
        <button className="btn sm" onClick={() => postSim({ action: sim?.running ? 'stop' : 'start' })} title={sim?.running ? 'Stop Agent' : 'Start Agent'}>
          {sim?.running ? 'Stop' : 'Start'}
        </button>
        <button
          className="btn sm"
          title={findings.length ? `${findings.length} findings` : 'no findings'}
          onClick={() => setTab('leak')}
        >
          ⚠ {findings.length}
        </button>
        <button className="btn sm ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
}
