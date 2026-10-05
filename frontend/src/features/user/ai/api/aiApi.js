import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const AI = '/ai'
const CONVERSATIONS = `${AI}/conversations`
const TTS = '/tts'

const unwrapConversation = (payload) => payload?.conversation ?? payload

export const aiApi = {
  listConversations: (limit = 100) => api.get(withQuery(CONVERSATIONS, { limit })),
  getConversation: (conversationId) => api.get(buildPath(CONVERSATIONS, conversationId)).then(unwrapConversation),
  createConversation: () => api.post(CONVERSATIONS, {}).then(unwrapConversation),
  deleteConversation: (conversationId) => api.del(buildPath(CONVERSATIONS, conversationId)),

  sendMessage: (conversationId, payload) =>
    api.post(buildPath(CONVERSATIONS, conversationId, 'messages'), payload),
  updateConversation: (conversationId, patch) =>
    api.patch(buildPath(CONVERSATIONS, conversationId), patch).then(unwrapConversation),
}

export const ttsApi = {
  speak: (text, voiceId) => api.postAudio(`${TTS}/speak`, { text, voiceId }),
  voices: () => api.get(`${TTS}/voices`).then((payload) => payload?.voices ?? []),
}
