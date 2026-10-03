import { useState } from 'react'
import { Bell, Inbox, Search } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import BarChart from '@/shared/components/charts/BarChart'
import useAdminData from '../hooks/useAdminData'
import { getNotifications } from '../api/adminApi'
import { NOTIFICATION_TYPES } from '@/shared/constants'
import NotificationsTable from '../components/NotificationsTable'
import Pagination from '../components/Pagination'
import SectionState from '../components/SectionState'
import StatCard from '../components/StatCard'
import TableToolbar from '../components/TableToolbar'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'UNREAD', label: 'Unread' },
  { value: 'READ', label: 'Read' },
]

const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

/**
 * System notification overview.
 *
 * Read-only by design. This page reports on the notification pipeline; it does
 * not send anything, because sending goes through NotificationService and the
 * email queue, and bolting a broadcast onto a GET is the kind of side effect
 * that gets triggered twice by a refresh. A send endpoint would be its own
 * resource with its own confirmation.
 */
export default function AdminNotifications() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [days, setDays] = useState('30')
  const [page, setPage] = useState(1)

  const notifications = useAdminData(
    () => getNotifications({ page, limit: PAGE_SIZE, q: query, type, status, days }),
    [page, query, type, status, days]
  )

  const summary = notifications.data?.summary
  const pagination = notifications.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const typeOptions = [
    { value: 'ALL', label: 'All types' },
    ...Object.entries(NOTIFICATION_TYPES).map(([value, meta]) => ({
      value,
      label: meta.label,
    })),
  ]

  const typeChart = (summary?.byType ?? []).map((entry) => ({
    label: NOTIFICATION_TYPES[entry.type]?.label ?? entry.type,
    value: entry.count,
  }))

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="What Taskora has sent, to whom, and whether it was read."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Sent in window"
          value={summary?.total ?? 0}
          icon={Bell}
          hint={WINDOW_OPTIONS.find((option) => option.value === days)?.label}
        />
        <StatCard
          label="Still unread"
          value={summary?.unread ?? 0}
          tone="amber"
          hint="Across all recipients"
        />
        <StatCard
          label="Read rate"
          value={`${summary?.readRate ?? 0}%`}
          tone="success"
          hint="Share that have been opened"
        />
      </div>

      <Card className="mb-4">
        <CardHeader title="Volume by type" subtitle="Notifications generated in the window" />
        <SectionState
          loading={notifications.loading}
          error={notifications.error}
          onRetry={notifications.reload}
          isEmpty={typeChart.length === 0}
          emptyIcon={Inbox}
          emptyTitle="Nothing sent yet"
          emptyDescription="Notifications will appear here once Taskora sends some."
          minHeight={200}
        >
          <BarChart
            labels={typeChart.map((entry) => entry.label)}
            series={[{ key: 'sent', label: 'Sent', data: typeChart.map((entry) => entry.value) }]}
            height={220}
          />
        </SectionState>
      </Card>

      <Card>
        <TableToolbar
          search={{
            icon: Search,
            value: query,
            onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
            placeholder: 'Search notification or recipient…',
          }}
          filters={[
            {
              id: 'type',
              label: 'Filter by type',
              value: type,
              options: typeOptions,
              onChange: (event) => resetToFirstPage(setType)(event.target.value),
            },
            {
              id: 'status',
              label: 'Filter by read state',
              value: status,
              options: STATUS_OPTIONS,
              onChange: (event) => resetToFirstPage(setStatus)(event.target.value),
            },
            {
              id: 'days',
              label: 'Reporting window',
              value: days,
              options: WINDOW_OPTIONS,
              onChange: (event) => resetToFirstPage(setDays)(event.target.value),
            },
          ]}
          resultCount={pagination?.total}
          noun="notifications"
        />

        <SectionState
          loading={notifications.loading}
          error={notifications.error}
          onRetry={notifications.reload}
          isEmpty={(notifications.data?.items?.length ?? 0) === 0}
          emptyIcon={Inbox}
          emptyTitle="No notifications match"
          emptyDescription="Try a different search term or filter."
          minHeight={280}
        >
          {notifications.data && <NotificationsTable items={notifications.data.items} />}
        </SectionState>
      </Card>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="notifications"
          onPage={setPage}
        />
      )}
    </>
  )
}
