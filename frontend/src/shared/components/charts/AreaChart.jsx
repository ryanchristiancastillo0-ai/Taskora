import { useId, useState } from 'react'
import useElementWidth from '../../hooks/useElementWidth'
import { cx } from '../../utils/format'
import {
  closeToBaseline,
  compactNumber,
  labelStep,
  niceScale,
  seriesColor,
  smoothPath,
} from './chartUtils'

const PADDING = { top: 14, right: 16, bottom: 28, left: 46 }

// Multi-series area chart with a shared crosshair and one tooltip for every
// series at the hovered index. Series are plain data, so the same component
// draws signups-vs-active, revenue-vs-refunds, or anything else the page
// passes in.
export default function AreaChart({
  labels = [],
  series = [],
  height = 280,
  valueFormatter = compactNumber,
}) {
  const [ref, width] = useElementWidth()
  const [hover, setHover] = useState(null)
  const [hiddenKeys, setHiddenKeys] = useState([])
  // React's useId contains colons, which are not safe inside a url(#id)
  // reference in every browser.
  const gradientId = `area-${useId().replace(/:/g, '')}`

  const visible = series.filter((item) => !hiddenKeys.includes(item.key))
  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right)
  const plotHeight = Math.max(0, height - PADDING.top - PADDING.bottom)
  const maxValue = visible.reduce(
    (highest, item) => Math.max(highest, ...item.data),
    0
  )
  const scale = niceScale(maxValue)

  const xAt = (index) =>
    PADDING.left +
    (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth)
  const yAt = (value) =>
    PADDING.top + plotHeight - (value / scale.max) * plotHeight

  const toggleSeries = (key) =>
    setHiddenKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    )

  const trackPointer = (event) => {
    if (labels.length === 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - bounds.left
    const ratio = (offset - PADDING.left) / (plotWidth || 1)
    const index = Math.round(ratio * (labels.length - 1))
    setHover(Math.max(0, Math.min(labels.length - 1, index)))
  }

  const step = labelStep(labels.length, plotWidth)
  const hoverX = hover === null ? 0 : xAt(hover)

  // The wrapper below is the measured element in every state, including
  // unmeasured and empty. It must stay the same DOM node across those states
  // or the ResizeObserver captured at mount ends up watching a detached node and
  // the chart stops tracking its container.
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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((item, index) => {
          const off = hiddenKeys.includes(item.key)
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={!off}
              onClick={() => toggleSeries(item.key)}
              className={cx(
                'flex items-center gap-1.5 text-xs font-medium transition-opacity',
                off ? 'opacity-40' : 'opacity-100'
              )}
            >
              <span
                className="size-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: item.color || seriesColor(index) }}
              />
              <span className="text-ink-muted">{item.label}</span>
            </button>
          )
        })}
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Trend chart: ${series.map((item) => item.label).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((item, index) => (
            <linearGradient
              key={item.key}
              id={`${gradientId}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={item.color || seriesColor(index)}
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor={item.color || seriesColor(index)}
                stopOpacity="0"
              />
            </linearGradient>
          ))}
        </defs>

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

        {visible.map((item, index) => {
          const color = item.color || seriesColor(index)
          const points = item.data.map((value, i) => [xAt(i), yAt(value)])
          const seriesIndex = series.findIndex((entry) => entry.key === item.key)
          const line = smoothPath(points)
          return (
            <g key={item.key}>
              <path
                d={closeToBaseline(line, points, PADDING.top + plotHeight)}
                fill={`url(#${gradientId}-${seriesIndex})`}
              />
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}

        {hover !== null && (
          <g>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              stroke="var(--color-outline)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {visible.map((item, index) => (
              <circle
                key={item.key}
                cx={hoverX}
                cy={yAt(item.data[hover] ?? 0)}
                r="4"
                fill="var(--color-surface-card)"
                stroke={item.color || seriesColor(index)}
                strokeWidth="2.5"
              />
            ))}
          </g>
        )}

        {labels.map((label, index) => {
          if (index % step !== 0) return null
          const x = xAt(index)
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

        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onMouseMove={trackPointer}
        />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-9 z-10 min-w-[9rem] rounded-card border border-border-subtle bg-surface-card px-3 py-2 shadow-lifted"
          style={{
            left: Math.max(4, Math.min(width - 4, hoverX)),
            transform: `translateX(${hoverX > width - 150 ? '-100%' : hoverX < 150 ? '0' : '-50%'})`,
          }}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {labels[hover]}
          </p>
          <div className="flex flex-col gap-1">
            {visible.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: item.color || seriesColor(index) }}
                />
                <span className="flex-1 text-ink-muted">{item.label}</span>
                <span className="font-semibold tabular-nums text-ink">
                  {valueFormatter(item.data[hover] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
