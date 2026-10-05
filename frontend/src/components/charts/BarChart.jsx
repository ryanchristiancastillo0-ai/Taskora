import { useState } from 'react'
import useElementWidth from '@/hooks/useElementWidth'
import {
  compactNumber,
  labelStep,
  niceScale,
  seriesColor,
} from './chartUtils'

const PADDING = { top: 14, right: 12, bottom: 28, left: 46 }

// Vertical bars, one group per label. `series` is the same shape the area chart
// takes, so a page can swap one for the other without reshaping its data.
export default function BarChart({
  labels = [],
  series = [],
  height = 240,
  valueFormatter = compactNumber,
}) {
  const [ref, width] = useElementWidth()
  const [hover, setHover] = useState(null)

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right)
  const plotHeight = Math.max(0, height - PADDING.top - PADDING.bottom)
  const maxValue = series.reduce(
    (highest, item) => Math.max(highest, ...item.data),
    0
  )
  const scale = niceScale(maxValue)
  const baseline = PADDING.top + plotHeight

  const slot = labels.length > 0 ? plotWidth / labels.length : plotWidth
  // Bars keep a gap either side so a lone bar is not a wall, and never grow so
  // wide that two neighbouring groups touch.
  const groupWidth = Math.min(slot * 0.62, 46)
  const barWidth = Math.max(3, groupWidth / Math.max(series.length, 1) - 3)

  const yAt = (value) => baseline - (value / scale.max) * plotHeight

  const step = labelStep(labels.length, plotWidth)

  // The wrapper below is the measured element in every state, including
  // unmeasured and empty, so the ResizeObserver captured at mount keeps
  // watching a live node when data arrives.
  return (
    <div ref={ref} className="relative w-full min-w-0 select-none">
      {width === 0 ? (
        <div className="w-full animate-pulse rounded-field bg-surface-container/40" style={{ height }} />
      ) : labels.length === 0 ? (
        <div
          className="flex items-center justify-center text-[13px] text-ink-faint"
          style={{ height }}
        >
          No data yet
        </div>
      ) : (
        <>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((item, index) => (
            <span key={item.key} className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className="size-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: item.color || seriesColor(index) }}
              />
              <span className="text-ink-muted">{item.label}</span>
            </span>
          ))}
        </div>
      )}

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Bar chart: ${series.map((item) => item.label).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="var(--color-border-subtle)"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 10}
              y={yAt(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-faint text-[11px]"
            >
              {valueFormatter(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) => {
          const centre = PADDING.left + slot * (index + 0.5)
          return (
            <g key={`${label}-${index}`}>
              {series.map((item, seriesIndex) => {
                const value = item.data[index] ?? 0
                const isHover = hover?.index === index
                const x =
                  centre -
                  groupWidth / 2 +
                  seriesIndex * (barWidth + 3)
                const barHeight = Math.max(0, baseline - yAt(value))
                return (
                  <rect
                    key={item.key}
                    x={x}
                    y={baseline - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(4, barWidth / 2)}
                    fill={item.color || seriesColor(seriesIndex)}
                    opacity={
                      hover && !isHover ? 0.4 : 1
                    }
                    className="transition-opacity duration-150"
                    onMouseEnter={() => setHover({ index, seriesIndex, label, value })}
                  />
                )
              })}
            </g>
          )
        })}

        <line
          x1={PADDING.left}
          x2={PADDING.left + plotWidth}
          y1={baseline}
          y2={baseline}
          stroke="var(--color-outline)"
          strokeWidth="1"
        />

        {labels.map((label, index) => {
          if (index % step !== 0) return null
          const x = PADDING.left + slot * (index + 0.5)
          if (x < 12 || x > width - 12) return null
          return (
            <text
              key={`${label}-${index}`}
              x={x}
              y={height - 8}
              textAnchor="middle"
              className="fill-ink-faint text-[11px]"
            >
              {label}
            </text>
          )
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-card border border-border-subtle bg-surface-card px-3 py-2 shadow-lifted"
          style={{
            left: Math.max(
              4,
              Math.min(
                width - 4,
                PADDING.left + slot * (hover.index + 0.5)
              )
            ),
            transform: `translateX(-50%)`,
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {hover.label}
          </p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">
            {series[hover.seriesIndex]?.label}: {valueFormatter(hover.value)}
          </p>
        </div>
      )}
        </>
      )}
    </div>
  )
}
