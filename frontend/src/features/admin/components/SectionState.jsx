import { AlertTriangle } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'

/**
 * The loading / error / empty trio every admin page needs, in one place.
 *
 * Rendering these inline per page is how consoles end up with a spinner that
 * replaces content on refetch and jumps the layout, or an error that never
 * clears after a retry. Keeping the three states side by side here means the
 * retry button, the skeleton height and the empty copy stay identical across
 * the console.
 *
 * The spinner is wrapped in a fixed-height box so swapping between states does
 * not reflow the page under the reader's cursor.
 */
export default function SectionState({
  loading,
  error,
  isEmpty = false,
  onRetry,
  emptyIcon,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  minHeight = 240,
  children,
}) {
  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-card border border-border-subtle bg-surface-card"
        style={{ minHeight }}
      >
        <div className="flex flex-col items-center gap-3 text-ink-muted">
          <Spinner />
          <p className="text-[13px] font-medium">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-card border border-border-subtle bg-surface-card px-6 text-center"
        style={{ minHeight }}
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-rose-600">
          <AlertTriangle className="size-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Could not load this</p>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-muted">
            {error.message}
          </p>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return children
}
