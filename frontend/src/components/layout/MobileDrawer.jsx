import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, Sparkles, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { THEME_OPTIONS } from '@/constants/index'
import { useApp } from '@/app/providers/AppContext'
import { useTheme } from '@/app/providers/ThemeProvider'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { cx, personName } from '@/utils/format'

const DRAWER_WIDTH = 'w-[17.5rem]'

function SectionLabel({ children }) {
  return (
    <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
    </p>
  )
}

function DrawerRow({ item, onNavigate, end }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors',
          isActive
            ? 'bg-primary-soft text-primary'
            : 'text-ink-soft hover:bg-surface-container hover:text-ink'
        )
      }
    >
      <Icon className="size-[18px] flex-shrink-0" strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

function ProjectRow({ project, onNavigate }) {
  return (
    <NavLink
      to={`/tasks?project=${project.id}`}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
    >
      <span
        className="size-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: project.color ?? '#10B981' }}
      />
      <span className="truncate">{project.name}</span>
    </NavLink>
  )
}

/**
 * Right-side account drawer for the mobile layout.
 *
 * Structurally mirrors the desktop Sidebar (overlay + fixed <aside> +
 * translate-x transition) so the two feel like the same app, but enters from
 * the right and is only reachable below `lg`.
 *
 * Presentation and behaviour live here; the navigation lives with whoever mounts
 * it. `layouts/user/UserDrawer` and `layouts/admin/AdminDrawer` each pass their
 * own item lists, which is what keeps the console from linking out to the user
 * app's `/profile`, `/notifications` or `/settings` - a tap on the avatar while
 * inside the console used to drop an admin into the user app, and to list the
 * signed-in user's own projects inside a screen full of other people's.
 *
 * The lock on background scrolling is tied to `open` rather than to mount, so
 * closing the drawer to reveal the logout ConfirmDialog hands the lock over to
 * the Modal instead of the two fighting over document.body.
 */
export default function MobileDrawer({
  open,
  onClose,
  subtitle = 'Account',
  accountNav = [],
  secondaryNav = [],
  secondaryLabel = 'Workspace',
  switchNav = [],
  projects = [],
}) {
  const { data, actions } = useApp()
  const { theme, setTheme } = useTheme()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)

  // Close on navigation so a tapped link never leaves the drawer covering the
  // page it just moved to.
  const handleNavigate = () => onClose()

  useEffect(() => {
    if (!open) return undefined

    // `aria-modal` only means something if focus cannot wander into the page
    // behind the drawer, so Tab is wrapped and focus is parked on the close
    // button. The previously focused element (the header avatar) gets focus
    // back on close.
    const previouslyFocused = document.activeElement
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((node) => node.offsetParent !== null)

    const raf = requestAnimationFrame(() => closeButtonRef.current?.focus())

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusables()
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, onClose])

  // Safety net for the edge case the effect above cannot see: resizing up to
  // desktop while the drawer is open would otherwise leave it stranded over
  // the sidebar with no hamburger to close it.
  useEffect(() => {
    if (!open) return undefined
    const query = window.matchMedia('(min-width: 1024px)')
    const onChange = (event) => {
      if (event.matches) onClose()
    }
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [open, onClose])

  // Opening the confirm closes the drawer first, so only one overlay is ever
  // mounted and only one of them owns the body scroll lock.
  const requestLogout = () => {
    onClose()
    setConfirmLogout(true)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className={cx(
          'fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
        className={cx(
          'fixed right-0 top-0 z-50 flex h-dvh flex-col border-l border-border-subtle bg-surface-card transition-transform duration-200 ease-out lg:hidden',
          DRAWER_WIDTH,
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-ink">Taskora</span>
              <span className="text-[11px] font-medium text-ink-muted">{subtitle}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
          {accountNav.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Account</SectionLabel>
              <nav className="flex flex-col gap-0.5">
                {accountNav.map((item) => (
                  <DrawerRow key={item.to} item={item} onNavigate={handleNavigate} />
                ))}
              </nav>
            </div>
          )}

          <div className="mb-5">
            <SectionLabel>Appearance</SectionLabel>
            <div className="px-3 py-1">
              <SegmentedControl
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
                size="md"
                className="w-full [&>button]:flex-1"
              />
            </div>
          </div>

          {secondaryNav.length > 0 && (
            <div className="mb-5">
              <SectionLabel>{secondaryLabel}</SectionLabel>
              <nav className="flex flex-col gap-0.5">
                {secondaryNav.map((item) => (
                  <DrawerRow
                    key={item.to + item.label}
                    item={item}
                    onNavigate={handleNavigate}
                    end={item.end}
                  />
                ))}
              </nav>
            </div>
          )}

          {/* An optional "switch to another app" section. The admin console
              passes an empty list, so nothing renders for it; the user app uses
              it to offer the signed-in account's other workspaces. */}
          {switchNav.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Switch</SectionLabel>
              <nav className="flex flex-col gap-0.5">
                {switchNav.map((item) => (
                  <DrawerRow
                    key={item.to + item.label}
                    item={item}
                    onNavigate={handleNavigate}
                    end={item.end}
                  />
                ))}
              </nav>
            </div>
          )}

          {projects.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Projects</SectionLabel>
              <nav className="flex flex-col gap-0.5">
                {projects.map((project) => (
                  <ProjectRow key={project.id} project={project} onNavigate={handleNavigate} />
                ))}
              </nav>
            </div>
          )}
        </div>

        <div
          className="border-t border-border-subtle p-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-between gap-2 rounded-card bg-canvas px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={personName(data.user)} src={data.user.avatarUrl} status="online" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {data.profile.preferredName || data.user.firstName}
                </span>
                <span className="truncate text-[11px] text-ink-muted">{data.user.email}</span>
              </div>
            </div>
            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              onClick={requestLogout}
              className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-card hover:text-ink"
            >
              <LogOut className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out"
        message="Are you sure you want to log out of Taskora?"
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setConfirmLogout(false)
          actions.logout()
        }}
      />
    </>,
    document.body
  )
}
