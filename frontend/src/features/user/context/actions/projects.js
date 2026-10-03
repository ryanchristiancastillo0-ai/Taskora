import { api } from '@/shared/api/client'
import { normalizeNote, normalizeProject } from '@/shared/api/normalize'
import { unwrap } from '../shared'

export function createProjectActions({ setData, pushToast }) {
  const addProject = (project) =>
    api
      .post('/projects', {
        name: project.name.trim(),
        description: project.description || null,
        color: project.color || '#4D3EC8',
      })
      .then((created) => {
        const normalized = normalizeProject(created?.project ?? created)
        setData((prev) => ({
          ...prev,
          projects: [
            ...prev.projects.filter((item) => item.id !== normalized.id),
            normalized,
          ],
        }))
        return normalized
      })

  const updateProject = (projectId, patch) => {
    const body = {}
    if (patch.name !== undefined) {
      const name = String(patch.name ?? '').trim()
      if (!name) return Promise.reject(new Error('Project name is required'))
      body.name = name
    }
    if (patch.description !== undefined) body.description = patch.description || null
    if (patch.color !== undefined) body.color = patch.color
    if (patch.status !== undefined) body.status = patch.status
    return api.patch(`/projects/${projectId}`, body).then((updated) => {
      const normalized = normalizeProject(updated?.project ?? updated)
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((item) =>
          item.id === normalized.id ? normalized : item
        ),
      }))
      return normalized
    })
  }

  const deleteProject = (projectId) =>
    api
      .del(`/projects/${projectId}`)
      .then(() => {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.filter((item) => item.id !== projectId),
          tasks: prev.tasks.map((task) =>
            task.projectId === projectId ? { ...task, projectId: null } : task
          ),
        }))
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  const projectTitle = (projects, id) =>
    projects.find((project) => project.id === id)?.name ?? null

  return { addProject, updateProject, deleteProject, projectTitle }
}

export function createNoteActions({ setData, pushToast }) {
  const addNote = (note) =>
    api
      .post('/notes', {
        title: note.title.trim(),
        content: note.content || '',
        projectId: note.projectId || null,
      })
      .then((created) => {
        const normalized = normalizeNote(unwrap(created, 'note'))
        setData((prev) => ({
          ...prev,
          notes: [
            normalized,
            ...prev.notes.filter((item) => item.id !== normalized.id),
          ],
        }))
        return normalized
      })

  const toggleNotePin = (note) =>
    api
      .patch(`/notes/${note.id}`, { pinned: !note.pinned })
      .then((updated) => {
        const normalized = normalizeNote(unwrap(updated, 'note'))
        setData((prev) => ({
          ...prev,
          notes: prev.notes.map((item) => (item.id === normalized.id ? normalized : item)),
        }))
        return normalized
      })

  const updateNote = (noteId, patch) => {
    const body = {}
    if (patch.title !== undefined) {
      const title = String(patch.title ?? '').trim()
      if (!title) return Promise.reject(new Error('Title is required'))
      body.title = title
    }
    if (patch.content !== undefined) body.content = patch.content
    if (patch.projectId !== undefined) body.projectId = patch.projectId || null
    return api.patch(`/notes/${noteId}`, body).then((updated) => {
      const normalized = normalizeNote(unwrap(updated, 'note'))
      setData((prev) => ({
        ...prev,
        notes: prev.notes.map((item) => (item.id === normalized.id ? normalized : item)),
      }))
      return normalized
    })
  }

  const deleteNote = (noteId) =>
    api
      .del(`/notes/${noteId}`)
      .then(() => {
        setData((prev) => ({
          ...prev,
          notes: prev.notes.filter((item) => item.id !== noteId),
        }))
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  return { addNote, updateNote, deleteNote, toggleNotePin }
}
