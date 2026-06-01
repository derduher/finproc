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

/**
 * Annual contribution limit in dollars for a given account subtype.
 * Returns 0 for unknown/undefined subtypes or 'other' (no IRS cap).
 */
export function irsContributionLimit(subtype: AccountSubtype | undefined): number {
  if (!subtype) return 0
  return LIMITS_2026[subtype] ?? 0
}
