import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ListChecks,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AiAssistantCard from '../components/AiAssistantCard'
import ProjectsProgressCard from '../components/ProjectsProgressCard'
import StatsCard from '../components/StatsCard'
import TodayTasksCard from '../components/TodayTasksCard'
import UpcomingScheduleCard from '../components/UpcomingScheduleCard'
import TaskFormModal from '../../tasks/components/TaskFormModal'
import { useApp } from '../../context/AppContext'
import { greeting, displayName } from '@/shared/utils/format'

export default function Dashboard() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)

  const stats = useMemo(() => {
    const pending = data.tasks.filter((task) => task.status !== 'COMPLETED')
    const todayStr = new Date().toDateString()
    const dueToday = pending.filter(
      (task) => task.dueDate && new Date(task.dueDate).toDateString() === todayStr
    )
    const completedToday = data.tasks.filter(
      (task) =>
        task.status === 'COMPLETED' &&
        task.completedAt &&
        new Date(task.completedAt).toDateString() === todayStr
    )
    const overdue = pending.filter(
      (task) => task.dueDate && new Date(task.dueDate) < new Date()
    )
    const total = data.tasks.length
    const completed = data.tasks.filter(
      (task) => task.status === 'COMPLETED'
    ).length
    return {
      dueToday: dueToday.length,
      completedToday: completedToday.length,
      inProgress: pending.filter((task) => task.status === 'IN_PROGRESS').length,
      overdue: overdue.length,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }, [data.tasks])

  const openEdit = (task) => setEditing(task)
  const closeModals = () => {
    setEditing(null)
    setShowNew(false)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-primary">
            {greeting()}, {displayName(data.profile.preferredName, data.user.firstName)}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink">
            Here's today at a glance
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Due today"
          value={stats.dueToday}
          sub={`${stats.completedToday} done`}
          icon={CalendarClock}
          tone="amber"
          progress={
            stats.dueToday > 0
              ? Math.round((stats.completedToday / stats.dueToday) * 100)
              : 0
          }
        />
        <StatsCard
          label="In progress"
          value={stats.inProgress}
          sub="active tasks"
          icon={ListChecks}
          tone="indigo"
        />
        <StatsCard
          label="Overdue"
          value={stats.overdue}
          sub={stats.overdue > 0 ? 'needs attention' : 'nothing pending'}
          icon={AlertTriangle}
          tone="red"
        />
        <StatsCard
          label="Overall completion"
          value={`${stats.completionRate}%`}
          sub="of all tasks"
          icon={CheckCircle2}
          tone="green"
          progress={stats.completionRate}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <TodayTasksCard
            onEdit={openEdit}
            onNew={() => setShowNew(true)}
            onViewAll={() => navigate('/tasks')}
          />
          <ProjectsProgressCard onViewAll={() => navigate('/projects')} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <AiAssistantCard />
          <UpcomingScheduleCard onOpenAll={() => navigate('/calendar')} />
        </div>
      </div>

      <TaskFormModal open={showNew || !!editing} onClose={closeModals} task={editing} />
    </div>
  )
}