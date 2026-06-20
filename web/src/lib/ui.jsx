import { useEffect } from 'react'

export function Pill({ map, status, children }) {
  const s = map && map[status]
  if (!s) return <span className="chip border-base-600 text-steel-400">{children || status}</span>
  return (
    <span className={`chip ${s.border} ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot || 'bg-current'}`} />
      {children || s.label}
    </span>
  )
}

export function Badge({ children, tone = 'amber' }) {
  const tones = {
    amber: 'border-amber/60 bg-amber/15 text-amber-glow',
    sky: 'border-signal-maintaining/60 bg-signal-maintaining/15 text-signal-maintaining',
    violet: 'border-signal-pending/60 bg-signal-pending/15 text-signal-pending',
    red: 'border-signal-offline/60 bg-signal-offline/15 text-signal-offline',
    neutral: 'border-base-600 bg-base-800 text-steel-300',
  }
  return <span className={`chip ${tones[tone]}`}>{children}</span>
}

export function StatCard({ label, value, unit, tone = 'amber', sub }) {
  const tones = {
    amber: 'text-amber-glow',
    sky: 'text-signal-maintaining',
    green: 'text-signal-online',
    red: 'text-signal-offline',
    violet: 'text-signal-pending',
    steel: 'text-steel-200',
  }
  return (
    <div className="panel panel-accent p-4 flex flex-col gap-1 animate-riseIn">
      <div className="text-[11px] uppercase tracking-wider text-steel-400">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`stat-num text-3xl ${tones[tone]}`}>{value}</span>
        {unit && <span className="text-xs text-steel-400 font-mono">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-steel-400">{sub}</div>}
    </div>
  )
}

export function SectionTitle({ title, desc, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="h-title text-xl text-steel-200">{title}</h2>
        {desc && <p className="text-xs text-steel-400 mt-0.5">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

export function EmptyState({ text = '暂无数据' }) {
  return (
    <div className="py-12 text-center text-steel-400 text-sm border border-dashed border-base-700">
      {text}
    </div>
  )
}

export function Loading({ text = '载入中…' }) {
  return (
    <div className="py-12 text-center text-steel-400 text-sm">
      <span className="inline-block h-2 w-2 bg-amber rounded-full animate-pulseDot mr-2 align-middle" />
      {text}
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="flex items-center justify-between gap-3 border border-signal-offline/50 bg-signal-offline/10 px-3 py-2 text-sm text-signal-offline mb-4">
      <span>⚠ {message}</span>
      {onDismiss && (
        <button className="btn-ghost btn !px-2 !py-0.5 text-xs" onClick={onDismiss}>
          ✕
        </button>
      )}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-base-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative panel w-full ${wide ? 'max-w-2xl' : 'max-w-md'} animate-riseIn`}
        style={{ boxShadow: '0 0 0 1px rgba(245,166,35,0.2), 0 30px 80px -20px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
          <h3 className="h-title text-base text-amber-glow">{title}</h3>
          <button className="btn-ghost btn !px-2 !py-0.5 text-steel-300" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-base-700 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-steel-400 mt-1">{hint}</p>}
    </div>
  )
}
