import React, { useState, useCallback } from 'react'
import { useCaseList } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

function statusColor(s) {
  if (s === 'bailed')    return 'emerald'
  if (s === 'convicted') return 'rose'
  return 'amber'
}

function daysBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000))
}

export default function CaseRegistry() {
  const { data: cases, loading, refetch } = useCaseList()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [msg, setMsg] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const today = new Date().toISOString().split('T')[0]

  const filtered = (cases || []).filter(c => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter
    const q = search.toLowerCase()
    const matchQ = !q || c.prisoner_name?.toLowerCase().includes(q) || c.case_number?.toLowerCase().includes(q)
    return matchStatus && matchQ
  })

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this case record? This cannot be undone.')) return
    setDeleting(id)
    try {
      await window.bailAPI?.db?.cases?.delete?.(id)
      showMsg('✅ Case deleted.')
      refetch()
    } catch (e) { showMsg(`❌ ${e?.message}`) }
    finally { setDeleting(null) }
  }

  const handleExportJSON = async (id) => {
    try {
      const result = await window.bailAPI?.desktop?.exportCaseJSON?.(id)
      if (result?.success) showMsg(`✅ Exported → ${result.filePath}`)
      else if (result?.cancelled) showMsg('Export cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (e) { showMsg(`❌ ${e?.message}`) }
  }

  const handleImportJSON = async () => {
    try {
      const result = await window.bailAPI?.desktop?.importCaseJSON?.()
      if (result?.success) { showMsg('✅ Case imported successfully!'); refetch() }
      else if (result?.cancelled) showMsg('Import cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (e) { showMsg(`❌ ${e?.message}`) }
  }

  const handleExportPDF = async (id) => {
    try {
      const result = await window.bailAPI?.desktop?.exportCasePDF?.(id)
      if (result?.success) showMsg(`✅ PDF saved → ${result.filePath}`)
      else if (result?.cancelled) showMsg('PDF export cancelled.')
      else showMsg(`❌ ${result?.error}`)
    } catch (e) { showMsg(`❌ ${e?.message}`) }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">📂 Case Registry</h2>
          <p className="text-xs text-muted mt-0.5">
            {cases?.length ?? 0} undertrial records · searchable, filterable, importable/exportable
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleImportJSON}>📥 Import JSON</Button>
          <Button size="sm" variant="secondary" onClick={refetch}>↻ Refresh</Button>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">{msg}</div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text" placeholder="Search by name or case number…"
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
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {['Case #', 'Prisoner', 'Age/G', 'Custody Since', 'Days', 'Status', '1/2 Rule', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-muted font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const days = c.custody_start_date ? daysBetween(c.custody_start_date, today) : 0
                const chargesIds = Array.isArray(c.charges_json) ? c.charges_json : []
                const eligible = c.half_term_eligible === 1 || c.half_term_eligible === true
                return (
                  <tr key={c.id} className="hover:bg-surface-2 transition-colors group">
                    <td className="px-3 py-2.5 font-mono text-primary font-medium">{c.case_number || `#${c.id}`}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-primary">{c.prisoner_name}</div>
                      {c.is_first_time_offender ? <span className="text-[10px] text-emerald-400">First-time offender</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{c.age}/{c.gender?.[0] ?? '?'}</td>
                    <td className="px-3 py-2.5 text-secondary">{c.custody_start_date || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-primary">{days}d</td>
                    <td className="px-3 py-2.5">
                      <Badge color={statusColor(c.status)} size="xs">{c.status || 'undertrial'}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {eligible
                        ? <Badge color="rose" size="xs">🚨 Eligible</Badge>
                        : <span className="text-muted">Pending</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="xs" variant="ghost" onClick={() => handleExportPDF(c.id)} title="Export PDF">📄</Button>
                        <Button size="xs" variant="ghost" onClick={() => handleExportJSON(c.id)} title="Export JSON">📤</Button>
                        <Button size="xs" variant="ghost" onClick={() => handleDelete(c.id)} disabled={deleting === c.id} title="Delete">
                          {deleting === c.id ? <Spinner size={2} /> : '🗑'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
