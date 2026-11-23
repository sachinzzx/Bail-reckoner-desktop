/**
 * Bail Calculation Engine
 *
 * Core logic for computing bail amounts and risk scores.
 * This module runs in the Main process (Node.js) so it can safely
 * access the filesystem, run heavy computation, and call the DB layer.
 *
 * All public functions are pure (or near-pure) so they can be unit-tested
 * without spinning up an Electron app.
 */

'use strict'

/**
 * Risk factors and their default weights.
 * Tune these values based on legal guidelines.
 */
const RISK_WEIGHTS = {
  priorConvictions: 0.25,
  flightRisk: 0.30,
  communityTies: -0.20,  // negative = reduces risk
  offenseSeverity: 0.35,
  employmentStatus: -0.10,
}

/**
 * Compute a numeric risk score (0–100) for a case.
 *
 * @param {object} caseData
 * @param {number} [caseData.priorConvictions=0]  Number of prior convictions
 * @param {number} [caseData.flightRisk=0]        0 (none) – 1 (high)
 * @param {number} [caseData.communityTies=0]      0 (none) – 1 (strong)
 * @param {number} [caseData.offenseSeverity=0]   0 (minor) – 1 (severe)
 * @param {number} [caseData.employmentStatus=0]  0 (unemployed) – 1 (employed)
 * @returns {{ score: number, factors: object }}
 */
function getRiskScore(caseData = {}) {
  const {
    priorConvictions = 0,
    flightRisk = 0,
    communityTies = 0,
    offenseSeverity = 0,
    employmentStatus = 0,
  } = caseData

  const normalizedPriors = Math.min(priorConvictions / 5, 1) // cap at 5 convictions

  const rawScore =
    normalizedPriors * RISK_WEIGHTS.priorConvictions +
    flightRisk * RISK_WEIGHTS.flightRisk +
    communityTies * RISK_WEIGHTS.communityTies +
    offenseSeverity * RISK_WEIGHTS.offenseSeverity +
    employmentStatus * RISK_WEIGHTS.employmentStatus

  // Normalise to 0–100, clamped
  const score = Math.round(Math.min(Math.max(rawScore * 100, 0), 100))

  return {
    score,
    riskLevel: score < 33 ? 'LOW' : score < 66 ? 'MEDIUM' : 'HIGH',
    factors: { priorConvictions, flightRisk, communityTies, offenseSeverity, employmentStatus },
  }
}

/**
 * Calculate a recommended bail amount.
 *
 * @param {object} caseData
 * @param {number} [caseData.baseAmount=10000]  Statutory base bail (₹)
 * @returns {{ recommended: number, riskScore: object, reasoning: string }}
 */
function calculateBail(caseData = {}) {
  const { baseAmount = 10000, ...rest } = caseData
  const riskResult = getRiskScore(rest)

  // Multiplier: 1× at zero risk, up to 5× at maximum risk
  const multiplier = 1 + (riskResult.score / 100) * 4
  const recommended = Math.round(baseAmount * multiplier)

  return {
    recommended,
    currency: 'INR',
    riskScore: riskResult,
    reasoning: `Base ₹${baseAmount.toLocaleString('en-IN')} × ${multiplier.toFixed(2)} risk multiplier (${riskResult.riskLevel} risk, score ${riskResult.score}/100)`,
  }
}

module.exports = { calculateBail, getRiskScore }
