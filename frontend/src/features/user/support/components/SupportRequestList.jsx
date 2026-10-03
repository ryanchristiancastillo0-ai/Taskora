import { AlertTriangle, LifeBuoy } from 'lucide-react'
import Badge from '@/shared/components/ui/Badge'
import Button from '@/shared/components/ui/Button'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import EmptyState from '@/shared/components/ui/EmptyState'
import Spinner from '@/shared/components/ui/Spinner'
import { formatDate, timeAgo } from '@/shared/utils/format'
import {
  issueLabel,
  problemLabel,
  supportCategoryLabel,
  supportStatusMeta,
} from '../supportContent'

/**
 * "My Support Requests" — everything this account has filed.
 *
 * The list labels each row by resolving the stored slugs back to the current
 * wording (see supportContent.js). A ticket filed three months ago must still
 * read as "Forgot Password", not as `forgot-password`, so the label is resolved
 * from the tree at render time rather than snapshotted into the row.
 *
 * The row itself is a button, so the whole card is clickable and reachable by
 * keyboard, rather than a clickable <div> with a decorative chevron.
 */
export default function SupportRequestList({
  requests,
  loading,
  error,
  onRetry,
  onSelect,
  onBrowse,
}) {
  return (
    <Card>
      <CardHeader
        icon={LifeBuoy}
        title="My Support Requests"
        subtitle={
          requests?.pagination?.total
            ? `${requests.pagination.total} ${
                requests.pagination.total === 1 ? 'request' : 'requests'
              } submitted`
            : 'Everything you have sent to our team'
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-3 text-ink-muted">
            <Spinner />
            <p className="text-[13px] font-medium">Loading your requests…</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-border-subtle bg-surface-soft/50 px-6 py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-rose-600">
            <AlertTriangle className="size-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Could not load your requests</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-muted">
              {error.message}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : requests.items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support requests yet"
          description="When you submit a request it will appear here, with its reference number and current status."
          action={
            onBrowse && (
              <Button variant="soft" size="sm" onClick={onBrowse}>
                Browse help topics
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.items.map((request) => {
            const status = supportStatusMeta(request.status)

            return (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => onSelect(request.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-field border border-border-subtle bg-surface-soft/60 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary-faint"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-primary">
                        {request.reference}
                      </span>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium text-ink">
                      {problemLabel(request.category, request.issue, request.problem)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {supportCategoryLabel(request.category)} · {issueLabel(request.category, request.issue)}
                    </span>
                  </span>
                  <span
                    className="flex-shrink-0 pt-0.5 text-right text-xs text-ink-faint"
                    title={formatDate(request.createdAt, 'long')}
                  >
                    {timeAgo(request.createdAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}