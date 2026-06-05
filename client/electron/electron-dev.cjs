'use strict'
/**
 * electron-dev.cjs — Dev launcher for Treetop Management Electron app
 *
 * 1. Starts the Vite dev server (npm run dev)
 * 2. Polls :5173 until Vite is ready (TCP probes, no hard sleep)
 * 3. Launches Electron pointed at http://localhost:5173
 * 4. When Electron exits, kills Vite and exits cleanly
 *
 * Usage:  npm run electron:dev
 *
 * Uses require('electron') to resolve the binary path directly from
 * node_modules — more reliable than spawning via npx on any platform.
 */

const { spawn }   = require('child_process')
const net         = require('net')
const path        = require('path')
const electronBin = require('electron')  // resolves to the actual .exe / binary path

const DEV_URL  = 'http://localhost:5173'
const DEV_PORT = 5173
const DEV_HOST = 'localhost'

// client/ directory — one level up from electron/
const clientDir = path.resolve(__dirname, '..')

// ── 1. Start Vite dev server ─────────────────────────────────────────────────
const vite = spawn('npm', ['run', 'dev'], {
  cwd:   clientDir,
  stdio: 'inherit',
  shell: true,
})

vite.on('error', err => {
  console.error('[electron-dev] Failed to start Vite:', err.message)
  process.exit(1)
})

// ── 2. Poll until Vite is accepting connections ───────────────────────────────
function waitForPort(host, port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt  = () => {
      const sock = net.createConnection(port, host)
      sock.once('connect', () => { sock.destroy(); resolve() })
      sock.once('error',   () => {
        sock.destroy()
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for Vite on :${port}`))
        } else {
          setTimeout(attempt, 250)
        }
      })
    }
    attempt()
  })
}

console.log('[electron-dev] Waiting for Vite dev server on :5173…')

waitForPort(DEV_HOST, DEV_PORT)
  .then(() => {
    console.log('[electron-dev] Vite ready — launching Electron')

    // ── 3. Launch Electron directly via its binary path ─────────────────────
    const electron = spawn(
      electronBin,
      [path.join(clientDir, 'electron', 'main.cjs')],
      {
        cwd:   clientDir,
        stdio: 'inherit',
        shell: false,  // direct binary — no shell needed
        env:   { ...process.env, ELECTRON_START_URL: DEV_URL },
      }
    )

    electron.on('error', err => {
      console.error('[electron-dev] Failed to launch Electron:', err.message)
      vite.kill()
      process.exit(1)
    })

    electron.on('close', code => {
      console.log(`[electron-dev] Electron exited (${code ?? 0}) — stopping Vite`)
      vite.kill()
      process.exit(code ?? 0)
    })
  })
  .catch(err => {
    console.error('[electron-dev]', err.message)
    vite.kill()
    process.exit(1)
  })

// ── 4. Clean shutdown on Ctrl+C ───────────────────────────────────────────────
process.on('SIGINT',  () => { vite.kill(); process.exit(0) })
process.on('SIGTERM', () => { vite.kill(); process.exit(0) })
