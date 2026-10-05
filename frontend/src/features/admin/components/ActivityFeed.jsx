import Avatar from '@/components/ui/Avatar'
import SectionState from './SectionState'
import { timeAgo } from '@/utils/format'
import { Activity } from 'lucide-react'

const TONE_DOTS = {
  green: 'bg-success',
  indigo: 'bg-primary-container',
  amber: 'bg-warning',
  red: 'bg-danger',
}

// Takes its items as a prop rather than importing the seed directly. That is the
// only change from the original version, and it is what lets the dashboard show
// a real loading and error state instead of an instantly-populated list that
// would give the false impression of a live feed.
export default function ActivityFeed({ items, loading, error, onRetry }) {
  // Normalised before anything touches it. The children below are evaluated by
  // THIS component, not by SectionState - a child component cannot stop its
  // parent's JSX from being built - so passing `items={activity.data}` straight
  // through meant `items.map` ran on null on the very first render, before
  // SectionState had a chance to show its spinner. The isEmpty check was correct
  // and still crashed, because it is not a guard, only a branch.
  const list = Array.isArray(items) ? items : []

  return (
    <SectionState
      loading={loading}
      error={error}
      isEmpty={list.length === 0}
      onRetry={onRetry}
      emptyIcon={Activity}
      emptyTitle="No recent activity"
      emptyDescription="New signups and completed tasks will appear here."
      minHeight={200}
    >
      <div className="flex flex-col">
        {list.map((item, index) => (
          <div
            key={item.id}
            className="flex gap-3 border-b border-border-subtle py-3.5 last:border-0 last:pb-0 first:pt-0"
          >
            <div className="relative flex flex-shrink-0 flex-col items-center">
              <Avatar name={item.name} src={item.avatarUrl} size="sm" />
              {index < list.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-border-subtle" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ink-soft">
                <span className="font-semibold text-ink">{item.name}</span>{' '}
                {item.verb}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                <span
                  className={`size-1.5 flex-shrink-0 rounded-full ${TONE_DOTS[item.tone] || 'bg-ink-faint'}`}
                />
                {timeAgo(item.at)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionState>
  )
}
