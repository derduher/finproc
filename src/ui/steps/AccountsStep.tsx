import { useState } from 'react'
import { Field, NumInput } from '../shared/Field'
import { useStore } from '../../store'
import { formatMoneyAbbreviated } from '../../math'
import type { Account } from '../../schema'

const TYPE_LABELS: Record<Account['type'], string> = {
  roth: 'Roth',
  traditional: 'Traditional / 401(k)',
  taxable: 'Taxable brokerage',
}

const TYPE_COLORS: Record<Account['type'], string> = {
  roth: 'var(--good)',
  traditional: 'var(--accent)',
  taxable: 'var(--ink-3)',
}

function contribLabel(acc: Account): string {
  if (!acc.contributionAmount) return 'No contributions'
  return acc.contributionType === 'percent'
    ? `${(acc.contributionAmount * 100).toFixed(0)}% salary`
    : `$${acc.contributionAmount}/mo`
}

function AccountCard({ acc, onEdit }: { acc: Account; onEdit: () => void }) {
  return (
    <div
      className="card"
      onClick={onEdit}
      role="button"
      style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TYPE_COLORS[acc.type], textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {TYPE_LABELS[acc.type]}
        </div>
        <div style={{ fontWeight: 500 }}>{acc.name}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {contribLabel(acc)} · Withdraw from {acc.withdrawalStartAge}
        </div>
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{formatMoneyAbbreviated(acc.balance)}</div>
        <div className="micro">balance</div>
      </div>
    </div>
  )
}

function newAccount(): Account {
  return {
    id: crypto.randomUUID(),
    name: 'New account',
    type: 'roth',
    balance: 0,
    contributionAmount: 500,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: 62,
    withdrawalStartAge: 59,
  }
}

export function AccountsStep() {
  const accounts = useStore((s) => s.inputs.accounts)
  const patchInputs = useStore((s) => s.patchInputs)
  const [editing, setEditing] = useState<string | null>(null)

  const editingAcc = accounts.find((a) => a.id === editing)

  const addAccount = () => {
    const acc = newAccount()
    patchInputs({ accounts: [...accounts, acc] })
    setEditing(acc.id)
  }

  const updateAccount = (id: string, patch: Partial<Account>) => {
    patchInputs({
      accounts: accounts.map((a) => a.id === id ? { ...a, ...patch } : a),
    })
  }

  const removeAccount = (id: string) => {
    patchInputs({ accounts: accounts.filter((a) => a.id !== id) })
    setEditing(null)
  }

  if (editingAcc) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>← Back</button>
          <h2 style={{ margin: 0 }}>Edit account</h2>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', color: 'var(--bad)' }}
            onClick={() => removeAccount(editingAcc.id)}
          >
            Remove
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Name">
              <input
                className="field"
                style={{ width: '100%' }}
                value={editingAcc.name}
                onChange={(e) => updateAccount(editingAcc.id, { name: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Account type">
            <select
              className="field"
              value={editingAcc.type}
              onChange={(e) => updateAccount(editingAcc.id, { type: e.target.value as Account['type'] })}
            >
              <option value="roth">Roth IRA</option>
              <option value="traditional">Traditional / 401(k)</option>
              <option value="taxable">Taxable brokerage</option>
            </select>
          </Field>

          <Field label="Current balance">
            <NumInput
              type="number" min={0} step={1000} prefix="$"
              value={editingAcc.balance}
              onChange={(e) => updateAccount(editingAcc.id, { balance: Number(e.target.value) })}
            />
          </Field>

          <Field label="Monthly contribution">
            <NumInput
              type="number" min={0} step={100} prefix="$"
              value={editingAcc.contributionAmount}
              onChange={(e) => updateAccount(editingAcc.id, { contributionAmount: Number(e.target.value) })}
            />
          </Field>

          <Field label="Contribute until age">
            <NumInput
              type="number" min={0} max={130}
              value={editingAcc.contributionEndAge}
              onChange={(e) => updateAccount(editingAcc.id, { contributionEndAge: Number(e.target.value) })}
            />
          </Field>

          <Field label="Withdraw from age">
            <NumInput
              type="number" min={0} max={130}
              value={editingAcc.withdrawalStartAge}
              onChange={(e) => updateAccount(editingAcc.id, { withdrawalStartAge: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Accounts</h2>
      <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>
        Add all your retirement and investment accounts.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accounts.map((acc) => (
          <AccountCard key={acc.id} acc={acc} onEdit={() => setEditing(acc.id)} />
        ))}
        <button
          className="btn"
          style={{ justifyContent: 'center', borderStyle: 'dashed' }}
          onClick={addAccount}
        >
          + Add account
        </button>
      </div>
    </div>
  )
}
