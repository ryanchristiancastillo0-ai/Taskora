import { FolderKanban, ListChecks } from 'lucide-react'
import Modal from './Modal'
import Spinner from './Spinner'
import { cx } from '@/utils/format'

export default function SearchResultsModal({
  open,
  onClose,
  query,
  loading,
  error,
  tasks = [],
  projects = [],
  onSelectTask,
  onSelectProject,
}) {
  const hasResults = tasks.length > 0 || projects.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Search results"
      subtitle={query ? `Matches for “${query}”` : undefined}
      size="sm"
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner className="text-primary" />
          <p className="text-[13px] text-ink-muted">Searching tasks and projects…</p>
        </div>
      ) : error ? (
        <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-error">
          {error}
        </p>
      ) : !hasResults ? (
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No results found for “{query}”
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {tasks.length > 0 && (
            <div>
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Tasks
              </p>
              <div className="flex flex-col">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onSelectTask(task)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-container"
                  >
                    <ListChecks
                      className={cx('size-4 flex-shrink-0', task.status === 'COMPLETED' ? 'text-emerald-600' : 'text-ink-faint')}
                      strokeWidth={2}
                    />
                    <span className="truncate text-[13px] text-ink">{task.title}</span>
                    {task.project?.name && (
                      <span className="ml-auto flex-shrink-0 text-xs text-ink-faint">
                        {task.project.name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Projects
              </p>
              <div className="flex flex-col">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-container"
                  >
                    <FolderKanban className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                    <span className="truncate text-[13px] text-ink">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}