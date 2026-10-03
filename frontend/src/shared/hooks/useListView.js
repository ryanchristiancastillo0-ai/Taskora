import { useCallback, useEffect, useState } from 'react'

// One preference shared by every list-style page (notes, goals). Keyed as one
// value rather than per page so switching it in one place switches it
// everywhere, which is what a layout preference is expected to do.
const STORAGE_KEY = 'taskora.listView'

export const LIST_VIEWS = ['card', 'list', 'table']

export const LIST_VIEW_OPTIONS = [
  { value: 'card', label: 'Card' },
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
]

const DEFAULT_VIEW = 'card'

// Read lazily in useState's initialiser rather than at module scope: this file
// is imported by pages that can render during SSR-less tests and by anything
// touching localStorage before the DOM exists.
function readStoredView() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return LIST_VIEWS.includes(stored) ? stored : DEFAULT_VIEW
  } catch {
    // Storage disabled (private mode, blocked cookies). Fall back rather than
    // crashing the page over a cosmetic preference.
    return DEFAULT_VIEW
  }
}

export default function useListView() {
  const [view, setView] = useState(readStoredView)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, view)
    } catch {
      // Not being able to remember the choice is not worth surfacing.
    }
  }, [view])

  // Guarded so a bad value from a stale caller cannot put the page in a state
  // it has no renderer for.
  const selectView = useCallback((next) => {
    setView(LIST_VIEWS.includes(next) ? next : DEFAULT_VIEW)
  }, [])

  return [view, selectView]
}
