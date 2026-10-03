import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, MessagesSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/features/user/context/AppContext'
import { cx, notificationPriority, timeAgo } from '../../utils/format'
import IconButton from '../ui/IconButton'
import PriorityDot from '../ui/PriorityDot'

const supportsHover =
  typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

// Cleared space between the panel and the left edge of the screen. Half of the
// header's own `px-4`, so a panel that fills its budget still reads as inset
// rather than flush against the bezel.
const PANEL_GUTTER = 8
// Below this the panel stops being a readable list. Only reached on a viewport
// narrower than the header itself, and better a cramped panel than one hanging
// off the side of the screen.
const MIN_PANEL_WIDTH = 180

export default function NotificationBell() {
  const { data, actions } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const openTimer = useRef(null)
  const closeTimer = useRef(null)
  // Which side of the bell the panel opens on. Measured against the viewport
  // rather than assumed: the panel is 21rem tall-ish and the header sits at the
  // very top, so on a short screen (a landscape phone, a small window) there is
  // more room above than below and opening down pushes the footer off-screen.
  const [dropUp, setDropUp] = useState(false)
  const [maxWidth, setMaxWidth] = useState(null)

  const notifications = [...data.notifications].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
  const unreadCount = notifications.filter((notification) => !notification.readAt).length
  const preview = notifications.slice(0, 5)

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
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
  }, [open])

  // Which side of the bell the panel opens on, and how wide it is allowed to be.
  // Measured, not assumed: the header sits at the very top of the screen, so on a
  // short viewport (a landscape phone, a small window) there is more room above
  // the bell than below it, and opening downward pushes the footer off the
  // bottom edge.
  //
  // The width needs measuring for a related reason. The panel is right-aligned to
  // the bell, but the bell is NOT the rightmost thing in the header on a phone -
  // the avatar sits to its right - so "100vw minus a gutter" says the panel may
  // be 288px wide while there are only ~254px between the bell and the left edge
  // of the screen. A max-width alone cannot express that: it bounds the width but
  // not the position, and the result was a panel hanging 24px off the left of a
  // 320px phone. Measuring the button gives the real number: the panel's right
  // edge is the button's right edge, so that is the budget it has to fit in.
  useEffect(() => {
    if (!open) return undefined
    const measure = () => {
      const button = rootRef.current?.querySelector('button')
      if (!button) return
      const rect = button.getBoundingClientRect()
      setDropUp(rect.top > window.innerHeight - rect.bottom)
      setMaxWidth(Math.max(MIN_PANEL_WIDTH, rect.right - PANEL_GUTTER))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [open])

  const openMenu = () => {
    clearTimers()
    openTimer.current = setTimeout(() => setOpen(true), 120)
  }
  const scheduleClose = () => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  const toggle = () => {
    clearTimers()
    setOpen((value) => !value)
  }

  const openItem = (notification) => {
    if (!notification.readAt) actions.markNotificationRead(notification.id)
    setOpen(false)
    navigate('/notifications')
  }

  // Deep link straight into the conversation that produced the notification.
  // Set before navigating, matching the sidebar chat-head shortcut.
  const openChat = (notification) => {
    if (!notification.conversationId) return
    if (!notification.readAt) actions.markNotificationRead(notification.id)
    actions.openConversation(notification.conversationId)
    setOpen(false)
    navigate('/community')
  }

  const goToAll = () => {
    setOpen(false)
    navigate('/notifications')
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={supportsHover ? openMenu : undefined}
      onMouseLeave={supportsHover ? scheduleClose : undefined}
    >
      <IconButton
        icon={Bell}
        label="Notifications"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        badge={unreadCount > 0}
        className={cx(
          'border',
          unreadCount > 0 ? 'border-border-subtle bg-surface-card' : 'border-transparent'
        )}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cx(
            // A flex column capped against the viewport, so the header and the
            // "View all" footer stay pinned and only the list scrolls. The
            // 6rem is the sticky header plus breathing room; `dvh` rather than
            // `vh` because a mobile browser's URL bar changes the usable height
            // while the panel is open. The old fixed `max-h-80` overflowed the
            // bottom of a 400px-tall landscape phone by 68px.
            'absolute right-0 z-50 flex max-h-[calc(100dvh-6rem)] w-[21rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-field border border-border-subtle bg-surface-card shadow-lifted animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none',
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
          // Overrides the class above once the bell has been measured, so the
          // panel is never wider than the space between it and the left edge of
          // the screen. Null on the first frame only.
          style={maxWidth ? { maxWidth } : undefined}
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="text-[13px] font-semibold text-ink sm:text-sm">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={actions.markAllNotificationsRead}
                className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary-strong sm:text-xs"
              >
                <CheckCheck className="size-3.5" strokeWidth={2} />
                Mark all read
              </button>
            )}
          </div>

          {/* Capped twice on purpose: `20rem` keeps the panel compact on a tall
              phone or a desktop (it previews five, it is not the whole list),
              and the dvh term shrinks it further on a short screen so the header
              and footer still fit. 10.5rem covers the sticky header, this
              panel's own padding and its two fixed rows. */}
          <div className="max-h-[min(20rem,calc(100dvh-10.5rem))] min-h-0 flex-1 overflow-y-auto">
            {preview.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-muted">
                You're all caught up.
              </p>
            ) : (
              preview.map((notification) => {
                const dotPriority = notificationPriority(notification, data.tasks)
                const read = !!notification.readAt
                const canViewChat = Boolean(notification.conversationId)
                return (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openItem(notification)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openItem(notification)
                      }
                    }}
                    className={cx(
                      'block w-full border-b border-border-subtle px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-soft',
                      !read && 'bg-primary-soft/30'
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {dotPriority && <PriorityDot priority={dotPriority} className="mt-1.5" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-ink">
                            {notification.title}
                          </span>
                          {!read && (
                            <span className="size-1.5 shrink-0 rounded-full bg-primary-container" />
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {notification.message}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-ink-faint">
                            {timeAgo(notification.createdAt)}
                          </span>
                          {canViewChat && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openChat(notification)
                              }}
                              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary-faint"
                            >
                              <MessagesSquare className="size-3.5" strokeWidth={2} />
                              View chat
                            </button>
                          )}
                        </span>
                      </span>
                    </span>
                  </div>
                )
              })
            )}
          </div>

          <button
            type="button"
            onClick={goToAll}
            className="block w-full flex-shrink-0 border-t border-border-subtle px-3 py-2.5 text-center text-[13px] font-medium text-primary transition-colors hover:bg-surface-soft hover:text-primary-strong sm:px-4"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}