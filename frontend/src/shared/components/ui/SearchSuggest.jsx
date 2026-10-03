import { useEffect, useRef, useState } from 'react'
import { History, ListChecks, Search } from 'lucide-react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useSearchSuggestions } from '../../hooks/useSearchSuggestions'
import { addSearchHistory } from '../../utils/searchHistory'
import { cx } from '../../utils/format'
import Kbd from './Kbd'

const baseInput =
  'h-10 w-full rounded-field border border-transparent bg-canvas pl-10 text-sm text-ink placeholder:text-ink-faint transition-all focus:outline-none focus:ring-4 focus:ring-primary/10'

// Shared search input with deterministic auto-suggestions: recent search
// history first, then matching task titles. Used by the header search and
// the tasks-page search so both behave identically. On submit (Enter or a
// suggestion click) the term is recorded to search history, then passed to
// the parent via `onSubmit`. The input itself is never debounced, so typing
// stays instant; only the suggestion list is computed on a debounced term.
export default function SearchSuggest({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  inputClassName = '',
  rootClassName = '',
  showKbd = false,
  enableShortcut = false,
  debounceMs = 300,
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const debouncedValue = useDebouncedValue(value, debounceMs)
  const { history, tasks, hasAny } = useSearchSuggestions(debouncedValue)

  useEffect(() => {
    if (!enableShortcut) return
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enableShortcut])

  const commit = (term) => {
    const final = String(term ?? value ?? '').trim()
    if (!final) return
    addSearchHistory(final)
    setOpen(false)
    if (onChange) onChange(final)
    if (onSubmit) onSubmit(final)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      commit(value)
    } else if (event.key === 'Escape') {
      setOpen(false)
      event.currentTarget.blur()
    }
  }

  return (
    <div className={cx('relative', rootClassName)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        strokeWidth={2}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          baseInput,
          showKbd ? 'pr-16' : 'pr-4',
          inputClassName
        )}
      />
      {showKbd && (
        <div className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 md:block">
          <Kbd>⌘K</Kbd>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-lifted">
            {!value.trim() && history.length === 0 && (
              <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
                Start typing to search your tasks
              </p>
            )}

            {history.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Recent
                </p>
                {history.map((item, index) => (
                  <button
                    key={`${item}-${index}`}
                    type="button"
                    onClick={() => commit(item)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-container"
                  >
                    <History className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                    <span className="truncate">{item}</span>
                  </button>
                ))}
              </div>
            )}

            {tasks.length > 0 && (
              <div className="pb-1">
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Tasks
                </p>
                {tasks.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => commit(title)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-container"
                  >
                    <ListChecks className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                    <span className="truncate">{title}</span>
                  </button>
                ))}
              </div>
            )}

            {debouncedValue.trim() && !hasAny && (
              <div className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => commit(value)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-container"
                >
                  <Search className="size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                  <span className="truncate">
                    Search for <span className="font-medium text-primary">“{value.trim()}”</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}