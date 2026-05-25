import { useState } from 'react'
import { Field, NumInput } from '../shared/Field'
import { useStore } from '../../store'
import type { OneTimeExpense, SocialSecurity } from '../../schema'

export function ExpensesStep() {
  const inputs = useStore((s) => s.inputs)
  const patchInputs = useStore((s) => s.patchInputs)
  const [showSS, setShowSS] = useState(!!inputs.socialSecurity)

  const updateSS = (patch: Partial<SocialSecurity>) => {
    patchInputs({
      socialSecurity: inputs.socialSecurity
        ? { ...inputs.socialSecurity, ...patch }
        : { annualAmountPresentDollars: 0, claimAge: 67, ...patch },
    })
  }

  const addExpense = () => {
    const exp: OneTimeExpense = {
      id: crypto.randomUUID(),
      label: 'New event',
      age: 65,
      amountPresentDollars: 10000,
    }
    patchInputs({ oneTimeExpenses: [...inputs.oneTimeExpenses, exp] })
  }

  const updateExpense = (id: string, patch: Partial<OneTimeExpense>) => {
    patchInputs({
      oneTimeExpenses: inputs.oneTimeExpenses.map((e) => e.id === id ? { ...e, ...patch } : e),
    })
  }

  const removeExpense = (id: string) => {
    patchInputs({ oneTimeExpenses: inputs.oneTimeExpenses.filter((e) => e.id !== id) })
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Expenses & income</h2>
      <p className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
        Baseline spending plus any one-time events. All amounts in today's dollars.
      </p>

      {/* Baseline */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>Annual baseline expenses</div>
        <Field label="Annual spending (today's dollars)">
          <NumInput type="number" min={0} step={1000} prefix="$"
            value={inputs.annualExpenses}
            onChange={(e) => patchInputs({ annualExpenses: Number(e.target.value) })} />
        </Field>
      </div>

      {/* Social Security */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: showSS ? 16 : 0 }}>
          <div className="label">Social Security</div>
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }}
            onClick={() => {
              setShowSS(!showSS)
              if (showSS) patchInputs({ socialSecurity: undefined })
              else updateSS({ annualAmountPresentDollars: 24000, claimAge: 67 })
            }}>
            {showSS ? 'Remove' : '+ Add'}
          </button>
        </div>
        {showSS && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Field label="Annual benefit (today's $)">
              <NumInput type="number" min={0} step={500} prefix="$"
                value={inputs.socialSecurity?.annualAmountPresentDollars ?? 0}
                onChange={(e) => updateSS({ annualAmountPresentDollars: Number(e.target.value) })} />
            </Field>
            <Field label="Claim age" hint="62–70">
              <NumInput type="number" min={62} max={70}
                value={inputs.socialSecurity?.claimAge ?? 67}
                onChange={(e) => updateSS({ claimAge: Number(e.target.value) })} />
            </Field>
          </div>
        )}
      </div>

      {/* One-time events */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div className="label">One-time events</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inputs.oneTimeExpenses.map((exp) => (
            <div key={exp.id} className="card card-sunk" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'end' }}>
                <Field label="Event label">
                  <input className="field" style={{ width: '100%' }} value={exp.label}
                    onChange={(e) => updateExpense(exp.id, { label: e.target.value })} />
                </Field>
                <Field label="Age">
                  <NumInput type="number" min={0} max={130} value={exp.age}
                    onChange={(e) => updateExpense(exp.id, { age: Number(e.target.value) })} />
                </Field>
                <Field label="Amount ($)">
                  <NumInput type="number" min={0} step={1000} prefix="$" value={exp.amountPresentDollars}
                    onChange={(e) => updateExpense(exp.id, { amountPresentDollars: Number(e.target.value) })} />
                </Field>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }}
                  onClick={() => removeExpense(exp.id)}>✕</button>
              </div>
            </div>
          ))}
          <button className="btn" style={{ justifyContent: 'center', borderStyle: 'dashed' }}
            onClick={addExpense}>+ Add event</button>
        </div>
      </div>
    </div>
  )
}
