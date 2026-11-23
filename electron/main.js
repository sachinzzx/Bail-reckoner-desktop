/**
 * Bail Reckoner – Electron Main Process
 *
 * Responsibilities:
 *  - Create and manage BrowserWindow(s) via WindowManager
 *  - Register all IPC handlers
 *  - Control app lifecycle (ready, window-all-closed, activate)
 */

'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const isDev = process.env.ELECTRON_ENV === 'development'

// ─── Window manager ───────────────────────────────────────────────────────────
const { createMainWindow } = require('./windows/mainWindow')

// ─── IPC handlers ─────────────────────────────────────────────────────────────
const { registerSystemHandlers } = require('./ipc/systemHandlers')
const { registerBailHandlers } = require('./ipc/bailHandlers')

// ─── App lifecycle ────────────────────────────────────────────────────────────

let mainWindow = null

app.whenReady().then(async () => {
  // Register all IPC channels before creating the window
  registerSystemHandlers()
  registerBailHandlers()

  mainWindow = createMainWindow(isDev)

  // Open external links in the default browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(isDev)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Security: prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const appURL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`
    if (!url.startsWith(appURL)) {
      event.preventDefault()
    }
  })
})
