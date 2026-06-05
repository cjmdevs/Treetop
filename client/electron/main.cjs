'use strict'
/**
 * main.cjs — Electron main process for Treetop Management
 *
 * package.json has "type":"module" so this file MUST be .cjs (CommonJS).
 *
 * Dev mode:    ELECTRON_START_URL env var is set → loadURL(ELECTRON_START_URL)
 *              Hot-reload works because the Vite dev server is already serving.
 *
 * Production:  ELECTRON_START_URL is not set → loadFile('../dist/index.html')
 *              Vite build uses base:'./' so asset paths are relative and work
 *              under the file:// protocol that loadFile produces.
 */

const { app, BrowserWindow, shell, nativeImage } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev   = Boolean(process.env.ELECTRON_START_URL)
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

// ── Icon ──────────────────────────────────────────────────────────────────────
// Loads client/electron/icon.png if it exists; otherwise falls back to a
// programmatic 64×64 solid Treetop-green (#1F7A4D) square so the window
// always has a non-default icon.  Drop a proper icon.png here for packaging.
function buildIcon() {
  const iconPath = path.join(__dirname, 'icon.png')
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }
  const S   = 64
  const buf = Buffer.alloc(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    buf[i * 4]     = 31   // R  ┐
    buf[i * 4 + 1] = 122  // G  ├ #1F7A4D
    buf[i * 4 + 2] = 77   // B  ┘
    buf[i * 4 + 3] = 255  // A (fully opaque)
  }
  return nativeImage.createFromBuffer(buf, { width: S, height: S })
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    title:     'Treetop Management',
    icon:      buildIcon(),
    webPreferences: {
      contextIsolation: true,   // renderer is sandboxed — keep this on
      nodeIntegration:  false,  // no Node APIs in renderer
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    // Uncomment to auto-open DevTools during development:
    // mainWindow.webContents.openDevTools()
  } else {
    // Production: load the Vite-built static bundle.
    // __dirname = client/electron/ → ../dist/index.html = client/dist/index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open genuine external links in the system browser instead of Electron.
  // React Router navigation never calls window.open, so this only fires for
  // explicit <a target="_blank"> or programmatic window.open() calls.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!isDev || !url.startsWith(DEV_URL)) {
        shell.openExternal(url)
      }
    }
    // Always deny: single-window only (Phase 3). Phase 4 adds multi-window here.
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // macOS keeps apps alive until Cmd+Q
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // macOS: re-create the window when dock icon is clicked with no windows open
  if (mainWindow === null) createWindow()
})
