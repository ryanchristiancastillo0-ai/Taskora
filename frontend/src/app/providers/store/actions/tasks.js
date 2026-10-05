import { normalizeTask } from '@/services/api/normalize'
import { tasksApi } from '@/features/user/tasks/api/tasksApi'
import { toApiTask, unwrap } from '../entityHelpers'

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

    tasksApi
      .update(taskId, { status: nextStatus })
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
      const created = await tasksApi.create(toApiTask(task))
      const createdTask = unwrap(created, 'task')
      let failedCount = 0
      for (const file of files) {
        try {
          await tasksApi.addAttachment(createdTask.id, file)
        } catch {
          failedCount += 1
        }
      }
      const refreshed = await tasksApi.detail(createdTask.id)
      upsertTask(normalizeTask(unwrap(refreshed, 'task')))
      if (failedCount > 0) {
        pushToast(`${failedCount} file(s) could not be uploaded`, 'warn')
      }
      return refreshed
    })()
  }

  const updateTask = (taskId, patch, { newFiles = [], removedIds = [] } = {}) => {
    return (async () => {
      await tasksApi.update(taskId, toApiTask(patch))
      let failedCount = 0
      for (const file of newFiles) {
        try {
          await tasksApi.addAttachment(taskId, file)
        } catch {
          failedCount += 1
        }
      }
      for (const id of removedIds) {
        await tasksApi.removeAttachment(id)
      }
      const refreshed = await tasksApi.detail(taskId)
      upsertTask(normalizeTask(unwrap(refreshed, 'task')))
      if (failedCount > 0) {
        pushToast(`${failedCount} file(s) could not be uploaded`, 'warn')
      }
      return refreshed
    })()
  }

  const fetchTask = (taskId) =>
    tasksApi
      .detail(taskId)
      .then((task) => normalizeTask(unwrap(task, 'task')))
      .catch(() => data.tasks.find((task) => task.id === taskId) || null)

  const removeTask = (taskId) => {
    return (async () => {
      try {
        const detail = await tasksApi.detail(taskId)
        for (const attachment of detail.attachments || []) {
          await tasksApi.removeAttachment(attachment.id)
        }
        await tasksApi.remove(taskId)
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
    tasksApi.removeAttachment(attachmentId).then(() => {
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
    tasksApi
      .acceptSuggestion(suggestionId)
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
    tasksApi
      .skipSuggestion(suggestionId)
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
