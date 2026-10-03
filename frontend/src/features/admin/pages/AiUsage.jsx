import { useState } from 'react'
import { Info, Sparkles } from 'lucide-react'
import PageHeader from '@/shared/components/layouts/PageHeader'
import Card, { CardHeader } from '@/shared/components/ui/Card'
import Select from '@/shared/components/ui/Select'
import DonutChart from '@/shared/components/charts/DonutChart'
import useAdminData from '../hooks/useAdminData'
import { getAiUsage } from '../api/adminApi'
import AiUsageTable from '../components/AiUsageTable'
import Pagination from '../components/Pagination'
import SectionState from '../components/SectionState'
import StatCard from '../components/StatCard'
import TableToolbar from '../components/TableToolbar'

const PAGE_SIZE = 10

const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const PROVIDER_OPTIONS = [
  { value: 'ALL', label: 'All providers' },
  { value: 'GEMINI', label: 'Gemini' },
  { value: 'OPENROUTER', label: 'OpenRouter' },
]

/**
 * AI usage monitoring.
 *
 * There is deliberately no success/failure card and no latency or token
 * figure. AIMessage records a conversation, a role and a body — not an outcome,
 * a duration or a token count — so those numbers cannot be derived, and a card
 * showing a permanently 100% success rate would be actively misleading. The
 * banner says so on the page rather than leaving an admin to wonder where the
 * error rate went.
 *
 * Provider split is real: PersonalizationProfile.aiProvider is the account's
 * configured provider, and accounts with no profile are counted as Gemini,
 * which is the schema default.
 */
export default function AdminAiUsage() {
  const [days, setDays] = useState('30')
  const [provider, setProvider] = useState('ALL')
  const [page, setPage] = useState(1)

  const usage = useAdminData(
    () => getAiUsage({ days, provider, page, limit: PAGE_SIZE }),
    [days, provider, page]
  )

  const summary = usage.data?.summary
  const pagination = usage.data?.pagination
  const safePage = pagination ? Math.min(page, Math.max(pagination.totalPages, 1)) : page

  // byProvider is optional-chained rather than assumed: the summary cards below
  // already use ?. for every field, and a donut that throws because one key is
  // missing would take the whole page down for a number that can default to 0.
  const providerData = summary
    ? [
        { label: 'Gemini', value: summary.byProvider?.GEMINI ?? 0 },
        { label: 'OpenRouter', value: summary.byProvider?.OPENROUTER ?? 0 },
      ]
    : []

  return (
    <>
      <PageHeader
        title="AI usage"
        subtitle="Completed AI requests across the platform, by user and provider."
        actions={
          <Select
            value={days}
            onChange={(event) => {
              setDays(event.target.value)
              setPage(1)
            }}
            aria-label="Reporting window"
            className="w-44"
          >
            {WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-card border border-border-subtle bg-surface-soft p-4">
        <Info className="mt-0.5 size-4 flex-shrink-0 text-ink-faint" strokeWidth={2} />
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Every figure below counts persisted assistant replies, which is one
          completed request. Taskora does not currently record whether a request
          failed, how long it took, or how many tokens it used, so this page
          reports volume rather than performance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Requests in window"
          value={summary?.totalReplies ?? 0}
          icon={Sparkles}
          hint={`${summary?.repliesToday ?? 0} in the last 24h`}
        />
        <StatCard
          label="This month"
          value={summary?.repliesThisMonth ?? 0}
          tone="indigo"
          hint="Calendar month to date"
        />
        <StatCard
          label="Conversations"
          value={summary?.conversations ?? 0}
          tone="slate"
          hint="Threads with at least one reply"
        />
        <StatCard
          label="Users using AI"
          value={summary?.activeUsers ?? 0}
          tone="success"
          hint="Distinct accounts in window"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Requests"
            subtitle={`Newest first · ${WINDOW_OPTIONS.find((o) => o.value === days)?.label.toLowerCase()}`}
          />
          <TableToolbar
            filters={[
              {
                id: 'provider',
                label: 'Filter by provider',
                value: provider,
                options: PROVIDER_OPTIONS,
                onChange: (event) => {
                  setProvider(event.target.value)
                  setPage(1)
                },
              },
            ]}
            resultCount={pagination?.total}
            noun="requests"
          />
          <SectionState
            loading={usage.loading}
            error={usage.error}
            onRetry={usage.reload}
            isEmpty={(usage.data?.items?.length ?? 0) === 0}
            emptyIcon={Sparkles}
            emptyTitle="No AI requests"
            emptyDescription="Nobody has used the assistant in this window."
            minHeight={280}
          >
            {usage.data && <AiUsageTable items={usage.data.items} />}
          </SectionState>
        </Card>

        <Card>
          <CardHeader title="Provider split" subtitle="By configured account provider" />
          <SectionState
            loading={usage.loading}
            error={usage.error}
            onRetry={usage.reload}
            minHeight={240}
          >
            <DonutChart data={providerData} totalLabel="Requests" />
          </SectionState>
        </Card>
      </div>

      {pagination && (
        <Pagination
          page={safePage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          noun="requests"
          onPage={setPage}
        />
      )}
    </>
  )
}
