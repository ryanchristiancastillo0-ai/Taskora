export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function displayName(preferredName, firstName) {
  const name = String(preferredName ?? '').trim() || String(firstName ?? '').trim()
  return name || 'there'
}

// Full name from a user-ish object. lastName is nullable in the schema, so
// template interpolation would render "Ada null" — join the parts instead.
export function personName(user) {
  if (!user) return ''
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
}

const formatters = {
  short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  long: new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }),
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }),
  time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }),
  weekdayLong: new Intl.DateTimeFormat('en-US', { weekday: 'long' }),
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const parse = (value) => (value instanceof Date ? value : new Date(value))

export function isToday(value) {
  if (!value) return false
  const day = startOfDay(parse(value))
  const now = startOfDay(new Date())
  return day.getTime() === now.getTime()
}

export function isTomorrow(value) {
  if (!value) return false
  const day = startOfDay(parse(value))
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return day.getTime() === startOfDay(tomorrow).getTime()
}

export function isOverdue(value) {
  if (!value) return false
  return parse(value).getTime() < Date.now()
}

export function isThisWeek(value) {
  if (!value) return false
  const day = startOfDay(parse(value))
  const now = new Date()
  const start = startOfDay(now)
  start.setDate(start.getDate() - start.getDay() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return day >= start && day <= end
}

export function formatDate(value, style = 'short') {
  if (!value) return ''
  const date = parse(value)
  return formatters[style]?.format(date) ?? ''
}

export function formatTime(value) {
  if (!value) return ''
  return formatters.time.format(parse(value))
}

export function timeAgo(value) {
  if (!value) return ''
  const seconds = Math.floor((Date.now() - parse(value).getTime()) / 1000)
  if (seconds < 45) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(value)
}

export function formatBytes(value) {
  if (!value || Number.isNaN(Number(value))) return ''
  const bytes = Number(value)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function dueLabel(value) {
  if (!value) return 'No due date'
  if (isToday(value)) return 'Today'
  if (isTomorrow(value)) return 'Tomorrow'
  if (isOverdue(value)) return 'Overdue'
  return formatDate(value, 'long')
}

// Resolves the priority of a task-related notification. Uses the priority the
// backend embeds when available, otherwise falls back to the linked task.
export function notificationPriority(notification, tasks = []) {
  const fallback = Array.isArray(tasks)
    ? tasks.find((task) => task.id === notification?.taskId)?.priority
    : null
  return notification?.priority || fallback || null
}

export function monthLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    parse(date)
  )
}

export function sortTasks(a, b, sort = 'due') {
  if (sort === 'priority') {
    const order = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
  }
  if (sort === 'created') {
    return new Date(b.createdAt) - new Date(a.createdAt)
  }
  const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  return aDate - bDate
}

export function calendarMatrix(year, month) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day))
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}