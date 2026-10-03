import {
  ArrowDown,
  ArrowLeft,
  FileText,
  Info,
  MessagesSquare,
  Paperclip,
  RefreshCw,
  Send,
  SmilePlus,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Avatar from '@/shared/components/ui/Avatar'
import Button from '@/shared/components/ui/Button'
import GroupAvatar from '@/shared/components/ui/GroupAvatar'
import Spinner from '@/shared/components/ui/Spinner'
import { useApp } from '../../context/AppContext'
import { cx, formatTime, isToday, personName } from '@/shared/utils/format'
import UserProfileMenu from './UserProfileMenu'

// Mirrors the server limits in backend/src/validators/messageValidators.js.
const MAX_ATTACHMENTS = 10
const MAX_BYTES = 5 * 1024 * 1024
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢']

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function dayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// Chat history is only readable with some sense of scale: "2 hours ago" and
// "last Tuesday" mean nothing without knowing they are two different days.
// Dividers are derived from the same timestamps the bubbles use, so nothing new
// is stored or fetched.
function dayLabel(value) {
  const date = new Date(value)
  if (isToday(date)) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <Avatar name="" size="sm" />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border-subtle bg-surface-soft px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-pulse rounded-full bg-ink-faint"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function MessageAttachments({ attachments, mine }) {
  if (!attachments?.length) return null

  const images = attachments.filter((item) => item.kind === 'IMAGE')
  const files = attachments.filter((item) => item.kind !== 'IMAGE')

  return (
    <div className="space-y-1.5">
      {images.length > 0 && (
        <div
          className={cx(
            'grid gap-1',
            images.length > 1 && 'grid-cols-2'
          )}
        >
          {images.map((item) => (
            <a
              key={item.id ?? item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl"
            >
              <img
                src={item.url}
                alt={item.fileName ?? 'Shared image'}
                loading="lazy"
                className={cx(
                  'w-full object-cover',
                  images.length === 1 ? 'max-h-56' : 'h-28'
                )}
              />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={cx('space-y-1.5', images.length > 0 && 'p-2.5')}>
          {files.map((item) => (
            <a
              key={item.id ?? item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              download={item.fileName ?? undefined}
              className={cx(
                'flex items-center gap-2 rounded-lg px-2.5 py-2 transition-opacity hover:opacity-80',
                mine ? 'bg-white/15' : 'bg-black/5'
              )}
            >
              <FileText
                className={cx(
                  'size-4 flex-shrink-0',
                  mine ? 'text-white/80' : 'text-ink-soft'
                )}
                strokeWidth={2}
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">
                  {item.fileName ?? 'Attachment'}
                </p>
                {item.fileSize ? (
                  <p
                    className={cx(
                      'text-[11px]',
                      mine ? 'text-white/70' : 'text-ink-muted'
                    )}
                  >
                    {formatBytes(item.fileSize)}
                  </p>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function groupReactions(reactions, meId) {
  const grouped = new Map()
  reactions.forEach((reaction) => {
    const entry = grouped.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
      // Reactors are tracked by id, not by name: two people can share a name,
      // and matching on the string would wrongly drop one of them.
      reactors: [],
    }
    entry.count += 1
    if (reaction.userId === meId) entry.mine = true
    if (!entry.reactors.some((item) => item.userId === reaction.userId)) {
      // Prefer the identity the server sent with the reaction; fall back to
      // nothing when the payload predates that field.
      entry.reactors.push({
        userId: reaction.userId ?? null,
        name: personName(reaction) || null,
      })
    }
    grouped.set(reaction.emoji, entry)
  })
  return [...grouped.values()].sort((a, b) => b.count - a.count)
}

function joinNames(names) {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// "You and Priya reacted with 👍" — the point of a reaction is knowing who sent
// it, so a bare count is not enough. Reactors whose identity never arrived are
// collapsed into an "N others" tail rather than listed as repeated "Someone".
function reactionSummary(group, meId) {
  const named = []
  let unknown = 0
  group.reactors.forEach((reactor) => {
    if (reactor.userId === meId) {
      if (!named.includes('You')) named.push('You')
      return
    }
    if (reactor.name) named.push(reactor.name)
    else unknown += 1
  })

  if (group.mine && !named.includes('You')) named.unshift('You')

  const subject = named.length ? joinNames(named) : 'Someone'
  const tail = unknown > 0 ? ` and ${unknown} other${unknown === 1 ? '' : 's'}` : ''
  return `${subject} reacted with ${group.emoji}${tail}`
}

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
 * Extracted from the list because the bubble has three layouts (text, media,
 * media with a caption) and the list was the only place any of them could be
 * read. Kept in this file rather than its own module because it is only ever
 * used here and shares the attachment and reaction helpers above.
 */
function MessageRow({
  message,
  mine,
  isGroup,
  meId,
  senderName,
  senderAvatar,
  onReact,
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
                  : 'rounded-bl-md border border-border-subtle bg-surface-soft text-ink'
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
                  : 'rounded-bl-md border border-border-subtle bg-surface-soft text-ink'
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
        <ReactionBar
          message={message}
          meId={meId}
          mine={mine}
          onReact={onReact}
        />
      </div>
    </div>
  )
}

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

          <form
            onSubmit={submit}
            className="border-t border-border-subtle px-3 py-3"
          >
            {pending.length > 0 && (
              <div className="mb-2.5">
                <ul className="flex flex-wrap gap-2">
                  {pending.map((item) => (
                    <li
                      key={item.key}
                      className="group relative size-16 flex-shrink-0"
                    >
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
                        onClick={() => removePending(item.key)}
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
                  {formatBytes(
                    pending.reduce((sum, item) => sum + item.file.size, 0)
                  )}{' '}
                  · nothing uploads until you send
                </p>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                aria-label="Attach file or image"
                onClick={() => fileInputRef.current?.click()}
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
              {/* A textarea rather than a single-line input: pasted addresses,
                  code snippets and multi-line notes were previously impossible
                  to write. Enter still sends, Shift+Enter inserts a newline, so
                  the muscle memory of every other chat app is unchanged. */}
              <textarea
                ref={draftRef}
                rows={1}
                value={draft}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft(value)
                  if (conversationId) {
                    actions.emitTyping(conversationId, value.trim().length > 0)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder={
                  pending.length > 0
                    ? 'Add a message (optional)...'
                    : 'Type a message...'
                }
                aria-label="Message"
                className="max-h-36 min-h-10 min-w-0 flex-1 resize-none rounded-field border border-border-subtle bg-canvas px-4 py-2.5 text-sm leading-snug text-ink placeholder:text-ink-faint transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
              <Button
                type="submit"
                icon={Send}
                disabled={sending || (!draft.trim() && pending.length === 0)}
                className="mb-0.5 flex-shrink-0 !px-3"
                aria-label="Send message"
              />
            </div>
          </form>
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
