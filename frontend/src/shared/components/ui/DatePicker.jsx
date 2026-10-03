import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { todayKey } from '../../api/normalize'
import { cx } from '../../utils/format'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const POPUP_WIDTH = 288
const POPUP_HEIGHT = 330

function parseKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const displayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function displayValue(key) {
  const date = parseKey(key)
  return date ? displayFormatter.format(date) : ''
}

export default function DatePicker({
  label,
  value = '',
  onChange,
  placeholder = 'Select a date',
  className,
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const [view, setView] = useState(() => {
    const base = parseKey(value) || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      const inside =
        triggerRef.current?.contains(event.target) ||
        popupRef.current?.contains(event.target)
      if (!inside) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const base = parseKey(value) || new Date()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const openUp = rect.bottom + POPUP_HEIGHT > window.innerHeight
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8))
      setPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + 6, left }
          : { top: rect.bottom + 6, left }
      )
    }
    setOpen(true)
  }

  const select = (key) => {
    setOpen(false)
    if (onChange) onChange(key)
  }

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year, month, 1 - firstOffset + i)
    cells.push({ date, inMonth: date.getMonth() === month, key: toKey(date) })
  }

  return (
    <div className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label || 'Select a date'}
        onClick={toggle}
        className="flex h-10 w-full items-center gap-2.5 rounded-field border border-border-subtle bg-surface-card px-3.5 text-sm transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        <Calendar className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
        <span className={cx('truncate', value ? 'text-ink' : 'text-ink-faint')}>
          {value ? displayValue(value) : placeholder}
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" aria-hidden="true" />
            <div
              ref={popupRef}
              role="dialog"
              aria-label={label || 'Date picker'}
              className="fixed z-[60] w-72 rounded-card border border-border-subtle bg-surface-card p-2.5 shadow-lifted"
              style={position || undefined}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </button>
                <span className="text-sm font-semibold text-ink">
                  {MONTHS[month]} {year}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map((weekday) => (
                  <span
                    key={weekday}
                    className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase text-ink-faint"
                  >
                    {weekday}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => select(cell.key)}
                    disabled={!cell.inMonth}
                    className={cx(
                      'flex h-8 items-center justify-center rounded-lg text-[13px] transition-colors',
                      cell.key === value
                        ? 'bg-primary font-semibold text-white'
                        : cell.inMonth
                          ? 'text-ink hover:bg-surface-container'
                          : 'cursor-default',
                      !cell.inMonth && 'text-ink-faint/20'
                    )}
                  >
                    {cell.date.getDate()}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
                <button
                  type="button"
                  onClick={() => select(todayKey())}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary-soft"
                >
                  <Check className="size-3.5" strokeWidth={2} />
                  Today
                </button>
                {value ? (
                  <button
                    type="button"
                    onClick={() => select('')}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  )
}