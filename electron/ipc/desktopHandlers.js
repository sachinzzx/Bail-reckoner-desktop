/**
 * Bail Reckoner – Desktop API IPC Handlers
 *
 * Registers all native desktop integration channels:
 *   desktop:toggleQuickLookup   toggle the floating Quick Lookup window
 *   desktop:openPreview         open the Preview child window
 *   desktop:runBailScan         scan all cases for eligibility & fire notifications
 *   desktop:getTheme            current theme info
 *   desktop:toggleTheme         cycle system → dark → light
 *   desktop:copyToClipboard     write text to OS clipboard
 *   desktop:exportCasePDF       generate & save professional PDF report
 *   desktop:exportCaseJSON      export a case record as .json
 *   desktop:importCaseJSON      import a case from .json (via file dialog)
 *   desktop:openExternal        open URL in default browser
 *   desktop:showInFolder        reveal file in Finder / Explorer
 */

'use strict'

const {
  ipcMain, dialog, shell, clipboard, nativeTheme, Notification, BrowserWindow, app,
} = require('electron')
const path = require('path')
const fs   = require('fs')

const db          = require('../db/database')
const { analyzeBailEligibility, calculateCustodyProgress, getStrictestCharge } = require('../engine/bailCalculator')

const STATE_PATH = () => path.join(app.getPath('userData'), 'window-state.json')

function loadState () {
  try { return JSON.parse(fs.readFileSync(STATE_PATH(), 'utf8')) } catch { return {} }
}
function patchState (patch) {
  const s = { ...loadState(), ...patch }
  try { fs.writeFileSync(STATE_PATH(), JSON.stringify(s, null, 2)) } catch {}
}

// ─── Bail Scan ────────────────────────────────────────────────────────────────

/**
 * Scan every undertrial case for half-term / 1/3-rule eligibility.
 * Fires a native Notification for each eligible case.
 * Optionally accepts a mainWindow reference to handle notification click.
 */
function runBailScan (mainWindow) {
  const cases  = db.listCases({ status: 'undertrial' })
  const alerts = []
  const today  = new Date()

  for (const c of cases) {
    const ids = Array.isArray(c.charges_json) ? c.charges_json : []
    if (!ids.length) continue

    const sections = db.getStatutesByIds(ids)
    const cp       = calculateCustodyProgress(c, sections)
    if (!cp || cp.hasLifeDeath || cp.hasError) continue

    const isFirstTime = c.is_first_time_offender === 1 || c.is_first_time_offender === true

    let eligible = false
    let reason   = ''

    if (cp.halfTermEligible) {
      eligible = true
      reason   = `${cp.halfTermProgress}% of max sentence served — §479 BNSS / §436A CrPC`
    } else if (isFirstTime && cp.oneThirdEligible) {
      eligible = true
      reason   = `${cp.oneThirdProgress}% served (first-time offender 1/3 rule — §479 BNSS)`
    }

    if (eligible) {
      alerts.push({ caseId: c.id, caseNumber: c.case_number, name: c.prisoner_name, reason })

      if (Notification.isSupported()) {
        const notif = new Notification({
          title: '⚖ Bail Reckoner — Eligibility Alert',
          body:  `${c.prisoner_name} (${c.case_number}): ${reason}.`,
          urgency: 'normal',
        })
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('app:navigate-to-case', c.id)
          }
        })
        notif.show()
      }
    }
  }

  // Also broadcast scan results to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:bail-scan-results', { alerts, scannedAt: new Date().toISOString() })
  }

  console.log(`[BailScan] Scanned ${cases.length} cases, ${alerts.length} alert(s)`)
  return alerts
}

// ─── PDF Report Template ──────────────────────────────────────────────────────

