export function Button({ children, onClick, variant = 'primary', size = 'sm', disabled = false, className = '', title }) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 disabled:pointer-events-none cursor-pointer'
  const sizes = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }
  const variants = {
    primary:  'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm',
    secondary:'bg-surface-2 hover:bg-surface-3 text-primary border border-border',
    ghost:    'hover:bg-surface-2 text-muted hover:text-primary',
    danger:   'bg-rose-600 hover:bg-rose-500 text-white shadow-sm',
    success:  'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizes[size] || sizes.sm} ${variants[variant] || variants.secondary} ${className}`}
    >
      {children}
    </button>
  )
}
