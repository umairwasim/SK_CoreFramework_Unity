import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function sqlJsDefaultExport(): Plugin {
  return {
    name: 'sqljs-default-export',
    transform(code, id) {
      if (!id.includes('sql-wasm-browser.js')) return
      let patched = code.replace(/module\s*=\s*undefined;/g, 'var module = undefined;')
      patched = patched.replace(/module\.exports\s*=\s*initSqlJs;/g, '/* module.exports = initSqlJs; */')
      patched = patched.replace(/module\.exports\.default\s*=\s*initSqlJs;/g, '/* module.exports.default = initSqlJs; */')
      if (!patched.includes('export default initSqlJs')) {
        patched = `${patched}\nexport default initSqlJs;\n`
      }
      return { code: patched, map: null }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), sqlJsDefaultExport()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'QuestBoard',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
})
