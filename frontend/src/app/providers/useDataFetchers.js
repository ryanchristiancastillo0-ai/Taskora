import { useCallback } from 'react'
import {
  normalizeAiConversation,
  normalizeChatMessage,
  normalizeConversation,
  normalizeFriend,
  normalizeFriendRequest,
  normalizeGoal,
  normalizeHabit,
  normalizeNotification,
  normalizeNotificationSound,
  normalizeProfile,
  normalizeProject,
  normalizeSettings,
  normalizeTag,
  normalizeTask,
  normalizeNote,
  normalizeUser,
  todayKey,
} from '@/services/api/normalize'
import { tasksApi } from '@/features/user/tasks/api/tasksApi'
import { notesApi, projectsApi, tagsApi } from '@/features/user/projects/api/projectsApi'
import { goalsApi } from '@/features/user/goals/api/goalsApi'
import { habitsApi } from '@/features/user/habits/api/habitsApi'
import { notificationsApi } from '@/features/user/notifications/api/notificationsApi'
import { communityApi } from '@/features/community/api/communityApi'
import { aiApi } from '@/features/user/ai/api/aiApi'
import { settingsApi } from '@/features/user/settings/api/settingsApi'
import { authApi } from '@/features/auth/api/authApi'
import { isLocalId } from '@/app/providers/store/actions/community'
import {
  setNotificationSoundEnabled,
  setNotificationSoundUrl,
  playNotificationSounds,
} from '@/utils/notificationSound'

/**
 * Every network read the store performs, plus the bootstrap that runs them all
 * on mount. Kept apart from the provider so the fetch shapes can be read without
 * scrolling through the socket wiring.
 */
export function useDataFetchers({
  setData,
  mergeUsers,
  loadedMessagesRef,
  backlogSoundPlayedRef,
  setAuthState,
}) {
  const fetchCoreData = useCallback(async () => {
    const [tasksRes, projectsRes, tagsRes, notesRes, goalsRes, habitsRes, notificationsRes] =
      await Promise.all([
        tasksApi.list(),
        projectsApi.list(),
        tagsApi.list(),
        notesApi.list(),
        goalsApi.list(),
        habitsApi.list(),
        notificationsApi.list(),
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
    const [friendsRes, requestsRes, conversationsRes] = await Promise.all([
      communityApi.listFriends(),
      communityApi.listPendingRequests(),
      communityApi.listConversations(),
    ])

    const friends = (friendsRes.items || []).map(normalizeFriend).filter(Boolean)
    const requests = [
      ...(requestsRes[0].items || []),
      ...(requestsRes[1].items || []),
    ]
      .map(normalizeFriendRequest)
      .filter(Boolean)
    const conversations = (conversationsRes.items || [])
      .map(normalizeConversation)
      .filter(Boolean)

    return { friends, friendRequests: requests, conversations }
  }, [])

  const fetchAiConversations = useCallback(async () => {
    const res = await aiApi.listConversations()
    return (res.items || []).map(normalizeAiConversation).filter(Boolean)
  }, [])

  const refreshRequests = useCallback(async () => {
    const [receivedRes, sentRes] = await communityApi.listPendingRequests()
    const requests = [...(receivedRes.items || []), ...(sentRes.items || [])]
      .map(normalizeFriendRequest)
      .filter(Boolean)
    mergeUsers(requests.map((request) => request.user).filter(Boolean))
    setData((prev) => ({ ...prev, friendRequests: requests }))
    return requests
  }, [mergeUsers])

  const refreshFriends = useCallback(async () => {
    const res = await communityApi.listFriends()
    const friends = (res.items || []).map(normalizeFriend).filter(Boolean)
    mergeUsers(friends.map((friend) => friend.user).filter(Boolean))
    setData((prev) => ({ ...prev, friends }))
    return friends
  }, [mergeUsers])

  const refreshConversations = useCallback(async () => {
    const res = await communityApi.listConversations()
    const conversations = (res.items || [])
      .map(normalizeConversation)
      .filter(Boolean)
    const users = conversations.flatMap((conversation) => conversation.members)
    mergeUsers(users)
    setData((prev) => ({ ...prev, conversations }))
    return conversations
  }, [mergeUsers])

  const upsertConversation = useCallback(
    (conversation) => {
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
                // A `chat:conversation` socket event describes the roster, not
                // the message history, and carries no lastMessage. An absent
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
    },
    [mergeUsers]
  )

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
      return communityApi
        .messages(conversationId)
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
              // Rows this client is still sending (or retrying) are kept: the
              // server does not have them yet, so dropping them here would
              // erase a message the user was told had failed.
              ...prev.chatMessages.filter(
                (item) =>
                  item.conversationId !== conversationId || isLocalId(item.id)
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
      const me = await authApi.me()
      const [core, community, settingsRes, aiConversations, soundList] =
        await Promise.all([
          fetchCoreData(),
          fetchCommunity(),
          settingsApi.get(),
          fetchAiConversations(),
          // The sound catalogue lives only on the backend; fetched once here
          // rather than on every render of the settings page.
          notificationsApi.sounds(),
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
      // and apply the mute switch at the same time, so the login backlog below
      // respects it. Sound is opt-in: only an explicit true plays anything.
      setNotificationSoundUrl(notificationSound?.path)
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
        // A payload that cannot be normalised keeps the placeholder rather than
        // writing a null the sidebar and both profile pages read unguarded.
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

      // Notifications that arrived while logged out never produced a realtime
      // event, so this backlog is the one case the socket handler cannot cover.
      // Once per session, so later refreshes stay quiet.
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

  return {
    bootstrap,
    fetchAiConversations,
    refreshRequests,
    refreshFriends,
    refreshConversations,
    upsertConversation,
    appendChatMessage,
    loadMessages,
  }
}
