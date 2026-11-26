export function Badge({ children, color = 'slate', size = 'sm', className = '' }) {
  const palette = {
    indigo:  'badge-indigo',
    violet:  'badge-violet',
    emerald: 'badge-emerald',
    rose:    'badge-rose',
    amber:   'badge-amber',
    slate:   'badge-slate',
    blue:    'badge-blue',
    cyan:    'badge-cyan',
  }
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  }
  return (
    <span className={`inline-flex items-center font-medium rounded-full ${palette[color] || palette.slate} ${sizes[size] || sizes.sm} ${className}`}>
      {children}
    </span>
  )
}
