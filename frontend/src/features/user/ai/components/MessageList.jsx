import { ArrowDown, Sparkles, Volume2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import InlineRichText from '@/components/ui/InlineRichText'
import { cx, displayName, formatTime, timeAgo } from '@/utils/format'
import FileChip from './FileChip'

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container text-white shadow-primary-glow">
        <Sparkles className="size-4" strokeWidth={2} />
      </div>
      <div className="rounded-tl-sm rounded-2xl bg-canvas px-4 py-3 text-ink">
        <span className="flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Thinking… (queued reply)
        </span>
      </div>
    </div>
  )
}

function EmptyState({ activeId, preferredName, firstName }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Sparkles className="size-6" strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-ink">
        {activeId
          ? `Hello ${displayName(preferredName, firstName)}! How can I help you today?`
          : 'Start a conversation'}
      </p>
      <p className="mt-1 max-w-xs text-[13px] text-ink-muted">
        Ask me to plan your day, explain a task, or draft a next step.
      </p>
    </div>
  )
}

export default function MessageList({
  messages,
  loadingThread,
  thinking,
  activeId,
  user,
  profile,
  speechState,
  onSpeak,
  scrollRef,
  atBottom,
  onScroll,
  onScrollToLatest,
}) {
  // Relative wrapper so the scroll-to-latest button can float over the replies
  // without taking part in the surrounding flex column.
  const scrollToLatestButton = !loadingThread && !atBottom && (
    <button
      type="button"
      onClick={onScrollToLatest}
      aria-label="Scroll to latest reply"
      title="Scroll to latest reply"
      className="absolute bottom-4 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-ink-muted shadow-lifted transition-colors hover:border-primary/40 hover:text-primary"
    >
      <ArrowDown className="size-4" strokeWidth={2.5} />
    </button>
  )

  if (loadingThread) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-5 overflow-y-auto p-5">
          <p className="text-center text-[13px] text-ink-faint">Loading conversation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-5 overflow-y-auto p-5"
      >
      {messages.map((message) => {
        const isUser = message.role === 'USER'
        const isPending = isUser && String(message.id).startsWith('local-')
        return (
          <div
            key={message.id}
            className={cx('flex items-start gap-3', isUser && 'flex-row-reverse')}
          >
            {isUser ? (
              <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
            ) : (
              <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-container text-white shadow-primary-glow">
                <Sparkles className="size-4" strokeWidth={2} />
              </div>
            )}
            <div
              className={cx('flex min-w-0 max-w-[75%] flex-col gap-1', isUser && 'items-end')}
            >
              <div
                className={cx(
                  'break-words rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  isUser
                    ? 'rounded-tr-sm bg-primary-container text-white'
                    : 'rounded-tl-sm bg-canvas text-ink'
                )}
              >
                {message.content &&
                  (isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <InlineRichText text={message.content} />
                  ))}
                {/* Caret marks the reply as still being written. */}
                {message.streaming && (
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
                )}
                {message.attachments?.length > 0 && (
                  <div className={cx('flex flex-wrap gap-1.5', message.content && 'mt-2')}>
                    {message.attachments.map((attachment, index) => (
                      <FileChip key={index} attachment={attachment} bubble={isUser} />
                    ))}
                  </div>
                )}
                {isPending && (
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider opacity-70">
                    Sending…
                  </span>
                )}
              </div>
              {/* A half-written reply has no stable id or timestamp yet, and
                  speaking it would read out an unfinished sentence. */}
              <div className="flex items-center gap-2 px-1">
                {!message.streaming && (
                  <>
                    <span className="text-[11px] text-ink-faint">
                      {isUser
                        ? `You · ${formatTime(message.createdAt)}`
                        : `Assistant · ${timeAgo(message.createdAt)}`}
                    </span>
                    {!isUser && (
                      <button
                        type="button"
                        aria-label="Speak this reply"
                        title="Generate and play this reply as audio"
                        onClick={() => onSpeak(message)}
                        disabled={speechState[message.id] === 'loading'}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                          speechState[message.id] === 'playing'
                            ? 'bg-primary-soft text-primary'
                            : 'text-ink-muted hover:bg-surface-container hover:text-ink',
                          speechState[message.id] === 'loading' && 'opacity-60'
                        )}
                      >
                        <Volume2
                          className={cx(
                            'size-3.5',
                            speechState[message.id] === 'playing' && 'animate-pulse'
                          )}
                          strokeWidth={2}
                        />
                        {speechState[message.id] === 'loading'
                          ? 'Generating…'
                          : speechState[message.id] === 'playing'
                            ? 'Speaking…'
                            : 'Speak'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {thinking && <ThinkingBubble />}
      {messages.length === 0 && (
        <EmptyState
          activeId={activeId}
          preferredName={profile.preferredName}
          firstName={user.firstName}
        />
      )}
      </div>
      {scrollToLatestButton}
    </div>
  )
}
