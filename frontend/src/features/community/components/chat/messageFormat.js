import { isToday, personName } from '@/utils/format'

// Mirrors the server limits in backend/src/validators/messageValidators.js.
export const MAX_ATTACHMENTS = 10
export const MAX_BYTES = 5 * 1024 * 1024
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢']

export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function dayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// Chat history is only readable with some sense of scale: "2 hours ago" and
// "last Tuesday" mean nothing without knowing they are two different days.
// Dividers are derived from the same timestamps the bubbles use, so nothing new
// is stored or fetched.
export function dayLabel(value) {
  const date = new Date(value)
  if (isToday(date)) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}

export function groupReactions(reactions, meId) {
  const grouped = new Map()
  reactions.forEach((reaction) => {
    const entry = grouped.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
      // Reactors are tracked by id, not by name: two people can share a name,
      // and matching on the string would wrongly drop one of them.
      reactors: [],
    }
    entry.count += 1
    if (reaction.userId === meId) entry.mine = true
    if (!entry.reactors.some((item) => item.userId === reaction.userId)) {
      // Prefer the identity the server sent with the reaction; fall back to
      // nothing when the payload predates that field.
      entry.reactors.push({
        userId: reaction.userId ?? null,
        name: personName(reaction) || null,
      })
    }
    grouped.set(reaction.emoji, entry)
  })
  return [...grouped.values()].sort((a, b) => b.count - a.count)
}

function joinNames(names) {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// "You and Priya reacted with 👍" — the point of a reaction is knowing who sent
// it, so a bare count is not enough. Reactors whose identity never arrived are
// collapsed into an "N others" tail rather than listed as repeated "Someone".
export function reactionSummary(group, meId) {
  const named = []
  let unknown = 0
  group.reactors.forEach((reactor) => {
    if (reactor.userId === meId) {
      if (!named.includes('You')) named.push('You')
      return
    }
    if (reactor.name) named.push(reactor.name)
    else unknown += 1
  })

  if (group.mine && !named.includes('You')) named.unshift('You')

  const subject = named.length ? joinNames(named) : 'Someone'
  const tail = unknown > 0 ? ` and ${unknown} other${unknown === 1 ? '' : 's'}` : ''
  return `${subject} reacted with ${group.emoji}${tail}`
}
