import React, { useState, useEffect, useCallback } from 'react'
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
  const { isDark, sysInfo } = useApp()
  const { data: liveInfo, loading, refetch } = useSystemInfo()
  const info = liveInfo || sysInfo

  const [winStatus, setWinStatus] = useState(null)
  const [msg, setMsg] = useState(null)
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const refreshWindows = useCallback(async () => {
    try {
      const s = await window.bailAPI?.desktop?.getWindowStatus?.()
      if (s) setWinStatus(s)
    } catch {}
  }, [])

  useEffect(() => {
    refreshWindows()
    const id = setInterval(refreshWindows, 2500)
    return () => clearInterval(id)
  }, [refreshWindows])

  const testNotification = async () => {
    try {
      await window.bailAPI?.desktop?.runBailScan?.()
      showMsg('✅ OS notification fired — check your notification center.')
    } catch { showMsg('❌ Notification test failed.') }
  }

  const showDBInFolder = async () => {
    try {
      if (!info?.appDataPath) { showMsg('⚠️ App data path unavailable.'); return }
      const sep = info.platform === 'win32' ? '\\' : '/'
      const dbPath = `${info.appDataPath}${sep}bail_reckoner.sqlite`
      await window.bailAPI?.desktop?.showInFolder?.(dbPath)
    } catch (e) { showMsg(`❌ ${e?.message}`) }
  }

  const openIndiaCode = () => window.bailAPI?.desktop?.openExternal?.('https://www.indiacode.nic.in')
  const openSCI = ()       => window.bailAPI?.desktop?.openExternal?.('https://main.sci.gov.in')

  const copyDBPath = async () => {
    if (!info?.appDataPath) return
    const sep = info.platform === 'win32' ? '\\' : '/'
    await window.bailAPI?.desktop?.copyToClipboard?.(`${info.appDataPath}${sep}bail_reckoner.sqlite`)
    showMsg('✅ DB path copied!')
  }

  const isMac = info?.platform === 'darwin'
  const modKey = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">🖥️ Desktop APIs &amp; System Status</h2>
          <p className="text-xs text-muted mt-0.5">Live Electron runtime info, native integrations, and multi-window telemetry</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => { refetch(); refreshWindows() }}>↻ Refresh</Button>
      </div>

      {msg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">{msg}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

        <Card>
          <CardHeader title="🗄️ Offline SQLite Database" subtitle="sql.js WASM — persisted in userData" />
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Database Path</div>
              <div className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg border border-border">
                <code className="text-[10px] text-secondary break-all flex-1 font-mono">
                  {info?.appDataPath ? `${info.appDataPath}${isMac || info.platform === 'linux' ? '/' : '\\'}bail_reckoner.sqlite` : 'Loading…'}
                </code>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="xs" variant="secondary" onClick={showDBInFolder}>📁 Show in Folder</Button>
              <Button size="xs" variant="ghost" onClick={copyDBPath}>📋 Copy Path</Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs fg-emerald font-medium">Database online · persistent storage active</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="⌨️ Global Shortcut" subtitle="OS-level keyboard shortcut" />
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-2 rounded-xl border border-border">
              <div>
                <div className="text-sm font-semibold text-primary">Quick Section Lookup</div>
                <div className="text-xs text-muted mt-0.5">Toggle spotlight-style section search from anywhere</div>
              </div>
              <div className="flex items-center gap-1">
                {[modKey, 'Shift', 'B'].map(k => (
                  <kbd key={k} className="px-2 py-1 text-xs font-mono bg-surface-3 border border-border-2 rounded text-primary">{k}</kbd>
                ))}
              </div>
            </div>
            <Button size="sm" variant="secondary" className="w-full justify-center"
              onClick={async () => { await window.bailAPI?.desktop?.toggleQuickLookup?.(); refreshWindows() }}>
              🔍 Toggle Quick Lookup
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="🎨 Appearance" subtitle="Synced with Electron nativeTheme across all windows" />
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

        <Card>
          <CardHeader title="🔔 Native OS Notifications" subtitle="Test Electron Notification API" />
          <div className="space-y-3">
            <div className="text-xs text-secondary leading-relaxed">
              Notifications fire automatically on startup and when running a Bail Scan.
              Clicking a notification focuses the main window and opens that case.
            </div>
            <Button size="sm" variant="primary" onClick={testNotification} className="w-full justify-center">
              🔔 Fire Test Notification (Bail Scan)
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="🪟 Multi-Window Manager"
            subtitle={winStatus ? `${winStatus.totalWindows} live BrowserWindow(s)` : 'BrowserWindow instances'}
          />
          <div className="space-y-2">
            {[
              { name: 'Main Window',             active: winStatus?.mainOpen ?? true, desc: '1280×800 · state-persisted' },
              { name: 'Quick Lookup (Floating)', active: winStatus?.quickLookupOpen,   desc: `520×420 · frameless (${modKey}+Shift+B)` },
              { name: 'Precedent Child Window',  active: winStatus?.previewOpen,       desc: '920×720 · precedent detail' },
            ].map(w => (
              <div key={w.name} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-border">
                <div>
                  <div className="text-xs font-medium text-primary">{w.name}</div>
                  <div className="text-[10px] text-muted">{w.desc}</div>
                </div>
                <Badge color={w.active ? 'emerald' : 'slate'} size="xs">
                  {w.active ? 'Visible' : 'Standby'}
                </Badge>
              </div>
            ))}
            <Button size="sm" variant="secondary" className="w-full justify-center"
              onClick={async () => { await window.bailAPI?.desktop?.openPreview?.({ title: 'Judicial Precedents', precedentId: 1 }); refreshWindows() }}>
              ↗ Open Precedent Child Window
            </Button>
          </div>
        </Card>
      </div>

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
