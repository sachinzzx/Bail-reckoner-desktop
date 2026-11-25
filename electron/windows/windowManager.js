/**
 * Bail Reckoner – Window Manager
 *
 * Manages all BrowserWindow instances:
 *   • Main Window          full workspace, remembers size/position
 *   • Quick Lookup Window  floating always-on-top spotlight (520×420, frameless)
 *   • Preview Window       child window for case law / printable report
 *
 * Also bootstraps:
 *   • System Tray   (macOS menu bar + Windows/Linux systray)
 *   • App Menu      (native application menu)
 *   • Global Shortcut  Cmd/Ctrl+Shift+B → toggle Quick Lookup
 */

'use strict'

const {
  BrowserWindow, Tray, Menu, MenuItem, globalShortcut,
  nativeImage, nativeTheme, shell, app, dialog,
} = require('electron')
const path = require('path')
const fs   = require('fs')

// ─── Window state persistence ─────────────────────────────────────────────────

function statePath () { return path.join(app.getPath('userData'), 'window-state.json') }

function loadWinState () {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveWinState (patch) {
  const current = loadWinState()
  const next    = { ...current, ...patch }
  try { fs.writeFileSync(statePath(), JSON.stringify(next, null, 2)) } catch {}
}

// ─── Programmatic tray icon (22×22 balance-scale, black+alpha) ───────────────

/** Build a valid PNG Buffer from a 2-D pixel map (1 = opaque, 0 = transparent). */
function buildPNG (W, H, pixels, [R, G, B]) {
  const { deflateSync } = require('zlib')

  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  function crc32 (buf) {
    let c = 0xFFFFFFFF
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8)
    return (~c) >>> 0
  }
  function chunk (type, data) {
    const t = Buffer.from(type, 'ascii')
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crc])
  }

  // Raw scanlines: filter byte (0 = None) + W×4 RGBA bytes
  const raw = Buffer.alloc(H * (1 + W * 4))
  for (let y = 0; y < H; y++) {
    const base = y * (1 + W * 4)
    raw[base] = 0
    for (let x = 0; x < W; x++) {
      const p = base + 1 + x * 4
      const on = pixels[y] && pixels[y][x]
      raw[p] = on ? R : 0; raw[p+1] = on ? G : 0
      raw[p+2] = on ? B : 0; raw[p+3] = on ? 255 : 0
    }
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 22×22 balance-scale pixel mask (1=black, 0=transparent)
const SCALE_PIXELS = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,0,0,0,0,1,1,1,1,0,0],
  [0,0,1,0,0,1,0,0,0,0,1,1,0,0,0,0,1,0,0,1,0,0],
  [0,0,1,0,0,1,0,0,0,0,1,1,0,0,0,0,1,0,0,1,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,0,0,0,0,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

function createTrayIconImage () {
  const buf = buildPNG(22, 22, SCALE_PIXELS, [0, 0, 0])
  const img = nativeImage.createFromBuffer(buf)
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}

// ─── Module-level window references ──────────────────────────────────────────

let mainWindow        = null
let quickLookupWindow = null
let previewWindow     = null
let tray              = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRELOAD = path.join(__dirname, '../preload.js')
const isDev   = () => process.env.ELECTRON_ENV === 'development'

function appURL (hash = '') {
  if (isDev()) return `http://localhost:5173/${hash}`
  return `file://${path.join(__dirname, '../../dist/index.html')}${hash}`
}

// ─── Main Window ──────────────────────────────────────────────────────────────

function createMainWindow () {
  const saved  = loadWinState().main || {}
  const width  = saved.width  || 1280
  const height = saved.height || 800

  const win = new BrowserWindow({
    width, height,
    x: saved.x ?? undefined,
    y: saved.y ?? undefined,
    minWidth: 1100, minHeight: 720,
    title: 'Bail Reckoner',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  if (saved.isMaximized) win.maximize()

  if (isDev()) {
    win.loadURL(appURL())
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())

  // Persist size / position on change
  function persistState () {
    if (win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
    const { x, y, width, height } = win.getBounds()
    saveWinState({ main: { x, y, width, height, isMaximized: win.isMaximized() } })
  }
  win.on('resize', persistState)
  win.on('move',   persistState)
  win.on('maximize', () => saveWinState({ main: { ...loadWinState().main, isMaximized: true } }))
  win.on('unmaximize', () => saveWinState({ main: { ...loadWinState().main, isMaximized: false } }))

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })

  win.on('closed', () => { mainWindow = null })
  mainWindow = win
  return win
}

// ─── Quick Lookup Floating Window ─────────────────────────────────────────────

function createQuickLookupWindow () {
  if (quickLookupWindow && !quickLookupWindow.isDestroyed()) {
    quickLookupWindow.focus()
    return quickLookupWindow
  }

  const win = new BrowserWindow({
    width: 520, height: 420,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev()) {
    win.loadURL(appURL('#quick-lookup'))
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'quick-lookup' })
  }

  win.once('ready-to-show', () => win.show())
  win.on('blur', () => { if (quickLookupWindow && !quickLookupWindow.isDestroyed()) win.hide() })
  win.on('closed', () => { quickLookupWindow = null })

  quickLookupWindow = win
  return win
}

function toggleQuickLookupWindow () {
  if (!quickLookupWindow || quickLookupWindow.isDestroyed()) {
    createQuickLookupWindow()
  } else if (quickLookupWindow.isVisible()) {
    quickLookupWindow.hide()
  } else {
    quickLookupWindow.show()
    quickLookupWindow.focus()
  }
}

// ─── Preview / Report Child Window ────────────────────────────────────────────

function createPreviewWindow (title = 'Case Preview') {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    return previewWindow
  }

  const win = new BrowserWindow({
    width: 920, height: 720,
    title,
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev()) {
    win.loadURL(appURL('#preview'))
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: 'preview' })
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { previewWindow = null })

  previewWindow = win
  return win
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function createTray () {
  const icon = createTrayIconImage()
  tray = new Tray(icon)
  tray.setToolTip('Bail Reckoner')

  function buildTrayMenu () {
    return Menu.buildFromTemplate([
      {
        label: 'Open Bail Reckoner',
        click () {
          if (mainWindow) { mainWindow.show(); mainWindow.focus() }
          else createMainWindow()
        },
      },
      {
        label: 'Quick Section Lookup  (Ctrl+Shift+B)',
        click () { toggleQuickLookupWindow() },
      },
      {
        label: 'Check Statutory Half-Term Alerts',
        click () {
          try { require('../ipc/desktopHandlers').runBailScan(mainWindow) } catch (e) { console.error(e) }
        },
      },
      {
        label: 'Toggle Dark / Light Mode',
        click () {
          const sources = ['system', 'dark', 'light']
          const idx = sources.indexOf(nativeTheme.themeSource)
          nativeTheme.themeSource = sources[(idx + 1) % sources.length]
          saveWinState({ theme: nativeTheme.themeSource })
          BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('app:theme-changed', {
              themeSource: nativeTheme.themeSource,
              isDark: nativeTheme.shouldUseDarkColors,
            })
          )
        },
      },
      { type: 'separator' },
      { label: 'Quit', click () { app.quit() } },
    ])
  }

  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })

  // Rebuild context menu when theme changes (to reflect current mode label)
  nativeTheme.on('updated', () => { if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu()) })

  return tray
}

