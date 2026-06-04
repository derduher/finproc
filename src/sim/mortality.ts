/**
 * Stochastic mortality — draw an age at death per Monte Carlo run instead of
 * pinning a single deterministic horizon (`maxAge`). This is the rigorous answer
 * to "a hard death date is an arbitrary input that drives the headline": the
 * success rate becomes an expectation over the *distribution* of lifespans.
 *
 * Uses a Gompertz law (Milevsky parameterization) calibrated to roughly match US
 * unisex mortality. It's a parametric model, not a claimed actuarial table — the
 * shape (hazard roughly doubling every ~8 years, a modal age at death in the late
 * 80s) is what matters for longevity risk, and it's transparent and compact.
 */

/** Hard upper age: everyone has died by here (qx forced to 1). */
export const MORTALITY_MAX_AGE = 120

/**
 * Gompertz hazard parameters: `h(x) = (1/b)·exp((x − m)/b)`. `m` is the modal age
 * at death, `b` the dispersion. These give qx ≈ 1% at 65, ≈ 7% at 85, ≈ 18% at 95,
 * and a median age at death from 65 of ~86 — close to US life-table figures.
 */
export const GOMPERTZ = { m: 88, b: 10 } as const

/** Instantaneous one-year mortality hazard at integer age `age`. */
export function hazard(age: number): number {
  return (1 / GOMPERTZ.b) * Math.exp((age - GOMPERTZ.m) / GOMPERTZ.b)
}

/** Probability of dying within the year beginning at integer age `age` (qx). */
export function mortalityRate(age: number): number {
  if (age >= MORTALITY_MAX_AGE) return 1
  return 1 - Math.exp(-hazard(age))
}

/**
 * Draw an integer age at death strictly greater than `currentAge`, consuming one
 * uniform from `rng`. Walks year by year: the person survives each year with
 * probability `1 − qx`; the first year not survived is the year of death. Capped
 * at {@link MORTALITY_MAX_AGE}.
 */
export function sampleAgeAtDeath(currentAge: number, rng: () => number): number {
  const u = rng()
  let surviveProb = 1
  for (let age = currentAge; age < MORTALITY_MAX_AGE; age++) {
    surviveProb *= 1 - mortalityRate(age)
    if (u > surviveProb) return age + 1
  }
  return MORTALITY_MAX_AGE
}
