import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { formatMoneyAbbreviated } from '../../math'
import { PipeEditor } from './PipeEditor'
import type { Account } from '../../schema'

const TYPE_LABELS: Record<Account['type'], string> = {
  roth: 'roth',
  traditional: 'traditional',
  taxable: 'taxable',
}

function contribMicro(acc: Account, annualSalary: number): string {
  if (!acc.contributionAmount) return 'no contributions'
  if (acc.contributionType === 'percent') {
    const monthly = (acc.contributionAmount * annualSalary) / 12
    return `+ $${Math.round(monthly).toLocaleString()}/mo contrib`
  }
  const mult = acc.contributionFrequency === 'weekly' ? 52 / 12 : acc.contributionFrequency === 'semi-monthly' ? 2 : 1
  return `+ $${Math.round(acc.contributionAmount * mult).toLocaleString()}/mo contrib`
}

function newAccount(retirementAge: number): Account {
  return {
    id: crypto.randomUUID(),
    name: 'New account',
    type: 'roth',
    balance: 0,
    contributionAmount: 500,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    // Default contribution-stop and withdrawal-start to the user's
    // retirementAge so new accounts respect the plan timeline by default.
    // The user can override per-account in the PipeEditor.
    contributionEndAge: retirementAge,
    withdrawalStartAge: retirementAge,
  }
}

function AccountCard({
  acc,
  active,
  onSelect,
}: {
  acc: Account
  active: boolean
  onSelect: () => void
}) {
  const annualSalary = useStore((s) => s.inputs.person.annualSalary)
  const typeColor =
    acc.type === 'traditional' ? 'var(--accent-soft)' : acc.type === 'roth' ? 'var(--good-soft)' : 'var(--bg-sunk)'
  const typeInk =
    acc.type === 'traditional' ? 'var(--accent-ink)' : acc.type === 'roth' ? 'var(--good)' : 'var(--ink-2)'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className="card"
      style={{
        padding: 14,
        width: 200,
        cursor: 'pointer',
        borderColor: active ? 'var(--ink)' : 'var(--line)',
        boxShadow: active ? '0 0 0 1px var(--ink)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div
          className="badge"
          style={{ background: typeColor, color: typeInk, borderColor: 'transparent' }}
        >
          {TYPE_LABELS[acc.type]}
        </div>
        {active && <span style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>EDITING</span>}
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>{acc.name}</div>
      <div className="num" style={{ fontSize: 20, color: 'var(--ink)', marginTop: 4 }}>
        {formatMoneyAbbreviated(acc.balance)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{contribMicro(acc, annualSalary)}</div>
    </div>
  )
}

export function AccountsStep() {
  const accounts = useStore((s) => s.inputs.accounts)
  const annualSalary = useStore((s) => s.inputs.person.annualSalary)
  const retirementAge = useStore((s) => s.inputs.person.retirementAge)
  const patchInputs = useStore((s) => s.patchInputs)
  const [activeId, setActiveId] = useState<string | null>(accounts[0]?.id ?? null)

  // Keep the active id valid when accounts change
  useEffect(() => {
    if (activeId && !accounts.find((a) => a.id === activeId)) {
      setActiveId(accounts[0]?.id ?? null)
    } else if (!activeId && accounts.length > 0) {
      setActiveId(accounts[0].id)
    }
  }, [accounts, activeId])

  const active = accounts.find((a) => a.id === activeId) ?? null

  const updateAccount = (id: string, patch: Partial<Account>) => {
    patchInputs({ accounts: accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  }

  const addAccount = () => {
    const acc = newAccount(retirementAge)
    patchInputs({ accounts: [...accounts, acc] })
    setActiveId(acc.id)
  }

  const removeAccount = (id: string) => {
    patchInputs({ accounts: accounts.filter((a) => a.id !== id) })
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 6 }}>Step 2 of 6 · accounts</div>
        <h1>What are you saving, where?</h1>
      </div>

      <p className="muted" style={{ fontSize: 14, marginBottom: 16, maxWidth: 640 }}>
        Three account types: taxable, traditional (401k/IRA), Roth. Pick one below to edit its pipes.
      </p>

      {/* Account cards row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {accounts.map((acc) => (
          <AccountCard
            key={acc.id}
            acc={acc}
            active={acc.id === activeId}
            onSelect={() => setActiveId(acc.id)}
          />
        ))}
        <button
          type="button"
          onClick={addAccount}
          className="card"
          style={{
            padding: 14,
            width: 130,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            border: '1px dashed var(--line-strong)',
            cursor: 'pointer',
            background: 'transparent',
            font: 'inherit',
          }}
        >
          <div style={{ fontSize: 24, lineHeight: 1 }}>+</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>add account</div>
        </button>
      </div>

      {active ? (
        <PipeEditor
          account={active}
          annualSalary={annualSalary}
          onChange={(patch) => updateAccount(active.id, patch)}
          onDelete={() => removeAccount(active.id)}
        />
      ) : (
        <div className="card card-sunk" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          Add an account above to start editing.
        </div>
      )}
    </div>
  )
}
