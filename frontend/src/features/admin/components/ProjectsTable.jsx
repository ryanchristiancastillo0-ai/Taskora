import DataTable from '@/shared/components/ui/DataTable'
import Avatar from '@/shared/components/ui/Avatar'
import Badge from '@/shared/components/ui/Badge'
import { PROJECT_STATUS } from '@/shared/constants'
import { formatDate, timeAgo } from '@/shared/utils/format'

// System-wide project table. Read-only for the same reason the admin task table
// is: the user app already owns project lifecycle, and an admin editing a
// project from here would be editing somebody else's workspace with no undo.
export default function ProjectsTable({ items }) {
  const columns = [
    {
      key: 'name',
      label: 'Project',
      render: (project) => (
        <div className="flex items-center gap-3">
          <span
            className="size-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: project.color || '#4D3EC8' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{project.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {project.tasks} {project.tasks === 1 ? 'task' : 'tasks'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (project) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={project.owner.name} src={project.owner.avatarUrl} size="sm" />
          <span className="whitespace-nowrap text-ink-soft">{project.owner.name}</span>
        </div>
      ),
    },
    {
      key: 'tasks',
      label: 'Tasks',
      className: 'text-right tabular-nums',
      render: (project) => project.tasks,
    },
    {
      key: 'status',
      label: 'Status',
      render: (project) => {
        const meta = PROJECT_STATUS[project.status] || PROJECT_STATUS.ACTIVE
        return <Badge tone={meta.tone}>{meta.label}</Badge>
      },
    },
    {
      key: 'created',
      label: 'Created',
      render: (project) => (
        <span className="whitespace-nowrap text-ink-muted">{formatDate(project.createdAt)}</span>
      ),
    },
    {
      key: 'updated',
      label: 'Updated',
      render: (project) => (
        <span className="whitespace-nowrap text-ink-muted">{timeAgo(project.updatedAt)}</span>
      ),
    },
  ]

  return <DataTable columns={columns} items={items} getRowId={(project) => project.id} />
}
