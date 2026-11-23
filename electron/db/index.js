/**
 * Database Layer – Index
 *
 * Placeholder for the database adapter.
 * Replace with better-sqlite3, Prisma, or any preferred ORM.
 *
 * Usage:
 *   const db = require('./electron/db')
 *   await db.cases.save(caseData)
 *   const cases = await db.cases.list()
 */

'use strict'

const { app } = require('electron')
const path = require('path')

let _dbPath = null

function getDbPath() {
  if (!_dbPath) {
    _dbPath = path.join(app.getPath('userData'), 'bail-reckoner.db')
  }
  return _dbPath
}

// ── Stub implementations ──────────────────────────────────────────────────────

const cases = {
  async save(caseData) {
    console.log('[DB] save case at:', getDbPath(), caseData)
    return { id: `case_${Date.now()}`, ...caseData }
  },

  async load(caseId) {
    console.log('[DB] load case:', caseId)
    return null
  },

  async list() {
    console.log('[DB] list cases')
    return []
  },

  async delete(caseId) {
    console.log('[DB] delete case:', caseId)
    return true
  },
}

module.exports = { getDbPath, cases }
