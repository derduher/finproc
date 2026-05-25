/**
 * Sensitivity analysis — One-At-a-Time (OAT) perturbation.
 *
 * For each parameter, we run the MC simulation with the parameter perturbed by ±20%
 * and record the delta in success rate vs the baseline.
 *
 * Returns entries sorted by descending absolute impact (largest first).
 */
import { runMonteCarlo } from './montecarlo'
import type { SimulationInputs } from '../schema'
import type { SensitivityResult } from '../schema'

/** ±20% perturbation factor */
const DELTA = 0.20

interface Perturbation {
  label: string
  sub: string
  applyLo: (inp: SimulationInputs) => SimulationInputs
  applyHi: (inp: SimulationInputs) => SimulationInputs
}

function clampRate(v: number): number {
  return Math.max(-0.99, Math.min(3, v))
}

const PERTURBATIONS: Perturbation[] = [
  {
    label: 'Annual expenses',
    sub: '±20%',
    applyLo: (inp) => ({ ...inp, annualExpenses: inp.annualExpenses * (1 - DELTA) }),
    applyHi: (inp) => ({ ...inp, annualExpenses: inp.annualExpenses * (1 + DELTA) }),
  },
  {
    label: 'Stock returns',
    sub: '±20%',
    applyLo: (inp) => ({
      ...inp,
      initialStockGrowthMin: clampRate(inp.initialStockGrowthMin * (1 - DELTA)),
      initialStockGrowthMax: clampRate(inp.initialStockGrowthMax * (1 - DELTA)),
    }),
    applyHi: (inp) => ({
      ...inp,
      initialStockGrowthMin: clampRate(inp.initialStockGrowthMin * (1 + DELTA)),
      initialStockGrowthMax: clampRate(inp.initialStockGrowthMax * (1 + DELTA)),
    }),
  },
  {
    label: 'Inflation',
    sub: '±20%',
    applyLo: (inp) => ({
      ...inp,
      initialInflationMin: clampRate(inp.initialInflationMin * (1 - DELTA)),
      initialInflationMax: clampRate(inp.initialInflationMax * (1 - DELTA)),
    }),
    applyHi: (inp) => ({
      ...inp,
      initialInflationMin: clampRate(inp.initialInflationMin * (1 + DELTA)),
      initialInflationMax: clampRate(inp.initialInflationMax * (1 + DELTA)),
    }),
  },
  {
    label: 'Annual salary',
    sub: '±20%',
    applyLo: (inp) => ({
      ...inp,
      person: { ...inp.person, annualSalary: inp.person.annualSalary * (1 - DELTA) },
    }),
    applyHi: (inp) => ({
      ...inp,
      person: { ...inp.person, annualSalary: inp.person.annualSalary * (1 + DELTA) },
    }),
  },
  {
    label: 'Retirement age',
    sub: '±2 years',
    applyLo: (inp) => ({
      ...inp,
      person: { ...inp.person, currentAge: Math.max(18, inp.person.currentAge - 2) },
    }),
    applyHi: (inp) => ({
      ...inp,
      person: { ...inp.person, currentAge: Math.min(inp.person.maxAge - 1, inp.person.currentAge + 2) },
    }),
  },
  {
    label: 'Social Security',
    sub: '±20%',
    applyLo: (inp) =>
      inp.socialSecurity
        ? {
            ...inp,
            socialSecurity: {
              ...inp.socialSecurity,
              annualAmountPresentDollars:
                inp.socialSecurity.annualAmountPresentDollars * (1 - DELTA),
            },
          }
        : inp,
    applyHi: (inp) =>
      inp.socialSecurity
        ? {
            ...inp,
            socialSecurity: {
              ...inp.socialSecurity,
              annualAmountPresentDollars:
                inp.socialSecurity.annualAmountPresentDollars * (1 + DELTA),
            },
          }
        : inp,
  },
]

/**
 * Run sensitivity analysis: returns sorted tornado chart data.
 * @param inputs  Baseline simulation inputs
 * @param runCount  MC runs per perturbation (default 200 — lower than full MC for speed)
 */
export function runSensitivity(
  inputs: SimulationInputs,
  runCount: number = 200,
): SensitivityResult[] {
  const baseline = runMonteCarlo(inputs, runCount, inputs.seed)
  const baseRate = baseline.successRate

  const results: SensitivityResult[] = []

  for (const p of PERTURBATIONS) {
    const loInputs = p.applyLo(inputs)
    const hiInputs = p.applyHi(inputs)

    // Skip if perturbation doesn't change inputs (e.g. no SS for SS row)
    const loRate =
      JSON.stringify(loInputs) === JSON.stringify(inputs)
        ? baseRate
        : runMonteCarlo(loInputs, runCount, inputs.seed).successRate

    const hiRate =
      JSON.stringify(hiInputs) === JSON.stringify(inputs)
        ? baseRate
        : runMonteCarlo(hiInputs, runCount, inputs.seed).successRate

    results.push({
      label: p.label,
      sub: p.sub,
      loDelta: loRate - baseRate,
      hiDelta: hiRate - baseRate,
    })
  }

  // Sort by descending absolute max impact
  return results.sort((a, b) => {
    const impactA = Math.max(Math.abs(a.loDelta), Math.abs(a.hiDelta))
    const impactB = Math.max(Math.abs(b.loDelta), Math.abs(b.hiDelta))
    return impactB - impactA
  })
}
