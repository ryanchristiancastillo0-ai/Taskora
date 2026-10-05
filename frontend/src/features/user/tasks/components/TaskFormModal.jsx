import { FileText, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PRIORITY_ORDER, TASK_STATUS } from '@/constants/index'
import { resolveAssetUrl } from '@/services/api/client'
import { useApp } from '@/app/providers/AppContext'
import { cx, formatBytes } from '@/utils/format'
import Button from '@/components/ui/Button'
import DatePicker from '@/components/ui/DatePicker'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'

const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.zip,.gz,.tar'

const isImageFile = (file) => (file.type || '').startsWith('image/')

function NewFileRow({ file, onRemove }) {
  const isImage = isImageFile(file)
  const preview = isImage ? URL.createObjectURL(file) : null
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-soft px-3 py-2">
      {preview ? (
        <img src={preview} alt="" className="size-9 rounded-md object-cover" />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
          <FileText className="size-4" strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{file.name}</p>
        <p className="text-xs text-ink-muted">{formatBytes(file.size)}</p>
      </div>
      <button
        type="button"
        aria-label="Remove file"
        onClick={onRemove}
        className="flex size-7 flex-shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-container hover:text-error"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </li>
  )
}

export default function TaskFormModal({ open, onClose, task }) {
  const { data, actions, pushToast } = useApp()
  const isEdit = Boolean(task)
  const fileInputRef = useRef(null)

  const [values, setValues] = useState(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    projectId: task?.projectId ?? '',
    priority: task?.priority ?? 'MEDIUM',
    status: task?.status ?? 'TODO',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : '',
    tagIds: task?.tagIds ?? [],
  }))
  const [existing, setExisting] = useState(task?.attachments ?? [])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [removedIds, setRemovedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const loadedForTaskRef = useRef(null)

  useEffect(() => {
    if (!open) {
      loadedForTaskRef.current = null
      return
    }
    if (!isEdit || loadedForTaskRef.current === task.id) return

    if ((task?.attachments?.length ?? 0) > 0) {
      setExisting(task.attachments)
      loadedForTaskRef.current = task.id
      return
    }

    let cancelled = false
    actions.fetchTask(task.id).then((detail) => {
      if (cancelled) return
      setExisting(detail?.attachments ?? [])
      loadedForTaskRef.current = task.id
    })
    return () => {
      cancelled = true
    }
  }, [open, isEdit, task, actions])

  const set = (key) => (event) => {
    const value = event.target.value
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const toggleTag = (tagId) => {
    setValues((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((id) => id !== tagId)
        : [...prev.tagIds, tagId],
    }))
  }

  const onPickFiles = (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setSelectedFiles((prev) => [...prev, ...files])
    event.target.value = ''
  }

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const removeExisting = (attachment) => {
    setRemovedIds((prev) => [...prev, attachment.id])
    setExisting((prev) => prev.filter((item) => item.id !== attachment.id))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!values.title.trim() || loading) return

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      projectId: values.projectId || null,
      priority: values.priority,
      status: values.status,
      dueDate: values.dueDate || null,
      estimatedMinutes: values.estimatedMinutes
        ? Number(values.estimatedMinutes)
        : null,
      tagIds: values.tagIds,
    }

    setLoading(true)
    try {
      if (isEdit) {
        await actions.updateTask(task.id, payload, {
          newFiles: selectedFiles,
          removedIds,
        })
        pushToast('Task updated')
      } else {
        await actions.addTask(payload, selectedFiles)
        pushToast('Task created')
      }
      onClose()
    } catch (err) {
      pushToast(err.message || 'Something went wrong saving the task', 'warn')
    } finally {
      setLoading(false)
    }
  }

  const totalAttachments =
    existing.length + selectedFiles.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit task' : 'New task'}
      subtitle="Add or update a task in your workspace."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} type="submit" form="task-form" loading={loading}>
            {isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-form" className="flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="Title"
          required
          placeholder="What needs to be done?"
          value={values.title}
          onChange={set('title')}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Add context (optional)"
          rows={3}
          value={values.description}
          onChange={set('description')}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Project" value={values.projectId} onChange={set('projectId')}>
            <option value="">No project</option>
            {data.projects.filter((p) => p.status !== 'ARCHIVED').map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <DatePicker
            label="Due date"
            value={values.dueDate}
            onChange={(next) => setValues((prev) => ({ ...prev, dueDate: next }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Priority" value={values.priority} onChange={set('priority')}>
            {PRIORITY_ORDER.map((key) => (
              <option key={key} value={key}>
                {key.charAt(0) + key.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
          <Select label="Status" value={values.status} onChange={set('status')}>
            {Object.keys(TASK_STATUS)
              .filter((key) => key !== 'CANCELLED')
              .map((key) => (
                <option key={key} value={key}>
                  {TASK_STATUS[key].label}
                </option>
              ))}
          </Select>
          <Input
            label="Estimate (min)"
            type="number"
            min={1}
            placeholder="45"
            value={values.estimatedMinutes}
            onChange={set('estimatedMinutes')}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-[13px] font-medium text-ink-soft">
              Attachments{totalAttachments > 0 ? ` (${totalAttachments})` : ''}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={onPickFiles}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Paperclip}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {isEdit ? 'Add file' : 'Upload files'}
            </Button>
          </div>

          {existing.length === 0 && selectedFiles.length === 0 && (
            <p className="rounded-lg border border-dashed border-border-subtle bg-surface-soft/50 px-4 py-5 text-center text-[13px] text-ink-muted">
              Attach a PDF, image, document or any supported file for reference
              (up to 5 MB each).
            </p>
          )}

          {(existing.length > 0 || selectedFiles.length > 0) && (
            <ul className="flex flex-col gap-2">
              {existing.map((attachment) => {
                const isImage = (attachment.fileType || '').startsWith('image/')
                const href = resolveAssetUrl(attachment.url)
                return (
                  <li
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-soft px-3 py-2"
                  >
                    {isImage && href ? (
                      <img src={href} alt="" className="size-9 rounded-md object-cover" />
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <FileText className="size-4" strokeWidth={2} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {attachment.fileName || attachment.url}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatBytes(attachment.fileSize) || 'Attached'}
                      </p>
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary transition-colors hover:text-primary-strong"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View
                      </a>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => removeExisting(attachment)}
                      disabled={loading}
                      className="flex size-7 flex-shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-container hover:text-error disabled:opacity-50"
                    >
                      <X className="size-4" strokeWidth={2} />
                    </button>
                  </li>
                )
              })}
              {selectedFiles.map((file, index) => (
                <NewFileRow
                  key={`${file.name}-${file.size}-${index}`}
                  file={file}
                  onRemove={() => removeSelectedFile(index)}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink-soft">Tags</span>
          <div className={cx('flex flex-wrap gap-2')}>
            {data.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  values.tagIds.includes(tag.id)
                    ? 'border-primary-container bg-primary-soft text-primary'
                    : 'border-border-subtle text-ink-muted hover:border-primary/30 hover:text-ink',
                ].join(' ')}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}