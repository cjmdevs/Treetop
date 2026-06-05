import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// command is 'serve' (dev) or 'build' (production)
export default defineConfig(({ command }) => ({
  // In production builds, use relative asset paths so the dist/ folder works
  // when loaded via Electron's loadFile (file:// protocol).
  // Dev server uses the default '/' base — no change to hot-reload behavior.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}))