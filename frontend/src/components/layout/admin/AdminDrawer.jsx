import {
  ADMIN_DRAWER_SECONDARY_NAV,
  ADMIN_PROFILE_DRAWER_NAV,
} from '@/constants/index'
import MobileDrawer from '@/components/layout/MobileDrawer'

/**
 * The admin console's account drawer.
 *
 * It brings its own navigation lists rather than reusing the user app's, because
 * `/profile` and `/admin/profile` are different pages and NavLink's active state
 * would never match across them. There is no "Switch" group: the console no
 * longer offers a route back into the user app, so `switchNav` stays empty and
 * MobileDrawer drops the section.
 */
export default function AdminDrawer({ open, onClose }) {
  return (
    <MobileDrawer
      open={open}
      onClose={onClose}
      subtitle="Admin console"
      accountNav={ADMIN_PROFILE_DRAWER_NAV}
      secondaryNav={ADMIN_DRAWER_SECONDARY_NAV}
      secondaryLabel="More"
      projects={[]}
    />
  )
}
