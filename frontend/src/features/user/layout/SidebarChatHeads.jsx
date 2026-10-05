import { MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cx, timeAgo } from '@/utils/format'
import Avatar from '@/components/ui/Avatar'
import { useApp } from '@/app/providers/AppContext'

/**
 * Recent direct-message heads for the signed-in user.
 *
 * Lives with UserSidebar rather than in shared/layout because it is strictly
 * personal: it reads the current account's conversations, and the admin console
 * has no business showing them.
 */
export default function SidebarChatHeads() {
  const { data, actions, activeConversationId } = useApp()
  const navigate = useNavigate()
  const meId = data.user?.id

  const userById = (id) => data.communityUsers.find((user) => user.id === id)

  const people = data.conversations
    .filter((conversation) => conversation.type === 'DIRECT')
    .map((conversation) => {
      const otherId = (conversation.memberIds || []).find((id) => id !== meId)
      const person = userById(otherId)
      return { conversation, person }
    })
    .filter((item) => item.person)
    .sort(
      (a, b) =>
        new Date(b.conversation.lastMessageAt ?? b.conversation.createdAt) -
        new Date(a.conversation.lastMessageAt ?? a.conversation.createdAt)
    )

  const openChat = (conversationId) => {
    actions.openConversation(conversationId)
    navigate('/community')
  }

  return (
    <div className="border-t border-border-subtle px-3 py-2.5">
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        People
      </p>
      {people.length === 0 ? (
        <div className="flex items-start gap-2.5 px-3 py-1.5">
          <MessageCircle
            className="mt-0.5 size-4 flex-shrink-0 text-ink-faint"
            strokeWidth={2}
          />
          <p className="text-[12px] leading-snug text-ink-muted">
            No people yet — start a conversation in Community.
          </p>
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto pr-1">
          <div className="flex flex-col gap-0.5">
            {people.map(({ conversation, person }) => {
              const name = `${person.firstName} ${person.lastName}`
              const active = conversation.id === activeConversationId
              return (
                <button
                  key={conversation.id}
                  type="button"
                  title={`Open chat with ${name}`}
                  onClick={() => openChat(conversation.id)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    active ? 'bg-primary-soft' : 'hover:bg-surface-container'
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <Avatar name={name} size="sm" status="online" />
                    {conversation.unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary-container text-[10px] font-semibold text-white">
                        {conversation.unread > 9 ? '9+' : conversation.unread}
                      </span>
                    )}
                  </span>
                  <span
                    className={cx(
                      'min-w-0 flex-1 truncate text-[13px] font-medium',
                      active ? 'text-primary' : 'text-ink-soft'
                    )}
                  >
                    {name}
                  </span>
                  {conversation.lastMessageAt && (
                    <span className="flex-shrink-0 text-[10px] text-ink-faint">
                      {timeAgo(conversation.lastMessageAt)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
