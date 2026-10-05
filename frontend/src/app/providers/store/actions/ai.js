import { normalizeAiMessage } from '@/services/api/normalize'
import { aiApi, ttsApi } from '@/features/user/ai/api/aiApi'

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
    aiApi
      .getConversation(conversationId)
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
    aiApi.createConversation().then((conversation) => {
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

    return aiApi
      .sendMessage(conversationId, payload)
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

  const aiSpeak = (text, voiceId) => ttsApi.speak(text, voiceId)

  const aiVoices = () => ttsApi.voices()

  const aiSetSpeak = (conversationId, patch = {}) =>
    aiApi.updateConversation(conversationId, patch).then((conversation) => {
      if (conversation?.id) upsertAiConversation(conversation)
      return conversation
    })

  const aiRename = (conversationId, title) =>
    aiApi.updateConversation(conversationId, { title }).then((conversation) => {
      if (conversation?.id) upsertAiConversation(conversation)
      return conversation
    })

  const aiDelete = (conversationId) =>
    aiApi.deleteConversation(conversationId).then(() => {
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
