import React from 'react'
import { useApp, ROLES, NAV_ITEMS } from '../context/AppContext'

export default function Sidebar() {
  const { role, setRole, nav, setNav, isDark, toggleTheme, alerts, setShortcutsOpen } = useApp()
  const isMac = navigator.platform?.toLowerCase().includes('mac')

  return (
    <aside className="flex flex-col w-56 shrink-0 border-r border-border bg-surface h-full select-none">
      {/* ── Title bar region (macOS traffic lights spacer) ── */}
      <div className={`app-drag h-11 flex items-center border-b border-border shrink-0 ${isMac ? 'pl-20 pr-3' : 'px-4'}`}>
        <div className="app-no-drag flex items-center gap-2">
          <span className="text-base">⚖️</span>
          <span className="text-sm font-semibold text-primary tracking-tight">Bail Reckoner</span>
        </div>
      </div>

      {/* ── Role Switcher ── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5 px-1">Role</p>
        <div className="flex flex-col gap-0.5">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left w-full cursor-pointer
                ${role === r.id
                  ? 'badge-indigo'
                  : 'text-secondary hover:bg-surface-2 hover:text-primary'}`}
            >
              <span className="text-sm">{r.icon}</span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 my-1 border-t border-border" />

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5 px-1">Navigation</p>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setNav(item.id)}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left relative cursor-pointer
              ${nav === item.id
                ? 'bg-surface-2 text-primary ring-1 ring-inset ring-border-2'
                : 'text-secondary hover:bg-surface-2 hover:text-primary'}`}
          >
            <span className="text-sm shrink-0">{item.icon}</span>
            <span className="truncate leading-tight">{item.label}</span>
            {/* Alert badge on Dashboard */}
            {item.id === 'dashboard' && alerts.length > 0 && (
              <span className="ml-auto shrink-0 min-w-[18px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Bottom: theme + shortcuts + version ── */}
      <div className="px-3 py-3 border-t border-border shrink-0 space-y-1">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:bg-surface-2 hover:text-primary transition-all cursor-pointer"
        >
          <span>{isDark ? '🌙' : '☀️'}</span>
          <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
        <button
          onClick={() => setShortcutsOpen(true)}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:bg-surface-2 hover:text-primary transition-all cursor-pointer"
        >
          <span>⌨️</span>
          <span>Shortcuts</span>
        </button>
        <div className="px-1 pt-1 text-[10px] text-muted">
          <span>Bail Reckoner v1.0 · Offline</span>
        </div>
      </div>
    </aside>
  )
}
