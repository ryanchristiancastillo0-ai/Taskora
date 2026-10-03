import { ListChecks } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/shared/components/layouts/PageHeader'
import TaskFilters from '../components/TaskFilters'
import TaskFormModal from '../components/TaskFormModal'
import TaskList from '../components/TaskList'
import Button from '@/shared/components/ui/Button'
import EmptyStateModal from '@/shared/components/ui/EmptyStateModal'
import { useApp } from '../../context/AppContext'
import { sortTasks } from '@/shared/utils/format'

export default function Tasks() {
  const { data } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectParam = searchParams.get('project') ?? ''
  const taskParam = searchParams.get('task') ?? ''
  const taskIdParam = searchParams.get('taskId') ?? ''
  const [filters, setFilters] = useState({
    status: 'ALL',
    projectId: projectParam,
    priority: '',
    search: taskParam,
    sort: 'dueDate',
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [emptyDismissed, setEmptyDismissed] = useState(false)

  useEffect(() => {
    setFilters((current) => ({ ...current, projectId: projectParam }))
  }, [projectParam])

  useEffect(() => {
    setFilters((current) => ({ ...current, search: taskParam }))
  }, [taskParam])

  useEffect(() => {
    if (!taskIdParam) return
    const found = data.tasks.find((task) => task.id === taskIdParam) || null
    setEditing(found)
  }, [taskIdParam, data.tasks])

  const closeTaskModal = () => {
    setModalOpen(false)
    setEditing(null)
    if (taskIdParam) {
      const next = new URLSearchParams(searchParams)
      next.delete('taskId')
      setSearchParams(next, { replace: true })
    }
  }

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    return data.tasks
      .filter((task) => {
        if (filters.status !== 'ALL' && task.status !== filters.status) return false
        if (filters.projectId && task.projectId !== filters.projectId) return false
        if (filters.priority && task.priority !== filters.priority) return false
        if (
          query &&
          !task.title.toLowerCase().includes(query) &&
          !task.description.toLowerCase().includes(query)
        )
          return false
        return true
      })
      .sort((a, b) => sortTasks(a, b, filters.sort))
  }, [data.tasks, filters])

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'} shown`}
        actions={
          <Button onClick={openNew}>New task</Button>
        }
      />

      <TaskFilters filters={filters} onChange={setFilters} />

      <TaskList
        tasks={filtered}
        onEdit={setEditing}
        emptyTitle="No tasks match your filters"
        emptyDescription="Try adjusting the filters or create a new task."
      />

      <EmptyStateModal
        open={data.tasks.length === 0 && !emptyDismissed}
        onClose={() => setEmptyDismissed(true)}
        icon={ListChecks}
        title="No tasks yet"
        description="You have no tasks yet. Click the button below to create your first task and start getting things done."
        actionLabel="New task"
        onAction={() => {
          setEmptyDismissed(true)
          openNew()
        }}
      />

      <TaskFormModal open={modalOpen || !!editing} onClose={closeTaskModal} task={editing} />
    </div>
  )
}