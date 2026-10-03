import { api } from '@/shared/api/client'
import { normalizeAiMessage } from '@/shared/api/normalize'

export function createAiActions({
  data,
  setData,
  pushToast,
  fetchAiConversations,
  upsertAiMessage,
  upsertAiConversation,
}) {
  const aiList = () =>
    fetchAiConversations().then((conversations) => {
      setData((prev) => ({ ...prev, aiConversations: conversations }))
      return conversations
    })

  const aiGet = (conversationId) =>
    api
      .get(`/ai/conversations/${conversationId}`)
      .then((payload) => payload?.conversation ?? payload)
      .then((conversation) => {
        if (!conversation?.id) return { conversation, messages: [] }
        const messages = (conversation.messages || [])
          .map(normalizeAiMessage)
          .filter(Boolean)
        setData((prev) => ({
          ...prev,
          aiMessages: [
            ...messages.reverse(),
            ...prev.aiMessages.filter(
              (item) => item.conversationId !== conversationId
            ),
          ],
        }))
        return { conversation, messages }
      })

  const aiCreate = () =>
    api
      .post('/ai/conversations', {})
      .then((payload) => payload?.conversation ?? payload)
      .then((conversation) => {
        if (conversation?.id) upsertAiConversation(conversation)
        return conversation
      })

  const aiSend = (conversationId, message, files = []) => {
    const payload =
      files.length > 0
        ? (() => {
            const formData = new FormData()
            formData.append('message', message)
            files.forEach((file) => formData.append('files', file))
            return formData
          })()
        : { message }

    return api
      .post(`/ai/conversations/${conversationId}/messages`, payload)
      .then((result) => {
        if (result.userMessage) {
          upsertAiMessage(result.userMessage)
          upsertAiMessage(result.assistantMessage)
        }
        setData((prev) => ({
          ...prev,
          aiConversations: prev.aiConversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: new Date().toISOString(),
                  title: conversation.title || String(message).slice(0, 60),
                }
              : conversation
          ),
        }))
        return result
      })
  }

  const aiSpeak = (text, voiceId) => api.postAudio('/tts/speak', { text, voiceId })

  const aiVoices = () =>
    api.get('/tts/voices').then((payload) => payload?.voices ?? [])

  const aiSetSpeak = (conversationId, patch = {}) =>
    api
      .patch(`/ai/conversations/${conversationId}`, patch)
      .then((payload) => payload?.conversation ?? payload)
      .then((conversation) => {
        if (conversation?.id) upsertAiConversation(conversation)
        return conversation
      })

  const aiRename = (conversationId, title) =>
    api
      .patch(`/ai/conversations/${conversationId}`, { title })
      .then((payload) => payload?.conversation ?? payload)
      .then((conversation) => {
        if (conversation?.id) upsertAiConversation(conversation)
        return conversation
      })

  const aiDelete = (conversationId) =>
    api.del(`/ai/conversations/${conversationId}`).then(() => {
      setData((prev) => ({
        ...prev,
        aiConversations: prev.aiConversations.filter(
          (conversation) => conversation.id !== conversationId
        ),
        aiMessages: prev.aiMessages.filter(
          (item) => item.conversationId !== conversationId
        ),
      }))
      return true
    })

  const sendMessage = (content) => {
    const text = String(content ?? '').trim()
    if (!text) return Promise.resolve()
    return (async () => {
      let conversationId = data.aiConversations[0]?.id
      if (!conversationId) {
        const created = await aiCreate()
        conversationId = created?.id
      }
      if (!conversationId) throw new Error('Could not start a conversation')
      return aiSend(conversationId, text)
    })().catch((error) => {
      pushToast(`Assistant: ${error.message}`, 'danger')
      throw error
    })
  }

  return {
    aiList,
    aiGet,
    aiCreate,
    aiSend,
    aiSpeak,
    aiVoices,
    aiSetSpeak,
    aiRename,
    aiDelete,
    sendMessage,
  }
}
