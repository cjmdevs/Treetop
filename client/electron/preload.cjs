'use strict'
/**
 * preload.cjs — Electron preload script
 *
 * Executes in the renderer's context before the page loads, with access to
 * Electron/Node APIs.  contextIsolation is ON — use contextBridge to safely
 * expose any IPC surface to the renderer.
 *
 * Phase 4 will add the multi-window IPC bridge here.
 * For now we expose a minimal read-only info object so the renderer can
 * detect that it's running inside Electron if needed.
 */

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__treetop__', {
  isElectron: true,
  platform:   process.platform,  // 'win32' | 'darwin' | 'linux'
})
