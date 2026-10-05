import { Camera, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/utils/format'
import Avatar from './Avatar'
import Button from './Button'
import Modal from './Modal'

// Matches the server's own upload cap (MAX_FILE_SIZE_BYTES). Checking it here
// turns a silent 413 into a sentence the person can act on.
//
// Raster formats only. The upload middleware accepts SVG, but an avatar is
// rendered as a plain <img> from our own origin, where a scripted SVG would run
// with the session's cookies — so the picker never offers one.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',')
const MAX_BYTES = 5 * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Avatar with a photo picker behind it.
 *
 * Picking a file stages it locally and previews it; nothing is uploaded until
 * "Save photo" is pressed. An avatar is one tap from replacing and there is no
 * undo for an upload — the upload route deletes the previous file the moment a
 * replacement lands — so committing on selection would throw away a photo the
 * person only meant to look at. Cancel, the overlay and Escape all discard the
 * staged file without sending a request.
 *
 * The upload and removal calls arrive as props rather than being reached for,
 * which is what lets the user profile page and the admin console render the
 * same picker over one store action instead of growing two copies of this flow.
 */
export default function AvatarPicker({
  name,
  src,
  size = 'xl',
  className,
  caption,
  onSave,
  onRemove,
  pushToast,
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  // Which request is in flight, so only the button that started it spins.
  const [running, setRunning] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  // The object URL is held in a ref as well as state because it has to be
  // revoked exactly once: on replacement, on discard, and on unmount if the page
  // goes away with the modal open.
  const previewRef = useRef(null)

  const applyPreview = (file) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = file ? URL.createObjectURL(file) : null
    setPreview(previewRef.current)
  }

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    []
  )

  const stage = (file) => {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Pick a JPG, PNG, WebP or GIF image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${formatBytes(file.size)}. The limit is 5 MB.`)
      return
    }
    setError('')
    setPending(file)
    applyPreview(file)
  }

  const discard = () => {
    setPending(null)
    applyPreview(null)
    setError('')
    setDragging(false)
  }

  const close = () => {
    if (running) return
    setOpen(false)
    discard()
  }

  const save = async () => {
    if (!pending || running) return
    setRunning('save')
    setError('')
    try {
      await onSave(pending)
      setOpen(false)
      discard()
      pushToast?.('Profile photo updated')
    } catch (uploadError) {
      // The staged file is deliberately kept: a failed upload should not cost
      // the person the photo they just picked, and Save stays enabled to retry.
      setError(uploadError.message || 'That photo could not be uploaded.')
    } finally {
      setRunning(null)
    }
  }

  const remove = async () => {
    if (running) return
    setRunning('remove')
    setError('')
    try {
      await onRemove()
      setOpen(false)
      discard()
      pushToast?.('Profile photo removed')
    } catch (removeError) {
      setError(removeError.message || 'That photo could not be removed.')
    } finally {
      setRunning(null)
    }
  }

  const onPick = (event) => {
    stage(event.target.files?.[0])
    // Reset so choosing the same file twice in a row still fires a change event.
    event.target.value = ''
  }

  const browse = () => fileInputRef.current?.click()

  return (
    <div className={cx('flex flex-col items-center', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change profile photo"
        className="group relative rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
      >
        <Avatar name={name} src={src} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5 text-white" strokeWidth={2} />
        </span>
        {/* Always visible rather than hover-only: the console renders this at the
            end of a card, where nothing else says the photo is clickable. */}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-white ring-2 ring-surface-card transition-transform duration-200 group-hover:scale-110">
          <Camera className="size-3.5" strokeWidth={2.5} />
        </span>
      </button>

      {caption && <p className="mt-2 text-[12px] text-ink-faint">{caption}</p>}

      <Modal
        open={open}
        onClose={close}
        title="Change photo"
        subtitle="Nothing is saved until you press Save photo."
        size="sm"
      >
        <div className="flex flex-col items-center gap-4">
          <Avatar
            name={name}
            src={preview ?? src}
            size="2xl"
            className="ring-4 ring-primary-soft"
          />

          {pending && (
            <div className="flex w-full items-center gap-3 rounded-field border border-border-subtle bg-surface-soft px-3 py-2.5">
              <img
                src={preview}
                alt=""
                className="size-9 flex-shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">
                  {pending.name}
                </p>
                <p className="text-[12px] text-ink-faint">
                  {formatBytes(pending.size)} · Not uploaded yet
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={discard}
                disabled={Boolean(running)}
              >
                Clear
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={browse}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              stage(event.dataTransfer.files?.[0])
            }}
            className={cx(
              'flex w-full flex-col items-center gap-1.5 rounded-field border border-dashed px-4 text-center transition-colors',
              pending ? 'py-3' : 'py-6',
              dragging
                ? 'border-primary bg-primary-soft'
                : 'border-border-subtle bg-surface-soft hover:border-primary/50 hover:bg-primary-faint/40'
            )}
          >
            <Upload className="size-5 text-ink-faint" strokeWidth={2} />
            <span className="text-[13px] text-ink-muted">
              {pending ? (
                'Choose a different image'
              ) : (
                <>
                  Drag an image here, or{' '}
                  <span className="font-medium text-primary">browse</span>
                </>
              )}
            </span>
            <span className="text-[12px] text-ink-faint">
              JPG, PNG, WebP or GIF · up to 5 MB
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={onPick}
            hidden
          />

          {error && (
            <p className="w-full rounded-field bg-danger-soft px-3 py-2 text-[13px] text-error">
              {error}
            </p>
          )}

          <div className="flex w-full items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <div>
              {src && (
                <Button
                  variant="dangerSoft"
                  size="sm"
                  icon={Trash2}
                  onClick={remove}
                  disabled={Boolean(running)}
                  loading={running === 'remove'}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={close} disabled={Boolean(running)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!pending}
                loading={running === 'save'}
              >
                Save photo
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
