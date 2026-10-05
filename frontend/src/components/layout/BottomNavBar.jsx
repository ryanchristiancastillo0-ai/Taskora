import { NavLink } from 'react-router-dom'
import { cx } from '@/utils/format'

/**
 * The fixed mobile bottom navigation bar.
 *
 * One renderer for both surfaces — the user app's MobileBottomNav and the admin
 * console's AdminBottomNav — because they are the same component with different
 * items, and the same reasoning SidebarNavItem already encodes for the two
 * sidebars: a private copy of this markup is a copy that will drift.
 *
 * Only rendered below `lg`, where the desktop sidebar is hidden. A 5-column grid
 * (not flex) keeps the destinations evenly spaced and prevents horizontal
 * overflow down to 320px.
 *
 * The bar floats: side and bottom insets plus a translucent blurred surface and
 * a soft shadow, so it reads as a separate layer from page content rather than
 * as another edge-to-edge divider.
 *
 * IMPORTANT: `NavLink` only invokes a function child when `children` *is* a
 * function. Mixing a function child with sibling elements (e.g. a separate
 * label element) makes JSX pass an array, the function is never called, and
 * React throws "Functions are not valid as a React child". So the icon *and*
 * the label must both be returned from the single function child below.
 *
 * The bar holds links only, so route changes never have to be mirrored here.
 *
 * Layout math lives with the scroll-padding helper `.pb-safe-for-bottom-nav` in
 * `index.css`; keep the two in step when changing the bar's height/insets.
 *
 * @param {{ items: Array, ariaLabel: string }} props
 *   `items` entries are `{ to, label, ariaLabel, icon, end?, emphasis? }`.
 *   `emphasis` marks the centre item, drawn as a raised brand disc so the app's
 *   headline feature reads as the primary action.
 */
export default function BottomNavBar({ items, ariaLabel }) {
  return (
    <nav
      aria-label={ariaLabel}
      // pointer-events-none on the wrapper lets taps fall through the side and
      // bottom insets, so only the bar itself is interactive.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] lg:hidden"
    >
      <ul className="pointer-events-auto mx-auto grid h-16 w-[calc(100%-1.5rem)] max-w-md grid-cols-5 items-center rounded-2xl border border-border-subtle bg-surface-card/85 px-1.5 shadow-lifted backdrop-blur-2xl">
        {items.map((item) => {
          // Uppercase local so JSX treats it as a component, not a host tag.
          const Icon = item.icon
          return (
            <li key={item.to} className="flex min-w-0 justify-center">
              <NavLink
                to={item.to}
                end={item.end}
                aria-label={item.ariaLabel}
                title={item.ariaLabel}
                className={({ isActive }) =>
                  cx(
                    // 44px minimum touch target, per platform accessibility
                    // guidelines. py-0 keeps the tallest item (the centre one)
                    // inside the 64px bar.
                    'group flex min-h-[44px] w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    // The centre action is lifted clear of the bar.
                    item.emphasis && '-translate-y-2.5',
                    isActive ? 'text-primary' : 'text-ink-muted'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.emphasis ? (
                      // Centre feature: a brand-filled disc that breaks the
                      // bar's top edge. Always brand-coloured so it reads as
                      // the primary action; the ring carries the active state.
                      <span
                        className={cx(
                          'flex size-10 items-center justify-center rounded-full text-white shadow-primary-glow transition-all duration-200',
                          isActive
                            ? 'bg-primary-container ring-4 ring-primary/20'
                            : 'bg-primary/85'
                        )}
                      >
                        <Icon className="size-5" strokeWidth={2.1} />
                      </span>
                    ) : (
                      // Soft filled circle behind the active icon, so the
                      // current destination is obvious at a glance.
                      <span
                        className={cx(
                          'flex size-9 items-center justify-center rounded-full transition-all duration-200',
                          isActive
                            ? 'bg-primary-soft'
                            : 'group-hover:bg-surface-container'
                        )}
                      >
                        <Icon className="size-[21px]" strokeWidth={isActive ? 2.2 : 1.9} />
                      </span>
                    )}
                    {/* Icon-only below `sm` so five destinations still fit on a
                        narrow phone; short labels from `sm` up. */}
                    <span
                      className={cx(
                        'hidden truncate text-[10px] leading-none tracking-tight transition-colors sm:block',
                        isActive ? 'font-semibold' : 'font-medium'
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
