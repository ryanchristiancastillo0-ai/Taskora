import { LogOut, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_SECTIONS } from '@/shared/constants/index'
import Avatar from '@/shared/components/ui/Avatar'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import { SidebarNavSections } from '@/shared/components/layouts/SidebarNavItem'
import { useApp } from '../context/AppContext'
import SidebarChatHeads from './SidebarChatHeads'

function ProjectLink({ project }) {
  return (
    <NavLink
      to={`/tasks?project=${project.id}`}
      className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
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
 * The signed-in user's own navigation.
 *
 * Personal by design: the project list and the DM heads below it only make sense
 * for one account, which is why they do not appear in the admin console (see
 * features/admin/layout/AdminSidebar.jsx). The surfaces are otherwise shared
 * with it deliberately — same width, same border, same footer — so moving
 * between the two never shifts the content column.
 *
 * Desktop-only from `lg` up. Below that the mobile layout uses the fixed bottom
 * bar plus the right-side account drawer (MobileProfileDrawer), so this renders
 * pinned and inert on small screens with no overlay or close button.
 */
export default function UserSidebar() {
  const { data, actions } = useApp()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const activeProjects = data.projects.filter((project) => project.status !== 'ARCHIVED')

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
              <span className="text-[11px] font-medium text-ink-muted">Personal task manager</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          <SidebarNavSections sections={NAV_SECTIONS} />

          <div className="mb-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Projects
            </p>
            <nav className="flex flex-col gap-0.5">
              {activeProjects.map((project) => (
                <ProjectLink key={project.id} project={project} />
              ))}
            </nav>
          </div>
        </div>

        <SidebarChatHeads />

        <div className="border-t border-border-subtle p-3">
          <div className="flex items-center justify-between gap-2 rounded-card bg-canvas px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={`${data.user.firstName} ${data.user.lastName}`} status="online" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {data.profile.preferredName || data.user.firstName}
                </span>
                <span className="truncate text-[11px] text-ink-muted">
                  {data.user.email}
                </span>
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
