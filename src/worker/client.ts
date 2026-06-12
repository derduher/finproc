/**
 * Main-thread client for the simulation Worker.
 *
 * Hooks import from this module, never from `./simulator` directly. When the
 * `Worker` global exists (the browser), all calls route through one shared
 * module Worker wrapped with Comlink, keeping Monte Carlo runs, solver
 * bisections, and sensitivity sweeps off the main thread. When it doesn't —
 * or the worker fails to construct, load, or crashes mid-life — calls fall
 * back to the simulator functions, dynamically imported so the engine isn't
 * double-bundled into the main chunk. The fallback is also why
 * `vi.mock('../worker/simulator')` in tests keeps working: jsdom has no
 * usable Worker, and vitest intercepts the dynamic import.
 */
import { wrap, proxy } from 'comlink'
import type { Remote } from 'comlink'
import type { MonteCarloResult, ProgressCallback } from '../sim/montecarlo'
import type { SustainableSpendResult } from '../sim/spendSolver'
import type { RetirementSolveResult } from '../sim/retirementSolver'
import type { SaveMoreResult } from '../sim/saveMoreSolver'
import type { Insight } from '../sim/insights'
import type { SimulationInputs, SensitivityResult } from '../schema'

export type { ProgressCallback, ProgressEvent } from '../sim/montecarlo'

type SimulatorModule = typeof import('./simulator')
type SimulatorApi = Pick<
  SimulatorModule,
  'simulate' | 'sustainableSpend' | 'earliestRetirementAge' | 'requiredExtraSavings' | 'sensitivity' | 'insights'
>

let remote: Remote<SimulatorApi> | undefined
let workerBroken = false
/**
 * Rejects when the worker's `error` event fires. A worker whose script fails
 * to *load* (network error, CSP rejecting the fetch) doesn't throw from the
 * constructor — it errors asynchronously, and Comlink has no timeout, so
 * without this every in-flight call would hang forever.
 */
let workerFailure: Promise<never> | undefined

function getRemote(): Remote<SimulatorApi> | undefined {
  if (workerBroken) return undefined
  if (typeof Worker === 'undefined') return undefined
  if (!remote) {
    try {
      // The literal `new Worker(new URL(...), { type: 'module' })` shape is what
      // Vite statically detects to bundle the worker entry — don't refactor it
      // into a variable.
      const worker = new Worker(new URL('./simulator', import.meta.url), { type: 'module' })
      workerFailure = new Promise<never>((_, reject) => {
        worker.addEventListener('error', (event) => {
          workerBroken = true
          remote = undefined
          worker.terminate()
          reject(new Error(`simulation worker failed: ${event.message || 'script error'}`))
        })
      })
      // Pre-handle so an error with no call in flight isn't an unhandled rejection.
      workerFailure.catch(() => {})
      remote = wrap<SimulatorApi>(worker)
    } catch {
      workerBroken = true
      return undefined
    }
  }
  return remote
}

/**
 * Route a call through the worker, racing it against worker failure; on any
 * worker breakage (now or mid-call), retry once on the main thread.
 */
async function run<T>(
  viaWorker: (r: Remote<SimulatorApi>) => Promise<T>,
  viaDirect: (m: SimulatorModule) => Promise<T>,
): Promise<T> {
  const r = getRemote()
  if (r) {
    try {
      return await Promise.race([viaWorker(r), workerFailure as Promise<never>])
    } catch (err) {
      // A rejection with the worker still healthy is a genuine simulation
      // error (Comlink rethrows it) — propagate, don't recompute.
      if (!workerBroken) throw err
    }
  }
  return viaDirect(await import('./simulator'))
}

export async function simulate(
  inputs: SimulationInputs,
  runCount: number = 1000,
  onProgress?: ProgressCallback,
): Promise<MonteCarloResult> {
  return run(
    // Raw functions can't cross the Comlink boundary — wrap in a proxy stub.
    // Each proxy opens a MessageChannel; neither side calls [releaseProxy],
    // so cleanup relies on Comlink's FinalizationRegistry releasing the port
    // when the worker-side proxy is GC'd. Slow but bounded — don't "fix" it
    // with manual release unless the callback's lifetime is actually known.
    (r) => r.simulate(inputs, runCount, onProgress ? proxy(onProgress) : undefined),
    (m) => m.simulate(inputs, runCount, onProgress),
  )
}

export async function sustainableSpend(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SustainableSpendResult> {
  return run(
    (r) => r.sustainableSpend(inputs, targetSuccessRate, opts),
    (m) => m.sustainableSpend(inputs, targetSuccessRate, opts),
  )
}

export async function earliestRetirementAge(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number },
): Promise<RetirementSolveResult | undefined> {
  return run(
    (r) => r.earliestRetirementAge(inputs, targetSuccessRate, opts),
    (m) => m.earliestRetirementAge(inputs, targetSuccessRate, opts),
  )
}

export async function requiredExtraSavings(
  inputs: SimulationInputs,
  targetSuccessRate: number = 0.9,
  opts?: { runCount?: number; tolerance?: number },
): Promise<SaveMoreResult> {
  return run(
    (r) => r.requiredExtraSavings(inputs, targetSuccessRate, opts),
    (m) => m.requiredExtraSavings(inputs, targetSuccessRate, opts),
  )
}

export async function sensitivity(
  inputs: SimulationInputs,
  runCount: number = 200,
): Promise<SensitivityResult[]> {
  return run(
    (r) => r.sensitivity(inputs, runCount),
    (m) => m.sensitivity(inputs, runCount),
  )
}

export async function insights(
  inputs: SimulationInputs,
  runCount: number = 1000,
): Promise<Insight[]> {
  return run(
    (r) => r.insights(inputs, runCount),
    (m) => m.insights(inputs, runCount),
  )
}
