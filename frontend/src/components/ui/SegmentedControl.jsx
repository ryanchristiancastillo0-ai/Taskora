import { cx } from '@/utils/format'

export default function SegmentedControl({
  options,
  value,
  onChange,
  className,
  size = 'sm',
}) {
  return (
    <div
      role="tablist"
      className={cx(
        'inline-flex items-center rounded-lg bg-surface-container p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const label = typeof option === 'string' ? option : option.label
        const val = typeof option === 'string' ? option : option.value
        const active = val === value
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(val)}
            className={cx(
              'rounded-md transition-all duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
              active
                ? 'bg-surface-card font-semibold text-ink shadow-sm'
                : 'font-medium text-ink-muted hover:text-ink'
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}