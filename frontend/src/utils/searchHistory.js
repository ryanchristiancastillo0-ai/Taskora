const STORAGE_KEY = 'taskora:recent-searches'
const MAX_ENTRIES = 10

export function getSearchHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string' && item.trim())
      : []
  } catch {
    return []
  }
}

export function addSearchHistory(term) {
  const value = String(term || '').trim()
  if (!value) return getSearchHistory()

  const next = [
    value,
    ...getSearchHistory().filter(
      (item) => item.toLowerCase() !== value.toLowerCase()
    ),
  ].slice(0, MAX_ENTRIES)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable — history is best-effort
  }
  return next
}