/** Preload (sandboxed, CJS): exposes a minimal, typed bridge. No Node APIs reach the renderer. */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('atsBridge', {
  rpc: (method: string, args: unknown[]) => ipcRenderer.invoke('ats:rpc', method, args),
  openDialog: () => ipcRenderer.invoke('ats:openDialog'),
  onEvent: (cb: (e: unknown) => void) => {
    const h = (_: IpcRendererEvent, ev: unknown) => cb(ev);
    ipcRenderer.on('ats:event', h);
    return () => ipcRenderer.removeListener('ats:event', h);
  },
  platform: process.platform,
});
