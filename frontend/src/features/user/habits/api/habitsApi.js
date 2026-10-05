import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const HABITS = '/habits'

export const habitsApi = {
  list: (limit = 500) => api.get(withQuery(HABITS, { limit })),
  create: (body) => api.post(HABITS, body),
  toggle: (habitId) => api.post(buildPath(HABITS, habitId, 'toggle')),
}
