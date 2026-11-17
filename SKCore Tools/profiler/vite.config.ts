import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.OMNI_API ?? 'http://127.0.0.1:8787';

/**
 * Electron'a taşırken: `vite build` çıktısı (dist/) BrowserWindow'a loadFile
 * edilir; /api ve /ws proxy'si yerine doğrudan IPC kullanılır. Proxy sadece
 * geliştirme sırasında tarayıcı önizlemesi içindir.
 */
export default defineConfig({
  plugins: [react()],
  root: 'client',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'OmniProfiler',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.OMNI_UI_PORT ?? 5173),
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
});
