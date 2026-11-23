/**
 * SystemInfoPanel
 *
 * Calls window.bailAPI.getSystemInfo() on mount to verify that the
 * preload contextBridge and IPC round-trip are working end-to-end.
 */

import React, { useState, useEffect } from 'react'

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
}

export default function SystemInfoPanel() {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  async function fetchSystemInfo() {
    setStatus(STATUS.LOADING)
    setError(null)
    try {
      if (!window.bailAPI) throw new Error('window.bailAPI is not defined – preload may not be loaded.')
      const result = await window.bailAPI.getSystemInfo()
      setInfo(result)
      setStatus(STATUS.SUCCESS)
    } catch (err) {
      setError(err.message)
      setStatus(STATUS.ERROR)
    }
  }

  useEffect(() => {
    fetchSystemInfo()
  }, [])

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-lg">🔌</span>
          <h2 className="font-semibold text-slate-100">IPC System Info</h2>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            status === STATUS.SUCCESS
              ? 'bg-emerald-900 text-emerald-300'
              : status === STATUS.ERROR
              ? 'bg-red-900 text-red-300'
              : 'bg-slate-800 text-slate-400'
          }`}
        >
          {status === STATUS.LOADING ? '⏳ pinging…' : status === STATUS.SUCCESS ? '✓ connected' : status === STATUS.ERROR ? '✗ failed' : 'idle'}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Calls <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">window.bailAPI.getSystemInfo()</code> via <strong>contextBridge</strong> → main process IPC handler → response.
      </p>

      {/* Result */}
      {status === STATUS.SUCCESS && info && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 divide-y divide-slate-800 overflow-hidden text-sm">
          <InfoRow label="Electron" value={info.electronVersion} icon="⚡" />
          <InfoRow label="Node.js" value={info.nodeVersion} icon="🟢" />
          <InfoRow label="Chromium" value={info.chromeVersion} icon="🌐" />
          <InfoRow label="Platform" value={info.platform} icon="💻" />
          <InfoRow label="Arch" value={info.arch} icon="🏗️" />
          <InfoRow label="App version" value={info.appVersion} icon="📦" />
          <InfoRow label="userData path" value={info.appDataPath} icon="📁" mono />
        </div>
      )}

      {status === STATUS.ERROR && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-4 text-sm text-red-300">
          <p className="font-medium mb-1">IPC Error</p>
          <p className="font-mono text-xs opacity-80">{error}</p>
        </div>
      )}

      {status === STATUS.LOADING && (
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Waiting for main process response…</span>
        </div>
      )}

      <button
        onClick={fetchSystemInfo}
        disabled={status === STATUS.LOADING}
        className="mt-auto self-start px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        Ping again
      </button>
    </div>
  )
}

function InfoRow({ label, value, icon, mono = false }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="text-base w-5 flex-shrink-0">{icon}</span>
      <span className="text-slate-400 w-28 flex-shrink-0 text-xs pt-0.5">{label}</span>
      <span className={`text-slate-200 break-all text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
