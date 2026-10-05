import BottomNavBar from '@/components/layout/BottomNavBar'
import { MOBILE_BOTTOM_NAV } from '@/constants/index'

/**
 * The user app's mobile bottom navigation.
 *
 * A thin wrapper over the shared BottomNavBar; the destinations and their order
 * live in MOBILE_BOTTOM_NAV so the bar, the sidebar and the router can be
 * compared in one place. See BottomNavBar for the layout and the
 * `.pb-safe-for-bottom-nav` clearance contract in `index.css`.
 */
export default function MobileBottomNav() {
  return <BottomNavBar items={MOBILE_BOTTOM_NAV} ariaLabel="Primary" />
}
