import Button from './Button'
import Modal from './Modal'

/**
 * A destructive or irreversible action, confirmed in place.
 *
 * The action row stacks full-width below `sm` and becomes an inline row from
 * `sm` up. That is not a style preference: the labels are caller-supplied and
 * some are long ("Delete account" / "Keep my account", "Clear conversation" /
 * "Keep it"), and a non-wrapping `justify-end` row sized itself to its content,
 * so on a 320px screen the pair came to roughly 328px. The overflow went off the
 * *start* edge, which is where `justify-end` puts it, so the cancel button was
 * the part that disappeared - on the one dialog whose cancel button is the safe
 * choice. Stacking removes the width budget as a factor entirely: each button is
 * as wide as the sheet, at any label length.
 *
 * Order stays cancel-then-confirm top to bottom, matching the desktop row, so the
 * destructive action is never the first thing a thumb lands on.
 */
export default function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        {message && (
          <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
        )}
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            type="button"
            loading={loading}
            disabled={loading}
            onClick={onConfirm}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}