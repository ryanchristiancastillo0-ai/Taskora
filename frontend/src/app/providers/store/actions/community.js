import { socketEmit } from '@/services/api/socket'
import { normalizeCommunityUser, normalizeChatReactions } from '@/services/api/normalize'
import { communityApi } from '@/features/community/api/communityApi'
import { unwrap } from '../entityHelpers'

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
    return communityApi
      .searchPeople(query)
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
    communityApi
      .sendFriendRequest(userId)
      .then(async () => {
        await refreshRequests()
        pushToast('Friend request sent')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const cancelFriendRequest = (requestId) =>
    communityApi
      .cancelFriendRequest(requestId)
      .then(() => refreshRequests())
      .catch((error) => pushToast(error.message, 'danger'))

  const respondFriendRequest = (requestId, accept) =>
    communityApi
      .respondFriendRequest(requestId, accept)
      .then(() => refreshFriends())
      .then(() => refreshRequests())
      .then(() => {
        pushToast(accept ? 'Friend request accepted' : 'Friend request declined')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const removeFriend = (userId) =>
    communityApi
      .removeFriend(userId)
      .then(() => refreshFriends())
      .catch((error) => pushToast(error.message, 'danger'))

  const createDirectConversation = (userId) =>
    communityApi
      .directConversation(userId)
      .then((conversation) => {
        const normalized = upsertConversation(unwrap(conversation, 'conversation'))
        activateConversation(normalized.id)
        return normalized
      })
      .catch((error) => pushToast(error.message, 'danger'))

  // The logo is optional. With one the whole creation goes multipart so the
  // group and its photo are created in a single request; without it, plain
  // JSON. Either way the group falls back to the member collage.
  const createGroup = ({ name, memberIds, icon }) => {
    const body = {
      type: 'GROUP',
      name: String(name).trim(),
      memberIds,
    }
    const request = icon
      ? communityApi.createConversationWithIcon(icon, body)
      : communityApi.createConversation(body)

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
    communityApi
      .addMember(conversationId, memberId)
      .then((conversation) => {
        upsertConversation(unwrap(conversation, 'conversation'))
        return conversation
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  const updateGroupPhoto = (conversationId, file) =>
    communityApi
      .updateIcon(conversationId, file)
      .then((conversation) => {
        upsertConversation(unwrap(conversation, 'conversation'))
        pushToast('Group photo updated')
      })
      .catch((error) => pushToast(error.message, 'danger'))

  const removeGroupMember = (conversationId, memberId) =>
    communityApi
      .removeMember(conversationId, memberId)
      .then(() => refreshConversations())
      .catch((error) => pushToast(error.message, 'danger'))

  // `attachments` accepts a single File (legacy callers) or an array. With any
  // file present the request goes multipart with the caption in the same body,
  // so text + files always land as one message.
  const sendChatMessage = (conversationId, content, attachments = null) => {
    const files = (Array.isArray(attachments) ? attachments : [attachments]).filter(Boolean)
    const request = files.length
      ? communityApi.sendMessageWithFiles(conversationId, files, content)
      : communityApi.sendMessage(conversationId, content)

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

  // Toggles the current user's reaction. The server clears it when the same
  // emoji is sent twice, so the caller just replays the same value. The
  // reacting user is not in the socket broadcast, so the response payload is
  // applied here to keep their own view in sync immediately.
  const setMessageReaction = (conversationId, messageId, emoji) =>
    communityApi
      .setReaction(conversationId, messageId, emoji)
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
          // Kept in state as well as toasted: the chat panel is the one place
          // that can offer a retry, and it survives switching away and back. A
          // failed load never reaches loadedMessagesRef, so calling
          // openConversation again with the same id is the retry.
          setChatError(error?.message || 'Could not load messages')
        })
        .finally(() => setChatLoading(false))
    }
    communityApi.markRead(conversationId).catch(() => {})
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
