import { LogOut, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ADMIN_NAV_SECTIONS } from '@/shared/constants'
import Avatar from '@/shared/components/ui/Avatar'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import { SidebarNavSections } from '@/shared/components/layouts/SidebarNavItem'
import { useApp } from '../../user/context/AppContext'

/**
 * The admin console's navigation.
 *
 * Intentionally the same component vocabulary and the same tokens as
 * UserSidebar — same width, same header block, same nav rows, same footer. The
 * admin area is Taskora with different content, not a different product, and an
 * earlier version of this file gave itself an amber brand and a "restricted
 * area" banner that made it read as a third-party admin template bolted onto
 * the side. Every colour below comes from the shared theme.
 *
 * What is deliberately different is content, not appearance: no project list and
 * no direct-message heads, because both describe one specific person's workspace
 * and would leak that person's data into a screen full of other people's.
 *
 * Because every destination is now its own route, active state is plain NavLink
 * matching. The previous version had to hand-roll it to compare `location.hash`
 * for a single-page console; that hack is gone with the anchors.
 *
 * Desktop-only from `lg` up, matching the user sidebar. Below that,
 * AdminBottomNav takes over.
 */
export default function AdminSidebar() {
  const { data, actions } = useApp()
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <>
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-border-subtle bg-surface-card lg:flex">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-ink">Taskora</span>
              <span className="text-[11px] font-medium text-ink-muted">Admin console</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          <SidebarNavSections sections={ADMIN_NAV_SECTIONS} />
        </div>

        <div className="border-t border-border-subtle p-3">
          <div className="flex items-center justify-between gap-2 rounded-card bg-canvas px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={`${data.user.firstName} ${data.user.lastName}`} status="online" />
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
              onClick={() => setConfirmLogout(true)}
              className="flex size-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-card hover:text-ink"
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
    </>
  )
}
