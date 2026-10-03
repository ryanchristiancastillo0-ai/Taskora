import { useState } from 'react'
import { LayoutDashboard, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '@/features/user/context/AppContext'
import Avatar from '../../ui/Avatar'
import IconButton from '../../ui/IconButton'
import NotificationBell from '../NotificationBell'
import AdminSearch from './AdminSearch'
import { cx, personName } from '../../../utils/format'

/**
 * The admin console's header.
 *
 * Deliberately not the user header with a prop flipped. Two things make the
 * console its own surface:
 *
 *   - No "Ask AI". It is a shortcut into the user app's assistant, and the one
 *     control in this bar that leaves the console. Everything else here either
 *     stays put or links to an admin route.
 *   - Its own search, which covers accounts, tasks and projects rather than the
 *     signed-in person's own tasks and projects. An admin looking for "coffee"
 *     wants the account called Coffee, the tasks called Coffee and the project
 *     called Coffee Bar - not their own list.
 *
 * The geometry is still the shared shell's: same fixed h-16, same `lg:left-64`
 * offset, same blur and border, so the console lines up pixel-for-pixel with the
 * user app above it. Only the contents differ.
 */
export default function AdminHeader({ onProfileClick, drawerOpen = false }) {
  const { data } = useApp()
  // Below `sm` there is no room for a permanent field, a bell and an avatar on
  // one 320px row, so search collapses to an icon that reveals it full width -
  // the same reveal the user header uses, so the two behave alike.
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border-subtle bg-surface-card/85 px-4 backdrop-blur-xl sm:gap-3 sm:px-6 lg:left-64">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* The sidebar carries the brand from `lg` up, so the header only shows
            it below `lg`. It steps aside while the phone search is open so the
            field gets the whole row. */}
        <div className={cx('flex shrink-0 items-center gap-2 lg:hidden', searchOpen && 'hidden sm:flex')}>
          <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <LayoutDashboard className="size-4" strokeWidth={2} />
          </div>
          <span className="text-sm font-bold tracking-tight text-ink">Admin</span>
        </div>

        <div className={cx('min-w-0 max-w-md flex-1', searchOpen ? 'block' : 'hidden sm:block')}>
          <AdminSearch />
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
        <IconButton
          icon={Search}
          label={searchOpen ? 'Close search' : 'Search'}
          onClick={() => setSearchOpen((open) => !open)}
          aria-expanded={searchOpen}
          className={cx('sm:hidden', searchOpen && 'bg-primary-soft text-primary')}
        />
        {/* While the phone search is open the row belongs to the field. The bell
            and the avatar step aside so the field gets real width instead of the
            ~70px it was being squeezed into with three other 36px controls on a
            320px row, and they return the moment it closes. */}
        {!searchOpen && <NotificationBell />}
        {/* The avatar is the mobile menu trigger. On desktop it stays a plain
            link to the console's own profile page. */}
        <Link to="/admin/profile" aria-label="Profile" className="hidden lg:block">
          <Avatar name={personName(data.user)} src={data.user.avatarUrl} status="online" />
        </Link>
        {!searchOpen && (
          <button
            type="button"
            onClick={onProfileClick}
            aria-label="Open account menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
          >
            <Avatar name={personName(data.user)} src={data.user.avatarUrl} status="online" />
          </button>
        )}
      </div>
    </header>
  )
}
