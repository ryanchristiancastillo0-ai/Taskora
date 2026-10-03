import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '@/shared/utils/format'
import Tooltip from '@/shared/components/ui/Tooltip'

const TONES = {
  primary: 'bg-primary-soft text-primary',
  // The console names the brand colour "indigo" everywhere else (the sidebar
  // links, the status badges), so both keys resolve rather than letting an
  // "indigo" tone fall through to the primary default and hide the typo.
  indigo: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-emerald-700',
  amber: 'bg-warning-soft text-amber-700',
  danger: 'bg-danger-soft text-rose-600',
  slate: 'bg-surface-high text-ink-soft',
}

/**
 * Whether an element's text is genuinely clipped, so a tooltip would have
 * something to add. Measured rather than guessed: the same label truncates in a
 * two-up phone grid and not in a four-up desktop one, and the card is re-laid-out
 * on resize. A tooltip on a label that already fits is noise.
 */
function useTruncation() {
  const ref = useRef(null)
  const [clipped, setClipped] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, clipped]
}

/**
 * One headline number on the admin dashboard and reports pages.
 *
 * `tone` only tints the icon chip. The value itself stays in text-ink for every
 * card, so a row of cards reads as one set rather than five competing colours —
 * colour here means "which kind of thing is this", not "how worried should I be".
 * That also means dark mode needs no variant here.
 *
 * The card is a container so the headline number reacts to the width of the card
 * rather than to the viewport. In a two-up phone grid a card is about 136px, and
 * once the icon chip and padding are accounted for the number gets roughly 48px
 * — narrower than "84,213" needs at text-2xl, so it used to spill past the card
 * edge. The same card in the four-up desktop grid has ~380px and wants the larger
 * number, and both sizes appear on the same screen, so no viewport breakpoint
 * can express it.
 *
 * A clipped label gets its full text back on hover, focus and tap, and only then:
 * the tooltip appears when the text is actually clipped, never on a card with
 * room to show the whole word.
 */
export default function StatCard({ label, value, icon: Icon, tone = 'primary', hint, className }) {
  const id = useId()
  const [labelRef, labelClipped] = useTruncation()
  const [hintRef, hintClipped] = useTruncation()

  return (
    <div
      className={cx(
        '@container rounded-card bg-surface-card p-5 shadow-card transition-shadow hover:shadow-card-hover',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Tooltip label={labelClipped ? label : null} id={`${id}-label`} className="block">
            <span ref={labelRef} className="block truncate text-[13px] font-medium text-ink-muted">
              {label}
            </span>
          </Tooltip>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink tabular-nums @max-[170px]:text-xl @max-[112px]:text-lg">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
        {Icon && (
          // The icon chip is decoration and the number is the content, so when
          // the card is too narrow to hold both the chip is what goes. Keyed off
          // the card, not the screen, so it comes back at every other size.
          <div
            className={cx(
              'flex size-9 flex-shrink-0 items-center justify-center rounded-lg @max-[140px]:hidden',
              TONES[tone] || TONES.primary
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2} />
          </div>
        )}
      </div>
      {hint && (
        <Tooltip label={hintClipped ? hint : null} id={`${id}-hint`} className="mt-2 block">
          <span ref={hintRef} className="block truncate text-xs text-ink-faint">
            {hint}
          </span>
        </Tooltip>
      )}
    </div>
  )
}
