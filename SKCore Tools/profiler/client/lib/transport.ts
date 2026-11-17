/**
 * Renderer tarafı taşıma köprüsü.
 *
 * Aynı mesaj şeması iki farklı taşıyıcı üzerinden gelir:
 *   • Electron : window.omni.onMessage(...)  (IPC)
 *   • Tarayıcı : WebSocket /ws               (geliştirme önizlemesi)
 *
 * Bu dosya farkı gizler; App ve bileşenler yalnızca `attachTransport(handler)`
 * ve `apiRequest(path)` kullanır. Böylece dashboard kodu tek kalır.
 */
import { api as httpApi, postSim as httpSim } from '../lib/ws';

/**
 * POST isteği. Tarayıcı modunda doğrudan fetch; Electron modunda IPC üzerinden
 * main process'e iletilir (main tarafı /api/sim ve /api/db/prune için POST'u destekler).
 */
export function postRequest<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  if (isElectron) return window.omni!.api(`${path}#${JSON.stringify(body ?? {})}`) as Promise<T>;
  return httpApi<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

declare global {
  interface Window {
    omni?: {
      onMessage: (cb: (msg: any) => void) => () => void;
      getState: () => Promise<any>;
      getHistory: () => Promise<any>;
      api: (path: string) => Promise<any>;
      sim: (body: Record<string, unknown>) => Promise<any>;
      dbPath: () => Promise<string>;
      openDbFolder: () => Promise<void>;
      isElectron: true;
    };
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.omni?.isElectron;

/** Taşımayı bağlar; gelen her mesaj `handler`a iletilir. İptal fonksiyonu döner. */
export function attachTransport(handler: (msg: any) => void): () => void {
  if (isElectron) {
    const off = window.omni!.onMessage(handler);
    // Electron'da "state" ve "history" istem üzerine çekilir
    window.omni!.getState().then(handler).catch(() => {});
    window.omni!.getHistory().then(handler).catch(() => {});
    return off;
  }
  // Tarayıcı: WebSocket'i lib/ws.ts üzerinden kur
  return startWebSocket(handler);
}

function startWebSocket(handler: (msg: any) => void) {
  let ws: WebSocket | null = null;
  let retry = 0;
  let closed = false;

  const open = () => {
    if (closed) return;
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = location.host || '127.0.0.1:8787';
      ws = new WebSocket(`${proto}//${host}/ws`);
      ws.onopen = () => { retry = 0; handler({ type: '__connected', connected: true }); };
      ws.onmessage = (e) => {
        try { handler(JSON.parse(e.data)); } catch { /* bozuk mesaj */ }
      };
      ws.onclose = () => {
        handler({ type: '__connected', connected: false });
        if (closed) return;
        setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* yoksay */ } };
    } catch {
      handler({ type: '__connected', connected: false });
      if (closed) return;
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
    }
  };
  open();

  return () => { closed = true; try { ws?.close(); } catch { /* yoksay */ } };
}

/** REST çağrısı — Electron'da IPC, tarayıcıda fetch. */
export function apiRequest<T = any>(path: string): Promise<T> {
  if (isElectron) return window.omni!.api(path) as Promise<T>;
  return httpApi<T>(path);
}

/** Simülatör/ajan kontrolü. */
export function simRequest(body: Record<string, unknown>): Promise<any> {
  if (isElectron) return window.omni!.sim(body);
  return httpSim(body);
}
