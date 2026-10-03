import { Check } from 'lucide-react'
import { cx } from '../../utils/format'

export default function Checkbox({ checked, onChange, className, ...props }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex size-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border border-border-subtle bg-surface-card shadow-sm transition-all duration-150',
        checked
          ? 'border-primary-container bg-primary-container text-white'
          : 'hover:border-primary/40 hover:bg-primary-soft',
        className
      )}
      {...props}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  )
}