/**
 * OmniProfiler Dashboard — kök bileşen.
 *
 * Yerleşim (spec'teki 4 ana bölüm):
 *   ┌────────────────────────── ÜST BAR (global metrikler) ─────────────────────────┐
 *   ├───────────────┬───────────────────────────────────┬──────────────────────────┤
 *   │ SOL: Log      │ ORTA/ÜST: Zaman serisi grafikleri │ SAĞ: Bulgular +          │
 *   │ akışı &       │  frame time / fps+low / bellek /  │      maliyet panosu      │
 *   │ filtreler     │  gc / draw calls + olay şeridi    │                          │
 *   ├───────────────┴───────────────────────────────────┴──────────────────────────┤
 *   │ ALT: Frame Inspector · A/B · Sızıntı · Özel Olaylar · Tarihsel Analiz        │
 *   └───────────────────────────────────────────────────────────────────────────────┘
 */
import React, { useEffect } from 'react';
import { attachTransport } from './lib/transport';
import { sink, type Frame } from './lib/sink';
import { useStore } from './lib/store';
import TopBar from './components/TopBar';
import LogPanel from './components/LogPanel';
import ChartsPanel from './components/ChartsPanel';
import SidePanel from './components/SidePanel';
import BottomPanel from './components/BottomPanel';

export default function App() {
  const theme = useStore((s) => s.theme);
  const connected = useStore((s) => s.connected);
  const lastError = useStore((s) => s.lastError);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Taşıma: Electron'da IPC, tarayıcıda WebSocket — aynı mesaj şeması.
  useEffect(() => {
    let rafPending = false;
    let batch: Frame[] = [];
    const flush = () => {
      rafPending = false;
      if (!batch.length) return;
      const b = batch; batch = [];
      useStore.getState().applyFrames(b);
      sink.notify();
    };
    const off = attachTransport((msg) => {
      const s = useStore.getState();
      switch (msg.type) {
        case '__connected': s.setConnected(!!msg.connected, msg.connected ? null : 'Standby: Waiting for Unity Profiler Agent (127.0.0.1:8787)'); break;
        case 'state': s.applyState(msg); s.setConnected(true, null); break;
        case 'history': {
          const series = msg.series;
          const frames: Frame[] = [];
          if (series?.t) {
            for (let i = 0; i < series.t.length; i++) {
              frames.push({
                t: series.t[i], frameId: 0,
                dt: series.columns.dtMs?.[i] ?? 16.7, fps: series.columns.fps?.[i] ?? 60,
                gc: series.columns.gcAllocBytes?.[i] ?? 0, mono: series.columns.monoUsed?.[i] ?? 0,
                heap: 0, res: series.columns.totalReserved?.[i] ?? 0, gfx: 0,
                dc: series.columns.drawCalls?.[i] ?? 0, batches: 0, sp: 0, tri: 0, vert: 0,
                main: 0, rend: 0, gpu: 0, phys: 0, anim: 0, scene: '', samples: 0,
              });
            }
          }
          s.applyHistory(frames, msg.events ?? []);
          sink.notify();
          break;
        }
        case 'frames':
          batch.push(...(msg.frames as Frame[]));
          if (!rafPending) { rafPending = true; requestAnimationFrame(flush); }
          break;
        case 'snapshot': s.applySnapshot(msg); break;
        case 'logs': s.applyLogs(msg); break;
        case 'events': s.applyEvents(msg.events); break;
        case 'objs': s.applyObjs(msg.objs); break;
        case 'finding': s.applyFindings(msg.findings); break;
        case 'scene': if (msg.event) s.applyEvents([msg.event]); break;
        case 'agent': useStore.setState({ agent: msg.agent }); break;
        case 'session': useStore.setState({ session: msg.session }); break;
        default: break;
      }
    });
    return () => off();
  }, []);

  // Klavye kısayolları: 1-5 sekme, F canlı takip, / arama
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key >= '1' && e.key <= '5') {
        const tabs = ['flame', 'compare', 'leak', 'events', 'history'] as const;
        s.setTab(tabs[Number(e.key) - 1]);
      }
      if (e.key === '/') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('.search-row input');
        el?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <div className="top"><TopBar /></div>
      <LogPanel />
      <ChartsPanel />
      <SidePanel />
      <BottomPanel />
      {!connected ? (
        <div style={{
          position: 'fixed', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-3)', border: '1px solid var(--bad)', color: 'var(--fg)',
          padding: '6px 12px', borderRadius: 8, fontSize: 11.5, zIndex: 50, boxShadow: 'var(--shadow)',
        }}>
          {lastError ?? 'Connecting to OmniProfiler main process…'}
        </div>
      ) : null}
    </div>
  );
}
