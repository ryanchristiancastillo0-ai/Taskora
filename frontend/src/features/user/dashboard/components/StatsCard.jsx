import ProgressBar from '@/components/ui/ProgressBar'
import { cx } from '@/utils/format'

const toneIcons = {
  indigo: 'bg-primary-soft text-primary',
  amber: 'bg-warning-soft text-amber-600',
  green: 'bg-success-soft text-emerald-600',
  red: 'bg-danger-soft text-danger',
}

const bars = {
  indigo: 'primary',
  amber: 'amber',
  green: 'success',
  red: 'primary',
}

export default function StatsCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'indigo',
  progress,
}) {
  return (
    <div className="group rounded-card border border-border-subtle bg-surface-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-muted">{label}</span>
        <div
          className={cx(
            'flex size-9 items-center justify-center rounded-lg',
            toneIcons[tone]
          )}
        >
          <Icon className="size-[18px]" strokeWidth={2} />
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-3xl font-bold leading-none tracking-tight text-ink">
          {value}
        </span>
        {sub && <span className="text-xs font-medium text-ink-muted">{sub}</span>}
      </div>
      {progress !== undefined && (
        <ProgressBar value={progress} tone={bars[tone]} className="mt-3.5" />
      )}
    </div>
  )
}