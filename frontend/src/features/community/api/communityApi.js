import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const COMMUNITY = '/community'
const FRIENDS = `${COMMUNITY}/friends`
const REQUESTS = `${FRIENDS}/requests`
const CONVERSATIONS = `${COMMUNITY}/conversations`

/** Friend requests are always filtered by direction + status; both are required. */
const pendingRequests = () => withQuery(REQUESTS, { direction: 'received', status: 'PENDING', limit: 200 })

export const communityApi = {
  listFriends: (limit = 200) => api.get(withQuery(FRIENDS, { limit })),
  listPendingRequests: () => Promise.all([api.get(pendingRequests()), api.get(withQuery(REQUESTS, { direction: 'sent', status: 'PENDING', limit: 200 }))]),
  searchPeople: (term) =>
    api.get(withQuery(`${FRIENDS}/search`, { q: String(term || '').trim() })),

  sendFriendRequest: (userId) => api.post(REQUESTS, { receiverId: userId }),
  cancelFriendRequest: (requestId) =>
    api.post(buildPath(REQUESTS, requestId, 'cancel')),
  respondFriendRequest: (requestId, accept) =>
    api.post(buildPath(REQUESTS, requestId, 'respond'), {
      action: accept ? 'accept' : 'decline',
    }),
  removeFriend: (userId) => api.del(buildPath(FRIENDS, userId)),

  listConversations: (limit = 200) => api.get(withQuery(CONVERSATIONS, { limit })),
  createConversation: (body) => api.post(CONVERSATIONS, body),
  createConversationWithIcon: (icon, body) =>
    api.uploadMany(CONVERSATIONS, [icon], 'icon', {
      ...body,
      memberIds: JSON.stringify(body.memberIds),
    }),
  directConversation: (userId) => api.get(buildPath(CONVERSATIONS, 'direct', userId)),
  messages: (conversationId, limit = 100) =>
    api.get(withQuery(buildPath(CONVERSATIONS, conversationId, 'messages'), { limit })),

  sendMessage: (conversationId, content) =>
    api.post(buildPath(CONVERSATIONS, conversationId, 'messages'), { content }),
  sendMessageWithFiles: (conversationId, files, content) =>
    api.uploadMany(buildPath(CONVERSATIONS, conversationId, 'messages'), files, 'attachments', { content }),
  setReaction: (conversationId, messageId, emoji) =>
    api.post(buildPath(CONVERSATIONS, conversationId, 'messages', messageId, 'reaction'), { emoji }),
  markRead: (conversationId) =>
    api.post(buildPath(CONVERSATIONS, conversationId, 'read')),

  addMember: (conversationId, userId) =>
    api.post(buildPath(CONVERSATIONS, conversationId, 'members'), { userId }),
  removeMember: (conversationId, memberId) =>
    api.del(buildPath(CONVERSATIONS, conversationId, 'members', memberId)),
  updateIcon: (conversationId, file) =>
    api.upload(buildPath(CONVERSATIONS, conversationId, 'icon'), file, 'icon'),
}
