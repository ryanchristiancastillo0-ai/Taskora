import { useState } from 'react'
import { cx } from '@/utils/format'
import { arcPath, seriesColor } from './chartUtils'

// Donut breakdown with a hover-linked legend. The hovered segment is the one
// that grows and takes the full colour, so the legend row and the ring always
// point at the same slice even though the ring has no room for labels.
export default function DonutChart({
  data = [],
  total,
  totalLabel = 'Total',
  size = 200,
  valueFormatter = (value) => value.toLocaleString(),
}) {
  const [hover, setHover] = useState(null)

  const sum = data.reduce((running, item) => running + item.value, 0)
  const headline = total ?? sum
  const radius = size / 2
  const thickness = Math.max(18, Math.round(size * 0.14))
  const inner = radius - thickness

  // Segments are laid out from the top, clockwise, with a small gap so adjacent
  // slices of the same family do not visually merge into one block. The running
  // angle rides along on the accumulator instead of a reassigned variable.
  const gap = data.length > 1 ? 2.5 : 0
  const segments = data.reduce((acc, item, index) => {
    const start = acc.cursor
    const sweep = sum > 0 ? (item.value / sum) * 360 : 0
    const end = start + sweep
    acc.items.push({
      ...item,
      index,
      color: item.color || seriesColor(index),
      start: start + gap / 2,
      end: Math.max(start + gap / 2, end - gap / 2),
      sweep,
    })
    acc.cursor = end
    return acc
  }, { items: [], cursor: 0 }).items

  const activeIndex = hover ?? null
  const active = activeIndex === null ? null : segments[activeIndex]

  return (
    // The donut is a fixed `size` box and cannot shrink, so putting the legend
    // beside it only works once the card is wide enough for both. Card width
    // here comes from the page grid, not the viewport, so a viewport breakpoint
    // is the wrong tool: a one-third column of a max-w-6xl grid is ~307px at
    // every desktop size. A container query keyed to the component's own width
    // keeps the ring and the legend stacked until there is genuinely room,
    // which also stops the legend's fixed-width columns from spilling out.
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @min-[380px]:flex-row @min-[380px]:gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`Breakdown of ${totalLabel.toLowerCase()}`}
          onMouseLeave={() => setHover(null)}
        >
          {sum === 0 ? (
            <circle
              cx={radius}
              cy={radius}
              r={(radius + inner) / 2}
              fill="none"
              stroke="var(--color-surface-high)"
              strokeWidth={thickness}
            />
          ) : (
            segments.map((segment) => {
              const isActive = activeIndex === segment.index
              const dim = activeIndex !== null && !isActive
              return (
                <path
                  key={segment.label}
                  d={arcPath(radius, radius, (radius + inner) / 2, segment.start, segment.end)}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={isActive ? thickness + 5 : thickness}
                  strokeLinecap="butt"
                  opacity={dim ? 0.32 : 1}
                  className="transition-all duration-150"
                  onMouseEnter={() => setHover(segment.index)}
                />
              )
            })
          )}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-2xl font-bold leading-none tracking-tight text-ink">
            {active ? valueFormatter(active.value) : valueFormatter(headline)}
          </span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            {active ? active.label : totalLabel}
          </span>
        </div>
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-1">
        {segments.map((segment) => {
          const percent = sum > 0 ? Math.round((segment.value / sum) * 100) : 0
          const isActive = activeIndex === segment.index
          return (
            <li key={segment.label}>
              <button
                type="button"
                onMouseEnter={() => setHover(segment.index)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(segment.index)}
                onBlur={() => setHover(null)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                  isActive ? 'bg-surface-container' : 'hover:bg-surface-soft'
                )}
              >
                <span
                  className="size-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                  {segment.label}
                </span>
                <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums text-ink">
                  {valueFormatter(segment.value)}
                </span>
                <span className="w-9 flex-shrink-0 text-right text-xs tabular-nums text-ink-faint">
                  {percent}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      </div>
    </div>
  )
}
