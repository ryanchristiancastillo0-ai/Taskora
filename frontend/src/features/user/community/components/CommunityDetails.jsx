import { Camera, FileText, Users, UserPlus, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import Avatar from '@/shared/components/ui/Avatar'
import Button from '@/shared/components/ui/Button'
import GroupAvatar from '@/shared/components/ui/GroupAvatar'
import { useApp } from '../../context/AppContext'
import { cx, formatBytes, personName } from '@/shared/utils/format'
import AddMemberModal from './AddMemberModal'
import FriendActions from './FriendActions'
import UserProfileMenu from './UserProfileMenu'
import { useUserProfile } from './useUserProfile'

const TONE_CLASS = {
  slate: 'bg-surface-container text-ink-muted',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  indigo: 'bg-primary-soft text-primary',
  muted: 'bg-surface-container text-ink-muted',
}

function SectionLabel({ children, action }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {children}
      </h3>
      {action}
    </div>
  )
}

/**
 * Everything known about the open conversation that is not the message list.
 *
 * Everything here is derived from data the app already has - the conversation
 * record, `communityUsers`, and the messages the chat window has loaded - rather
 * than from a new endpoint. That is why "Shared" shows only what has been
 * loaded into this conversation, and why there is no presence dot: nothing in
 * the API says anyone is online, and showing one would be a lie the product
 * cannot keep.
 */
