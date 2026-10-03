import { useEffect, useRef, useState } from 'react'

// Charts are drawn in real pixels instead of being scaled by a viewBox. A
// viewBox would stretch the axis labels and the stroke widths along with the
// plot area, and a non-uniform `preserveAspectRatio` distorts the circles in a
// donut into ellipses. Measuring the container and redrawing on resize keeps
// every glyph crisp at any container width, in both themes.
//
// Returns 0 until the container has actually been measured, and that 0 is load-
// bearing. A chart that drew at a guessed width before measuring would put a
// real element of that width into the layout, and an <svg width="640"> has a
// min-content size of 640. That floors the implicit grid track it sits in, the
// track stretches every sibling card to match, and the whole page ends up wider
// than the viewport - which is exactly what the admin dashboard did on a phone.
// Callers must render a width-less placeholder while this is 0.
//
// Consumers must also keep the SAME element mounted across the measured and
// unmeasured renders (see AreaChart), because the observer below captures
// ref.current once on mount and would otherwise be left watching a node that
// has since been replaced.
export default function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Charts are also rendered inside a 0-width box on the very first pass
    // (a hidden tab, a collapsed drawer), where ResizeObserver never fires.
    // Seed from the measured box so the first paint is already correct.
    setWidth(element.getBoundingClientRect().width)

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width ?? 0
      setWidth((current) =>
        Math.abs(current - next) < 1 ? current : next
      )
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
