import PageHeader from '@/shared/components/layouts/PageHeader'
import CalendarGrid from '../components/CalendarGrid'
import { useApp } from '../../context/AppContext'

export default function CalendarPage() {
  const { data } = useApp()
  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="See every task on its due date"
      />
      <CalendarGrid tasks={data.tasks} project={data.projects} />
    </div>
  )
}