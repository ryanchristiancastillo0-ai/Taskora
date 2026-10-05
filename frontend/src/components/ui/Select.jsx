import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '@/utils/format'

export default function Select({ label, error, className, selectClassName, children, ...props }) {
  const selectRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const select = selectRef.current
    if (!select) return

    // Native selects expose an `open` state + `toggle` event in browsers that
    // implement the standardized select popup behavior (Chrome 133+, Firefox
    // 137+, Safari 26+). Fall back to focus/blur detection everywhere else so
    // the chevron still animates.
    const supportsOpen = typeof select.open === 'boolean'

    const onToggle = () => setOpen(select.open)
    const onFocus = () => setOpen(true)
    const onBlur = () => setOpen(false)

    if (supportsOpen) {
      select.addEventListener('toggle', onToggle)
      return () => select.removeEventListener('toggle', onToggle)
    }
    select.addEventListener('mousedown', onFocus)
    select.addEventListener('focus', onFocus)
    select.addEventListener('blur', onBlur)
    return () => {
      select.removeEventListener('mousedown', onFocus)
      select.removeEventListener('focus', onFocus)
      select.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      )}
      <span className="relative block">
        <select
          ref={selectRef}
          aria-invalid={Boolean(error)}
          {...props}
          className={cx(
            'h-10 w-full cursor-pointer appearance-none rounded-field border bg-surface-card pl-3.5 pr-10 text-sm text-ink transition-all hover:border-primary/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60 disabled:cursor-not-allowed',
            selectClassName,
            error
              ? 'border-error focus:border-error'
              : 'border-border-subtle focus:border-primary'
          )}
        >
          {children}
        </select>
        <ChevronDown
          className={cx(
            'pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 transition-transform duration-200 ease-out text-ink-faint',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </span>
      {error && <span className="mt-1.5 block text-xs text-error">{error}</span>}
    </label>
  )
}
