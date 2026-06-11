/**
 * AdvancedDrawer — progressive disclosure of the "lesser customized" inputs
 * (methodology: sensible defaults, advanced tucked away). A slide-over that edits
 * the store live, so the projection underneath updates as you change things.
 *
 * Covers the inputs the design requires editable: 401(k)/IRA/taxable accounts,
 * employer match, one-time expenditures, and Social Security — plus plan-to age,
 * taxes, withdrawal order, and market returns.
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { MoneyInput } from '../shared/MoneyInput'
import { WithdrawalStrategy, EXPENSE_CATEGORIES } from '../../schema'
import type { Account, OneTimeExpense, ContributionFrequency, ExpenseItem } from '../../schema'
import { createExpenseItem } from '../../sim/expenses'
import { suggestedExpenses } from '../../sim/expenseSuggestions'
import {
  ACCOUNT_KIND_LABELS,
  accountKind,
  applyAccountKind,
  kindSupportsMax,
  annualContribOf,
  setContributionFrequency,
  CONTRIBUTION_FREQUENCIES,
  CONTRIBUTION_FREQUENCY_LABELS,
  withMatchType,
  type AccountKind,
  type MatchType,
} from './advancedHelpers'

function Acc({
  title,
  value,
  defaultOpen = false,
  children,
}: {
  title: string
  value: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="acc">
      <div className="acc-head" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M3 2 L7.5 5.5 L3 9" fill="none" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="acc-title">{title}</span>
        </div>
        <span className="acc-val">{value}</span>
      </div>
      {open && <div className="acc-body">{children}</div>}
    </div>
  )
}

const pill: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--bg-elev)',
  borderRadius: 'var(--radius-2)',
  padding: '5px 9px',
  font: 'inherit',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
}

function Money({ value, onChange, width = 104, step = 1000 }: { value: number; onChange: (v: number) => void; width?: number; step?: number }) {
  return (
    <span className="lever-value" style={{ padding: '4px 8px', width, justifyContent: 'flex-start' }}>
      <span className="lv-pre">$</span>
      <MoneyInput value={value} onChange={onChange} step={step} style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: width - 24 }} />
    </span>
  )
}

function fmtK(v: number) {
  return v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`
}

export function AdvancedDrawer({ onClose }: { onClose: () => void }) {
  const inputs = useStore((s) => s.inputs)
  const patchInputs = useStore((s) => s.patchInputs)
  const patchPerson = useStore((s) => s.patchPerson)
  const setBaselineExpenses = useStore((s) => s.setBaselineExpenses)
  const { person } = inputs

  const baseline = inputs.baselineExpenses
  const updateBaseline = (id: string, patch: Partial<ExpenseItem>) =>
    setBaselineExpenses(baseline.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const removeBaseline = (id: string) => setBaselineExpenses(baseline.filter((it) => it.id !== id))
  const addBaseline = () => setBaselineExpenses([...baseline, createExpenseItem({ label: 'New expense' })])
  const suggestions = suggestedExpenses(inputs)

  const setAccounts = (accounts: Account[]) => patchInputs({ accounts })
  const updateAccount = (i: number, fn: (a: Account) => Account) =>
    setAccounts(inputs.accounts.map((a, j) => (j === i ? fn(a) : a)))
  const addAccount = () =>
    setAccounts([
      ...inputs.accounts,
      {
        id: `acct_${Date.now()}`,
        name: 'New account',
        type: 'taxable',
        balance: 0,
        contributionAmount: 0,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: person.retirementAge,
        withdrawalStartAge: person.retirementAge,
      },
    ])

  const setExpenses = (oneTimeExpenses: OneTimeExpense[]) => patchInputs({ oneTimeExpenses })
  const addExpense = () =>
    setExpenses([
      ...inputs.oneTimeExpenses,
      { id: `exp_${Date.now()}`, label: 'Big expense', age: person.retirementAge, amountPresentDollars: 25_000 },
    ])

  const ss = inputs.socialSecurity
  const savedTotal = inputs.accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="label" style={{ marginBottom: 4 }}>advanced</div>
            <h2 style={{ fontSize: 20, margin: 0 }}>Assumptions &amp; detail</h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, maxWidth: 340 }}>
              Everything here has a sensible default. Change only what you know — the rest stays out of your way.
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" aria-label="Close advanced" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          {/* Accounts */}
          <Acc title="Accounts" value={`${fmtK(savedTotal)} · ${inputs.accounts.length} account${inputs.accounts.length === 1 ? '' : 's'}`} defaultOpen>
            {inputs.accounts.map((a, i) => {
              const kind = accountKind(a)
              const annual = annualContribOf(a)
              return (
                <div key={a.id} style={{ padding: '10px 0', borderTop: '1px dashed var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      aria-label="Account name"
                      value={a.name}
                      onChange={(e) => updateAccount(i, (x) => ({ ...x, name: e.target.value }))}
                      style={{ ...pill, flex: 1 }}
                    />
                    <button className="btn btn-sm btn-ghost" aria-label="Remove account" onClick={() => setAccounts(inputs.accounts.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="micro">kind</span>
                      <select
                        aria-label="Account kind"
                        value={kind}
                        onChange={(e) => updateAccount(i, (x) => applyAccountKind(x, e.target.value as AccountKind))}
                        style={pill}
                      >
                        {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map((k) => (
                          <option key={k} value={k}>{ACCOUNT_KIND_LABELS[k]}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="micro">balance</span>
                      <Money value={a.balance} onChange={(v) => updateAccount(i, (x) => ({ ...x, balance: v }))} />
                    </label>
                    {a.contributeMax && kindSupportsMax(kind) ? (
                      <span className="defpill" style={{ color: 'var(--good)' }}>at annual max</span>
                    ) : a.contributionType === 'percent' ? (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="micro">adds</span>
                        <span className="lever-value" style={{ padding: '4px 8px' }}>
                          <input
                            type="number"
                            aria-label="Contribution percent"
                            value={Math.round(a.contributionAmount * 100)}
                            onChange={(e) => updateAccount(i, (x) => ({ ...x, contributionAmount: Math.max(0, Number(e.target.value)) / 100 }))}
                            style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: 44 }}
                          />
                          <span className="lv-suf">% of pay</span>
                        </span>
                      </label>
                    ) : (
                      <>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="micro">adds</span>
                          <Money width={96} step={50} value={a.contributionAmount} onChange={(v) => updateAccount(i, (x) => ({ ...x, contributionType: 'flat', contributionAmount: Math.max(0, v) }))} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="micro">how often</span>
                          <select
                            aria-label="Contribution frequency"
                            value={a.contributionFrequency}
                            onChange={(e) => updateAccount(i, (x) => setContributionFrequency(x, e.target.value as ContributionFrequency))}
                            style={pill}
                          >
                            {CONTRIBUTION_FREQUENCIES.map((f) => (
                              <option key={f} value={f}>{CONTRIBUTION_FREQUENCY_LABELS[f]}</option>
                            ))}
                          </select>
                        </label>
                        <span className="micro" style={{ color: 'var(--ink-3)', paddingBottom: 7 }}>≈ {fmtK(annual)}/yr</span>
                      </>
                    )}
                  </div>
                  {kindSupportsMax(kind) && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!a.contributeMax}
                        onChange={(e) => updateAccount(i, (x) => ({ ...x, contributeMax: e.target.checked }))}
                      />
                      <span className="micro">contribute the IRS annual maximum</span>
                    </label>
                  )}
                  {a.type === 'traditional' && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!a.employerMatch}
                          onChange={(e) => updateAccount(i, (x) => withMatchType(x, e.target.checked ? 'flat' : null))}
                        />
                        <span className="micro">employer match</span>
                      </label>
                      {a.employerMatch && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                          <select
                            aria-label="Match type"
                            value={a.employerMatch.type}
                            onChange={(e) => updateAccount(i, (x) => withMatchType(x, e.target.value as MatchType))}
                            style={pill}
                          >
                            <option value="flat">flat $ / yr</option>
                            <option value="percent">% of salary</option>
                          </select>
                          {a.employerMatch.type === 'flat' ? (
                            <Money
                              width={96}
                              value={a.employerMatch.annualAmount}
                              onChange={(v) => updateAccount(i, (x) => ({ ...x, employerMatch: { type: 'flat', annualAmount: v } }))}
                            />
                          ) : (
                            <>
                              <span className="lever-value" style={{ padding: '4px 8px' }}>
                                <input
                                  type="number"
                                  aria-label="Match percent"
                                  value={a.employerMatch.matchPercent}
                                  onChange={(e) =>
                                    updateAccount(i, (x) =>
                                      x.employerMatch?.type === 'percent'
                                        ? { ...x, employerMatch: { ...x.employerMatch, matchPercent: Math.max(0, Number(e.target.value)) } }
                                        : x,
                                    )
                                  }
                                  style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: 40 }}
                                />
                                <span className="lv-suf">% match</span>
                              </span>
                              <span className="micro">up to</span>
                              <span className="lever-value" style={{ padding: '4px 8px' }}>
                                <input
                                  type="number"
                                  aria-label="Match up-to percent"
                                  value={a.employerMatch.upToPercent}
                                  onChange={(e) =>
                                    updateAccount(i, (x) =>
                                      x.employerMatch?.type === 'percent'
                                        ? { ...x, employerMatch: { ...x.employerMatch, upToPercent: Math.max(0, Number(e.target.value)) } }
                                        : x,
                                    )
                                  }
                                  style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: 40 }}
                                />
                                <span className="lv-suf">% of pay</span>
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addAccount}>+ Add an account</button>
          </Acc>

          {/* Baseline expenses */}
          <Acc
            title="Baseline expenses"
            value={`${fmtK(inputs.annualExpenses)}/yr · ${baseline.length} item${baseline.length === 1 ? '' : 's'}`}
            defaultOpen
          >
            <div data-testid="baseline-expenses-section">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {baseline.map((it) => (
                  <div data-baseline-item key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      aria-label="Baseline expense name"
                      value={it.label}
                      onChange={(e) => updateBaseline(it.id, { label: e.target.value })}
                      style={{ ...pill, flex: '1 1 130px', minWidth: 110 }}
                    />
                    <select
                      aria-label="Baseline expense category"
                      value={it.category}
                      onChange={(e) => updateBaseline(it.id, { category: e.target.value as ExpenseItem['category'] })}
                      style={{ ...pill, textTransform: 'capitalize' }}
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span className="lever-value" style={{ padding: '4px 8px' }}>
                      <span className="lv-pre">$</span>
                      <input
                        type="number"
                        aria-label="Baseline expense amount"
                        min={0}
                        step={500}
                        value={it.annualAmountPresentDollars}
                        onChange={(e) => updateBaseline(it.id, { annualAmountPresentDollars: Math.max(0, Number(e.target.value)) })}
                        style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: 76 }}
                      />
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      aria-label="Remove baseline expense"
                      disabled={baseline.length <= 1}
                      onClick={() => removeBaseline(it.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addBaseline}>
                + add baseline expense
              </button>

              {suggestions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="micro" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>commonly missed — click to add</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {suggestions.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className="btn btn-sm btn-ghost"
                        title={s.blurb}
                        onClick={() =>
                          setBaselineExpenses([
                            ...baseline,
                            createExpenseItem({ label: s.label, category: s.category, annualAmountPresentDollars: s.annualAmountPresentDollars }),
                          ])
                        }
                        style={{ border: '1px dashed var(--line-strong)' }}
                      >
                        + {s.label} <span className="micro" style={{ color: 'var(--ink-3)' }}>{fmtK(s.annualAmountPresentDollars)}/yr</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="micro" style={{ marginTop: 8, color: 'var(--ink-3)' }}>
                Recurring annual spending in today's $. The total flows into the projection.
              </div>
            </div>
          </Acc>

          {/* One-time expenditures */}
          <Acc title="One-time expenditures" value={`${inputs.oneTimeExpenses.length} planned`} defaultOpen={inputs.oneTimeExpenses.length > 0}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inputs.oneTimeExpenses.map((e, i) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="ldot" style={{ background: 'var(--accent)' }} />
                  <Money width={92} value={e.amountPresentDollars} onChange={(v) => setExpenses(inputs.oneTimeExpenses.map((x, j) => (j === i ? { ...x, amountPresentDollars: v } : x)))} />
                  <span className="micro">at age</span>
                  <input
                    type="number"
                    aria-label="Expense age"
                    value={e.age}
                    onChange={(ev) => setExpenses(inputs.oneTimeExpenses.map((x, j) => (j === i ? { ...x, age: Number(ev.target.value) } : x)))}
                    style={{ ...pill, width: 56 }}
                  />
                  <input
                    aria-label="Expense label"
                    value={e.label}
                    onChange={(ev) => setExpenses(inputs.oneTimeExpenses.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))}
                    style={{ ...pill, flex: 1 }}
                  />
                  <button className="btn btn-sm btn-ghost" aria-label="Remove expense" onClick={() => setExpenses(inputs.oneTimeExpenses.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addExpense}>+ Add a big expense (home, car, gift…)</button>
            <div className="micro" style={{ marginTop: 8, color: 'var(--ink-3)' }}>
              These show as <span className="ldot" style={{ background: 'var(--accent)' }} /> markers on the chart.
            </div>
          </Acc>

          {/* Social Security */}
          <Acc title="Social Security" value={ss ? `${fmtK(Math.round(ss.annualAmountPresentDollars / 12))} / mo at ${ss.claimAge}` : 'not included'} defaultOpen>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={!!ss}
                onChange={(e) => patchInputs({ socialSecurity: e.target.checked ? { annualAmountPresentDollars: 30_000, claimAge: 67 } : undefined })}
              />
              <span className="micro">include Social Security</span>
            </label>
            {ss && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="micro">benefit / mo</span>
                  <Money
                    step={50}
                    value={Math.round(ss.annualAmountPresentDollars / 12)}
                    onChange={(v) => patchInputs({ socialSecurity: { ...ss, annualAmountPresentDollars: Math.max(0, v) * 12 } })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="micro">claim at age</span>
                  <input
                    type="number"
                    aria-label="Claim age"
                    min={62}
                    max={70}
                    value={ss.claimAge}
                    onChange={(e) => patchInputs({ socialSecurity: { ...ss, claimAge: Number(e.target.value) } })}
                    style={{ ...pill, width: 56 }}
                  />
                </label>
                <span className="micro" style={{ color: 'var(--ink-3)', paddingBottom: 7 }}>≈ {fmtK(ss.annualAmountPresentDollars)}/yr · today's $</span>
              </div>
            )}
          </Acc>

          {/* Withdrawal order */}
          <Acc title="Withdrawal order" value={inputs.withdrawalStrategy === WithdrawalStrategy.TaxOptimal ? 'Tax-optimal' : inputs.withdrawalStrategy === WithdrawalStrategy.Proportional ? 'Proportional' : 'Custom'}>
            <select
              aria-label="Withdrawal strategy"
              value={inputs.withdrawalStrategy}
              onChange={(e) => patchInputs({ withdrawalStrategy: e.target.value as WithdrawalStrategy })}
              style={pill}
            >
              <option value={WithdrawalStrategy.TaxOptimal}>Tax-optimal (taxable → traditional → Roth)</option>
              <option value={WithdrawalStrategy.Proportional}>Proportional</option>
              <option value={WithdrawalStrategy.UserDefined}>Custom order</option>
            </select>
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>RMDs are honored from age 73 regardless of order.</div>
          </Acc>

          {/* Longevity */}
          <Acc title="Longevity" value={(inputs.longevity ?? 'fixed') === 'stochastic' ? 'Modeled' : `Fixed to ${person.maxAge}`}>
            <select
              aria-label="Longevity model"
              value={inputs.longevity ?? 'fixed'}
              onChange={(e) => patchInputs({ longevity: e.target.value as 'fixed' | 'stochastic' })}
              style={pill}
            >
              <option value="fixed">Plan to a fixed age ({person.maxAge})</option>
              <option value="stochastic">Model lifespan (actuarial)</option>
            </select>
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
              A fixed end age is arbitrary and drives the headline. Modeling lifespan draws an age at
              death per run from a Gompertz mortality curve, so the success rate reflects the spread of
              how long you might live rather than one guess.
            </div>
          </Acc>

          {/* Taxes */}
          <Acc title="Taxes" value={(person.filingStatus ?? 'single') === 'married' ? 'Married' : 'Single'}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="micro">filing status</span>
                <select
                  aria-label="Filing status"
                  value={person.filingStatus ?? 'single'}
                  onChange={(e) => patchPerson({ filingStatus: e.target.value as 'single' | 'married' })}
                  style={pill}
                >
                  <option value="single">Single</option>
                  <option value="married">Married filing jointly</option>
                </select>
              </label>
            </div>
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>Working years and retirement both use progressive federal brackets for your filing status — the standard deduction, partial Social Security taxation, and 0/15/20% capital gains — plus 7.65% FICA on salary. State tax isn't modeled.</div>
          </Acc>

          {/* Plan-to age */}
          <Acc title="Plan-to age" value={`${person.maxAge}`}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="micro">plan through age</span>
              <input type="number" aria-label="Plan-to age" min={person.retirementAge + 1} max={120} value={person.maxAge} onChange={(e) => patchPerson({ maxAge: Number(e.target.value) })} style={{ ...pill, width: 72 }} />
            </label>
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>Longevity is a genuine unknown — try planning to 90 and to 100 to see the spread.</div>
          </Acc>

          {/* Market returns */}
          <Acc title="Market returns" value={`${Math.round(((inputs.initialStockGrowthMin + inputs.initialStockGrowthMax) / 2) * 100)}% nominal · ${Math.round(((inputs.initialInflationMin + inputs.initialInflationMax) / 2) * 100)}% inflation`}>
            <RangeRow
              label="stock growth (P10–P90)"
              min={inputs.initialStockGrowthMin}
              max={inputs.initialStockGrowthMax}
              onMin={(v) => patchInputs({ initialStockGrowthMin: v })}
              onMax={(v) => patchInputs({ initialStockGrowthMax: v })}
            />
            <RangeRow
              label="inflation (P10–P90)"
              min={inputs.initialInflationMin}
              max={inputs.initialInflationMax}
              onMin={(v) => patchInputs({ initialInflationMin: v })}
              onMax={(v) => patchInputs({ initialInflationMax: v })}
            />
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>Sampled fresh each year (sequence-of-returns risk modeled), with returns and inflation negatively correlated so high-inflation years tend to be low-return years. Historical averages run optimistic at today's valuations.</div>
          </Acc>
        </div>

        <div className="drawer-foot">
          <span className="micro">changes apply live</span>
          <button className="btn btn-sm btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  )
}

function RangeRow({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string
  min: number
  max: number
  onMin: (v: number) => void
  onMax: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', width: 160 }}>{label}</span>
      <input type="number" aria-label={`${label} min`} value={(min * 100).toFixed(1)} step={0.5} onChange={(e) => onMin(Number(e.target.value) / 100)} style={{ ...pill, width: 64 }} />
      <span className="micro">to</span>
      <input type="number" aria-label={`${label} max`} value={(max * 100).toFixed(1)} step={0.5} onChange={(e) => onMax(Number(e.target.value) / 100)} style={{ ...pill, width: 64 }} />
      <span className="micro">%</span>
    </div>
  )
}
