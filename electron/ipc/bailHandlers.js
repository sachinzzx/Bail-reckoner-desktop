/**
 * IPC Handlers – Bail Engine
 *
 * Registers IPC channels that delegate to the bail calculation engine
 * and the database layer for case persistence.
 */

'use strict'

const { ipcMain } = require('electron')
const { calculateBail, getRiskScore } = require('../engine/bailEngine')

function registerBailHandlers() {
  /** Calculate bail amount for a given case */
  ipcMain.handle('bail:calculate', async (_event, caseData) => {
    return calculateBail(caseData)
  })

  /** Get a risk score (0–100) for the case */
  ipcMain.handle('bail:getRiskScore', async (_event, caseData) => {
    return getRiskScore(caseData)
  })

  // ── Persistence stubs (wire up DB layer here) ──────────────────────────────

  ipcMain.handle('bail:saveCase', async (_event, caseData) => {
    // TODO: implement with electron/db layer
    return { success: true, id: `case_${Date.now()}` }
  })

  ipcMain.handle('bail:loadCase', async (_event, caseId) => {
    // TODO: implement with electron/db layer
    return null
  })

  ipcMain.handle('bail:listCases', async () => {
    // TODO: implement with electron/db layer
    return []
  })

  ipcMain.handle('bail:deleteCase', async (_event, caseId) => {
    // TODO: implement with electron/db layer
    return { success: true }
  })
}

module.exports = { registerBailHandlers }
