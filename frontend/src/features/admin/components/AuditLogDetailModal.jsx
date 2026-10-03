import { Lock } from 'lucide-react'
import Modal from '@/shared/components/ui/Modal'
import Badge from '@/shared/components/ui/Badge'
import Avatar from '@/shared/components/ui/Avatar'
import { auditActionMeta } from '@/shared/constants'
import { formatDate, timeAgo } from '@/shared/utils/format'

function Field({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-0.5 break-words text-[13px] text-ink ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Pretty-prints one of the JSON columns.
 *
 * `whitespace-pre-wrap` with `break-words` rather than a bare `<pre>`: an audit
 * document can legitimately hold a long token, a URL or a message with no spaces,
 * and a pre-formatted block that does not wrap is the one thing on this page that
 * can push the modal past the viewport and force the whole page to scroll sideways.
 * Wrapping keeps the widest possible document inside the modal at any width.
 */
function JsonBlock({ label, value }) {
  // Null and {} are both "nothing recorded", but they are not the same null: the
  // first means the column was never written, the second means it was written
  // empty. Both read as an absent value in this view, so they are treated alike
  // rather than rendering one as an empty code block.
  const empty =
    value == null || (typeof value === 'object' && Object.keys(value).length === 0)

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      {empty ? (
        <p className="text-[13px] text-ink-faint">Not recorded</p>
      ) : (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-card bg-surface-soft p-3 font-mono text-xs leading-relaxed text-ink-soft">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}

/**
 * Read-only detail view for one audit event.
 *
 * There is no footer and no mutating control, by design. AuditService.record() is
 * the only write path in the product and the table has no delete endpoint, so this
 * view cannot edit or erase the row it is showing — the same posture
 * UserDetailModal takes, except that here it is the whole point of the page.
 *
 * Redaction happens on the backend, in AuditService.sanitize(), before the value
 * is ever stored. Nothing here un-masks or re-derives a stored field, so a
 * password hash or a provider key cannot be reconstructed from this view: if the
 * sanitizer replaced it, the replacement is all that was ever persisted.
 */
export default function AuditLogDetailModal({ log, onClose }) {
  if (!log) return null

  const meta = auditActionMeta(log.action)

  return (
    <Modal
      open
      onClose={onClose}
      title={meta.label}
      subtitle={log.action}
      size="lg"
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {log.actor ? (
            <Avatar name={log.actor.name} src={log.actor.avatarUrl} />
          ) : (
            <span className="flex size-11 flex-shrink-0 items-center justify-center rounded-full bg-surface-container text-ink-faint">
              <Lock className="size-5" strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Badge tone="slate">{log.entity}</Badge>
            </div>
            <p className="mt-1.5 break-words text-[13px] text-ink-muted">
              {log.actor ? (
                <>
                  {log.actor.name} · {log.actor.email}
                </>
              ) : (
                'No linked account — either the sign-in matched nothing, or the account has since been deleted.'
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-card bg-surface-soft p-4 sm:grid-cols-3">
          <Field label="Date" value={formatDate(log.at, 'long')} />
          <Field label="Age" value={timeAgo(log.at)} />
          <Field label="IP address" value={log.ipAddress || 'Not recorded'} mono />
          <Field label="Target id" value={log.entityId || 'Not recorded'} mono />
          <Field label="Entity" value={log.entity} />
          <Field label="Action" value={log.action} mono />
        </div>

        <JsonBlock label="Details" value={log.details} />
        <JsonBlock label="Previous value" value={log.oldValue} />
        <JsonBlock label="New value" value={log.newValue} />

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            User agent
          </p>
          <p className="break-words rounded-card bg-surface-soft p-3 font-mono text-xs leading-relaxed text-ink-soft">
            {log.userAgent || 'Not recorded'}
          </p>
        </div>

        <p className="flex items-start gap-2 rounded-card bg-primary-soft p-3 text-[13px] leading-relaxed text-ink-soft">
          <Lock className="mt-0.5 size-4 flex-shrink-0 text-primary" strokeWidth={2} />
          Sensitive values are replaced with a redaction marker before this event is
          stored, so they are not recoverable from this page.
        </p>
      </div>
    </Modal>
  )
}