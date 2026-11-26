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

const db = require('../db/database')
const {
  analyzeBailEligibility,
  calculateCustodyProgress,
  assessNature,
} = require('../engine/bailCalculator')

function esc (val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

  for (const c of cases) {
    const ids = Array.isArray(c.charges_json) ? c.charges_json : []
    if (!ids.length) continue

    const sections = db.getStatutesByIds(ids)
    const cp       = calculateCustodyProgress(c, sections)
    if (!cp || cp.hasLifeDeath || cp.error || cp.hasProceduralOnly) continue

    const nature      = assessNature(sections)
    const isFirstTime = c.is_first_time_offender === 1 || c.is_first_time_offender === true
    const caveat      = nature.twinConditionsApply
      ? ` (Special Statute restriction applies: ${nature.specialCategories.join(', ')})`
      : ''

    let eligible = false
    let reason   = ''

    if (cp.halfTermEligible) {
      eligible = true
      reason   = `${cp.halfTermProgress}% of max sentence served — §479 BNSS / §436A CrPC${caveat}`
    } else if (isFirstTime && cp.oneThirdEligible) {
      eligible = true
      reason   = `${cp.oneThirdProgress}% served (first-time offender 1/3 rule — §479 BNSS)${caveat}`
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
  const verdict        = analysis.verdict || {}
  const cp             = analysis.custodyProgress || {}
  const risk           = analysis.riskIndex || {}
  const nature         = analysis.natureAssessment || {}
  const checklist      = analysis.proceduralChecklist || []
  const pronouncements = analysis.matchedPronouncements || []
  const allCharges     = analysis.chargesAnalysis?.allCharges || []
  const strictest      = analysis.chargesAnalysis?.strictestCharge

  const statusColor = {
    ELIGIBLE:                '#15803d',
    CONDITIONALLY_ELIGIBLE:  '#b45309',
    RESTRICTED:              '#b91c1c',
  }[verdict.status] || '#3730a3'

  const statusBg = {
    ELIGIBLE:                '#f0fdf4',
    CONDITIONALLY_ELIGIBLE:  '#fffbeb',
    RESTRICTED:              '#fef2f2',
  }[verdict.status] || '#eef2ff'

  const riskColor = { LOW: '#15803d', MODERATE: '#b45309', HIGH: '#b91c1c' }[risk.level] || '#475569'

  function pairCell (label, value) {
    return `<td style="color:#64748b;font-size:8.5pt;padding:6px 10px;width:18%;background:#f8fafc;border:1px solid #e2e8f0;">${esc(label)}</td>
            <td style="font-weight:600;padding:6px 10px;width:32%;border:1px solid #e2e8f0;color:#0f172a;">${esc(value ?? '—')}</td>`
  }

  function chargeRow (s) {
    const term = s.max_punishment_years === -1
      ? 'Life / Death'
      : (s.max_punishment_years > 0 ? `${s.max_punishment_years} yrs` : 'Procedural')
    return `<tr>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;font-weight:700;color:#312e81;">${esc(s.act_code)} §${esc(s.section_number)}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(s.title)}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(term)}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;color:${s.is_bailable ? '#15803d' : '#b91c1c'};">${s.is_bailable ? 'Bailable' : 'Non-Bailable'}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${s.is_compoundable ? 'Yes' : 'No'}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(s.special_category || 'General')}</td>
    </tr>`
  }

  function checkItem (item) {
    const done = item.completed
    return `<div class="checklist-row" style="display:flex;gap:10px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;background:${done ? '#f0fdf4' : '#ffffff'};">
      <span style="color:${done ? '#15803d' : '#b91c1c'};font-weight:700;font-size:11pt;line-height:1.2;">${done ? '✓' : '☐'}</span>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:9.5pt;color:#0f172a;">${esc(item.label)}${item.required ? ' <span style="font-size:7.5pt;color:#b91c1c;">(Mandatory)</span>' : ''}</div>
        <div style="font-size:8.5pt;color:#475569;margin-top:2px;">${esc(item.details || '')}</div>
      </div>
    </div>`
  }

  function pronouncementCard (p) {
    return `<div class="pronouncement-card" style="margin-bottom:10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-left:3.5px solid #3730a3;border-radius:4px;">
      <div style="font-weight:700;font-size:9.8pt;color:#0f172a;">${esc(p.case_name)}</div>
      <div style="font-size:8.5pt;color:#64748b;margin-top:2px;">${esc(p.citation)} · ${esc(p.court)} · ${esc(p.year)}</div>
      <div style="font-size:9.2pt;margin-top:5px;color:#1e293b;font-style:italic;">"${esc(p.key_principle)}"</div>
      ${p.relevanceNote ? `<div style="font-size:8.5pt;color:#3730a3;margin-top:4px;"><strong>Relevance:</strong> ${esc(p.relevanceNote)}</div>` : ''}
    </div>`
  }

  const ageDisplay = caseData.age ? `${caseData.age} yrs` : '—'
  const genderDisplay = caseData.gender ? String(caseData.gender).toUpperCase() : '—'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1e293b; font-size: 10pt; line-height: 1.48; background: #ffffff; }
  h2 { font-size: 11.5pt; color: #312e81; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; margin: 16px 0 9px; letter-spacing: 0.02em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 10px; }
  th { background: #312e81; color: #ffffff; padding: 7px 8px; text-align: left; font-size: 8.5pt; font-weight: 600; border: 1px solid #312e81; }
  td { vertical-align: top; }
  tr, .verdict-box, .pronouncement-card, .checklist-row, .prayer-box, .section-block { page-break-inside: avoid; break-inside: avoid; }
  .header { border-bottom: 2.5px solid #312e81; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left h1 { font-size: 17pt; color: #312e81; letter-spacing: 0.03em; }
  .header-left .sub { font-size: 8.5pt; color: #64748b; margin-top: 3px; }
  .header-right { font-size: 8.5pt; color: #475569; text-align: right; line-height: 1.5; }
  .verdict-box { background: ${statusBg}; border: 1.5px solid ${statusColor}; border-left: 5px solid ${statusColor}; border-radius: 6px; padding: 13px 15px; margin-bottom: 14px; }
  .verdict-box .status { font-size: 12.5pt; font-weight: 700; color: ${statusColor}; }
  .verdict-box .basis { font-size: 9pt; color: #475569; margin-top: 3px; font-weight: 600; }
  .verdict-box .reasoning { font-size: 9.5pt; margin-top: 8px; color: #1e293b; }
  .verdict-box .recommendation { font-size: 9.2pt; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${statusColor}33; color: #0f172a; }
  .progress-bar { background: #e2e8f0; border-radius: 4px; height: 8px; margin: 4px 0; overflow: hidden; }
  .progress-fill { height: 8px; border-radius: 4px; background: ${statusColor}; }
  .risk-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 8.5pt; font-weight: 700; background: ${riskColor}1a; color: ${riskColor}; border: 1px solid ${riskColor}44; }
  .prayer-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin-top: 12px; font-size: 9.2pt; color: #1e293b; }
  .disclaimer { font-size: 7.8pt; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 18px; line-height: 1.5; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>⚖ BAIL ELIGIBILITY & DRAFT REPORT</h1>
    <div class="sub">Bail Reckoner Desktop (SIH1702) · Generated ${esc(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))} IST</div>
  </div>
  <div class="header-right">
    Case No: <strong>${esc(caseData.case_number || 'DRAFT')}</strong><br>
    Status: <strong>${esc((caseData.status || 'undertrial').toUpperCase())}</strong>
  </div>
</div>

<h2>1. Case & Undertrial Details</h2>
<table>
  <tr>${pairCell('Prisoner Name', caseData.prisoner_name)}${pairCell('Case Number', caseData.case_number || 'DRAFT')}</tr>
  <tr>${pairCell('Age / Gender', `${ageDisplay} / ${genderDisplay}`)}${pairCell('First-Time Offender', caseData.is_first_time_offender ? 'Yes (§479 BNSS 1/3 applies)' : 'No')}</tr>
  <tr>${pairCell('Custody Start Date', caseData.custody_start_date)}${pairCell('Duration in Custody', cp.daysServed !== undefined ? `${cp.daysServed} days (${cp.humanReadableDaysServed || '0 days'})` : '—')}</tr>
  <tr>${pairCell('Strictest Charge', strictest ? `${strictest.act_code} §${strictest.section_number} — ${strictest.title}` : '—')}${pairCell('Max Sentence', cp.hasLifeDeath ? 'Life / Death' : (cp.maxSentenceYears ? `${cp.maxSentenceYears} years` : 'Procedural'))}</tr>
</table>

${caseData.notes ? `<div style="font-size:8.8pt;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:8px 10px;margin-bottom:10px;"><strong>Case Notes:</strong> ${esc(caseData.notes)}</div>` : ''}

<div class="verdict-box">
  <div class="status">${esc(verdict.label || verdict.status || 'ANALYSIS PENDING')}</div>
  <div class="basis">${esc(verdict.basis || '')}</div>
  <div class="reasoning">${esc(verdict.reasoning || '')}</div>
  ${verdict.recommendation ? `<div class="recommendation"><strong>Recommended Course of Action:</strong> ${esc(verdict.recommendation)}</div>` : ''}
</div>

<h2>2. Charged Statutory Provisions (${allCharges.length})</h2>
${allCharges.length ? `
<table>
  <tr><th>Statute & Section</th><th>Offence Title</th><th>Max Term</th><th>Bail Category</th><th>Compoundable</th><th>Statute Class</th></tr>
  ${allCharges.map(chargeRow).join('')}
</table>` : '<p style="font-size:9pt;color:#64748b;margin-bottom:10px;">No sections attached.</p>'}

${!cp.hasLifeDeath && cp.maxSentenceDays > 0 ? `
<h2>3. Custody Duration & Statutory Threshold Timeline</h2>
<table>
  <tr><th>Statutory Milestone</th><th>Target Date</th><th>Threshold</th><th>Served</th><th>Progress</th><th>Status</th></tr>
  <tr>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">Half-Term Rule (§479 BNSS / §436A CrPC)</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;">${esc(cp.halfTermEligibilityDate || '—')}</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">${cp.halfTermDays} days</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">${cp.daysServed} days</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;width:110px;">
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(cp.halfTermProgress, 100)}%"></div></div>
      ${cp.halfTermProgress}%
    </td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;color:${cp.halfTermEligible ? '#15803d' : '#b45309'};font-weight:700;">${cp.halfTermEligible ? '✓ ELIGIBLE' : `${cp.daysToHalfTerm}d left`}</td>
  </tr>
  ${caseData.is_first_time_offender ? `<tr>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">First-Time Offender 1/3 Rule (§479 BNSS)</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;">${esc(cp.oneThirdEligibilityDate || '—')}</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">${cp.oneThirdDays} days</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">${cp.daysServed} days</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(cp.oneThirdProgress, 100)}%"></div></div>
      ${cp.oneThirdProgress}%
    </td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;color:${cp.oneThirdEligible ? '#15803d' : '#b45309'};font-weight:700;">${cp.oneThirdEligible ? '✓ ELIGIBLE' : `${cp.daysToOneThird}d left`}</td>
  </tr>` : ''}
  <tr>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;">Projected Full-Term Sentence Expiry</td>
    <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;" colspan="5">${esc(cp.projectedReleaseDate || '—')} (${cp.maxSentenceDays} days total max)</td>
  </tr>
</table>` : `
<h2>3. Custody Duration & Statutory Threshold Timeline</h2>
<p style="font-size:9pt;color:#475569;margin-bottom:10px;">${esc(cp.message || 'Custody timeline unavailable for current charge selection.')}</p>`}

<h2>4. Nature of Offence & Special Statute Analysis</h2>
<table>
  <tr>${pairCell('Bail Classification', nature.isBailable ? 'Bailable (Right under §480 BNSS)' : 'Non-Bailable (Judicial Discretion)')}${pairCell('Compoundable / Cognizable', `${nature.isCompoundable ? 'Compoundable' : 'Non-Compoundable'} / ${nature.isCognizable ? 'Cognizable' : 'Non-Cognizable'}`)}</tr>
  <tr>${pairCell('Special Categories', nature.specialCategories?.length ? nature.specialCategories.join(', ') : 'None')}${pairCell('Twin Conditions Apply', nature.twinConditionsApply ? 'YES — Strict Statutory Bar' : 'No')}</tr>
</table>
${nature.specialRestrictions?.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:9px 12px;border-radius:6px;font-size:8.8pt;color:#991b1b;margin-bottom:10px;">
  ${nature.specialRestrictions.map(r => `<p style="margin-bottom:4px;">• ${esc(r)}</p>`).join('')}
</div>` : ''}

<h2>5. Judicial Discretion Risk Assessment</h2>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:9px;">
  <span class="risk-badge">${esc(risk.level || 'MODERATE')} RISK</span>
  <span style="font-size:9.5pt;">Weighted Composite Score: <strong>${risk.score ?? 0} / 100</strong></span>
</div>
<table>
  <tr><th>Risk Factor</th><th>Input Value</th><th>Normalised</th><th>Weight / Impact</th></tr>
  ${risk.breakdown ? `
  <tr><td style="padding:5px 8px;border:1px solid #e2e8f0;">Flight Risk</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.flightRisk?.raw}/10</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.flightRisk?.normalised}%</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.flightRisk?.weight}</td></tr>
  <tr><td style="padding:5px 8px;border:1px solid #e2e8f0;">Witness Influence</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.witnessInfluence?.raw}/10</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.witnessInfluence?.normalised}%</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.witnessInfluence?.weight}</td></tr>
  <tr><td style="padding:5px 8px;border:1px solid #e2e8f0;">Evidence Tampering</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.evidenceTampering?.raw}/10</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.evidenceTampering?.normalised}%</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.evidenceTampering?.weight}</td></tr>
  <tr><td style="padding:5px 8px;border:1px solid #e2e8f0;">Prior Convictions</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.priorConvictions?.present ? 'Yes' : 'No'}</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">—</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.priorConvictions?.impact} (${risk.breakdown.priorConvictions?.weight})</td></tr>
  <tr><td style="padding:5px 8px;border:1px solid #e2e8f0;">Verified Local Ties</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.localTies?.verified ? 'Yes' : 'No'}</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">—</td><td style="padding:5px 8px;border:1px solid #e2e8f0;">${risk.breakdown.localTies?.impact} (${risk.breakdown.localTies?.weight})</td></tr>
  ` : ''}
</table>

<h2>6. Procedural Pre-Requisites Checklist</h2>
${checklist.map(checkItem).join('')}

${pronouncements.length ? `
<h2>7. Matched Supreme Court Pronouncements</h2>
${pronouncements.map(pronouncementCard).join('')}` : ''}

<div class="prayer-box">
  <strong>DRAFT BAIL PRAYER SUMMARY:</strong><br>
  In the matter of <strong>${esc(caseData.prisoner_name || 'the Applicant/Accused')}</strong> (Case No. <strong>${esc(caseData.case_number || '—')}</strong>), who has been in judicial custody since <strong>${esc(caseData.custody_start_date || '—')}</strong> (${cp.daysServed ?? 0} days), it is respectfully submitted that the Court may consider the statutory framework under <em>${esc(verdict.basis || 'BNSS 2023 / CrPC 1973')}</em> together with the cited Supreme Court precedents and enlarge the Applicant on bail subject to such reasonable terms and conditions as this Hon'ble Court deems fit.
</div>

<div class="disclaimer">
  <strong>DISCLAIMER:</strong> This Bail Eligibility Report &amp; Draft Application Summary is generated offline by Bail Reckoner Desktop as an informational decision-support aid for Legal Aid Providers, Judicial Authorities, and Undertrial Prisoners. Final bail determination vests exclusively with the competent Court. Generated: ${esc(new Date().toISOString())}.
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
    await win.webContents.executeJavaScript(
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
    )
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: false,
      printBackground: true,
      margins: { marginType: 'none' },
    })
    return pdfBuffer
  } finally {
    if (!win.isDestroyed()) win.destroy()
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

  ipcMain.handle('desktop:openPreview', async (_e, arg) => {
    wm.createPreviewWindow(arg)
    return { success: true }
  })

  ipcMain.handle('desktop:getWindowStatus', async () => ({
    mainOpen:        !!(wm.getMainWindow() && !wm.getMainWindow().isDestroyed()),
    quickLookupOpen: !!(wm.getQuickLookupWindow() && !wm.getQuickLookupWindow().isDestroyed() && wm.getQuickLookupWindow().isVisible()),
    previewOpen:     !!(wm.getPreviewWindow() && !wm.getPreviewWindow().isDestroyed()),
    totalWindows:    BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).length,
  }))

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
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send('app:theme-changed', result)
      }
    })
    return result
  })

  // ── Clipboard ──────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:copyToClipboard', async (_e, text) => {
    clipboard.writeText(String(text || ''))
    return { success: true }
  })

  // ── PDF Export ─────────────────────────────────────────────────────────────

  ipcMain.handle('desktop:exportCasePDF', async (_e, caseIdOrDraft) => {
    const mainWin = wm.getMainWindow()
    const parentWin = mainWin && !mainWin.isDestroyed() ? mainWin : undefined
    try {
      let caseData
      if (typeof caseIdOrDraft === 'object' && caseIdOrDraft !== null) {
        caseData = caseIdOrDraft
      } else {
        caseData = db.getCaseById(caseIdOrDraft)
      }
      if (!caseData) return { success: false, error: 'Case not found' }

      const sections       = db.getStatutesByIds(caseData.charges_json || [])
      const pronouncements = db.listPronouncements()
      const analysis       = analyzeBailEligibility(caseData, sections, pronouncements)

      const { filePath } = await dialog.showSaveDialog(parentWin, {
        title:       'Export Bail Eligibility Report',
        defaultPath: `bail-report-${(caseData.case_number || 'draft').replace(/\//g, '-')}.pdf`,
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
    const parentWin = mainWin && !mainWin.isDestroyed() ? mainWin : undefined
    try {
      const caseData = db.getCaseById(caseId)
      if (!caseData) return { success: false, error: 'Case not found' }

      const { filePath } = await dialog.showSaveDialog(parentWin, {
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
    const parentWin = mainWin && !mainWin.isDestroyed() ? mainWin : undefined
    try {
      const { filePaths } = await dialog.showOpenDialog(parentWin, {
        title:      'Import Case Record',
        filters:    [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (!filePaths?.length) return { success: false, cancelled: true }

      const raw  = fs.readFileSync(filePaths[0], 'utf8')
      const data = JSON.parse(raw)

      // Strip computed / primary key fields so it inserts cleanly
      const {
        id, created_at, updated_at,
        days_served, max_sentence_years, half_term_eligible, one_third_eligible,
        half_term_progress, twin_conditions, verdict_status, risk_score, risk_level,
        ...importData
      } = data
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
