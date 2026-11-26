/**
 * Bail Reckoner – Bail Eligibility & Risk Calculation Engine
 *
 * Pure functions — no Electron or database dependencies.
 * Easily unit-tested without spinning up an Electron app.
 *
 * Key statutory rules implemented
 * ────────────────────────────────
 *  BNSS §479 / CrPC §436A   Standard Half-Term Rule  (≥ 50 % of max sentence)
 *  BNSS §479 (2nd proviso)  First-Time Offender Rule (≥ 33.3 % of max sentence)
 *  BNSS §480 / CrPC §436    Bail as of right for bailable offences
 *  PMLA §45                 Twin conditions for economic offences
 *  UAPA §43D(5)             Strict restriction – prima facie guilt test
 *  POCSO                    Special court, child-witness protection
 *  SC/ST Act §14A           No anticipatory bail
 */

'use strict'

const DAYS_PER_YEAR = 365

/** Special statute categories that impose twin bail conditions */
const TWIN_CONDITION_CATEGORIES = new Set(['PMLA', 'UAPA', 'POCSO'])

/** Risk factor weights — must sum to 1.0 */
const RISK_WEIGHTS = {
  flightRisk:         0.30,
  witnessInfluence:   0.25,
  evidenceTampering:  0.25,
  priorConvictions:   0.10,  // binary — adds 0.10 if present
  noLocalTies:        0.10,  // adds 0.10 when local_ties_verified === 0
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function parseUTCDate (input) {
  if (!input) return null
  if (input instanceof Date) {
    return isNaN(input.getTime())
      ? null
      : new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  }
  const str = String(input).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str)
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  }
  const parsed = new Date(str)
  if (isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function daysBetween (startDate, endDate = new Date()) {
  const start = parseUTCDate(startDate)
  const end   = parseUTCDate(endDate)
  if (!start || !end) return 0
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

function addDaysToDate (dateStr, days) {
  const d = parseUTCDate(dateStr)
  if (!d || !Number.isFinite(days)) return null
  d.setUTCDate(d.getUTCDate() + Math.round(days))
  return d.toISOString().split('T')[0]
}

function formatDuration (days) {
  if (!Number.isFinite(days) || days <= 0) return '0 days'
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  const d = days % 30
  const parts = []
  if (y > 0) parts.push(`${y} yr${y > 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} mo`)
  if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

// ─── Charge analysis ──────────────────────────────────────────────────────────

/**
 * Find the single most severe charge across all sections.
 * Life/Death (-1) beats any finite sentence; ties break in favour of
 * special-statute or non-bailable offences.
 */
function getStrictestCharge (sections) {
  if (!sections || sections.length === 0) return null
  const lifeOrDeath = sections.filter(s => s.max_punishment_years === -1)
  if (lifeOrDeath.length > 0) {
    return lifeOrDeath.find(s => s.special_category) || lifeOrDeath[0]
  }
  return sections.reduce((max, s) => {
    if (s.max_punishment_years > max.max_punishment_years) return s
    if (s.max_punishment_years === max.max_punishment_years) {
      if (s.special_category && !max.special_category) return s
      if (!s.is_bailable && max.is_bailable) return s
    }
    return max
  }, sections[0])
}

// ─── Risk Index ───────────────────────────────────────────────────────────────

/**
 * @param {object} caseData  Row from cases table (or equivalent)
 * @returns {{ score: number, level: string, breakdown: object }}
 */
function calculateRiskIndex (caseData) {
  const {
    flight_risk_score        = 5,
    witness_influence_score  = 5,
    evidence_tampering_score = 5,
    prior_convictions        = 0,
    local_ties_verified      = 0,
  } = caseData

  // Normalise 1-10 inputs to 0-1
  const fr = (flight_risk_score - 1)        / 9
  const wi = (witness_influence_score - 1)  / 9
  const et = (evidence_tampering_score - 1) / 9

  const rawScore =
    fr * RISK_WEIGHTS.flightRisk +
    wi * RISK_WEIGHTS.witnessInfluence +
    et * RISK_WEIGHTS.evidenceTampering +
    (prior_convictions   ? RISK_WEIGHTS.priorConvictions : 0) +
    (!local_ties_verified ? RISK_WEIGHTS.noLocalTies      : 0)

  const score = Math.min(100, Math.max(0, Math.round(rawScore * 100)))

  return {
    score,
    level: score < 35 ? 'LOW' : score < 65 ? 'MODERATE' : 'HIGH',
    breakdown: {
      flightRisk:        { raw: flight_risk_score,        normalised: Math.round(fr * 100), weight: '30%' },
      witnessInfluence:  { raw: witness_influence_score,  normalised: Math.round(wi * 100), weight: '25%' },
      evidenceTampering: { raw: evidence_tampering_score, normalised: Math.round(et * 100), weight: '25%' },
      priorConvictions:  { present: !!prior_convictions,  impact: prior_convictions   ? '+10 pts' : '0 pts',  weight: '10%' },
      localTies:         { verified: !!local_ties_verified, impact: local_ties_verified ? '0 pts'  : '+10 pts', weight: '10%' },
    },
  }
}

// ─── Nature of Offence ────────────────────────────────────────────────────────

/**
 * @param {object[]} sections  Statute rows from statutes_sections
 * @returns {{ isBailable, isCompoundable, isCognizable, specialCategories,
 *             twinConditionsApply, specialRestrictions }}
 */
function assessNature (sections) {
  if (!sections || sections.length === 0) {
    return { isBailable: false, isCompoundable: false, isCognizable: true,
             specialCategories: [], twinConditionsApply: false, specialRestrictions: [] }
  }

  // Most-restrictive-wins principle
  const isBailable    = sections.every(s => s.is_bailable    === 1 || s.is_bailable    === true)
  const isCompoundable = sections.every(s => s.is_compoundable === 1 || s.is_compoundable === true)
  const isCognizable  = sections.some (s => s.is_cognizable  === 1 || s.is_cognizable  === true)

  const specialCategories = [...new Set(
    sections.filter(s => s.special_category).map(s => s.special_category)
  )]

  const twinConditionsApply = specialCategories.some(c => TWIN_CONDITION_CATEGORIES.has(c))

  const specialRestrictions = []
  if (specialCategories.includes('PMLA')) {
    specialRestrictions.push(
      'PMLA §45 — Twin conditions apply: (i) Public Prosecutor must be given opportunity to oppose bail; ' +
      '(ii) Court must be satisfied that accused is not guilty of the offence AND is not likely to commit any ' +
      'offence while on bail. Both conditions are cumulative.')
  }
  if (specialCategories.includes('UAPA')) {
    specialRestrictions.push(
      'UAPA §43D(5) — Bail shall not be granted unless the court is satisfied that there are grounds for ' +
      'believing that the accusation against such person is prima facie not true.')
  }
  if (specialCategories.includes('POCSO')) {
    specialRestrictions.push(
      'POCSO Act — Mandatory trial before Special Court; stringent scrutiny of bail to protect the child ' +
      'victim/witness; accused must demonstrate no likelihood of tampering with evidence or intimidating the child.')
  }
  if (specialCategories.includes('SC_ST')) {
    specialRestrictions.push(
      'SC/ST (Prevention of Atrocities) Act §14A — No anticipatory bail; Sessions Court has exclusive ' +
      'trial jurisdiction. Bail opposed by State is treated with heightened caution.')
  }

  return { isBailable, isCompoundable, isCognizable, specialCategories, twinConditionsApply, specialRestrictions }
}

// ─── Custody Progress ─────────────────────────────────────────────────────────

/**
 * @param {object} caseData
 * @param {object[]} sections
 * @returns {object}  Detailed custody / threshold breakdown
 */
function calculateCustodyProgress (caseData, sections) {
  const daysServed = daysBetween(caseData.custody_start_date)
  const strictest  = getStrictestCharge(sections)

  if (!strictest) return { daysServed, hasLifeDeath: false, error: 'No charge data found.' }

  const hasLifeDeath = strictest.max_punishment_years === -1

  if (hasLifeDeath) {
    return {
      daysServed,
      humanReadableDaysServed: formatDuration(daysServed),
      hasLifeDeath: true,
      halfTermEligible: false,
      oneThirdEligible: false,
      message: 'Statutory half-term / one-third rules do not apply to offences carrying life imprisonment or death sentence.',
    }
  }

  const maxYears = strictest.max_punishment_years
  if (!maxYears || maxYears <= 0) {
    return {
      daysServed,
      humanReadableDaysServed: formatDuration(daysServed),
      hasLifeDeath:            false,
      hasProceduralOnly:       true,
      maxSentenceYears:        0,
      maxSentenceDays:         0,
      halfTermDays:            0,
      oneThirdDays:            0,
      halfTermProgress:        0,
      oneThirdProgress:        0,
      halfTermEligible:        false,
      oneThirdEligible:        false,
      message:                 'Selected provisions are procedural/evidentiary without a standalone imprisonment term; add a substantive offence section to compute statutory custody milestones.',
    }
  }

  const maxDays       = Math.round(maxYears * DAYS_PER_YEAR)
  const halfTermDays  = Math.round(maxDays / 2)
  const oneThirdDays  = Math.round(maxDays / 3)

  const halfTermProgress  = halfTermDays > 0 ? +(daysServed / halfTermDays * 100).toFixed(1) : 0
  const oneThirdProgress  = oneThirdDays > 0 ? +(daysServed / oneThirdDays * 100).toFixed(1) : 0

  return {
    daysServed,
    humanReadableDaysServed:   formatDuration(daysServed),
    hasLifeDeath:              false,
    maxSentenceYears:          maxYears,
    maxSentenceDays:           maxDays,
    halfTermDays,
    oneThirdDays,
    halfTermProgress,
    oneThirdProgress,
    halfTermEligible:          daysServed >= halfTermDays,
    oneThirdEligible:          daysServed >= oneThirdDays,
    halfTermEligibilityDate:   addDaysToDate(caseData.custody_start_date, halfTermDays),
    oneThirdEligibilityDate:   addDaysToDate(caseData.custody_start_date, oneThirdDays),
    projectedReleaseDate:      addDaysToDate(caseData.custody_start_date, maxDays),
    daysToHalfTerm:            Math.max(0, halfTermDays  - daysServed),
    daysToOneThird:            Math.max(0, oneThirdDays  - daysServed),
    humanDaysToHalfTerm:       formatDuration(Math.max(0, halfTermDays  - daysServed)),
    humanDaysToOneThird:       formatDuration(Math.max(0, oneThirdDays  - daysServed)),
  }
}

// ─── Procedural Checklist ─────────────────────────────────────────────────────

/**
 * Generate a tailored procedural checklist for the case.
 * @returns {object[]}
 */
function generateProceduralChecklist (caseData, sections, natureAssessment) {
  const done = (() => {
    let cl = caseData.procedural_checklist_json
    if (typeof cl === 'string') { try { cl = JSON.parse(cl) } catch { cl = {} } }
    return cl || {}
  })()

  const checklist = []

  // Bond type
  if (natureAssessment.isBailable) {
    checklist.push({
      item: 'personal_bond',
      label: 'Personal Bond (§480 BNSS / §436 CrPC)',
      required: true,
      completed: !!done.personal_bond,
      details: 'Accused has a statutory right to bail. Must execute a personal bond, with or without sureties, as directed by the Magistrate.',
      legalReference: 'Section 480 BNSS / Section 436 CrPC',
    })
  } else {
    checklist.push({
      item: 'surety_bond',
      label: 'Surety Bond',
      required: true,
      completed: !!done.surety_bond,
      details: 'Court may require one or more sureties with verified property valuation. Government servants require prior departmental permission to act as surety.',
      legalReference: 'Section 483 BNSS / Sections 437-439 CrPC',
    })
  }

  // Identity & address verification
  checklist.push({
    item: 'id_verified',
    label: 'Identity & Address Verification',
    required: true,
    completed: !!done.id_verified,
    details: 'Court record requires certified copies of valid government ID and proof of permanent residential address.',
    documents: [
      'Aadhaar Card (original + self-attested copy)',
      'PAN Card',
      'Passport (if available)',
      'Voter ID Card',
      'Current address proof (utility bill / registered rent agreement)',
      'Two recent passport-size photographs',
    ],
  })

  // Fine compliance
  const totalFine = sections.reduce((s, sec) => s + (sec.typical_fine_inr || 0), 0)
  if (totalFine > 0) {
    checklist.push({
      item: 'fine_paid',
      label: `Fine Payment (Estimated ₹${totalFine.toLocaleString('en-IN')})`,
      required: false,
      completed: !!done.fine_paid,
      details: `Statutory fine ₹${totalFine.toLocaleString('en-IN')} based on sections charged. Actual amount determined by the court. Payment receipt to be filed.`,
      amount: totalFine,
    })
  }

  // Twin conditions – special statutes
  if (natureAssessment.twinConditionsApply) {
    checklist.push({
      item: 'pp_notice',
      label: 'Notice to Public Prosecutor (Mandatory)',
      required: true,
      completed: !!done.pp_notice,
      details: 'Statutory requirement: Public Prosecutor must be given prior notice (minimum 15 days) and opportunity to be heard before bail is granted. ED / CBI must file written objection.',
      legalReference: 'PMLA §45 / UAPA §43D',
    })
    checklist.push({
      item: 'twin_conditions',
      label: 'Court Satisfaction — Twin Conditions',
      required: true,
      completed: !!done.twin_conditions,
      details: 'Court must record satisfaction that: (i) accused is not guilty of the offence charged; AND (ii) accused is not likely to commit any offence while on bail. Both conditions are cumulative and must appear in the bail order.',
      legalReference: 'PMLA §45(1) / UAPA §43D(5)',
    })
  }

  // Passport surrender for high flight-risk
  if ((caseData.flight_risk_score || 0) >= 7) {
    checklist.push({
      item: 'passport_surrender',
      label: 'Passport Surrender',
      required: true,
      completed: !!done.passport_surrender,
      details: 'High flight-risk score. Court is likely to direct surrender of passport as a bail condition. No international travel permitted without prior leave of court.',
    })
  }

  // Periodic reporting
  if (!natureAssessment.isBailable) {
    checklist.push({
      item: 'periodic_reporting',
      label: 'Periodic Reporting to Police Station',
      required: false,
      completed: !!done.periodic_reporting,
      details: 'Court may impose a condition to report to the local police station periodically (weekly / fortnightly). Failure to report is a ground for cancellation of bail.',
    })
  }

  return checklist
}

// ─── Judicial Pronouncement Matching ─────────────────────────────────────────

function buildCaseTags (caseData, sections, custodyProgress) {
  const tags = new Set(['bail_principles', 'bail_conditions'])

  const strictest = getStrictestCharge(sections)
  if (strictest) {
    if (strictest.max_punishment_years > 0 && strictest.max_punishment_years <= 7) tags.add('under_7_years')
    if (strictest.max_punishment_years === -1) tags.add('life_death')
  }

  const specialCats = new Set(sections.filter(s => s.special_category).map(s => s.special_category))
  if (specialCats.has('PMLA'))             { tags.add('pmla'); tags.add('economic'); tags.add('twin_conditions') }
  if (specialCats.has('UAPA'))             { tags.add('uapa'); tags.add('twin_conditions') }
  if (specialCats.has('POCSO'))              tags.add('pocso')
  if (specialCats.has('WOMEN_PROTECTION'))   tags.add('women')
  if (specialCats.has('SC_ST'))              tags.add('sc_st')
  if (specialCats.has('CYBER'))              tags.add('cyber')

  if (caseData.is_first_time_offender)       tags.add('first_time_offender')
  if (caseData.flight_risk_score >= 7)       tags.add('flight_risk')

  const daysServed = daysBetween(caseData.custody_start_date)
  if (daysServed > 180)   tags.add('undertrial')
  if (daysServed > 730)   tags.add('long_incarceration')

  if (custodyProgress && !custodyProgress.hasLifeDeath) {
    if (custodyProgress.halfTermEligible) tags.add('half_term')
    if (custodyProgress.oneThirdEligible) tags.add('half_term') // also surfaces half-term judgments
  }

  if (sections.every(s => s.is_bailable)) tags.add('bailable')

  return tags
}

function matchPronouncements (caseData, sections, pronouncements, custodyProgress) {
  const caseTags = buildCaseTags(caseData, sections, custodyProgress)

  const matched = []
  for (const p of pronouncements) {
    let pTags = []
    try {
      pTags = typeof p.applicable_tags === 'string' ? JSON.parse(p.applicable_tags) : (p.applicable_tags || [])
    } catch { pTags = [] }

    const hits = pTags.filter(t => caseTags.has(t))
    if (hits.length === 0) continue

    matched.push({
      ...p,
      applicable_tags: pTags,
      matchCount: hits.length,
      matchedTags: hits,
      relevanceNote: generateRelevanceNote(hits, caseData, custodyProgress),
    })
  }

  return matched.sort((a, b) => b.matchCount - a.matchCount).slice(0, 5)
}

function generateRelevanceNote (matchedTags, caseData, cp) {
  const reasons = []
  if (matchedTags.includes('half_term') && cp?.halfTermEligible)
    reasons.push(`Accused has served ${cp.halfTermProgress}% — past the 50% threshold (§479 BNSS / §436A CrPC).`)
  if (matchedTags.includes('pmla'))
    reasons.push('PMLA offences charged — PMLA §45 twin conditions govern bail.')
  if (matchedTags.includes('uapa'))
    reasons.push('UAPA offences charged — §43D(5) prima facie test must be satisfied before bail.')
  if (matchedTags.includes('under_7_years'))
    reasons.push('Maximum sentence ≤ 7 years — Arnesh Kumar / Satender Kumar Antil guidelines apply.')
  if (matchedTags.includes('first_time_offender'))
    reasons.push('First-time offender — BNSS §479 (2nd proviso) one-third rule may apply.')
  if (matchedTags.includes('flight_risk'))
    reasons.push('High flight-risk score — court will carefully weigh risk of absconding.')
  if (matchedTags.includes('undertrial') && !matchedTags.includes('half_term'))
    reasons.push('Extended undertrial detention — Hussainara Khatoon / speedy-trial principles apply.')
  if (matchedTags.includes('twin_conditions'))
    reasons.push('Twin-condition statutes apply — public prosecutor notice is mandatory.')
  if (reasons.length === 0 && matchedTags.includes('bail_principles'))
    reasons.push('General bail jurisprudence — bail is the rule, jail is the exception.')
  return reasons.join(' ')
}

// ─── Final Verdict ────────────────────────────────────────────────────────────

function determineVerdict (caseData, natureAssessment, custodyProgress, riskIndex) {
  const cp = custodyProgress

  // ── 1. Bailable as of right ────────────────────────────────────────────────
  if (natureAssessment.isBailable) {
    return {
      status: 'ELIGIBLE',
      label: 'ELIGIBLE (Statutory / Bailable)',
      basis: 'Bailable Offence — Right to Bail under §480 BNSS / §436 CrPC',
      reasoning: 'All charges are bailable offences. The accused has a statutory right to bail; the court cannot refuse bail for bailable offences. Bail must be granted as a matter of right upon execution of a bond.',
      recommendation: 'File bail application immediately before the Magistrate/Court of Session. Provide personal bond. Any refusal to grant bail is challengeable before the High Court under §483 BNSS.',
      urgencyFlag: false,
    }
  }

  // ── 2. Life / Death — not eligible for statutory half-term ────────────────
  if (cp && cp.hasLifeDeath) {
    if (riskIndex.level === 'LOW') {
      return {
        status: 'CONDITIONALLY_ELIGIBLE',
        label: 'CONDITIONALLY ELIGIBLE (Judicial Discretion)',
        basis: 'Judicial Discretion — Life/Death Charge, Low Risk Profile',
        reasoning: `The strictest charge carries life imprisonment or death; the statutory half-term rule does not apply. However, a low risk index (${riskIndex.score}/100) may support a discretionary bail application before the High Court.`,
        recommendation: 'File bail application under §483 BNSS before the High Court / Court of Session. Emphasise investigation completion, no flight risk, and community ties. Cite Dataram Singh and State of Rajasthan v. Balchand.',
        urgencyFlag: false,
      }
    }
    return {
      status: 'RESTRICTED',
      label: 'RESTRICTED (Special Statute / High Risk)',
      basis: 'Life/Death Sentence — Statutory Half-Term Not Applicable',
      reasoning: `Charge carries life imprisonment or death sentence. Half-term rule inapplicable. Risk index is ${riskIndex.level} (${riskIndex.score}/100). Bail is entirely at the discretion of the High Court.`,
      recommendation: 'Apply before the High Court. Focus on investigation completion, no tampering risk, and no prior flight history. Any bail conditions must be proportionate to the gravity of the charge.',
      urgencyFlag: false,
    }
  }

  // ── 3. Special statute twin conditions ────────────────────────────────────
  if (natureAssessment.twinConditionsApply) {
    return {
      status: 'RESTRICTED',
      label: 'RESTRICTED (Special Statute / High Risk)',
      basis: `Special Statute Twin Conditions (${natureAssessment.specialCategories.filter(c => TWIN_CONDITION_CATEGORIES.has(c)).join(' / ')})`,
      reasoning: `${natureAssessment.specialRestrictions.join(' ')} Even if the accused has crossed the standard half-term threshold, special statute restrictions override §479 BNSS.`,
      recommendation: 'File bail application before the designated Special Court / High Court. Serve mandatory notice on Public Prosecutor. Prepare cogent argument that accused is not guilty AND will not reoffend. Refer to K.A. Najeeb for Article 21 override if incarceration becomes unduly prolonged.',
      urgencyFlag: cp ? (cp.halfTermProgress >= 50) : false,
    }
  }

  // ── 4. Standard half-term rule (≥ 50 %) ───────────────────────────────────
  if (cp && cp.halfTermEligible) {
    return {
      status: 'ELIGIBLE',
      label: 'ELIGIBLE (Statutory / Bailable)',
      basis: 'Half-Term Rule — §479 BNSS / §436A CrPC',
      reasoning: `Accused has served ${cp.halfTermProgress}% (${cp.daysServed} days / ${cp.humanReadableDaysServed}) of the maximum sentence of ${cp.maxSentenceYears} years. This exceeds the 50% threshold (${cp.halfTermDays} days / ${formatDuration(cp.halfTermDays)}) mandated by §479 BNSS.`,
      recommendation: 'File bail application immediately citing §479 BNSS / §436A CrPC. Obtain custody certificate from Jail Superintendent confirming custody start date. This is a strong statutory entitlement — detention beyond half-term is prima facie illegal per Satender Kumar Antil (2022) 10 SCC 51.',
      urgencyFlag: true,
    }
  }

  // ── 5. First-time offender 1/3 rule ──────────────────────────────────────
  if (caseData.is_first_time_offender && cp && cp.oneThirdEligible) {
    return {
      status: 'CONDITIONALLY_ELIGIBLE',
      label: 'CONDITIONALLY ELIGIBLE (Judicial Discretion)',
      basis: 'First-Time Offender One-Third Rule — §479 BNSS (Second Proviso)',
      reasoning: `The accused is a first-time offender and has served ${cp.oneThirdProgress}% (${cp.daysServed} days) of the maximum sentence, exceeding the 1/3rd threshold (${cp.oneThirdDays} days) under the second proviso to §479 BNSS.`,
      recommendation: `File bail application citing §479 BNSS (second proviso). Produce a police certificate confirming no prior criminal record. The court retains discretion but grounds are strong. Standard half-term eligibility will be reached in ${formatDuration(cp.daysToHalfTerm)}.`,
      urgencyFlag: false,
    }
  }

  // ── 6. Not yet eligible but approaching / low risk ───────────────────────
  if (riskIndex.level === 'LOW') {
    return {
      status: 'CONDITIONALLY_ELIGIBLE',
      label: 'CONDITIONALLY ELIGIBLE (Judicial Discretion)',
      basis: 'Judicial Discretion — Low Risk Profile',
      reasoning: `Accused has served ${cp ? cp.halfTermProgress : 0}% of maximum sentence (threshold: 50%). Risk index is LOW (${riskIndex.score}/100). No special statute restrictions apply.`,
      recommendation: `Consider an interim bail application emphasising low risk, investigation cooperation, and community ties. Standard half-term eligibility expected in ${cp ? cp.humanDaysToHalfTerm : 'N/A'}.`,
      urgencyFlag: false,
    }
  }

  // ── 7. Not eligible, moderate-high risk ──────────────────────────────────
  return {
    status: 'RESTRICTED',
    label: 'RESTRICTED (Special Statute / High Risk)',
    basis: 'Insufficient Custody Period + High/Moderate Risk',
    reasoning: `Accused has served ${cp ? cp.halfTermProgress : 0}% of maximum sentence. Risk index is ${riskIndex.level} (${riskIndex.score}/100). No statutory basis for bail at present.`,
    recommendation: `Revisit bail application at the 50% mark (in ${cp ? cp.humanDaysToHalfTerm : 'N/A'}). Focus on reducing risk factors: cooperate with investigation, establish community ties, avoid witness contact. ${caseData.is_first_time_offender ? `1/3rd eligibility in ${cp ? cp.humanDaysToOneThird : 'N/A'}.` : ''}`,
    urgencyFlag: false,
  }
}

// ─── Main exported analysis function ─────────────────────────────────────────

/**
 * Full bail eligibility analysis.
 *
 * @param {object}   caseData      Case record (from DB or raw input)
 * @param {object[]} sections      Statute rows for all charges
 * @param {object[]} pronouncements All judicial pronouncement rows
 * @returns {object} Comprehensive analysis result
 */
function analyzeBailEligibility (caseData, sections, pronouncements = []) {
  const strictestCharge    = getStrictestCharge(sections)
  const chargesAnalysis    = {
    strictestCharge,
    allCharges:            sections,
    hasLifeDeathSentence:  strictestCharge?.max_punishment_years === -1,
    hasSpecialStatute:     sections.some(s => s.special_category),
    specialCategories:     [...new Set(sections.filter(s => s.special_category).map(s => s.special_category))],
  }

  const custodyProgress        = calculateCustodyProgress(caseData, sections)
  const natureAssessment       = assessNature(sections)
  const riskIndex              = calculateRiskIndex(caseData)
  const proceduralChecklist    = generateProceduralChecklist(caseData, sections, natureAssessment)
  const matchedPronouncements  = matchPronouncements(caseData, sections, pronouncements, custodyProgress)
  const verdict                = determineVerdict(caseData, natureAssessment, custodyProgress, riskIndex)

  return {
    caseId:            caseData.id,
    caseNumber:        caseData.case_number,
    prisonerName:      caseData.prisoner_name,
    analysisTimestamp: new Date().toISOString(),
    chargesAnalysis,
    custodyProgress,
    natureAssessment,
    riskIndex,
    proceduralChecklist,
    matchedPronouncements,
    verdict,
  }
}

module.exports = {
  analyzeBailEligibility,
  calculateRiskIndex,
  assessNature,
  calculateCustodyProgress,
  generateProceduralChecklist,
  matchPronouncements,
  determineVerdict,
  getStrictestCharge,
  daysBetween,
  formatDuration,
}
