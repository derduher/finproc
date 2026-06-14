import { useEffect, useState } from 'react'
import { sustainableSpend } from '../worker/client'
import { useDebouncedValue } from './useDebouncedValue'
import { GUESS_PERTURBATIONS, guessRangeBand } from '../sim/guesses'
import type { SimulationInputs } from '../schema'
import type { GuessId } from '../store'

const GUESS_IDS: GuessId[] = ['ss', 'match', 'mix']

export interface GuessRangeState {
  /** Low / high of the honest first-run range (today's $); null until solved. */
  low: number | null
  high: number | null
  /** How much each unchecked guess alone moves the answer; null once checked. */
  swings: Record<GuessId, number | null>
  loading: boolean
}

const NO_SWINGS: Record<GuessId, number | null> = { ss: null, match: null, mix: null }

/**
 * The "honest range" behind the first-run hero. Holding `best` (the
 * sustainable-spend point estimate already solved on the screen), this re-solves
 * sustainable spend with each *unchecked* guess perturbed to its plausible
 * alternative, measures the per-guess swing, and brackets `best` by their
 * root-sum-square (see `sim/guesses.ts`). Confirming a guess drops its swing, so
 * the band narrows; confirm all three and it collapses to `best`.
 *
 * Idle (no solves) when the first run is inactive or `best` isn't known yet.
 * Runs off the main thread via the worker client, debounced like the other solvers.
 */
export function useGuessRange(
  inputs: SimulationInputs | null,
  best: number | null,
  active: boolean,
  checked: Record<GuessId, boolean>,
  runCount = 200,
): GuessRangeState {
  const debounced = useDebouncedValue(inputs, 350)
  const [swings, setSwings] = useState<Record<GuessId, number | null>>(NO_SWINGS)
  const [loading, setLoading] = useState(false)

  // Stable signal for the effect: the comma-joined set of unchecked guess ids.
  const uncheckedKey = GUESS_IDS.filter((id) => !checked[id]).join(',')

  useEffect(() => {
    if (!active || !debounced || best == null) {
      setLoading(false)
      return
    }
    const unchecked = uncheckedKey ? (uncheckedKey.split(',') as GuessId[]) : []
    if (unchecked.length === 0) {
      setSwings(NO_SWINGS)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(
      unchecked.map((id) =>
        sustainableSpend(GUESS_PERTURBATIONS[id](debounced), 0.9, { runCount }).then((res) => ({
          id,
          swing: Math.abs(res.spend - best),
        })),
      ),
    )
      .then((results) => {
        if (cancelled) return
        const next: Record<GuessId, number | null> = { ...NO_SWINGS }
        for (const { id, swing } of results) next[id] = swing
        setSwings(next)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, best, active, uncheckedKey, runCount])

  // Display only the swings of currently-unchecked guesses (mask any stale value).
  const masked: Record<GuessId, number | null> = {
    ss: checked.ss ? null : swings.ss,
    match: checked.match ? null : swings.match,
    mix: checked.mix ? null : swings.mix,
  }
  const band =
    active && best != null
      ? guessRangeBand(best, [masked.ss, masked.match, masked.mix])
      : { low: null, high: null }

  return { low: band.low, high: band.high, swings: masked, loading }
}
