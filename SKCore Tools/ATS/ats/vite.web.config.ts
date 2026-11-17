// Browser build of the same renderer for the web preview (src/server). Dev: `vite --config vite.web.config.ts`
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  plugins: [react(), tailwind()],
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'ATS'
      }
    }
  },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, proxy: { '/api': 'http://127.0.0.1:5178' } },
});
