import Button from './Button'
import Modal from './Modal'

export default function EmptyStateModal({
  open,
  onClose,
  onAction,
  icon: Icon,
  title = 'Nothing here yet',
  description,
  actionLabel = 'Get started',
  size = 'sm',
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size={size}>
      <div className="flex flex-col items-center px-2 py-4 text-center sm:py-8">
        {Icon && (
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-card">
            <Icon className="size-7" strokeWidth={1.75} />
          </div>
        )}
        {description && (
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{description}</p>
        )}
        <Button onClick={onAction} icon={Icon} className="mt-6 w-full sm:w-auto">
          {actionLabel}
        </Button>
      </div>
    </Modal>
  )
}