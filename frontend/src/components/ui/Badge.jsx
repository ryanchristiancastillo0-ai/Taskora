import { cx } from '@/utils/format'

const tones = {
  slate: 'bg-surface-high text-ink-soft',
  indigo: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-emerald-700',
  amber: 'bg-warning-soft text-amber-700',
  rose: 'bg-danger-soft text-rose-600',
  red: 'bg-danger text-white',
  muted: 'bg-surface-container text-ink-muted',
  neutral: 'bg-surface-container text-ink-muted',
  primary: 'bg-primary-soft text-primary',
}

export default function Badge({ tone = 'slate', dot = false, className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}