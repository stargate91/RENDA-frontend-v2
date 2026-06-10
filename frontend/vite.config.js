import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/app', import.meta.url))
    }
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react';
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          return 'vendor';
        },
      },
    },
  },
})
