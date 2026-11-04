import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 1200 }, // MapLibre alone is ~800 kB
});
