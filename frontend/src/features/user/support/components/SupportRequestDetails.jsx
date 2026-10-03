import { AlertTriangle, Inbox } from 'lucide-react'
import Badge from '@/shared/components/ui/Badge'
import Button from '@/shared/components/ui/Button'
import Modal from '@/shared/components/ui/Modal'
import Spinner from '@/shared/components/ui/Spinner'
import { formatDate, formatTime } from '@/shared/utils/format'
import {
  issueLabel,
  problemLabel,
  supportCategoryLabel,
  supportStatusMeta,
} from '../supportContent'

/**
 * One ticket, in full.
 *
 * A modal rather than a page, because it is opened from the history list and
 * dismissed back to it — a separate route would lose the list's scroll position
 * and its filters. The list it came from stays mounted behind it, which is also
 * why `request` is fetched here rather than passed in: the list row is a summary
 * and does not carry the description or the resolution note.
 *
 * The optional description is rendered conditionally. A ticket submitted without
 * one shows "No additional details were provided" rather than an empty section,
 * so the absence reads as intentional instead of as something that failed to
 * load.
 */
export default function SupportRequestDetails({ request, loading, error, onClose, onRetry }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={request ? `Request #${request.reference}` : 'Support request'}
      subtitle={request ? problemLabel(request.category, request.issue, request.problem) : undefined}
      size="md"
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-3 text-ink-muted">
            <Spinner />
            <p className="text-[13px] font-medium">Loading…</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-rose-600">
            <AlertTriangle className="size-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Could not load this request</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-muted">
              {error.message}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : request ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={supportStatusMeta(request.status).tone} dot>
              {supportStatusMeta(request.status).label}
            </Badge>
            <span className="text-[13px] text-ink-muted">
              Submitted{' '}
              {formatDate(request.createdAt, 'long')} at {formatTime(request.createdAt)}
            </span>
          </div>

          <dl className="divide-y divide-border-subtle rounded-field border border-border-subtle bg-surface-soft/50">
            <DetailRow label="Category" value={supportCategoryLabel(request.category)} />
            <DetailRow label="Issue" value={issueLabel(request.category, request.issue)} />
            <DetailRow
              label="Problem"
              value={problemLabel(request.category, request.issue, request.problem)}
            />
          </dl>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Details</p>
            {request.description ? (
              <p className="whitespace-pre-wrap rounded-field border border-border-subtle bg-surface-soft/40 px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                {request.description}
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-field border border-dashed border-border-subtle px-3.5 py-3 text-[13px] text-ink-muted">
                <Inbox className="size-4 flex-shrink-0" strokeWidth={2} />
                No additional details were provided.
              </div>
            )}
          </div>

          {request.resolutionNote && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">
                Our team&apos;s reply
              </p>
              <p className="whitespace-pre-wrap rounded-field border border-primary/25 bg-primary-faint px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                {request.resolutionNote}
              </p>
            </div>
          )}

          {request.firstRespondedAt && (
            <p className="text-xs text-ink-faint">
              First response {formatDate(request.firstRespondedAt, 'long')} at{' '}
              {formatTime(request.firstRespondedAt)}
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[13px] font-medium text-ink-muted sm:w-28">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}