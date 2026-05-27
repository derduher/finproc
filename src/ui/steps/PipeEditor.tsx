/**
 * PipeEditor — the bucket-and-pipes visualization for editing a single account.
 *
 * Layout (desktop): 2-col grid.
 *   Left: SVG pipe diagram showing balance bucket + contribute/match/withdrawal/RMD pipes.
 *   Right: editable form fields.
 *
 * On narrow viewports the columns stack via media query in the consumer.
 */
import { Seg } from '../shared/Field'
import type { Account } from '../../schema'

interface Props {
  account: Account
  annualSalary: number
  onChange: (patch: Partial<Account>) => void
  onDelete: () => void
}

function monthlyContrib(acc: Account, annualSalary: number): number {
  if (acc.contributionType === 'percent') {
    return (acc.contributionAmount * annualSalary) / 12
  }
  const mult = acc.contributionFrequency === 'weekly' ? 52 / 12 : acc.contributionFrequency === 'semi-monthly' ? 2 : 1
  return acc.contributionAmount * mult
}

function monthlyMatch(acc: Account, annualSalary: number): number {
  const m = acc.employerMatch
  if (!m) return 0
  if (m.type === 'flat') return m.annualAmount / 12
  // percent: matchPercent % of contribs up to upToPercent% of salary
  const employeeMonthly = monthlyContrib(acc, annualSalary)
  const matchCap = (m.upToPercent / 100) * annualSalary / 12
  return Math.min(employeeMonthly, matchCap) * (m.matchPercent / 100)
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

export function PipeEditor({ account, annualSalary, onChange, onDelete }: Props) {
  const monthly = monthlyContrib(account, annualSalary)
  const match = monthlyMatch(account, annualSalary)
  const showMatch = account.type === 'traditional'
  const showRmd = account.type === 'traditional'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontSize: 15, color: 'var(--ink)' }}>{account.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>
            {account.type} · contributions, {showMatch ? 'match, ' : ''}and withdrawals
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDelete}>Delete account</button>
        </div>
      </div>

      <div data-pipe-editor className="pipe-editor-body">
        {/* LEFT: diagram */}
        <div aria-label="Pipe diagram" style={{ position: 'relative' }}>
          <svg width="100%" height="320" viewBox="0 0 480 320" style={{ display: 'block' }} role="img" aria-label="Account money flow diagram">
            <defs>
              <marker id="pipe-arrow-ink" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0 0 L8 4 L0 8 Z" fill="var(--ink)" />
              </marker>
              <marker id="pipe-arrow-acc" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0 0 L8 4 L0 8 Z" fill="var(--accent)" />
              </marker>
              <marker id="pipe-arrow-bad" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0 0 L8 4 L0 8 Z" fill="var(--bad)" />
              </marker>
            </defs>

            {/* central balance bucket */}
            <rect x="170" y="100" width="160" height="120" rx="6"
              fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.4" />
            <text x="250" y="125" textAnchor="middle" fontFamily="var(--font-body)" fontSize="11"
              fill="var(--accent-ink)" letterSpacing="0.06em">BALANCE</text>
            <text x="250" y="160" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="22"
              fill="var(--accent-ink)" fontWeight="500">{fmtUsd(account.balance)}</text>
            <text x="250" y="180" textAnchor="middle" fontFamily="var(--font-body)" fontSize="11"
              fill="var(--accent-ink)" opacity="0.85">monthly compound</text>
            <text x="250" y="200" textAnchor="middle" fontFamily="var(--font-body)" fontSize="11"
              fill="var(--accent-ink)" opacity="0.85">7% nominal · 4% real</text>

            {/* you contribute pipe (active) */}
            <path d="M 30 70 Q 100 70, 120 130 L 170 145" fill="none" stroke="var(--ink)" strokeWidth="2"
              markerEnd="url(#pipe-arrow-ink)" className="flow-dash" />
            <text x="30" y="58" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">YOU CONTRIBUTE</text>
            <text x="30" y="84" fontFamily="var(--font-mono)" fontSize="14" fill="var(--ink)">{fmtUsd(monthly)} / mo</text>
            {account.contributionType === 'percent' && (
              <text x="30" y="100" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
                = {(account.contributionAmount * 100).toFixed(0)}% of {fmtUsd(annualSalary)} salary
              </text>
            )}
            <text x="30" y="118" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)">
              stops at age <tspan fontFamily="var(--font-mono)" fill="var(--ink)">{account.contributionEndAge}</tspan>
            </text>

            {/* match pipe (traditional only) */}
            {showMatch && match > 0 && (
              <g>
                <path d="M 30 230 Q 100 230, 130 195 L 170 180" fill="none" stroke="var(--accent)" strokeWidth="2"
                  strokeDasharray="3 5" markerEnd="url(#pipe-arrow-acc)" />
                <text x="30" y="220" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">EMPLOYER MATCH</text>
                <text x="30" y="246" fontFamily="var(--font-mono)" fontSize="14" fill="var(--accent-ink)">{fmtUsd(match)} / mo</text>
              </g>
            )}

            {/* withdrawal pipe */}
            <path d="M 330 145 L 380 130 Q 440 130, 460 60" fill="none" stroke="var(--ink-2)" strokeWidth="1.6"
              strokeDasharray="2 4" markerEnd="url(#pipe-arrow-ink)" />
            <text x="450" y="40" textAnchor="end" fontFamily="var(--font-body)" fontSize="11" fill="var(--ink-3)" letterSpacing="0.06em">WITHDRAWALS</text>
            <text x="450" y="58" textAnchor="end" fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink)">
              eligible age {account.withdrawalStartAge}
            </text>

            {/* RMD pipe (traditional only) */}
            {showRmd && (
              <g>
                <path d="M 330 180 L 390 200 Q 440 220, 455 280" fill="none" stroke="var(--bad)" strokeWidth="1.4"
                  strokeDasharray="2 4" markerEnd="url(#pipe-arrow-bad)" />
                <text x="450" y="298" textAnchor="end" fontFamily="var(--font-body)" fontSize="11" fill="var(--bad)" letterSpacing="0.06em">RMD FLOOR</text>
                <text x="450" y="312" textAnchor="end" fontFamily="var(--font-body)" fontSize="11" fill="var(--bad)">forced from age 73</text>
              </g>
            )}
          </svg>
        </div>

        {/* RIGHT: fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>account name</div>
            <input
              data-field="account-name"
              className="field"
              style={{ width: '100%' }}
              value={account.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>type</div>
            <Seg
              aria-label="Account type"
              value={account.type}
              onChange={(v) => onChange({ type: v as Account['type'] })}
              options={[
                { value: 'taxable', label: 'taxable' },
                { value: 'traditional', label: 'traditional' },
                { value: 'roth', label: 'roth' },
              ]}
            />
          </div>

          <div>
            <label htmlFor={`balance-${account.id}`} className="label" style={{ display: 'block', marginBottom: 6 }}>
              current balance
            </label>
            <input
              id={`balance-${account.id}`}
              type="number"
              className="field field-num"
              style={{ width: 160 }}
              value={account.balance}
              step={1000}
              min={0}
              onChange={(e) => onChange({ balance: Number(e.target.value) })}
            />
          </div>

          {account.type === 'taxable' && (
            <div>
              <label htmlFor={`cost-basis-${account.id}`} className="label" style={{ display: 'block', marginBottom: 6 }}>
                cost basis
              </label>
              <input
                id={`cost-basis-${account.id}`}
                type="number"
                className="field field-num"
                style={{ width: 160 }}
                value={account.costBasis ?? 0}
                step={1000}
                min={0}
                onChange={(e) => onChange({ costBasis: Number(e.target.value) })}
              />
              <div className="micro" style={{ marginTop: 4 }}>
                After-tax money already paid into this account. Withdrawals up to this amount aren&apos;t taxed again.
              </div>
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 6 }}>contributions</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Seg
                aria-label="Contribution type"
                value={account.contributionType}
                onChange={(v) => onChange({ contributionType: v as Account['contributionType'] })}
                options={[
                  { value: 'flat', label: 'flat $' },
                  { value: 'percent', label: '% salary' },
                ]}
              />
              <input
                type="number"
                className="field field-num"
                style={{ width: 90 }}
                value={account.contributionType === 'percent' ? account.contributionAmount * 100 : account.contributionAmount}
                step={account.contributionType === 'percent' ? 0.5 : 50}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  onChange({ contributionAmount: account.contributionType === 'percent' ? n / 100 : n })
                }}
              />
              <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                {account.contributionType === 'percent' ? '%' : '/ period'}
              </span>
              <Seg
                aria-label="Contribution frequency"
                value={account.contributionFrequency}
                onChange={(v) => onChange({ contributionFrequency: v as Account['contributionFrequency'] })}
                options={[
                  { value: 'weekly', label: 'weekly' },
                  { value: 'semi-monthly', label: 'semi' },
                  { value: 'monthly', label: 'monthly' },
                ]}
              />
            </div>
            <div className="micro" style={{ marginTop: 6 }}>
              ≈ {fmtUsd(monthly)} / month. Stops at age <span className="num">{account.contributionEndAge}</span>.
            </div>
          </div>

          {showMatch && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>employer match</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--ink-2)' }}>
                <input
                  type="checkbox"
                  aria-label="Enable employer match"
                  checked={account.employerMatch !== undefined}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange({ employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 } })
                    } else {
                      onChange({ employerMatch: undefined })
                    }
                  }}
                />
                enable employer match
              </label>
              {account.employerMatch && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Seg
                    aria-label="Match type"
                    value={account.employerMatch.type}
                    onChange={(v) => {
                      if (v === 'percent') {
                        onChange({ employerMatch: { type: 'percent', matchPercent: 50, upToPercent: 6 } })
                      } else {
                        onChange({ employerMatch: { type: 'flat', annualAmount: 6000 } })
                      }
                    }}
                    options={[
                      { value: 'percent', label: '% of contribs' },
                      { value: 'flat', label: 'flat $/yr' },
                    ]}
                  />
                  {account.employerMatch.type === 'percent' ? (
                    <>
                      <label htmlFor={`match-pct-${account.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
                        <span>match</span>
                        <input
                          id={`match-pct-${account.id}`}
                          aria-label="Match percent"
                          type="number"
                          className="field field-num"
                          style={{ width: 70 }}
                          value={account.employerMatch.matchPercent}
                          step={5}
                          min={0}
                          max={100}
                          onChange={(e) => {
                            const m = account.employerMatch
                            if (m && m.type === 'percent') {
                              onChange({ employerMatch: { ...m, matchPercent: Number(e.target.value) } })
                            }
                          }}
                        />
                        <span>%</span>
                      </label>
                      <label htmlFor={`match-cap-${account.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
                        <span>up to</span>
                        <input
                          id={`match-cap-${account.id}`}
                          aria-label="Up to percent of salary"
                          type="number"
                          className="field field-num"
                          style={{ width: 70 }}
                          value={account.employerMatch.upToPercent}
                          step={0.5}
                          min={0}
                          max={100}
                          onChange={(e) => {
                            const m = account.employerMatch
                            if (m && m.type === 'percent') {
                              onChange({ employerMatch: { ...m, upToPercent: Number(e.target.value) } })
                            }
                          }}
                        />
                        <span>% of salary</span>
                      </label>
                    </>
                  ) : (
                    <label htmlFor={`match-flat-${account.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
                      <input
                        id={`match-flat-${account.id}`}
                        aria-label="Annual match amount"
                        type="number"
                        className="field field-num"
                        style={{ width: 100 }}
                        value={account.employerMatch.annualAmount}
                        step={500}
                        min={0}
                        onChange={(e) => {
                          const m = account.employerMatch
                          if (m && m.type === 'flat') {
                            onChange({ employerMatch: { ...m, annualAmount: Number(e.target.value) } })
                          }
                        }}
                      />
                      <span>$ / yr</span>
                    </label>
                  )}
                </div>
              )}
              {account.employerMatch && match > 0 && (
                <div className="micro" style={{ marginTop: 6 }}>
                  ≈ {fmtUsd(match)} / month employer contribution
                </div>
              )}
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 6 }}>contribute until age</div>
            <input
              type="number"
              className="field field-num"
              style={{ width: 90 }}
              value={account.contributionEndAge}
              onChange={(e) => onChange({ contributionEndAge: Number(e.target.value) })}
            />
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              {account.type === 'taxable' ? 'plan-draw age' : 'withdrawals eligible at age'}
            </div>
            <input
              type="number"
              className="field field-num"
              style={{ width: 90 }}
              value={account.withdrawalStartAge}
              onChange={(e) => onChange({ withdrawalStartAge: Number(e.target.value) })}
            />
            <div className="micro" style={{ marginTop: 4 }}>
              {account.type === 'taxable'
                ? 'Taxable accounts have no IRS age restriction — this is just when your plan starts drawing from this bucket.'
                : account.type === 'traditional'
                  ? 'IRS rule of thumb: 59½ for IRA, age 55+ separation for 401(k). 10% penalty for earlier withdrawals.'
                  : 'Roth contributions are always available; gains have a 59½ rule. Penalty for early gain withdrawals.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
