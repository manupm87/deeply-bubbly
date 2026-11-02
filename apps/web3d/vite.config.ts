import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5174 },
  preview: { port: 4174 },
  // A missing `models/manifest.json` must answer 404, not the SPA's index.html (the model registry
  // treats both as "no models", but only one of them is the truth).
  appType: 'mpa',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]build/ }] },
      },
    },
  },
});
