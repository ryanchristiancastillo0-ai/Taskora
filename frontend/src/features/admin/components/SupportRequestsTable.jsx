import { Eye } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import DataTable from '@/components/ui/DataTable'
import Dropdown, { MenuItem } from '@/components/ui/Dropdown'
import { formatDate, timeAgo } from '@/utils/format'
import {
  issueLabel,
  problemLabel,
  supportCategoryLabel,
  supportStatusMeta,
} from '@/features/user/support/supportContent'

/**
 * The triage queue.
 *
 * Presentational only — filters, sort and every mutation live in pages/Support.jsx,
 * exactly as they do for the users table.
 *
 * Labels are resolved from the content tree in features/user/support, because the
 * backend stores `issue` and `problem` as slugs (see supportContent.js). Showing
 * the raw slug in a triage column would make the queue unreadable, so the console
 * reads the same tree the user's guided flow renders. That is a deliberate
 * cross-feature import: the tree is the shared vocabulary of both halves of the
 * product, not user-page state, and duplicating it here would let the two halves
 * disagree about what a ticket is about.
 */
export default function SupportRequestsTable({ items, onView }) {
  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      headerClassName: 'w-0',
      render: (request) => (
        <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-primary">
          {request.reference}
        </span>
      ),
    },
    {
      key: 'problem',
      label: 'Problem',
      render: (request) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {problemLabel(request.category, request.issue, request.problem)}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {supportCategoryLabel(request.category)} ·{' '}
            {issueLabel(request.category, request.issue)}
          </p>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'User',
      render: (request) =>
        request.user ? (
          <div className="flex items-center gap-3">
            <Avatar name={request.user.name} src={request.user.avatarUrl} />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {request.user.name || 'Unnamed'}
              </p>
              <p className="truncate text-xs text-ink-muted">{request.user.email}</p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-ink-faint">Deleted account</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      headerClassName: 'w-0',
      render: (request) => {
        const status = supportStatusMeta(request.status)
        return (
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        )
      },
    },
    {
      key: 'created',
      label: 'Submitted',
      headerClassName: 'w-0',
      render: (request) => (
        <span
          className="whitespace-nowrap text-ink-muted"
          title={formatDate(request.createdAt, 'long')}
        >
          {timeAgo(request.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-0 text-right',
      className: 'text-right',
      render: (request) => (
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${request.reference}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-container hover:text-ink"
            >
              <Eye className="size-4" strokeWidth={2} />
            </button>
          }
        >
          <MenuItem icon={Eye} label="Open request" onClick={() => onView(request)} />
        </Dropdown>
      ),
    },
  ]

  return (
    <DataTable columns={columns} items={items} getRowId={(request) => request.id} />
  )
}