import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { api, refreshAccessToken, registerUnauthorizedHandler } from '@/shared/api/client'
import { connectSocket, disconnectSocket } from '@/shared/api/socket'
import {
  normalizeTask,
  normalizeProject,
  normalizeTag,
  normalizeNote,
  normalizeGoal,
  normalizeHabit,
  normalizeNotification,
  normalizeUser,
  normalizeProfile,
  normalizeSettings,
  normalizeNotificationSound,
  normalizeCommunityUser,
  normalizeFriend,
  normalizeFriendRequest,
  normalizeConversation,
  normalizeChatMessage,
  normalizeChatReactions,
  normalizeAiConversation,
  normalizeAiMessage,
  todayKey,
} from '@/shared/api/normalize'
import { initialData, isSameUser } from './shared'
import { playNotificationSound, playNotificationSounds, setNotificationSoundUrl, setNotificationSoundEnabled } from '@/shared/utils/notificationSound'
import { createAiActions } from './actions/ai'
import { createCommunityActions } from './actions/community'
import { createGoalActions, createHabitActions } from './actions/goals'
import { createNotificationActions } from './actions/notifications'
import { createNoteActions, createProjectActions } from './actions/projects'
import { createAccountActions, createSettingsActions } from './actions/settings'
import { createTaskActions } from './actions/tasks'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [data, setData] = useState(initialData)
  const [authState, setAuthState] = useState('loading')
  const [toasts, setToasts] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [typing, setTyping] = useState({})
  // In-flight AI reply text keyed by conversationId, null when nothing is
  // streaming. Rendered above the stored messages so a reply reads as it is
  // written; cleared once the persisted message arrives.
  const [aiStream, setAiStream] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const activeConversationRef = useRef(null)
  const loadedMessagesRef = useRef(new Set())
  // Mirrors the id de-dupe the notification list already does below, so a
  // notification delivered twice rings once.
  const lastNotifiedIdRef = useRef(null)
  const backlogSoundPlayedRef = useRef(false)
  // The first socket connect of a session is already covered by bootstrap(), so
  // only later reconnects need to reconcile for messages missed while offline.
  const socketPrimedRef = useRef(false)

  const activateConversation = useCallback((id) => {
    if (id) {
      activeConversationRef.current = id
      setActiveConversationId(id)
    }
  }, [])

  // Single teardown for every path that ends a session (logout, 401, account
  // deletion). The provider stays mounted across those, so any ref left behind
  // leaks into whoever signs in next. The dangerous one is loadedMessagesRef:
  // setData(initialData()) wipes the message cache, but if the ref still claims
  // the conversation was loaded, openConversation skips the history fetch and
  // the chat stays empty until a full page reload.
  const resetSessionState = useCallback(() => {
    disconnectSocket()
    loadedMessagesRef.current.clear()
    activeConversationRef.current = null
    lastNotifiedIdRef.current = null
    backlogSoundPlayedRef.current = false
    socketPrimedRef.current = false
    setData(initialData())
    setActiveConversationId(null)
    setTyping({})
    setChatLoading(false)
    setChatError('')
    setAuthState('guest')
  }, [])

  const pushToast = useCallback((message, tone = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const upsertTask = useCallback((task) => {
    setData((prev) => {
      const exists = prev.tasks.some((item) => item.id === task.id)
      return {
        ...prev,
        tasks: exists
          ? prev.tasks.map((item) => (item.id === task.id ? task : item))
          : [task, ...prev.tasks],
      }
    })
  }, [])

  const mergeUsers = useCallback((users) => {
    const normalized = (users || []).map(normalizeCommunityUser).filter(Boolean)
    if (normalized.length === 0) return
    setData((prev) => {
      const existing = new Map(prev.communityUsers.map((user) => [user.id, user]))
      let changed = false
      normalized.forEach((user) => {
        const current = existing.get(user.id)
        if (current && isSameUser(current, user)) return
        existing.set(user.id, user)
        changed = true
      })
      if (!changed) return prev
      return { ...prev, communityUsers: Array.from(existing.values()) }
    })
  }, [])

  const setProfile = useCallback((profile) => {
    const normalized = normalizeProfile(profile)
    if (normalized) {
      setData((prev) => ({ ...prev, profile: normalized }))
    }
  }, [])

  const setUser = useCallback((user) => {
    const normalized = normalizeUser(user)
    if (normalized) {
      setData((prev) => ({ ...prev, user: normalized }))
    }
  }, [])

  const upsertAiMessage = useCallback((message) => {
    const normalized = normalizeAiMessage(message)
    if (!normalized) return
    // The finished reply supersedes whatever was streaming for that thread.
    setAiStream((current) =>
      current && current.conversationId === String(normalized.conversationId)
        ? null
        : current
    )
    setData((prev) => ({
      ...prev,
      aiMessages: [
        normalized,
        ...prev.aiMessages.filter((item) => item.id !== normalized.id),
      ],
    }))
  }, [])

  const upsertAiConversation = useCallback((conversation) => {
    const normalized = normalizeAiConversation(conversation)
    if (!normalized) return
    setData((prev) => {
      const exists = prev.aiConversations.some(
        (item) => item.id === normalized.id
      )
      return {
        ...prev,
        aiConversations: exists
          ? prev.aiConversations.map((item) =>
              item.id === normalized.id ? normalized : item
            )
          : [normalized, ...prev.aiConversations],
      }
    })
  }, [])

  const fetchCoreData = useCallback(async () => {
    const [tasksRes, projectsRes, tagsRes, notesRes, goalsRes, habitsRes, notificationsRes] =
      await Promise.all([
        api.get('/tasks?limit=500'),
        api.get('/projects?limit=500'),
        api.get('/tags?limit=500'),
        api.get('/notes?limit=500'),
        api.get('/goals?limit=500'),
        api.get('/habits?limit=500'),
        api.get('/notifications?limit=200'),
      ])

    const dayKey = todayKey()

    return {
      tasks: (tasksRes.items || []).map(normalizeTask),
      projects: (projectsRes.items || []).map(normalizeProject),
      tags: (tagsRes.items || []).map(normalizeTag),
      notes: (notesRes.items || []).map(normalizeNote),
      goals: (goalsRes.items || []).map(normalizeGoal),
      habits: (habitsRes.items || []).map((habit) => normalizeHabit(habit, dayKey)),
      notifications: (notificationsRes.items || []).map(normalizeNotification),
    }
  }, [])

  const fetchCommunity = useCallback(async () => {
    const [friendsRes, receivedRes, sentRes, conversationsRes] =
      await Promise.all([
        api.get('/community/friends?limit=200'),
        api.get('/community/friends/requests?direction=received&status=PENDING&limit=200'),
        api.get('/community/friends/requests?direction=sent&status=PENDING&limit=200'),
        api.get('/community/conversations?limit=200'),
      ])

    const friends = (friendsRes.items || []).map(normalizeFriend).filter(Boolean)
    const requests = [...(receivedRes.items || []), ...(sentRes.items || [])]
      .map(normalizeFriendRequest)
      .filter(Boolean)
    const conversations = (conversationsRes.items || [])
      .map(normalizeConversation)
      .filter(Boolean)

    return { friends, friendRequests: requests, conversations }
  }, [])

  const fetchAiConversations = useCallback(async () => {
    const res = await api.get('/ai/conversations?limit=100')
    return (res.items || []).map(normalizeAiConversation).filter(Boolean)
  }, [])

  const refreshRequests = useCallback(async () => {
    const [receivedRes, sentRes] = await Promise.all([
      api.get('/community/friends/requests?direction=received&status=PENDING&limit=200'),
      api.get('/community/friends/requests?direction=sent&status=PENDING&limit=200'),
    ])
    const requests = [...(receivedRes.items || []), ...(sentRes.items || [])]
      .map(normalizeFriendRequest)
      .filter(Boolean)
    mergeUsers(requests.map((request) => request.user).filter(Boolean))
    setData((prev) => ({ ...prev, friendRequests: requests }))
    return requests
  }, [mergeUsers])

  const refreshFriends = useCallback(async () => {
    const res = await api.get('/community/friends?limit=200')
    const friends = (res.items || []).map(normalizeFriend).filter(Boolean)
    mergeUsers(friends.map((friend) => friend.user).filter(Boolean))
    setData((prev) => ({ ...prev, friends }))
    return friends
  }, [mergeUsers])

  const refreshConversations = useCallback(async () => {
    const res = await api.get('/community/conversations?limit=200')
    const conversations = (res.items || [])
      .map(normalizeConversation)
      .filter(Boolean)
    const users = conversations.flatMap((conversation) => conversation.members)
    mergeUsers(users)
    setData((prev) => ({ ...prev, conversations }))
    return conversations
  }, [mergeUsers])

  const upsertConversation = useCallback((conversation) => {
    const normalized = normalizeConversation(conversation)
    if (!normalized) return normalized
    mergeUsers(normalized.members)
    setData((prev) => {
      const existing = prev.conversations.find(
        (item) => item.id === normalized.id
      )
      return {
        ...prev,
        conversations: existing
          ? prev.conversations.map((item) =>
              // A `chat:conversation` socket event describes the roster, not the
              // message history, and carries no lastMessage. Replacing blindly
              // would blank the preview back to "No messages yet", so an absent
              // preview keeps whatever we already had.
              item.id === normalized.id
                ? {
                    ...normalized,
                    lastMessage: normalized.lastMessage ?? item.lastMessage,
                  }
                : item
            )
          : [normalized, ...prev.conversations],
      }
    })
    return normalized
  }, [mergeUsers])

  const appendChatMessage = useCallback((message) => {
    const normalized = normalizeChatMessage(message)
    if (!normalized) return normalized
    setData((prev) => ({
      ...prev,
      chatMessages: [
        ...prev.chatMessages.filter((item) => item.id !== normalized.id),
        normalized,
      ],
      conversations: prev.conversations.map((conversation) =>
        conversation.id === normalized.conversationId
          ? { ...conversation, lastMessageAt: normalized.createdAt }
          : conversation
      ),
    }))
    return normalized
  }, [])

  const loadMessages = useCallback(
    (conversationId) => {
      return api
        .get(`/community/conversations/${conversationId}/messages?limit=100`)
        .then((result) => {
          const messages = (result.items || [])
            .map(normalizeChatMessage)
            .filter(Boolean)
          mergeUsers(
            (result.items || [])
              .map((message) => message.sender)
              .filter(Boolean)
          )
          setData((prev) => ({
            ...prev,
            chatMessages: [
              ...prev.chatMessages.filter(
                (item) => item.conversationId !== conversationId
              ),
              ...messages,
            ],
          }))
          loadedMessagesRef.current.add(conversationId)
          return messages
        })
    },
    [mergeUsers]
  )

  const bootstrap = useCallback(async () => {
    try {
      const me = await api.get('/auth/me')
      const [core, community, settingsRes, aiConversations, soundList] =
        await Promise.all([
          fetchCoreData(),
          fetchCommunity(),
          api.get('/settings'),
          fetchAiConversations(),
          // The sound catalogue lives only on the backend; it is fetched once
          // here rather than on every render of the settings page.
          api.get('/notifications/sounds'),
        ])

      const user = normalizeUser(me.user)
      const profile = normalizeProfile(me.profile)

      const notificationSounds = (soundList || [])
        .map(normalizeNotificationSound)
        .filter(Boolean)
      const notificationSound = normalizeNotificationSound(
        settingsRes.notificationSound
      )

      // Point the sound engine at the resolved clip before anything can ring,
      // so the backlog below plays the selected sound. The backend substitutes
      // the default when the user has never chosen one.
      setNotificationSoundUrl(notificationSound?.path)
      // Apply the mute switch at the same time, so the login backlog respects it.
      // Sound is opt-in: only an explicit true plays anything, so a settings
      // payload that never mentions the flag lands on silence rather than noise.
      setNotificationSoundEnabled(settingsRes.notificationSettings?.soundEnabled === true)

      const people = [
        user,
        ...(community.friends || []).map((friend) => friend.user),
        ...(community.friendRequests || []).map((request) => request.user),
        ...(community.conversations || []).flatMap((conversation) =>
          conversation.members
        ),
      ].filter(Boolean)

      const usersById = new Map()
      people.forEach((person) => usersById.set(person.id, person))

      setData((prev) => ({
        ...prev,
        // Both normalisers return null for a missing payload, and the store's
        // contract is that `user` and `profile` are always objects — the sidebar,
        // dashboard and both profile pages read them unguarded. Writing the null
        // straight in turned one account with no profile row into a white screen,
        // so a payload that cannot be normalised keeps the placeholder instead.
        user: user ?? prev.user,
        profile: profile ?? prev.profile,
        settings: normalizeSettings(
          settingsRes.settings,
          settingsRes.notificationSettings,
          notificationSound
        ),
        notificationSounds,
        communityUsers: Array.from(usersById.values()),
        friends: community.friends,
        friendRequests: community.friendRequests,
        conversations: community.conversations,
        aiConversations,
        ...core,
      }))

      // Notifications that arrived while the user was logged out never produced
      // a realtime event, so the login backlog is the one case the socket
      // handler above cannot cover. Beep once per unread notification, and only
      // for the first bootstrap of a session so later refreshes stay quiet.
      if (!backlogSoundPlayedRef.current) {
        backlogSoundPlayedRef.current = true
        const unread = (core.notifications || []).filter(
          (notification) => !notification.readAt
        ).length
        playNotificationSounds(unread)
      }

      setAuthState('ready')
      return me
    } catch (error) {
      setAuthState('guest')
      throw error
    }
  }, [fetchCoreData, fetchCommunity, fetchAiConversations])

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      resetSessionState()
    })

    let cancelled = false
    bootstrap()
      .then(() => {
        if (!cancelled) setAuthState('ready')
      })
      .catch(() => {
        if (!cancelled) setAuthState('guest')
      })
    return () => {
      cancelled = true
      disconnectSocket()
    }
  }, [bootstrap, resetSessionState])

  useEffect(() => {
    if (authState !== 'ready') return

    const socket = connectSocket()
    const handlerMap = {
      notification: (notification) => {
        const normalized = normalizeNotification(notification)
        if (!normalized) return
        setData((prev) => ({
          ...prev,
          notifications: [
            normalized,
            ...prev.notifications.filter((item) => item.id !== normalized.id),
          ],
        }))
        pushToast(normalized.title, 'info')
        // The socket event covers notifications that arrive while the user is
        // online; the login backlog in bootstrap() covers the rest.
        if (lastNotifiedIdRef.current !== normalized.id) {
          lastNotifiedIdRef.current = normalized.id
          playNotificationSound()
        }
      },
      'chat:message': (message) => {
        const normalized = normalizeChatMessage(message)
        if (!normalized) return
        // Without this a sender who is not already in communityUsers renders as
        // a nameless "Member" until the next history fetch.
        if (message?.sender) mergeUsers([message.sender])
        const isActive =
          activeConversationRef.current === normalized.conversationId
        setData((prev) => ({
          ...prev,
          chatMessages: [
            ...prev.chatMessages.filter((item) => item.id !== normalized.id),
            normalized,
          ],
          conversations: prev.conversations.map((conversation) =>
            conversation.id === normalized.conversationId
              ? {
                  ...conversation,
                  lastMessage: normalized,
                  lastMessageAt: normalized.createdAt,
                  unread: isActive ? 0 : conversation.unread + 1,
                }
              : conversation
          ),
        }))
      },
      'chat:reaction': ({ messageId, reactions }) => {
        if (!messageId) return
        // The server sends the full reaction set for the message, so this is a
        // straight replace rather than a merge and cannot double-count. The
        // reacting user is excluded from this broadcast and applies the same
        // payload from the HTTP response instead.
        setData((prev) => ({
          ...prev,
          chatMessages: prev.chatMessages.map((item) =>
            item.id === messageId
              ? { ...item, reactions: normalizeChatReactions(reactions) }
              : item
          ),
        }))
      },
      'chat:conversation': (conversation) => {
        upsertConversation(conversation)
      },
      'chat:typing': ({ conversationId, isTyping }) => {
        setTyping((current) => ({
          ...current,
          [String(conversationId)]: Boolean(isTyping),
        }))
      },
      'ai:message': (payload) => {
        const normalized = normalizeAiMessage(payload?.message ?? payload)
        if (normalized) upsertAiMessage(normalized)
      },
      // Partial reply text while the model is still writing. Kept separate from
      // the stored messages so a refresh mid-generation cannot persist a
      // half-finished answer; the persisted ai:message replaces it on arrival.
      'ai:delta': (payload) => {
        const conversationId = String(payload?.conversationId ?? '')
        if (!conversationId) return
        setAiStream({
          conversationId,
          content: payload?.content ?? '',
        })
      },
      // Generation failed. Drop the partial reply; it is not a real message and
      // was never persisted.
      'ai:error': (payload) => {
        setAiStream((current) =>
          current && current.conversationId === String(payload?.conversationId)
            ? null
            : current
        )
      },
    }

    // The handshake authenticates with the access-token cookie, which expires
    // long before a tab that has been left open gives up. Refreshing then
    // re-handshaking keeps a long-lived tab live instead of leaving a socket
    // that is silently dead.
    let cancelled = false

    const onConnect = () => {
      if (!socketPrimedRef.current) {
        socketPrimedRef.current = true
        return
      }
      // Anything sent while the socket was down was never delivered, so
      // reconcile rather than trusting the local cache.
      refreshConversations().catch(() => {})
      const active = activeConversationRef.current
      if (active) {
        loadedMessagesRef.current.delete(active)
        loadMessages(active).catch(() => {})
      }
    }

    const onConnectError = () => {
      if (cancelled) return
      refreshAccessToken()
        .then(() => {
          if (!cancelled && socket.disconnected) socket.connect()
        })
        .catch(() => {
          // Refresh failed; the api client's unauthorized handler ends the session.
        })
    }

    Object.entries(handlerMap).forEach(([event, handler]) => {
      socket.on(event, handler)
    })
    socket.on('connect', onConnect)
    socket.on('connect_error', onConnectError)

    // Covers the case where the socket was already live when this effect ran.
    if (socket.connected) onConnect()

    return () => {
      cancelled = true
      socket.off('connect', onConnect)
      socket.off('connect_error', onConnectError)
      Object.keys(handlerMap).forEach((event) => socket.off(event))
    }
  }, [
    authState,
    pushToast,
    upsertAiMessage,
    upsertConversation,
    mergeUsers,
    refreshConversations,
    loadMessages,
  ])

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {})
    resetSessionState()
  }, [resetSessionState])

  const actions = useMemo(() => {
    const shared = { data, setData, pushToast }

    return {
      bootstrap,
      logout,
      ...createTaskActions({ ...shared, upsertTask }),
      ...createProjectActions(shared),
      ...createNoteActions(shared),
      ...createGoalActions(shared),
      ...createHabitActions(shared),
      ...createNotificationActions(shared),
      ...createCommunityActions({
        ...shared,
        mergeUsers,
        refreshRequests,
        refreshFriends,
        refreshConversations,
        upsertConversation,
        appendChatMessage,
        loadMessages,
        activateConversation,
        loadedMessagesRef,
        setChatLoading,
        setChatError,
      }),
      ...createAiActions({
        ...shared,
        fetchAiConversations,
        upsertAiMessage,
        upsertAiConversation,
      }),
      ...createSettingsActions(shared),
      ...createAccountActions({
        ...shared,
        setUser,
        setProfile,
        resetSessionState,
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const value = useMemo(
    () => ({
      data,
      actions,
      authState,
      toasts,
      pushToast,
      dismissToast,
      activeConversationId,
      typing,
      aiStream,
      chatLoading,
      chatError,
    }),
    [
      data,
      actions,
      authState,
      toasts,
      pushToast,
      dismissToast,
      activeConversationId,
      typing,
      aiStream,
      chatLoading,
      chatError,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
