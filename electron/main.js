/**
 * Bail Reckoner – Electron Main Process
 *
 * Startup order
 * ─────────────
 *  1. initDatabase()          – WASM SQLite fully ready before any window opens
 *  2. Register IPC handlers   – system, bail engine, cases/DB, desktop APIs
 *  3. initWindowManager()     – main window, tray, app menu, global shortcut
 *  4. runBailScan (deferred)  – fire half-term alerts 4 s after startup
 *  5. Security guard          – block external navigation & new-window creation
 */

'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const isDev = process.env.ELECTRON_ENV === 'development'

// ─── Window manager ───────────────────────────────────────────────────────────
const { initWindowManager } = require('./windows/windowManager')

// ─── IPC handlers ─────────────────────────────────────────────────────────────
const { registerSystemHandlers }  = require('./ipc/systemHandlers')
const { registerBailHandlers }    = require('./ipc/bailHandlers')
const { registerCaseHandlers }    = require('./ipc/caseHandlers')
const { registerDesktopHandlers, runBailScan } = require('./ipc/desktopHandlers')

// ─── Database ─────────────────────────────────────────────────────────────────
const { initDatabase } = require('./db/database')

// ─── App lifecycle ────────────────────────────────────────────────────────────

let mainWindow = null

app.whenReady().then(async () => {
  // 1. Initialise offline SQLite database FIRST (sql.js WASM is async)
  try {
    await initDatabase()
    console.log('[Main] Database ready.')
  } catch (err) {
    console.error('[Main] Database initialisation failed:', err)
    // Non-fatal in dev; show window anyway so the error panel is visible
  }

  // 2. Register all IPC channels before creating the window
  registerSystemHandlers()
  registerBailHandlers()
  registerCaseHandlers()
  registerDesktopHandlers()

  // 3. Create the main window, tray, app menu, and global shortcut
  mainWindow = initWindowManager()

  // 4. Fire initial bail scan 4 s after startup (after renderer has loaded)
  setTimeout(() => {
    try { runBailScan(mainWindow) } catch (e) { console.error('[Main] BailScan error:', e) }
  }, 4000)

  // Open external links in the system browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Security: prevent arbitrary navigation outside the app origin
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const appOrigin = isDev
      ? 'http://localhost:5173'
      : `file://${path.join(__dirname, '../dist/index.html')}`
    if (!url.startsWith(appOrigin)) event.preventDefault()
  })
})
