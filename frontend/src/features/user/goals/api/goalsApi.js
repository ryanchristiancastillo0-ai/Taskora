import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const GOALS = '/goals'

export const goalsApi = {
  list: (limit = 500) => api.get(withQuery(GOALS, { limit })),
  create: (body) => api.post(GOALS, body),
  update: (goalId, body) => api.patch(buildPath(GOALS, goalId), body),
  remove: (goalId) => api.del(buildPath(GOALS, goalId)),
}
