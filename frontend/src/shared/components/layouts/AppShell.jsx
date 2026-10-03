import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cx } from '@/shared/utils/format'
import AdminAiWidget from '@/features/admin/components/AdminAiWidget'
import AdminSidebar from '@/features/admin/layout/AdminSidebar'
import UserSidebar from '@/features/user/layout/UserSidebar'
import AdminBottomNav from './admin/AdminBottomNav'
import AdminDrawer from './admin/AdminDrawer'
import AdminHeader from './admin/AdminHeader'
import UserBottomNav from './user/UserBottomNav'
import UserDrawer from './user/UserDrawer'
import UserHeader from './user/UserHeader'

// The admin console owns a different navigation surface, but it deliberately
// shares this shell. The fixed header, the `lg:pl-64` content offset and the
// main padding are geometry, not navigation — forking them into a second
// AdminLayout would guarantee the two drifted out of alignment. Only the header,
// the sidebars, the bottom bar and the drawer swap.
const ADMIN_PREFIX = '/admin'

export default function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const isAdmin =
    location.pathname === ADMIN_PREFIX ||
    location.pathname.startsWith(`${ADMIN_PREFIX}/`)

  // Navigating away should never leave the drawer covering the new page. The
  // bottom bar is links-only, so it needs no equivalent handling.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const openDrawer = () => setDrawerOpen(true)
  const closeDrawer = () => setDrawerOpen(false)

  return (
    <div className="min-h-screen bg-canvas">
      {isAdmin ? <AdminSidebar /> : <UserSidebar />}
      <div className="lg:pl-64">
        {isAdmin ? (
          <AdminHeader onProfileClick={openDrawer} drawerOpen={drawerOpen} />
        ) : (
          <UserHeader onProfileClick={openDrawer} drawerOpen={drawerOpen} />
        )}
        {/* pb-14 is the desktop padding. Below `lg` the fixed bottom bar takes
            over and the page needs extra room so the last card, form or button
            is never trapped underneath it. `.pb-safe-for-bottom-nav` in index.css
            supplies the matching clearance for whichever bar is mounted.
            `pb-safe-for-assistant` adds the console's copilot launcher on top of
            that: it is fixed in the same bottom-right corner and, without the
            extra room, sat on top of the admin tables' Previous/Next row. Admin
            only, because that is the only shell that mounts the launcher. */}
        <main
          className={cx(
            'px-4 pb-14 pt-24 pb-safe-for-bottom-nav sm:px-6',
            isAdmin && 'pb-safe-for-assistant'
          )}
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      {isAdmin ? <AdminBottomNav /> : <UserBottomNav />}
      {/* Two drawers rather than one branching on `isAdmin`: the console's links
          all stay inside the console, so there is no reason for the two to share
          anything but the shell they are drawn by. */}
      {isAdmin ? (
        <AdminDrawer open={drawerOpen} onClose={closeDrawer} />
      ) : (
        <UserDrawer open={drawerOpen} onClose={closeDrawer} />
      )}
      {/* Mounted here, and only for the console, so the copilot outlives a
          page change. It was on the dashboard before, which meant that asking a
          question and then opening /admin/users unmounted the widget, discarded
          the in-flight request, and lost an answer the provider had already been
          paid to produce. The thread itself now lives on the server, so this
          placement is about the panel staying put — the launcher is fixed
          anyway, and having it vanish on the second click looked like a bug. */}
      {isAdmin && <AdminAiWidget />}
    </div>
  )
}
