/**
 * Global App Context — role, theme, active nav, bail-scan alerts
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext(null)

export const ROLES = [
  { id: 'legal_aid',  label: 'Legal Aid Provider',   icon: '⚖️',  color: 'indigo' },
  { id: 'judicial',   label: 'Judicial Authority',    icon: '🏛️',  color: 'violet' },
  { id: 'prisoner',   label: 'Undertrial Guide',      icon: '🤝',  color: 'emerald' },
]

export const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard & Alerts',          icon: '📊' },
  { id: 'calculator',  label: 'Bail Calculator',             icon: '⚖️'  },
  { id: 'registry',    label: 'Case Registry',               icon: '📂' },
  { id: 'library',     label: 'Statute & Precedent Library', icon: '📚' },
  { id: 'system',      label: 'Desktop APIs & System',       icon: '🖥️'  },
]

export function AppProvider({ children }) {
  const [role,      setRole]    = useState('legal_aid')
  const [nav,       setNav]     = useState('dashboard')
  const [isDark,    setIsDark]  = useState(true)
  const [alerts,    setAlerts]  = useState([])    // bail-scan results
  const [sysInfo,   setSysInfo] = useState(null)

  // Sync theme with Electron nativeTheme
  useEffect(() => {
    window.bailAPI?.desktop?.getTheme?.().then(t => {
      if (t) setIsDark(t.isDark)
    }).catch(() => {})

    const unsub = window.bailAPI?.onThemeChanged?.((t) => {
      setIsDark(t.isDark)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Listen for bail scan results pushed from main
  useEffect(() => {
    const unsub = window.bailAPI?.onBailScanResults?.((data) => {
      if (data?.alerts?.length) setAlerts(data.alerts)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Listen for navigate-to-case (tray / notification click)
  useEffect(() => {
    const unsub = window.bailAPI?.onNavigateToCase?.((caseId) => {
      setNav('calculator')
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Listen for app:action (native menu → new-case, export-pdf, etc.)
  useEffect(() => {
    const unsub = window.bailAPI?.onAction?.((action) => {
      if (action === 'new-case') setNav('calculator')
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Fetch system info once
  useEffect(() => {
    window.bailAPI?.getSystemInfo?.().then(setSysInfo).catch(() => {})
  }, [])

  const runBailScan = useCallback(async () => {
    try {
      const result = await window.bailAPI?.desktop?.runBailScan?.()
      if (result?.alerts) setAlerts(result.alerts)
      return result?.alerts || []
    } catch { return [] }
  }, [])

  const toggleTheme = useCallback(async () => {
    try {
      const result = await window.bailAPI?.desktop?.toggleTheme?.()
      if (result) setIsDark(result.isDark)
    } catch {}
  }, [])

  return (
    <AppContext.Provider value={{
      role, setRole,
      nav,  setNav,
      isDark, toggleTheme,
      alerts, setAlerts, runBailScan,
      sysInfo,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
