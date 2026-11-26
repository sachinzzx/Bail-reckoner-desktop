import React, { useState, useEffect } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

/**
 * Precedent Detail Child Window
 * Rendered when hash starts with '#/precedent/:id' or '#preview'
 * Opens as a 920×720 child BrowserWindow
 */
export default function PrecedentPreview({ precedentId = null }) {
  const [pronouncements, setPronouncements] = useState([])
  const [selectedId, setSelectedId]         = useState(precedentId)
  const [showAll, setShowAll]               = useState(!precedentId)
  const [loading, setLoading]               = useState(true)
  const [copied, setCopied]                 = useState(null)

  useEffect(() => {
    setSelectedId(precedentId)
    setShowAll(!precedentId)
  }, [precedentId])

  useEffect(() => {
    const onHashChange = () => {
      const m = (window.location.hash || '').match(/^#\/precedent\/(\d+)/)
      if (m) { setSelectedId(Number(m[1])); setShowAll(false) }
      else { setSelectedId(null); setShowAll(true) }
    }
    const onKey = (e) => { if (e.key === 'Escape') window.close?.() }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    window.bailAPI?.db?.pronouncements?.list?.()
      .then(r => setPronouncements(r || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const copy = async (p) => {
    const text = `${p.case_name} — ${p.citation} (${p.court}, ${p.year})\n\nPrinciple: ${p.key_principle}\n\nSummary: ${p.summary || ''}`
    await window.bailAPI?.desktop?.copyToClipboard?.(text)
    setCopied(p.id); setTimeout(() => setCopied(null), 1800)
  }

  const displayed = (!showAll && selectedId)
    ? pronouncements.filter(p => p.id === selectedId)
    : pronouncements

  return (
    <div className="flex flex-col h-screen bg-bg text-primary font-sans">
      {/* Drag title bar */}
      <div className="app-drag h-10 flex items-center justify-between px-5 bg-surface border-b border-border shrink-0">
        <div className="app-no-drag flex items-center gap-2">
          <span className="text-sm">📜</span>
          <span className="text-xs font-semibold text-secondary">
            {(!showAll && selectedId && displayed[0])
              ? displayed[0].case_name
              : 'Judicial Precedents — Detail Viewer'}
          </span>
        </div>
        <div className="app-no-drag flex items-center gap-2">
          {selectedId && (
            <Button size="xs" variant="secondary" onClick={() => setShowAll(s => !s)}>
              {showAll ? 'Show Selected Only' : `Browse All (${pronouncements.length})`}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => window.close?.()}>Close</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading && (
          <div className="flex justify-center py-16"><Spinner size={6} /></div>
        )}
        {!loading && displayed.length === 0 && (
          <div className="text-center text-muted py-16">No precedents found in database.</div>
        )}
        {!loading && displayed.map(p => {
          const tags = Array.isArray(p.applicable_tags) ? p.applicable_tags
            : (typeof p.applicable_tags === 'string' ? JSON.parse(p.applicable_tags || '[]') : [])
          return (
            <div key={p.id}
              className="p-5 bg-surface border border-border rounded-xl border-l-4 border-l-indigo-500/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-primary">{p.case_name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-xs text-muted">{p.citation}</span>
                    <Badge color="indigo" size="xs">{p.court}</Badge>
                    <Badge color="slate" size="xs">{p.year}</Badge>
                  </div>
                </div>
                <Button
                  size="sm" variant="secondary"
                  onClick={() => copy(p)}
                  className="shrink-0"
                >
                  {copied === p.id ? '✅ Copied' : '📋 Copy Citation'}
                </Button>
              </div>

              <div className="mt-4 p-4 bg-surface-2 rounded-xl border border-border">
                <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Key Legal Principle</div>
                <blockquote className="text-sm text-secondary italic leading-relaxed">
                  &ldquo;{p.key_principle}&rdquo;
                </blockquote>
              </div>

              {p.summary && (
                <div className="mt-3">
                  <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Summary &amp; Judicial Context</div>
                  <p className="text-sm text-secondary leading-relaxed">{p.summary}</p>
                </div>
              )}

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map(t => <Badge key={t} color="indigo" size="xs">{t}</Badge>)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
