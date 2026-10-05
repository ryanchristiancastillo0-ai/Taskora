import { CalendarDays, ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { calendarMatrix, cx, isToday, monthLabel } from '@/utils/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRIORITY_STYLES = {
  low: 'bg-surface-container text-ink-soft',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-rose-50 text-rose-700',
}

export default function CalendarGrid({ tasks, project }) {
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(new Date(today))

  const tasksByDate = useMemo(() => {
    const map = new Map()
    tasks
      .filter((task) => task.dueDate && task.status !== 'CANCELLED')
      .forEach((task) => {
        const key = new Date(task.dueDate).toDateString()
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(task)
      })
    return map
  }, [tasks])

  const cells = useMemo(
    () => calendarMatrix(month.getFullYear(), month.getMonth()),
    [month]
  )

  const shiftMonth = (delta) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelected(new Date(today))
  }

  const selectedTasks = tasksByDate.get(selected.toDateString()) ?? []
  const selectedLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(selected)
  const isSelectedToday = selected.toDateString() === today.toDateString()

  const getProject = (task) =>
    task.projectId ? project.find((item) => item.id === task.projectId) : null

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {/* Calendar */}
      <div className="rounded-2xl border border-border-subtle bg-surface-card shadow-sm xl:col-span-2">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{monthLabel(month)}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
            >
              Today
            </button>
            <div className="mx-1 h-4 w-px bg-border-subtle" />
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="flex size-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="flex size-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="pb-3 text-center text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} />
              }
              const dayTasks = tasksByDate.get(date.toDateString()) ?? []
              const active = selected.toDateString() === date.toDateString()
              const todayCell = isToday(date)
              const dotColors = dayTasks
                .slice(0, 4)
                .map((task) => getProject(task)?.color ?? '#1D61F2')

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={cx(
                    'group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-[13px] transition-all',
                    active
                      ? 'bg-primary-container text-white shadow-[0_4px_14px_-2px_rgba(29,97,242,0.4)]'
                      : todayCell
                        ? 'text-primary ring-1 ring-inset ring-primary-container/40 hover:bg-primary-faint'
                        : 'text-ink-soft hover:bg-surface-container'
                  )}
                >
                  <span className={cx('font-medium', (active || todayCell) && 'font-semibold')}>
                    {date.getDate()}
                  </span>
                  {dotColors.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {dotColors.map((color, i) => (
                        <span
                          key={i}
                          className="size-1 rounded-full"
                          style={{ backgroundColor: active ? 'currentColor' : color }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      <div className="flex flex-col rounded-2xl border border-border-subtle bg-surface-card shadow-sm">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-ink">{selectedLabel}</p>
            {isSelectedToday && (
              <span className="rounded-full bg-primary-faint px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                Today
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {selectedTasks.length === 0
              ? 'No tasks due this day'
              : `${selectedTasks.length} task${selectedTasks.length > 1 ? 's' : ''} due`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {selectedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-surface-container">
                <CalendarDays className="size-5 text-ink-faint" strokeWidth={1.75} />
              </div>
              <p className="text-[13px] text-ink-muted">Nothing scheduled for this day.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {selectedTasks.map((task) => {
                const taskProject = getProject(task)
                const priorityKey = task.priority?.toLowerCase() ?? 'low'
                const done = task.status === 'COMPLETED'
                return (
                  <div
                    key={task.id}
                    className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-container"
                  >
                    <Circle
                      className={cx(
                        'mt-0.5 size-3.5 shrink-0',
                        done ? 'fill-primary-container text-primary-container' : 'text-ink-faint'
                      )}
                      strokeWidth={2}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cx(
                          'truncate text-[13.5px] font-medium',
                          done ? 'text-ink-muted line-through' : 'text-ink'
                        )}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {taskProject && (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: taskProject.color }}
                            />
                            {taskProject.name}
                          </span>
                        )}
                        <span
                          className={cx(
                            'rounded-full px-1.5 py-0.5 text-[10.5px] font-medium capitalize',
                            PRIORITY_STYLES[priorityKey] ?? PRIORITY_STYLES.low
                          )}
                        >
                          {task.priority.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}