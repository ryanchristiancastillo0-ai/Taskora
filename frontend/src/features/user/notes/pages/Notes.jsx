import { CalendarDays, FileText, Pin, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import DataTable from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import EmptyStateModal from '@/components/ui/EmptyStateModal'
import Input from '@/components/ui/Input'
import ItemActionsModal, {
  ItemActionsTrigger,
} from '@/components/ui/ItemActionsModal'
import Modal from '@/components/ui/Modal'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import useListView, {
  LIST_VIEW_OPTIONS,
} from '@/hooks/useListView'
import { useApp } from '@/app/providers/AppContext'
import { cx, timeAgo } from '@/utils/format'

const EMPTY_FORM = { title: '', content: '', projectId: '' }

export default function Notes() {
  const { data, actions, pushToast } = useApp()
  const [view, selectView] = useListView()
  const [showNew, setShowNew] = useState(false)
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const [values, setValues] = useState(EMPTY_FORM)
  // The note currently open in the edit form, or null when creating.
  const [editingId, setEditingId] = useState(null)
  // The note whose action modal is open.
  const [actionsTarget, setActionsTarget] = useState(null)
  const isEditing = Boolean(editingId)

  const closeForm = () => {
    setShowNew(false)
    setEditingId(null)
    setValues(EMPTY_FORM)
  }

  const openCreate = () => {
    setValues(EMPTY_FORM)
    setEditingId(null)
    setShowNew(true)
  }

  const openEdit = (note) => {
    setActionsTarget(null)
    setValues({
      title: note.title ?? '',
      content: note.content ?? '',
      projectId: note.projectId ?? '',
    })
    setEditingId(note.id)
    setShowNew(true)
  }

  const submit = (event) => {
    event.preventDefault()
    if (!values.title.trim()) return

    if (isEditing) {
      actions
        .updateNote(editingId, {
          title: values.title.trim(),
          content: values.content.trim(),
          projectId: values.projectId,
        })
        .then(() => pushToast('Note updated'))
        .catch(() => pushToast('Could not update note', 'danger'))
      closeForm()
      return
    }

    actions.addNote({
      title: values.title.trim(),
      content: values.content.trim(),
      projectId: values.projectId,
    })
    pushToast('Note saved')
    closeForm()
  }

  const removeNote = (note) =>
    actions.deleteNote(note.id).then(() => {
      // Must clear the target here: the action modal stays mounted otherwise,
      // leaving it stuck on the spinner since the deleted item is gone.
      setActionsTarget(null)
      pushToast('Note deleted')
    })

  const [pinnedNote, setPinnedNote] = useState(null)

  useEffect(() => {
    if (!pinnedNote) return undefined
    const timer = setTimeout(() => setPinnedNote(null), 2400)
    return () => clearTimeout(timer)
  }, [pinnedNote])

  const handleTogglePin = (note) => {
    actions
      .toggleNotePin(note)
      .then((updated) => {
        if (updated.pinned) setPinnedNote(updated)
      })
      .catch(() => pushToast('Could not update pin', 'danger'))
  }

  const sortedNotes = useMemo(() => {
    const list = [...data.notes]
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    return list
  }, [data.notes])

  const projectFor = (note) =>
    note.projectId ? data.projects.find((item) => item.id === note.projectId) : null

  // Plain render helpers rather than nested components: declaring them inside
  // the component body would give React a new type on every render, remounting
  // the subtree and throwing away focus (e.g. on the 3-dot button) each time.
  const pinButton = (note) => (
    <button
      type="button"
      aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
      title={note.pinned ? 'Unpin note' : 'Pin note'}
      onClick={() => handleTogglePin(note)}
      className={cx(
        'flex size-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
        note.pinned
          ? 'bg-primary-soft text-primary'
          : 'text-ink-faint hover:bg-surface-container hover:text-ink'
      )}
    >
      <Pin className={cx('size-4', note.pinned && 'fill-primary')} strokeWidth={2} />
    </button>
  )

  const projectBadge = (note) => {
    const project = projectFor(note)
    if (!project) return <Badge tone="neutral">General</Badge>
    return (
      <Badge tone="indigo" className="gap-1.5">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        {project.name}
      </Badge>
    )
  }

  const noteCard = (note) => (
    <article
      key={note.id}
      className={cx(
        'group flex flex-col rounded-card bg-surface-card p-5 transition-all hover:-translate-y-0.5',
        note.pinned
          ? 'border-transparent shadow-primary-glow ring-1 ring-primary/25 hover:shadow-primary-glow'
          : 'border border-border-subtle shadow-card hover:shadow-card-hover'
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          {note.title}
        </h3>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          {pinButton(note)}
          <ItemActionsTrigger
            label={`Actions for ${note.title}`}
            onClick={() => setActionsTarget(note)}
          />
        </div>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
        {note.content}
      </p>
      <div className="mt-4 flex items-center gap-3 text-xs text-ink-muted">
        {projectBadge(note)}
        <span className="ml-auto inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" strokeWidth={2} />
          {timeAgo(note.createdAt)}
        </span>
      </div>
    </article>
  )

  const noteRow = (note) => (
    <article
      key={note.id}
      className={cx(
        'flex items-center gap-3 rounded-card border bg-surface-card px-4 py-3 shadow-card transition-colors hover:shadow-card-hover',
        note.pinned
          ? 'border-primary/30 ring-1 ring-primary/15'
          : 'border-border-subtle'
      )}
    >
      {pinButton(note)}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{note.title}</h3>
          {note.pinned && (
            <Pin className="size-3 flex-shrink-0 fill-primary text-primary" strokeWidth={2} />
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          {note.content || 'No content'}
        </p>
      </div>
      <div className="hidden shrink-0 sm:block">
        {projectBadge(note)}
      </div>
      <span className="hidden w-24 shrink-0 text-right text-xs text-ink-muted md:block">
        {timeAgo(note.createdAt)}
      </span>
      <ItemActionsTrigger
        label={`Actions for ${note.title}`}
        onClick={() => setActionsTarget(note)}
      />
    </article>
  )

  const noteColumns = [
    {
      key: 'title',
      label: 'Title',
      render: (note) => (
        <div className="flex min-w-0 items-center gap-2">
          <Pin
            className={cx(
              'size-3.5 flex-shrink-0',
              note.pinned ? 'fill-primary text-primary' : 'text-ink-faint'
            )}
            strokeWidth={2}
          />
          <span className="truncate font-medium text-ink">{note.title}</span>
        </div>
      ),
    },
    {
      key: 'content',
      label: 'Preview',
      render: (note) => (
        <span className="line-clamp-1 text-ink-muted">{note.content || '—'}</span>
      ),
    },
    {
      key: 'project',
      label: 'Project',
      render: (note) => projectBadge(note),
    },
    {
      key: 'created',
      label: 'Created',
      headerClassName: 'text-right',
      className: 'whitespace-nowrap text-right text-xs text-ink-muted',
      render: (note) => timeAgo(note.createdAt),
    },
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      headerClassName: 'w-12',
      className: 'w-12 text-right',
      render: (note) => (
        <div className="flex justify-end">
          <ItemActionsTrigger
            label={`Actions for ${note.title}`}
            onClick={() => setActionsTarget(note)}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={`${data.notes.length} ${data.notes.length === 1 ? 'note' : 'notes'}`}
        actions={
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={LIST_VIEW_OPTIONS}
              value={view}
              onChange={selectView}
            />
            <Button onClick={openCreate} icon={Plus}>
              New note
            </Button>
          </div>
        }
      />

      {data.notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notes yet"
          description="You have no notes yet. Click below to write your first note and capture your ideas."
          action={
            <Button onClick={openCreate} icon={Plus}>
              Create your first note
            </Button>
          }
        />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sortedNotes.map(noteCard)}
        </div>
      ) : view === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {sortedNotes.map(noteRow)}
        </div>
      ) : (
        <DataTable
          columns={noteColumns}
          items={sortedNotes}
          getRowId={(note) => note.id}
        />
      )}

      <EmptyStateModal
        open={data.notes.length === 0 && !emptyDismissed}
        onClose={() => setEmptyDismissed(true)}
        icon={FileText}
        title="No notes yet"
        description="You have no notes yet. Click the button below to write your first note and capture your ideas."
        actionLabel="New note"
        onAction={() => {
          setEmptyDismissed(true)
          openCreate()
        }}
      />

      {/* Keyed and conditionally mounted so each note's action modal always
          starts on the menu step, with no state to resync between items. */}
      {actionsTarget && (
        <ItemActionsModal
          key={actionsTarget.id}
          open
          onClose={() => setActionsTarget(null)}
          itemName={actionsTarget.title}
          itemLabel="note"
          onEdit={() => openEdit(actionsTarget)}
          onDelete={() => removeNote(actionsTarget)}
        />
      )}

      <Modal
        open={showNew}
        onClose={closeForm}
        title={isEditing ? 'Edit note' : 'New note'}
      >
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Input
            label="Title"
            required
            placeholder="e.g. Ideas for landing page"
            value={values.title}
            onChange={(event) => setValues({ ...values, title: event.target.value })}
            autoFocus
          />
          <Textarea
            label="Content"
            rows={5}
            placeholder="Write your note..."
            value={values.content}
            onChange={(event) => setValues({ ...values, content: event.target.value })}
          />
          <Select
            label="Project"
            value={values.projectId}
            onChange={(event) => setValues({ ...values, projectId: event.target.value })}
          >
            <option value="">No project</option>
            {data.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <div className="mt-1 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? 'Save changes' : 'Save note'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(pinnedNote)}
        onClose={() => setPinnedNote(null)}
        title="Note pinned"
        size="sm"
      >
        <div className="flex flex-col items-center gap-4 px-2 py-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Pin className="size-6 fill-primary" strokeWidth={2} />
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            “{pinnedNote?.title}” is now{' '}
            <span className="font-semibold text-primary">pinned</span> at the top of
            your notes.
          </p>
          <Button variant="ghost" type="button" onClick={() => setPinnedNote(null)}>
            Got it
          </Button>
        </div>
      </Modal>
    </div>
  )
}