// ─── Native Application Menu ──────────────────────────────────────────────────

function buildAppMenu () {
  const isMac = process.platform === 'darwin'

  function sendToMain (action) {
    mainWindow?.webContents.send('app:action', action)
  }

  const fileMenu = {
    label: 'File',
    submenu: [
      {
        label: 'New Case',
        accelerator: 'CmdOrCtrl+N',
        click () { sendToMain('new-case') },
      },
      {
        label: 'Import Case JSON…',
        async click () {
          const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Case',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile'],
          })
          if (!filePaths?.length) return
          try {
            const raw  = fs.readFileSync(filePaths[0], 'utf8')
            const data = JSON.parse(raw)
            mainWindow?.webContents.send('app:import-case', data)
          } catch (err) {
            dialog.showErrorBox('Import Failed', err.message)
          }
        },
      },
      {
        label: 'Export Active Case as PDF…',
        accelerator: 'CmdOrCtrl+E',
        click () { sendToMain('export-pdf') },
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  }

  const editMenu = { role: 'editMenu' }

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Toggle Dark / Light Theme',
        accelerator: 'CmdOrCtrl+Shift+D',
        click () {
          const sources = ['system', 'dark', 'light']
          nativeTheme.themeSource = sources[(sources.indexOf(nativeTheme.themeSource) + 1) % sources.length]
          saveWinState({ theme: nativeTheme.themeSource })
          BrowserWindow.getAllWindows().forEach(w =>
            w.webContents.send('app:theme-changed', { themeSource: nativeTheme.themeSource, isDark: nativeTheme.shouldUseDarkColors })
          )
        },
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  }

  const toolsMenu = {
    label: 'Tools',
    submenu: [
      {
        label: 'Quick Section Lookup',
        accelerator: 'CmdOrCtrl+Shift+B',
        click () { toggleQuickLookupWindow() },
      },
      {
        label: 'Run Statutory Bail Scan',
        accelerator: 'CmdOrCtrl+Shift+S',
        click () {
          try { require('../ipc/desktopHandlers').runBailScan(mainWindow) } catch (e) { console.error(e) }
        },
      },
    ],
  }

  const helpMenu = {
    label: 'Help',
    submenu: [
      {
        label: 'About Bail Reckoner',
        click () {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Bail Reckoner',
            message: 'Bail Reckoner',
            detail: `Version ${app.getVersion()}\nOffline-first bail eligibility & risk assessment for Indian courts.\n\nBuilt with Electron, React, Vite, and sql.js.`,
          })
        },
      },
      {
        label: 'Keyboard Shortcuts',
        click () { sendToMain('show-shortcuts') },
      },
      { type: 'separator' },
      {
        label: 'Open India Code Portal',
        click () { shell.openExternal('https://www.indiacode.nic.in') },
      },
      {
        label: 'Open Supreme Court of India',
        click () { shell.openExternal('https://main.sci.gov.in') },
      },
    ],
  }

  const template = []
  if (isMac) {
    template.push({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  template.push(fileMenu, editMenu, viewMenu, toolsMenu, helpMenu)
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── Global Shortcuts ─────────────────────────────────────────────────────────

function registerGlobalShortcuts () {
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    toggleQuickLookupWindow()
  })
}

function unregisterGlobalShortcuts () {
  globalShortcut.unregisterAll()
}

// ─── Initialiser ─────────────────────────────────────────────────────────────

function initWindowManager () {
  // Restore persisted theme preference
  const state = loadWinState()
  if (state.theme && ['system', 'dark', 'light'].includes(state.theme)) {
    nativeTheme.themeSource = state.theme
  }

  const win = createMainWindow()
  buildAppMenu()
  createTray()
  registerGlobalShortcuts()

  app.on('will-quit', unregisterGlobalShortcuts)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })

  return win
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  initWindowManager,
  createMainWindow,
  createQuickLookupWindow,
  createPreviewWindow,
  toggleQuickLookupWindow,
  getMainWindow:        () => mainWindow,
  getQuickLookupWindow: () => quickLookupWindow,
  getPreviewWindow:     () => previewWindow,
  getTray:              () => tray,
}
