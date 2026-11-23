/**
 * Main Window Factory
 *
 * Creates and configures the primary BrowserWindow with strict
 * webPreferences for maximum security.
 */

'use strict'

const { BrowserWindow } = require('electron')
const path = require('path')

/**
 * @param {boolean} isDev
 * @returns {BrowserWindow}
 */
function createMainWindow(isDev) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Bail Reckoner',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // show only after content loads to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,   // renderer cannot access Node APIs
      nodeIntegration: false,   // no require() in renderer
      sandbox: false,           // preload needs Node; renderer is still sandboxed via contextIsolation
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Load app
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Show window gracefully once ready
  win.once('ready-to-show', () => {
    win.show()
  })

  return win
}

module.exports = { createMainWindow }
