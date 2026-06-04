/**
 * IRS contribution limits.
 *
 * Hard-coded for 2026. Update annually as the IRS announces COLA increases.
 * Used when an account is flagged `contributeMax: true` — the simulation
 * derives the effective monthly contribution from these limits / 12, ignoring
 * the user-entered `contributionAmount`.
 */
export type AccountSubtype = '401k' | 'ira' | 'other'

const LIMITS_2026: Record<AccountSubtype, number> = {
  '401k': 24500, // 2026 employee elective deferral limit (employer match excluded)
  ira: 7500,    // 2026 traditional/Roth IRA contribution limit (under 50)
  other: 0,
}

/** Age at which the IRS allows additional "catch-up" contributions. */
export const CATCH_UP_AGE = 50

/** 2026 catch-up amounts (added to the base limit from {@link CATCH_UP_AGE}). */
const CATCH_UP_2026: Record<AccountSubtype, number> = {
  '401k': 8000, // 2026 401(k) catch-up (standard 50+; SECURE 2.0 super catch-up not modeled)
  ira: 1100,    // 2026 IRA catch-up (50+)
  other: 0,
}

/**
 * Annual contribution limit in dollars for a given account subtype, adjusted for
 * age (50+ catch-up) and inflation (COLA).
 *
 * @param subtype     Account subtype; 'other'/undefined have no IRS cap → 0.
 * @param age         Current age; at or past {@link CATCH_UP_AGE} the catch-up is added.
 * @param colaFactor  Cumulative price level (today = 1) used to grow the nominal
 *                    2026 limits with inflation, so a `contributeMax` saver keeps
 *                    contributing the same *real* amount over a long horizon
 *                    instead of having the frozen nominal cap erode.
 */
export function irsContributionLimit(
  subtype: AccountSubtype | undefined,
  age: number = 0,
  colaFactor: number = 1,
): number {
  if (!subtype) return 0
  const base = LIMITS_2026[subtype] ?? 0
  if (base === 0) return 0
  const catchUp = age >= CATCH_UP_AGE ? CATCH_UP_2026[subtype] ?? 0 : 0
  return (base + catchUp) * colaFactor
}
