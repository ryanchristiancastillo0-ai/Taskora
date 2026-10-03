// TEMPORARY probe mock. Aliases the real AppContext module via vite.probe.config.js
import { createContext, useContext } from 'react'

const notifications = [
  {
    id: 'ntf_1',
    type: 'NEW_MESSAGE',
    title: 'New message from Alexandra Featherstonehaigh',
    message: 'She replied in Project Aurora kickoff: "Can you send the revised timeline?"',
    priority: 'HIGH',
    conversationId: 'cnv_1',
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    readAt: null,
  },
  {
    id: 'ntf_2',
    type: 'TASK_DUE',
    title: 'Task due today',
    message: 'A task on your list is due today.',
    priority: 'URGENT',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    readAt: new Date().toISOString(),
  },
  {
    id: 'ntf_3',
    type: 'TASK_PATTERN_SUGGESTION',
    title: 'Recurring pattern detected',
    message: 'You seem to repeat this every week and might want a recurring task.',
    conversationId: 'cnv_2',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    readAt: null,
  },
  {
    id: 'ntf_4',
    type: 'SYSTEM',
    title: 'System announcement',
    message: 'A maintenance notice from the Taskora team.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    readAt: new Date().toISOString(),
  },
  {
    id: 'ntf_5',
    type: 'AI_SUGGESTION',
    title: 'New AI suggestion',
    message: 'Your assistant drafted a task suggestion.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    readAt: null,
  },
]

const tasks = [
  { id: 'tsk_1', title: 'Ship the admin search endpoint', priority: 'HIGH' },
  { id: 'tsk_2', title: 'Audit notification drawer focus trap', priority: 'MEDIUM' },
]

const noop = () => {}

const value = {
  data: {
    user: {
      id: 'u_1',
      firstName: 'Dana',
      lastName: 'Okonkwo',
      email: 'dana@example.com',
      avatarUrl: null,
    },
    // The real store always carries a profile object (App.jsx reads
    // `data.profile.isNew` unguarded), so the mock has to too or every sidebar
    // throws on render and the page measures nothing.
    profile: { preferredName: null, isNew: false },
    // Read by the real ThemeProvider: `data.settings.theme` and
    // `data.settings.compactMode`.
    settings: { theme: 'light', compactMode: false },
    users: [],
    tasks,
    notifications,
    projects: [],
    conversations: [],
  },
  actions: {
    markNotificationRead: noop,
    markAllNotificationsRead: noop,
    openConversation: noop,
  },
  pushToast: noop,
}

const Ctx = createContext(value)
export const useApp = () => useContext(Ctx)
export const AppProvider = ({ children }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>
export default { useApp, AppProvider }
