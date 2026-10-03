import { api } from '@/shared/api/client'
import { socketEmit } from '@/shared/api/socket'
import { normalizeCommunityUser, normalizeChatReactions } from '@/shared/api/normalize'
import { unwrap } from '../shared'

export function createCommunityActions({
  data,
  setData,
  pushToast,
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
}) {
  const searchPeople = (term) => {
    const query = String(term || '').trim()
    if (!query) return Promise.resolve([])
    return api
      .get(`/community/friends/search?q=${encodeURIComponent(query)}`)
      .then((result) => {
        const items = (result.items || []).map((user) => ({
          ...normalizeCommunityUser(user),
          relationship:
            user.relationship ??
            (data.friends.some((friend) => friend.userId === user.id)
              ? 'FRIEND'
              : 'NONE'),
        }))
        mergeUsers(items)
        return items
      })
  }

  const sendFriendRequest = (userId) =>
    api
      .post('/community/friends/requests', { receiverId: userId })
      .then(async () => {
        await refreshRequests()
        pushToast('Friend request sent')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const cancelFriendRequest = (requestId) =>
    api
      .post(`/community/friends/requests/${requestId}/cancel`)
      .then(() => refreshRequests())
      .catch((error) => pushToast(error.message, 'danger'))

  const respondFriendRequest = (requestId, accept) =>
    api
      .post(`/community/friends/requests/${requestId}/respond`, {
        action: accept ? 'accept' : 'decline',
      })
      .then(() => refreshFriends())
      .then(() => refreshRequests())
      .then(() => {
        pushToast(accept ? 'Friend request accepted' : 'Friend request declined')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const removeFriend = (userId) =>
    api
      .del(`/community/friends/${userId}`)
      .then(() => refreshFriends())
      .catch((error) => pushToast(error.message, 'danger'))

  const createDirectConversation = (userId) =>
    api
      .get(`/community/conversations/direct/${userId}`)
      .then((conversation) => {
        const normalized = upsertConversation(unwrap(conversation, 'conversation'))
        activateConversation(normalized.id)
        return normalized
      })
      .catch((error) => pushToast(error.message, 'danger'))

  // The logo is optional. When one is picked the whole creation goes multipart
  // so the group and its photo are created in a single request; otherwise it
  // falls back to plain JSON. Either way the group falls back to the member
  // collage on the client when no icon ends up stored.
  const createGroup = ({ name, memberIds, icon }) => {
    const url = '/community/conversations'
    const request = icon
      ? api.uploadMany(url, [icon], 'icon', {
          type: 'GROUP',
          name: String(name).trim(),
          memberIds: JSON.stringify(memberIds),
        })
      : api.post(url, {
          type: 'GROUP',
          name: String(name).trim(),
          memberIds,
        })

    return request
      .then((conversation) => {
        const normalized = upsertConversation(unwrap(conversation, 'conversation'))
        activateConversation(normalized.id)
        pushToast('Group created')
        return normalized
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })
  }

  // Admins can add any registered user, friend or not.
  const addGroupMember = (conversationId, memberId) =>
    api
      .post(`/community/conversations/${conversationId}/members`, { userId: memberId })
      .then((conversation) => {
        upsertConversation(unwrap(conversation, 'conversation'))
        return conversation
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  const updateGroupPhoto = (conversationId, file) =>
    api
      .upload(`/community/conversations/${conversationId}/icon`, file, 'icon')
      .then((conversation) => {
        upsertConversation(unwrap(conversation, 'conversation'))
        pushToast('Group photo updated')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const removeGroupMember = (conversationId, memberId) =>
    api
      .del(`/community/conversations/${conversationId}/members/${memberId}`)
      .then(() => refreshConversations())
      .catch((error) => pushToast(error.message, 'danger'))

  // `attachments` accepts a single File (legacy callers) or an array. When any
  // file is present the request goes multipart with the caption in the same
  // body, so text + files always land as one message.
  const sendChatMessage = (conversationId, content, attachments = null) => {
    const files = (Array.isArray(attachments) ? attachments : [attachments]).filter(Boolean)
    const url = `/community/conversations/${conversationId}/messages`
    const request = files.length
      ? api.uploadMany(url, files, 'attachments', { content })
      : api.post(url, { content })

    return request
      .then((message) => {
        appendChatMessage(unwrap(message, 'message'))
        return message
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })
  }

  // Toggles the current user's reaction. The server clears the reaction when
  // the same emoji is sent twice, so the caller just replays the same value.
  // The reacting user is not in the socket broadcast, so the response payload
  // is applied locally here to keep their own view in sync immediately.
  const setMessageReaction = (conversationId, messageId, emoji) =>
    api
      .post(`/community/conversations/${conversationId}/messages/${messageId}/reaction`, {
        emoji,
      })
      .then((result) => {
        const reactions = normalizeChatReactions(result?.reactions)
        setData((prev) => ({
          ...prev,
          chatMessages: prev.chatMessages.map((item) =>
            item.id === messageId ? { ...item, reactions } : item
          ),
        }))
        return result
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  const openConversation = (conversationId) => {
    // Selection first, so the list highlight, the chat header and the mobile
    // "step into the conversation" transition all react in the same tick. The
    // body then fills in behind a skeleton rather than blocking the switch.
    activateConversation(conversationId)
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread: 0 }
          : conversation
      ),
    }))
    setChatError('')

    if (!loadedMessagesRef.current.has(conversationId)) {
      setChatLoading(true)
      loadMessages(conversationId)
        .catch((error) => {
          // Kept in state rather than only toasted: the chat panel is the one
          // place that can offer a retry for this, and it stays visible when the
          // user switches to another conversation and back. A failed load never
          // reaches loadedMessagesRef, so calling openConversation again with the
          // same id is the retry.
          setChatError(error?.message || 'Could not load messages')
        })
        .finally(() => setChatLoading(false))
    }
    api.post(`/community/conversations/${conversationId}/read`).catch(() => {})
    socketEmit('chat:read', { conversationId })
  }

  const emitTyping = (conversationId, isTyping) =>
    socketEmit('chat:typing', { conversationId, isTyping: Boolean(isTyping) })

  return {
    searchPeople,
    sendFriendRequest,
    cancelFriendRequest,
    respondFriendRequest,
    removeFriend,
    openConversation,
    createDirectConversation,
    createGroup,
    addGroupMember,
    sendChatMessage,
    setMessageReaction,
    removeGroupMember,
    updateGroupPhoto,
    emitTyping,
  }
}
