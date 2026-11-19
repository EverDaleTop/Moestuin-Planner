import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    // Icoontjes als losse, cachebare bestanden i.p.v. base64 in de JS-bundel.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // React in een eigen, lang cachebaar bestand.
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // REST API + WebSocket -> Node/Express server (server/index.ts)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
