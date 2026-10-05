import { api } from '@/services/api/client'
import { buildPath, withQuery } from '@/services/api/paths'

const PROJECTS = '/projects'
const NOTES = '/notes'
const TAGS = '/tags'

export const projectsApi = {
  list: (limit = 500) => api.get(withQuery(PROJECTS, { limit })),
  create: (body) => api.post(PROJECTS, body),
  update: (projectId, body) => api.patch(buildPath(PROJECTS, projectId), body),
  remove: (projectId) => api.del(buildPath(PROJECTS, projectId)),
}

export const notesApi = {
  list: (limit = 500) => api.get(withQuery(NOTES, { limit })),
  create: (body) => api.post(NOTES, body),
  update: (noteId, body) => api.patch(buildPath(NOTES, noteId), body),
  remove: (noteId) => api.del(buildPath(NOTES, noteId)),
}

export const tagsApi = {
  list: (limit = 500) => api.get(withQuery(TAGS, { limit })),
}
