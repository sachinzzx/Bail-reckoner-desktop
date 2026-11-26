export function Badge({ children, color = 'slate', size = 'sm' }) {
  const colors = {
    indigo:  'bg-indigo-500/15 text-indigo-400 ring-indigo-500/25',
    violet:  'bg-violet-500/15 text-violet-400 ring-violet-500/25',
    emerald: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
    rose:    'bg-rose-500/15 text-rose-400 ring-rose-500/25',
    amber:   'bg-amber-500/15 text-amber-400 ring-amber-500/25',
    slate:   'bg-slate-500/15 text-slate-400 ring-slate-500/25',
    blue:    'bg-blue-500/15 text-blue-400 ring-blue-500/25',
    cyan:    'bg-cyan-500/15 text-cyan-400 ring-cyan-500/25',
  }
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  }
  return (
    <span className={`inline-flex items-center font-medium rounded-full ring-1 ring-inset ${colors[color] || colors.slate} ${sizes[size] || sizes.sm}`}>
      {children}
    </span>
  )
}
