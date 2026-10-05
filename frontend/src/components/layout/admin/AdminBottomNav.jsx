import BottomNavBar from '@/components/layout/BottomNavBar'
import { ADMIN_MOBILE_NAV } from '@/constants'

/**
 * Mobile bottom navigation for the admin console.
 *
 * The console is Taskora with different content, not a different product, so
 * this is the *same* component as the user app's bar with a different item list
 * — the shared BottomNavBar, the same five slots, the same floating blurred
 * surface, the same 64px height, the same 44px touch targets, the same
 * `.pb-safe-for-bottom-nav` clearance contract. A private copy of that markup
 * was what this file used to be, and the only real difference was that it had
 * three items and a "More" sheet instead of five.
 *
 * `/admin/ai-usage` is the console's counterpart to the user app's AI
 * Assistant, so it occupies the centre slot and gets the raised brand disc.
 *
 * Destinations not on the bar (Reports) live in AdminDrawer, which AppShell
 * renders for the console so its links stay inside it.
 */
export default function AdminBottomNav() {
  return <BottomNavBar items={ADMIN_MOBILE_NAV} ariaLabel="Admin" />
}
