import {
  Eye,
  MoreHorizontal,
  Shield,
  ShieldOff,
  Unlock,
  Lock,
} from 'lucide-react'
import Avatar from '@/shared/components/ui/Avatar'
import Badge from '@/shared/components/ui/Badge'
import DataTable from '@/shared/components/ui/DataTable'
import Dropdown, { MenuItem, MenuSeparator } from '@/shared/components/ui/Dropdown'
import { ACCOUNT_STATUS, ACTIVITY_STATUS, userRoleMeta } from '@/shared/constants'
import { formatDate, timeAgo } from '@/shared/utils/format'

// Presentational only. Every filter, sort and mutation lives in pages/Users.jsx,
// so this component can be reused by the detail view and would survive being
// pointed at real API data without being rewritten.
export default function UsersTable({ items, onView, onToggleStatus, onToggleRole }) {
  const columns = [
    {
      key: 'user',
      label: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.name} src={user.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (user) => (
        <Badge tone={user.role === 'ADMIN' ? 'indigo' : 'muted'}>{user.role === 'ADMIN' ? 'Admin' : 'User'}</Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      // Two different columns, deliberately side by side. "Suspended" is
      // something an admin did; "Inactive" is something the data says. Showing
      // only one of them is how an admin ends up mistaking a quiet account for
      // a banned one.
      render: (user) => {
        const account = ACCOUNT_STATUS[user.status] || ACCOUNT_STATUS.ACTIVE
        const activity = ACTIVITY_STATUS[user.activity] || ACTIVITY_STATUS.INACTIVE
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={account.tone}>{account.label}</Badge>
            {user.activity !== 'ACTIVE' && <Badge tone={activity.tone}>{activity.label}</Badge>}
          </div>
        )
      },
    },
    {
      key: 'tasks',
      label: 'Tasks',
      className: 'text-right tabular-nums',
      render: (user) => user.tasks,
    },
    {
      key: 'projects',
      label: 'Projects',
      className: 'text-right tabular-nums',
      render: (user) => user.projects,
    },
    {
      key: 'joined',
      label: 'Joined',
      render: (user) => (
        <span className="whitespace-nowrap text-ink-muted">{formatDate(user.joinedAt)}</span>
      ),
    },
    {
      key: 'lastActive',
      label: 'Last active',
      render: (user) =>
        user.lastActiveAt ? (
          <span className="whitespace-nowrap text-ink-muted">{timeAgo(user.lastActiveAt)}</span>
        ) : (
          <span className="whitespace-nowrap text-ink-faint">Never</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-0 text-right',
      className: 'text-right',
      render: (user) => (
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${user.name}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-container hover:text-ink"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </button>
          }
        >
          <MenuItem icon={Eye} label="View details" onClick={() => onView(user)} />
          <MenuSeparator />
          <MenuItem
            icon={user.role === 'ADMIN' ? ShieldOff : Shield}
            // Names the role being switched TO, looked up by value rather than by
            // position: USER_ROLES[0] happens to be 'User' today, but a reordered
            // array would produce "Demote to Admin".
            label={`Switch to ${userRoleMeta(user.role === 'ADMIN' ? 'USER' : 'ADMIN')?.label ?? 'User'}`}
            onClick={() => onToggleRole(user)}
          />
          <MenuItem
            icon={user.status === 'SUSPENDED' ? Unlock : Lock}
            label={user.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}
            danger={user.status !== 'SUSPENDED'}
            onClick={() => onToggleStatus(user)}
          />
        </Dropdown>
      ),
    },
  ]

  return <DataTable columns={columns} items={items} getRowId={(user) => user.id} />
}
