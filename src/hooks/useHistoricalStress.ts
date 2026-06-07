/**
 * useHistoricalStress — replays named crises and the historical cohort backtest
 * against the current plan for the stress-test panel.
 *
 * Cheap enough to run synchronously: the named scenarios plus ~70 cohort
 * projections together cost a fraction of the 1,000-run Monte Carlo, so there's
 * no worker round-trip. The React Compiler memoizes the body on `inputs` /
 * `displayMode`, so it only recomputes when those change.
 */
import { NAMED_SCENARIOS, runHistoricalScenario, runCohortBacktest, type CohortBacktest } from '../sim/historical'
import { toScenarioView, type StressScenarioView } from '../sim/stressView'
import type { SimulationInputs } from '../schema'

export interface HistoricalStress {
  scenarios: StressScenarioView[]
  cohort: CohortBacktest
}

export function useHistoricalStress(
  inputs: SimulationInputs,
  displayMode: 'nominal' | 'real',
): HistoricalStress {
  const currentAge = inputs.person.currentAge
  const scenarios = NAMED_SCENARIOS.map((s) =>
    toScenarioView(runHistoricalScenario(inputs, s), displayMode, currentAge),
  )
  const cohort = runCohortBacktest(inputs)
  return { scenarios, cohort }
}
