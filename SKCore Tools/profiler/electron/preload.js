/**
 * OmniProfiler — Electron Preload (context bridge)
 *
 * Renderer süreci Node'a erişemez (contextIsolation: true). Bu dosya yalnızca
 * GEREKLİ yüzeyi açar: canlı akış (main → renderer) ve birkaç sorgu/eylem.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omni', {
  /** Canlı akış: 'frames' | 'logs' | 'events' | 'snapshot' | 'finding' | 'state' | ... */
  onMessage(cb) {
    const listener = (_e, msg) => cb(msg);
    ipcRenderer.on('omni', listener);
    return () => ipcRenderer.removeListener('omni', listener);
  },
  /** Bağlanınca tam durum anlık görüntüsü. */
  getState: () => ipcRenderer.invoke('omni:state'),
  /** Geçmiş serisi (ring buffer dışındaki SQLite verisiyle birleştirilir). */
  getHistory: () => ipcRenderer.invoke('omni:history'),
  /** REST uç noktası (main process üzerinden proxy'lenir). */
  api: (path) => ipcRenderer.invoke('omni:api', path),
  /** Simülatör / ajan kontrolü. */
  sim: (body) => ipcRenderer.invoke('omni:sim', body),
  dbPath: () => ipcRenderer.invoke('omni:dbPath'),
  openDbFolder: () => ipcRenderer.invoke('omni:openDbFolder'),
  isElectron: true,
});
