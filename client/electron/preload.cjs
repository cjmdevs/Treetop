'use strict'
/**
 * preload.cjs — Electron preload script
 *
 * Runs before the renderer page loads.  contextIsolation is ON; nodeIntegration OFF.
 * Exposes window.__treetop__ — the only surface the renderer ever touches.
 *
 *   isElectron    boolean — renderer can distinguish Electron vs browser
 *   platform      string  — 'win32' | 'darwin' | 'linux'
 *   appVersion    string  — app version from package.json (e.g. "1.0.0")
 *   openModule    fn      — ask main to open/focus a module window
 *   openExternal  fn      — ask main to open a URL in the system browser
 *   logoutAll     fn      — ask main to close all module windows + force-logout
 *   onForceLogout fn      — subscribe to 'force-logout' from main; returns cleanup fn
 *
 * Raw ipcRenderer and shell are NEVER exposed.
 *
 * IPC channels (renderer → main):
 *   'open-module'    payload: moduleKey string
 *   'open-external'  payload: url string (http/https only; validated in main)
 *   'logout-all'     no payload
 *
 * IPC channels (main → renderer):
 *   'force-logout'   no payload
 */

const { contextBridge, ipcRenderer } = require('electron')
const path = require('path')

// ── App version ───────────────────────────────────────────────────────────────
// Two-stage read so it works in both environments:
//
//   Dev / build-test: __dirname = client/electron/ → ../package.json is a real file.
//
//   Packaged (asarUnpack): preload lives at resources/app.asar.unpacked/electron/
//   so ../package.json doesn't exist on disk.  package.json is inside the ASAR —
//   readable via Node's fs module because Electron patches it to intercept ASAR paths.
let appVersion = 'unknown'
try {
  // Stage 1 — dev / build-test
  const pkg = require(path.join(__dirname, '..', 'package.json'))
  appVersion = pkg.version || 'unknown'
} catch {
  try {
    // Stage 2 — packaged: read from ASAR via fs (ASAR interception handles the path)
    const { readFileSync } = require('fs')
    const raw = readFileSync(
      path.join(process.resourcesPath, 'app.asar', 'package.json'), 'utf8'
    )
    appVersion = JSON.parse(raw).version || 'unknown'
  } catch { /* truly unknown */ }
}

// ── Context bridge ────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('__treetop__', {
  isElectron: true,
  platform:   process.platform,
  appVersion,

  /** Open (or focus) a module window in the main process. */
  openModule: (moduleKey) => {
    ipcRenderer.send('open-module', moduleKey)
  },

  /**
   * Open a URL in the user's default system browser.
   * Main process validates the URL is http/https before delegating to shell.openExternal.
   * @param {string} url  An https:// or http:// URL.
   */
  openExternal: (url) => {
    ipcRenderer.send('open-external', url)
  },

  /**
   * Trigger a global logout.
   * Main closes all module windows and sends 'force-logout' to windows that did
   * not initiate the request.
   */
  logoutAll: () => {
    ipcRenderer.send('logout-all')
  },

  /**
   * Subscribe to the 'force-logout' event from the main process.
   * @param  {() => void} callback  Fired when force-logout arrives.
   * @returns {() => void}          Cleanup function — remove listener (use as useEffect return).
   */
  onForceLogout: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('force-logout', handler)
    return () => ipcRenderer.removeListener('force-logout', handler)
  },
})
