import { ListChecks } from 'lucide-react'
import TaskItem from './TaskItem'
import EmptyState from '@/shared/components/ui/EmptyState'

export default function TaskList({ tasks, onEdit, emptyTitle = 'No tasks here yet' }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={emptyTitle}
        description="Add a task or change your filters to see more."
      />
    )
  }

  return (
    <div className="flex flex-col">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onEdit={onEdit} />
      ))}
    </div>
  )
}