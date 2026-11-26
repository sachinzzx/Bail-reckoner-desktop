import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useStatutes } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

const ACT_CODES = [
  'ALL', 'IPC', 'BNS_2023', 'BNSS_2023', 'BSA_2023',
  'CYBER_IT_ACT', 'SC_ST_ACT', 'WOMEN_PROTECTION', 'POCSO_CHILDREN',
  'STATE_OFFENCES_UAPA', 'ECONOMIC_PMLA', 'FOREIGNERS_ACT',
]

const ACT_SHORT = {
  IPC: 'IPC', BNS_2023: 'BNS', BNSS_2023: 'BNSS', BSA_2023: 'BSA',
  CYBER_IT_ACT: 'IT Act', SC_ST_ACT: 'SC/ST', WOMEN_PROTECTION: 'Women',
  POCSO_CHILDREN: 'POCSO', STATE_OFFENCES_UAPA: 'UAPA',
  ECONOMIC_PMLA: 'PMLA', FOREIGNERS_ACT: 'Foreigners',
}

/* ─── Multi-Charge Selector ─────────────────────────────────────────────── */
function ChargeSelector({ selected, onToggle, statutes, loading }) {
  const [query, setQuery] = useState('')
  const [actFilter, setActFilter] = useState('ALL')

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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium badge-indigo"
            >
              <span>{ACT_SHORT[s.act_code] || s.act_code} §{s.section_number}</span>
              <span className="opacity-60">—</span>
              <span className="max-w-[130px] truncate">{s.title}</span>
              {s.is_bailable ? <Badge color="emerald" size="xs">Bailable</Badge> : <Badge color="rose" size="xs">Non-bailable</Badge>}
              {s.is_compoundable ? <Badge color="blue" size="xs">Compoundable</Badge> : null}
              <button
                type="button"
                onClick={() => onToggle(s)}
                className="ml-1 opacity-75 hover:opacity-100 font-bold cursor-pointer"
                title="Remove charge"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="Search section / title (e.g. 420, POCSO, PMLA)…"
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
        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
          {filtered.slice(0, 60).map(s => {
            const isSelected = selected.some(x => x.id === s.id)
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => onToggle(s)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-start gap-2 cursor-pointer
                  ${isSelected ? 'badge-indigo' : 'hover:bg-surface-2 text-secondary'}`}
              >
                <span className="font-mono font-semibold text-primary w-24 shrink-0 mt-0.5">
                  {ACT_SHORT[s.act_code] || s.act_code} §{s.section_number}
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
                    : s.max_punishment_years > 0
                    ? <Badge color="slate" size="xs">{s.max_punishment_years}yr max</Badge>
                    : <Badge color="cyan" size="xs">Procedural</Badge>}
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

/* ─── Verdict Banner (from real bailCalculator engine) ────────────────────── */
function VerdictBanner({ analysis }) {
  if (!analysis?.verdict) return null
  const { verdict, natureAssessment } = analysis
  const tone = verdict.status === 'ELIGIBLE'
    ? 'badge-emerald'
    : verdict.status === 'CONDITIONALLY_ELIGIBLE'
    ? 'badge-amber'
    : 'badge-rose'

  return (
    <div className={`rounded-xl p-4 space-y-2 ${tone}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-bold text-primary">{verdict.label}</div>
          <div className="text-xs opacity-90 mt-0.5 font-medium">{verdict.basis}</div>
        </div>
        {verdict.urgencyFlag && <Badge color="rose" size="xs">🚨 Immediate Filing Recommended</Badge>}
      </div>
      <p className="text-xs text-primary/90 leading-relaxed">{verdict.reasoning}</p>
      {verdict.recommendation && (
        <div className="text-xs text-secondary pt-2 border-t border-current/15 leading-relaxed">
          <strong className="text-primary">Action:</strong> {verdict.recommendation}
        </div>
      )}
      {natureAssessment?.specialRestrictions?.length > 0 && (
        <div className="pt-2 border-t border-current/15 space-y-1">
          {natureAssessment.specialRestrictions.map((r, i) => (
            <div key={i} className="text-[11px] text-primary/90">• {r}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Custody Progress Timeline (powered by bailCalculator) ──────────────── */
function CustodyTimeline({ analysis, custodyStart, isFirstTime, charges }) {
  if (!custodyStart || charges.length === 0) {
    return (
      <div className="text-center text-muted text-xs py-4">
        Select charges and custody start date to see statutory eligibility milestones
      </div>
    )
  }

  const cp = analysis?.custodyProgress
  if (!cp) return <div className="flex justify-center py-4"><Spinner size={4} /></div>

  if (cp.hasLifeDeath) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <span>
            <span className="text-muted">Days Served:</span>
            <strong className="ml-1 text-primary">{cp.daysServed} ({cp.humanReadableDaysServed})</strong>
          </span>
          <Badge color="rose" size="sm">Life / Death — §479 BNSS Half-Term Excluded</Badge>
        </div>
        <div className="text-xs text-secondary bg-surface-2 border border-border rounded-lg p-3">
          {cp.message}
        </div>
      </div>
    )
  }

  if (cp.hasProceduralOnly || !cp.maxSentenceDays) {
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-muted">Days Served:</span>
          <strong className="ml-1 text-primary">{cp.daysServed} ({cp.humanReadableDaysServed})</strong>
        </div>
        <div className="text-secondary bg-surface-2 border border-border rounded-lg p-3">
          {cp.message || 'Add a substantive offence section with a prescribed maximum sentence to calculate §479 BNSS milestones.'}
        </div>
      </div>
    )
  }

  const maxDays = cp.maxSentenceDays
  const servedPct = Math.min(100, Math.round((cp.daysServed / maxDays) * 100))
  const thirdPct  = Math.min(100, Math.round((cp.oneThirdDays / maxDays) * 100))
  const halfPct   = Math.min(100, Math.round((cp.halfTermDays / maxDays) * 100))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-surface-2 border border-border rounded-lg p-2.5">
          <div className="text-[10px] text-muted">Served</div>
          <div className="font-semibold text-primary mt-0.5">{cp.daysServed}d ({cp.humanReadableDaysServed})</div>
        </div>
        <div className="bg-surface-2 border border-border rounded-lg p-2.5">
          <div className="text-[10px] text-muted">Max Term</div>
          <div className="font-semibold text-primary mt-0.5">{cp.maxSentenceYears}yr ({maxDays}d)</div>
        </div>
        <div className="bg-surface-2 border border-border rounded-lg p-2.5">
          <div className="text-[10px] text-muted">1/3 Date (FTO)</div>
          <div className={`font-semibold mt-0.5 ${cp.oneThirdEligible ? 'fg-emerald' : 'text-primary'}`}>
            {cp.oneThirdEligibilityDate || '—'}
          </div>
          <div className="text-[10px] text-muted">{cp.oneThirdProgress}% {cp.oneThirdEligible ? '✓' : `(${cp.daysToOneThird}d)`}</div>
        </div>
        <div className="bg-surface-2 border border-border rounded-lg p-2.5">
          <div className="text-[10px] text-muted">50% Half-Term</div>
          <div className={`font-semibold mt-0.5 ${cp.halfTermEligible ? 'fg-emerald' : 'text-primary'}`}>
            {cp.halfTermEligibilityDate || '—'}
          </div>
          <div className="text-[10px] text-muted">{cp.halfTermProgress}% {cp.halfTermEligible ? '✓' : `(${cp.daysToHalfTerm}d)`}</div>
        </div>
      </div>

      {/* Visual timeline bar */}
      <div className="relative pt-1 pb-5">
        <div className="h-5 bg-surface-3 rounded-full overflow-hidden relative">
          <div
            className="progress-fill absolute left-0 top-0 h-full rounded-full bg-indigo-500/75"
            style={{ width: `${servedPct}%` }}
          />
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500" style={{ left: `${thirdPct}%` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500" style={{ left: `${halfPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted mt-1.5 relative">
          <span>0d</span>
          <span className="absolute fg-amber font-semibold" style={{ left: `${thirdPct}%`, transform: 'translateX(-50%)' }}>
            1/3 ({cp.oneThirdDays}d)
          </span>
          <span className="absolute fg-rose font-semibold" style={{ left: `${halfPct}%`, transform: 'translateX(-50%)' }}>
            ½ ({cp.halfTermDays}d)
          </span>
          <span>{cp.maxSentenceYears}yr ({cp.projectedReleaseDate})</span>
        </div>
      </div>

      {!isFirstTime && cp.oneThirdEligible && !cp.halfTermEligible && (
        <div className="text-[11px] text-muted">
          Note: 1/3rd milestone crossed, applicable only if accused qualifies as a First-Time Offender under §479 BNSS.
        </div>
      )}
    </div>
  )
}

/* ─── Prisoner Plain-Language View (powered by real analysis) ────────────── */
function PrisonerGuideView({ analysis, charges, custodyStart, isFirstTime }) {
  const verdict = analysis?.verdict
  const cp = analysis?.custodyProgress
  const nature = analysis?.natureAssessment

  const eligible = verdict?.status === 'ELIGIBLE'
  const conditional = verdict?.status === 'CONDITIONALLY_ELIGIBLE'

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-5 border-2 ${
        eligible ? 'badge-emerald border-emerald-500/40'
        : conditional ? 'badge-amber border-amber-500/40'
        : 'bg-surface-2 border-border'}`}
      >
        <div className="text-xl font-bold text-primary mb-1">
          {!charges.length
            ? 'ℹ️ Select Your Charges Above'
            : eligible
            ? '✅ You Are Likely Eligible for Bail'
            : conditional
            ? '⚖️ You May Qualify for Bail (Court Discretion)'
            : '⏳ Not Yet Eligible Under Automatic Rules'}
        </div>
        <div className="text-sm text-secondary leading-relaxed">
          {!charges.length
            ? 'Pick the sections from your FIR or chargesheet above and enter your arrest date to check your bail status.'
            : nature?.isBailable
            ? 'Your offence is Bailable. Under Indian law (§480 BNSS), police or the Magistrate must grant bail as a matter of right on submitting a bond.'
            : verdict?.reasoning || 'Enter your arrest/custody date to calculate your custody progress.'}
        </div>
      </div>

      {cp && !cp.hasLifeDeath && !cp.hasProceduralOnly && cp.maxSentenceDays > 0 && !nature?.isBailable && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-2">
          <div className="text-sm font-semibold text-primary">📅 When Will I Become Eligible?</div>
          {nature?.twinConditionsApply && (
            <div className="text-xs fg-rose font-medium">
              Note: Special statute restrictions ({nature.specialCategories.join(', ')}) apply here — you must request a bail hearing before the Special Court / High Court.
            </div>
          )}
          {isFirstTime && (
            <div className="text-sm text-secondary">
              First-Time Offender 1/3 Rule: <strong className="text-primary">
                {cp.oneThirdEligible ? `Already reached (since ${cp.oneThirdEligibilityDate})` : `${cp.humanDaysToOneThird} remaining (on ${cp.oneThirdEligibilityDate})`}
              </strong>
            </div>
          )}
          <div className="text-sm text-secondary">
            Half-Term Rule (50%): <strong className="text-primary">
              {cp.halfTermEligible ? `Already reached (since ${cp.halfTermEligibilityDate})` : `${cp.humanDaysToHalfTerm} remaining (on ${cp.halfTermEligibilityDate})`}
            </strong>
          </div>
          {custodyStart && (
            <div className="text-xs text-muted">Custody served so far: {cp.daysServed} days ({cp.humanReadableDaysServed})</div>
          )}
        </div>
      )}

      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="text-sm font-semibold text-primary mb-3">📋 Step-by-Step Documents Needed to Apply for Bail</div>
        <ul className="space-y-2 text-sm text-secondary">
          {[
            ['🪪', 'Identity Proof (Aadhaar Card / Voter ID / Passport / PAN)'],
            ['🏠', 'Proof of Residence (electricity/water bill or ration card)'],
            ['👨‍👩‍👧', 'Surety / Guarantor details with their Govt. ID & property/salary proof'],
            ['📜', 'FIR Copy, Remand Order, and Custody Certificate from Jail Superintendent'],
            ['📄', 'Bail Application drafted by your Legal Aid Advocate (free via DLSA/NALSA)'],
            ['💰', 'Bond or fine arrangement if directed by the Court'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2">
              <span className="text-base shrink-0">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="badge-amber rounded-xl p-4 text-xs leading-relaxed">
        ⚠️ This is an informational guide only. Always consult your Legal Aid lawyer (DLSA/NALSA) before filing any bail application in court.
      </div>
    </div>
  )
}

/* ─── Judge's Discretion Panel (uses real analysis.riskIndex) ──────────── */
function DiscretionPanel({ values, onChange, riskIndex }) {
  const fields = [
    { key: 'flight_risk',          label: 'Flight Risk',         desc: '1 = unlikely to abscond · 10 = severe flight risk' },
    { key: 'witness_influence',    label: 'Witness Influence',   desc: '1 = no influence · 10 = high risk of intimidation' },
    { key: 'evidence_tampering',   label: 'Evidence Tampering',  desc: '1 = low risk · 10 = high risk of destruction' },
  ]

  const composite = riskIndex?.score ?? Math.round((
    ((values.flight_risk - 1) / 9) * 0.30 +
    ((values.witness_influence - 1) / 9) * 0.25 +
    ((values.evidence_tampering - 1) / 9) * 0.25 +
    (values.prior_convictions ? 0.10 : 0) +
    (!values.local_ties ? 0.10 : 0)
  ) * 100)

  const level = riskIndex?.level ?? (composite < 35 ? 'LOW' : composite < 65 ? 'MODERATE' : 'HIGH')
  const badgeTone = level === 'LOW' ? 'badge-emerald' : level === 'MODERATE' ? 'badge-amber' : 'badge-rose'
  const fgTone    = level === 'LOW' ? 'fg-emerald'    : level === 'MODERATE' ? 'fg-amber'    : 'fg-rose'

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-4 p-3 rounded-xl ${badgeTone}`}>
        <div className="text-center min-w-[52px]">
          <div className={`text-3xl font-bold ${fgTone}`}>{composite}</div>
          <div className="text-[10px] text-muted">/ 100</div>
        </div>
        <div className="flex-1">
          <div className={`text-sm font-bold ${fgTone}`}>{level} RISK</div>
          <div className="text-xs text-muted">Weighted Judge&apos;s Discretion Index</div>
        </div>
      </div>

      {fields.map(f => (
        <div key={f.key}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-primary">{f.label}</label>
            <span className="text-xs font-bold fg-indigo">{values[f.key] || 1} / 10</span>
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

      {[
        { key: 'prior_convictions', label: 'Prior Convictions (+10 pts)', desc: 'Accused has prior criminal conviction' },
        { key: 'local_ties',        label: 'Local Ties Verified (-10 pts)', desc: 'Family / residence / employment verified' },
      ].map(f => (
        <div key={f.key} className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-primary">{f.label}</div>
            <div className="text-[10px] text-muted">{f.desc}</div>
          </div>
          <button
            type="button"
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

/* ─── Procedural Checklist (merges core 4 + engine dynamic items) ────────── */
function ProceduralChecklist({ values, onChange, engineChecklist }) {
  const baseItems = [
    { item: 'surety_bond',    label: 'Surety Bond',         details: 'Third-party guarantor bond executed' },
    { item: 'personal_bond',  label: 'Personal Bond',       details: 'Accused personal recognizance bond' },
    { item: 'fine_paid',      label: 'Fine Assessment',     details: 'Court-ordered fine assessed / paid' },
    { item: 'id_verified',    label: 'Identity Verified',   details: 'Govt. ID and address proof submitted' },
  ]

  const merged = [...baseItems]
  if (Array.isArray(engineChecklist)) {
    for (const ec of engineChecklist) {
      const idx = merged.findIndex(m => m.item === ec.item)
      if (idx >= 0) merged[idx] = ec
      else merged.push(ec)
    }
  }

  const done = merged.filter(i => values[i.item]).length
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">{done}/{merged.length} completed</span>
        <div className="w-24 h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div className="progress-fill h-full bg-emerald-500 rounded-full" style={{ width: `${merged.length ? (done / merged.length) * 100 : 0}%` }} />
        </div>
      </div>
      {merged.map(item => (
        <label key={item.item} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={!!values[item.item]}
            onChange={e => onChange(item.item, e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded accent-indigo-500 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-primary">
              {item.label}
              {item.required && <span className="ml-1.5 text-[10px] fg-rose font-semibold">Required</span>}
            </div>
            <div className="text-[10px] text-muted mt-0.5 leading-relaxed">{item.details}</div>
          </div>
          {values[item.item] && <span className="ml-auto fg-emerald text-xs font-bold shrink-0">✓</span>}
        </label>
      ))}
    </div>
  )
}

/* ─── Matched Pronouncements (from real engine) ─────────────────────────── */
function PronouncementPanel({ matchedPronouncements }) {
  const [copiedId, setCopiedId] = useState(null)

  const copy = async (p) => {
    const citation = `${p.case_name} — ${p.citation} (${p.court}, ${p.year})`
    await window.bailAPI?.desktop?.copyToClipboard?.(citation)
    setCopiedId(p.id); setTimeout(() => setCopiedId(null), 1500)
  }

  if (!matchedPronouncements || matchedPronouncements.length === 0) {
    return <div className="text-center text-muted text-xs py-4">Add charges to match applicable Supreme Court judgments.</div>
  }

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
      {matchedPronouncements.map(p => (
        <div key={p.id} className="p-3 bg-surface-2 border border-border rounded-xl space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-primary">{p.case_name}</div>
              <div className="text-[10px] text-muted">{p.citation} · {p.court} · {p.year}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="xs" variant="ghost" onClick={() => copy(p)} title="Copy citation">
                {copiedId === p.id ? '✅' : '📋'}
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => window.bailAPI?.desktop?.openPreview?.({ title: p.case_name, precedentId: p.id })}
                title="View in child window"
              >
                View ↗
              </Button>
            </div>
          </div>
          <div className="text-xs text-secondary italic leading-relaxed">&ldquo;{p.key_principle}&rdquo;</div>
          {p.relevanceNote && (
            <div className="text-[11px] fg-indigo leading-snug">↳ {p.relevanceNote}</div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Main BailCalculator page ──────────────────────────────────────────── */
export default function BailCalculator() {
  const { role, activeCaseId, setActiveCaseId, setRegistryVersion } = useApp()
  const { data: statutes, loading: statutesLoading } = useStatutes()

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
  const [savedId, setSavedId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState(null)

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4500) }

  const resetForm = useCallback(() => {
    setSavedId(null)
    setActiveCaseId(null)
    setCaseNumber('')
    setPrisonerName('')
    setAge('')
    setGender('Male')
    setCustodyStart('')
    setIsFirstTime(false)
    setSelectedCharges([])
    setDiscretion({ flight_risk: 3, witness_influence: 3, evidence_tampering: 2, prior_convictions: false, local_ties: true })
    setChecklist({ surety_bond: false, personal_bond: false, fine_paid: false, id_verified: false })
    setNotes('')
    setAnalysis(null)
  }, [setActiveCaseId])

  // Load case when activeCaseId changes (from Registry, Alert, or Notification)
  useEffect(() => {
    if (!activeCaseId || !statutes) return
    let cancelled = false
    window.bailAPI?.db?.cases?.getById?.(activeCaseId).then(c => {
      if (cancelled || !c) return
      setSavedId(c.id)
      setCaseNumber(c.case_number || '')
      setPrisonerName(c.prisoner_name || '')
      setAge(c.age ? String(c.age) : '')
      setGender(c.gender ? (c.gender.charAt(0).toUpperCase() + c.gender.slice(1).toLowerCase()) : 'Male')
      setCustodyStart(c.custody_start_date || '')
      setIsFirstTime(!!c.is_first_time_offender)
      setDiscretion({
        flight_risk:        c.flight_risk_score ?? 5,
        witness_influence:  c.witness_influence_score ?? 5,
        evidence_tampering: c.evidence_tampering_score ?? 5,
        prior_convictions:  !!c.prior_convictions,
        local_ties:         !!c.local_ties_verified,
      })
      setChecklist(c.procedural_checklist_json || { surety_bond: false, personal_bond: false, fine_paid: false, id_verified: false })
      setNotes(c.notes || '')
      const ids = Array.isArray(c.charges_json) ? c.charges_json : []
      setSelectedCharges(statutes.filter(s => ids.includes(s.id)))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [activeCaseId, statutes])

  // Real-time preview calculation via electron/engine/bailCalculator.js
  useEffect(() => {
    if (selectedCharges.length === 0) {
      setAnalysis(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await window.bailAPI?.previewBail?.({
          case_number:               caseNumber || 'PREVIEW',
          prisoner_name:             prisonerName || 'Applicant',
          age:                       age ? Number(age) : null,
          gender,
          is_first_time_offender:    isFirstTime ? 1 : 0,
          custody_start_date:        custodyStart || new Date().toISOString().split('T')[0],
          section_ids:               selectedCharges.map(s => s.id),
          flight_risk_score:         discretion.flight_risk,
          witness_influence_score:   discretion.witness_influence,
          evidence_tampering_score:  discretion.evidence_tampering,
          prior_convictions:         discretion.prior_convictions ? 1 : 0,
          local_ties_verified:       discretion.local_ties ? 1 : 0,
          procedural_checklist_json: checklist,
          notes,
        })
        if (res) setAnalysis(res)
      } catch {}
    }, 80)
    return () => clearTimeout(timer)
  }, [selectedCharges, custodyStart, isFirstTime, discretion, checklist, caseNumber, prisonerName, age, gender, notes])

  const toggleCharge = useCallback((s) => {
    setSelectedCharges(prev =>
      prev.some(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s]
    )
  }, [])

  const updateDiscretion = useCallback((k, v) => setDiscretion(d => ({ ...d, [k]: v })), [])
  const updateChecklist = useCallback((k, v) => setChecklist(c => ({ ...c, [k]: v })), [])

  const buildPayload = () => ({
    case_number:               caseNumber.trim() || `BR-${Date.now()}`,
    prisoner_name:             prisonerName.trim(),
    age:                       age ? Number(age) : null,
    gender,
    is_first_time_offender:    isFirstTime ? 1 : 0,
    custody_start_date:        custodyStart || new Date().toISOString().split('T')[0],
    charges_json:              selectedCharges.map(s => s.id),
    flight_risk_score:         discretion.flight_risk,
    witness_influence_score:   discretion.witness_influence,
    evidence_tampering_score:  discretion.evidence_tampering,
    prior_convictions:         discretion.prior_convictions ? 1 : 0,
    local_ties_verified:       discretion.local_ties ? 1 : 0,
    procedural_checklist_json: checklist,
    status:                    'undertrial',
    notes,
  })

  const handleSave = async () => {
    if (!prisonerName.trim() || selectedCharges.length === 0) {
      showMsg('⚠️ Prisoner name and at least one charge are required.'); return null
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      const res = savedId
        ? await window.bailAPI?.db?.cases?.update?.(savedId, payload)
        : await window.bailAPI?.db?.cases?.create?.(payload)

      if (res?.success && res?.data?.id) {
        setSavedId(res.data.id)
        setActiveCaseId(res.data.id)
        setCaseNumber(res.data.case_number || payload.case_number)
        setRegistryVersion(v => v + 1)
        showMsg(savedId ? `✅ Updated case #${res.data.id} in SQLite` : `✅ Saved new case #${res.data.id} to SQLite`)
        return res.data.id
      }
      showMsg(`❌ Save failed: ${res?.error || 'Unknown error'}`)
      return null
    } catch (e) {
      showMsg(`❌ Save failed: ${e?.message || e}`)
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleExportPDF = async () => {
    if (selectedCharges.length === 0) {
      showMsg('⚠️ Select at least one charge before exporting a report.'); return
    }
    setExporting(true)
    try {
      let target = savedId
      if (savedId && prisonerName.trim()) {
        await window.bailAPI?.db?.cases?.update?.(savedId, buildPayload())
      } else if (!savedId) {
        target = buildPayload()
      }
      const result = await window.bailAPI?.desktop?.exportCasePDF?.(target)
      if (result?.success) showMsg(`✅ PDF exported → ${result.filePath}`)
      else if (result?.cancelled) showMsg('PDF export cancelled.')
      else showMsg(`❌ ${result?.error || 'Export failed'}`)
    } catch (e) { showMsg(`❌ ${e?.message || e}`) }
    finally { setExporting(false) }
  }

  const handleCopySummary = async () => {
    const v = analysis?.verdict
    const cp = analysis?.custodyProgress
    const summary = [
      `BAIL ELIGIBILITY SUMMARY — ${new Date().toLocaleDateString('en-IN')}`,
      `Prisoner: ${prisonerName || '(unnamed)'} | Case: ${caseNumber || '—'} | Age: ${age || '—'} | Gender: ${gender}`,
      `Charges: ${selectedCharges.map(s => `${s.act_code} §${s.section_number}`).join(', ') || 'None'}`,
      `Verdict: ${v?.label || 'Pending'} (${v?.basis || '—'})`,
      `Custody Since: ${custodyStart || '—'} (${cp?.daysServed ?? 0} days served)`,
      `Risk Index: ${analysis?.riskIndex?.level ?? '—'} (${analysis?.riskIndex?.score ?? 0}/100)`,
      `Recommendation: ${v?.recommendation || '—'}`,
    ].join('\n')
    await window.bailAPI?.desktop?.copyToClipboard?.(summary)
    showMsg('✅ Summary copied to clipboard!')
  }

  const isPrisonerMode = role === 'prisoner'
  const isJudicial     = role === 'judicial'

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-primary">
              {isPrisonerMode ? '🤝 Bail Guide — Am I Eligible?' : '⚖️ Bail Calculator & Case Evaluator'}
            </h2>
            {savedId && <Badge color="indigo" size="xs">Case #{savedId}</Badge>}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {isPrisonerMode
              ? 'Plain-language guide to understand your bail rights under Indian law'
              : 'Real-time evaluation across IPC, BNS/BNSS/BSA 2023, and 7 Special Statutes'}
          </p>
        </div>
        {/* Action Bar */}
        <div className="flex gap-2 flex-wrap">
          {!isPrisonerMode && (
            <Button size="sm" variant="ghost" onClick={resetForm} title="Clear form">✨ New</Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleCopySummary}>📋 Copy Summary</Button>
          <Button size="sm" variant="secondary" onClick={handleExportPDF} disabled={exporting || selectedCharges.length === 0}>
            {exporting ? <Spinner size={3} /> : '📄'} Export Formal PDF
          </Button>
          {!isPrisonerMode && (
            <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size={3} /> : '💾'} {savedId ? 'Update Case' : 'Save to SQLite'}
            </Button>
          )}
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">
          {msg}
        </div>
      )}

      {/* Real-time Verdict Banner (when charges selected in standard/judicial modes) */}
      {!isPrisonerMode && analysis && <VerdictBanner analysis={analysis} />}

      {isPrisonerMode ? (
        <div className="space-y-5">
          <Card>
            <CardHeader title="📌 Select Your Charges" subtitle="Select the IPC, BNS, or Special Act sections written on your FIR / Chargesheet" />
            <ChargeSelector selected={selectedCharges} onToggle={toggleCharge} statutes={statutes} loading={statutesLoading} />
          </Card>
          <Card>
            <CardHeader title="📅 Custody Start Date" subtitle="The date you were arrested or taken into judicial custody" />
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
            <PrisonerGuideView analysis={analysis} charges={selectedCharges} custodyStart={custodyStart} isFirstTime={isFirstTime} />
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* LEFT column */}
          <div className="space-y-5">
            <Card>
              <CardHeader title="👤 Undertrial Case Details" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider">Prisoner Name *</label>
                  <input type="text" placeholder="Full name" value={prisonerName}
                    onChange={e => setPrisonerName(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] text-muted uppercase tracking-wider">Case Number</label>
                  <input type="text" placeholder="e.g. CRL/NB/2025/0178" value={caseNumber}
                    onChange={e => setCaseNumber(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
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
                  <label className="text-[10px] text-muted uppercase tracking-wider">Case Notes</label>
                  <textarea rows={2} placeholder="Investigation status, family ties, special court remarks…" value={notes} onChange={e => setNotes(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-primary text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="⚖️ Multi-Charge Selector"
                subtitle={`${selectedCharges.length} section(s) selected · strictest offence governs statutory ceiling`}
              />
              <ChargeSelector selected={selectedCharges} onToggle={toggleCharge} statutes={statutes} loading={statutesLoading} />
            </Card>

            <Card>
              <CardHeader title="📅 Custody Duration &amp; Eligibility Timeline" />
              <CustodyTimeline analysis={analysis} custodyStart={custodyStart} isFirstTime={isFirstTime} charges={selectedCharges} />
            </Card>
          </div>

          {/* RIGHT column */}
          <div className="space-y-5">
            <Card className={isJudicial ? 'ring-2 ring-violet-500/50' : ''}>
              <CardHeader
                title={`🏛️ Judge's Discretion Panel${isJudicial ? ' — Judicial Mode' : ''}`}
                subtitle="Interactive risk assessment & judicial factors"
              />
              <DiscretionPanel values={discretion} onChange={updateDiscretion} riskIndex={analysis?.riskIndex} />
            </Card>

            <Card>
              <CardHeader title="📋 Procedural Pre-requisites Checklist" subtitle="Statutory & bond compliance before filing" />
              <ProceduralChecklist values={checklist} onChange={updateChecklist} engineChecklist={analysis?.proceduralChecklist} />
            </Card>

            <Card>
              <CardHeader
                title="📜 Matched Judicial Pronouncements"
                subtitle="Supreme Court precedents auto-matched to selected charges"
              />
              <PronouncementPanel matchedPronouncements={analysis?.matchedPronouncements} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
