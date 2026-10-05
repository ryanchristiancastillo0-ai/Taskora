import { Clock, MoreHorizontal, Paperclip, Pencil, Trash2 } from 'lucide-react'
import { priorityMeta } from '@/constants/index'
import { useApp } from '@/app/providers/AppContext'
import { cx, dueLabel } from '@/utils/format'
import Checkbox from '@/components/ui/Checkbox'
import Dropdown, { MenuItem } from '@/components/ui/Dropdown'
import IconButton from '@/components/ui/IconButton'
import PriorityDot from '@/components/ui/PriorityDot'
import Tooltip from '@/components/ui/Tooltip'
import { PriorityBadge, StatusBadge } from './StatusBadge'

function ProjectPill({ project }) {
  if (!project) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-ink-soft">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: project.color }} />
      {project.name}
    </span>
  )
}

export default function TaskItem({ task, onEdit }) {
  const { data, actions, pushToast } = useApp()
  const project = data.projects.find((item) => item.id === task.projectId)
  const completed = task.status === 'COMPLETED'

  const handleToggle = () => {
    actions.toggleTaskComplete(task.id)
    pushToast(completed ? 'Task restored' : 'Task completed', 'info')
  }

  const handleDelete = () => {
    actions.removeTask(task.id)
    pushToast('Task deleted', 'warn')
  }

  const priority = priorityMeta(task.priority)?.message

  return (
    <div
      className={cx(
        'group flex flex-col gap-2 rounded-card border border-transparent px-3 py-3 transition-colors hover:border-border-subtle hover:bg-surface-soft sm:flex-row sm:items-center',
        completed && 'opacity-70'
      )}
    >
      <Tooltip
        label={priority}
        id={`task-priority-tip-${task.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 pr-2"
      >
        <Checkbox checked={completed} onChange={handleToggle} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PriorityDot priority={task.priority} className="-mt-px" />
            <p
              className={cx(
                'truncate text-sm font-medium text-ink transition-colors',
                completed && 'text-ink-muted line-through'
              )}
            >
              {task.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ProjectPill project={project} />
            <PriorityBadge priority={task.priority} />
            {task.dueDate && (
              <span
                className={cx(
                  'inline-flex items-center gap-1 text-xs',
                  new Date(task.dueDate) < new Date() && !completed
                    ? 'font-medium text-danger'
                    : 'text-ink-muted'
                )}
              >
                <Clock className="size-3" strokeWidth={2} />
                {dueLabel(task.dueDate)}
              </span>
            )}
            {task.estimatedMinutes && (
              <span className="text-xs text-ink-faint">{task.estimatedMinutes}m</span>
            )}
            {(task.attachmentCount ?? task.attachments?.length) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                <Paperclip className="size-3" strokeWidth={2} />
                {task.attachmentCount ?? task.attachments?.length}
              </span>
            )}
          </div>
        </div>
      </Tooltip>

      <div className="flex items-center gap-2 pl-[30px] sm:pl-0">
        <StatusBadge status={task.status} />
        <Dropdown
          trigger={
            <IconButton
              icon={MoreHorizontal}
              label="Task actions"
              size="sm"
              className="opacity-60 transition-opacity group-hover:opacity-100"
            />
          }
        >
          <MenuItem icon={Pencil} label="Edit" onClick={() => onEdit(task)} />
          <MenuItem icon={Trash2} label="Delete" danger onClick={handleDelete} />
        </Dropdown>
      </div>
    </div>
  )
}