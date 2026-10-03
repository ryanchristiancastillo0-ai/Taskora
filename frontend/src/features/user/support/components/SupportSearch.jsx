import { useMemo } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import Input from '@/shared/components/ui/Input'
import { searchSupport } from '../supportContent'

/**
 * Search over the content tree.
 *
 * Matches the predefined categories, issues and problems — never the ticket
 * database and never an AI model. That is a deliberate choice, not a shortcut:
 * this box is for finding the right branch of the flow, so it has to answer
 * instantly from data already in the bundle, work offline, and give the same
 * answer every time. Routing someone's support question through a model would
 * make the same search return a different branch tomorrow.
 *
 * Results are grouped by category and each row carries the whole path, so a hit
 * on "reset email" visibly means Account & Security > Forgot Password rather than
 * just appearing in a list.
 */
export default function SupportSearch({ query, onChange, onSelectProblem }) {
  const results = useMemo(() => searchSupport(query), [query])
  const hasQuery = query.trim().length > 0

  return (
    <div>
      <Input
        icon={Search}
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search for a problem…"
        aria-label="Search for a problem"
        // `type="search"` gives mobile Safari and Chrome the native clear
        // affordance; the explicit button below covers everything else.
        type="search"
      />

      {query && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <X className="size-3.5" strokeWidth={2} />
          Clear search
        </button>
      )}

      {hasQuery && (
        <div className="mt-4">
          {results.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-subtle bg-surface-soft/50 px-5 py-8 text-center">
              <p className="text-sm font-medium text-ink">No matches for “{query.trim()}”</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-muted">
                Try a shorter phrase — “password”, “notifications”, “AI” — or pick a
                category below.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </p>
              <ul className="flex flex-col gap-2">
                {results.slice(0, 8).map(({ category, issue, problem }) => (
                  <li key={`${category.id}-${issue.slug}-${problem.slug}`}>
                    <button
                      type="button"
                      onClick={() => onSelectProblem(category, issue, problem)}
                      className="group flex w-full items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-left shadow-card transition-colors hover:border-primary/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink group-hover:text-primary">
                          {problem.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {category.label} · {issue.label}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 flex-shrink-0 text-ink-faint transition-colors group-hover:text-primary"
                        strokeWidth={2}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}