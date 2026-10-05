import { FolderKanban, MoreVertical, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/layout/PageHeader'
import { projectProgress } from '@/features/user/dashboard/components/ProjectsProgressCard'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Dropdown, { MenuItem } from '@/components/ui/Dropdown'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyStateModal from '@/components/ui/EmptyStateModal'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import ProgressBar from '@/components/ui/ProgressBar'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { useApp } from '@/app/providers/AppContext'
import { PROJECT_COLORS } from '@/constants/index'
import { cx } from '@/utils/format'

const PROJECT_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED']

export default function Projects() {
  const { data, actions, pushToast } = useApp()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [values, setValues] = useState({ name: '', description: '', color: PROJECT_COLORS[0] })

  const [renameTarget, setRenameTarget] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renaming, setRenaming] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [edit, setEdit] = useState({ name: '', description: '', color: PROJECT_COLORS[0], status: 'ACTIVE' })
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const progress = useMemo(
    () => projectProgress(data.projects, data.tasks),
    [data.projects, data.tasks]
  )

  const submit = (event) => {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setCreateError('Project name is required')
      return
    }
    if (creating) return
    setCreating(true)
    setCreateError('')
    actions
      .addProject({
        name,
        description: values.description.trim(),
        color: values.color,
      })
      .then(() => {
        pushToast('Project created')
        setValues({ name: '', description: '', color: PROJECT_COLORS[0] })
        setShowNew(false)
      })
      .catch((error) => setCreateError(error.message || 'Could not create project'))
      .finally(() => setCreating(false))
  }

  const openRename = (project) => {
    setRenameTarget(project)
    setRenameName(project.name ?? '')
    setRenameError('')
  }

  const saveRename = () => {
    const name = renameName.trim()
    if (!name) {
      setRenameError('Project name is required')
      return
    }
    if (renaming) return
    setRenaming(true)
    setRenameError('')
    actions
      .updateProject(renameTarget.id, { name })
      .then(() => {
        setRenameTarget(null)
        pushToast('Project renamed')
      })
      .catch((error) => pushToast(error.message, 'danger'))
      .finally(() => setRenaming(false))
  }

  const openEdit = (project) => {
    setEditTarget(project)
    setEdit({
      name: project.name ?? '',
      description: project.description ?? '',
      color: project.color ?? PROJECT_COLORS[0],
      status: project.status ?? 'ACTIVE',
    })
    setEditError('')
  }

  const saveEdit = () => {
    const name = edit.name.trim()
    if (!name) {
      setEditError('Project name is required')
      return
    }
    if (editing) return
    setEditing(true)
    setEditError('')
    actions
      .updateProject(editTarget.id, edit)
      .then(() => {
        setEditTarget(null)
        pushToast('Project updated')
      })
      .catch((error) => pushToast(error.message, 'danger'))
      .finally(() => setEditing(false))
  }

  const confirmDelete = () => {
    if (deleting || !deleteTarget) return
    setDeleting(true)
    actions
      .deleteProject(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null)
        pushToast('Project deleted')
      })
      .catch(() => {})
      .finally(() => setDeleting(false))
  }

  const renderColorPicker = (color, setColor) => (
    <div className="flex flex-wrap items-center gap-2">
      {PROJECT_COLORS.map((item) => (
        <button
          key={item}
          type="button"
          aria-label={`Color ${item}`}
          onClick={() => setColor(item)}
          className={cx(
            'size-7 rounded-full transition-transform hover:scale-110',
            color === item && 'ring-2 ring-offset-2 ring-primary'
          )}
          style={{ backgroundColor: item }}
        />
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${data.projects.length} ${data.projects.length === 1 ? 'project' : 'projects'}`}
        actions={<Button onClick={() => setShowNew(true)} icon={Plus}>New project</Button>}
      />

      {data.projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="You have no projects yet. Click below to create your first project and organise your work."
          action={
            <Button onClick={() => setShowNew(true)} icon={Plus}>
              Create your first project
            </Button>
          }
        />
      ) : (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {progress.map(({ project, total, completed, percent }) => {
          const isDone = project.status === 'COMPLETED'
          return (
            <div
              key={project.id}
              className="group flex flex-col rounded-card border border-border-subtle bg-surface-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className="size-9 rounded-lg"
                  style={{
                    backgroundColor: `${project.color ?? '#4D3EC8'}22`,
                    color: project.color ?? '#4D3EC8',
                  }}
                >
                  <span className="flex size-full items-center justify-center text-lg font-bold">
                    {(project.name?.[0] ?? '?').toUpperCase()}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <Badge tone={isDone ? 'green' : project.status === 'ARCHIVED' ? 'neutral' : 'indigo'}>
                    {project.status.toLowerCase()}
                  </Badge>
                  <Dropdown
                    trigger={
                      <button
                        type="button"
                        aria-label="Project actions"
                        className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
                      >
                        <MoreVertical className="size-4" strokeWidth={2} />
                      </button>
                    }
                  >
                    <MenuItem
                      icon={Pencil}
                      label="Rename"
                      onClick={() => openRename(project)}
                    />
                    <MenuItem
                      icon={SlidersHorizontal}
                      label="Edit"
                      onClick={() => openEdit(project)}
                    />
                    <MenuItem
                      icon={Trash2}
                      label="Delete"
                      danger
                      onClick={() => setDeleteTarget(project)}
                    />
                  </Dropdown>
                </div>
              </div>
              <h3 className="text-[15px] font-semibold text-ink">{project.name}</h3>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
                {project.description || 'No description'}
              </p>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-muted">
                    {completed}/{total} tasks
                  </span>
                  <span className="font-semibold text-ink">{percent}%</span>
                </div>
                <ProgressBar value={percent} tone={isDone ? 'success' : 'primary'} />
              </div>
              <button
                type="button"
                onClick={() => navigate(`/tasks?project=${project.id}`)}
                className="mt-4 self-start text-[13px] font-medium text-primary transition-colors hover:text-primary-strong"
              >
                Open project →
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-subtle bg-transparent text-ink-muted transition-colors hover:border-primary-container/50 hover:bg-primary-soft/40 hover:text-primary"
        >
          <Plus className="size-6" strokeWidth={2} />
          <span className="text-[13px] font-medium">New project</span>
        </button>
      </div>
      )}

      <EmptyStateModal
        open={data.projects.length === 0 && !emptyDismissed}
        onClose={() => setEmptyDismissed(true)}
        icon={FolderKanban}
        title="No projects yet"
        description="You have no projects yet. Click the button below to create your first project and organise your work."
        actionLabel="New project"
        onAction={() => {
          setEmptyDismissed(true)
          setShowNew(true)
        }}
      />

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New project">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {createError && (
            <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-error">
              {createError}
            </p>
          )}
          <Input
            label="Name"
            required
            placeholder="e.g. Redesign sprint"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            autoFocus
          />
          <Textarea
            label="Description"
            rows={3}
            placeholder="What is this project about?"
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
          />
          <div>
            <span className="mb-2 block text-[13px] font-medium text-ink">Color</span>
            {renderColorPicker(values.color, (color) => setValues({ ...values, color }))}
          </div>
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={creating}>
              Create project
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title="Rename project">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            saveRename()
          }}
          noValidate
        >
          {renameError && (
            <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-error">
              {renameError}
            </p>
          )}
          <Input
            label="Name"
            required
            placeholder="e.g. Redesign sprint"
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            autoFocus
          />
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={renaming} disabled={renaming}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit project">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            saveEdit()
          }}
          noValidate
        >
          {editError && (
            <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-error">
              {editError}
            </p>
          )}
          <Input
            label="Name"
            required
            placeholder="e.g. Redesign sprint"
            value={edit.name}
            onChange={(event) => setEdit({ ...edit, name: event.target.value })}
            autoFocus
          />
          <Textarea
            label="Description"
            rows={3}
            placeholder="What is this project about?"
            value={edit.description}
            onChange={(event) => setEdit({ ...edit, description: event.target.value })}
          />
          <Select
            label="Status"
            value={edit.status}
            onChange={(event) => setEdit({ ...edit, status: event.target.value })}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
          <div>
            <span className="mb-2 block text-[13px] font-medium text-ink">Color</span>
            {renderColorPicker(edit.color, (color) => setEdit({ ...edit, color }))}
          </div>
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={editing} disabled={editing}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete project"
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-ink">{deleteTarget?.name}</span>? Its tasks
            will be kept but moved out of this project.
          </>
        }
        confirmLabel="Delete project"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}