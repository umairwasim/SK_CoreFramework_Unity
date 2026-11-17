/**
 * FORGE Electron — preload script
 *
 * Runs in renderer context with contextIsolation=true.
 * Currently exposes nothing — the renderer communicates directly with
 * the Python HTTP server via fetch(), so no IPC bridge is needed yet.
 *
 * Add contextBridge.exposeInMainWorld() entries here if you ever need
 * Electron-native APIs (file dialogs, notifications, etc.) from the UI.
 */

"use strict";

const { contextBridge } = require("electron");

// Example (uncomment when needed):
// contextBridge.exposeInMainWorld("electronAPI", {
//   openDialog: () => ipcRenderer.invoke("open-dialog"),
// });
