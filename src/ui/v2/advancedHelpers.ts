/**
 * Pure helpers for the Advanced drawer's account editor — mapping the
 * user-facing account "kind" to the schema's (type, accountSubtype) pair, and
 * annual-contribution conversion. Unit-tested so the drawer stays presentational.
 */
import type { Account, ContributionFrequency, EmployerMatch } from '../../schema'

export type AccountKind = '401k' | 'rothIra' | 'tradIra' | 'taxable'

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  '401k': '401(k)',
  rothIra: 'Roth IRA',
  tradIra: 'Traditional IRA',
  taxable: 'Taxable brokerage',
}

/** Derive the user-facing kind from an account's type + subtype. */
export function accountKind(a: Pick<Account, 'type' | 'accountSubtype'>): AccountKind {
  if (a.type === 'taxable') return 'taxable'
  if (a.type === 'roth') return 'rothIra'
  // traditional
  return a.accountSubtype === 'ira' ? 'tradIra' : '401k'
}

/** Apply a kind choice back onto an account (type + subtype). */
export function applyAccountKind(a: Account, kind: AccountKind): Account {
  switch (kind) {
    case '401k':
      return { ...a, type: 'traditional', accountSubtype: '401k' }
    case 'tradIra':
      return { ...a, type: 'traditional', accountSubtype: 'ira' }
    case 'rothIra':
      return { ...a, type: 'roth', accountSubtype: 'ira' }
    case 'taxable':
      return { ...a, type: 'taxable', accountSubtype: undefined, contributeMax: false }
  }
}

/** Whether this kind can be "maxed" to an IRS limit. */
export function kindSupportsMax(kind: AccountKind): boolean {
  return kind !== 'taxable'
}

/** Annual employee contribution (flat-monthly storage convention used by the editor). */
export function annualContribOf(a: Pick<Account, 'contributionAmount' | 'contributionType' | 'contributionFrequency'>): number {
  if (a.contributionType === 'percent') return 0 // editor stores flat; percent handled elsewhere
  const mult = a.contributionFrequency === 'weekly' ? 52 / 12 : a.contributionFrequency === 'semi-monthly' ? 2 : 1
  return a.contributionAmount * mult * 12
}

/** Set the annual contribution as a flat monthly amount. */
export function withAnnualContrib(a: Account, annual: number): Account {
  return {
    ...a,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionAmount: Math.max(0, annual) / 12,
  }
}

// ─── Contribution frequency (#2: selectable period) ──────────────────────────
export const CONTRIBUTION_FREQUENCIES: ContributionFrequency[] = ['weekly', 'semi-monthly', 'monthly']

export const CONTRIBUTION_FREQUENCY_LABELS: Record<ContributionFrequency, string> = {
  weekly: 'per week',
  'semi-monthly': 'per paycheck',
  monthly: 'per month',
}

/** Change the contribution period, keeping the per-period amount (so the annual total scales). */
export function setContributionFrequency(a: Account, freq: ContributionFrequency): Account {
  return { ...a, contributionType: 'flat', contributionFrequency: freq }
}

// ─── Employer match type (#1: flat vs percent) ───────────────────────────────
export type MatchType = EmployerMatch['type']

/** Sensible default for each match shape. */
export function defaultEmployerMatch(type: MatchType): EmployerMatch {
  return type === 'flat'
    ? { type: 'flat', annualAmount: 6000 }
    : { type: 'percent', matchPercent: 50, upToPercent: 6 }
}

/** Toggle an account's employer match between flat, percent, or off (null). */
export function withMatchType(a: Account, type: MatchType | null): Account {
  if (type === null) return { ...a, employerMatch: undefined }
  // Preserve an existing match of the same shape; otherwise seed a default.
  if (a.employerMatch?.type === type) return a
  return { ...a, employerMatch: defaultEmployerMatch(type) }
}
