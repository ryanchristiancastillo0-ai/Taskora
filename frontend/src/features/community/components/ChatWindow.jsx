import {
  ArrowDown,
  ArrowLeft,
  Info,
  MessagesSquare,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import GroupAvatar from '@/components/ui/GroupAvatar'
import Spinner from '@/components/ui/Spinner'
import { useApp } from '@/app/providers/AppContext'
import { personName } from '@/utils/format'
import UserProfileMenu from './UserProfileMenu'
import ChatComposer from './chat/ChatComposer'
import { TypingBubble } from './chat/MessageAttachments'
import MessageRow from './chat/MessageRow'
import { MAX_ATTACHMENTS, MAX_BYTES, dayKey, dayLabel } from './chat/messageFormat'
export default function ChatWindow({
  conversationId,
  onBack,
  onOpenDetails,
}) {
  const { data, actions, typing, pushToast, chatLoading, chatError } = useApp()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState([])
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef(null)
  // The composer grew into a textarea, so its height is content-driven. The
  // ref lets the reset after a send shrink it back without a second pass.
  const draftRef = useRef(null)
  // The message list scroller. Held as a ref rather than a sentinel element so
  // the distance to the bottom can be measured and scrolled directly.
  const scrollRef = useRef(null)
  // Whether the view is pinned to the newest message. A ref, not just state,
  // because the follow effect below needs the value from before this render.
  const pinnedRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  // Mirror of the staged files so callbacks can read the latest list without
  // having to be re-created on every keystroke.
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const conversation = data.conversations.find(
    (item) => item.id === conversationId
  )

  const meId = data.user?.id
  const userById = (id) => data.communityUsers.find((user) => user.id === id)

  const messages = conversation
    ? data.chatMessages
        .filter((message) => message.conversationId === conversationId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : []

  const others = conversation?.memberIds.filter((id) => id !== meId) ?? []
  const title = conversation
    ? conversation.type === 'GROUP'
      ? conversation.name
      : others
          .map((id) => userById(id))
          .filter(Boolean)
          .map((user) => `${user.firstName} ${user.lastName}`)
          .join(', ')
    : ''
  const isGroup = conversation?.type === 'GROUP'
  const isTyping = Boolean(typing[conversationId])

  // The composer is content-sized between one and about six lines. Measuring
  // after layout rather than during render keeps the caret from jumping.
  useLayoutEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [draft])

  // Opening a chat always lands on the newest message, even if the same
  // conversation was left scrolled up. Done without a smooth animation because
  // the jump would otherwise animate in from the previous scroll position.
  useEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversationId])

  // Follow incoming messages only while the reader is already at the bottom.
  // The distance has to be captured on scroll rather than read here: by the time
  // this effect runs the DOM has already grown, so measuring now would report
  // the user as "far from the bottom" even when they never scrolled away.
  useEffect(() => {
    if (!pinnedRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, isTyping])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // A small tolerance so sub-pixel rounding at the very bottom does not count
    // as "scrolled away".
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const pinned = distance <= 80
    pinnedRef.current = pinned
    setAtBottom(pinned)
  }

  const scrollToLatest = () => {
    pinnedRef.current = true
    setAtBottom(true)
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  // Object URLs are a manual resource, so every exit path has to release them:
  // unmount, switching conversations, and removing a staged file.
  useEffect(
    () => () => {
      pendingRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
    },
    []
  )

  const updateTyping = (value) => {
    if (conversationId) actions.emitTyping(conversationId, value)
  }

  const clearPending = () => {
    pendingRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    setPending([])
  }

  // Drop the tray when the user switches chats, otherwise staged files would
  // follow them into an unrelated conversation.
  useEffect(() => {
    clearPending()
    setDraft('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList ?? [])
    if (incoming.length === 0) return

    const current = pendingRef.current
    const room = MAX_ATTACHMENTS - current.length
    if (room <= 0) {
      pushToast(`You can attach up to ${MAX_ATTACHMENTS} files per message`, 'warn')
      return
    }
    if (incoming.length > room) {
      pushToast(
        `Only ${room} more file${room === 1 ? '' : 's'} can be attached`,
        'warn'
      )
    }

    const accepted = incoming.slice(0, room)
    const valid = accepted.filter((file) => file.size <= MAX_BYTES)
    if (valid.length < accepted.length) {
      pushToast('Each file must be 5 MB or smaller', 'warn')
    }

    const staged = valid.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2)}`,
      file,
      previewUrl: file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null,
    }))

    setPending([...current, ...staged])
  }

  const removePending = (key) => {
    const target = pendingRef.current.find((item) => item.key === key)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    setPending((current) => current.filter((item) => item.key !== key))
  }

  const onReact = (messageId, emoji) => {
    if (!conversationId) return
    actions.setMessageReaction(conversationId, messageId, emoji).catch(() => {})
  }

  const submit = async (event) => {
    if (event) event.preventDefault()
    const content = draft.trim()
    const files = pendingRef.current.map((item) => item.file)
    if (!content && files.length === 0) return

    setSending(true)
    try {
      await actions.sendChatMessage(conversationId, content || null, files)
      setDraft('')
      clearPending()
      updateTyping(false)
    } catch {
      // The action already surfaced the toast. Keep the tray and the draft so
      // a failed upload never costs the user their staged files or text.
    } finally {
      setSending(false)
    }
  }

  // Staging only: nothing is uploaded until the message is actually sent.
  const onPickFile = (event) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const memberName = (id) => {
    if (id === meId) return 'You'
    return personName(userById(id)) || 'Member'
  }

  return (
    <div
      data-dropdown-container
      className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card"
    >
      {conversation ? (
        <>
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-2.5 sm:gap-3 sm:px-4">
            {/* Only on a phone, where the rail is a separate pane and the chat
                needs a way back to it. */}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to conversations"
                className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink md:hidden"
              >
                <ArrowLeft className="size-5" strokeWidth={2} />
              </button>
            )}
            {isGroup ? (
              <>
                <GroupAvatar
                  name={conversation.name}
                  iconUrl={conversation.iconUrl}
                  members={conversation.members}
                  className="size-9 flex-shrink-0 sm:size-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{title}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {isTyping
                      ? 'typing...'
                      : `${conversation.memberIds.length} members`}
                  </p>
                </div>
              </>
            ) : (
              <UserProfileMenu
                userId={others[0]}
                align="left"
                triggerClassName="min-w-0 flex-1"
                trigger={
                  <span className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg transition-opacity hover:opacity-80">
                    <Avatar name={title} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {title}
                      </span>
                      {/* Typing is a real signal from the socket; there is no
                          presence data, so nothing else is claimed here. */}
                      <span className="block truncate text-[12px] text-ink-muted">
                        {isTyping ? 'typing…' : 'Direct message'}
                      </span>
                    </span>
                  </span>
                }
              />
            )}
            {onOpenDetails && (
              <button
                type="button"
                onClick={onOpenDetails}
                aria-label="Conversation details"
                className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink"
              >
                <Info className="size-[18px]" strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Relative wrapper so the scroll-to-latest button can sit over the
              message list without taking part in the flex column. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-canvas/40 px-4 py-4"
            >
            {chatLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Spinner className="size-5 text-ink-faint" />
                <p className="text-[13px] text-ink-muted">Loading messages…</p>
              </div>
            )}

            {!chatLoading && chatError && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="max-w-xs text-[13px] leading-relaxed text-error">
                  {chatError}
                </p>
                {/* A failed load never reaches the message cache, so reopening
                    the same conversation is the retry. */}
                <Button
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => actions.openConversation(conversation.id)}
                >
                  Try again
                </Button>
              </div>
            )}

            {!chatLoading && !chatError && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="text-sm font-semibold text-ink">
                  No messages yet
                </p>
                <p className="max-w-xs text-[13px] leading-relaxed text-ink-muted">
                  {isGroup
                    ? 'Say hello to the group to get things started.'
                    : `Send ${title || 'them'} a message to start the conversation.`}
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              // A divider is drawn above a message whose day differs from the
              // previous one's, so consecutive same-day messages stay tight.
              const previous = messages[index - 1]
              const newDay =
                !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)

              return (
                <div key={message.id}>
                {newDay && (
                  <div className="flex items-center gap-3 py-2">
                    <span className="h-px flex-1 bg-border-subtle" />
                    <span className="text-[11px] font-medium text-ink-faint">
                      {dayLabel(message.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-border-subtle" />
                  </div>
                )}

                {message.type === 'SYSTEM' ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-surface-container px-3 py-1 text-[11px] text-ink-muted">
                      {message.content}
                    </span>
                  </div>
                ) : (
                  <MessageRow
                    message={message}
                    mine={message.senderId === meId}
                    isGroup={isGroup}
                    meId={meId}
                    senderName={memberName(message.senderId)}
                    senderAvatar={userById(message.senderId)?.avatarUrl}
                    onReact={(emoji) => onReact(message.id, emoji)}
                  />
                )}
                </div>
              )
            })}

            {isTyping && <TypingBubble />}
            </div>

            {!atBottom && (
              <button
                type="button"
                onClick={scrollToLatest}
                aria-label="Scroll to latest message"
                title="Scroll to latest message"
                className="absolute bottom-4 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-ink-muted shadow-lifted transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ArrowDown className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <ChatComposer
            draft={draft}
            pending={pending}
            draftRef={draftRef}
            fileInputRef={fileInputRef}
            sending={sending}
            onSubmit={submit}
            onPickFile={onPickFile}
            onRemovePending={removePending}
            onAttachClick={() => fileInputRef.current?.click()}
            onDraftChange={(event) => {
              const value = event.target.value
              setDraft(value)
              if (conversationId) {
                actions.emitTyping(conversationId, value.trim().length > 0)
              }
            }}
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MessagesSquare className="size-7" strokeWidth={2} />
          </div>
          <h3 className="text-base font-semibold text-ink">Pick a conversation</h3>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            Message a friend, or start a group to plan with your team.
          </p>
        </div>
      )}
    </div>
  )
}
