import { createContext, useCallback, useContext, useMemo } from 'react'
import { authApi } from '@/features/auth/api/authApi'
import { useSession, useEntityMutations } from './useSession'
import { useDataFetchers } from './useDataFetchers'
import { useBootstrapOnMount } from './useBootstrapOnMount'
import { useRealtimeSync } from './useRealtimeSync'
import { useActions } from './useActions'

const AppContext = createContext(null)

/**
 * The application store: data, auth state and the actions that mutate them.
 *
 * This component is deliberately thin. State lives in useSession, network reads
 * in useDataFetchers, the socket in useRealtimeSync, and the action object in
 * useActions. The hook call order below is load-bearing, so it must stay in
 * this sequence.
 */
export function AppProvider({ children }) {
  const session = useSession()
  const {
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
  } = session

  const mutations = useEntityMutations({ setData, setAiStream })
  const { upsertTask, mergeUsers, setProfile, setUser, upsertAiMessage, upsertAiConversation } =
    mutations

  const fetchers = useDataFetchers({
    setData,
    mergeUsers,
    loadedMessagesRef,
    backlogSoundPlayedRef,
    setAuthState,
  })
  const {
    bootstrap,
    fetchAiConversations,
    refreshRequests,
    refreshFriends,
    refreshConversations,
    upsertConversation,
    appendChatMessage,
    loadMessages,
  } = fetchers

  useBootstrapOnMount({ bootstrap, resetSessionState, setAuthState })

  useRealtimeSync({
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
  })

  const logout = useCallback(() => {
    authApi.logout().catch(() => {})
    resetSessionState()
  }, [resetSessionState])

  const actions = useActions({
    data,
    setData,
    pushToast,
    bootstrap,
    logout,
    upsertTask,
    mergeUsers,
    setProfile,
    setUser,
    upsertAiMessage,
    upsertAiConversation,
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
    resetSessionState,
    fetchAiConversations,
  })

  const value = useMemo(
    () => ({
      data,
      actions,
      authState,
      toasts,
      pushToast,
      dismissToast,
      activeConversationId,
      typing,
      aiStream,
      chatLoading,
      chatError,
    }),
    [
      data,
      actions,
      authState,
      toasts,
      pushToast,
      dismissToast,
      activeConversationId,
      typing,
      aiStream,
      chatLoading,
      chatError,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
