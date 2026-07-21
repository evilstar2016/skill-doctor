import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Dev only: proxy API + session bootstrap to the skill-doctor UI server.
// Start that server on the matching port, e.g. `skill-doctor ui --port 4173`.
const apiPort = process.env.VITE_API_PORT ?? '4173';
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/session': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(root, '../dist/ui'),
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2022',
  },
});
