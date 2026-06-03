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
import { findSustainableSpend } from '../sim/spendSolver'
import type { MonteCarloResult, ProgressCallback } from '../sim/montecarlo'
import type { SustainableSpendResult } from '../sim/spendSolver'
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

/**
 * Solve for the highest annual spend (today's $) that still meets a target
 * confidence — the "spending you can sustain" headline. Runs off the main thread.
 * Exported directly for testability without Comlink.
 */
export async function sustainableSpend(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SustainableSpendResult> {
  return findSustainableSpend(inputs, targetSuccessRate, opts)
}

// Comlink exposure — only runs in Worker context (not during tests).
// The `typeof WorkerGlobalScope !== 'undefined'` guard prevents errors in jsdom.
// Comlink exposure — only in Worker context
try {
  if (typeof self !== 'undefined' && 'WorkerGlobalScope' in globalThis) {
    expose({ simulate, sustainableSpend })
  }
} catch {
  // Not in a worker context — this is fine for tests
}
