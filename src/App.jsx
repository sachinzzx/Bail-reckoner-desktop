import React, { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BailCalculator from './pages/BailCalculator'
import CaseRegistry from './pages/CaseRegistry'
import StatuteLibrary from './pages/StatuteLibrary'
import SystemStatus from './pages/SystemStatus'
import QuickLookup from './pages/QuickLookup'
import PrecedentPreview from './pages/PrecedentPreview'
import { Button } from './components/ui/Button'

/* ─── Hash-based "router" for secondary Electron windows ──────────────────── */
function parseWindowRoute() {
  const hash = window.location.hash || ''
  if (hash.startsWith('#/quick-lookup') || hash.startsWith('#quick-lookup')) {
    return { mode: 'quick-lookup' }
  }
  const precMatch = hash.match(/^#\/precedent\/(\d+)/)
  if (precMatch) {
    return { mode: 'preview', precedentId: Number(precMatch[1]) }
  }
  if (hash.startsWith('#preview')) {
    return { mode: 'preview', precedentId: null }
  }
  return { mode: 'main' }
}

/* ─── Sync theme in secondary BrowserWindows ──────────────────────────────── */
function SecondaryThemeSync({ children }) {
  useEffect(() => {
    window.bailAPI?.desktop?.getTheme?.().then(t => {
      if (t) document.documentElement.classList.toggle('light', !t.isDark)
    }).catch(() => {})

    const unsub = window.bailAPI?.onThemeChanged?.((t) => {
      if (t) document.documentElement.classList.toggle('light', !t.isDark)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])
  return children
}

/* ─── Keyboard Shortcuts Modal ───────────────────────────────────────────── */
function ShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const isMac = navigator.platform?.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl'
  const shortcuts = [
    [`${mod} + Shift + B`, 'Toggle Quick Section Lookup (Global OS Shortcut)'],
    [`${mod} + N`,         'New Case in Bail Calculator'],
    [`${mod} + E`,         'Export Active Case as PDF'],
    [`${mod} + Shift + S`, 'Run Statutory Bail Scan'],
    [`${mod} + Shift + D`, 'Toggle Dark / Light / System Theme'],
    ['Esc',                'Close Quick Lookup or Modal'],
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-primary">⌨️ Keyboard Shortcuts</h3>
            <p className="text-xs text-muted mt-0.5">Desktop shortcuts &amp; global hotkeys</p>
          </div>
          <Button size="xs" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="divide-y divide-border">
          {shortcuts.map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-secondary">{label}</span>
              <kbd className="px-2 py-1 text-[11px] font-mono bg-surface-2 border border-border-2 rounded-md text-primary shrink-0">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main workspace ─────────────────────────────────────────────────────── */
function MainWorkspace() {
  const { nav, isDark, shortcutsOpen, setShortcutsOpen, globalNotice } = useApp()

  // Apply theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark)
  }, [isDark])

  return (
    <div className="flex h-full bg-bg text-primary overflow-hidden relative">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {globalNotice && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-xs text-secondary shrink-0">
            {globalNotice}
          </div>
        )}
        {nav === 'dashboard'  && <Dashboard />}
        {nav === 'calculator' && <BailCalculator />}
        {nav === 'registry'   && <CaseRegistry />}
        {nav === 'library'    && <StatuteLibrary />}
        {nav === 'system'     && <SystemStatus />}
      </main>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function App() {
  const route = parseWindowRoute()

  if (route.mode === 'quick-lookup') {
    return (
      <SecondaryThemeSync>
        <QuickLookup />
      </SecondaryThemeSync>
    )
  }
  if (route.mode === 'preview') {
    return (
      <SecondaryThemeSync>
        <PrecedentPreview precedentId={route.precedentId} />
      </SecondaryThemeSync>
    )
  }

  return (
    <AppProvider>
      <MainWorkspace />
    </AppProvider>
  )
}
