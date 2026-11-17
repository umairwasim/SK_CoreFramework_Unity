/**
 * OmniProfiler — Yayın Katmanı (Hub)
 *
 * Electron'da bu katman `webContents.send(...)` / Socket.io olur; web
 * prototipinde WebSocket'tir. Kritik nokta: her kare için ayrı mesaj
 * göndermek (60 fps) tarayıcıda IPC/websocket fırtınası yaratır. Bu yüzden
 * kareler ~100 ms'lik partiler halinde (batch) gönderilir; loglar, olaylar ve
 * bulgular ise anlık (event-driven) yayınlanır.
 */
import { WebSocketServer } from 'ws';

export class Hub {
  #batchTimer;
  #tickTimer;
  #pingTimer;

  constructor({ server, path = '/ws', batchMs = 100, tickMs = 250, onTick }) {
    this.wss = new WebSocketServer({ server, path });
    this.clients = new Set();
    this.frameQueue = [];
    this.batchMs = batchMs;
    this.sentFrames = 0;
    this.sentBytes = 0;
    this.sentMessages = 0;
    this.onTick = onTick;

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
      // Yeni istemci: tam durum anlık görüntüsü (geçmiş dahil)
      const state = this.onTick?.('state');
      if (state) this.#send(ws, state);
      const hist = this.onTick?.('history');
      if (hist) this.#send(ws, hist);
    });

    this.#batchTimer = setInterval(() => this.#flushFrames(), batchMs);
    this.#tickTimer = setInterval(() => {
      const snap = this.onTick?.('snapshot');
      if (snap) this.broadcast(snap);
    }, tickMs);
    this.#pingTimer = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) { ws.terminate(); this.clients.delete(ws); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* yoksay */ }
      }
    }, 15000);
  }

  get clientCount() { return this.clients.size; }

  queueFrame(f) { this.frameQueue.push(f); }

  #flushFrames() {
    if (!this.frameQueue.length) return;
    if (!this.clients.size) { this.frameQueue.length = 0; return; }
    const frames = this.frameQueue.splice(0, this.frameQueue.length);
    this.sentFrames += frames.length;
    this.broadcast({ type: 'frames', frames });
  }

  broadcast(obj) {
    if (!this.clients.size) return;
    const data = JSON.stringify(obj);
    this.sentBytes += data.length;
    this.sentMessages++;
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        try { ws.send(data); } catch { /* yoksay */ }
      }
    }
  }

  #send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* yoksay */ }
  }

  close() {
    clearInterval(this.#batchTimer);
    clearInterval(this.#tickTimer);
    clearInterval(this.#pingTimer);
    for (const ws of this.clients) { try { ws.close(); } catch { /* yoksay */ } }
    this.wss.close();
  }
}
