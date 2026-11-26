/**
 * Global App Context — role, theme, active nav, active case, bail-scan alerts, shortcuts modal
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

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
  const [role,           setRole]           = useState('legal_aid')
  const [nav,            setNav]            = useState('dashboard')
  const [activeCaseId,   setActiveCaseId]   = useState(null)
  const [isDark,         setIsDark]         = useState(true)
  const [alerts,         setAlerts]         = useState([])
  const [sysInfo,        setSysInfo]        = useState(null)
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false)
  const [registryVersion, setRegistryVersion] = useState(0)
  const [globalNotice,   setGlobalNotice]   = useState(null)

  const activeCaseRef = useRef(activeCaseId)
  activeCaseRef.current = activeCaseId

  const showGlobalNotice = useCallback((text) => {
    setGlobalNotice(text)
    setTimeout(() => setGlobalNotice(null), 4000)
  }, [])

  const openCase = useCallback((caseId) => {
    setActiveCaseId(caseId)
    setNav('calculator')
  }, [])

  const newCase = useCallback(() => {
    setActiveCaseId(null)
    setNav('calculator')
  }, [])

  // Sync theme with Electron nativeTheme
  useEffect(() => {
    window.bailAPI?.desktop?.getTheme?.().then(t => {
      if (t) setIsDark(t.isDark)
    }).catch(() => {})

    const unsub = window.bailAPI?.onThemeChanged?.((t) => {
      if (t) setIsDark(t.isDark)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Listen for bail scan results pushed from main
  useEffect(() => {
    const unsub = window.bailAPI?.onBailScanResults?.((data) => {
      if (data?.alerts) setAlerts(data.alerts)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  // Listen for navigate-to-case (tray / OS notification click)
  useEffect(() => {
    const unsub = window.bailAPI?.onNavigateToCase?.((caseId) => {
      if (caseId) openCase(caseId)
      else setNav('calculator')
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [openCase])

  // Listen for native menu actions (File -> New Case, Export PDF, Help -> Keyboard Shortcuts)
  useEffect(() => {
    const unsub = window.bailAPI?.onAction?.(async (action) => {
      if (action === 'new-case') {
        newCase()
      } else if (action === 'show-shortcuts') {
        setShortcutsOpen(true)
      } else if (action === 'export-pdf') {
        const cid = activeCaseRef.current
        if (!cid) {
          showGlobalNotice('Select or save a case in the Bail Calculator before exporting PDF.')
          setNav('registry')
          return
        }
        try {
          const res = await window.bailAPI?.desktop?.exportCasePDF?.(cid)
          if (res?.success) showGlobalNotice(`✅ PDF exported → ${res.filePath}`)
          else if (res?.error) showGlobalNotice(`❌ ${res.error}`)
        } catch (err) {
          showGlobalNotice(`❌ ${err?.message || err}`)
        }
      }
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [newCase, showGlobalNotice])

  // Listen for File -> Import Case JSON from native menu
  useEffect(() => {
    const unsub = window.bailAPI?.onImportCase?.((payload) => {
      setRegistryVersion(v => v + 1)
      if (payload?.case?.id) {
        openCase(payload.case.id)
        showGlobalNotice(`✅ Imported case ${payload.case.case_number || ''}`)
      } else {
        setNav('registry')
      }
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [openCase, showGlobalNotice])

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
      activeCaseId, setActiveCaseId, openCase, newCase,
      isDark, toggleTheme,
      alerts, setAlerts, runBailScan,
      sysInfo,
      shortcutsOpen, setShortcutsOpen,
      registryVersion, setRegistryVersion,
      globalNotice, showGlobalNotice,
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
