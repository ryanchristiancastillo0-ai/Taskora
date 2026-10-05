import { cx } from '@/utils/format'

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-border-subtle bg-surface-soft/50 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon className="size-6" strokeWidth={1.75} />
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}