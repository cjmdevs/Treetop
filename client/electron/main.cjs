'use strict'
/**
 * main.cjs — Electron main process for Treetop Management
 *
 * Phase 3: single window, dev/prod load detection, basic icon.
 * Phase 4b: multi-window registry, IPC handlers for open-module + logout-all.
 *
 * "type":"module" in package.json → this file MUST stay .cjs (CommonJS).
 *
 * Dev mode:    ELECTRON_START_URL is set → loadURL(url + hash route)
 * Production:  ELECTRON_START_URL not set → loadFile(dist/index.html, { hash })
 */

const { app, BrowserWindow, shell, nativeImage, ipcMain } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev   = Boolean(process.env.ELECTRON_START_URL)
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

// ── Module label map ──────────────────────────────────────────────────────────
// Used to set window titles.  Keys must match modules.js `key` values.
const MODULE_LABELS = {
  'contacts':      'Contacts',
  'projects':      'Projects',
  'time-tracking': 'Time Tracking',
  'billing':       'Billing',
  'ar':            'Accounts Receivable',
  'staff':         'Staff',
  'reports':       'Reports',
  'due-dates':     'Due Dates',
  'templates':     'Templates',
  'notes':         'Notes',
  'settings':      'Settings',
}

// ── Icon ──────────────────────────────────────────────────────────────────────
function buildIcon() {
  const iconPath = path.join(__dirname, 'icon.png')
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath)
  const S   = 64
  const buf = Buffer.alloc(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    buf[i * 4]     = 31   // R ┐
    buf[i * 4 + 1] = 122  // G ├ #1F7A4D
    buf[i * 4 + 2] = 77   // B ┘
    buf[i * 4 + 3] = 255  // A
  }
  return nativeImage.createFromBuffer(buf, { width: S, height: S })
}

// Shared webPreferences — identical across every window for consistent security.
function sharedPrefs() {
  return {
    contextIsolation: true,
    nodeIntegration:  false,
    preload: path.join(__dirname, 'preload.cjs'),
  }
}

// Shared external-link handler — opens http/https links in the system browser.
function attachExternalLinkHandler(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!isDev || !url.startsWith(DEV_URL)) shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

// ── Window registry ───────────────────────────────────────────────────────────
// Key = module key ('contacts', 'billing', …), Value = BrowserWindow instance.
// One window per module key — max.
const moduleWindows = new Map()

let mainWindow = null

// ── Main window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    title:     'Treetop Management',
    icon:      buildIcon(),
    webPreferences: sharedPrefs(),
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  attachExternalLinkHandler(mainWindow)

  // When the main (dashboard) window closes, shut down all module windows too.
  // Without this, module windows would stay open as orphans after the main
  // window exits — and window-all-closed would never fire on non-macOS.
  mainWindow.on('close', () => {
    const wins = [...moduleWindows.values()]
    moduleWindows.clear()
    for (const w of wins) {
      if (!w.isDestroyed()) w.close()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Module window factory ─────────────────────────────────────────────────────
function openModuleWindow(moduleKey) {
  // Focus existing window rather than spawning a duplicate
  const existing = moduleWindows.get(moduleKey)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return
  }

  const label = MODULE_LABELS[moduleKey] ?? moduleKey
  const win   = new BrowserWindow({
    width:     1200,
    height:    800,
    minWidth:  800,
    minHeight: 560,
    title:     `Treetop — ${label}`,
    icon:      buildIcon(),
    webPreferences: sharedPrefs(),
  })

  if (isDev) {
    // Dev: Vite dev server + hash route
    win.loadURL(`${DEV_URL}/#/m/${moduleKey}`)
  } else {
    // Production: loadFile with hash option so HashRouter resolves the route.
    // Produces:  file:///…/dist/index.html#/m/<moduleKey>
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: `/m/${moduleKey}`,
    })
  }

  attachExternalLinkHandler(win)

  // Clean up registry when the window is closed
  win.on('closed', () => { moduleWindows.delete(moduleKey) })

  moduleWindows.set(moduleKey, win)
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

/**
 * 'open-module' — renderer asks main to open (or focus) a module window.
 * Validated: only known module keys are accepted.
 */
ipcMain.on('open-module', (event, moduleKey) => {
  if (typeof moduleKey === 'string' && Object.prototype.hasOwnProperty.call(MODULE_LABELS, moduleKey)) {
    openModuleWindow(moduleKey)
  }
})

/**
 * 'logout-all' — renderer (from any window) triggered a logout.
 *
 * 1. Snapshot + clear the module registry (prevents double-delete in 'closed' handlers).
 * 2. Close all module windows.
 * 3. If the MAIN window did not initiate this, send 'force-logout' to it so it
 *    clears its auth state and navigates to login.
 *    (If the main window initiated it, it's already handling its own logout.)
 */
ipcMain.on('logout-all', (event) => {
  const wins = [...moduleWindows.values()]
  moduleWindows.clear()
  for (const w of wins) {
    if (!w.isDestroyed()) w.close()
  }

  if (mainWindow && !mainWindow.isDestroyed() &&
      mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('force-logout')
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // macOS: re-create the main window if the dock icon is clicked with none open
  if (mainWindow === null) createWindow()
})
