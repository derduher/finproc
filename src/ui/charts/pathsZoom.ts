/**
 * Pure x-axis (age) view-domain math for the futures chart's pinch-zoom + pan.
 *
 * A "domain" is the visible age window `[min, max]`. The chart's x-scale maps
 * this window across the plot width; zooming/panning just moves the window
 * (the underlying data never changes). Kept pure + framework-free so the gesture
 * wiring in PathsChart stays thin and these can be unit-tested directly.
 */
export type Domain = [number, number]

/**
 * Keep a window inside `[fullMin, fullMax]` and no narrower than `minSpan`.
 * - too wide  → snap to the full range
 * - too narrow → expand around its centre to `minSpan`
 * - off an edge → shift back in, preserving span (never resize to fit)
 */
export function clampDomain(domain: Domain, fullMin: number, fullMax: number, minSpan: number): Domain {
  const fullSpan = fullMax - fullMin
  let [min, max] = domain
  let span = max - min

  if (span >= fullSpan) return [fullMin, fullMax]
  if (span < minSpan) {
    const center = (min + max) / 2
    min = center - minSpan / 2
    max = center + minSpan / 2
    span = minSpan
  }
  if (min < fullMin) {
    min = fullMin
    max = fullMin + span
  } else if (max > fullMax) {
    max = fullMax
    min = fullMax - span
  }
  return [min, max]
}

/**
 * Scale the window around `focusAge` (the pinch midpoint / wheel cursor),
 * keeping that age at the same fractional position, then clamp. `factor > 1`
 * zooms in (narrower window); `factor < 1` zooms out.
 */
export function zoomDomain(
  domain: Domain,
  factor: number,
  focusAge: number,
  fullMin: number,
  fullMax: number,
  minSpan: number,
): Domain {
  const [min, max] = domain
  const span = max - min
  const focusFrac = span === 0 ? 0.5 : (focusAge - min) / span
  const newSpan = span / factor
  const newMin = focusAge - focusFrac * newSpan
  return clampDomain([newMin, newMin + newSpan], fullMin, fullMax, minSpan)
}

/** Shift the window by `deltaAge` without resizing, clamped to the full range. */
export function panDomain(domain: Domain, deltaAge: number, fullMin: number, fullMax: number): Domain {
  const [min, max] = domain
  const span = max - min
  let newMin = min + deltaAge
  if (newMin < fullMin) newMin = fullMin
  if (newMin + span > fullMax) newMin = fullMax - span
  return [newMin, newMin + span]
}

/** Age at a 0..1 fraction across the window. */
export function ageAtFraction(domain: Domain, frac: number): number {
  const [min, max] = domain
  return min + frac * (max - min)
}

/** Clamp a pointer's client x to a 0..1 fraction across a rect (0 if zero-width). */
export function fractionForClientX(rect: { left: number; width: number }, clientX: number): number {
  if (rect.width === 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}
