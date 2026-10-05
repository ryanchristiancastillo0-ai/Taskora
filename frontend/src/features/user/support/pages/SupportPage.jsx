import { useState } from 'react'
import { CheckCircle2, Inbox, LifeBuoy } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useApp } from '@/app/providers/AppContext'
import useSupportRequests from '@/features/user/support/hooks/useSupportRequests'
import {
  createRequest,
  getMyRequests,
  getRequest,
  submitFeedback,
} from '@/features/user/support/api/supportApi'
import {
  issueLabel,
  problemLabel,
  supportCategoryLabel,
  supportStatusMeta,
} from '@/features/user/support/supportContent'
import SupportCategoryGrid, { ContactSupportCard } from '@/features/user/support/components/SupportCategoryGrid'
import SupportIssueFlow from '@/features/user/support/components/SupportIssueFlow'
import SupportRating from '@/features/user/support/components/SupportRating'
import SupportRequestDetails from '@/features/user/support/components/SupportRequestDetails'
import SupportRequestForm from '@/features/user/support/components/SupportRequestForm'
import SupportRequestList from '@/features/user/support/components/SupportRequestList'
import SupportSearch from '@/features/user/support/components/SupportSearch'

/**
 * The Customer Service / Help Centre.
 *
 * A page rather than a modal, because the flow has real depth: browse, category,
 * issue, problem, solution, request, and then a history the user comes back to
 * later. A modal cannot be linked to, cannot be resized, and traps the header and
 * the history behind it.
 *
 * The flow's position is DERIVED from one `selection` object rather than tracked
 * as a step counter. That is what makes every level a real destination: the
 * breadcrumb, the back button and the deep-link-free reload all read the same
 * state, so there is no way to render "step 4 of 5" after the user has gone back
 * to step 2 and no way to reach a step whose prerequisite is missing.
 *
 * Requests and feedback go through supportApi, which owns the same `{ success,
 * data }` unwrapping and 401 refresh as everything else. Nothing here talks to
 * axios directly.
 */
