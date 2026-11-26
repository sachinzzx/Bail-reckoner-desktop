import React, { useState, useEffect, useRef } from 'react'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

/**
 * Quick Lookup Floating Window
 * Rendered when hash == '#quick-lookup'
 * 520×420 frameless, always-on-top — just the lookup UI
 */
export default function QuickLookup() {
  const [q, setQ]           = useState('')
  const [statutes, setStatutes] = useState([])
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(null)
  const inputRef = useRef(null)

  // Auto-focus
  useEffect(() => { inputRef.current?.focus() }, [])

  // Load on query change (debounced)
  useEffect(() => {
    if (!q.trim()) { setStatutes([]); return }
    const id = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await window.bailAPI?.db?.statutes?.search?.(q.trim())
        setStatutes(results || [])
      } catch { setStatutes([]) }
      finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  const copy = async (s) => {
    const text = `${s.act_code} §${s.section_number} — ${s.title}. Max: ${s.max_punishment_years === -1 ? 'Life/Death' : s.max_punishment_years + 'yr'}. ${s.is_bailable ? 'Bailable' : 'Non-Bailable'}.`
    await window.bailAPI?.desktop?.copyToClipboard?.(text)
    setCopied(s.id); setTimeout(() => setCopied(null), 1500)
  }

  const ACT_LABEL = { IPC:'IPC', BNS_2023:'BNS', BNSS_2023:'BNSS', BSA_2023:'BSA',
    CYBER_IT_ACT:'IT Act', SC_ST_ACT:'SC/ST', WOMEN_PROTECTION:'Women', POCSO_CHILDREN:'POCSO',
    STATE_OFFENCES_UAPA:'UAPA', ECONOMIC_PMLA:'PMLA', FOREIGNERS_ACT:'Foreigners' }

  return (
    <div className="flex flex-col h-screen bg-bg text-primary font-sans select-none overflow-hidden">
      {/* Title bar drag region */}
      <div className="app-drag h-9 flex items-center px-4 bg-surface border-b border-border shrink-0">
        <div className="app-no-drag flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-xs font-semibold text-secondary">Quick Section Lookup</span>
        </div>
        <div className="ml-auto app-no-drag">
          <span className="text-[10px] text-muted">Press Esc to close</span>
        </div>
      </div>

      {/* Search input */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type section number or keyword… (e.g. 302, theft, POCSO)"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && window.close?.()}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-primary text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {loading && (
          <div className="flex justify-center py-6"><Spinner size={5} /></div>
        )}
        {!loading && q && statutes.length === 0 && (
          <div className="text-center text-muted text-xs py-8">No sections found for "{q}"</div>
        )}
        {!loading && !q && (
          <div className="text-center text-muted text-xs py-8">
            Start typing to search across IPC, BNS 2023, BNSS 2023, BSA 2023, and all Special Acts
          </div>
        )}
        {statutes.slice(0, 15).map(s => (
          <div key={s.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors group border border-transparent hover:border-border cursor-default">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-indigo-400">
                  {ACT_LABEL[s.act_code] || s.act_code} §{s.section_number}
                </span>
                {s.is_bailable ? <Badge color="emerald" size="xs">Bail</Badge> : <Badge color="rose" size="xs">Non-Bail</Badge>}
                {s.max_punishment_years === -1
                  ? <Badge color="rose" size="xs">Life/Death</Badge>
                  : s.max_punishment_years > 0
                  ? <Badge color="slate" size="xs">{s.max_punishment_years}yr</Badge>
                  : null}
              </div>
              <div className="text-xs font-medium text-primary mt-0.5 truncate">{s.title}</div>
              {s.description && (
                <div className="text-[10px] text-muted truncate mt-0.5">{s.description}</div>
              )}
            </div>
            <Button
              size="xs" variant="ghost"
              onClick={() => copy(s)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copied === s.id ? '✅' : '📋'}
            </Button>
          </div>
        ))}
        {statutes.length > 15 && (
          <div className="text-center text-muted text-[10px] py-2">
            Showing 15 of {statutes.length} results — refine your search
          </div>
        )}
      </div>
    </div>
  )
}
