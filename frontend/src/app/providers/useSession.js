import { useCallback, useRef, useState } from 'react'
import { disconnectSocket } from '@/services/api/socket'
import {
  normalizeAiConversation,
  normalizeAiMessage,
  normalizeCommunityUser,
  normalizeProfile,
  normalizeUser,
} from '@/services/api/normalize'
import { initialData } from './store/initialData'
import { isSameUser } from './store/entityHelpers'

/**
 * Session-scoped state: the auth flag, the toast queue, the AI stream buffer,
 * and the refs that must be wiped whenever a session ends.
 *
 * Hook order inside AppProvider is load-bearing, so these are plain custom
 * hooks called in a fixed sequence rather than one long pile of useCallbacks.
 */
export function useSession() {
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
  // Mirrors the id de-dupe the notification handler does, so a notification
  // delivered twice rings once.
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

  return {
    data,
    setData,
    authState,
    setAuthState,
    toasts,
    pushToast,
    dismissToast,
    activeConversationId,
    activateConversation,
    typing,
    setTyping,
    aiStream,
    setAiStream,
    chatLoading,
    setChatLoading,
    chatError,
    setChatError,
    activeConversationRef,
    loadedMessagesRef,
    lastNotifiedIdRef,
    backlogSoundPlayedRef,
    socketPrimedRef,
    resetSessionState,
  }
}

/**
 * The write paths that keep normalised records in the store. Each has to
 * normalise first: both normalisers return null for a missing payload, and the
 * store's contract is that `user` and `profile` are always objects.
 */
export function useEntityMutations({ setData, setAiStream }) {
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

  const upsertAiMessage = useCallback(
    (message) => {
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
    },
    [setAiStream]
  )

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

  return {
    upsertTask,
    mergeUsers,
    setProfile,
    setUser,
    upsertAiMessage,
    upsertAiConversation,
  }
}