function generateBailReportHTML (caseData, analysis) {
  const verdict  = analysis.verdict || {}
  const cp       = analysis.custodyProgress || {}
  const risk     = analysis.riskIndex || {}
  const nature   = analysis.natureAssessment || {}
  const checklist = analysis.proceduralChecklist || []
  const pronouncements = analysis.matchedPronouncements || []
  const strictest = analysis.chargesAnalysis?.strictestCharge

  const statusColor = {
    ELIGIBLE:                '#16a34a',
    CONDITIONALLY_ELIGIBLE:  '#d97706',
    RESTRICTED:              '#dc2626',
  }[verdict.status] || '#3730a3'

  const statusBg = {
    ELIGIBLE:                '#f0fdf4',
    CONDITIONALLY_ELIGIBLE:  '#fffbeb',
    RESTRICTED:              '#fef2f2',
  }[verdict.status] || '#eff6ff'

  const riskColor = { LOW: '#16a34a', MODERATE: '#d97706', HIGH: '#dc2626' }[risk.level] || '#64748b'

  function row (label, value) {
    return `<tr><td style="color:#64748b;font-size:9pt;padding:6px 10px;">${label}</td>
            <td style="font-weight:600;padding:6px 10px;">${value ?? '—'}</td></tr>`
  }

  function checkItem (item) {
    const done = item.completed
    return `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">
      <span style="color:${done ? '#16a34a' : '#dc2626'};font-weight:700;font-size:12pt;">${done ? '✓' : '✗'}</span>
      <div>
        <div style="font-weight:600;font-size:10pt;">${item.label}</div>
        <div style="font-size:9pt;color:#64748b;margin-top:2px;">${item.details || ''}</div>
      </div>
    </div>`
  }

  function pronouncementCard (p) {
    return `<div style="margin-bottom:12px;padding:10px 12px;background:#f8fafc;border-left:3px solid #3730a3;">
      <div style="font-weight:700;font-size:10pt;">${p.case_name}</div>
      <div style="font-size:9pt;color:#64748b;">${p.citation} · ${p.court} · ${p.year}</div>
      <div style="font-size:10pt;margin-top:6px;color:#1e293b;">${p.key_principle}</div>
      ${p.relevanceNote ? `<div style="font-size:9pt;color:#3730a3;margin-top:4px;font-style:italic;">↳ ${p.relevanceNote}</div>` : ''}
    </div>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Georgia',serif;color:#1a1a2e;font-size:11pt;line-height:1.5;padding:20mm 18mm}
  h2{font-size:13pt;color:#3730a3;border-bottom:1.5px solid #e2e8f0;padding-bottom:6px;margin:20px 0 12px}
  h3{font-size:11pt;color:#1e293b;margin:12px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:12px}
  th{background:#3730a3;color:#fff;padding:8px 10px;text-align:left;font-size:9pt;font-weight:600}
  td{vertical-align:top}
  .header{border-bottom:3px solid #3730a3;padding-bottom:14px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end}
  .header-left h1{font-size:19pt;color:#3730a3}
  .header-left .sub{font-size:9pt;color:#64748b;margin-top:4px}
  .header-right{font-size:8pt;color:#94a3b8;text-align:right}
  .verdict-box{background:${statusBg};border:2px solid ${statusColor};border-radius:8px;padding:16px;margin-bottom:20px}
  .verdict-box .status{font-size:14pt;font-weight:700;color:${statusColor}}
  .verdict-box .basis{font-size:9pt;color:#64748b;margin-top:4px}
  .verdict-box .reasoning{font-size:10pt;margin-top:10px}
  .verdict-box .recommendation{font-size:10pt;margin-top:8px;padding-top:8px;border-top:1px solid ${statusColor}30}
  .progress-bar{background:#e2e8f0;border-radius:4px;height:10px;margin:6px 0}
  .progress-fill{height:10px;border-radius:4px;background:${statusColor}}
  .risk-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:9pt;font-weight:700;
              background:${riskColor}22;color:${riskColor}}
  .disclaimer{font-size:8pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;line-height:1.6}
  @media print{body{padding:10mm};.verdict-box,.section{page-break-inside:avoid}}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>⚖ BAIL ELIGIBILITY REPORT</h1>
    <div class="sub">Bail Reckoner Desktop · Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
  </div>
  <div class="header-right">
    Case No: <strong>${caseData.case_number || '—'}</strong><br>
    Status: <strong>${(caseData.status || 'undertrial').toUpperCase()}</strong>
  </div>
</div>

<h2>Case Information</h2>
<table>
  <tr>${row('Prisoner Name', caseData.prisoner_name)}${row('Case Number', caseData.case_number)}</tr>
  <tr>${row('Age / Gender', `${caseData.age || '—'} / ${caseData.gender || '—'}`)
       }${row('First-Time Offender', caseData.is_first_time_offender ? 'Yes' : 'No')}</tr>
  <tr>${row('Custody Since', caseData.custody_start_date)
       }${row('Days in Custody', cp.daysServed ? `${cp.daysServed} days (${cp.humanReadableDaysServed})` : '—')}</tr>
  <tr>${row('Strictest Charge', strictest ? `${strictest.act_code} §${strictest.section_number} — ${strictest.title}` : '—')
       }${row('Max Sentence', cp.maxSentenceYears ? `${cp.maxSentenceYears} years` : (cp.hasLifeDeath ? 'Life / Death' : '—'))}</tr>
</table>

<div class="verdict-box">
  <div class="status">${verdict.label || verdict.status || 'ANALYSIS PENDING'}</div>
  <div class="basis">${verdict.basis || ''}</div>
  <div class="reasoning">${verdict.reasoning || ''}</div>
  ${verdict.recommendation ? `<div class="recommendation"><strong>Recommendation:</strong> ${verdict.recommendation}</div>` : ''}
</div>

${!cp.hasLifeDeath && cp.maxSentenceDays ? `
<h2>Custody Progress</h2>
<table>
  <tr><th>Threshold</th><th>Target Days</th><th>Days Served</th><th>Progress</th><th>Status</th></tr>
  <tr>
    <td>Half-Term Rule (§479 BNSS)</td>
    <td>${cp.halfTermDays} days</td>
    <td>${cp.daysServed}</td>
    <td>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(cp.halfTermProgress,100)}%"></div></div>
      ${cp.halfTermProgress}%
    </td>
    <td style="color:${cp.halfTermEligible ? '#16a34a' : '#dc2626'};font-weight:700">${cp.halfTermEligible ? '✓ ELIGIBLE' : 'Pending'}</td>
  </tr>
  ${caseData.is_first_time_offender ? `<tr>
    <td>1/3 Rule — First-Time Offender</td>
    <td>${cp.oneThirdDays} days</td>
    <td>${cp.daysServed}</td>
    <td>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(cp.oneThirdProgress,100)}%"></div></div>
      ${cp.oneThirdProgress}%
    </td>
    <td style="color:${cp.oneThirdEligible ? '#16a34a' : '#dc2626'};font-weight:700">${cp.oneThirdEligible ? '✓ ELIGIBLE' : 'Pending'}</td>
  </tr>` : ''}
  <tr><td>Projected Full-Term Release</td><td colspan="3">${cp.projectedReleaseDate || '—'}</td><td>—</td></tr>
</table>` : ''}

<h2>Nature of Offence</h2>
<table>
  <tr>${row('Bail Category', nature.isBailable ? '✓ Bailable (right to bail)' : '✗ Non-Bailable (judicial discretion)')
       }${row('Compoundable', nature.isCompoundable ? 'Yes' : 'No')}</tr>
  <tr>${row('Cognizable', nature.isCognizable ? 'Yes' : 'No')
       }${row('Special Statutes', nature.specialCategories?.join(', ') || 'None')}</tr>
  ${nature.twinConditionsApply ? `<tr><td colspan="2" style="color:#dc2626;font-weight:700;padding:8px 10px;">
    ⚠ Twin Conditions Apply — Public Prosecutor notice mandatory
  </td></tr>` : ''}
</table>
${nature.specialRestrictions?.length ? `<div style="background:#fef2f2;padding:10px 12px;border-radius:6px;font-size:9.5pt;color:#991b1b">
  ${nature.specialRestrictions.map(r => `<p style="margin-bottom:4px">• ${r}</p>`).join('')}
</div>` : ''}

<h2>Judge's Discretion Risk Index</h2>
<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
  <span class="risk-badge">${risk.level} RISK</span>
  <span style="font-size:10pt">Composite Score: <strong>${risk.score}/100</strong></span>
</div>
<table>
  <tr><th>Factor</th><th>Raw Score</th><th>Normalised</th><th>Weight</th></tr>
  ${risk.breakdown ? `
  <tr><td>Flight Risk</td><td>${risk.breakdown.flightRisk?.raw}/10</td><td>${risk.breakdown.flightRisk?.normalised}%</td><td>${risk.breakdown.flightRisk?.weight}</td></tr>
  <tr><td>Witness Influence</td><td>${risk.breakdown.witnessInfluence?.raw}/10</td><td>${risk.breakdown.witnessInfluence?.normalised}%</td><td>${risk.breakdown.witnessInfluence?.weight}</td></tr>
  <tr><td>Evidence Tampering</td><td>${risk.breakdown.evidenceTampering?.raw}/10</td><td>${risk.breakdown.evidenceTampering?.normalised}%</td><td>${risk.breakdown.evidenceTampering?.weight}</td></tr>
  <tr><td>Prior Convictions</td><td>${risk.breakdown.priorConvictions?.present ? 'Yes' : 'No'}</td><td>—</td><td>${risk.breakdown.priorConvictions?.impact}</td></tr>
  <tr><td>Local Ties Verified</td><td>${risk.breakdown.localTies?.verified ? 'Yes' : 'No'}</td><td>—</td><td>${risk.breakdown.localTies?.impact}</td></tr>
  ` : ''}
</table>

<h2>Procedural Pre-Requisites</h2>
${checklist.map(checkItem).join('')}

${pronouncements.length ? `
<h2>Applicable Judicial Pronouncements</h2>
${pronouncements.map(pronouncementCard).join('')}` : ''}

<div class="disclaimer">
  <strong>DISCLAIMER:</strong> This report is generated by Bail Reckoner Desktop as an informational aid and does not constitute legal advice.
  Bail eligibility is ultimately determined by the competent court exercising judicial discretion. The legal positions herein are based on
  publicly available statutory text and reported judicial decisions. Consult a qualified advocate before filing any bail application.
  Generated: ${new Date().toISOString()}
</div>

</body>
</html>`
}

