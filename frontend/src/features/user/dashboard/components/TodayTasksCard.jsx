import { Plus } from 'lucide-react'
import { useApp } from '@/app/providers/AppContext'
import { isToday } from '@/utils/format'
import Card, { CardHeader } from '@/components/ui/Card'
import TaskList from '@/features/user/tasks/components/TaskList'

export default function TodayTasksCard({ onEdit, onNew, onViewAll }) {
  const { data } = useApp()
  const todayTasks = data.tasks
    .filter((task) => task.status !== 'CANCELLED' && isToday(task.dueDate))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5)

  return (
    <Card>
      <CardHeader
        title="Today's tasks"
        subtitle={`${todayTasks.length} scheduled for today`}
        icon={Plus}
        actions={
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:text-primary-strong"
          >
            <Plus className="size-4" strokeWidth={2} />
            Add task
          </button>
        }
      />
      <TaskList tasks={todayTasks} onEdit={onEdit} emptyTitle="Nothing scheduled today" />
      {todayTasks.length > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-3 text-[13px] font-medium text-primary transition-colors hover:text-primary-strong"
        >
          View all tasks →
        </button>
      )}
    </Card>
  )
}