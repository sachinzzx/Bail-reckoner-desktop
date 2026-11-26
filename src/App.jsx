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

/* ─── Hash-based "router" for secondary Electron windows ──────────────────── */
function getWindowMode() {
  const hash = window.location.hash
  if (hash.startsWith('#quick-lookup')) return 'quick-lookup'
  if (hash.startsWith('#preview'))      return 'preview'
  return 'main'
}

/* ─── Main workspace ─────────────────────────────────────────────────────── */
function MainWorkspace() {
  const { nav, isDark } = useApp()

  // Apply theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark)
  }, [isDark])

  return (
    <div className="flex h-full bg-bg text-primary overflow-hidden">
      <Sidebar />
      {nav === 'dashboard'  && <Dashboard />}
      {nav === 'calculator' && <BailCalculator />}
      {nav === 'registry'   && <CaseRegistry />}
      {nav === 'library'    && <StatuteLibrary />}
      {nav === 'system'     && <SystemStatus />}
    </div>
  )
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function App() {
  const mode = getWindowMode()

  // Secondary windows don't need the full AppProvider
  if (mode === 'quick-lookup') return <QuickLookup />
  if (mode === 'preview')      return <PrecedentPreview />

  return (
    <AppProvider>
      <MainWorkspace />
    </AppProvider>
  )
}
