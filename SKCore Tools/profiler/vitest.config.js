import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * İki proje:
 *   • node : sunucu tarafı analiz motoru testleri (DOM gerekmez, hızlı)
 *   • dom  : React panel testleri (jsdom + canvas stub)
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['test/*.test.js'], exclude: ['test/*.dom.test.js'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['test/*.dom.test.js'], setupFiles: ['test/setup-dom.js'] },
      },
    ],
  },
});
