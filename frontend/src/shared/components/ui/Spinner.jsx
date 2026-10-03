import { cx } from '../../utils/format'

export default function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
    />
  )
}