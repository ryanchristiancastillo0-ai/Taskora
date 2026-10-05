import { PRIORITY, TASK_STATUS } from '@/constants/index'
import Badge from '@/components/ui/Badge'

const STATUS_TONES = {
  TODO: 'slate',
  IN_PROGRESS: 'indigo',
  COMPLETED: 'green',
  CANCELLED: 'muted',
}

const PRIORITY_TONES = {
  LOW: 'slate',
  MEDIUM: 'amber',
  HIGH: 'rose',
  URGENT: 'red',
}

export function StatusBadge({ status }) {
  const meta = TASK_STATUS[status] ?? TASK_STATUS.TODO
  return <Badge tone={STATUS_TONES[status] ?? 'slate'}>{meta.label}</Badge>
}

export function PriorityBadge({ priority }) {
  const meta = PRIORITY[priority] ?? PRIORITY.LOW
  return (
    <Badge tone={PRIORITY_TONES[priority] ?? 'slate'} dot>
      {meta.label}
    </Badge>
  )
}

export { STATUS_TONES, PRIORITY_TONES }