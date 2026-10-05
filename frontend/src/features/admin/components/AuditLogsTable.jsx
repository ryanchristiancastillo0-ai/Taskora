import { Eye, MoreHorizontal, ShieldAlert } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import DataTable from '@/components/ui/DataTable'
import Dropdown, { MenuItem } from '@/components/ui/Dropdown'
import { auditActionMeta } from '@/constants'
import { formatDate, timeAgo } from '@/utils/format'

// How many key/value pairs the Details cell will show before deferring to the
// detail modal. Enough for the flat objects the call sites actually write (a
// failed sign-in's attempted address, a self-demotion's refusal reason) without
// letting a nested object turn one cell into a paragraph of punctuation.
const MAX_DETAIL_PAIRS = 2

/**
 * Renders the flat, human-meaningful part of a JSON column into one line.
 *
 * AuditLog.details is Json, so it can hold anything. The common case is a short
 * flat object and the useful thing to show inline is "key: value" for its scalar
 * entries; anything nested is left for the modal, where there is room for it.
 *
 * Values are stringified defensively rather than assumed: `[redacted]` arrives as
 * a plain string from the sanitizer, but an object could round-trip from Prisma
 * as null, so this cannot assume a type.
 */
function detailSummary(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null

  const parts = Object.entries(value)
    .filter(([, entry]) => entry == null || typeof entry !== 'object')
    .slice(0, MAX_DETAIL_PAIRS)
    .map(([key, entry]) => `${key}: ${String(entry)}`)

  return parts.length ? parts.join(' · ') : null
}

/**
 * The audit trail as a table.
 *
 * Presentational only, like every other table in the console: filters, sort and
 * pagination live in pages/AuditLogs.jsx.
 *
 * Two columns earn their place by answering a question an admin cannot ask
 * otherwise. Actor reads "who", and it is the one column that may legitimately be
 * blank: a failed sign-in has no account behind it and a deleted account's row is
 * preserved by an ON DELETE SET NULL that empties the join. Rendering that as a
 * missing cell would make those rows look like a rendering bug, so the two cases
 * are named rather than left blank. IP is kept as a column rather than hidden in
 * the modal because "every sign-in from this address" is a question you want to
 * answer by scanning, not by opening rows one at a time.
 *
 * Everything else the row carries — the user agent, and the full details /
 * oldValue / newValue documents — is in the detail modal. A JSON document in a
 * table cell is unreadable at any width, and a truncated one invites the reader to
 * believe the part they can see is the whole record.
 */
export default function AuditLogsTable({ items, onView }) {
  const columns = [
    {
      key: 'at',
      label: 'Time',
      render: (item) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-ink-soft">{formatDate(item.at)}</p>
          <p className="whitespace-nowrap text-xs text-ink-faint">{timeAgo(item.at)}</p>
        </div>
      ),
    },
    {
      key: 'actor',
      label: 'Actor',
      render: (item) =>
        item.actor ? (
          <div className="flex items-center gap-3">
            <Avatar name={item.actor.name} src={item.actor.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{item.actor.name}</p>
              <p className="truncate text-xs text-ink-muted">{item.actor.email}</p>
            </div>
          </div>
        ) : (
          // The two reasons a row has no actor are different stories: one is a
          // stranger who never had an account, the other is a person who did and
          // has since been removed. Only `details` separates them, so the cell
          // stays neutral and the modal carries the context.
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-container text-ink-faint">
              <ShieldAlert className="size-4" strokeWidth={2} />
            </span>
            <span className="whitespace-nowrap text-[13px] text-ink-faint">No account</span>
          </div>
        ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (item) => {
        const meta = auditActionMeta(item.action)
        return <Badge tone={meta.tone}>{meta.label}</Badge>
      },
    },
    {
      key: 'entity',
      label: 'Entity',
      render: (item) => (
        <span className="whitespace-nowrap text-ink-soft">{item.entity}</span>
      ),
    },
    {
      key: 'entityId',
      label: 'Target',
      render: (item) =>
        item.entityId ? (
          <span
            className="block max-w-[120px] truncate font-mono text-xs text-ink-muted"
            title={item.entityId}
          >
            {item.entityId}
          </span>
        ) : (
          <span className="whitespace-nowrap text-ink-faint">—</span>
        ),
    },
    {
      key: 'details',
      label: 'Details',
      render: (item) => {
        const summary = detailSummary(item.details)
        if (!summary) {
          return <span className="whitespace-nowrap text-ink-faint">—</span>
        }
        return (
          <span className="block max-w-[200px] truncate text-[13px] text-ink-muted" title={summary}>
            {summary}
          </span>
        )
      },
    },
    {
      key: 'ipAddress',
      label: 'IP address',
      render: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
          {item.ipAddress || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-0 text-right',
      className: 'text-right',
      render: (item) => (
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${item.action}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-container hover:text-ink"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </button>
          }
        >
          <MenuItem icon={Eye} label="View details" onClick={() => onView(item)} />
        </Dropdown>
      ),
    },
  ]

  return <DataTable columns={columns} items={items} getRowId={(item) => item.id} />
}