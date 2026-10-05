import { cx } from '@/utils/format'

export default function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-primary-container' : 'bg-surface-high',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cx(
          'inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}