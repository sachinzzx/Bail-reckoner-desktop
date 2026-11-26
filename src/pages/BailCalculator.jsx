import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useStatutes, usePronouncements } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

/* ─── helpers ──────────────────────────────────────────────────────────── */
function daysBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000))
}
function fmtDays(d) {
  if (d < 30) return `${d}d`
  const m = Math.floor(d / 30); const r = d % 30
  return r ? `${m}mo ${r}d` : `${m}mo`
}
function riskLevel(score) {
  if (score <= 30) return { label: 'LOW',      color: 'emerald' }
  if (score <= 60) return { label: 'MODERATE', color: 'amber' }
  return              { label: 'HIGH',     color: 'rose' }
}

/* ─── Multi-Charge Selector ─────────────────────────────────────────────── */
function ChargeSelector({ selected, onToggle, statutes, loading }) {
  const [query, setQuery] = useState('')
  const [actFilter, setActFilter] = useState('ALL')

  const ACT_CODES = ['ALL', 'IPC', 'BNS_2023', 'BNSS_2023', 'BSA_2023',
    'CYBER_IT_ACT', 'SC_ST_ACT', 'WOMEN_PROTECTION', 'POCSO_CHILDREN',
    'STATE_OFFENCES_UAPA', 'ECONOMIC_PMLA', 'FOREIGNERS_ACT']

  const filtered = (statutes || []).filter(s => {
    const matchAct = actFilter === 'ALL' || s.act_code === actFilter
    const q = query.toLowerCase()
    const matchQ = !q || s.section_number?.toLowerCase().includes(q)
      || s.title?.toLowerCase().includes(q)
      || s.description?.toLowerCase().includes(q)
    return matchAct && matchQ
  })

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(s => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 ring-1 ring-inset ring-indigo-500/25"
            >
              <span>{s.act_code} §{s.section_number}</span>
              <span className="opacity-70">—</span>
              <span className="max-w-[120px] truncate">{s.title}</span>
              {s.is_bailable ? <Badge color="emerald" size="xs">Bailable</Badge> : <Badge color="rose" size="xs">Non-bailable</Badge>}
              {s.is_compoundable ? <Badge color="blue" size="xs">Compoundable</Badge> : null}
              <button onClick={() => onToggle(s)} className="ml-1 hover:text-white cursor-pointer">✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="Search section / title…"
          value={query} onChange={e => setQuery(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={actFilter} onChange={e => setActFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-secondary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          {ACT_CODES.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Acts' : c}</option>)}
        </select>
      </div>

      {/* Results list */}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
          {filtered.slice(0, 60).map(s => {
            const isSelected = selected.some(x => x.id === s.id)
            return (
              <button
                key={s.id}
                onClick={() => onToggle(s)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-start gap-2 cursor-pointer
                  ${isSelected ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/30 text-indigo-300'
                               : 'hover:bg-surface-2 text-secondary'}`}
              >
                <span className="font-mono font-semibold text-primary w-24 shrink-0 mt-0.5">
                  {s.act_code === 'IPC' ? 'IPC' : s.act_code?.split('_')[0]} §{s.section_number}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary truncate">{s.title}</div>
                  <div className="text-muted text-[10px] truncate">{s.description}</div>
                </div>
                <div className="flex flex-col gap-0.5 items-end shrink-0">
                  {s.is_bailable
                    ? <Badge color="emerald" size="xs">Bailable</Badge>
                    : <Badge color="rose" size="xs">Non-bail</Badge>}
                  {s.max_punishment_years === -1
                    ? <Badge color="slate" size="xs">Life/Death</Badge>
                    : <Badge color="slate" size="xs">{s.max_punishment_years}yr max</Badge>}
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-muted text-xs py-4">No sections match your search</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Progress Timeline ──────────────────────────────────────────────────── */
function CustodyTimeline({ custodyStart, isFirstTime, charges }) {
  const today = new Date().toISOString().split('T')[0]
  const daysServed = custodyStart ? daysBetween(custodyStart, today) : 0

  const maxYears = charges.reduce((acc, s) => {
    if (s.max_punishment_years === -1) return acc // skip life/death for calc
    return Math.max(acc, s.max_punishment_years || 0)
  }, 0)
  const hasLifeDeath = charges.some(s => s.max_punishment_years === -1)
  const maxDays = maxYears * 365
  const halfTermDays = Math.floor(maxDays / 2)
  const oneThirdDays = Math.floor(maxDays / 3)

  const pct = (n) => maxDays > 0 ? Math.min(100, Math.round((n / maxDays) * 100)) : 0
  const servedPct  = pct(daysServed)
  const thirdPct   = pct(oneThirdDays)
  const halfPct    = pct(halfTermDays)

  const halfEligible   = !hasLifeDeath && maxDays > 0 && daysServed >= halfTermDays
  const thirdEligible  = !hasLifeDeath && maxDays > 0 && daysServed >= oneThirdDays

  if (!custodyStart || charges.length === 0) {
    return (
      <div className="text-center text-muted text-xs py-4">
        Select charges and custody start date to see timeline
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <div>
          <span className="text-muted">Days Served:</span>
          <span className="ml-1 font-semibold text-primary">{daysServed} ({fmtDays(daysServed)})</span>
        </div>
        {!hasLifeDeath && maxYears > 0 && <>
          <div>
            <span className="text-muted">Max Sentence:</span>
            <span className="ml-1 font-semibold text-primary">{maxYears}yr ({maxDays}d)</span>
          </div>
          <div>
            <span className="text-muted">1/3 Rule:</span>
            <span className={`ml-1 font-semibold ${thirdEligible ? 'text-emerald-400' : 'text-secondary'}`}>
              {thirdEligible ? '✓ Eligible' : `${oneThirdDays - daysServed}d remaining`}
            </span>
          </div>
          <div>
            <span className="text-muted">Half-Term:</span>
            <span className={`ml-1 font-semibold ${halfEligible ? 'text-emerald-400' : 'text-secondary'}`}>
              {halfEligible ? '✓ Eligible' : `${halfTermDays - daysServed}d remaining`}
            </span>
          </div>
        </>}
        {hasLifeDeath && (
          <Badge color="rose" size="sm">Life/Death — §479 BNSS not applicable</Badge>
        )}
      </div>

      {!hasLifeDeath && maxDays > 0 && (
        <div className="relative">
          {/* Track */}
          <div className="h-5 bg-surface-3 rounded-full overflow-hidden relative">
            {/* Served fill */}
            <div
              className="progress-fill absolute left-0 top-0 h-full rounded-full bg-indigo-500/60"
              style={{ width: `${servedPct}%` }}
            />
            {/* 1/3 marker */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400" style={{ left: `${thirdPct}%` }} />
            {/* 1/2 marker */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400" style={{ left: `${halfPct}%` }} />
          </div>

          {/* Legend */}
          <div className="flex justify-between text-[10px] text-muted mt-1 relative">
            <span>0</span>
            <span className="absolute text-amber-400 font-medium" style={{ left: `${thirdPct}%`, transform: 'translateX(-50%)' }}>1/3</span>
            <span className="absolute text-rose-400 font-medium" style={{ left: `${halfPct}%`, transform: 'translateX(-50%)' }}>½</span>
            <span>{maxYears}yr</span>
          </div>
        </div>
      )}

      {/* Eligibility verdict */}
      {!hasLifeDeath && maxDays > 0 && (
        <div className={`rounded-xl px-4 py-3 border ${
          halfEligible || (isFirstTime && thirdEligible)
            ? 'bg-emerald-500/8 border-emerald-500/25'
            : 'bg-surface-2 border-border'}`}
        >
          <div className="text-sm font-semibold text-primary">
            {halfEligible
              ? '✅ Eligible — Half-Term Rule §479 BNSS / §436A CrPC'
              : (isFirstTime && thirdEligible)
              ? '✅ Eligible — 1/3 Rule §479 BNSS (First-Time Offender)'
              : '⏳ Not yet eligible under statutory threshold'}
          </div>
          {!halfEligible && !(isFirstTime && thirdEligible) && maxDays > 0 && (
            <div className="text-xs text-muted mt-1">
              {isFirstTime
                ? `${Math.max(0, oneThirdDays - daysServed)} more days for 1/3 rule (FTO) · ${Math.max(0, halfTermDays - daysServed)} more days for half-term`
                : `${Math.max(0, halfTermDays - daysServed)} more days for half-term eligibility`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Prisoner Plain-Language View ─────────────────────────────────────── */
function PrisonerGuideView({ charges, custodyStart, isFirstTime }) {
  const today = new Date().toISOString().split('T')[0]
  const daysServed = custodyStart ? daysBetween(custodyStart, today) : 0
  const maxYears = charges.reduce((acc, s) => s.max_punishment_years === -1 ? acc : Math.max(acc, s.max_punishment_years || 0), 0)
  const hasLifeDeath = charges.some(s => s.max_punishment_years === -1)
  const maxDays = maxYears * 365
  const halfDays = Math.floor(maxDays / 2)
  const thirdDays = Math.floor(maxDays / 3)
  const halfEligible = !hasLifeDeath && maxDays > 0 && daysServed >= halfDays
  const thirdEligible = !hasLifeDeath && maxDays > 0 && daysServed >= thirdDays
  const eligible = halfEligible || (isFirstTime && thirdEligible)

  return (
    <div className="space-y-4">
      {/* Am I eligible? */}
      <div className={`rounded-2xl p-5 border-2 ${eligible ? 'border-emerald-500/50 bg-emerald-500/8' : 'border-border bg-surface-2'}`}>
        <div className="text-2xl font-bold text-primary mb-1">
          {eligible ? '✅ You May Be Eligible for Bail' : '⏳ Not Yet Eligible'}
        </div>
        <div className="text-sm text-secondary">
          {eligible
            ? 'Based on your custody duration and the charges, you have served enough time to apply for bail under Indian law.'
            : 'You have not yet served the minimum period required by law. Keep reading to learn when you will become eligible.'}
        </div>
      </div>

      {/* When eligible? */}
      {!eligible && maxDays > 0 && !hasLifeDeath && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-1">
          <div className="text-sm font-semibold text-primary">📅 When Will I Become Eligible?</div>
          {isFirstTime && (
            <div className="text-sm text-secondary">
              1/3 Rule (First-Time Offender): <strong className="text-primary">
                {Math.max(0, thirdDays - daysServed)} more days</strong>
            </div>
          )}
          <div className="text-sm text-secondary">
            Half-Term Rule: <strong className="text-primary">
              {Math.max(0, halfDays - daysServed)} more days</strong>
          </div>
        </div>
      )}

      {/* Documents needed */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="text-sm font-semibold text-primary mb-3">📋 Documents You Need to Apply for Bail</div>
        <ul className="space-y-2 text-sm text-secondary">
          {[
            ['🪪', 'Identity Proof (Aadhaar / Voter ID / Passport)'],
            ['🏠', 'Proof of Residence (utility bill or ration card)'],
            ['👨‍👩‍👧', 'Surety / Guarantor details with their ID and address proof'],
            ['📜', 'FIR Copy and Charge Sheet (from your advocate)'],
            ['📄', 'Bail Application drafted by your Legal Aid advocate'],
            ['💰', 'Information about fine or bond amount the court may require'],
            ['📞', 'Contact details of your family or local ties'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2">
              <span className="text-base shrink-0">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200">
        ⚠️ This is an informational guide only. Always consult your Legal Aid lawyer before filing any bail application in court.
      </div>
    </div>
  )
}

/* ─── Judge's Discretion Panel ──────────────────────────────────────────── */
function DiscretionPanel({ values, onChange }) {
  const fields = [
    { key: 'flight_risk',          label: 'Flight Risk',         desc: '1 = very unlikely to flee · 10 = high risk' },
    { key: 'witness_influence',    label: 'Witness Influence',   desc: '1 = no risk · 10 = strong risk of tampering' },
    { key: 'evidence_tampering',   label: 'Evidence Tampering',  desc: '1 = no history · 10 = strong risk' },
  ]

  const rawScore = (
    (values.flight_risk || 1) * 0.4 +
    (values.witness_influence || 1) * 0.35 +
    (values.evidence_tampering || 1) * 0.25
  ) * 10
  const composite = Math.round(rawScore)
  const level = riskLevel(composite)
  const levelColors = { emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
                        amber:   'text-amber-400 bg-amber-500/10 border-amber-500/25',
                        rose:    'text-rose-400 bg-rose-500/10 border-rose-500/25' }

  return (
    <div className="space-y-4">
      {/* Risk meter */}
      <div className={`flex items-center gap-4 p-3 rounded-xl border ${levelColors[level.color]}`}>
        <div className="text-center">
          <div className={`text-3xl font-bold ${level.color === 'emerald' ? 'text-emerald-400' : level.color === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>{composite}</div>
          <div className="text-[10px] text-muted">/ 100</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${level.color === 'emerald' ? 'text-emerald-400' : level.color === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>{level.label} RISK</div>
          <div className="text-xs text-muted">Judge's Discretion Index</div>
        </div>
      </div>

      {/* Sliders */}
      {fields.map(f => (
        <div key={f.key}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-primary">{f.label}</label>
            <span className="text-xs font-bold text-indigo-400">{values[f.key] || 1} / 10</span>
          </div>
          <input
            type="range" min={1} max={10} step={1}
            value={values[f.key] || 1}
            onChange={e => onChange(f.key, Number(e.target.value))}
            className="w-full"
          />
          <div className="text-[10px] text-muted mt-0.5">{f.desc}</div>
        </div>
      ))}

      {/* Toggles */}
      {[
        { key: 'prior_convictions', label: 'Prior Convictions', desc: 'Has prior criminal record' },
        { key: 'local_ties',        label: 'Local Ties Verified', desc: 'Family / address / employment confirmed' },
      ].map(f => (
        <div key={f.key} className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-primary">{f.label}</div>
            <div className="text-[10px] text-muted">{f.desc}</div>
          </div>
          <button
            onClick={() => onChange(f.key, !values[f.key])}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${values[f.key] ? 'bg-indigo-500' : 'bg-surface-3'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${values[f.key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ─── Procedural Checklist ──────────────────────────────────────────────── */
function ProceduralChecklist({ values, onChange }) {
  const items = [
    { key: 'surety_bond',    label: 'Surety Bond',         desc: 'Third-party guarantor bond executed' },
    { key: 'personal_bond',  label: 'Personal Bond',       desc: 'Accused personal recognizance bond' },
    { key: 'fine_paid',      label: 'Fine Assessment',     desc: 'Court-ordered fine assessed / paid' },
    { key: 'id_verified',    label: 'Identity Verified',   desc: 'Govt. ID and address proof submitted' },
  ]
  const done = items.filter(i => values[i.key]).length
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">{done}/{items.length} completed</span>
        <div className="w-24 h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div className="progress-fill h-full bg-emerald-500 rounded-full" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      {items.map(item => (
        <label key={item.key} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={!!values[item.key]}
            onChange={e => onChange(item.key, e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-500"
          />
          <div>
            <div className="text-xs font-medium text-primary">{item.label}</div>
            <div className="text-[10px] text-muted">{item.desc}</div>
          </div>
          {values[item.key] && <span className="ml-auto text-emerald-400 text-xs font-bold">✓</span>}
        </label>
      ))}
    </div>
  )
}

/* ─── Matched Pronouncements ────────────────────────────────────────────── */
function PronunciationPanel({ pronouncements, charges }) {
  const tags = new Set()
  charges.forEach(s => {
    if (s.is_bailable)   tags.add('bailable')
    if (s.max_punishment_years > 0 && s.max_punishment_years <= 7) tags.add('under_7_years')
    if (s.act_code === 'ECONOMIC_PMLA') tags.add('economic')
    if (s.act_code === 'WOMEN_PROTECTION') tags.add('women')
  })
  tags.add('half_term')

  const matched = (pronouncements || []).filter(p => {
    const ptags = Array.isArray(p.applicable_tags)
      ? p.applicable_tags
      : (typeof p.applicable_tags === 'string' ? JSON.parse(p.applicable_tags || '[]') : [])
    return ptags.some(t => tags.has(t))
  })

  const copy = async (p) => {
    const citation = `${p.case_name} — ${p.citation} (${p.court}, ${p.year})`
    await window.bailAPI?.desktop?.copyToClipboard?.(citation)
  }

  if (!matched.length) {
    return <div className="text-center text-muted text-xs py-4">No specific precedents matched. Add charges to filter.</div>
  }

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {matched.map(p => (
        <div key={p.id} className="p-3 bg-surface-2 border border-border rounded-xl space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-primary">{p.case_name}</div>
              <div className="text-[10px] text-muted">{p.citation} · {p.court} · {p.year}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="xs" variant="ghost" onClick={() => copy(p)} title="Copy citation">📋</Button>
              <Button size="xs" variant="ghost" onClick={() => window.bailAPI?.desktop?.openPreview?.(p.case_name)} title="View in child window">↗</Button>
            </div>
          </div>
          <div className="text-xs text-secondary italic leading-relaxed">"{p.key_principle}"</div>
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(p.applicable_tags) ? p.applicable_tags : (JSON.parse(p.applicable_tags || '[]'))).map(t => (
              <Badge key={t} color="indigo" size="xs">{t}</Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Main BailCalculator page ──────────────────────────────────────────── */
export default function BailCalculator() {
  const { role } = useApp()
  const { data: statutes, loading: statutesLoading } = useStatutes()
  const { data: pronouncements } = usePronouncements()

  const [selectedCharges, setSelectedCharges] = useState([])
  const [custodyStart, setCustodyStart] = useState('')
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [discretion, setDiscretion] = useState({
    flight_risk: 3, witness_influence: 3, evidence_tampering: 2,
    prior_convictions: false, local_ties: true,
  })
  const [checklist, setChecklist] = useState({
    surety_bond: false, personal_bond: false, fine_paid: false, id_verified: false,
  })
  const [caseNumber, setCaseNumber] = useState('')
  const [prisonerName, setPrisonerName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('Male')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savedId, setSavedId] = useState(null)
  const [msg, setMsg] = useState(null)

  const toggleCharge = useCallback((s) => {
    setSelectedCharges(prev =>
      prev.some(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s]
    )
  }, [])

  const updateDiscretion = useCallback((k, v) => {
    setDiscretion(d => ({ ...d, [k]: v }))
  }, [])

  const updateChecklist = useCallback((k, v) => {
    setChecklist(c => ({ ...c, [k]: v }))
  }, [])

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const handleSave = async () => {
    if (!prisonerName || selectedCharges.length === 0) {
      showMsg('⚠️ Prisoner name and at least one charge are required.'); return
    }
    setSaving(true)
    try {
      const payload = {
        case_number: caseNumber || `BR-${Date.now()}`,
        prisoner_name: prisonerName,
        age: Number(age) || 0,
        gender,
        is_first_time_offender: isFirstTime ? 1 : 0,
        custody_start_date: custodyStart || new Date().toISOString().split('T')[0],
        charges_json: selectedCharges.map(s => s.id),
        flight_risk_score: discretion.flight_risk,
        witness_influence_score: discretion.witness_influence,
        evidence_tampering_score: discretion.evidence_tampering,
        prior_convictions: discretion.prior_convictions ? 1 : 0,
        local_ties_verified: discretion.local_ties ? 1 : 0,
        procedural_checklist_json: checklist,
        status: 'undertrial',
        notes,
      }
      const result = await window.bailAPI?.db?.cases?.create?.(payload)
      if (result?.id) {
        setSavedId(result.id)
        showMsg(`✅ Case saved — ID #${result.id}`)
      }
    } catch (e) {
      showMsg(`❌ Save failed: ${e?.message || e}`)
    } finally { setSaving(false) }
  }

  const handleExportPDF = async () => {
    if (!savedId) { showMsg('⚠️ Save the case first before exporting PDF.'); return }
    setExporting(true)
    try {
      const result = await window.bailAPI?.desktop?.exportCasePDF?.(savedId)
      if (result?.success) showMsg(`✅ PDF exported → ${result.filePath}`)
      else if (result?.cancelled) showMsg('PDF export cancelled.')
      else showMsg(`❌ ${result?.error || 'Export failed'}`)
    } catch (e) { showMsg(`❌ ${e?.message || e}`) }
    finally { setExporting(false) }
  }

  const handleCopySummary = async () => {
    const max = selectedCharges.reduce((a, s) => s.max_punishment_years === -1 ? a : Math.max(a, s.max_punishment_years || 0), 0)
    const hasLD = selectedCharges.some(s => s.max_punishment_years === -1)
    const today = new Date().toISOString().split('T')[0]
    const days = custodyStart ? daysBetween(custodyStart, today) : 0
    const summary = [
      `BAIL ELIGIBILITY SUMMARY — ${new Date().toLocaleDateString('en-IN')}`,
      `Prisoner: ${prisonerName || '(unnamed)'} | Case: ${caseNumber || '—'} | Age: ${age} | Gender: ${gender}`,
      `Charges: ${selectedCharges.map(s => `${s.act_code} §${s.section_number}`).join(', ')}`,
      `Max Sentence: ${hasLD ? 'Life/Death' : max + ' years'}`,
      `Custody Since: ${custodyStart || '—'} (${days} days served)`,
      `First-Time Offender: ${isFirstTime ? 'Yes' : 'No'}`,
      `Half-Term: ${!hasLD && max > 0 && days >= Math.floor(max * 365 / 2) ? 'ELIGIBLE' : 'NOT YET'}`,
    ].join('\n')
    await window.bailAPI?.desktop?.copyToClipboard?.(summary)
    showMsg('✅ Summary copied to clipboard!')
  }

  const isPrisonerMode = role === 'prisoner'
  const isJudicial    = role === 'judicial'

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">
            {isPrisonerMode ? '🤝 Bail Guide — Am I Eligible?' : '⚖️ Bail Calculator & Case Evaluator'}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {isPrisonerMode
              ? 'Simple guide to understand your bail rights'
              : 'Full statutory analysis under IPC, BNS/BNSS 2023, and Special Acts'}
          </p>
        </div>
        {/* Action Bar */}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleCopySummary}>📋 Copy</Button>
          <Button size="sm" variant="secondary" onClick={handleExportPDF} disabled={exporting || !savedId}>
            {exporting ? <Spinner size={3} /> : '📄'} Export PDF
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={3} /> : '💾'} Save Case
          </Button>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">
          {msg}
        </div>
      )}

      {isPrisonerMode ? (
        /* ── Prisoner simplified view ── */
        <div className="space-y-5">
          <Card>
            <CardHeader title="📌 Select Your Charges" subtitle="Ask your legal aid lawyer which sections apply to your case" />
            <ChargeSelector selected={selectedCharges} onToggle={toggleCharge} statutes={statutes} loading={statutesLoading} />
          </Card>
          <Card>
            <CardHeader title="📅 Custody Start Date" subtitle="The date you were first taken into custody" />
            <div className="flex flex-wrap gap-4 items-center">
              <input type="date" value={custodyStart} onChange={e => setCustodyStart(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer" />
              <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                <input type="checkbox" checked={isFirstTime} onChange={e => setIsFirstTime(e.target.checked)} className="accent-indigo-500" />
                I have no prior criminal convictions (First-Time Offender)
              </label>
            </div>
          </Card>
          <Card>
            <CardHeader title="📊 Your Bail Eligibility" />
            <PrisonerGuideView charges={selectedCharges} custodyStart={custodyStart} isFirstTime={isFirstTime} />
          </Card>
        </div>
      ) : (
        /* ── Full Calculator view ── */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* LEFT column */}
          <div className="space-y-5">
            {/* Case details */}
            <Card>
              <CardHeader title="👤 Case Details" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Prisoner Name *', key: 'name', placeholder: 'Full name', value: prisonerName, setter: setPrisonerName },
                  { label: 'Case Number', key: 'casenum', placeholder: 'e.g. SC/123/2024', value: caseNumber, setter: setCaseNumber },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-muted uppercase tracking-wider">{f.label}</label>
                    <input type="text" placeholder={f.placeholder} value={f.value}
                      onChange={e => f.setter(e.target.value)}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider">Age</label>
                  <input type="number" min={1} max={120} placeholder="Age" value={age}
                    onChange={e => setAge(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider">Gender</label>
                  <select value={gender} onChange={e => setGender(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-secondary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer">
                    {['Male', 'Female', 'Transgender', 'Other'].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted uppercase tracking-wider">Custody Start Date</label>
                  <input type="date" value={custodyStart} onChange={e => setCustodyStart(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="fto" checked={isFirstTime} onChange={e => setIsFirstTime(e.target.checked)} className="accent-indigo-500" />
                  <label htmlFor="fto" className="text-xs text-secondary cursor-pointer">First-Time Offender (activates 1/3 rule under §479 BNSS)</label>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted uppercase tracking-wider">Notes</label>
                  <textarea rows={2} placeholder="Additional notes…" value={notes} onChange={e => setNotes(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-primary text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            </Card>

            {/* Charge Selector */}
            <Card>
              <CardHeader
                title="⚖️ Multi-Charge Selector"
                subtitle={`${selectedCharges.length} section(s) added`}
              />
              <ChargeSelector selected={selectedCharges} onToggle={toggleCharge} statutes={statutes} loading={statutesLoading} />
            </Card>

            {/* Custody Timeline */}
            <Card>
              <CardHeader title="📅 Custody & Eligibility Timeline" />
              <CustodyTimeline custodyStart={custodyStart} isFirstTime={isFirstTime} charges={selectedCharges} />
            </Card>
          </div>

          {/* RIGHT column */}
          <div className="space-y-5">
            {/* Judge Discretion — prominent in judicial mode */}
            <Card className={isJudicial ? 'ring-2 ring-violet-500/40' : ''}>
              <CardHeader
                title={`🏛️ Judge's Discretion Panel${isJudicial ? ' — Judicial Mode' : ''}`}
                subtitle="Interactive risk scoring factors"
              />
              <DiscretionPanel values={discretion} onChange={updateDiscretion} />
            </Card>

            {/* Procedural Checklist */}
            <Card>
              <CardHeader title="📋 Procedural Pre-requisites" subtitle="Compliance checklist before filing" />
              <ProceduralChecklist values={checklist} onChange={updateChecklist} />
            </Card>

            {/* Matched Pronouncements */}
            <Card>
              <CardHeader
                title="📜 Matched Judicial Pronouncements"
                subtitle="Automatically matched Supreme Court precedents"
              />
              <PronunciationPanel pronouncements={pronouncements} charges={selectedCharges} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
