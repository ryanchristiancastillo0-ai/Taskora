import { ArrowUp, FileText, Mic, Paperclip, Sun, Volume2, X } from 'lucide-react'
import { cx, formatBytes } from '@/shared/utils/format'
import { ACCEPT, MAX_AI_FILES, SUGGESTIONS } from '../constants'

export default function MessageComposer({
  prompt,
  onPromptChange,
  onSend,
  selectedFiles,
  onPickFiles,
  onRemoveFile,
  fileInputRef,
  speakOn,
  onOpenSpeakModal,
  activeTitle,
}) {
  return (
    <div className="border-t border-border-subtle bg-surface-soft/50 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              onPromptChange(suggestion)
            }}
            className="rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-primary/30 hover:text-primary"
          >
            {suggestion}
          </button>
        ))}
      </div>
      {selectedFiles.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selectedFiles.map((item, index) => (
            <li
              key={`${item.file.name}-${index}`}
              className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card py-1 pl-1.5 pr-1"
            >
              {item.preview ? (
                <img
                  src={item.preview}
                  alt=""
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <FileText className="size-3.5" strokeWidth={2} />
                </span>
              )}
              <span className="max-w-[150px] truncate text-xs font-medium text-ink-soft">
                {item.file.name}
              </span>
              <span className="shrink-0 text-[11px] text-ink-faint">
                {formatBytes(item.file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onRemoveFile(index)}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-container hover:text-error"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1 rounded-field border border-border-subtle bg-canvas p-1 pl-3.5">
        <input
          type="text"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSend()
          }}
          placeholder="Ask me anything about your tasks..."
          className="w-full bg-transparent py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={onPickFiles}
          disabled={selectedFiles.length >= MAX_AI_FILES}
        />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Attach files"
            title="Attach files (up to 6, images over 10 MB are compressed)"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-ink"
          >
            <Paperclip className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Voice input"
            title="Voice input (coming soon)"
            className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-ink"
          >
            <Mic className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Voice replies"
            title={
              speakOn
                ? 'Voice replies are on — change the voice or turn off'
                : 'Enable voice replies'
            }
            onClick={onOpenSpeakModal}
            className={cx(
              'flex size-8 items-center justify-center rounded-lg transition-colors',
              speakOn ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:text-ink'
            )}
          >
            <Volume2 className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Send prompt"
            onClick={onSend}
            disabled={!prompt.trim() && selectedFiles.length === 0}
            className="flex size-8 items-center justify-center rounded-full bg-primary-container text-white shadow-primary-glow transition-colors hover:bg-primary disabled:opacity-50"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Sun className="size-3" strokeWidth={2} />
        {activeTitle?.title ?? 'Your assistant'} · replies come from your configured AI provider
      </p>
    </div>
  )
}
