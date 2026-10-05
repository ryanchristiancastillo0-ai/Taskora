import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const NOTIFICATIONS = '/notifications'

export const notificationsApi = {
  list: (limit = 200) => api.get(withQuery(NOTIFICATIONS, { limit })),
  markRead: (id) => api.patch(buildPath(NOTIFICATIONS, id, 'read')),
  markAllRead: () => api.patch(buildPath(NOTIFICATIONS, 'read-all')),
  sounds: () => api.get(buildPath(NOTIFICATIONS, 'sounds')),
}
