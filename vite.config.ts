import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/video-game-atlas/' : '/',
  build: { chunkSizeWarningLimit: 1200 }, // MapLibre alone is ~800 kB
});
