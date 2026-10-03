import { useState } from 'react'
import { AreaChart as AreaIcon, BarChart3, CheckCircle2, Info, Sparkles, Users } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import AreaChart from '@/shared/components/charts/AreaChart'
import BarChart from '@/shared/components/charts/BarChart'
import SegmentedControl from '@/shared/components/ui/SegmentedControl'
import Toggle from '@/shared/components/ui/Toggle'
import { useApp } from '../../user/context/AppContext'
import useAdminData from '../hooks/useAdminData'
import { getOverview, getReports } from '../api/adminApi'
import SectionState from '../components/SectionState'
import StatCard from '../components/StatCard'

const WINDOWS = [
  { value: 3, label: '3m' },
  { value: 6, label: '6m' },
  { value: 12, label: '12m' },
]

const SERIES_META = {
  signups: { label: 'New signups', color: '#6366f1' },
  tasksCreated: { label: 'Tasks created', color: '#0ea5e9' },
  tasksCompleted: { label: 'Tasks completed', color: '#10b981' },
  projects: { label: 'Projects created', color: '#f59e0b' },
  aiRequests: { label: 'AI requests', color: '#8b5cf6' },
}

/**
 * Platform reporting over a selectable window.
 *
 * GET /api/admin/reports returns a { labels, series, rates } envelope, so this
 * page maps it straight onto the shared charts and adds nothing of its own. The
 * headline cards come from GET /api/admin/overview — the same call the dashboard
 * makes — so the totals on this page and the tiles on the dashboard are read from
 * one place and cannot drift apart.
 *
 * One honest caveat, shown on the page: completion rate is completed-in-month
 * divided by created-in-month. A task made in March and finished in April is
 * April's completion but March's creation, so in a month where a backlog gets
 * cleared the ratio passes 100%. The chart is not clamped - the bar is allowed
 * to be taller than the 100% tick, because quietly capping it would understate
 * exactly the months an admin is looking for.
 */
export default function AdminReports() {
  const { pushToast } = useApp()

  const [months, setMonths] = useState(12)
  const [hidden, setHidden] = useState(() => new Set())

  const reports = useAdminData(() => getReports(months), [months])
  const overview = useAdminData(() => getOverview(), [])

  const summary = overview.data
  const rates = reports.data?.rates?.[0]
  const series = (reports.data?.series ?? []).filter((entry) => !hidden.has(entry.key))

  const toggle = (key) => {
    setHidden((previous) => {
      const next = new Set(previous)
      // Never leave the chart with nothing on it.
      if (next.has(key) && next.size === (reports.data?.series?.length ?? 0) - 1) return previous
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const copySnapshot = () => {
    const rows = (reports.data?.series ?? []).map((entry) => {
      const total = entry.data.reduce((sum, value) => sum + value, 0)
      return `${SERIES_META[entry.key]?.label ?? entry.label}: ${total} over ${months} months`
    })
    const rateLine = rates ? `${SERIES_META.completionRate?.label ?? rates.label}: see chart` : ''
    navigator.clipboard
      ?.writeText([`Taskora report — last ${months} months`, ...rows, rateLine].join('\n'))
      .then(() => pushToast('Report summary copied'))
      .catch(() => pushToast('Could not copy to the clipboard', 'danger'))
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Platform volume over time, with the completion rate that goes with it."
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              options={WINDOWS}
              value={months}
              onChange={setMonths}
              size="sm"
              aria-label="Reporting window"
            />
            <button
              type="button"
              onClick={copySnapshot}
              className="h-9 cursor-pointer rounded-field border border-border-subtle bg-surface-card px-3.5 text-[13px] font-medium text-ink-soft shadow-card transition-colors hover:bg-surface-soft focus:outline-none focus:ring-4 focus:ring-primary/10"
            >
              Copy summary
            </button>
          </div>
        }
      />

      <SectionState
        loading={overview.loading}
        error={overview.error}
        onRetry={overview.reload}
        minHeight={140}
      >
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Total users" value={summary.totalUsers} icon={Users} />
            <StatCard
              label="Total tasks"
              value={summary.totalTasks}
              icon={CheckCircle2}
              tone="indigo"
              hint={`${summary.pendingTasks} still open`}
            />
            <StatCard
              label="Projects"
              value={summary.totalProjects}
              icon={BarChart3}
              tone="slate"
            />
            <StatCard
              label="AI requests"
              value={summary.aiRequests}
              icon={Sparkles}
              tone="success"
              hint={`${summary.aiRequestsToday} in the last 24h`}
            />
          </div>
        )}
      </SectionState>

      <Card className="mt-4">
        <CardHeader
          title="Volume over time"
          subtitle="Month by month. Toggle a series off to compare two of them."
        />

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {(reports.data?.series ?? []).map((entry) => {
            const meta = SERIES_META[entry.key] ?? { label: entry.label }
            const total = entry.data.reduce((sum, value) => sum + value, 0)
            return (
              <label
                key={entry.key}
                className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft"
              >
                <Toggle
                  checked={!hidden.has(entry.key)}
                  onChange={() => toggle(entry.key)}
                  label={meta.label}
                />
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span className="font-medium text-ink">{meta.label}</span>
                <span className="tabular-nums text-ink-faint">{total}</span>
              </label>
            )
          })}
        </div>

        <SectionState
          loading={reports.loading}
          error={reports.error}
          onRetry={reports.reload}
          minHeight={300}
        >
          {reports.data && (
            <AreaChart
              labels={reports.data.labels}
              series={series}
              height={300}
            />
          )}
        </SectionState>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Completion rate"
          subtitle="Tasks completed in the month as a share of tasks created in that month"
        />
        <SectionState
          loading={reports.loading}
          error={reports.error}
          onRetry={reports.reload}
          minHeight={260}
        >
          {rates && (
            <>
              <BarChart
                labels={reports.data.labels}
                series={[{ ...rates, label: 'Completion rate', data: rates.data }]}
                height={240}
              />
              <div className="mt-3 flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 flex-shrink-0 text-ink-faint" strokeWidth={2} />
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  These two counts come from different populations. A task created
                  in one month and finished in the next is counted as a completion
                  in the later month only, so a month where a backlog is cleared
                  can read above 100%. That is a real signal, not an error — it is
                  why the bar is not capped at the 100% line.
                </p>
              </div>
            </>
          )}
        </SectionState>
      </Card>

      <div className="mt-4 flex items-start gap-2.5 rounded-card border border-border-subtle bg-surface-soft p-4">
        <AreaIcon className="mt-0.5 size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Reports are read-only and derived from the same live data as the rest of
          the console, so these totals always agree with the dashboard. A task
          that counts here also appears in the tasks table; nothing on this page
          can change a user's data.
        </p>
      </div>
    </>
  )
}
