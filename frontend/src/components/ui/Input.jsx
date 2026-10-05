import { cx } from '@/utils/format'

const baseFieldClasses =
  'w-full rounded-field border border-border-subtle bg-surface-card px-3.5 text-sm text-ink placeholder:text-ink-faint transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60 disabled:cursor-not-allowed'

export default function Input({ label, icon: Icon, error, className, id, hint, ...props }) {
  const inputId = id || props.name || label
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      )}
      <span className="relative block">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            strokeWidth={2}
          />
        )}
        <input
          id={inputId}
          className={cx(baseFieldClasses, 'h-10', Icon && 'pl-10', error && 'border-error')}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </span>
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-error">{error}</span>}
    </label>
  )
}