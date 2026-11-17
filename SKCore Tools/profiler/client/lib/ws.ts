/**
 * WebSocket istemcisi.
 *
 * Electron'da bu katman `ipcRenderer.on('omni', ...)` ile birebir değiştirilir;
 * mesaj şemaları aynıdır (bkz. server/hub.js).
 *
 * Bağlantı koparsa 500 ms'den başlayan üstel geri çekilme (exponential
 * backoff) ile yeniden bağlanır ve bağlanınca sunucudan tam durum + geçmiş
 * serisini ister; böylece kopma sırasında kaçan kareler grafiğe geri işlenir.
 */
import { sink, type Frame } from './sink';
import { useStore } from './store';

export type WsUrl = string;

function wsUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function connectOmni() {
  const store = useStore.getState();
  let ws: WebSocket | null = null;
  let retry = 0;
  let closed = false;
  let rafPending = false;
  let frameBatch: Frame[] = [];

  const flushFrames = () => {
    rafPending = false;
    if (!frameBatch.length) return;
    const b = frameBatch;
    frameBatch = [];
    useStore.getState().applyFrames(b);
    sink.notify();
  };

  const open = () => {
    if (closed) return;
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      retry = 0;
      useStore.getState().setConnected(true, null);
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const s = useStore.getState();
      switch (msg.type) {
        case 'state':
          s.applyState(msg);
          break;
        case 'history': {
          const series = msg.series;
          const frames: Frame[] = [];
          if (series?.t) {
            for (let i = 0; i < series.t.length; i++) {
              frames.push({
                t: series.t[i],
                frameId: 0,
                dt: series.columns.dtMs?.[i] ?? 16.7,
                fps: series.columns.fps?.[i] ?? 60,
                gc: series.columns.gcAllocBytes?.[i] ?? 0,
                mono: series.columns.monoUsed?.[i] ?? 0,
                heap: 0, res: series.columns.totalReserved?.[i] ?? 0, gfx: 0,
                dc: series.columns.drawCalls?.[i] ?? 0, batches: 0, sp: 0, tri: 0, vert: 0,
                main: 0, rend: 0, gpu: 0, phys: 0, anim: 0,
                scene: '', samples: 0,
              });
            }
          }
          // Geçmiş serisi frameId taşımaz; t üzerinden sıralı enjeksiyon yeterli
          s.applyHistory(frames, msg.events ?? []);
          sink.notify();
          break;
        }
        case 'frames':
          frameBatch.push(...(msg.frames as Frame[]));
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushFrames);
          }
          break;
        case 'snapshot':
          s.applySnapshot(msg);
          break;
        case 'logs':
          s.applyLogs(msg);
          break;
        case 'events':
          s.applyEvents(msg.events);
          break;
        case 'objs':
          s.applyObjs(msg.objs);
          break;
        case 'finding':
          s.applyFindings(msg.findings);
          break;
        case 'scene':
          if (msg.event) s.applyEvents([msg.event]);
          break;
        case 'agent':
          useStore.setState({ agent: msg.agent });
          break;
        case 'session':
          useStore.setState({ session: msg.session });
          break;
        default:
          break;
      }
    };
    ws.onerror = () => useStore.getState().setConnected(false, 'WebSocket hatası');
    ws.onclose = () => {
      useStore.getState().setConnected(false, 'Bağlantı koptu — yeniden deneniyor');
      if (closed) return;
      const delay = Math.min(8000, 500 * 2 ** retry++);
      setTimeout(open, delay);
    };
  };

  open();
  return () => {
    closed = true;
    try { ws?.close(); } catch { /* yoksay */ }
  };
}

/** REST yardımcıları. */
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

export function postSim(body: Record<string, unknown>) {
  return api('/sim', { method: 'POST', body: JSON.stringify(body) });
}
