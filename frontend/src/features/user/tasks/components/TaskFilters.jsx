import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PRIORITY_ORDER } from '@/shared/constants/index'
import SearchSuggest from '@/shared/components/ui/SearchSuggest'
import Select from '@/shared/components/ui/Select'
import SegmentedControl from '@/shared/components/ui/SegmentedControl'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'

const statusOptions = [
  { value: 'ALL', label: 'All' },
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Done' },
]

const sortOptions = [
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'created', label: 'Newest' },
]

export default function TaskFilters({ filters, onChange, compact = false }) {
  const { data } = useApp()
  const [search, setSearch] = useState(filters.search || '')
  const debouncedSearch = useDebouncedValue(search, 300)

  useEffect(() => {
    setSearch(filters.search || '')
  }, [filters.search])

  useEffect(() => {
    if (debouncedSearch === (filters.search || '')) return
    onChange({ ...filters, search: debouncedSearch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  return (
    <div className="flex flex-col gap-3">
      <SearchSuggest
        value={search}
        onChange={setSearch}
        placeholder="Search tasks..."
        inputClassName="border-border-subtle bg-surface-card focus:border-primary"
      />
      {!compact && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SegmentedControl
            options={statusOptions}
            value={filters.status || 'ALL'}
            onChange={(status) => onChange({ ...filters, status })}
          />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              className="col-span-2 sm:col-span-1"
              aria-label="Filter by project"
              value={filters.projectId}
              onChange={(event) =>
                onChange({ ...filters, projectId: event.target.value || '' })
              }
            >
              <option value="">All projects</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Select
              className="w-full lg:w-40"
              aria-label="Filter by priority"
              value={filters.priority}
              onChange={(event) =>
                onChange({ ...filters, priority: event.target.value || '' })
              }
            >
              <option value="">All priorities</option>
              {PRIORITY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {KEY_LABEL[key]}
                </option>
              ))}
            </Select>
            <Select
              className="w-full lg:w-40"
              aria-label="Sort tasks"
              value={filters.sort}
              onChange={(event) => onChange({ ...filters, sort: event.target.value })}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}

const KEY_LABEL = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}