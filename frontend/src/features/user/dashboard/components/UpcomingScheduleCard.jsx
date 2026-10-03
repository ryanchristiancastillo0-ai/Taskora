import { CalendarDays } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import {
  cx,
  dueLabel,
  formatTime,
  isOverdue,
  isToday,
  isTomorrow,
} from '@/shared/utils/format'
import Card, { CardHeader } from '@/shared/components/ui/Card'

function dayLabel(date) {
  if (isToday(date)) return { text: 'Today', tone: 'text-danger' }
  if (isTomorrow(date)) return { text: 'Tomorrow', tone: 'text-primary' }
  return { text: dueLabel(date), tone: 'text-ink-muted' }
}

const dotTones = { Today: 'bg-danger', Tomorrow: 'bg-primary-container' }

export default function UpcomingScheduleCard({ onOpenAll }) {
  const { data } = useApp()
  const upcoming = data.tasks
    .filter((task) => task.dueDate && task.status !== 'COMPLETED')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 4)

  return (
    <Card>
      <CardHeader title="Upcoming schedule" icon={CalendarDays} />
      <div className="relative flex flex-col gap-6 pl-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-surface-high">
        {upcoming.map((task) => {
          const label = dayLabel(task.dueDate)
          return (
            <div key={task.id} className="relative">
              <span
                className={cx(
                  'absolute -left-5 top-1 size-3 rounded-full ring-4 ring-surface-card',
                  isOverdue(task.dueDate)
                    ? 'bg-danger'
                    : dotTones[label.text] ?? 'bg-ink-faint'
                )}
              />
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cx(
                    'text-[11px] font-semibold uppercase tracking-wide',
                    label.tone
                  )}
                >
                  {label.text}
                </span>
                <span className="text-xs text-ink-muted">{formatTime(task.dueDate)}</span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-ink">{task.title}</p>
              {task.projectId && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  {
                    data.projects.find((project) => project.id === task.projectId)
                      ?.name
                  }
                </p>
              )}
            </div>
          )
        })}
        {upcoming.length === 0 && (
          <p className="text-[13px] text-ink-muted">Nothing upcoming.</p>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenAll}
        className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-field bg-surface-container py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-high hover:text-ink"
      >
        <CalendarDays className="size-4" strokeWidth={2} />
        Open full calendar
      </button>
    </Card>
  )
}