/**
 * Page controls for the admin tables.
 *
 * Deliberately Previous/Next rather than numbered links: the admin tables are
 * sorted and filtered server-side, and a windowed pager is what the backend
 * pagination model actually supports. Rendering 40 page buttons for a large
 * table would also be the single biggest source of horizontal overflow on a
 * phone.
 */
export default function Pagination({ page, totalPages, total, noun = 'items', onPage }) {
  if (total === 0) return null

  const lastPage = Math.max(totalPages, 1)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-ink-muted">
        Page <span className="font-semibold text-ink">{Math.min(page, lastPage)}</span> of{' '}
        <span className="font-semibold text-ink">{lastPage}</span> ·{' '}
        <span className="font-semibold text-ink tabular-nums">{total}</span>{' '}
        {total === 1 ? noun.replace(/s$/, '') : noun}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="h-8 rounded-lg border border-border-subtle bg-surface-card px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= lastPage}
          className="h-8 rounded-lg border border-border-subtle bg-surface-card px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
