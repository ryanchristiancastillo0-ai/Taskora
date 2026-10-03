import { useMemo } from 'react'
import { useApp } from '../../features/user/context/AppContext'
import { getSearchHistory } from '../utils/searchHistory'

const DEFAULT_TASK_LIMIT = 6
const DEFAULT_HISTORY_LIMIT = 5

// Shared, deterministic suggestion logic for the search bars (header search
// and the tasks-page search). History is matched first (most recent on top),
// then matching task titles. When the query is empty, recent history alone is
// returned so the user can re-run a previous search.
export function useSearchSuggestions(
  query,
  { taskLimit = DEFAULT_TASK_LIMIT, historyLimit = DEFAULT_HISTORY_LIMIT } = {}
) {
  const { data } = useApp()

  return useMemo(() => {
    const term = String(query || '').trim().toLowerCase()

    const historyAll = getSearchHistory()
    const history = term
      ? historyAll.filter((item) => item.toLowerCase().includes(term)).slice(0, historyLimit)
      : historyAll.slice(0, historyLimit)

    const tasks = []
    if (term) {
      const seen = new Set()
      for (const task of data.tasks || []) {
        const title = task?.title || ''
        const key = title.toLowerCase()
        if (key.includes(term) && !seen.has(key)) {
          seen.add(key)
          tasks.push(title)
        }
        if (tasks.length >= taskLimit) break
      }
    }

    return {
      history,
      tasks,
      hasAny: history.length > 0 || tasks.length > 0,
    }
  }, [query, data.tasks, taskLimit, historyLimit])
}