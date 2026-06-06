import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// command is 'serve' (dev) or 'build' (production)
export default defineConfig(({ command }) => ({
  // In production builds, use relative asset paths so the dist/ folder works
  // when loaded via Electron's loadFile (file:// protocol).
  // Dev server uses the default '/' base — no change to hot-reload behavior.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  // Bake build-time constants into the bundle.
  // These are replaced textually at build time (and in Vite dev server):
  //   __BUILD_TIME__  — ISO timestamp of when `npm run build` was run
  //   __APP_VERSION__ — version from package.json (set by npm as npm_package_version)
  define: {
    __BUILD_TIME__:  JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}))