// ─── PDF Generator (hidden BrowserWindow + printToPDF) ───────────────────────

async function generatePDF (htmlContent) {
  const win = new BrowserWindow({
    show: false, width: 820, height: 1120,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  try {
    await win.webContents.loadURL('about:blank')
    await win.webContents.executeJavaScript(
      `document.open(); document.write(${JSON.stringify(htmlContent)}); document.close(); void 0`
    )
    await new Promise(r => setTimeout(r, 350)) // let CSS render
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
    return pdfBuffer
  } finally {
    win.destroy()
  }
}

// ─── Register all IPC handlers ────────────────────────────────────────────────

function registerDesktopHandlers () {
  const wm = require('../windows/windowManager')

  // ── Window management ──────────────────────────────────────────────────────

  ipcMain.handle('desktop:toggleQuickLookup', async () => {
    wm.toggleQuickLookupWindow()
    return { success: true }
  })

  ipcMain.handle('desktop:openPreview', async (_e, title) => {
    wm.createPreviewWindow(title)
    return { success: true }
  })

  // ── Bail scan ──────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:runBailScan', async () => {
    const alerts = runBailScan(wm.getMainWindow())
    return { success: true, alerts }
  })

  // ── Theme ──────────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:getTheme', async () => ({
    themeSource: nativeTheme.themeSource,
    isDark:      nativeTheme.shouldUseDarkColors,
  }))

  ipcMain.handle('desktop:toggleTheme', async (_e, targetTheme) => {
    if (targetTheme && ['system', 'dark', 'light'].includes(targetTheme)) {
      nativeTheme.themeSource = targetTheme
    } else {
      const sources = ['system', 'dark', 'light']
      nativeTheme.themeSource = sources[(sources.indexOf(nativeTheme.themeSource) + 1) % sources.length]
    }
    patchState({ theme: nativeTheme.themeSource })
    const result = { themeSource: nativeTheme.themeSource, isDark: nativeTheme.shouldUseDarkColors }
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('app:theme-changed', result))
    return result
  })

  // ── Clipboard ──────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:copyToClipboard', async (_e, text) => {
    clipboard.writeText(String(text || ''))
    return { success: true }
  })

  // ── PDF Export ─────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:exportCasePDF', async (_e, caseId) => {
    const mainWin = wm.getMainWindow()
    try {
      const caseData = db.getCaseById(caseId)
      if (!caseData) return { success: false, error: 'Case not found' }

      const sections      = db.getStatutesByIds(caseData.charges_json || [])
      const pronouncements = db.listPronouncements()
      const analysis      = analyzeBailEligibility(caseData, sections, pronouncements)

      const { filePath } = await dialog.showSaveDialog(mainWin, {
        title:       'Export Bail Eligibility Report',
        defaultPath: `bail-report-${caseData.case_number?.replace(/\//g, '-')}.pdf`,
        filters:     [{ name: 'PDF Files', extensions: ['pdf'] }],
      })
      if (!filePath) return { success: false, cancelled: true }

      const html   = generateBailReportHTML(caseData, analysis)
      const pdfBuf = await generatePDF(html)
      fs.writeFileSync(filePath, pdfBuf)

      // Native notification
      if (Notification.isSupported()) {
        const n = new Notification({ title: '⚖ Report Exported', body: `PDF saved to ${path.basename(filePath)}` })
        n.on('click', () => shell.showItemInFolder(filePath))
        n.show()
      }

      return { success: true, filePath }
    } catch (err) {
      console.error('[desktop:exportCasePDF]', err)
      return { success: false, error: err.message }
    }
  })

  // ── JSON Export ────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:exportCaseJSON', async (_e, caseId) => {
    const mainWin = wm.getMainWindow()
    try {
      const caseData = db.getCaseById(caseId)
      if (!caseData) return { success: false, error: 'Case not found' }

      const { filePath } = await dialog.showSaveDialog(mainWin, {
        title:       'Export Case Record',
        defaultPath: `case-${caseData.case_number?.replace(/\//g, '-')}.json`,
        filters:     [{ name: 'JSON Files', extensions: ['json'] }],
      })
      if (!filePath) return { success: false, cancelled: true }

      fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2), 'utf8')
      shell.showItemInFolder(filePath)
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── JSON Import ────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:importCaseJSON', async () => {
    const mainWin = wm.getMainWindow()
    try {
      const { filePaths } = await dialog.showOpenDialog(mainWin, {
        title:      'Import Case Record',
        filters:    [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (!filePaths?.length) return { success: false, cancelled: true }

      const raw  = fs.readFileSync(filePaths[0], 'utf8')
      const data = JSON.parse(raw)

      // Strip the id field so it gets a new one
      const { id, created_at, updated_at, ...importData } = data
      const created = db.createCase(importData)
      return { success: true, case: created }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ── Shell helpers ──────────────────────────────────────────────────────────

  ipcMain.handle('desktop:openExternal', async (_e, url) => {
    // Safety: only allow http/https
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Only http/https URLs allowed' }
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('desktop:showInFolder', async (_e, filePath) => {
    shell.showItemInFolder(filePath)
    return { success: true }
  })
}

module.exports = { registerDesktopHandlers, runBailScan, generateBailReportHTML }
