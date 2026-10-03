import { DRAWER_SECONDARY_NAV, PROFILE_DRAWER_NAV } from '../../../constants/index'
import { useApp } from '@/features/user/context/AppContext'
import MobileDrawer from '../MobileDrawer'

/**
 * The signed-in person's own account drawer.
 *
 * It is the only one of the two that lists projects: those describe one
 * person's workspace, which is exactly what must not appear in a console full of
 * other people's data. The console's counterpart is layouts/admin/AdminDrawer.
 */
export default function UserDrawer({ open, onClose }) {
  const { data } = useApp()
  const projects = data.projects.filter((project) => project.status !== 'ARCHIVED')

  return (
    <MobileDrawer
      open={open}
      onClose={onClose}
      subtitle="Account"
      accountNav={PROFILE_DRAWER_NAV}
      secondaryNav={DRAWER_SECONDARY_NAV}
      secondaryLabel="Workspace"
      projects={projects}
    />
  )
}
