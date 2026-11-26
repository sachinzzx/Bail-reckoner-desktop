import React, { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useSystemInfo } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted shrink-0 w-40">{label}</span>
      <span className={`text-xs text-primary text-right break-all ${mono ? 'font-mono' : 'font-medium'}`}>{value ?? '—'}</span>
    </div>
  )
}

export default function SystemStatus() {
  const { isDark, toggleTheme, sysInfo } = useApp()
  const { data: liveInfo, loading, refetch } = useSystemInfo()
  const info = liveInfo || sysInfo

  const [msg, setMsg] = useState(null)
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const testNotification = async () => {
    try {
      await window.bailAPI?.desktop?.runBailScan?.()
      showMsg('✅ OS notification fired — check your notification center.')
    } catch { showMsg('❌ Notification test failed.') }
  }

  const showDBInFolder = async () => {
    try {
      if (!info?.appDataPath) { showMsg('⚠️ App data path unavailable.'); return }
      const dbPath = info.appDataPath + '/bail_reckoner.sqlite'
      await window.bailAPI?.desktop?.showInFolder?.(dbPath)
    } catch (e) { showMsg(`❌ ${e?.message}`) }
  }

  const openIndiaCode = () => window.bailAPI?.desktop?.openExternal?.('https://www.indiacode.nic.in')
  const openSCI = ()       => window.bailAPI?.desktop?.openExternal?.('https://main.sci.gov.in')

  const copyDBPath = async () => {
    if (!info?.appDataPath) return
    await window.bailAPI?.desktop?.copyToClipboard?.(info.appDataPath + '/bail_reckoner.sqlite')
    showMsg('✅ DB path copied!')
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">🖥️ Desktop APIs & System Status</h2>
          <p className="text-xs text-muted mt-0.5">Live Electron runtime info, native integrations, and system controls</p>
        </div>
        <Button size="sm" variant="secondary" onClick={refetch}>↻ Refresh</Button>
      </div>

      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">{msg}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Runtime Info */}
        <Card>
          <CardHeader title="⚡ Electron Runtime" subtitle="Live process environment" />
          {loading ? <div className="flex justify-center py-6"><Spinner /></div> : (
            <div>
              <InfoRow label="Electron Version"   value={info?.electronVersion} mono />
              <InfoRow label="Node.js Version"    value={info?.nodeVersion}    mono />
              <InfoRow label="Chrome Version"     value={info?.chromeVersion}  mono />
              <InfoRow label="App Version"        value={info?.appVersion}     mono />
              <InfoRow label="OS Platform"        value={info?.platform} />
              <InfoRow label="Architecture"       value={info?.arch} />
            </div>
          )}
        </Card>

        {/* SQLite DB */}
        <Card>
          <CardHeader title="🗄️ Offline SQLite Database" subtitle="sql.js WASM — zero native dependencies" />
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Database Path</div>
              <div className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg border border-border">
                <code className="text-[10px] text-secondary break-all flex-1 font-mono">
                  {info?.appDataPath ? `${info.appDataPath}/bail_reckoner.sqlite` : 'Loading…'}
                </code>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="xs" variant="secondary" onClick={showDBInFolder}>📁 Show in Finder</Button>
              <Button size="xs" variant="ghost" onClick={copyDBPath}>📋 Copy Path</Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Database online · persistent storage active</span>
            </div>
          </div>
        </Card>

        {/* Global Shortcut */}
        <Card>
          <CardHeader title="⌨️ Global Shortcut" subtitle="OS-level keyboard shortcut" />
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-xl border border-border">
              <div>
                <div className="text-sm font-semibold text-primary">Quick Section Lookup</div>
                <div className="text-xs text-muted mt-0.5">Toggle spotlight-style section search from anywhere</div>
              </div>
              <div className="flex items-center gap-1">
                {['⌘', 'Shift', 'B'].map(k => (
                  <kbd key={k} className="px-2 py-1 text-xs font-mono bg-surface-3 border border-border-2 rounded text-secondary">{k}</kbd>
                ))}
              </div>
            </div>
            <Button size="sm" variant="secondary" className="w-full justify-center"
              onClick={() => window.bailAPI?.desktop?.toggleQuickLookup?.()}>
              🔍 Open Quick Lookup
            </Button>
          </div>
        </Card>

        {/* Theme Controls */}
        <Card>
          <CardHeader title="🎨 Appearance" subtitle="Synced with Electron nativeTheme" />
          <div className="space-y-3">
            <div className="flex gap-2">
              {[
                { label: '🌙 Dark',   target: 'dark'   },
                { label: '☀️ Light',  target: 'light'  },
                { label: '⚙️ System', target: 'system' },
              ].map(opt => (
                <Button key={opt.target} size="sm" variant="secondary"
                  onClick={() => window.bailAPI?.desktop?.toggleTheme?.(opt.target)}
                  className="flex-1 justify-center">
                  {opt.label}
                </Button>
              ))}
            </div>
            <div className="text-xs text-secondary">
              Current mode: <strong className="text-primary">{isDark ? 'Dark' : 'Light'}</strong>
            </div>
          </div>
        </Card>

        {/* Native Notifications */}
        <Card>
          <CardHeader title="🔔 Native OS Notifications" subtitle="Test Electron Notification API" />
          <div className="space-y-3">
            <div className="text-xs text-secondary leading-relaxed">
              Notifications fire automatically on startup and when running a Bail Scan.
              Clicking a notification focuses the main window and navigates to the case.
            </div>
            <Button size="sm" variant="primary" onClick={testNotification} className="w-full justify-center">
              🔔 Fire Test Notification (Bail Scan)
            </Button>
          </div>
        </Card>

        {/* Active Windows */}
        <Card>
          <CardHeader title="🪟 Multi-Window Manager" subtitle="All active BrowserWindows" />
          <div className="space-y-2">
            {[
              { name: 'Main Window',           shortcut: null,          desc: '1280×800 · state-persisted · full workspace' },
              { name: 'Quick Lookup (Floating)',shortcut: '⌘ Shift B',   desc: '520×420 · frameless · always on top' },
              { name: 'Preview Child Window',   shortcut: null,          desc: '920×720 · case law & report preview' },
            ].map(w => (
              <div key={w.name} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-border">
                <div>
                  <div className="text-xs font-medium text-primary">{w.name}</div>
                  <div className="text-[10px] text-muted">{w.desc}</div>
                </div>
                {w.shortcut && (
                  <kbd className="px-2 py-0.5 text-[10px] font-mono bg-surface-3 border border-border-2 rounded text-secondary">{w.shortcut}</kbd>
                )}
              </div>
            ))}
            <Button size="sm" variant="secondary" className="w-full justify-center"
              onClick={() => window.bailAPI?.desktop?.openPreview?.('Report Preview')}>
              ↗ Open Preview Window
            </Button>
          </div>
        </Card>
      </div>

      {/* External links */}
      <Card>
        <CardHeader title="🌐 External Resources" subtitle="Open in system default browser via shell.openExternal" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={openIndiaCode}>🇮🇳 India Code Portal</Button>
          <Button size="sm" variant="secondary" onClick={openSCI}>⚖️ Supreme Court of India</Button>
          <Button size="sm" variant="secondary"
            onClick={() => window.bailAPI?.desktop?.openExternal?.('https://nalsa.gov.in')}>
            🤝 NALSA Legal Aid
          </Button>
        </div>
      </Card>
    </div>
  )
}
