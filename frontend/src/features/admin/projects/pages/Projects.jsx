import { useState } from 'react'
import { FolderKanban, Search } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import useAdminData from '@/features/admin/hooks/useAdminData'
import useQueryParam from '@/features/admin/hooks/useQueryParam'
import { getProjects } from '@/features/admin/services/adminApi'
import Pagination from '@/features/admin/components/Pagination'
import ProjectsTable from '@/features/admin/components/ProjectsTable'
import SectionState from '@/features/admin/components/SectionState'
import StatCard from '@/features/admin/components/StatCard'
import TableToolbar from '@/features/admin/components/TableToolbar'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
]

const SORT_OPTIONS = [
  { value: 'updatedAt_desc', label: 'Recently updated' },
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'tasks_desc', label: 'Most tasks' },
]

/** System-wide project inspection. Read-only, for the same reason tasks are. */
export default function AdminProjects() {
  const [query, setQuery] = useQueryParam()
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState('updatedAt_desc')
  const [page, setPage] = useState(1)

  const projects = useAdminData(
    () => getProjects({ page, limit: PAGE_SIZE, q: query, status, sort }),
    [page, query, status, sort]
  )

  const pagination = projects.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page
  const pageRows = projects.data?.items ?? []

  const resetToFirstPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every project on Taskora, and who owns it. Read-only."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Matching projects" value={pagination?.total ?? 0} icon={FolderKanban} />
        <StatCard
          label="Active here"
          value={pageRows.filter((project) => project.status === 'ACTIVE').length}
          tone="success"
        />
        <StatCard
          label="Archived here"
          value={pageRows.filter((project) => project.status === 'ARCHIVED').length}
          tone="slate"
        />
        <StatCard
          label="Tasks here"
          value={pageRows.reduce((sum, project) => sum + project.tasks, 0)}
          tone="indigo"
        />
      </div>

      <Card>
        <TableToolbar
          search={{
            icon: Search,
            value: query,
            onChange: (event) => resetToFirstPage(setQuery)(event.target.value),
            placeholder: 'Search project or owner…',
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
              id: 'sort',
              label: 'Sort projects',
              value: sort,
              options: SORT_OPTIONS,
              onChange: (event) => resetToFirstPage(setSort)(event.target.value),
            },
          ]}
          resultCount={pagination?.total}
          noun="projects"
        />

        <SectionState
          loading={projects.loading}
          error={projects.error}
          onRetry={projects.reload}
          isEmpty={pageRows.length === 0}
          emptyIcon={FolderKanban}
          emptyTitle="No projects match"
          emptyDescription="Try a different search term or status filter."
          minHeight={280}
        >
          <ProjectsTable items={pageRows} />
        </SectionState>
      </Card>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="projects"
          onPage={setPage}
        />
      )}
    </>
  )
}
