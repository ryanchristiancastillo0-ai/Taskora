import { FileText, Paperclip, Send, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cx } from '@/utils/format'
import { MAX_ATTACHMENTS, formatBytes } from './messageFormat'

/**
 * The composer form: the staged-file tray, the attach button, the textarea and
 * send. Split out so the message list above it is readable on its own.
 *
 * Staging only — nothing uploads until the form is actually submitted.
 */
export default function ChatComposer({
  draft,
  pending,
  draftRef,
  fileInputRef,
  sending,
  onSubmit,
  onPickFile,
  onRemovePending,
  onAttachClick,
  onDraftChange,
}) {
  return (
    <form onSubmit={onSubmit} className="border-t border-border-subtle px-3 py-3">
      {pending.length > 0 && (
        <div className="mb-2.5">
          <ul className="flex flex-wrap gap-2">
            {pending.map((item) => (
              <li key={item.key} className="group relative size-16 flex-shrink-0">
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="size-16 rounded-xl border border-border-subtle object-cover"
                  />
                ) : (
                  <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-xl border border-border-subtle bg-surface-container p-1">
                    <FileText
                      className="size-5 flex-shrink-0 text-ink-soft"
                      strokeWidth={2}
                    />
                    <span className="w-full truncate text-center text-[9px] text-ink-muted">
                      {item.file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemovePending(item.key)}
                  aria-label={`Remove ${item.file.name}`}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white shadow-sm transition-colors hover:bg-ink/80"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {pending.length} of {MAX_ATTACHMENTS} attached ·{' '}
            {formatBytes(pending.reduce((sum, item) => sum + item.file.size, 0))}{' '}
            · nothing uploads until you send
          </p>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label="Attach file or image"
          onClick={onAttachClick}
          className="flex size-10 flex-shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
        >
          <Paperclip className="size-5" strokeWidth={2} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={onPickFile}
        />
        {/* A textarea rather than a single-line input: pasted addresses, code
            snippets and multi-line notes were previously impossible to write.
            Enter still sends, Shift+Enter inserts a newline. */}
        <textarea
          ref={draftRef}
          rows={1}
          value={draft}
          onChange={onDraftChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={
            pending.length > 0 ? 'Add a message (optional)...' : 'Type a message...'
          }
          aria-label="Message"
          className="max-h-36 min-h-10 min-w-0 flex-1 resize-none rounded-field border border-border-subtle bg-canvas px-4 py-2.5 text-sm leading-snug text-ink placeholder:text-ink-faint transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
        {/* Never disabled by `sending`: the draft is cleared the instant the
            bubble is written, so the button cannot double-post, and holding
            the composer shut for the length of an upload is exactly the lag
            this optimistic flow exists to remove. */}
        <Button
          type="submit"
          icon={Send}
          disabled={!draft.trim() && pending.length === 0}
          aria-busy={sending}
          className={cx(
            'mb-0.5 flex-shrink-0 !px-3',
            sending && 'opacity-70'
          )}
          aria-label="Send message"
        />
      </div>
    </form>
  )
}
