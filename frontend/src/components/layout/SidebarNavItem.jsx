import { NavLink } from 'react-router-dom'
import { cx } from '@/utils/format'

/**
 * One row in a sidebar's navigation list.
 *
 * Shared by the user sidebar and the admin console so the two cannot drift
 * apart. They are the same product showing different content, and the first
 * version of the admin sidebar had to be corrected precisely because its own
 * copy of this row had been given a different colour. A shared component makes
 * "same UI, different items" structural instead of a thing to remember.
 */
export function SidebarNavItem({ item }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'group flex items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
          isActive
            ? 'bg-primary-soft text-primary'
            : 'text-ink-soft hover:bg-surface-container hover:text-ink'
        )
      }
    >
      <span className="flex items-center gap-2.5">
        <Icon
          className={cx('size-[18px]', item.badge ? 'text-primary' : '')}
          strokeWidth={1.9}
        />
        <span>{item.label}</span>
      </span>
      {item.badge && (
        <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
          {item.badge}
        </span>
      )}
    </NavLink>
  )
}

/**
 * Renders a `[{ label, items }]` section list — the shape both NAV_SECTIONS and
 * ADMIN_NAV_SECTIONS use. A null `label` renders an unlabelled group, which is
 * how each sidebar's primary section stays tight against the header.
 */
export function SidebarNavSections({ sections }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.label ?? section.items[0].label} className="mb-5">
          {section.label && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {section.label}
            </p>
          )}
          <nav className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <SidebarNavItem key={item.to + item.label} item={item} />
            ))}
          </nav>
        </div>
      ))}
    </>
  )
}
