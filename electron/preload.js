/**
 * Bail Reckoner – Preload Script
 *
 * Security model
 * ──────────────
 *  contextIsolation : true   renderer has zero access to Node.js / Electron internals
 *  nodeIntegration  : false  no require() in renderer
 *  sandbox          : false  preload can still use Node APIs; renderer stays isolated
 *
 * Only explicitly whitelisted IPC channels are callable.
 * All calls are funnelled through contextBridge → window.bailAPI.
 */

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// ─── Allowed channels ─────────────────────────────────────────────────────────

/** invoke/handle (request → response) */
const INVOKE_CHANNELS = new Set([
  // System
  'system:getInfo',

  // Bail engine (simple, existing)
  'bail:calculate',
  'bail:getRiskScore',
  'bail:saveCase',
  'bail:loadCase',
  'bail:listCases',
  'bail:deleteCase',

  // Bail analysis (comprehensive new engine)
  'bail:analyze',
  'bail:preview',

  // Statutes DB
  'db:statutes:list',
  'db:statutes:search',
  'db:statutes:getById',

  // Judicial pronouncements DB
  'db:pronouncements:list',
  'db:pronouncements:getById',

  // Cases CRUD
  'db:cases:create',
  'db:cases:list',
  'db:cases:getById',
  'db:cases:update',
  'db:cases:delete',

  // Dashboard
  'db:dashboard:stats',

  // Desktop APIs
  'desktop:toggleQuickLookup',
  'desktop:openPreview',
  'desktop:getWindowStatus',
  'desktop:runBailScan',
  'desktop:getTheme',
  'desktop:toggleTheme',
  'desktop:copyToClipboard',
  'desktop:exportCasePDF',
  'desktop:exportCaseJSON',
  'desktop:importCaseJSON',
  'desktop:openExternal',
  'desktop:showInFolder',
])

/** Fire-and-forget sends (renderer → main) */
const SEND_CHANNELS = new Set([
  'app:log',
])

/** Push events (main → renderer) */
const RECEIVE_CHANNELS = new Set([
  'app:update-available',
  'app:update-downloaded',
  // Desktop push events
  'app:navigate-to-case',
  'app:bail-scan-results',
  'app:theme-changed',
  'app:action',
  'app:import-case',
])

// ─── Safe wrappers ────────────────────────────────────────────────────────────

function safeInvoke (channel, ...args) {
  if (!INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel "${channel}" is not whitelisted.`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

function safeSend (channel, ...args) {
  if (!SEND_CHANNELS.has(channel)) throw new Error(`Send channel "${channel}" is not whitelisted.`)
  ipcRenderer.send(channel, ...args)
}

function safeOn (channel, callback) {
  if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Receive channel "${channel}" is not whitelisted.`)
  const listener = (_event, ...args) => callback(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)   // returns unsubscribe fn
}

// ─── Public API (window.bailAPI) ──────────────────────────────────────────────

contextBridge.exposeInMainWorld('bailAPI', {

  // ── System ──────────────────────────────────────────────────────────────────
  /**
   * @returns {Promise<{ electronVersion, nodeVersion, chromeVersion, platform, arch, appDataPath, appVersion }>}
   */
  getSystemInfo: () => safeInvoke('system:getInfo'),

  // ── Bail engine (simple) ────────────────────────────────────────────────────
  calculateBail:  (caseData) => safeInvoke('bail:calculate',    caseData),
  getRiskScore:   (caseData) => safeInvoke('bail:getRiskScore', caseData),
  saveCase:       (caseData) => safeInvoke('bail:saveCase',     caseData),
  loadCase:       (caseId)   => safeInvoke('bail:loadCase',     caseId),
  listCases:      ()         => safeInvoke('bail:listCases'),
  deleteCase:     (caseId)   => safeInvoke('bail:deleteCase',   caseId),

  // ── Bail analysis (comprehensive engine) ────────────────────────────────────
  /**
   * Full bail eligibility analysis for a stored case.
   * @param {number} caseId
   * @returns {Promise<BailAnalysisResult>}
   */
  analyzeCase:  (caseId)  => safeInvoke('bail:analyze',  caseId),

  /**
   * Preview bail eligibility without saving.
   * @param {{ ...caseFields, section_ids: number[] }} rawCase
   * @returns {Promise<BailAnalysisResult>}
   */
  previewBail:  (rawCase) => safeInvoke('bail:preview',  rawCase),

  // ── Database – Statutes ─────────────────────────────────────────────────────
  db: {
    statutes: {
      /** @param {{ act_code?: string }} filter */
      list:    (filter)  => safeInvoke('db:statutes:list',    filter),
      search:  (query)   => safeInvoke('db:statutes:search',  query),
      getById: (id)      => safeInvoke('db:statutes:getById', id),
    },

    // ── Judicial pronouncements ──────────────────────────────────────────────
    pronouncements: {
      list:    ()   => safeInvoke('db:pronouncements:list'),
      getById: (id) => safeInvoke('db:pronouncements:getById', id),
    },

    // ── Cases CRUD ───────────────────────────────────────────────────────────
    cases: {
      create:  (data)        => safeInvoke('db:cases:create',  data),
      list:    (filters)     => safeInvoke('db:cases:list',    filters),
      getById: (id)          => safeInvoke('db:cases:getById', id),
      update:  (id, data)    => safeInvoke('db:cases:update',  id, data),
      delete:  (id)          => safeInvoke('db:cases:delete',  id),
    },

    // ── Dashboard ────────────────────────────────────────────────────────────
    dashboard: {
      stats: () => safeInvoke('db:dashboard:stats'),
    },
  },

  // ── Desktop APIs ────────────────────────────────────────────────────────────
  desktop: {
    toggleQuickLookup: ()         => safeInvoke('desktop:toggleQuickLookup'),
    openPreview:       (arg)      => safeInvoke('desktop:openPreview', arg),
    getWindowStatus:   ()         => safeInvoke('desktop:getWindowStatus'),
    runBailScan:       ()         => safeInvoke('desktop:runBailScan'),
    getTheme:          ()         => safeInvoke('desktop:getTheme'),
    toggleTheme:       (target)   => safeInvoke('desktop:toggleTheme', target),
    copyToClipboard:   (text)     => safeInvoke('desktop:copyToClipboard', text),
    exportCasePDF:     (caseId)   => safeInvoke('desktop:exportCasePDF', caseId),
    exportCaseJSON:    (caseId)   => safeInvoke('desktop:exportCaseJSON', caseId),
    importCaseJSON:    ()         => safeInvoke('desktop:importCaseJSON'),
    openExternal:      (url)      => safeInvoke('desktop:openExternal', url),
    showInFolder:      (fp)       => safeInvoke('desktop:showInFolder', fp),
  },

  // ── Logging ─────────────────────────────────────────────────────────────────
  log: (message) => safeSend('app:log', message),

  // ── Push events from main ────────────────────────────────────────────────────
  onUpdateAvailable:  (cb) => safeOn('app:update-available',   cb),
  onUpdateDownloaded: (cb) => safeOn('app:update-downloaded',  cb),
  onNavigateToCase:   (cb) => safeOn('app:navigate-to-case',   cb),
  onBailScanResults:  (cb) => safeOn('app:bail-scan-results',  cb),
  onThemeChanged:     (cb) => safeOn('app:theme-changed',      cb),
  onAction:           (cb) => safeOn('app:action',             cb),
  onImportCase:       (cb) => safeOn('app:import-case',        cb),
})
