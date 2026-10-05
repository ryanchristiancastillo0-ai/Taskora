import { useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card, { CardHeader } from '@/components/ui/Card'
import DataTable from '@/components/ui/DataTable'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Avatar from '@/components/ui/Avatar'
import AreaChart from '@/components/charts/AreaChart'
import BarChart from '@/components/charts/BarChart'
import DonutChart from '@/components/charts/DonutChart'
import { ACCOUNT_STATUS } from '@/constants'
import { formatDate } from '@/utils/format'
import useAdminData from '@/features/admin/hooks/useAdminData'
import {
  getActivity,
  getGrowth,
  getOverview,
  getTaskMix,
  getUsers,
  getWeekly,
} from '@/features/admin/services/adminApi'
import ActivityFeed from '@/features/admin/components/ActivityFeed'
// AdminAiWidget is deliberately NOT mounted here. It used to be, and that is
// what made an in-flight answer disappear: navigating to /admin/users unmounted
// the widget and threw away the pending request. It is mounted once in AppShell
// instead, so the launcher follows the admin across every console page and the
// thread survives navigation.
import SectionState from '@/features/admin/components/SectionState'
import StatCard from '@/features/admin/components/StatCard'

const RANGES = [
  { value: 6, label: '6m' },
  { value: 12, label: '12m' },
]

/**
 * The admin overview.
 *
 * Composition rather than logic: every number and every series is fetched through
 * useAdminData, and the charts are the shared ones the user dashboard already
 * uses, so a change to the chart skin or the card tokens lands on both.
 *
 * The nine routes of the console are represented here as summary cards and
 * previews; the detail lives on the pages themselves. Recent Users is a
 * deliberately short preview, not the full table — the users page owns filtering,
 * sorting and pagination, and duplicating that toolbar on the dashboard would
 * give an admin two different places to look for the same account.
 */
export default function AdminDashboard() {
  const [months, setMonths] = useState(12)

  const overview = useAdminData(() => getOverview(), [])
  const growth = useAdminData(() => getGrowth(months), [months])
  const taskMix = useAdminData(() => getTaskMix(), [])
  const weekly = useAdminData(() => getWeekly(), [])
  const activity = useAdminData(() => getActivity(), [])
  const recentUsers = useAdminData(() => getUsers({ limit: 5, sort: 'joinedAt_desc' }), [])

  const stats = overview.data

  const recentUserColumns = useMemo(
    () => [
      {
        key: 'user',
        label: 'User',
        render: (user) => (
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (user) => {
          const meta = ACCOUNT_STATUS[user.status] || ACCOUNT_STATUS.ACTIVE
          return <Badge tone={meta.tone}>{meta.label}</Badge>
        },
      },
      {
        key: 'joined',
        label: 'Joined',
        render: (user) => (
          <span className="whitespace-nowrap text-ink-muted">{formatDate(user.joinedAt)}</span>
        ),
      },
    ],
    []
  )

  return (
    <>
      <PageHeader
        title="Admin dashboard"
        subtitle="Platform-wide health, activity and usage at a glance."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              overview.reload()
              growth.reload()
              taskMix.reload()
              weekly.reload()
              activity.reload()
              recentUsers.reload()
            }}
          >
            Refresh
          </Button>
        }
      />

      <SectionState
        loading={overview.loading}
        error={overview.error}
        onRetry={overview.reload}
        minHeight={140}
      >
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                label="Total users"
                value={stats.totalUsers}
                icon={Users}
                hint={`${stats.newThisMonth} new in the last 30 days`}
              />
              <StatCard
                label="Active users"
                value={stats.activeUsers}
                icon={TrendingUp}
                tone="success"
                hint="Refreshed a token in 30 days"
              />
              <StatCard
                label="Total tasks"
                value={stats.totalTasks}
                icon={ListChecks}
                tone="indigo"
                hint={`${stats.completionRate}% completion rate`}
              />
              <StatCard
                label="AI requests"
                value={stats.aiRequests}
                icon={Sparkles}
                tone="slate"
                hint={`${stats.aiRequestsToday} in the last 24h`}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 sm:mt-4">
              <StatCard
                label="Completed tasks"
                value={stats.completedTasks}
                icon={CheckCircle2}
                tone="success"
              />
              <StatCard
                label="Pending tasks"
                value={stats.pendingTasks}
                icon={ListChecks}
                tone="amber"
              />
              <StatCard
                label="Overdue tasks"
                value={stats.overdueTasks}
                icon={TriangleAlert}
                tone="danger"
                hint="Open with a past due date"
              />
              <StatCard
                label="Projects"
                value={stats.totalProjects}
                icon={FolderKanban}
                tone="indigo"
                hint={stats.suspendedUsers > 0 ? `${stats.suspendedUsers} suspended` : undefined}
              />
            </div>
          </>
        )}
      </SectionState>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Growth"
            subtitle="New signups and task volume per month"
            actions={
              <SegmentedControl
                options={RANGES}
                value={months}
                onChange={setMonths}
                size="sm"
              />
            }
          />
          <SectionState
            loading={growth.loading}
            error={growth.error}
            onRetry={growth.reload}
            minHeight={280}
          >
            {growth.data && (
              <AreaChart
                labels={growth.data.labels}
                series={growth.data.series}
                height={260}
              />
            )}
          </SectionState>
        </Card>

        <Card>
          <CardHeader title="Task mix" subtitle="Every task by status" />
          <SectionState
            loading={taskMix.loading}
            error={taskMix.error}
            onRetry={taskMix.reload}
            minHeight={260}
          >
            {taskMix.data && <DonutChart data={taskMix.data} totalLabel="Tasks" />}
          </SectionState>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="This week" subtitle="Tasks created and completed by day" />
          <SectionState
            loading={weekly.loading}
            error={weekly.error}
            onRetry={weekly.reload}
            minHeight={240}
          >
            {weekly.data && (
              <BarChart labels={weekly.data.labels} series={weekly.data.series} />
            )}
          </SectionState>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="Newest signups and completions"
          />
          <ActivityFeed
            items={activity.data}
            loading={activity.loading}
            error={activity.error}
            onRetry={activity.reload}
          />
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Recent users"
          subtitle="The five newest accounts"
          icon={Activity}
        />
        <SectionState
          loading={recentUsers.loading}
          error={recentUsers.error}
          onRetry={recentUsers.reload}
          isEmpty={(recentUsers.data?.items?.length ?? 0) === 0}
          emptyIcon={Users}
          emptyTitle="No users yet"
          emptyDescription="New accounts will appear here as people sign up."
          minHeight={200}
        >
          {recentUsers.data && (
            <DataTable
              columns={recentUserColumns}
              items={recentUsers.data.items}
              getRowId={(user) => user.id}
            />
          )}
        </SectionState>
      </Card>
    </>
  )
}
