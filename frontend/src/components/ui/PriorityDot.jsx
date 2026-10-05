import { priorityMeta } from '@/constants/index'
import { cx } from '@/utils/format'

export default function PriorityDot({ priority, className }) {
  const meta = priorityMeta(priority)
  if (!meta) return null

  return (
    <span
      role="img"
      aria-label={`${meta.label} priority`}
      className={cx('inline-block size-[7px] shrink-0 rounded-full', className)}
      style={{ backgroundColor: meta.color }}
    />
  )
}