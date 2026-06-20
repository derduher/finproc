/**
 * CoreLevers — the always-visible plan inputs on the live screen. Age, retirement
 * age, and target spend are editable in place (they patch the store); "saved" and
 * "adding" are derived summaries (full account editing lives in Advanced).
 */
import { useStore } from '../../store'
import { MoneyInput } from '../shared/MoneyInput'
import { SheetField } from '../shared/SheetField'
import { irsContributionLimit } from '../../sim/irsLimits'
import type { SimulationInputs } from '../../schema'

const FREQ: Record<SimulationInputs['accounts'][number]['contributionFrequency'], number> = {
  weekly: 52 / 12,
  'semi-monthly': 2,
  monthly: 1,
}

/** Total starting balance across accounts. */
export function totalSaved(inputs: SimulationInputs): number {
  return inputs.accounts.reduce((s, a) => s + a.balance, 0)
}

/** Approximate annual employee additions (excludes employer match), for display. */
export function annualAdditions(inputs: SimulationInputs): number {
  const salary = inputs.person.annualSalary
  let total = 0
  for (const a of inputs.accounts) {
    if (a.contributeMax) {
      const limit = irsContributionLimit(a.accountSubtype)
      if (limit > 0) {
        total += limit
        continue
      }
    }
    const monthly =
      a.contributionType === 'percent'
        ? (a.contributionAmount * salary) / 12
        : a.contributionAmount * FREQ[a.contributionFrequency]
    total += monthly * 12
  }
  return total
}

function Lever({
  label,
  children,
  sub,
  focus,
}: {
  label: string
  children: React.ReactNode
  sub?: string
  focus?: boolean
}) {
  return (
    <div className="lever">
      <span className="lever-label">{label}</span>
      <div className={'lever-value' + (focus ? ' focus' : '')}>{children}</div>
      {sub && <div className="micro">{sub}</div>}
    </div>
  )
}

const numInput: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'var(--ink)',
  width: 56,
  outline: 'none',
}

export function CoreLevers() {
  const inputs = useStore((s) => s.inputs)
  const patchPerson = useStore((s) => s.patchPerson)
  const setExpensesTotal = useStore((s) => s.setExpensesTotal)
  const { person } = inputs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Lever label="I'm">
        <SheetField label="Current age" display={`${person.currentAge} yrs old`} triggerClassName="sheet-trigger-bare">
          <input
            type="number"
            aria-label="Current age"
            value={person.currentAge}
            min={18}
            max={person.maxAge - 1}
            style={numInput}
            onChange={(e) => patchPerson({ currentAge: Number(e.target.value) })}
          />
          <span className="lv-suf">yrs old</span>
        </SheetField>
      </Lever>

      <Lever label="Retiring at">
        <SheetField label="Retirement age" display={String(person.retirementAge)} triggerClassName="sheet-trigger-bare">
          <input
            type="number"
            aria-label="Retirement age"
            value={person.retirementAge}
            min={person.currentAge}
            max={person.maxAge}
            style={numInput}
            onChange={(e) => patchPerson({ retirementAge: Number(e.target.value) })}
          />
        </SheetField>
      </Lever>

      <Lever label="Saved today" sub={`across ${inputs.accounts.length} account${inputs.accounts.length === 1 ? '' : 's'}`}>
        <span className="lv-pre">$</span>
        <span style={{ fontSize: 16 }}>{totalSaved(inputs).toLocaleString('en-US')}</span>
      </Lever>

      <Lever label="Adding" sub="edit accounts in Advanced">
        <span className="lv-pre">$</span>
        <span style={{ fontSize: 16 }}>{Math.round(annualAdditions(inputs)).toLocaleString('en-US')}</span>
        <span className="lv-suf">/ yr</span>
      </Lever>

      <Lever label="Target spend" focus>
        <SheetField label="Target annual spend" display={`$${inputs.annualExpenses.toLocaleString('en-US')} / yr`} triggerClassName="sheet-trigger-bare">
          <span className="lv-pre">$</span>
          <MoneyInput
            aria-label="Target annual spend"
            value={inputs.annualExpenses}
            onChange={(v) => setExpensesTotal(v)}
            step={1000}
            style={{ ...numInput, width: 90, fontSize: 16 }}
          />
          <span className="lv-suf">/ yr</span>
        </SheetField>
      </Lever>
    </div>
  )
}
