/**
 * Web Worker entry point — exposes `simulate` via Comlink.
 *
 * In production this file is loaded as a Worker module:
 *   new Worker(new URL('./worker/simulator', import.meta.url), { type: 'module' })
 *
 * The `simulate` function is exported directly so it can also be imported
 * in tests without spawning an actual Worker.
 */
import { expose } from 'comlink'
import { runMonteCarlo } from '../sim/montecarlo'
import type { MonteCarloResult, ProgressCallback } from '../sim/montecarlo'
import type { SimulationInputs } from '../schema'

export type { ProgressCallback, ProgressEvent } from '../sim/montecarlo'

/**
 * Run Monte Carlo simulation.
 * Exported directly for testability without Comlink.
 *
 * When invoked across a Comlink worker boundary, `onProgress` must be wrapped
 * in `Comlink.proxy(...)` by the caller — Comlink can't transfer raw functions.
 */
export async function simulate(
  inputs: SimulationInputs,
  runCount: number = 1000,
  onProgress?: ProgressCallback,
): Promise<MonteCarloResult> {
  if (runCount <= 0) {
    throw new Error(`runCount must be > 0, got ${runCount}`)
  }
  return runMonteCarlo(inputs, runCount, inputs.seed, onProgress)
}

// Comlink exposure — only runs in Worker context (not during tests).
// The `typeof WorkerGlobalScope !== 'undefined'` guard prevents errors in jsdom.
// Comlink exposure — only in Worker context
try {
  if (typeof self !== 'undefined' && 'WorkerGlobalScope' in globalThis) {
    expose({ simulate })
  }
} catch {
  // Not in a worker context — this is fine for tests
}
