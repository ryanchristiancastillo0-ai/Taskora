import { initials } from '../../utils/format'
import { cx } from '../../utils/format'

export default function Avatar({
  name = '',
  src,
  size = 'md',
  className,
  status = null,
}) {
  const sizes = {
    sm: 'size-8 text-[13px]',
    md: 'size-9 text-sm',
    lg: 'size-12 text-base',
    xl: 'size-16 text-xl',
    '2xl': 'size-28 text-3xl',
  }

  return (
    <span className={cx('relative inline-flex flex-shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cx('rounded-full object-cover', sizes[size])}
        />
      ) : (
        <span
          aria-label={name}
          className={cx(
            'flex items-center justify-center rounded-full bg-primary-soft font-semibold text-primary',
            sizes[size]
          )}
        >
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={cx(
            'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface-card',
            status === 'online' ? 'bg-success' : 'bg-ink-faint'
          )}
        />
      )}
    </span>
  )
}