import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/utils/format'

// The menu is portalled to <body>, so it is positioned in viewport coordinates.
// When the trigger lives inside an element marked with `data-dropdown-container`
// (a sidebar card, a chat panel, ...) we clamp the menu to that element's box
// instead of the viewport, so it reads as a dropdown belonging to that panel
// rather than to the whole page.
const CONTAINER_SELECTOR = '[data-dropdown-container]'
const GUTTER = 8
const GAP = 6
const MIN_MAX_HEIGHT = 140

export default function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
  triggerClassName,
  open: openProp,
  onOpenChange,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)

  const controlled = openProp !== undefined
  const open = controlled ? openProp : uncontrolledOpen

  const setOpen = useCallback(
    (next) => {
      if (!controlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange]
  )

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      const insideMenu = menuRef.current?.contains(event.target)
      if (!insideMenu && rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
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
  }, [open, setOpen])

  const place = useCallback(() => {
    const anchor = rootRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return

    const rect = anchor.getBoundingClientRect()
    const container = anchor.closest(CONTAINER_SELECTOR)
    const bounds = container
      ? container.getBoundingClientRect()
      : {
          left: GUTTER,
          top: GUTTER,
          right: window.innerWidth - GUTTER,
          bottom: window.innerHeight - GUTTER,
        }

    const width = menu.offsetWidth
    const height = menu.offsetHeight

    const minLeft = bounds.left + GUTTER
    const maxLeft = Math.max(minLeft, bounds.right - width - GUTTER)
    const desiredLeft = align === 'right' ? rect.right - width : rect.left
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft)

    const roomBelow = bounds.bottom - rect.bottom - GAP
    const roomAbove = rect.top - bounds.top - GAP
    const openDown = height <= roomBelow || roomBelow >= roomAbove
    const top = openDown
      ? rect.bottom + GAP
      : Math.max(bounds.top + GUTTER, rect.top - GAP - height)

    setPosition({
      top,
      left,
      maxHeight: Math.max(MIN_MAX_HEIGHT, (openDown ? roomBelow : roomAbove) - GUTTER),
    })
  }, [align])

  // Runs before paint, so the menu never flashes at its unpositioned spot.
  useLayoutEffect(() => {
    if (!open) return
    place()
  }, [open, place])

  // Follow the trigger while the panel scrolls or the window resizes. `scroll`
  // does not bubble, so listen on window with capture to catch inner scrollers.
  useEffect(() => {
    if (!open) return undefined
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [open, place])

  const handleItemClick = (event, onClick) => {
    setOpen(false)
    onClick?.(event)
  }

  return (
    <div ref={rootRef} className={cx('relative inline-block', triggerClassName)}>
      <span onClick={() => setOpen(!open)}>{trigger}</span>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" aria-hidden="true" />
            <div
              ref={menuRef}
              role="menu"
              className={cx(
                'fixed z-[60] min-w-44 overflow-y-auto overscroll-contain rounded-field border border-border-subtle bg-surface-card p-1.5 shadow-lifted',
                className
              )}
              style={position || undefined}
            >
              {Children.map(children, (child) => {
                if (!isValidElement(child)) return child
                return cloneElement(child, {
                  onClick: (event) => handleItemClick(event, child.props.onClick),
                })
              })}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
  className,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-ink-faint'
          : danger
            ? 'text-error hover:bg-danger-soft'
            : 'text-ink-soft hover:bg-surface-container hover:text-ink',
        className
      )}
    >
      {Icon && <Icon className="size-4 flex-shrink-0" strokeWidth={2} />}
      <span className="truncate">{label}</span>
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-border-subtle" />
}
