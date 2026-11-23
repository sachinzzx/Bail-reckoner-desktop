import React, { useState, useEffect } from 'react'
import SystemInfoPanel from './components/SystemInfoPanel.jsx'
import BailCalculatorPanel from './components/BailCalculatorPanel.jsx'

export default function App() {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
      {/* ── Title Bar ───────────────────────────────────────────────────────── */}
      <header className="app-drag flex items-center gap-3 px-6 py-3 bg-slate-900 border-b border-slate-800 select-none">
        {/* macOS traffic-light spacer */}
        <div className="app-no-drag w-16 hidden mac:block" />
        <div className="flex items-center gap-2 app-no-drag">
          <span className="text-indigo-400 text-xl">⚖️</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            Bail Reckoner
          </h1>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 text-xs font-medium">
            v1.0
          </span>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IPC Ping → System Info */}
        <SystemInfoPanel />

        {/* Bail Calculator (demonstrates bail:calculate IPC) */}
        <BailCalculatorPanel />
      </main>

      {/* ── Status Bar ──────────────────────────────────────────────────────── */}
      <footer className="px-6 py-2 bg-slate-900 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-500">
        <span>Bail Reckoner Desktop</span>
        <span>•</span>
        <span>IPC: contextBridge + contextIsolation</span>
        <span>•</span>
        <span>nodeIntegration: false</span>
      </footer>
    </div>
  )
}
