import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, ListChecks, Loader2, Search, User, X } from 'lucide-react'
import { getSearch } from '@/features/admin/services/adminApi'
import { cx } from '@/utils/format'

// Long enough that a fast typist does not fire a request per keystroke, short
// enough that the dropdown feels attached to the keyboard rather than to the
// network.
const DEBOUNCE_MS = 220
const MIN_TERM = 2

const GROUPS = [
  {
    key: 'users',
    label: 'Users',
    icon: User,
    // Where a click lands. The result is a pointer to the table, not a shortcut
    // to a record: the table opens already filtered by the same term, so the
    // row that was clicked is in view along with everything else it matched.
    to: '/admin/users',
    primary: (user) => user.name,
    secondary: (user) => user.email,
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: ListChecks,
    to: '/admin/tasks',
    primary: (task) => task.title,
    secondary: (task) => `${task.owner?.name ?? 'Unassigned'} · ${task.status}`,
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    to: '/admin/projects',
    primary: (project) => project.name,
    secondary: (project) => `${project.owner?.name ?? 'Unknown'} · ${project.status}`,
  },
]

/**
 * The admin console's search field.
 *
 * One box, three kinds of match. Typing searches users, tasks and projects at
 * once and the results arrive grouped, so "coffee" showing both an account called
 * Coffee and the tasks inside a project called Coffee Bar is the point rather
 * than a bug.
 *
 * Choosing a result navigates to that table with the term in `?q=`. It does not
 * jump straight to a record: the console is a place for reading lists, and a
 * filtered table with the match in it is more useful than one row in isolation.
 * Each table seeds its filter from `q`, so the box on that page is already
 * filled in when the page arrives.
 *
 * Debounced, cancellable, and keyboard-navigable: arrows move, Enter opens, and
 * Escape closes without leaving the field.
 */
export default function AdminSearch({ className }) {
  const navigate = useNavigate()
  const listId = useId()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  // Guards against a slow earlier response landing after a faster later one and
  // overwriting the newer results.
  const requestId = useRef(0)

  const trimmed = term.trim()

  useEffect(() => {
    if (trimmed.length < MIN_TERM) {
      requestId.current += 1
      setResults(null)
      setLoading(false)
      return undefined
    }
    const id = requestId.current + 1
    requestId.current = id
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await getSearch({ q: trimmed })
        if (requestId.current !== id) return
        setResults(data)
        setActive(0)
      } catch {
        if (requestId.current !== id) return
        setResults(null)
      } finally {
        if (requestId.current === id) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  // Flattened once, so keyboard movement and rendering cannot disagree about
  // what the options are or what the total count is.
  const groups = useMemo(() => {
    if (!results) return []
    return GROUPS.map((group) => ({
      ...group,
      items: (results[group.key]?.items ?? []).map((item) => ({
        item,
        primary: group.primary(item),
        secondary: group.secondary(item),
      })),
    })).filter((group) => group.items.length > 0)
  }, [results])

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const total = flat.length

  const go = useCallback(
    (entry) => {
      // The group has to be found by looking for the entry inside the groups.
      // Indexing `groups` with an offset into `flat` looks like it would work
      // and never does: `groups` holds at most three group objects while `flat`
      // holds every match, so the lookup is undefined for all but the first
      // result of the first group and the click silently does nothing.
      const group = groups.find((candidate) => candidate.items.includes(entry))
      if (!group) return
      setOpen(false)
      setTerm(trimmed)
      navigate(`${group.to}?q=${encodeURIComponent(trimmed)}`)
    },
    [groups, navigate, trimmed]
  )

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (total === 0) return
      event.preventDefault()
      setOpen(true)
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1
        if (next < 0) return total - 1
        if (next >= total) return 0
        return next
      })
      return
    }
    if (event.key === 'Enter') {
      const entry = flat[active]
      if (open && entry) {
        event.preventDefault()
        go(entry)
      }
    }
  }

  const showPanel = open && trimmed.length >= MIN_TERM

  return (
    <div ref={rootRef} className={cx('relative min-w-0', className)}>
      <div
        className={cx(
          'flex items-center gap-2 rounded-field border bg-surface-canvas px-3 transition-colors',
          showPanel ? 'border-primary/40 bg-surface-card' : 'border-border-subtle'
        )}
      >
        {loading ? (
          <Loader2 className="size-4 flex-shrink-0 animate-spin text-ink-faint" strokeWidth={2} />
        ) : (
          <Search className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
        )}
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search users, tasks, projects"
          aria-label="Search users, tasks and projects"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && flat[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
        />
        {term && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setTerm('')
              setResults(null)
              setOpen(false)
              inputRef.current?.focus()
            }}
            className="flex size-5 flex-shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-surface-container hover:text-ink"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-field border border-border-subtle bg-surface-card shadow-lifted animate-[fadeIn_150ms_ease-out] motion-reduce:animate-none"
          // Kept to the field's own width on wide screens, but never allowed to
          // be narrower than the field: at 320px the field is already full-bleed
          // and a dropdown wider than the screen is the one thing that must not
          // happen here.
        >
          {total === 0 ? (
            <p className="px-3 py-4 text-[13px] text-ink-muted">
              {loading ? 'Searching…' : `No matches for “${trimmed}”.`}
            </p>
          ) : (
            <>
              <ul
                id={listId}
                role="listbox"
                aria-label="Search results"
                className="max-h-[min(22rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain py-1.5"
              >
                {groups.map((group) => {
                  const Icon = group.icon
                  return (
                    <li key={group.key} role="presentation">
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        {group.label}
                      </p>
                      <ul role="presentation">
                        {group.items.map((entry) => {
                          const index = flat.indexOf(entry)
                          const isActive = index === active
                          return (
                            <li key={`${group.key}-${entry.item.id}`} role="presentation">
                              <button
                                type="button"
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={isActive}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => go(entry)}
                                className={cx(
                                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                                  isActive ? 'bg-primary-soft/60' : 'hover:bg-surface-soft'
                                )}
                              >
                                <span className="flex size-7 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container text-ink-soft">
                                  <Icon className="size-3.5" strokeWidth={2} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-ink">
                                    {entry.primary}
                                  </span>
                                  <span className="block truncate text-[11px] text-ink-muted">
                                    {entry.secondary}
                                  </span>
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ul>
              <p className="border-t border-border-subtle px-3 py-2 text-[11px] text-ink-faint">
                {total} match{total === 1 ? '' : 'es'} for “{trimmed}” · Enter opens the filtered
                table
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
