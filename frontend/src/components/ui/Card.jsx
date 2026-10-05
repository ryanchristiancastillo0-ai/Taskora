import { cx } from '@/utils/format'

export default function Card({ className, children, padding = true }) {
  return (
    <div
      className={cx(
        'rounded-card bg-surface-card shadow-card',
        padding && 'p-5 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-[18px]" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}