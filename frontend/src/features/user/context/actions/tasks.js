import { api } from '@/shared/api/client'
import { normalizeTask } from '@/shared/api/normalize'
import { toApiTask, unwrap } from '../shared'

export function createTaskActions({ data, setData, pushToast, upsertTask }) {
  const patchTask = (taskId, updater) => {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === taskId ? updater(task) : task
      ),
    }))
  }

  const toggleTaskComplete = (taskId) => {
    const current = data.tasks.find((task) => task.id === taskId)
    const nextStatus = current?.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'

    api
      .patch(`/tasks/${taskId}`, { status: nextStatus })
      .then((updated) => upsertTask(normalizeTask(unwrap(updated, 'task'))))
      .catch(() => {
        patchTask(taskId, (task) => ({
          ...task,
          status: task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED',
        }))
      })
  }

  const addTask = (task, files = []) => {
    return (async () => {
      const created = await api.post('/tasks', toApiTask(task))
      const createdTask = unwrap(created, 'task')
      let failedCount = 0
      for (const file of files) {
        try {
          await api.upload(`/tasks/${createdTask.id}/attachments`, file)
        } catch {
          failedCount += 1
        }
      }
      const refreshed = await api.get(`/tasks/${createdTask.id}`)
      upsertTask(normalizeTask(unwrap(refreshed, 'task')))
      if (failedCount > 0) {
        pushToast(`${failedCount} file(s) could not be uploaded`, 'warn')
      }
      return refreshed
    })()
  }

  const updateTask = (taskId, patch, { newFiles = [], removedIds = [] } = {}) => {
    return (async () => {
      await api.patch(`/tasks/${taskId}`, toApiTask(patch))
      let failedCount = 0
      for (const file of newFiles) {
        try {
          await api.upload(`/tasks/${taskId}/attachments`, file)
        } catch {
          failedCount += 1
        }
      }
      for (const id of removedIds) {
        await api.del(`/attachments/${id}`)
      }
      const refreshed = await api.get(`/tasks/${taskId}`)
      upsertTask(normalizeTask(unwrap(refreshed, 'task')))
      if (failedCount > 0) {
        pushToast(`${failedCount} file(s) could not be uploaded`, 'warn')
      }
      return refreshed
    })()
  }

  const fetchTask = (taskId) =>
    api
      .get(`/tasks/${taskId}`)
      .then((task) => normalizeTask(unwrap(task, 'task')))
      .catch(() => data.tasks.find((task) => task.id === taskId) || null)

  const removeTask = (taskId) => {
    return (async () => {
      try {
        const detail = await api.get(`/tasks/${taskId}`)
        for (const attachment of detail.attachments || []) {
          await api.del(`/attachments/${attachment.id}`)
        }
        await api.del(`/tasks/${taskId}`)
      } catch {
        // fall through to local removal
      }
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((task) => task.id !== taskId),
      }))
    })()
  }

  const removeAttachment = (attachmentId) =>
    api.del(`/attachments/${attachmentId}`).then(() => {
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) => ({
          ...task,
          attachments: (task.attachments || []).filter(
            (attachment) => attachment.id !== attachmentId
          ),
          attachmentCount: Math.max(0, (task.attachmentCount || 0) - 1),
        })),
      }))
    })

  const acceptSuggestion = (suggestionId) =>
    api
      .post(`/task-suggestions/${suggestionId}/accept`)
      .then(({ task }) => {
        if (task) upsertTask(normalizeTask(task))
        pushToast('Task added from suggestion')
        return task
      })
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  const skipSuggestion = (suggestionId) =>
    api
      .post(`/task-suggestions/${suggestionId}/skip`)
      .then(() => pushToast('Suggestion skipped'))
      .catch((error) => {
        pushToast(error.message, 'danger')
        throw error
      })

  return {
    toggleTaskComplete,
    addTask,
    updateTask,
    fetchTask,
    removeTask,
    removeAttachment,
    acceptSuggestion,
    skipSuggestion,
  }
}
