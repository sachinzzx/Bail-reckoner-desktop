import React, { useState, useCallback } from 'react'
import { useStatutes, usePronouncements } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

const ACT_CODES = [
  'ALL', 'IPC', 'BNS_2023', 'BNSS_2023', 'BSA_2023',
  'CYBER_IT_ACT', 'SC_ST_ACT', 'WOMEN_PROTECTION', 'POCSO_CHILDREN',
  'STATE_OFFENCES_UAPA', 'ECONOMIC_PMLA', 'FOREIGNERS_ACT',
]

const ACT_LABELS = {
  IPC: 'IPC 1860', BNS_2023: 'BNS 2023', BNSS_2023: 'BNSS 2023', BSA_2023: 'BSA 2023',
  CYBER_IT_ACT: 'Cyber / IT Act', SC_ST_ACT: 'SC/ST Act', WOMEN_PROTECTION: 'Women Protection',
  POCSO_CHILDREN: 'POCSO', STATE_OFFENCES_UAPA: 'UAPA / State Offences',
  ECONOMIC_PMLA: 'PMLA / Economic', FOREIGNERS_ACT: 'Foreigners Act',
}

function StatutesPanel() {
  const { data: statutes, loading } = useStatutes()
  const [q, setQ] = useState('')
  const [act, setAct] = useState('ALL')
  const [bailFilter, setBailFilter] = useState('ALL') // ALL | bailable | non-bailable
  const [copied, setCopied] = useState(null)

  const filtered = (statutes || []).filter(s => {
    const matchAct = act === 'ALL' || s.act_code === act
    const matchBail = bailFilter === 'ALL' || (bailFilter === 'bailable' ? s.is_bailable : !s.is_bailable)
    const lq = q.toLowerCase()
    const matchQ = !lq || s.section_number?.toLowerCase().includes(lq)
      || s.title?.toLowerCase().includes(lq)
      || s.description?.toLowerCase().includes(lq)
    return matchAct && matchBail && matchQ
  })

  const copyCitation = async (s) => {
    const text = `${ACT_LABELS[s.act_code] || s.act_code}, Section ${s.section_number} — ${s.title}`
    await window.bailAPI?.desktop?.copyToClipboard?.(text)
    setCopied(s.id); setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text" placeholder="Search section / title / keyword…"
          value={q} onChange={e => setQ(e.target.value)}
          className="flex-1 min-w-48 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select value={act} onChange={e => setAct(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-secondary text-xs focus:outline-none cursor-pointer">
          {ACT_CODES.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Acts' : (ACT_LABELS[c] || c)}</option>)}
        </select>
        <select value={bailFilter} onChange={e => setBailFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-secondary text-xs focus:outline-none cursor-pointer">
          <option value="ALL">All (Bail Status)</option>
          <option value="bailable">Bailable Only</option>
          <option value="non-bailable">Non-Bailable Only</option>
        </select>
        <span className="self-center text-xs text-muted">{filtered.length} sections</span>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={6} /></div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.map(s => (
            <div key={s.id}
              className="p-3.5 bg-surface-2 border border-border rounded-xl hover:border-border-2 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-indigo-400">
                      {ACT_LABELS[s.act_code] || s.act_code} §{s.section_number}
                    </span>
                    {s.is_bailable
                      ? <Badge color="emerald" size="xs">Bailable</Badge>
                      : <Badge color="rose" size="xs">Non-Bailable</Badge>}
                    {s.is_compoundable && <Badge color="blue" size="xs">Compoundable</Badge>}
                    {s.is_cognizable && <Badge color="amber" size="xs">Cognizable</Badge>}
                    {s.special_category && <Badge color="violet" size="xs">{s.special_category}</Badge>}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-primary">{s.title}</div>
                  {s.description && (
                    <div className="mt-0.5 text-xs text-secondary leading-relaxed line-clamp-2">{s.description}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
                    {s.max_punishment_years === -1
                      ? <span className="text-rose-400 font-medium">Life / Death</span>
                      : s.max_punishment_years > 0
                      ? <span>Max: <strong className="text-secondary">{s.max_punishment_years}yr</strong></span>
                      : null}
                    {s.typical_fine_inr > 0 && (
                      <span>Fine: <strong className="text-secondary">₹{s.typical_fine_inr.toLocaleString('en-IN')}</strong></span>
                    )}
                    {s.default_bond_type && (
                      <span>Bond: <strong className="text-secondary">{s.default_bond_type}</strong></span>
                    )}
                  </div>
                </div>
                <Button
                  size="xs" variant="ghost"
                  onClick={() => copyCitation(s)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy citation"
                >
                  {copied === s.id ? '✅' : '📋'}
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted text-xs py-16">No sections found for your filters</div>
          )}
        </div>
      )}
    </div>
  )
}

function PrecedentsPanel() {
  const { data: pronouncements, loading } = usePronouncements()
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(null)

  const filtered = (pronouncements || []).filter(p => {
    const lq = q.toLowerCase()
    return !lq || p.case_name?.toLowerCase().includes(lq)
      || p.citation?.toLowerCase().includes(lq)
      || p.key_principle?.toLowerCase().includes(lq)
      || p.summary?.toLowerCase().includes(lq)
  })

  const copy = async (p) => {
    const text = `${p.case_name} — ${p.citation} (${p.court}, ${p.year}). Principle: ${p.key_principle}`
    await window.bailAPI?.desktop?.copyToClipboard?.(text)
    setCopied(p.id); setTimeout(() => setCopied(null), 1500)
  }

  const courtColors = { 'Supreme Court of India': 'indigo', 'High Court': 'violet' }

  return (
    <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
      <input
        type="text" placeholder="Search case name, citation, principle…"
        value={q} onChange={e => setQ(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={6} /></div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {filtered.map(p => {
            const tags = Array.isArray(p.applicable_tags) ? p.applicable_tags
              : (typeof p.applicable_tags === 'string' ? JSON.parse(p.applicable_tags || '[]') : [])
            return (
              <div key={p.id}
                className="p-4 bg-surface-2 border border-border rounded-xl hover:border-border-2 transition-colors group border-l-4 border-l-indigo-500/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-primary">{p.case_name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted font-mono">{p.citation}</span>
                      <Badge color={courtColors[p.court] || 'slate'} size="xs">{p.court}</Badge>
                      <Badge color="slate" size="xs">{p.year}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="xs" variant="ghost" onClick={() => copy(p)} title="Copy citation">
                      {copied === p.id ? '✅' : '📋'}
                    </Button>
                    <Button size="xs" variant="ghost"
                      onClick={() => window.bailAPI?.desktop?.openPreview?.(p.case_name)}
                      title="Open in preview window">↗</Button>
                  </div>
                </div>
                <blockquote className="mt-3 pl-3 border-l-2 border-indigo-500/40 text-xs text-secondary italic leading-relaxed">
                  "{p.key_principle}"
                </blockquote>
                {p.summary && (
                  <div className="mt-2 text-xs text-muted leading-relaxed line-clamp-2">{p.summary}</div>
                )}
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map(t => <Badge key={t} color="indigo" size="xs">{t}</Badge>)}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-muted text-xs py-12">No pronouncements match</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function StatuteLibrary() {
  const [tab, setTab] = useState('statutes')

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4 fade-in">
      <div>
        <h2 className="text-lg font-semibold text-primary">📚 Statute & Precedent Library</h2>
        <p className="text-xs text-muted mt-0.5">IPC 1860 · BNS/BNSS/BSA 2023 · 7 Special Statutes · Supreme Court Judgments</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-xl self-start">
        {[
          { id: 'statutes',      label: '📖 Statutes & Sections' },
          { id: 'precedents',    label: '⚖️ Judicial Precedents' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
              ${tab === t.id ? 'bg-surface text-primary shadow-sm border border-border' : 'text-muted hover:text-secondary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'statutes'   && <StatutesPanel />}
      {tab === 'precedents' && <PrecedentsPanel />}
    </div>
  )
}
