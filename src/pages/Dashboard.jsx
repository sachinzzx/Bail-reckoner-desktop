import React, { useState, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useDashboardStats } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

function KpiCard({ label, value, sub, color = 'indigo', icon }) {
  const colors = {
    indigo:  'fg-indigo',
    rose:    'fg-rose',
    amber:   'fg-amber',
    emerald: 'fg-emerald',
  }
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted font-medium">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-3xl font-bold ${colors[color] || colors.indigo}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { alerts, runBailScan, setNav, openCase, registryVersion } = useApp()
  const { data: stats, loading, refetch } = useDashboardStats()
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState(null)

  useEffect(() => {
    refetch()
  }, [registryVersion, refetch])

  const handleScan = useCallback(async () => {
    setScanning(true); setScanMsg(null)
    try {
      const found = await runBailScan()
      await refetch()
      setScanMsg(found?.length
        ? `✅ ${found.length} case(s) flagged for bail eligibility — OS notifications fired!`
        : '✅ Scan complete — no undertrial cases past threshold.')
    } catch {
      setScanMsg('⚠️ Scan failed. Check console for details.')
    } finally {
      setScanning(false)
    }
  }, [runBailScan, refetch])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">Dashboard &amp; Statutory Alerts</h2>
          <p className="text-xs text-muted mt-0.5">Overview of undertrial cases and statutory §479 BNSS / §436A CrPC alerts</p>
        </div>
        <Button onClick={handleScan} disabled={scanning} size="md" variant="primary">
          {scanning ? <Spinner size={3} /> : '🔍'}
          {scanning ? 'Scanning…' : 'Run OS Bail Scan'}
        </Button>
      </div>

      {/* Scan message */}
      {scanMsg && (
        <div className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-secondary">
          {scanMsg}
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner size={6} /></div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Total Cases"          value={stats?.totalCases       ?? 0} icon="📂" color="indigo"  sub={`${stats?.undertrial ?? 0} active undertrials`} />
          <KpiCard label="Half-Term Alerts"     value={stats?.halfTermEligible ?? alerts.length} icon="⚠️" color="rose"    sub="eligible under §479 BNSS" />
          <KpiCard label="High-Risk Cases"      value={stats?.highRisk         ?? 0} icon="🔴" color="amber"   sub="flight / tampering risk" />
          <KpiCard label="Pending Bond Process" value={stats?.pendingBond      ?? 0} icon="📋" color="emerald" sub="surety / personal bond" />
        </div>
      )}

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader
            title="🚨 Statutory Bail Eligibility Alerts"
            subtitle={`${alerts.length} undertrial(s) crossed half-term or 1/3rd FTO threshold under §479 BNSS / §436A CrPC`}
          />
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={a.caseId ?? i}
                className="flex items-start gap-3 p-3 badge-rose rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => a.caseId ? openCase(a.caseId) : setNav('calculator')}
              >
                <span className="text-lg mt-0.5">⚖️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary">{a.name}</span>
                    <Badge color="slate" size="xs">{a.caseNumber}</Badge>
                    <Badge color="rose" size="xs">Eligible Now</Badge>
                  </div>
                  <p className="text-xs text-secondary mt-0.5 leading-relaxed">{a.reason}</p>
                </div>
                <button
                  className="text-xs text-accent font-semibold shrink-0 cursor-pointer hover:underline"
                  onClick={e => { e.stopPropagation(); a.caseId ? openCase(a.caseId) : setNav('calculator') }}
                >
                  Open Case →
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="📋 Case Registry" subtitle={`${stats?.totalCases ?? 0} saved case records`} />
          <Button variant="secondary" size="sm" onClick={() => setNav('registry')} className="w-full justify-center">Open Registry →</Button>
        </Card>
        <Card>
          <CardHeader title="📚 Statute Library" subtitle={`${stats?.totalSections ?? 0} sections · ${stats?.totalJudgments ?? 0} SC judgments`} />
          <Button variant="secondary" size="sm" onClick={() => setNav('library')} className="w-full justify-center">Open Library →</Button>
        </Card>
        <Card>
          <CardHeader title="⚖️ Bail Calculator" subtitle="Run full eligibility & risk analysis" />
          <Button variant="primary" size="sm" onClick={() => setNav('calculator')} className="w-full justify-center">Open Calculator →</Button>
        </Card>
      </div>
    </div>
  )
}
