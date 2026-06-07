/**
 * GuidedFirstRun — the hybrid intro (methodology: minimal friction). Three
 * questions with sensible defaults, then it collapses into the live screen. We
 * fill in everything else (returns, taxes, withdrawal order, SS) with documented
 * defaults the user can refine in Advanced.
 */
import { useState } from 'react'
import { defaultInputs, WithdrawalStrategy } from '../../schema'
import type { SimulationInputs } from '../../schema'
import { MoneyInput } from '../shared/MoneyInput'
import { TopBar2 } from './TopBar2'

/** Build a full plan from the three first-run answers + sensible defaults. */
export function buildFirstRunInputs(a: {
  currentAge: number
  retireAge: number
  saved: number
  addingMonthly: number
  targetSpend: number
}): SimulationInputs {
  const base = defaultInputs()
  const addingAnnual = Math.round(a.addingMonthly * 12)
  // Salary high enough that, after tax, it covers spending + contributions during
  // working years (avoids spurious pre-retirement drawdown). Refine in Advanced.
  const salary = Math.max(60_000, Math.round((a.targetSpend + addingAnnual) / (1 - 0.24)))
  return {
    ...base,
    scenarioName: 'My plan',
    person: {
      ...base.person,
      currentAge: a.currentAge,
      retirementAge: a.retireAge,
      maxAge: 95,
      annualSalary: salary,
      marginalTaxRate: 0.24,
      ltcgRate: 0.15,
    },
    accounts: [
      {
        id: 'k401',
        name: '401(k)',
        type: 'traditional',
        balance: a.saved,
        contributionAmount: addingAnnual / 12,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionEndAge: a.retireAge,
        withdrawalStartAge: a.retireAge,
        accountSubtype: '401k',
      },
    ],
    annualExpenses: a.targetSpend,
    baselineExpenses: [
      { id: 'general', label: 'General living', category: 'other', annualAmountPresentDollars: a.targetSpend },
    ],
    socialSecurity: { annualAmountPresentDollars: 30_000, claimAge: 67 },
    withdrawalStrategy: WithdrawalStrategy.TaxOptimal,
    spendingPolicy: 'flat',
  }
}

const fieldBox: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'var(--ink)',
  outline: 'none',
}

function BigField({
  pre,
  suf,
  value,
  onChange,
  width = 110,
  money = false,
  focus = false,
}: {
  pre?: string
  suf?: string
  value: number
  onChange: (v: number) => void
  width?: number
  money?: boolean
  focus?: boolean
}) {
  return (
    <div className={'lever-value' + (focus ? ' focus' : '')} style={{ padding: '12px 16px' }}>
      {pre && <span className="lv-pre" style={{ fontSize: 18 }}>{pre}</span>}
      {money ? (
        <MoneyInput value={value} onChange={onChange} step={1000} style={{ ...fieldBox, fontSize: 24, width }} />
      ) : (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...fieldBox, fontSize: 24, width }}
        />
      )}
      {suf && <span className="lv-suf" style={{ fontSize: 14 }}>{suf}</span>}
    </div>
  )
}

function BigAsk({ n, q, children }: { n: string; q: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', padding: '22px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 999, flex: 'none', background: 'var(--bg-sunk)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 2 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, color: 'var(--ink)', marginBottom: 14, lineHeight: 1.25 }}>{q}</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
      </div>
    </div>
  )
}

export function GuidedFirstRun({ onComplete }: { onComplete: (inputs: SimulationInputs) => void }) {
  const [currentAge, setCurrentAge] = useState(42)
  const [retireAge, setRetireAge] = useState(65)
  const [saved, setSaved] = useState(340_000)
  const [addingMonthly, setAddingMonthly] = useState(2_540)
  const [targetSpend, setTargetSpend] = useState(80_000)

  const submit = () =>
    onComplete(buildFirstRunInputs({ currentAge, retireAge, saved, addingMonthly, targetSpend }))

  return (
    <div className="hf" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <TopBar2 actions={false} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '44px 32px' }}>
        <div style={{ width: 660 }}>
          <div className="label" style={{ marginBottom: 10 }}>let's get a rough picture</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.12, marginBottom: 10 }}>
            Three quick questions, then a projection you can play with.
          </h1>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 22, maxWidth: 540 }}>
            We'll fill in everything else — returns, taxes, withdrawal order — with sensible defaults you can refine later. Numbers are in today's dollars.
          </div>

          <BigAsk n="1" q="How old are you, and when do you hope to retire?">
            <BigField value={currentAge} onChange={setCurrentAge} suf="yrs old" width={70} />
            <span style={{ color: 'var(--ink-3)' }}>retiring at</span>
            <BigField value={retireAge} onChange={setRetireAge} width={60} />
          </BigAsk>

          <BigAsk n="2" q="Roughly how much have you saved — and how much are you adding?">
            <BigField pre="$" value={saved} onChange={setSaved} money width={140} />
            <span style={{ color: 'var(--ink-3)' }}>plus</span>
            <BigField pre="$" value={addingMonthly} onChange={setAddingMonthly} money suf="/ mo" width={110} />
          </BigAsk>

          <BigAsk n="3" q="What would you like to spend each year, once retired?">
            <BigField pre="$" value={targetSpend} onChange={setTargetSpend} money suf="/ yr" width={150} focus />
            <span className="micro">we'll also show what's sustainable</span>
          </BigAsk>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 380, lineHeight: 1.5 }}>
              Defaults we'll assume: a 401(k) for your savings, historical returns, a flat tax estimate, Social Security at 67, tax-optimal withdrawals, plan to age 95. All editable.
            </div>
            <button className="btn btn-primary" style={{ height: 44, padding: '0 22px', fontSize: 15 }} onClick={submit}>
              Show my projection →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
