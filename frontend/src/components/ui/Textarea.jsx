import { cx } from '@/utils/format'

const baseFieldClasses =
  'w-full rounded-field border border-border-subtle bg-surface-card px-3.5 text-sm text-ink placeholder:text-ink-faint transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60'

export default function Textarea({ label, error, className, rows = 4, ...props }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      )}
      <textarea
        rows={rows}
        className={cx(baseFieldClasses, 'py-2.5', error && 'border-error')}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <span className="mt-1.5 block text-xs text-error">{error}</span>}
    </label>
  )
}