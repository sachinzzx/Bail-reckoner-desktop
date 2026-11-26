import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useCaseList } from '../hooks/useIPC'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

function statusColor(s) {
  if (s === 'bailed')    return 'emerald'
  if (s === 'convicted') return 'rose'
  return 'amber'
}

function verdictBadge(c) {
  if (c.twin_conditions) return <Badge color="rose" size="xs">Special Bar</Badge>
  if (c.half_term_eligible) return <Badge color="emerald" size="xs">🚨 Half-Term</Badge>
  if (c.one_third_eligible) return <Badge color="amber" size="xs">1/3 FTO</Badge>
  if (c.verdict_status === 'ELIGIBLE') return <Badge color="emerald" size="xs">Bailable</Badge>
  return <span className="text-muted">Pending</span>
}

export default function CaseRegistry() {
  const { openCase, newCase, registryVersion } = useApp()
  const { data: cases, loading, refetch } = useCaseList()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [msg, setMsg] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    refetch()
  }, [registryVersion, refetch])

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const filtered = (cases || []).filter(c => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter
    const q = search.toLowerCase()
    const matchQ = !q || c.prisoner_name?.toLowerCase().includes(q) || c.case_number?.toLowerCase().includes(q)
    return matchStatus && matchQ
  })

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this case record? This cannot be undone.')) return
    setDeleting(id)
    try {
      await window.bailAPI?.db?.cases?.delete?.(id)
      showMsg('✅ Case deleted.')
      refetch()
    } catch (err) { showMsg(`❌ ${err?.message}`) }
    finally { setDeleting(null) }
  }

  const handleExportJSON = async (id, e) => {
    e.stopPropagation()
    try {
      const result = await window.bailAPI?.desktop?.exportCaseJSON?.(id)
      if (result?.success) showMsg(`✅ Exported → ${result.filePath}`)
      else if (result?.cancelled) showMsg('Export cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (err) { showMsg(`❌ ${err?.message}`) }
  }

  const handleImportJSON = async () => {
    try {
      const result = await window.bailAPI?.desktop?.importCaseJSON?.()
      if (result?.success) { showMsg('✅ Case imported into SQLite!'); refetch() }
      else if (result?.cancelled) showMsg('Import cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (err) { showMsg(`❌ ${err?.message}`) }
  }

  const handleExportPDF = async (id, e) => {
    e.stopPropagation()
    try {
      const result = await window.bailAPI?.desktop?.exportCasePDF?.(id)
      if (result?.success) showMsg(`✅ PDF saved → ${result.filePath}`)
      else if (result?.cancelled) showMsg('PDF export cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (err) { showMsg(`❌ ${err?.message}`) }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-primary">📂 Case Registry</h2>
          <p className="text-xs text-muted mt-0.5">
            {cases?.length ?? 0} undertrial records persisted in SQLite · click any row to evaluate in Bail Calculator
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={newCase}>+ New Case</Button>
          <Button size="sm" variant="secondary" onClick={handleImportJSON}>📥 Import JSON</Button>
          <Button size="sm" variant="secondary" onClick={refetch}>↻ Refresh</Button>
        </div>
      </div>

      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">{msg}</div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text" placeholder="Search by prisoner name or case number…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-primary text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-secondary text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          {['ALL', 'undertrial', 'bailed', 'convicted'].map(s => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner size={8} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted text-sm">No cases found. Add cases via the Bail Calculator.</div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {['Case #', 'Prisoner', 'Age/G', 'Custody Since', 'Served', 'Risk', 'Status', 'Bail Rule', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-muted font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => (
                <tr
                  key={c.id}
                  onClick={() => openCase(c.id)}
                  className="hover:bg-surface-2 transition-colors group cursor-pointer"
                >
                  <td className="px-3 py-2.5 font-mono text-primary font-medium">{c.case_number || `#${c.id}`}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-primary">{c.prisoner_name}</div>
                    {c.is_first_time_offender ? <span className="text-[10px] fg-emerald font-medium">First-time offender</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-secondary">{c.age ?? '—'}/{c.gender?.[0]?.toUpperCase() ?? '?'}</td>
                  <td className="px-3 py-2.5 text-secondary font-mono">{c.custody_start_date || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-primary">{c.days_served ?? 0}d</td>
                  <td className="px-3 py-2.5">
                    <Badge color={c.risk_level === 'HIGH' ? 'rose' : c.risk_level === 'MODERATE' ? 'amber' : 'emerald'} size="xs">
                      {c.risk_level || 'LOW'} ({c.risk_score ?? 0})
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={statusColor(c.status)} size="xs">{c.status || 'undertrial'}</Badge>
                  </td>
                  <td className="px-3 py-2.5">{verdictBadge(c)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                      <Button size="xs" variant="ghost" onClick={e => { e.stopPropagation(); openCase(c.id) }} title="Open in Calculator">⚖️</Button>
                      <Button size="xs" variant="ghost" onClick={e => handleExportPDF(c.id, e)} title="Export PDF">📄</Button>
                      <Button size="xs" variant="ghost" onClick={e => handleExportJSON(c.id, e)} title="Export JSON">📤</Button>
                      <Button size="xs" variant="ghost" onClick={e => handleDelete(c.id, e)} disabled={deleting === c.id} title="Delete">
                        {deleting === c.id ? <Spinner size={2} /> : '🗑'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
