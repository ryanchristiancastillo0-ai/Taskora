import { useState } from 'react'
import { RefreshCw, SmilePlus } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import { cx, formatTime } from '@/utils/format'
import UserProfileMenu from '../UserProfileMenu'
import MessageAttachments from './MessageAttachments'
import { REACTION_EMOJIS, groupReactions, reactionSummary } from './messageFormat'

function ReactionBar({ message, meId, mine, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const groups = groupReactions(message.reactions ?? [], meId)

  return (
    <div
      className={cx(
        'mt-1 flex flex-wrap items-center gap-1',
        mine ? 'justify-end' : 'justify-start'
      )}
    >
      {groups.map((group) => (
        <button
          key={group.emoji}
          type="button"
          onClick={() => onReact(group.emoji)}
          aria-pressed={group.mine}
          aria-label={reactionSummary(group, meId)}
          title={reactionSummary(group, meId)}
          className={cx(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
            group.mine
              ? 'border-primary bg-primary-soft text-primary'
              : 'border-border-subtle bg-surface-soft text-ink-muted hover:bg-surface-container'
          )}
        >
          <span>{group.emoji}</span>
          <span className="font-medium tabular-nums">{group.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          className={cx(
            'flex size-6 items-center justify-center rounded-full border transition-colors',
            // Hidden until the row is hovered on pointer-driven screens, but
            // always visible on small/touch screens where there is no hover and
            // a keyboard focus must reveal it too. Opacity keeps the layout
            // stable, so revealing never shifts the messages.
            'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
            pickerOpen && 'opacity-100',
            pickerOpen
              ? 'border-primary bg-primary-soft text-primary'
              : 'border-border-subtle bg-surface-soft text-ink-faint hover:bg-surface-container hover:text-ink-soft'
          )}
        >
          <SmilePlus className="size-3.5" strokeWidth={2} />
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-1 flex items-center gap-0.5 rounded-full border border-border-subtle bg-surface-card p-1 shadow-lg">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  onReact(emoji)
                }}
                aria-label={`React with ${emoji}`}
                className="flex size-7 items-center justify-center rounded-full text-base transition-colors hover:bg-surface-container"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One message bubble.
 *
 * Three layouts — text, media, media with a caption — which is why it is its own
 * module: the list should not be the only place any of them can be read.
 */
export default function MessageRow({
  message,
  mine,
  isGroup,
  meId,
  senderName,
  senderAvatar,
  onReact,
  onRetry,
}) {
  const attachments = message.attachments ?? []
  const hasAttachments = attachments.length > 0
  const hasContent = Boolean(message.content?.trim())
  // Images sit flush against the bubble edge; file chips need padding.
  const flushAttachments =
    hasAttachments && attachments.every((item) => item.kind === 'IMAGE')
  // With nothing to caption, the media bubble carries the timestamp.
  const showTextBubble = hasContent || !hasAttachments

  return (
    <div
      className={cx(
        // `group` lets the reaction affordance fade in on hover of the row
        // rather than sitting under every message.
        'group flex items-end gap-2',
        mine && 'flex-row-reverse'
      )}
    >
      {!mine && (
        <UserProfileMenu
          userId={message.senderId}
          align="left"
          triggerClassName="mb-0.5 flex-shrink-0"
          trigger={
            <span className="flex cursor-pointer flex-col items-center transition-opacity hover:opacity-80">
              <Avatar name={senderName} src={senderAvatar} size="sm" />
              {isGroup && (
                <span className="mt-1 max-w-16 truncate text-[10px] font-medium text-ink-muted">
                  {senderName}
                </span>
              )}
            </span>
          }
        />
      )}
      <div
        className={cx(
          'flex min-w-0 max-w-[72%] flex-col',
          mine ? 'items-end' : 'items-start'
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          {hasAttachments && (
            <div
              className={cx(
                'min-w-0 overflow-hidden rounded-2xl',
                flushAttachments ? 'p-0' : 'p-2.5',
                mine
                  ? 'rounded-br-md bg-primary-container text-white shadow-primary-glow'
                  : 'rounded-bl-md border border-border-subtle bg-surface-soft text-ink',
                // Half-held until the server confirms it, so an unacked
                // message never reads as delivered.
                message.pending && 'opacity-60'
              )}
            >
              <MessageAttachments attachments={attachments} mine={mine} />
              {!showTextBubble && (
                <p
                  className={cx(
                    'px-3.5 py-2 text-right text-[10px]',
                    mine ? 'text-white/60' : 'text-ink-faint'
                  )}
                >
                  {formatTime(message.createdAt)}
                </p>
              )}
            </div>
          )}
          {showTextBubble && (
            <div
              className={cx(
                'min-w-0 rounded-2xl px-3.5 py-2.5',
                mine
                  ? 'rounded-br-md bg-primary-container text-white shadow-primary-glow'
                  : 'rounded-bl-md border border-border-subtle bg-surface-soft text-ink',
                message.pending && 'opacity-60'
              )}
            >
              {hasContent && (
                <p
                  className={cx(
                    'break-words whitespace-pre-wrap text-sm leading-snug',
                    mine ? 'text-white' : 'text-ink'
                  )}
                >
                  {message.content}
                </p>
              )}
              <p
                className={cx(
                  'mt-1 text-right text-[10px]',
                  mine ? 'text-white/60' : 'text-ink-faint'
                )}
              >
                {formatTime(message.createdAt)}
              </p>
            </div>
          )}
        </div>
        {/* A message the server has not acknowledged yet cannot take a
            reaction (there is no id to post it against), so the row swaps the
            reaction bar for its own delivery state instead. */}
        {message.pending ? (
          <div
            className={cx(
              'mt-1 flex items-center gap-1.5',
              mine ? 'justify-end' : 'justify-start'
            )}
          >
            <Spinner className="size-3 text-ink-faint" />
            <span className="text-[11px] text-ink-faint">Sending…</span>
          </div>
        ) : message.failed ? (
          <div
            className={cx(
              'mt-1 flex items-center',
              mine ? 'justify-end' : 'justify-start'
            )}
          >
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-full border border-error/40 bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-error transition-colors hover:bg-danger/15"
            >
              <RefreshCw className="size-3" strokeWidth={2} />
              Failed · Retry
            </button>
          </div>
        ) : (
          <ReactionBar
            message={message}
            meId={meId}
            mine={mine}
            onReact={onReact}
          />
        )}
      </div>
    </div>
  )
}
