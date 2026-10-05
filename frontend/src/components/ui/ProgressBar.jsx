import { cx } from '@/utils/format'

const tones = {
  primary: 'bg-primary-container',
  success: 'bg-success',
  amber: 'bg-warning',
  slate: 'bg-ink-faint',
}

export default function ProgressBar({ value = 0, tone = 'primary', max = 100, className }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-high', className)}
    >
      <div
        className={cx('h-full rounded-full transition-all duration-500', tones[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}