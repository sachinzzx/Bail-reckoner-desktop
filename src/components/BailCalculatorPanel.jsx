/**
 * BailCalculatorPanel
 *
 * A minimal UI that calls window.bailAPI.calculateBail() to demonstrate
 * the full IPC round-trip through the bail engine.
 */

import React, { useState } from 'react'

const DEFAULT_INPUTS = {
  baseAmount: 10000,
  priorConvictions: 0,
  flightRisk: 0.3,
  communityTies: 0.5,
  offenseSeverity: 0.4,
  employmentStatus: 0.7,
}

const RISK_COLORS = {
  LOW: 'text-emerald-400 bg-emerald-900',
  MEDIUM: 'text-amber-400 bg-amber-900',
  HIGH: 'text-red-400 bg-red-900',
}

export default function BailCalculatorPanel() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(field, value) {
    setInputs(prev => ({ ...prev, [field]: Number(value) }))
  }

  async function handleCalculate() {
    setLoading(true)
    setError(null)
    try {
      if (!window.bailAPI) throw new Error('window.bailAPI is not available.')
      const res = await window.bailAPI.calculateBail(inputs)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const riskLevel = result?.riskScore?.riskLevel ?? null

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-lg">⚖️</span>
        <h2 className="font-semibold text-slate-100">Bail Calculator</h2>
        <span className="ml-auto text-xs text-slate-500">bail:calculate IPC channel</span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <SliderInput
          label="Base Amount (₹)"
          field="baseAmount"
          value={inputs.baseAmount}
          min={1000} max={100000} step={1000}
          onChange={handleChange}
          display={v => `₹${Number(v).toLocaleString('en-IN')}`}
        />
        <SliderInput
          label="Prior Convictions"
          field="priorConvictions"
          value={inputs.priorConvictions}
          min={0} max={10} step={1}
          onChange={handleChange}
          display={v => `${v}`}
        />
        <SliderInput
          label="Flight Risk"
          field="flightRisk"
          value={inputs.flightRisk}
          min={0} max={1} step={0.05}
          onChange={handleChange}
          display={v => `${Math.round(v * 100)}%`}
        />
        <SliderInput
          label="Community Ties"
          field="communityTies"
          value={inputs.communityTies}
          min={0} max={1} step={0.05}
          onChange={handleChange}
          display={v => `${Math.round(v * 100)}%`}
        />
        <SliderInput
          label="Offense Severity"
          field="offenseSeverity"
          value={inputs.offenseSeverity}
          min={0} max={1} step={0.05}
          onChange={handleChange}
          display={v => `${Math.round(v * 100)}%`}
        />
        <SliderInput
          label="Employment"
          field="employmentStatus"
          value={inputs.employmentStatus}
          min={0} max={1} step={0.05}
          onChange={handleChange}
          display={v => `${Math.round(v * 100)}%`}
        />
      </div>

      {/* Calculate button */}
      <button
        onClick={handleCalculate}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
      >
        {loading ? 'Calculating…' : 'Calculate Bail'}
      </button>

      {/* Result */}
      {result && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
          <div className="flex items-baseline gap-3 justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Recommended Bail</p>
              <p className="text-2xl font-bold text-amber-300">
                ₹{result.recommended.toLocaleString('en-IN')}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${RISK_COLORS[riskLevel]}`}>
              {riskLevel} RISK
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  riskLevel === 'LOW' ? 'bg-emerald-500' : riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${result.riskScore.score}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-10 text-right">{result.riskScore.score}/100</span>
          </div>
          <p className="text-xs text-slate-500 italic">{result.reasoning}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-3 text-sm text-red-300 font-mono">
          {error}
        </div>
      )}
    </div>
  )
}

function SliderInput({ label, field, value, min, max, step, onChange, display }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <label className="text-xs text-slate-400">{label}</label>
        <span className="text-xs font-mono text-slate-300">{display(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(field, e.target.value)}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-indigo-500 cursor-pointer"
      />
    </div>
  )
}
