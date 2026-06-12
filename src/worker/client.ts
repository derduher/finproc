/**
 * Main-thread client for the simulation Worker.
 *
 * Hooks import from this module, never from `./simulator` directly. When the
 * `Worker` global exists (the browser), all calls route through one shared
 * module Worker wrapped with Comlink, keeping Monte Carlo runs, solver
 * bisections, and sensitivity sweeps off the main thread. When it doesn't
 * (jsdom tests, or a Worker that fails to construct), calls fall back to the
 * direct in-module functions — which is also why `vi.mock('../worker/simulator')`
 * in tests keeps working.
 */
import { wrap, proxy } from 'comlink'
import type { Remote } from 'comlink'
import * as direct from './simulator'
import type { MonteCarloResult, ProgressCallback } from '../sim/montecarlo'
import type { SustainableSpendResult } from '../sim/spendSolver'
import type { RetirementSolveResult } from '../sim/retirementSolver'
import type { SaveMoreResult } from '../sim/saveMoreSolver'
import type { Insight } from '../sim/insights'
import type { SimulationInputs, SensitivityResult } from '../schema'

export type { ProgressCallback, ProgressEvent } from '../sim/montecarlo'

type SimulatorApi = {
  simulate: typeof direct.simulate
  sustainableSpend: typeof direct.sustainableSpend
  earliestRetirementAge: typeof direct.earliestRetirementAge
  requiredExtraSavings: typeof direct.requiredExtraSavings
  sensitivity: typeof direct.sensitivity
  insights: typeof direct.insights
}

let remote: Remote<SimulatorApi> | undefined

function getRemote(): Remote<SimulatorApi> | undefined {
  if (typeof Worker === 'undefined') return undefined
  if (!remote) {
    try {
      // The literal `new Worker(new URL(...), { type: 'module' })` shape is what
      // Vite statically detects to bundle the worker entry — don't refactor it
      // into a variable.
      const worker = new Worker(new URL('./simulator', import.meta.url), { type: 'module' })
      remote = wrap<SimulatorApi>(worker)
    } catch {
      return undefined
    }
  }
  return remote
}

export async function simulate(
  inputs: SimulationInputs,
  runCount: number = 1000,
  onProgress?: ProgressCallback,
): Promise<MonteCarloResult> {
  const r = getRemote()
  if (!r) return direct.simulate(inputs, runCount, onProgress)
  // Raw functions can't cross the Comlink boundary — wrap in a proxy stub.
  return r.simulate(inputs, runCount, onProgress ? proxy(onProgress) : undefined)
}

export async function sustainableSpend(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SustainableSpendResult> {
  const r = getRemote()
  if (!r) return direct.sustainableSpend(inputs, targetSuccessRate, opts)
  return r.sustainableSpend(inputs, targetSuccessRate, opts)
}

export async function earliestRetirementAge(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number },
): Promise<RetirementSolveResult | undefined> {
  const r = getRemote()
  if (!r) return direct.earliestRetirementAge(inputs, targetSuccessRate, opts)
  return r.earliestRetirementAge(inputs, targetSuccessRate, opts)
}

export async function requiredExtraSavings(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SaveMoreResult> {
  const r = getRemote()
  if (!r) return direct.requiredExtraSavings(inputs, targetSuccessRate, opts)
  return r.requiredExtraSavings(inputs, targetSuccessRate, opts)
}

export async function sensitivity(
  inputs: SimulationInputs,
  runCount: number = 200,
): Promise<SensitivityResult[]> {
  const r = getRemote()
  if (!r) return direct.sensitivity(inputs, runCount)
  return r.sensitivity(inputs, runCount)
}

export async function insights(
  inputs: SimulationInputs,
  runCount: number = 1000,
): Promise<Insight[]> {
  const r = getRemote()
  if (!r) return direct.insights(inputs, runCount)
  return r.insights(inputs, runCount)
}
