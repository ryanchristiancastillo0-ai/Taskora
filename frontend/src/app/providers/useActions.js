import { useMemo } from 'react'
import { createAiActions } from './store/actions/ai'
import { createCommunityActions } from './store/actions/community'
import { createGoalActions, createHabitActions } from './store/actions/goals'
import { createNotificationActions } from './store/actions/notifications'
import { createNoteActions, createProjectActions } from './store/actions/projects'
import { createAccountActions, createSettingsActions } from './store/actions/settings'
import { createTaskActions } from './store/actions/tasks'

/**
 * Assembles the flat `actions` object every page consumes.
 *
 * Rebuilt whenever `data` changes (not on every render) because the action
 * creators close over setData; the individual action modules are plain factory
 * functions, not hooks.
 */
export function useActions({ data, pushToast, bootstrap, logout, ...deps }) {
  return useMemo(() => {
    const shared = { data, setData: deps.setData, pushToast }

    return {
      bootstrap,
      logout,
      ...createTaskActions({ ...shared, upsertTask: deps.upsertTask }),
      ...createProjectActions(shared),
      ...createNoteActions(shared),
      ...createGoalActions(shared),
      ...createHabitActions(shared),
      ...createNotificationActions(shared),
      ...createCommunityActions({
        ...shared,
        mergeUsers: deps.mergeUsers,
        refreshRequests: deps.refreshRequests,
        refreshFriends: deps.refreshFriends,
        refreshConversations: deps.refreshConversations,
        upsertConversation: deps.upsertConversation,
        appendChatMessage: deps.appendChatMessage,
        loadMessages: deps.loadMessages,
        activateConversation: deps.activateConversation,
        loadedMessagesRef: deps.loadedMessagesRef,
        setChatLoading: deps.setChatLoading,
        setChatError: deps.setChatError,
      }),
      ...createAiActions({
        ...shared,
        fetchAiConversations: deps.fetchAiConversations,
        upsertAiMessage: deps.upsertAiMessage,
        upsertAiConversation: deps.upsertAiConversation,
      }),
      ...createSettingsActions(shared),
      ...createAccountActions({
        ...shared,
        setUser: deps.setUser,
        setProfile: deps.setProfile,
        resetSessionState: deps.resetSessionState,
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
}
