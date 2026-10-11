import { socketEmit } from '@/services/api/socket'
import {
  normalizeChatMessage,
  normalizeCommunityUser,
  normalizeChatReactions,
} from '@/services/api/normalize'
import { communityApi } from '@/features/community/api/communityApi'
import { unwrap } from '../entityHelpers'

// Payloads behind every message that has not reached the server yet, keyed by
// its local id. Module scope rather than factory scope because the actions are
// rebuilt whenever `data` changes — a retry tapped one render later would
// otherwise look for its payload in a fresh, empty map. Cleared the moment a
// message settles, so only live sends and failed ones are ever in here.
const inFlightSends = new Map()

const localId = (prefix = 'local') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Ids this client minted. Anything with one of these was never on the server,
// so a history refetch must not drop it and a reaction must not be sent for it.
export const isLocalId = (id) => typeof id === 'string' && id.startsWith('local-')

export function createCommunityActions({
  data,
  setData,
  pushToast,
  mergeUsers,
  refreshRequests,
  refreshFriends,
  refreshConversations,
  upsertConversation,
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

  const patchChatMessage = (id, patch) =>
    setData((prev) => ({
      ...prev,
      chatMessages: prev.chatMessages.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }))

  // Swap a local row for the server's copy of it. The ids differ by design, so
  // this matches on the local id rather than waiting for an echo that never
  // comes — the sender is deliberately left out of the chat:message broadcast.
  const settleChatMessage = (localMsgId, serverMessage) => {
    const record = inFlightSends.get(localMsgId)
    inFlightSends.delete(localMsgId)
    record?.previewUrls?.forEach((url) => URL.revokeObjectURL(url))

    const normalized = normalizeChatMessage(serverMessage)
    if (!normalized) return

    setData((prev) => ({
      ...prev,
      chatMessages: [
        ...prev.chatMessages.filter(
          (item) => item.id !== localMsgId && item.id !== normalized.id
        ),
        normalized,
      ],
      conversations: prev.conversations.map((conversation) =>
        conversation.id === normalized.conversationId
          ? {
              ...conversation,
              lastMessage: normalized,
              lastMessageAt: normalized.createdAt,
            }
          : conversation
      ),
    }))
  }

  const deliverChatMessage = (localMsgId, conversationId, content, files) => {
    const record = inFlightSends.get(localMsgId)
    // A second tap while the first is still on the wire would post the same
    // payload twice — there is no server-side idempotency to lean on.
    if (record?.promise) return record.promise

    const request = files.length
      ? communityApi.sendMessageWithFiles(conversationId, files, content)
      : communityApi.sendMessage(conversationId, content)

    const promise = request
      .then((message) => {
        settleChatMessage(localMsgId, unwrap(message, 'message'))
        return message
      })
      .catch((error) => {
        // The bubble is kept and flagged rather than thrown away: losing the
        // text on a slow connection is the exact thing this flow exists to
        // prevent. Retry replays the payload still parked in inFlightSends.
        patchChatMessage(localMsgId, { pending: false, failed: true })
        // Cleared so the next Retry starts a fresh request instead of
        // handing back this settled rejection.
        if (record) record.promise = null
        pushToast(error.message, 'danger')
        throw error
      })

    if (record) record.promise = promise
    return promise
  }

  // `attachments` accepts a single File (legacy callers) or an array. With any
  // file present the request goes multipart with the caption in the same body,
  // so text + files always land as one message.
  //
  // Optimistic: the bubble is written to the store before the request goes
  // out, so a slow upload never leaves the composer sitting on the text. The
  // draft is already cleared by the caller by the time this runs.
  const sendChatMessage = (conversationId, content, attachments = null) => {
    const files = (Array.isArray(attachments) ? attachments : [attachments]).filter(Boolean)

    const localMsgId = localId()
    // The bubble owns its own object URLs — the composer's tray previews are
    // revoked the moment the tray empties, so these cannot be shared with it.
    const previewUrls = files.map((file) => URL.createObjectURL(file))
    const optimisticAttachments = files.map((file, index) => ({
      id: `${localMsgId}-${index}`,
      url: previewUrls[index],
      fileName: file.name,
      fileType: file.type || null,
      fileSize: file.size,
      kind: file.type.startsWith('image/') ? 'IMAGE' : 'FILE',
    }))

    const optimistic = {
      id: localMsgId,
      conversationId,
      type:
        files.length === 0
          ? 'TEXT'
          : files.every((file) => file.type.startsWith('image/'))
            ? 'IMAGE'
            : 'FILE',
      content: content || null,
      attachmentUrl: null,
      fileName: files[0]?.name ?? null,
      fileType: null,
      fileSize: null,
      attachments: optimisticAttachments,
      reactions: [],
      senderId: data.user?.id ?? null,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
    }

    inFlightSends.set(localMsgId, { conversationId, content, files, previewUrls })

    setData((prev) => ({
      ...prev,
      chatMessages: [
        ...prev.chatMessages.filter((item) => item.id !== localMsgId),
        optimistic,
      ],
      // The rail is ordered by this, so bump it now or the conversation would
      // stay where it was until the upload finished.
      conversations: prev.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessageAt: optimistic.createdAt }
          : conversation
      ),
    }))

    return deliverChatMessage(localMsgId, conversationId, content, files)
  }

  const retryChatMessage = (localMsgId) => {
    const record = inFlightSends.get(localMsgId)
    if (!record) return Promise.resolve()
    patchChatMessage(localMsgId, { pending: true, failed: false })
    return deliverChatMessage(
      localMsgId,
      record.conversationId,
      record.content,
      record.files
    ).catch(() => {})
  }

  // Toggles the current user's reaction. The server clears it when the same
  // emoji is sent twice, so the caller just replays the same value. The
  // reacting user is not in the socket broadcast either, so both the optimistic
  // step and the reconciliation happen here.
  const setMessageReaction = (conversationId, messageId, emoji) => {
    if (isLocalId(messageId)) return Promise.resolve()

    // Captured inside the updater rather than from `data`: two taps in the
    // same frame share one render, and the rollback has to restore exactly
    // what was on screen, not what the screen believed one render ago.
    let previous = []
    setData((prev) => {
      const target = prev.chatMessages.find((item) => item.id === messageId)
      previous = target?.reactions ?? []
      const mineId = data.user?.id
      const alreadyMine = previous.some(
        (reaction) => reaction.userId === mineId && reaction.emoji === emoji
      )
      const optimistic = alreadyMine
        ? previous.filter(
            (reaction) => !(reaction.userId === mineId && reaction.emoji === emoji)
          )
        : [
            ...previous,
            {
              id: localId('local-reaction'),
              userId: mineId ?? null,
              emoji,
              // Flat identity, matching normalizeChatReactions: the reaction
              // bar reads firstName/lastName off the row, not a nested user.
              firstName: data.user?.firstName ?? null,
              lastName: data.user?.lastName ?? null,
              avatarUrl: data.user?.avatarUrl ?? null,
            },
          ]
      return {
        ...prev,
        chatMessages: prev.chatMessages.map((item) =>
          item.id === messageId ? { ...item, reactions: optimistic } : item
        ),
      }
    })

    return communityApi
      .setReaction(conversationId, messageId, emoji)
      .then((result) => {
        patchChatMessage(messageId, {
          reactions: normalizeChatReactions(result?.reactions),
        })
        return result
      })
      .catch((error) => {
        patchChatMessage(messageId, { reactions: previous })
        pushToast(error.message, 'danger')
        throw error
      })
  }

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
    retryChatMessage,
    setMessageReaction,
    removeGroupMember,
    updateGroupPhoto,
    emitTyping,
  }
}
