import { useEffect, useState } from 'react'
import { Inbox, Save } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { ACCOUNT_STATUS } from '@/constants'
import { formatDate, formatTime, timeAgo } from '@/utils/format'
import {
  issueLabel,
  problemLabel,
  supportCategoryLabel,
} from '@/features/user/support/supportContent'

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

/**
 * One ticket, with the two things an admin can change about it.
 *
 * Status and resolution note are edited in one form and saved as one PATCH,
 * because they are one decision — "this is fixed, here is what I did" — and two
 * round trips could disagree about what was actually stored.
 *
 * The form resets whenever a DIFFERENT ticket is opened rather than on every
 * render: keying the effect on the id means switching from one request to
 * another discards the previous admin's half-typed note instead of silently
 * attaching it to a different person. Switching back and forth is deliberate
 * work, not an accident.
 *
 * `dirty` exists so Save is only enabled on a real change. Without it, opening a
 * ticket and pressing Save sends a PATCH the server would treat as a no-op, and
 * the notification the backend fires on a status transition is correctly
 * suppressed — so the admin sees nothing happen and cannot tell whether the click
 * registered.
 */
export default function SupportDetailModal({ request, onClose, onSave, saving }) {
  const [status, setStatus] = useState(request.status)
  const [resolutionNote, setResolutionNote] = useState(request.resolutionNote ?? '')

  useEffect(() => {
    setStatus(request.status)
    setResolutionNote(request.resolutionNote ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id])

  const dirty =
    status !== request.status ||
    resolutionNote.trim() !== (request.resolutionNote ?? '').trim()

  const handleSave = async () => {
    const patch = { status }
    const note = resolutionNote.trim()
    patch.resolutionNote = note || null
    await onSave(patch)
  }

  const account = request.user ? ACCOUNT_STATUS[request.user.status] : null

  return (
    <Modal
      open
      onClose={onClose}
      title={`Request #${request.reference}`}
      subtitle={problemLabel(request.category, request.issue, request.problem)}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {/* Who filed it. The user object is the existing User relation rendered
            for triage — nothing here is duplicated onto the ticket row. */}
        <div className="flex items-center gap-3 rounded-field border border-border-subtle bg-surface-soft/50 px-4 py-3">
          {request.user ? (
            <>
              <Avatar name={request.user.name} src={request.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {request.user.name || 'Unnamed'}
                </p>
                <p className="truncate text-xs text-ink-muted">{request.user.email}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                {account && <Badge tone={account.tone}>{account.label}</Badge>}
                <span
                  className="text-xs text-ink-faint"
                  title={
                    request.user.lastActiveAt
                      ? formatDate(request.user.lastActiveAt, 'long')
                      : undefined
                  }
                >
                  {request.user.lastActiveAt
                    ? `Active ${timeAgo(request.user.lastActiveAt)}`
                    : 'Never active'}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">
              The account that filed this request no longer exists.
            </p>
          )}
        </div>

        <dl className="divide-y divide-border-subtle rounded-field border border-border-subtle bg-surface-soft/50">
          <Row label="Category" value={supportCategoryLabel(request.category)} />
          <Row label="Issue" value={issueLabel(request.category, request.issue)} />
          <Row
            label="Problem"
            value={problemLabel(request.category, request.issue, request.problem)}
          />
          <Row
            label="Submitted"
            value={`${formatDate(request.createdAt, 'long')} at ${formatTime(request.createdAt)}`}
          />
          {request.user?.joinedAt && (
            <Row
              label="Account"
              value={`Joined ${formatDate(request.user.joinedAt, 'long')}`}
            />
          )}
        </dl>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-soft">
            Details from the user
          </p>
          {request.description ? (
            <p className="whitespace-pre-wrap rounded-field border border-border-subtle bg-surface-soft/40 px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
              {request.description}
            </p>
          ) : (
            <div className="flex items-center gap-2 rounded-field border border-dashed border-border-subtle px-3.5 py-3 text-[13px] text-ink-muted">
              <Inbox className="size-4 flex-shrink-0" strokeWidth={2} />
              The user submitted this without adding any extra details — the guided
              flow already captured the problem.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Textarea
            label="Resolution note"
            rows={4}
            maxLength={5000}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="What did you do to fix it? The user sees this note."
            hint="Shown to the user on their ticket."
          />

          {request.firstRespondedAt && (
            <p className="text-xs text-ink-faint">
              First response {formatDate(request.firstRespondedAt, 'long')} at{' '}
              {formatTime(request.firstRespondedAt)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button
            icon={Save}
            onClick={handleSave}
            loading={saving}
            disabled={!dirty || saving}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[13px] font-medium text-ink-muted sm:w-28">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}