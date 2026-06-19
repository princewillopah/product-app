import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the app calls relative `/api/*` paths which Vite proxies to the
// api-gateway (host-mapped on :8000). In production, nginx performs the same
// `/api` -> api-gateway proxy, so the frontend code is identical in both.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
