import { Check, MessageCirclePlus, Search, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import IconButton from '@/components/ui/IconButton'
import Input from '@/components/ui/Input'
import { useApp } from '@/app/providers/AppContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cx } from '@/utils/format'
import ConversationItem from './ConversationItem'
import FriendActions from './FriendActions'

const TABS = [
  { value: 'CHATS', label: 'Chats' },
  { value: 'PEOPLE', label: 'People' },
  { value: 'GROUPS', label: 'Groups' },
]

function TabButton({ value, label, current, onClick }) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      aria-pressed={active}
      className={cx(
        'flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
        active ? 'bg-surface-card text-ink shadow-card' : 'text-ink-muted hover:text-ink'
      )}
    >
      {label}
    </button>
  )
}

function SectionHeading({ children, count }) {
  return (
    <h3 className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
      {typeof count === 'number' && <span className="ml-1 tabular-nums">{count}</span>}
    </h3>
  )
}

/**
 * The conversation / people / groups rail.
 *
 * Groups used to be indistinguishable from direct chats - both appeared in one
 * flat list - so a busy workspace buried its projects under every DM. Groups are
 * now their own tab, and the Chats tab keeps only direct messages.
 */
export default function ConversationList({
  activeId,
  onOpen,
  onNew,
  onMessageUser,
  onAddToGroup,
}) {
  const { data, actions } = useApp()
  const [tab, setTab] = useState('CHATS')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const actionsRef = useRef(actions)

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  const debouncedQuery = useDebouncedValue(query, 300)

  const meId = data.user?.id
  const userById = (id) => data.communityUsers.find((user) => user.id === id)

  const isSelfMatch = (term) => {
    const t = String(term || '').trim().toLowerCase()
    if (!t || !data.user) return false
    return [data.user.firstName, data.user.lastName, data.user.email].some((value) =>
      String(value || '').toLowerCase().includes(t)
    )
  }

  // People search hits the server; the other two tabs filter what is already
  // loaded, so only this one needs to be cancelled and guarded.
  useEffect(() => {
    if (tab !== 'PEOPLE' || !debouncedQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      setSearchError('')
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError('')
    actionsRef.current
      .searchPeople(debouncedQuery)
      .then((results) => {
        if (!cancelled) setSearchResults(results || [])
      })
      .catch((error) => {
        if (cancelled) return
        setSearchResults([])
        setSearchError(error?.message || 'Search failed. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, debouncedQuery])

  const chatTitle = (conversation) => {
    if (conversation.type === 'GROUP') return conversation.name
    return conversation.memberIds
      .map((id) => userById(id))
      .filter((user) => user && user.id !== meId)
      .map((user) => `${user.firstName} ${user.lastName}`)
      .join(', ')
  }

  const chatSubtitle = (conversation) => {
    const stored = data.chatMessages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    // Prefer what this client has actually seen, so the preview and the open
    // thread never disagree; the denormalised field is the fallback.
    const message =
      stored.length > 0 ? stored[stored.length - 1] : conversation.lastMessage
    if (!message) return 'No messages yet'
    if (message.type === 'SYSTEM') return message.content
    if (message.type === 'IMAGE') return 'Photo'
    if (message.type === 'FILE') return `Attachment: ${message.fileName ?? 'file'}`
    const sender =
      message.senderId === meId
        ? 'You'
        : userById(message.senderId)?.firstName ?? 'Someone'
    return `${sender}: ${message.content}`
  }

  const sorted = [...data.conversations].sort(
    (a, b) =>
      new Date(b.lastMessageAt ?? b.createdAt) -
      new Date(a.lastMessageAt ?? a.createdAt)
  )

  const term = debouncedQuery.trim().toLowerCase()
  const direct = sorted.filter(
    (conversation) =>
      conversation.type !== 'GROUP' && chatTitle(conversation).toLowerCase().includes(term)
  )
  const groups = sorted.filter(
    (conversation) =>
      conversation.type === 'GROUP' && conversation.name.toLowerCase().includes(term)
  )

  const friends = data.friends
  const incomingRequests = data.friendRequests.filter(
    (request) => request.senderId !== meId && request.status === 'PENDING'
  )

  const openNew = (value) => {
    setQuery('')
    setTab(value)
  }

  return (
    <div
      data-dropdown-container
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-card"
    >
      <div className="flex-shrink-0 border-b border-border-subtle p-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-surface-container p-0.5" role="tablist">
            {TABS.map((item) => (
              <TabButton
                key={item.value}
                value={item.value}
                label={item.label}
                current={tab}
                onClick={openNew}
              />
            ))}
          </div>
          {/* Duplicated in the page header: this one is for a phone, where the
              header has given its width to the brand and the bell. */}
          <button
            type="button"
            aria-label="New chat"
            onClick={onNew}
            className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container hover:text-ink md:hidden"
          >
            <MessageCirclePlus className="size-5" strokeWidth={2} />
          </button>
        </div>

        {tab !== 'PEOPLE' && (
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              strokeWidth={2}
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                tab === 'GROUPS' ? 'Search groups...' : 'Search conversations...'
              }
              aria-label={tab === 'GROUPS' ? 'Search groups' : 'Search conversations'}
              className="h-9 w-full rounded-field bg-canvas pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint transition-all focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'CHATS' && (
          <div className="flex flex-col">
            <SectionHeading count={direct.length}>Direct messages</SectionHeading>
            {direct.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                title={chatTitle(conversation)}
                subtitle={chatSubtitle(conversation)}
                onOpen={onOpen}
              />
            ))}
            {direct.length === 0 && (
              <p className="px-2 py-6 text-center text-[13px] text-ink-faint">
                {term ? 'No conversations found.' : 'No direct messages yet.'}
              </p>
            )}
            <SectionHeading count={groups.length}>Groups</SectionHeading>
            {groups.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                title={conversation.name}
                subtitle={chatSubtitle(conversation)}
                onOpen={onOpen}
                showGroupBadge
              />
            ))}
            {groups.length === 0 && (
              <p className="px-2 py-3 text-center text-[13px] text-ink-faint">
                {term ? 'No groups found.' : 'No groups yet.'}
              </p>
            )}
          </div>
        )}

        {tab === 'GROUPS' && (
          <div className="flex flex-col">
            <SectionHeading count={groups.length}>Your groups</SectionHeading>
            {groups.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                title={conversation.name}
                subtitle={chatSubtitle(conversation)}
                onOpen={onOpen}
              />
            ))}
            {groups.length === 0 && (
              <p className="flex flex-col items-center gap-2 px-2 py-8 text-center">
                <Users className="size-5 text-ink-faint" strokeWidth={1.75} />
                <span className="text-[13px] text-ink-muted">
                  {term
                    ? 'No groups found.'
                    : 'No groups yet. Start one from New chat to plan with several people at once.'}
                </span>
              </p>
            )}
          </div>
        )}

        {tab === 'PEOPLE' && (
          <div className="flex flex-col gap-4 p-1">
            <Input
              icon={Search}
              placeholder="Search people by name or email..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {query.trim() ? (
              <div className="flex flex-col gap-1">
                <SectionHeading count={searchResults.length}>Search results</SectionHeading>
                {searchResults.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-surface-soft"
                  >
                    <Avatar
                      name={`${person.firstName} ${person.lastName}`}
                      src={person.avatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {person.firstName} {person.lastName}
                      </p>
                      {person.bio && (
                        <p className="truncate text-[12px] text-ink-muted">{person.bio}</p>
                      )}
                    </div>
                    <FriendActions
                      userId={person.id}
                      onMessage={() => onMessageUser(person.id)}
                      onAddToGroup={(userId) => onAddToGroup([userId])}
                    />
                  </div>
                ))}
                {searchError && (
                  <p className="px-2 py-4 text-center text-[13px] text-error">{searchError}</p>
                )}
                {!searchError && searching && searchResults.length === 0 && (
                  <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                    Searching…
                  </p>
                )}
                {!searchError && !searching && searchResults.length === 0 && (
                  <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                    {isSelfMatch(debouncedQuery) ? (
                      <>That&apos;s you — you can&apos;t add yourself.</>
                    ) : (
                      'No people found.'
                    )}
                  </p>
                )}
              </div>
            ) : (
              <>
                {incomingRequests.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <SectionHeading count={incomingRequests.length}>Requests</SectionHeading>
                    {incomingRequests.map((request) => {
                      const person = userById(request.senderId)
                      if (!person) return null
                      return (
                        <div
                          key={request.id}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-soft"
                        >
                          <Avatar
                            name={`${person.firstName} ${person.lastName}`}
                            src={person.avatarUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">
                              {person.firstName} {person.lastName}
                            </p>
                            <p className="text-[12px] text-ink-muted">Wants to connect</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <IconButton
                              icon={Check}
                              label={`Accept ${person.firstName}'s request`}
                              size="sm"
                              onClick={() => actions.respondFriendRequest(request.id, true)}
                            />
                            <IconButton
                              icon={X}
                              label={`Decline ${person.firstName}'s request`}
                              size="sm"
                              onClick={() => actions.respondFriendRequest(request.id, false)}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <SectionHeading count={friends.length}>Friends</SectionHeading>
                  {friends.map((friend) => {
                    const user = friend.user ?? userById(friend.userId)
                    if (!user) return null
                    return (
                      <div
                        key={friend.id}
                        className="group flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-surface-soft"
                      >
                        <Avatar
                          name={`${user.firstName} ${user.lastName}`}
                          src={user.avatarUrl}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {user.firstName} {user.lastName}
                        </p>
                        <FriendActions
                          userId={user.id}
                          onMessage={() => onMessageUser(user.id)}
                          onAddToGroup={(userId) => onAddToGroup([userId])}
                          className="xl:opacity-0 xl:group-hover:opacity-100 xl:focus-within:opacity-100"
                        />
                      </div>
                    )
                  })}
                  {friends.length === 0 && (
                    <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                      No friends yet — search for people to connect with.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
