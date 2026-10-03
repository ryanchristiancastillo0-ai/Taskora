import { useMemo, useState } from 'react'
import { ListChecks, Search } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Card from '@/shared/components/ui/Card'
import useAdminData from '../hooks/useAdminData'
import useQueryParam from '../hooks/useQueryParam'
import { getTasks } from '../api/adminApi'
import { isOverdue } from '@/shared/utils/format'
import Pagination from '../components/Pagination'
import SectionState from '../components/SectionState'
import StatCard from '../components/StatCard'
import TableToolbar from '../components/TableToolbar'
import TasksTable from '../components/TasksTable'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PRIORITY_OPTIONS = [
  { value: 'ALL', label: 'All priorities' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
  { value: 'dueDate_asc', label: 'Due soonest' },
  { value: 'priority_desc', label: 'Highest priority' },
]

/**
 * System-wide task inspection.
 *
 * Read-only, and the header says so. An admin looking at this page is answering
 * "what is going on across the platform", not "let me edit 200 strangers'
 * homework" — and every edit path here would bypass the owner's own validation
 * and undo. Filtering and search are the point of the page.
 */
export default function AdminTasks() {
  const [query, setQuery] = useQueryParam()
  const [status, setStatus] = useState('ALL')
  const [priority, setPriority] = useState('ALL')
  const [overdue, setOverdue] = useState('false')
  const [sort, setSort] = useState('createdAt_desc')
  const [page, setPage] = useState(1)

  const tasks = useAdminData(
    () => getTasks({ page, limit: PAGE_SIZE, q: query, status, priority, overdue, sort }),
    [page, query, status, priority, overdue, sort]
  )

  const pagination = tasks.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  // Counts come from the current page rather than a second request. A per-filter
  // total from the server would be more correct, but a card reading "3 tasks"
  // next to ten visible rows is a worse lie than a card that says what it is.
  const rows = tasks.data?.items
  // `?? []` inline would hand the memos below a brand new array on every render,
  // which defeats them and re-reads the clock each time. Keying off the fetched
  // array keeps the identity stable for as long as the response is unchanged.
  const pageRows = useMemo(() => rows ?? [], [rows])

  // isOverdue reads the clock, so the counts settle once per response instead of
  // drifting on every re-render, which would make the numbers change while an
  // admin is reading the table.
  const pageCompleted = useMemo(
    () => pageRows.filter((task) => task.status === 'COMPLETED').length,
    [pageRows]
  )
  const pageOverdue = useMemo(
    () => pageRows.filter((task) => isOverdue(task)).length,
    [pageRows]
  )

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Every task across the platform. Read-only — owners manage their own tasks."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Matching tasks" value={pagination?.total ?? 0} icon={ListChecks} />
        <StatCard
          label="On this page"
          value={pageRows.length}
          tone="indigo"
          hint="Of the current filter"
        />
        <StatCard
          label="Completed here"
          value={pageCompleted}
          tone="success"
        />
        <StatCard label="Overdue here" value={pageOverdue} tone="danger" />
      </div>

      <Card padding={false} className="p-4 sm:p-5">
        <TableToolbar
          search={{
            icon: Search,
            value: query,
            onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
            placeholder: 'Search task or owner…',
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
              id: 'priority',
              label: 'Filter by priority',
              value: priority,
              options: PRIORITY_OPTIONS,
              onChange: (event) => resetToFirstPage(setPriority)(event.target.value),
            },
            {
              id: 'overdue',
              label: 'Filter by overdue',
              value: overdue,
              options: [
                { value: 'false', label: 'Any due date' },
                { value: 'true', label: 'Overdue only' },
              ],
              onChange: (event) => resetToFirstPage(setOverdue)(event.target.value),
            },
            {
              id: 'sort',
              label: 'Sort tasks',
              value: sort,
              options: SORT_OPTIONS,
              onChange: (event) => resetToFirstPage(setSort)(event.target.value),
            },
          ]}
          resultCount={pagination?.total}
          noun="tasks"
        />

        <SectionState
          loading={tasks.loading}
          error={tasks.error}
          onRetry={tasks.reload}
          isEmpty={pageRows.length === 0}
          emptyIcon={ListChecks}
          emptyTitle="No tasks match"
          emptyDescription="Try a different search term or loosen the filters."
          minHeight={280}
        >
          <TasksTable items={pageRows} />
        </SectionState>
      </Card>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="tasks"
          onPage={setPage}
        />
      )}
    </>
  )
}
