import { useState } from 'react'
import { cx } from '../../utils/format'

// Minimal hover/focus tooltip that keeps the application's neutral surface
// styling (no priority colors). Works on touch via focus (tap to focus).
export default function Tooltip({ label, id, className, children }) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className={cx('relative', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open && id ? id : undefined}
    >
      {children}
      {open && label && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-2 z-50 mb-2 max-w-60 rounded-field border border-border-subtle bg-surface-card px-2.5 py-1.5 text-xs font-medium leading-snug text-ink-soft shadow-lifted animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none"
        >
          {label}
        </span>
      )}
    </span>
  )
}