import { useState } from 'react'
import { CheckCircle2, Inbox, LifeBuoy, Search, Star, Timer } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useApp } from '@/app/providers/AppContext'
import useAdminData from '@/features/admin/hooks/useAdminData'
import useQueryParam from '@/features/admin/hooks/useQueryParam'
import {
  getSupportRequest,
  getSupportRequests,
  getSupportSummary,
  updateSupportRequest,
} from '@/features/admin/services/adminApi'
import Pagination from '@/features/admin/components/Pagination'
import SectionState from '@/features/admin/components/SectionState'
import StatCard from '@/features/admin/components/StatCard'
import SupportDetailModal from '@/features/admin/components/SupportDetailModal'
import SupportRequestsTable from '@/features/admin/components/SupportRequestsTable'
import TableToolbar from '@/features/admin/components/TableToolbar'
import { SUPPORT_CATEGORIES } from '@/features/user/support/supportContent'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

// "All categories" plus one entry per bucket, built from the same tree the
// user's guided flow renders. The bucket id is the value the API filters on, so
// this cannot drift from what a real ticket carries.
const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'All categories' },
  ...SUPPORT_CATEGORIES.map((category) => ({ value: category.id, label: category.label })),
]

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
  { value: 'ticketNumber_desc', label: 'Reference Z–A' },
  { value: 'status_asc', label: 'Status' },
]

/**
 * Support triage.
 *
 * Built from the same parts as the rest of the console — SectionState for the
 * three list states, TableToolbar for search and filters, Pagination, StatCard,
 * the shared DataTable — so it reads as one more page of the admin app rather
 * than a separate tool. Nothing about the console's shell, guards or visual
 * system changed to accommodate it.
 *
 * Authorization is not implemented here. Every endpoint behind this page is
 * already behind authMiddleware + adminGuard on the server, and an ordinary
 * account gets a 403 rendered as this page's own error state. The client-side
 * RequireAdmin gate in app/App.jsx is a rendering guard only; the real boundary
 * is the backend.
 *
 * The category filter is sent only when it is not the "ALL" sentinel, and status
 * likewise — adminApi strips both before the request so the query string never
 * asks the API for rows whose category is literally the word ALL.
 */
export default function AdminSupport() {
  const { pushToast } = useApp()

  const [query, setQuery] = useQueryParam()
  const [status, setStatus] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [sort, setSort] = useState('createdAt_desc')
  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)

  const summary = useAdminData(() => getSupportSummary(), [])

  const requests = useAdminData(
    () => getSupportRequests({ page, limit: PAGE_SIZE, q: query, status, category, sort }),
    [page, query, status, category, sort]
  )

  // A filter that shrinks the result set can leave the current page past the end,
  // which renders as an empty table on page 3 of 1.
  const pagination = requests.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const openDetail = async (request) => {
    try {
      setDetail(await getSupportRequest(request.id))
    } catch (error) {
      pushToast(error.message, 'danger')
    }
  }

  const saveDetail = async (patch) => {
    setSaving(true)
    try {
      const updated = await updateSupportRequest(detail.id, patch)
      setDetail(updated)
      // The table and the open modal each hold their own copy of this row, so
      // both are refetched rather than trusting one to reflect the other. The
      // counts on the summary cards shift too when a status changes.
      requests.reload()
      summary.reload()
      pushToast(`${updated.reference} updated`)
    } catch (error) {
      pushToast(error.message, 'danger')
    } finally {
      setSaving(false)
    }
  }

  const counts = summary.data?.requests
  const rating = summary.data?.rating

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Every request filed from the in-app help centre."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={counts?.open ?? '—'}
          icon={Inbox}
          tone="amber"
          hint="Waiting for a first response"
        />
        <StatCard
          label="In progress"
          value={counts?.inProgress ?? '—'}
          icon={Timer}
          tone="indigo"
          hint="Picked up by the team"
        />
        <StatCard
          label="Resolved"
          value={counts?.resolved ?? '—'}
          icon={CheckCircle2}
          tone="success"
          hint="Answered and closed out"
        />
        <StatCard
          label="Help centre rating"
          value={rating?.count ? `${rating.average} / 5` : '—'}
          icon={Star}
          tone="slate"
          hint={rating?.count ? `${rating.count} ratings` : 'No ratings yet'}
        />
      </div>

      <TableToolbar
        search={{
          icon: Search,
          value: query,
          onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
          placeholder: 'Search reference, name, email or topic…',
        }}
        filters={[
          {
            id: 'status',
            label: 'Filter by status',
            value: status,
            options: STATUS_OPTIONS,
            onChange: (event) => resetToFirstPage(setStatus)(event.target.value),
          },
          {
            id: 'category',
            label: 'Filter by category',
            value: category,
            options: CATEGORY_OPTIONS,
            onChange: (event) => resetToFirstPage(setCategory)(event.target.value),
          },
          {
            id: 'sort',
            label: 'Sort requests',
            value: sort,
            options: SORT_OPTIONS,
            onChange: (event) => resetToFirstPage(setSort)(event.target.value),
          },
        ]}
        resultCount={pagination?.total}
        noun="requests"
      />

      <SectionState
        loading={requests.loading}
        error={requests.error}
        onRetry={requests.reload}
        isEmpty={(requests.data?.items?.length ?? 0) === 0}
        emptyIcon={LifeBuoy}
        emptyTitle="No requests match"
        emptyDescription="Try a different search term, status or category filter."
        minHeight={280}
      >
        {requests.data && (
          <SupportRequestsTable items={requests.data.items} onView={openDetail} />
        )}
      </SectionState>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="requests"
          onPage={setPage}
        />
      )}

      {detail && (
        <SupportDetailModal
          request={detail}
          onClose={() => setDetail(null)}
          onSave={saveDetail}
          saving={saving}
        />
      )}
    </>
  )
}