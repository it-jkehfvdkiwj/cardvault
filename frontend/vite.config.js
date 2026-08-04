import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Stamped into the bundle at build time and printed to the console on start.
  // Without it there is no way to tell which build a browser is actually
  // running — "the file is on the server" and "the browser uses it" are two
  // different claims, and a stale cache makes them disagree silently.
  define: {
    __BUILD_STAMP__: JSON.stringify(
      process.env.BUILD_STAMP || new Date().toISOString().slice(0, 16).replace('T', ' '),
    ),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
