import PageHeader from '@/components/layout/PageHeader'
import CalendarGrid from '@/features/user/calendar/components/CalendarGrid'
import { useApp } from '@/app/providers/AppContext'

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