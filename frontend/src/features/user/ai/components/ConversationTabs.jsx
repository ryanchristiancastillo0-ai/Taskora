import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import Dropdown, { MenuItem } from '@/shared/components/ui/Dropdown'
import { cx } from '@/shared/utils/format'

export default function ConversationTabs({ conversations, activeId, onOpenThread, onRename, onDelete }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-subtle bg-surface-soft/50 p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Conversations
      </p>
      <div className="flex flex-wrap gap-1.5">
        {conversations.map((conversation) => (
          <span
            key={conversation.id}
            className={cx(
              'group inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
              activeId === conversation.id
                ? 'border-primary-container/30 bg-primary-soft text-primary'
                : 'border-border-subtle bg-surface-card text-ink-soft'
            )}
          >
            <button
              type="button"
              onClick={() => onOpenThread(conversation.id)}
              className="truncate"
            >
              {conversation.title ?? 'Untitled'}
            </button>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${conversation.title ?? 'conversation'}`}
                  className="flex size-4 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
                >
                  <MoreVertical className="size-3" strokeWidth={2} />
                </button>
              }
            >
              <MenuItem
                icon={Pencil}
                label="Rename"
                onClick={() => onRename(conversation)}
              />
              <MenuItem
                icon={Trash2}
                label="Delete"
                danger
                onClick={() => onDelete(conversation)}
              />
            </Dropdown>
          </span>
        ))}
        {conversations.length === 0 && (
          <p className="px-1 py-1 text-[12px] text-ink-faint">
            No conversations yet — start one below.
          </p>
        )}
      </div>
    </div>
  )
}
