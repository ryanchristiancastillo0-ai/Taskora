import { FolderOpen } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import ProgressBar from '@/shared/components/ui/ProgressBar'
import Badge from '@/shared/components/ui/Badge'

export function projectProgress(projects, tasks) {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id)
    const completed = projectTasks.filter(
      (task) => task.status === 'COMPLETED'
    ).length
    const total = projectTasks.length
    return {
      project,
      total,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  })
}

export default function ProjectsProgressCard({ onViewAll }) {
  const { data } = useApp()
  const active = projectProgress(
    data.projects.filter((project) => project.status === 'ACTIVE'),
    data.tasks
  )

  return (
    <Card>
      <CardHeader
        title="Projects progress"
        subtitle={`${active.length} active ${active.length === 1 ? 'project' : 'projects'}`}
        icon={FolderOpen}
        actions={
          <button
            type="button"
            onClick={onViewAll}
            className="text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            View all →
          </button>
        }
      />
      <div className="flex flex-col gap-4">
        {active.map(({ project, total, completed, percent }) => (
          <div
            key={project.id}
            className="rounded-card bg-canvas p-4 transition-colors hover:bg-surface-container"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="size-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate text-[13.5px] font-semibold text-ink">
                  {project.name}
                </span>
                {percent === 100 && <Badge tone="green">Done</Badge>}
              </div>
              <span className="flex-shrink-0 text-xs font-medium text-ink-muted">
                {completed}/{total} · <span className="text-ink">{percent}%</span>
              </span>
            </div>
            <ProgressBar value={percent} />
          </div>
        ))}
      </div>
    </Card>
  )
}