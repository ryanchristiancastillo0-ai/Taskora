import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const TASKS = '/tasks'
const ATTACHMENTS = '/attachments'
const SUGGESTIONS = '/task-suggestions'

/**
 * Every task-related request in one place. The store's action module owns the
 * optimistic updates and the toasts; this owns the URLs.
 */
export const tasksApi = {
  list: (limit = 500) => api.get(withQuery(TASKS, { limit })),
  detail: (taskId) => api.get(buildPath(TASKS, taskId)),
  create: (body) => api.post(TASKS, body),
  update: (taskId, body) => api.patch(buildPath(TASKS, taskId), body),
  remove: (taskId) => api.del(buildPath(TASKS, taskId)),
  addAttachment: (taskId, file) =>
    api.upload(buildPath(TASKS, taskId, 'attachments'), file),
  removeAttachment: (attachmentId) =>
    api.del(buildPath(ATTACHMENTS, attachmentId)),
  acceptSuggestion: (suggestionId) =>
    api.post(buildPath(SUGGESTIONS, suggestionId, 'accept')),
  skipSuggestion: (suggestionId) =>
    api.post(buildPath(SUGGESTIONS, suggestionId, 'skip')),
}
