'use strict'
/**
 * preload.cjs — Electron preload script
 *
 * Runs in the renderer's context before the page loads, with access to
 * Electron/Node APIs.  contextIsolation is ON throughout.
 *
 * Exposes window.__treetop__ — the only surface the renderer touches:
 *
 *   isElectron    boolean — renderer can detect Electron vs browser
 *   platform      string  — 'win32' | 'darwin' | 'linux'
 *   openModule    fn      — ask main to open/focus a module window
 *   logoutAll     fn      — ask main to close all module windows + force-logout
 *   onForceLogout fn      — subscribe to 'force-logout' from main process;
 *                           returns a cleanup fn (use in useEffect return)
 *
 * Raw ipcRenderer is NEVER exposed — only the specific methods needed.
 *
 * IPC channels
 *   Renderer → Main:  'open-module'  payload: moduleKey string
 *   Renderer → Main:  'logout-all'   no payload
 *   Main → Renderer:  'force-logout' no payload
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__treetop__', {
  isElectron: true,
  platform:   process.platform,

  /** Open (or focus) a module window in the main process. */
  openModule: (moduleKey) => {
    ipcRenderer.send('open-module', moduleKey)
  },

  /**
   * Trigger a global logout.
   * Main process will close all open module windows and send 'force-logout'
   * to the main window if it didn't originate the request.
   */
  logoutAll: () => {
    ipcRenderer.send('logout-all')
  },

  /**
   * Subscribe to the 'force-logout' event from the main process.
   * Called on windows that did NOT initiate the logout — they need to clear
   * their auth state and navigate to login.
   *
   * @param  {() => void} callback  fired when force-logout arrives
   * @returns {() => void}          cleanup — removes the listener (use as useEffect return)
   */
  onForceLogout: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('force-logout', handler)
    return () => ipcRenderer.removeListener('force-logout', handler)
  },
})
