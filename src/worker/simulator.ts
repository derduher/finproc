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
import { findRetirementAgeForSuccess } from '../sim/retirementSolver'
import { findRequiredExtraSavings } from '../sim/saveMoreSolver'
import { runSensitivity } from '../sim/sensitivity'
import { computeInsights } from '../sim/insights'
import type { MonteCarloResult, ProgressCallback } from '../sim/montecarlo'
import type { SustainableSpendResult } from '../sim/spendSolver'
import type { RetirementSolveResult } from '../sim/retirementSolver'
import type { SaveMoreResult } from '../sim/saveMoreSolver'
import type { Insight } from '../sim/insights'
import type { SimulationInputs, SensitivityResult } from '../schema'

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

/**
 * Solve for the EARLIEST retirement age (cascaded onto accounts) whose success
 * rate still meets a target confidence — the "how soon could I retire?" read
 * (#10). Returns undefined if even retiring at maxAge can't reach the target.
 * Exported directly for testability without Comlink.
 */
export async function earliestRetirementAge(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number },
): Promise<RetirementSolveResult | undefined> {
  return findRetirementAgeForSuccess(inputs, targetSuccessRate, opts)
}

/**
 * Solve for the smallest extra monthly contribution that lifts the plan to the
 * target confidence — "save $X more / month" (#10 family). Exported directly for
 * testability without Comlink.
 */
export async function requiredExtraSavings(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SaveMoreResult> {
  return findRequiredExtraSavings(inputs, targetSuccessRate, opts)
}

/**
 * One-at-a-time ±20% sensitivity (the tornado). Runs `2 × perturbations + 1`
 * Monte Carlo passes, so it lives off the main thread; the v1 wizard used to
 * run this synchronously in render. Exported directly for testability.
 */
export async function sensitivity(
  inputs: SimulationInputs,
  runCount: number = 200,
): Promise<SensitivityResult[]> {
  return runSensitivity(inputs, runCount)
}

/**
 * Rule-based insight cards. Recomputes the baseline at `runCount` in-worker
 * (cheaper than structured-cloning a full MonteCarloResult across the Comlink
 * boundary) so the comparative rules diff like against like at the same
 * resolution. Exported directly for testability.
 */
export async function insights(
  inputs: SimulationInputs,
  runCount: number = 1000,
): Promise<Insight[]> {
  const baseline = runMonteCarlo(inputs, runCount, inputs.seed)
  return computeInsights(inputs, baseline, { runCount })
}

// Comlink exposure — only runs in Worker context (not during tests).
// The `typeof WorkerGlobalScope !== 'undefined'` guard prevents errors in jsdom.
// Comlink exposure — only in Worker context
try {
  if (typeof self !== 'undefined' && 'WorkerGlobalScope' in globalThis) {
    expose({ simulate, sustainableSpend, earliestRetirementAge, requiredExtraSavings, sensitivity, insights })
  }
} catch {
  // Not in a worker context — this is fine for tests
}
