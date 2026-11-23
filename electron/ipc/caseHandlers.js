/**
 * IPC Handlers – Cases, Statutes, Pronouncements & Bail Analysis
 *
 * Registers all database CRUD operations and the bail eligibility
 * calculator as ipcMain channels, consumed by the renderer via
 * window.bailAPI (exposed through preload.js contextBridge).
 */

'use strict'

const { ipcMain } = require('electron')
const db = require('../db/database')
const { analyzeBailEligibility } = require('../engine/bailCalculator')

function registerCaseHandlers () {

  // ── Statutes ─────────────────────────────────────────────────────────────

  /** List all statutes; pass { act_code: 'IPC' } to filter by act */
  ipcMain.handle('db:statutes:list', async (_e, filter = {}) => {
    return db.listStatutes(filter)
  })

  /** Full-text search across section_number, title, description */
  ipcMain.handle('db:statutes:search', async (_e, searchQuery = '') => {
    return db.searchStatutes(searchQuery)
  })

  /** Get a single statute by its integer ID */
  ipcMain.handle('db:statutes:getById', async (_e, id) => {
    return db.getStatuteById(id)
  })

  // ── Judicial Pronouncements ───────────────────────────────────────────────

  /** List all landmark judgments */
  ipcMain.handle('db:pronouncements:list', async () => {
    return db.listPronouncements()
  })

  /** Get a single pronouncement by ID */
  ipcMain.handle('db:pronouncements:getById', async (_e, id) => {
    return db.getPronouncement(id)
  })

  // ── Cases CRUD ────────────────────────────────────────────────────────────

  /** Create a new undertrial case record */
  ipcMain.handle('db:cases:create', async (_e, caseData) => {
    try {
      return { success: true, data: db.createCase(caseData) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  /** List all cases; optionally filter by { status: 'undertrial' } */
  ipcMain.handle('db:cases:list', async (_e, filters = {}) => {
    return db.listCases(filters)
  })

  /** Get full case record by ID */
  ipcMain.handle('db:cases:getById', async (_e, id) => {
    return db.getCaseById(id)
  })

  /** Update fields on an existing case */
  ipcMain.handle('db:cases:update', async (_e, id, data) => {
    try {
      return { success: true, data: db.updateCase(id, data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  /** Permanently delete a case */
  ipcMain.handle('db:cases:delete', async (_e, id) => {
    return db.deleteCase(id)
  })

  // ── Bail Analysis ─────────────────────────────────────────────────────────

  /**
   * Full bail eligibility analysis for a stored case.
   * Fetches case + relevant statute sections + all pronouncements from DB,
   * then runs the bail calculator engine.
   */
  ipcMain.handle('bail:analyze', async (_e, caseId) => {
    const caseData = db.getCaseById(caseId)
    if (!caseData) return { error: `Case with id ${caseId} not found.` }

    const chargeIds     = Array.isArray(caseData.charges_json) ? caseData.charges_json : []
    const sections      = db.getStatutesByIds(chargeIds)
    const pronouncements = db.listPronouncements()

    return analyzeBailEligibility(caseData, sections, pronouncements)
  })

  /**
   * Preview bail eligibility without saving — takes raw case data and
   * an array of statute IDs (or full statute objects) directly.
   *
   * Input shape: { ...caseFields, section_ids: [1, 10, 41] }
   */
  ipcMain.handle('bail:preview', async (_e, rawCase) => {
    const { section_ids = [], ...caseData } = rawCase
    const sections       = section_ids.length ? db.getStatutesByIds(section_ids) : []
    const pronouncements = db.listPronouncements()

    return analyzeBailEligibility(
      { id: 'preview', case_number: 'PREVIEW', ...caseData },
      sections,
      pronouncements
    )
  })

  // ── Dashboard ─────────────────────────────────────────────────────────────

  /** Aggregate statistics for the dashboard overview */
  ipcMain.handle('db:dashboard:stats', async () => {
    return db.getDashboardStats()
  })
}

module.exports = { registerCaseHandlers }
