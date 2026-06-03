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
import { WithdrawalStrategy } from '../../schema'
import type { Account, OneTimeExpense } from '../../schema'
import {
  ACCOUNT_KIND_LABELS,
  accountKind,
  applyAccountKind,
  kindSupportsMax,
  annualContribOf,
  withAnnualContrib,
  type AccountKind,
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

function Money({ value, onChange, width = 104 }: { value: number; onChange: (v: number) => void; width?: number }) {
  return (
    <span className="lever-value" style={{ padding: '4px 8px', width, justifyContent: 'flex-start' }}>
      <span className="lv-pre">$</span>
      <MoneyInput value={value} onChange={onChange} step={1000} style={{ ...pill, border: 'none', background: 'transparent', padding: 0, width: width - 24 }} />
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
  const { person } = inputs

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
                    ) : (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="micro">adds / yr</span>
                        <Money width={96} value={annual} onChange={(v) => updateAccount(i, (x) => withAnnualContrib(x, v))} />
                      </label>
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
                          onChange={(e) =>
                            updateAccount(i, (x) => ({
                              ...x,
                              employerMatch: e.target.checked ? { type: 'flat', annualAmount: 6_000 } : undefined,
                            }))
                          }
                        />
                        <span className="micro">employer match (flat)</span>
                      </label>
                      {a.employerMatch?.type === 'flat' && (
                        <span style={{ marginLeft: 10 }}>
                          <Money
                            width={96}
                            value={a.employerMatch.annualAmount}
                            onChange={(v) => updateAccount(i, (x) => ({ ...x, employerMatch: { type: 'flat', annualAmount: v } }))}
                          />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addAccount}>+ Add an account</button>
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
          <Acc title="Social Security" value={ss ? `${fmtK(ss.annualAmountPresentDollars)} / yr at ${ss.claimAge}` : 'not included'} defaultOpen>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={!!ss}
                onChange={(e) => patchInputs({ socialSecurity: e.target.checked ? { annualAmountPresentDollars: 30_000, claimAge: 67 } : undefined })}
              />
              <span className="micro">include Social Security</span>
            </label>
            {ss && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="micro">benefit / yr</span>
                  <Money value={ss.annualAmountPresentDollars} onChange={(v) => patchInputs({ socialSecurity: { ...ss, annualAmountPresentDollars: v } })} />
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

          {/* Taxes */}
          <Acc title="Taxes" value={`Flat ${Math.round(person.marginalTaxRate * 100)}% · LTCG ${Math.round(person.ltcgRate * 100)}%`}>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="micro">marginal income tax %</span>
                <input type="number" aria-label="Marginal tax rate" value={Math.round(person.marginalTaxRate * 100)} onChange={(e) => patchPerson({ marginalTaxRate: Number(e.target.value) / 100 })} style={{ ...pill, width: 72 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="micro">long-term capital gains %</span>
                <input type="number" aria-label="LTCG rate" value={Math.round(person.ltcgRate * 100)} onChange={(e) => patchPerson({ ltcgRate: Number(e.target.value) / 100 })} style={{ ...pill, width: 72 }} />
              </label>
            </div>
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>A flat rate tends to overstate retirement tax — it ignores the standard deduction and bracket-filling.</div>
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
            <div className="micro" style={{ color: 'var(--ink-3)', marginTop: 8 }}>Sampled fresh each year, so sequence-of-returns risk is modeled. Historical averages run optimistic at today's valuations.</div>
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
