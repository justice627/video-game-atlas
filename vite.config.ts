import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { chunkSizeWarningLimit: 1200 }, // MapLibre alone is ~800 kB
  // Unit tests only; the browser tests in e2e/ run with Playwright (npm run test:e2e).
  test: { include: ['tests/**/*.test.ts'] },
});
