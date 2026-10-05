import { AlertTriangle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cx } from '@/utils/format'
import Button from './Button'
import Modal from './Modal'

/**
 * The three-dot trigger that opens ItemActionsModal.
 *
 * Exported alongside the modal so a page can drop it into a card, a row or a
 * table cell without repeating the icon and the aria wiring.
 */
export function ItemActionsTrigger({ onClick, label = 'More actions', className }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // Cards and rows are not themselves clickable today, but stopping
        // propagation keeps this safe if that ever changes.
        event.stopPropagation()
        onClick(event)
      }}
      aria-label={label}
      title={label}
      className={cx(
        'flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-container hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className
      )}
    >
      <MoreHorizontal className="size-4" strokeWidth={2} />
    </button>
  )
}

function MenuOption({ icon: Icon, tone, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        tone === 'danger'
          ? 'hover:border-error/40 hover:bg-error/5'
          : 'hover:border-primary/40 hover:bg-primary-soft/40'
      )}
    >
      <span
        className={cx(
          'flex size-9 flex-shrink-0 items-center justify-center rounded-lg',
          tone === 'danger'
            ? 'bg-error/10 text-error'
            : 'bg-primary-soft text-primary'
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span
          className={cx(
            'block text-sm font-semibold',
            tone === 'danger' ? 'text-error' : 'text-ink'
          )}
        >
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12px] text-ink-muted">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * A single modal that offers Edit or Delete for one item, then swaps to an
 * in-modal confirmation before destroying anything.
 *
 * Both steps live in one modal on purpose: stacking a second dialog on top
 * reads as an interruption, and a destructive action with no undo deserves the
 * confirmation to be unmissable rather than dismissible-by-accident.
 *
 * Mount this conditionally with key={item.id} so the step resets between items.
 */
export default function ItemActionsModal({
  open,
  onClose,
  itemName,
  itemLabel = 'item',
  editLabel = 'Edit',
  onEdit,
  onDelete,
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const runDelete = async () => {
    setBusy(true)
    try {
      await onDelete()
      // Close defensively as well as relying on the parent dropping the item.
      // Without this, a parent that forgets to clear its target would leave this
      // modal stranded on a permanently disabled spinner.
      onClose()
    } catch {
      // The action already raised a toast. Stay open, and re-enable the button
      // so the user can retry rather than having to reopen the menu.
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={confirming ? `Delete this ${itemLabel}?` : itemName}
      subtitle={confirming ? undefined : `Choose what to do with this ${itemLabel}.`}
      size="sm"
    >
      {confirming ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl bg-error/5 px-4 py-3">
            <AlertTriangle
              className="mt-0.5 size-4 flex-shrink-0 text-error"
              strokeWidth={2}
            />
            <p className="text-[13px] leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">{itemName}</span> will be
              permanently deleted. This cannot be undone.
            </p>
          </div>
          {/* Stacks below `sm` for the same reason ConfirmDialog does: the label
              is interpolated from `itemLabel`, so "Delete conversation" is a
              different width from "Delete goal" and a fixed inline row cannot be
              sized for both. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              loading={busy}
              disabled={busy}
              onClick={runDelete}
              className="w-full sm:w-auto"
            >
              Delete {itemLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <MenuOption
            icon={Pencil}
            title={editLabel}
            description={`Change this ${itemLabel}'s details.`}
            onClick={onEdit}
          />
          <MenuOption
            icon={Trash2}
            tone="danger"
            title="Delete"
            description={`Remove this ${itemLabel} for good.`}
            onClick={() => setConfirming(true)}
          />
        </div>
      )}
    </Modal>
  )
}