export default function CommunityDetails({
  conversation,
  onClose,
  onMessageUser,
  onAddToGroup,
}) {
  const { data, actions } = useApp()
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const photoInputRef = useRef(null)

  const meId = data.user?.id
  const isGroup = conversation?.type === 'GROUP'
  const isAdmin = conversation?.adminId === meId

  const userById = (id) => data.communityUsers.find((user) => user.id === id)
  const memberName = (id) => (id === meId ? 'You' : personName(userById(id)) || 'Member')

  // The person on the other side of a direct chat. A direct conversation is
  // always two people, so the first non-me member is the subject; the profile
  // hook then resolves everything about them.
  const otherId = conversation?.memberIds.find((id) => id !== meId)
  const other = useUserProfile(otherId)

  const messages = useMemo(
    () =>
      conversation
        ? data.chatMessages
            .filter((message) => message.conversationId === conversation.id)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        : [],
    [conversation, data.chatMessages]
  )

  // Flattened from the loaded history rather than fetched, so opening the panel
  // costs no request and cannot disagree with what is on screen. `data` is the
  // dependency rather than the individual fields, so the list recomputes
  // exactly when anything it reads could have changed.
  const shared = useMemo(() => {
    const images = []
    const files = []
    messages.forEach((message) => {
      ;(message.attachments ?? []).forEach((item) => {
        const entry = { ...item, sender: memberName(message.senderId) }
        if (item.kind === 'IMAGE') images.push(entry)
        else files.push(entry)
      })
    })
    return { images, files }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, data])

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-container text-ink-faint">
          <Users className="size-6" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-ink">No conversation selected</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Pick a chat to see who you are talking to and what you have shared.
        </p>
      </div>
    )
  }

  const title = isGroup ? conversation.name : other.name
  const subtitle = isGroup
    ? `${conversation.memberIds.length} members`
    : other.status || 'Not connected'

  const onPickPhoto = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) actions.updateGroupPhoto(conversation.id, file)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex items-start justify-between gap-2 border-b border-border-subtle px-4 py-4">
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          {isGroup ? (
            <GroupAvatar
              name={conversation.name}
              iconUrl={conversation.iconUrl}
              members={conversation.members}
              className="size-16"
            />
          ) : (
            <Avatar name={other.name} src={other.avatarUrl} size="xl" />
          )}
          <p className="mt-2.5 w-full truncate text-[15px] font-semibold text-ink">
            {title}
          </p>
          <p className="mt-0.5 w-full truncate text-[12px] text-ink-muted">{subtitle}</p>
          {!isGroup && (
            <span
              className={cx(
                'mt-2 rounded-full px-2 py-0.5 text-[11px] font-medium',
                TONE_CLASS[other.tone] ?? TONE_CLASS.muted
              )}
            >
              {other.status}
            </span>
          )}
        </div>
        {/* The close control belongs to the drawer and mobile-pane presentations
            of this panel; on the permanent desktop column there is nothing to
            close. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-container hover:text-ink"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="space-y-5 px-4 py-4">
        {!isGroup && otherId && (
          <section>
            <SectionLabel>Actions</SectionLabel>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                icon={Users}
                onClick={() => onMessageUser?.(otherId)}
                className="flex-1"
              >
                Message
              </Button>
              <FriendActions
                userId={otherId}
                onAddToGroup={
                  onAddToGroup
                    ? (userId) => onAddToGroup([userId])
                    : undefined
                }
              />
            </div>
            {other.email && (
              <p className="mt-2 truncate text-[12px] text-ink-muted">{other.email}</p>
            )}
            {other.bio && (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{other.bio}</p>
            )}
          </section>
        )}

        {isGroup && (
          <>
            <section>
              <SectionLabel>Group</SectionLabel>
              <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-soft/60 px-3 py-2.5">
                <GroupAvatar
                  name={conversation.name}
                  iconUrl={conversation.iconUrl}
                  members={conversation.members}
                  className="size-10 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">Group photo</p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {conversation.iconUrl
                      ? isAdmin
                        ? 'You can change this photo'
                        : 'Set by the admin'
                      : 'Showing member photos'}
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary-faint"
                    >
                      <Camera className="size-3.5" strokeWidth={2} />
                      Change
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onPickPhoto}
                    />
                  </>
                )}
              </div>
            </section>

            <section>
              <SectionLabel>{`Members (${conversation.memberIds.length})`}</SectionLabel>
              <div className="flex flex-col gap-0.5">
                {conversation.memberIds.map((id) => {
                  const name = memberName(id)
                  const row = (
                    <>
                      <Avatar name={name} src={userById(id)?.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {name}
                      </span>
                    </>
                  )
                  return (
                    <div key={id} className="flex items-center gap-2.5 py-1">
                      {id === meId ? (
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">{row}</div>
                      ) : (
                        <UserProfileMenu
                          userId={id}
                          align="left"
                          triggerClassName="min-w-0 flex-1"
                          trigger={
                            <span className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80">
                              {row}
                            </span>
                          }
                        />
                      )}
                      {isAdmin && id === meId && (
                        <span className="flex-shrink-0 text-[11px] font-medium text-primary">
                          Admin
                        </span>
                      )}
                      {isAdmin && id !== meId && (
                        <button
                          type="button"
                          onClick={() => actions.removeGroupMember(conversation.id, id)}
                          className="flex-shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-error transition-colors hover:bg-error/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )
                })}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-left text-[13px] font-medium text-ink-soft transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                  >
                    <UserPlus className="size-4 flex-shrink-0" strokeWidth={2} />
                    Add member
                  </button>
                )}
              </div>
              <AddMemberModal
                open={addMemberOpen}
                onClose={() => setAddMemberOpen(false)}
                conversation={conversation}
              />
            </section>
          </>
        )}

        <section>
          <SectionLabel>
            {`Shared${shared.images.length + shared.files.length > 0 ? ` (${shared.images.length + shared.files.length})` : ''}`}
          </SectionLabel>

          {shared.images.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {shared.images.map((item) => (
                <a
                  key={item.id ?? item.url}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${item.fileName ?? 'Shared image'} - ${item.sender}`}
                  className="block overflow-hidden rounded-lg"
                >
                  <img
                    src={item.url}
                    alt={item.fileName ?? `Shared image from ${item.sender}`}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          )}

          {shared.files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {shared.files.map((item) => (
                <li key={item.id ?? item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    download={item.fileName ?? undefined}
                    className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-soft/60 px-2.5 py-2 transition-colors hover:bg-surface-container"
                  >
                    <FileText className="size-4 flex-shrink-0 text-ink-soft" strokeWidth={2} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {item.fileName ?? 'Attachment'}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {item.sender}
                        {item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ''}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {shared.images.length === 0 && shared.files.length === 0 && (
            <p className="rounded-card border border-dashed border-border-subtle bg-surface-soft/40 px-3 py-4 text-center text-[12px] leading-relaxed text-ink-muted">
              Nothing shared yet. Photos and files sent in this chat collect here
              as the history loads.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
