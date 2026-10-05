import { Users } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import GroupAvatar from '@/components/ui/GroupAvatar'
import { cx, timeAgo } from '@/utils/format'

/**
 * One row in the Chats or Groups list.
 *
 * Extracted because the left panel now renders the same row in two places (a
 * direct-message section and a groups section) and the markup was the part
 * most likely to drift between them - a row that grew an unread pill in Chats
 * but not in Groups reads as a bug rather than a variant.
 */
export default function ConversationItem({
  conversation,
  active,
  title,
  subtitle,
  onOpen,
  showGroupBadge = false,
}) {
  const isGroup = conversation.type === 'GROUP'
  const unread = conversation.unread ?? 0
  // A group row in the Groups list is redundant with its own section header, so
  // the member count only shows where the list is not already filtered to groups.
  const meta = showGroupBadge
    ? `${conversation.memberIds.length} members`
    : timeAgo(conversation.lastMessageAt ?? conversation.createdAt)

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.id)}
      aria-current={active ? 'true' : undefined}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        active ? 'bg-primary-soft text-ink' : 'hover:bg-surface-soft'
      )}
    >
      {isGroup ? (
        <GroupAvatar
          name={conversation.name}
          iconUrl={conversation.iconUrl}
          members={conversation.members}
          className="size-10 flex-shrink-0"
        />
      ) : (
        <span className="flex-shrink-0">
          <Avatar name={title} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{title}</span>
            {showGroupBadge && (
              <Users className="size-3.5 flex-shrink-0 text-ink-faint" strokeWidth={2} />
            )}
          </span>
          <span className="flex-shrink-0 text-[11px] text-ink-faint">{meta}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cx(
              'truncate text-[13px]',
              unread > 0 ? 'font-medium text-ink-soft' : 'text-ink-muted'
            )}
          >
            {subtitle}
          </span>
          {unread > 0 && (
            <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-container text-[11px] font-semibold text-white">
              {unread}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
