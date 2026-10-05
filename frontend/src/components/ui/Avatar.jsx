import { useState } from 'react'
import { initials } from '@/utils/format'
import { cx } from '@/utils/format'

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

  // A stored avatarUrl is a claim, not a guarantee: the URL can 404 (Google
  // rewrites `picture` when the photo changes), or be blocked by a CSP, ad
  // blocker or captive portal. Without this, any of those leave a broken-image
  // glyph where a face should be. Tracking the failed URL rather than a boolean
  // means a different src is retried for free.
  const [failedSrc, setFailedSrc] = useState(null)

  const showImage = Boolean(src) && failedSrc !== src

  return (
    <span className={cx('relative inline-flex flex-shrink-0', className)}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          onError={() => setFailedSrc(src)}
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