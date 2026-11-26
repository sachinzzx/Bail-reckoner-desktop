import React, { useState, useEffect, useRef } from 'react'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

/**
 * Quick Lookup Floating Window
 * Rendered when hash == '#/quick-lookup' (or '#quick-lookup')
 */
export default function QuickLookup() {
  const [q, setQ]               = useState('')
  const [statutes, setStatutes] = useState([])
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(null)
  const inputRef = useRef(null)

  const closeWindow = () => window.close?.()

  // Auto-focus on mount & whenever floating window regains focus
  useEffect(() => {
    inputRef.current?.focus()
    const onFocus = () => inputRef.current?.focus()
    const onKey   = (e) => { if (e.key === 'Escape') closeWindow() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Load sections on query change (shows initial top entries when blank)
  useEffect(() => {
    const id = setTimeout(async () => {
      setLoading(true)
      try {
        const results = q.trim()
          ? await window.bailAPI?.db?.statutes?.search?.(q.trim())
          : await window.bailAPI?.db?.statutes?.list?.({})
        setStatutes(results || [])
      } catch { setStatutes([]) }
      finally { setLoading(false) }
    }, q.trim() ? 180 : 0)
    return () => clearTimeout(id)
  }, [q])

  const copy = async (s) => {
    const term = s.max_punishment_years === -1 ? 'Life/Death' : (s.max_punishment_years > 0 ? `${s.max_punishment_years}yr` : 'Procedural')
    const text = `${s.act_code} §${s.section_number} — ${s.title}. Max: ${term}. ${s.is_bailable ? 'Bailable' : 'Non-Bailable'}.`
    await window.bailAPI?.desktop?.copyToClipboard?.(text)
    setCopied(s.id); setTimeout(() => setCopied(null), 1500)
  }

  const ACT_LABEL = {
    IPC:'IPC', BNS_2023:'BNS', BNSS_2023:'BNSS', BSA_2023:'BSA',
    CYBER_IT_ACT:'IT Act', SC_ST_ACT:'SC/ST', WOMEN_PROTECTION:'Women', POCSO_CHILDREN:'POCSO',
    STATE_OFFENCES_UAPA:'UAPA', ECONOMIC_PMLA:'PMLA', FOREIGNERS_ACT:'Foreigners',
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-primary font-sans select-none overflow-hidden border border-border">
      {/* Title bar drag region */}
      <div className="app-drag h-9 flex items-center px-4 bg-surface border-b border-border shrink-0">
        <div className="app-no-drag flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-xs font-semibold text-secondary">Quick Section Lookup</span>
        </div>
        <div className="ml-auto app-no-drag flex items-center gap-2">
          <span className="text-[10px] text-muted">Esc to close</span>
          <button
            type="button"
            onClick={closeWindow}
            className="text-xs text-muted hover:text-primary px-1.5 py-0.5 rounded hover:bg-surface-2 cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search section or offence… (e.g. 302, 479, POCSO, PMLA)"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-primary text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {loading && (
          <div className="flex justify-center py-6"><Spinner size={5} /></div>
        )}
        {!loading && q && statutes.length === 0 && (
          <div className="text-center text-muted text-xs py-8">No sections found for &ldquo;{q}&rdquo;</div>
        )}
        {statutes.slice(0, 20).map(s => (
          <div key={s.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors group border border-transparent hover:border-border cursor-default">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold fg-indigo">
                  {ACT_LABEL[s.act_code] || s.act_code} §{s.section_number}
                </span>
                {s.is_bailable ? <Badge color="emerald" size="xs">Bailable</Badge> : <Badge color="rose" size="xs">Non-Bail</Badge>}
                {s.max_punishment_years === -1
                  ? <Badge color="rose" size="xs">Life/Death</Badge>
                  : s.max_punishment_years > 0
                  ? <Badge color="slate" size="xs">{s.max_punishment_years}yr</Badge>
                  : <Badge color="cyan" size="xs">Proc</Badge>}
              </div>
              <div className="text-xs font-medium text-primary mt-0.5 truncate">{s.title}</div>
              {s.description && (
                <div className="text-[10px] text-muted truncate mt-0.5">{s.description}</div>
              )}
            </div>
            <Button
              size="xs" variant="ghost"
              onClick={() => copy(s)}
              className="shrink-0 opacity-75 group-hover:opacity-100 transition-opacity"
              title="Copy section summary"
            >
              {copied === s.id ? '✅' : '📋'}
            </Button>
          </div>
        ))}
        {statutes.length > 20 && (
          <div className="text-center text-muted text-[10px] py-2">
            Showing 20 of {statutes.length} provisions — type to filter
          </div>
        )}
      </div>
    </div>
  )
}
