import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

const alias = { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // sandboxed preloads must be CommonJS
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react(), tailwind()],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
});
