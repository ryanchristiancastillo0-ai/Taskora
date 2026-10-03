import { Volume2 } from 'lucide-react'
import Button from '@/shared/components/ui/Button'
import Modal from '@/shared/components/ui/Modal'
import { cx } from '@/shared/utils/format'

export default function VoicePickerModal({
  open,
  onClose,
  voices,
  voice,
  onVoiceChange,
  onEnable,
  saving,
  speakOn,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Voice replies"
      subtitle="Pick a voice from the configured VOICES. Browser speech is only used as a fallback."
      size="sm"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            icon={Volume2}
            loading={saving}
            disabled={!voice || saving}
            onClick={onEnable}
          >
            Enable
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {voices.length === 0 && (
          <p className="py-2 text-[13px] text-ink-muted">Loading voices…</p>
        )}
        {voices.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={voice === item.id}
            onClick={() => onVoiceChange(item.id)}
            className={cx(
              'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
              voice === item.id
                ? 'border-primary/40 bg-primary-soft'
                : 'border-border-subtle bg-surface-card hover:border-primary/25'
            )}
          >
            <span
              className={cx(
                'flex size-4 flex-shrink-0 items-center justify-center rounded-full border-2',
                voice === item.id ? 'border-primary' : 'border-border-subtle'
              )}
            >
              {voice === item.id && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{item.name}</span>
              <span className="block truncate text-[11px] text-ink-faint">
                {item.description}
              </span>
            </span>
          </button>
        ))}
        {speakOn && (
          <p className="mt-1 text-[12px] text-ink-faint">
            Auto-speak is currently on for this conversation.
          </p>
        )}
      </div>
    </Modal>
  )
}
