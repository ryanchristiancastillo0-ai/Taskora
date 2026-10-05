import { CheckCircle2 } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import DataTable from '@/components/ui/DataTable'
import PriorityDot from '@/components/ui/PriorityDot'
import { TASK_STATUS, priorityMeta } from '@/constants'
import { formatDate, isOverdue } from '@/utils/format'

// System-wide task table for the admin console. Read-only by design: this page
// exists so an admin can inspect what is happening across the platform, and task
// editing already has a full owner-facing flow in the user app that an admin
// bypass would be a worse version of.
export default function TasksTable({ items }) {
  const columns = [
    {
      key: 'title',
      label: 'Task',
      render: (task) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="truncate text-xs text-ink-muted">
            {task.project ? task.project.name : 'No project'}
          </p>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (task) => (
        <span className="whitespace-nowrap text-ink-soft">{task.owner.name}</span>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (task) => {
        const meta = priorityMeta(task.priority)
        if (!meta) return <span className="text-ink-faint">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <PriorityDot priority={task.priority} />
            {meta.label}
          </span>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (task) => {
        const meta = TASK_STATUS[task.status] || TASK_STATUS.TODO
        return <Badge tone={meta.tone}>{meta.label}</Badge>
      },
    },
    {
      key: 'due',
      label: 'Due',
      render: (task) => {
        if (!task.dueDate) {
          return <span className="whitespace-nowrap text-ink-faint">No due date</span>
        }
        const overdue =
          isOverdue(task.dueDate) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED'
        return (
          <span className={overdue ? 'whitespace-nowrap text-error' : 'whitespace-nowrap text-ink-muted'}>
            {overdue ? 'Overdue · ' : ''}
            {formatDate(task.dueDate)}
          </span>
        )
      },
    },
    {
      key: 'created',
      label: 'Created',
      render: (task) => (
        <span className="whitespace-nowrap text-ink-muted">{formatDate(task.createdAt)}</span>
      ),
    },
    {
      key: 'completed',
      label: 'Completed',
      render: (task) =>
        task.completedAt ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-muted">
            <CheckCircle2 className="size-3.5 text-success" strokeWidth={2} />
            {formatDate(task.completedAt)}
          </span>
        ) : (
          <span className="whitespace-nowrap text-ink-faint">—</span>
        ),
    },
  ]

  return <DataTable columns={columns} items={items} getRowId={(task) => task.id} />
}
