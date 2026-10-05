// Pure helpers shared by the store's action modules. No React, no API access,
// so they can be imported from anywhere without pulling in the provider.

export const toApiTask = (task) => ({
  title: task.title,
  description: task.description || null,
  projectId: task.projectId || null,
  priority: task.priority,
  status: task.status,
  dueDate: task.dueDate || null,
  estimatedMinutes: task.estimatedMinutes
    ? Number(task.estimatedMinutes)
    : null,
  tagIds: task.tagIds || [],
})

export const unwrap = (payload, key) => payload?.[key] ?? payload

export function isSameUser(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.bio === b.bio &&
    a.avatarUrl === b.avatarUrl
  )
}
