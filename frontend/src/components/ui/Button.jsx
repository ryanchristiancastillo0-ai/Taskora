import { cx } from '@/utils/format'
import Spinner from './Spinner'

const variants = {
  primary:
    'bg-primary-container text-white hover:bg-primary shadow-primary-glow',
  secondary:
    'bg-surface-card text-ink-soft border border-border-subtle hover:text-ink hover:bg-surface-soft shadow-card',
  soft: 'bg-primary-soft text-primary hover:bg-primary-faint',
  ghost: 'text-ink-soft hover:bg-surface-container hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
  dangerSoft: 'bg-danger-soft text-error hover:bg-danger/15',
}

const sizes = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
}

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false } = {}) {
  return cx(
    'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:pointer-events-none select-none',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full'
  )
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={cx(buttonClasses({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {!loading && Icon && <Icon className="size-[18px]" strokeWidth={2} />}
      {children}
      {IconRight && <IconRight className="size-4" strokeWidth={2} />}
    </button>
  )
}