export default function SupportPage() {
  const { pushToast } = useApp()

  const [search, setSearch] = useState('')
  const [view, setView] = useState('home')
  const [selection, setSelection] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)

  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState({ request: null, loading: false, error: null })

  const requests = useSupportRequests(() => getMyRequests({ limit: 20 }), [])

  // --- Flow navigation -----------------------------------------------------

  const browse = () => {
    setSearch('')
    setSelection(null)
    setSubmitted(null)
    setView('home')
  }

  const chooseIssue = (category, issue) => {
    setSelection({ category, issue, problem: null })
    setView('flow')
  }

  const chooseProblem = (category, issue, problem) => {
    setSelection({ category, issue, problem })
    setView('flow')
  }

  const chooseProblemInFlow = (problem) => {
    setSelection((current) => ({ ...current, problem }))
  }

  const backToCategory = () => {
    setSelection((current) => ({ ...current, issue: null, problem: null }))
  }

  // --- Submission ----------------------------------------------------------

  const handleSubmit = async (payload) => {
    setSubmitting(true)
    try {
      const request = await createRequest(payload)
      setSubmitted(request)
      setView('success')
      // The new ticket belongs at the top of the history below the
      // confirmation, so refetch rather than waiting for a navigation.
      requests.reload()
      pushToast(`Support request ${request.reference} submitted`)
    } catch (error) {
      pushToast(error.message, 'danger')
      // Rethrown so SupportRequestForm can clear its in-flight guard and let the
      // user press the button again — the submission state is owned here, the
      // guard is owned there.
      throw error
    } finally {
      setSubmitting(false)
    }
  }

  const handleRating = async (rating) => {
    try {
      await submitFeedback({ rating })
      pushToast('Thanks for the feedback')
    } catch (error) {
      pushToast(error.message, 'danger')
      throw error
    }
  }

  // --- Ticket detail -------------------------------------------------------

  const openDetail = async (id) => {
    setDetailId(id)
    setDetail({ request: null, loading: true, error: null })
    try {
      const request = await getRequest(id)
      setDetail({ request, loading: false, error: null })
    } catch (error) {
      setDetail({ request: null, loading: false, error })
    }
  }

  const reloadDetail = () => {
    if (detailId) openDetail(detailId)
  }

  const closeDetail = () => {
    setDetailId(null)
    setDetail({ request: null, loading: false, error: null })
  }

  return (
    <div>
      <PageHeader
        title="Customer Service"
        subtitle="Find answers, or send a request to our team."
      />

      {view === 'home' && (
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-base font-semibold text-ink">How can we help?</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              Search, or pick a topic below.
            </p>
            <div className="mt-4">
              <SupportSearch
                query={search}
                onChange={setSearch}
                onSelectProblem={chooseProblem}
              />
            </div>
          </Card>

          {search.trim().length === 0 && (
            <>
              <SupportCategoryGrid onSelectIssue={chooseIssue} />
              <ContactSupportCard onSelectIssue={chooseIssue} />
            </>
          )}

          <SupportRequestList
            requests={requests.data ?? { items: [], pagination: null }}
            loading={requests.loading}
            error={requests.error}
            onRetry={requests.reload}
            onSelect={openDetail}
            onBrowse={browse}
          />

          <SupportRating onSubmit={handleRating} />
        </div>
      )}

      {view === 'flow' && selection && (
        <SupportIssueFlow
          category={selection.category}
          issue={selection.issue}
          problem={selection.problem}
          onSelectIssue={(issue) =>
            setSelection((current) => ({ ...current, issue, problem: null }))
          }
          onSelectProblem={chooseProblemInFlow}
          onBackHome={browse}
          onBackToCategory={backToCategory}
          onStartRequest={() => setView('form')}
        />
      )}

      {view === 'form' && selection?.problem && (
        <SupportRequestForm
          category={selection.category}
          issue={selection.issue}
          problem={selection.problem}
          onSubmit={handleSubmit}
          onBack={() => setView('flow')}
          submitting={submitting}
        />
      )}

      {view === 'success' && submitted && (
        <SupportSuccess
          request={submitted}
          onViewTicket={() => openDetail(submitted.id)}
          onAnother={browse}
        />
      )}

      {detailId && (
        <SupportRequestDetails
          request={detail.request}
          loading={detail.loading}
          error={detail.error}
          onClose={closeDetail}
          onRetry={reloadDetail}
        />
      )}
    </div>
  )
}

/**
 * Post-submission confirmation.
 *
 * Restates exactly what was filed, from the same selections the request was built
 * from, so the user can see the ticket is complete before walking away — including
 * the fact that the optional description really was optional and the ticket was
 * accepted without one.
 */
function SupportSuccess({ request, onViewTicket, onAnother }) {
  const status = supportStatusMeta(request.status)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col items-center py-2 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-success-soft text-emerald-600">
            <CheckCircle2 className="size-6" strokeWidth={2} />
          </div>
          <h2 className="text-lg font-semibold text-ink">Request submitted</h2>
          <p className="mt-1 text-sm text-ink-muted">
            We've emailed you a confirmation. Quote this reference if you get in
            touch.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-3 py-1 font-mono text-sm font-semibold text-primary">
              {request.reference}
            </span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-border-subtle rounded-field border border-border-subtle bg-surface-soft/50">
          <SuccessRow label="Category" value={supportCategoryLabel(request.category)} />
          <SuccessRow label="Issue" value={issueLabel(request.category, request.issue)} />
          <SuccessRow
            label="Problem"
            value={problemLabel(request.category, request.issue, request.problem)}
          />
        </dl>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onAnother} icon={LifeBuoy}>
            Submit another request
          </Button>
          <Button onClick={onViewTicket} icon={Inbox}>
            View this ticket
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SuccessRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[13px] font-medium text-ink-muted sm:w-28">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}