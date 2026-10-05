import { useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import useAdminData from '@/features/admin/hooks/useAdminData'
import useQueryParam from '@/features/admin/hooks/useQueryParam'
import { getAuditLogs } from '@/features/admin/services/adminApi'
import Pagination from '@/features/admin/components/Pagination'
import SectionState from '@/features/admin/components/SectionState'
import TableToolbar from '@/features/admin/components/TableToolbar'
import AuditLogsTable from '@/features/admin/components/AuditLogsTable'
import AuditLogDetailModal from '@/features/admin/components/AuditLogDetailModal'
import { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_SORT_OPTIONS } from '@/constants'

const PAGE_SIZE = 20

const DAY_MS = 24 * 60 * 60 * 1000

// "All time" leads rather than trailing, unlike the reporting windows on
// /admin/notifications and /admin/ai-usage. Those default to a recent period
// because the charts behind them are about current activity; an audit trail is
// read while investigating something that happened at an unknown time, so
// narrowing it on load would hide the event being looked for.
const WINDOW_OPTIONS = [
  { value: 'ALL', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

// The values are the raw stored strings, because that is what the `action` and
// `entity` columns contain and therefore what the API filters on. Using the
// display labels here would produce a filter that matches nothing.
const ACTION_OPTIONS = [
  { value: 'ALL', label: 'All actions' },
  ...Object.entries(AUDIT_ACTIONS).map(([value, meta]) => ({ value, label: meta.label })),
]

const ENTITY_OPTIONS = [
  { value: 'ALL', label: 'All entities' },
  ...AUDIT_ENTITIES.map((value) => ({ value, label: value })),
]

/**
 * Turns the window select into the explicit instants the endpoint takes.
 *
 * `clean()` in adminApi drops the pair entirely for "All time", so no bound is
 * sent rather than sending an epoch — which would technically also work but
 * would put a meaningless timestamp in the query string.
 */
function windowRange(value) {
  if (value === 'ALL') return {}
  return { from: new Date(Date.now() - Number(value) * DAY_MS).toISOString() }
}

/**
 * The audit trail.
 *
 * Read-only, like the notifications and reports pages beside it: this console
 * observes, it does not administer its own log. The endpoint has no write, edit or
 * delete route, so nothing rendered here can alter the record — including this
 * page, which has no mutation of any kind to offer.
 *
 * Every filter is server-side. An audit table is the one admin list whose volume
 * is driven by how many people use the product rather than how many objects they
 * own, so it is the list most likely to outgrow a page of rows; fetching it all
 * and filtering in the browser would be the wrong default here in a way it is not
 * for /admin/users. Search matches the action, the entity, the target id and the
 * actor's name or address, word by word.
 */
export default function AdminAuditLogs() {
  const [query, setQuery] = useQueryParam()
  const [action, setAction] = useState('ALL')
  const [entity, setEntity] = useState('ALL')
  const [timeWindow, setTimeWindow] = useState('ALL')
  const [sort, setSort] = useState('createdAt_desc')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)

  const logs = useAdminData(
    () =>
      getAuditLogs({
        page,
        limit: PAGE_SIZE,
        q: query,
        // 'ALL' is a UI sentinel, not a filter value; sending it would be
        // filtered by the API as an action literally named ALL.
        action: action === 'ALL' ? undefined : action,
        entity: entity === 'ALL' ? undefined : entity,
        sort,
        ...windowRange(timeWindow),
      }),
    [page, query, action, entity, timeWindow, sort]
  )

  // A filter change can shrink the result set under the current page, which would
  // otherwise leave the table blank on page 3 of 1.
  const pagination = logs.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const filtered = query || action !== 'ALL' || entity !== 'ALL' || timeWindow !== 'ALL'

  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Every sign-in and administrative action recorded on Taskora, newest first."
      />

      <TableToolbar
        search={{
          icon: Search,
          value: query,
          onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
          placeholder: 'Search action, target or person…',
        }}
        filters={[
          {
            id: 'action',
            label: 'Filter by action',
            value: action,
            options: ACTION_OPTIONS,
            onChange: (event) => resetToFirstPage(setAction)(event.target.value),
          },
          {
            id: 'entity',
            label: 'Filter by entity',
            value: entity,
            options: ENTITY_OPTIONS,
            onChange: (event) => resetToFirstPage(setEntity)(event.target.value),
          },
          {
            id: 'window',
            label: 'Time window',
            value: timeWindow,
            options: WINDOW_OPTIONS,
            onChange: (event) => resetToFirstPage(setTimeWindow)(event.target.value),
          },
          {
            id: 'sort',
            label: 'Sort events',
            value: sort,
            options: AUDIT_SORT_OPTIONS,
            onChange: (event) => resetToFirstPage(setSort)(event.target.value),
          },
        ]}
        resultCount={pagination?.total}
        noun="events"
      />

      <SectionState
        loading={logs.loading}
        error={logs.error}
        onRetry={logs.reload}
        isEmpty={(logs.data?.items?.length ?? 0) === 0}
        emptyIcon={ScrollText}
        emptyTitle={filtered ? 'No events match' : 'Nothing recorded yet'}
        emptyDescription={
          filtered
            ? 'Try a different search term, action, entity or time window.'
            : 'Sign-ins and administrative actions will appear here as they happen.'
        }
        minHeight={280}
      >
        {logs.data && <AuditLogsTable items={logs.data.items} onView={setDetail} />}
      </SectionState>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="events"
          onPage={setPage}
        />
      )}

      {detail && <AuditLogDetailModal log={detail} onClose={() => setDetail(null)} />}
    </>
  )
}