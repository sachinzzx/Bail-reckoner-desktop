/**
 * Bail Reckoner – Preload Script
 *
 * Security model:
 *  - contextIsolation: true  → renderer has NO access to Node.js / Electron internals
 *  - nodeIntegration: false  → no require() in renderer
 *  - sandbox: false          → preload can still use Node APIs (needed for contextBridge)
 *
 * Only explicitly whitelisted methods are exposed via contextBridge.
 * All exposed API calls go through typed IPC invoke channels.
 */

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// ─── Allowed IPC channels ─────────────────────────────────────────────────────

/** One-shot request → response (invoke/handle) */
const INVOKE_CHANNELS = new Set([
  // System
  'system:getInfo',
  // Bail engine
  'bail:calculate',
  'bail:getRiskScore',
  'bail:saveCase',
  'bail:loadCase',
  'bail:listCases',
  'bail:deleteCase',
])

/** Fire-and-forget sends */
const SEND_CHANNELS = new Set([
  'app:log',
])

/** Events pushed from main → renderer */
const RECEIVE_CHANNELS = new Set([
  'app:update-available',
  'app:update-downloaded',
])

// ─── Safe invoke wrapper ──────────────────────────────────────────────────────

function safeInvoke(channel, ...args) {
  if (!INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel "${channel}" is not whitelisted.`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

function safeSend(channel, ...args) {
  if (!SEND_CHANNELS.has(channel)) {
    throw new Error(`IPC send channel "${channel}" is not whitelisted.`)
  }
  ipcRenderer.send(channel, ...args)
}

function safeOn(channel, callback) {
  if (!RECEIVE_CHANNELS.has(channel)) {
    throw new Error(`IPC receive channel "${channel}" is not whitelisted.`)
  }
  const listener = (_event, ...args) => callback(...args)
  ipcRenderer.on(channel, listener)
  // Return a cleanup function
  return () => ipcRenderer.removeListener(channel, listener)
}

// ─── Typed public API (window.bailAPI) ───────────────────────────────────────

contextBridge.exposeInMainWorld('bailAPI', {
  /**
   * System
   * @returns {Promise<{ electronVersion: string, platform: string, appDataPath: string }>}
   */
  getSystemInfo: () => safeInvoke('system:getInfo'),

  /**
   * Bail engine
   */
  calculateBail: (caseData) => safeInvoke('bail:calculate', caseData),
  getRiskScore: (caseData) => safeInvoke('bail:getRiskScore', caseData),

  /**
   * Case management (persistence)
   */
  saveCase: (caseData) => safeInvoke('bail:saveCase', caseData),
  loadCase: (caseId) => safeInvoke('bail:loadCase', caseId),
  listCases: () => safeInvoke('bail:listCases'),
  deleteCase: (caseId) => safeInvoke('bail:deleteCase', caseId),

  /**
   * Logging
   */
  log: (message) => safeSend('app:log', message),

  /**
   * Subscribe to events pushed from main process
   * @returns {() => void} unsubscribe function
   */
  onUpdateAvailable: (cb) => safeOn('app:update-available', cb),
  onUpdateDownloaded: (cb) => safeOn('app:update-downloaded', cb),
})
