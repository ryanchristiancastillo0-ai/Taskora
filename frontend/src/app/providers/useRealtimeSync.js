import { useEffect } from 'react'
import { connectSocket } from '@/services/api/socket'
import { refreshAccessToken } from '@/services/api/client'
import {
  normalizeChatMessage,
  normalizeChatReactions,
  normalizeAiMessage,
  normalizeNotification,
} from '@/services/api/normalize'
import { playNotificationSound } from '@/utils/notificationSound'

/**
 * The realtime half of the store: one socket for notifications, chat and AI.
 *
 * Kept in its own hook because it is the one effect with a handler map large
 * enough to hide everything else, and because a reconnect has to reconcile for
 * whatever was missed while the socket was down.
 */
export function useRealtimeSync({
  authState,
  pushToast,
  upsertAiMessage,
  upsertConversation,
  mergeUsers,
  refreshConversations,
  loadMessages,
  setData,
  setTyping,
  setAiStream,
  activeConversationRef,
  loadedMessagesRef,
  lastNotifiedIdRef,
  socketPrimedRef,
}) {
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
        // Covers notifications that arrive while online; the login backlog in
        // bootstrap() covers the rest.
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
        // The server sends the full set, so this is a replace rather than a
        // merge and cannot double-count. The reacting user is excluded from
        // this broadcast and applies the same payload from the HTTP response.
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
      // Partial reply text while the model is still writing. Kept out of the
      // stored messages so a refresh mid-generation cannot persist a
      // half-finished answer; the persisted ai:message replaces it on arrival.
      'ai:delta': (payload) => {
        const conversationId = String(payload?.conversationId ?? '')
        if (!conversationId) return
        setAiStream({
          conversationId,
          content: payload?.content ?? '',
        })
      },
      // Generation failed: drop the partial reply, which was never persisted.
      'ai:error': (payload) => {
        setAiStream((current) =>
          current && current.conversationId === String(payload?.conversationId)
            ? null
            : current
        )
      },
    }

    // The handshake authenticates with the access-token cookie, which expires
    // long before a tab left open gives up. Refreshing then re-handshaking keeps
    // a long-lived tab live instead of leaving a silently dead socket.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authState,
    pushToast,
    upsertAiMessage,
    upsertConversation,
    mergeUsers,
    refreshConversations,
    loadMessages,
  ])
}
