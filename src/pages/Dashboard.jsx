import React, { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useDashboardStats } from '../hooks/useIPC'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

function KpiCard({ label, value, sub, color = 'indigo', icon }) {
  const colors = {
    indigo: 'text-indigo-400',
    rose:   'text-rose-400',
    amber:  'text-amber-400',
    emerald:'text-emerald-400',
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
  const { alerts, runBailScan, setNav } = useApp()
  const { data: stats, loading, refetch } = useDashboardStats()
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState(null)

  const handleScan = useCallback(async () => {
    setScanning(true); setScanMsg(null)
    try {
      const found = await runBailScan()
      setScanMsg(found?.length
        ? `✅ ${found.length} case(s) flagged for bail eligibility — OS alerts fired!`
        : '✅ Scan complete — no new eligible cases found.')
    } catch {
      setScanMsg('⚠️ Scan failed. Check console for details.')
    } finally {
      setScanning(false)
    }
  }, [runBailScan])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">Dashboard & Statutory Alerts</h2>
          <p className="text-xs text-muted mt-0.5">Overview of undertrial cases and eligibility alerts</p>
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
          <KpiCard label="Total Cases"          value={stats?.totalCases       ?? 0} icon="📂" color="indigo"  sub="in SQLite registry" />
          <KpiCard label="Half-Term Alerts"     value={stats?.halfTermEligible ?? alerts.length} icon="⚠️" color="rose"    sub="eligible for bail now" />
          <KpiCard label="High-Risk Cases"      value={stats?.highRisk         ?? 0} icon="🔴" color="amber"   sub="flight / tampering risk" />
          <KpiCard label="Pending Bond Process" value={stats?.pendingBond      ?? 0} icon="📋" color="emerald" sub="surety / personal bond" />
        </div>
      )}

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader
            title="🚨 Statutory Bail Eligibility Alerts"
            subtitle={`${alerts.length} undertrial(s) may be entitled to bail under §479 BNSS / §436A CrPC`}
          />
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-rose-500/8 border border-rose-500/20 rounded-lg cursor-pointer hover:bg-rose-500/12 transition-colors"
                onClick={() => setNav('calculator')}
              >
                <span className="text-rose-400 text-lg mt-0.5">⚖️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary">{a.name}</span>
                    <Badge color="slate" size="xs">{a.caseNumber}</Badge>
                    <Badge color="rose" size="xs">Eligible Now</Badge>
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{a.reason}</p>
                </div>
                <button
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium shrink-0 cursor-pointer"
                  onClick={e => { e.stopPropagation(); setNav('calculator') }}
                >
                  Open →
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="📋 Case Registry" subtitle="Manage undertrial cases" />
          <Button variant="secondary" size="sm" onClick={() => setNav('registry')} className="w-full justify-center">Open Registry →</Button>
        </Card>
        <Card>
          <CardHeader title="📚 Statute Library" subtitle="Browse IPC, BNS, BNSS, Special Acts" />
          <Button variant="secondary" size="sm" onClick={() => setNav('library')} className="w-full justify-center">Open Library →</Button>
        </Card>
        <Card>
          <CardHeader title="⚖️ Bail Calculator" subtitle="Run full eligibility analysis" />
          <Button variant="primary" size="sm" onClick={() => setNav('calculator')} className="w-full justify-center">New Analysis →</Button>
        </Card>
      </div>
    </div>
  )
}
