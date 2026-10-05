import { useState } from 'react'
import { ArrowLeft, LifeBuoy, Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card, { CardHeader } from '@/components/ui/Card'
import Textarea from '@/components/ui/Textarea'
import { issueLabel, problemLabel, supportCategoryLabel } from '@/features/user/support/supportContent'

/**
 * The submission step, pre-filled from the selections behind it.
 *
 * This is the point of the whole guided flow. Everything in the "summary" block
 * was already established by the three clicks that got here, so it is shown
 * read-only instead of being asked for again — a user who picked "Forgot Password"
 * has already said they forgot their password, and asking them to retype it in a
 * form field would be the single most common reason people abandon a support flow.
 *
 * Only one field is left to the user, and it is genuinely optional: `description`
 * is validated as nullable on the server, so an empty box produces a complete
 * ticket rather than a rejected submission. The button is therefore never
 * disabled on an empty description, and the helper text says so outright.
 *
 * Double-submits are handled here rather than hoped away. `submitting` disables
 * the button, and a module-scoped in-flight key rejects a second click that
 * arrives before the first has resolved, which is what would otherwise create two
 * tickets from one impatient double-click.
 */

const DESCRIPTION_LIMIT = 5000

// In-flight submissions, keyed by ticket identity. Survives re-mounts within a
// page session, so returning to the form mid-request cannot produce a duplicate.
const inFlight = new Set()

function ticketKey(category, issue, problem) {
  return `${category.id}::${issue.slug}::${problem.slug}`
}

export default function SupportRequestForm({
  category,
  issue,
  problem,
  onSubmit,
  onBack,
  submitting,
}) {
  const [description, setDescription] = useState('')

  const key = ticketKey(category, issue, problem)
  const blocked = submitting || inFlight.has(key)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (blocked) return

    inFlight.add(key)
    try {
      // `description` is passed through exactly as typed. supportApi strips a
      // blank string rather than sending "", so omitting the key entirely is the
      // server's business, not this form's.
      await onSubmit({
        category: category.id,
        issue: issue.slug,
        problem: problem.slug,
        description,
      })
    } catch {
      // The page has already toasted the reason. Swallowing it here is not
      // hiding a failure — it stops the rethrow reaching the event handler as an
      // unhandled rejection, and the `finally` below still clears the guard so
      // the button works again.
    } finally {
      inFlight.delete(key)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" type="button" icon={ArrowLeft} onClick={onBack}>
          Back
        </Button>
      </div>

      <Card>
        <CardHeader
          icon={LifeBuoy}
          title="Submit Support Request"
          subtitle="Check the summary below, add anything else if you want, then send."
        />

        {/* Read-only summary of the path the user already walked. Rendered as a
            definition list rather than disabled inputs: a disabled field looks
            editable-ish and submits as a control; a <dl> is unambiguously
            information the system already holds. */}
        <dl className="divide-y divide-border-subtle rounded-field border border-border-subtle bg-surface-soft/50">
          <SummaryRow label="Category" value={supportCategoryLabel(category.id)} />
          <SummaryRow label="Issue" value={issueLabel(category.id, issue.slug)} />
          <SummaryRow
            label="Problem"
            value={problemLabel(category.id, issue.slug, problem.slug)}
          />
        </dl>

        <div className="mt-5">
          <Textarea
            label="Additional Details (Optional)"
            rows={5}
            maxLength={DESCRIPTION_LIMIT}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us anything else that may help us understand your issue…"
            hint="Optional — you can submit without writing anything here."
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
            Back
          </Button>
          <Button type="submit" icon={Send} loading={submitting} disabled={blocked}>
            {submitting ? 'Sending…' : 'Submit request'}
          </Button>
        </div>
      </Card>
    </form>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[13px] font-medium text-ink-muted sm:w-28">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}