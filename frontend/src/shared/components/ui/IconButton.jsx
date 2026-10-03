import { cx } from '../../utils/format'

export default function IconButton({
  icon: Icon,
  label,
  onClick,
  className,
  size = 'md',
  badge,
  ...props
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'relative flex items-center justify-center rounded-lg transition-colors hover:bg-surface-container hover:text-ink',
        size === 'sm' ? 'size-8' : 'size-9',
        className ?? 'text-ink-soft'
      )}
      {...props}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} strokeWidth={2} />
      {badge && (
        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface-card" />
      )}
    </button>
  )
}