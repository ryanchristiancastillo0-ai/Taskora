// Hand-rolled SVG chart helpers.
//
// The app has no charting dependency, and the reason it does not need one is
// that every colour here is a CSS custom property from the `@theme` block in
// index.css. Light and dark mode already redefine those properties on
// `html[data-theme="dark"]`, so the charts re-skin with the rest of the UI
// instead of needing a second palette kept in sync by hand.

// Ordered so adjacent series stay distinguishable, and every entry has a
// matching `-soft` token for its legend swatch background. The last entry is the
// neutral ink rather than a fifth hue: it is there for the "cancelled" style
// slice, which should read as de-emphasised instead of competing for attention,
// and it keeps the palette inside the theme tokens so dark mode still follows.
export const SERIES_COLORS = [
  'var(--color-primary-container)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
  'var(--color-ink-faint)',
]

export function seriesColor(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

/**
 * Rounds an axis maximum up to a 1/2/5 x 10^n step, so gridline labels read
 * 0 / 25 / 50 / 75 / 100 instead of 0 / 23.7 / 47.4 / 71.1 / 94.8.
 */
export function niceScale(rawMax, tickCount = 4) {
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return { max: 1, ticks: Array.from({ length: tickCount + 1 }, (_, i) => i) }
  }

  const rough = rawMax / tickCount
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude

  const max = Math.ceil(rawMax / step) * step
  const ticks = []
  // Accumulating with += drifts on fractional steps, and the final tick has to
  // land exactly on max or the top gridline floats above the plot.
  for (let i = 0; i <= Math.round(max / step); i += 1) {
    ticks.push(Number((i * step).toPrecision(12)))
  }

  return { max, ticks }
}

/** Straight-segment polyline through the given points. */
export function linePath(points) {
  if (points.length === 0) return ''
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
}

/** The line path closed down to the baseline, for the translucent fill. */
export function areaPath(points, baselineY) {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)} L${last[0].toFixed(2)} ${baselineY.toFixed(2)} L${first[0].toFixed(2)} ${baselineY.toFixed(2)} Z`
}

/** Catmull-Rom to cubic Bézier, so a trend line curves instead of stepping. */
export function smoothPath(points) {
  if (points.length < 3) return linePath(points)

  let path = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2

    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6

    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }

  return path
}

/**
 * Closes an already-built line path down to the baseline, for the translucent
 * fill. Takes the path string rather than the points so a smoothed line and its
 * fill are guaranteed to trace the same curve — rebuilding the fill from the raw
 * points would make the two disagree along every segment.
 */
export function closeToBaseline(path, points, baselineY) {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${path} L${last[0].toFixed(2)} ${baselineY.toFixed(2)} L${first[0].toFixed(2)} ${baselineY.toFixed(2)} Z`
}

const toRadians = (degrees) => (degrees * Math.PI) / 180

function polarPoint(cx, cy, radius, degrees) {
  const angle = toRadians(degrees - 90)
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
}

/**
 * Donut segment. A full circle cannot be drawn with a single arc (the start and
 * end points coincide, so the browser draws nothing), so 360 is split in two.
 */
export function arcPath(cx, cy, radius, startAngle, endAngle) {
  const sweep = endAngle - startAngle
  if (sweep <= 0) return ''

  if (sweep >= 359.999) {
    const [x, y] = polarPoint(cx, cy, radius, 0)
    return `M${cx - radius} ${cy} A${radius} ${radius} 0 1 1 ${x.toFixed(2)} ${y.toFixed(2)} A${radius} ${radius} 0 1 1 ${cx - radius} ${cy} Z`
  }

  const [startX, startY] = polarPoint(cx, cy, radius, startAngle)
  const [endX, endY] = polarPoint(cx, cy, radius, endAngle)
  const largeArc = sweep > 180 ? 1 : 0

  return `M${startX.toFixed(2)} ${startY.toFixed(2)} A${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`
}

/**
 * How many x-axis labels fit without colliding. Returns a step, not a count,
 * so the labels stay evenly spaced instead of being dropped from the end.
 */
export function labelStep(count, availableWidth, labelWidth = 52) {
  if (count <= 1) return 1
  const fits = Math.max(1, Math.floor(availableWidth / labelWidth))
  return Math.ceil(count / fits)
}

export function compactNumber(value) {
  const number = Number(value) || 0
  if (Math.abs(number) >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(number % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (Math.abs(number) >= 1_000) {
    return `${(number / 1_000).toFixed(number % 1_000 === 0 ? 0 : 1)}k`
  }
  return String(number)
}
