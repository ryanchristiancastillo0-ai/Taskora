import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/utils/format'

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />
      {/*
        The panel owns the height budget and the body scrolls inside it, rather
        than the body carrying a `max-h-[70vh]` of its own.

        Two reasons. A fixed 70vh body meant the header and footer were added on
        top of that budget, so a tall dialog on a short screen (a 667px phone in
        landscape, a split window) could push its own footer off the bottom. And
        `vh` measures the viewport with the mobile URL bar hidden, so the sheet
        overran the visible area by however tall that bar happened to be - the
        same trap `.assistant-panel-max-h` already documents. `dvh` is the
        honest number.

        `flex-col` + `min-h-0` on the body is what lets the body give way: the
        header and footer are `flex-shrink-0` so they stay put, and the body is
        the only element that absorbs the difference. `overflow-hidden` keeps a
        scrolling body clipped to the sheet's rounded corners instead of letting
        it square them off at the top.
      */}
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative z-10 flex max-h-[100dvh] w-full animate-[fadeIn_150ms_ease] flex-col overflow-hidden rounded-t-card bg-surface-card pb-safe-sheet shadow-lifted sm:max-h-[calc(100dvh-2rem)] sm:rounded-card',
          sizes[size]
        )}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {/*
          `overscroll-contain` stops the scroll from chaining out to the page
          behind once the body reaches its end, which otherwise feels like the
          dialog is dragging the whole app with it on a phone.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-shrink-0 flex-wrap justify-end gap-3 border-t border-border-subtle px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}