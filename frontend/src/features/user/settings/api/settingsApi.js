import { api } from '@/services/api/client'
import { buildPath } from '@/services/api/paths'

const SETTINGS = '/settings'
const NOTIFICATIONS = buildPath(SETTINGS, 'notifications')

export const settingsApi = {
  get: () => api.get(SETTINGS),
  update: (patch) => api.patch(SETTINGS, patch),
  updateNotifications: (patch) => api.patch(NOTIFICATIONS, patch),
  sendTestEmail: () => api.post(buildPath(NOTIFICATIONS, 'test-email')),
}
