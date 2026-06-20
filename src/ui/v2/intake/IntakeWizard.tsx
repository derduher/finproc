/**
 * IntakeWizard — the guided 6-screen intake (intro + 5 steps) that replaces the
 * old 3-question first run. It gathers every consequential input the model can't
 * guess, then commits a validated plan to the store via `onComplete`.
 *
 * The headline output of this flow is the *earliest retirement age*, surfaced by
 * the Result Explorer once setup finishes.
 */
import type { Dispatch } from 'react'
import type { SimulationInputs, ExpenseCategory } from '../../../schema'
import { EXPENSE_CATEGORIES } from '../../../schema'
import {
  useIntake,
  buildIntakeInputs,
  EXPENSE_SUGGESTIONS,
  type IntakeAction,
  type IntakeState,
  type AccountKind,
  type IntakeAccountDraft,
  type IntakeExpenseDraft,
  type IntakeOneTimeDraft,
} from '../../../hooks/useIntake'
import {
  IntakeTop,
  IntakeShell,
  FieldCol,
  NumField,
  MoneyField,
  TextField,
  SelectField,
  CB,
  AddRowBtn,
  IconButton,
} from './fields'

const ACCOUNT_KINDS: ReadonlyArray<readonly [AccountKind, string]> = [
  ['taxable', 'Taxable brokerage'],
  ['401k', '401(k)'],
  ['roth-401k', 'Roth 401(k)'],
  ['traditional-ira', 'Traditional IRA'],
  ['roth-ira', 'Roth IRA'],
]

const FREQUENCIES = [
  ['weekly', 'per week'],
  ['semi-monthly', 'twice a month'],
  ['monthly', 'per month'],
] as const

const CATEGORY_OPTIONS: ReadonlyArray<readonly [ExpenseCategory, string]> = EXPENSE_CATEGORIES.map(
  (c) => [c, c[0].toUpperCase() + c.slice(1)] as const,
)

const PERIOD_OPTIONS = [
  ['yearly', 'per year'],
  ['monthly', 'per month'],
] as const

function annualize(amount: number, period: 'monthly' | 'yearly') {
  return period === 'monthly' ? Math.round(amount * 12) : amount
}

const fmtK = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v / 1000)}K`)

interface StepProps {
  state: IntakeState
  dispatch: Dispatch<IntakeAction>
  onBack?: () => void
  onNext: () => void
  onGoto: (railIndex: number) => void
}

// ════ INTRO ═══════════════════════════════════════════════════════════════════
function IntakeIntro({ planToAge, onStart }: { planToAge: number; onStart: () => void }) {
  const Point = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <span style={{ width: 26, height: 26, borderRadius: 999, flex: 'none', background: 'var(--bg-sunk)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 1 }}>{n}</span>
      <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
  return (
    <div className="hf" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <IntakeTop note="Let's begin" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 56px', overflow: 'auto' }}>
        <div className="v2-split2" style={{ width: 1010, maxWidth: '100%', alignItems: 'center', gap: 60 }}>
          <div>
            <div className="label" style={{ marginBottom: 14, color: 'var(--accent-ink)' }}>before we start</div>
            <h1 style={{ fontSize: 38, lineHeight: 1.1, marginBottom: 22, letterSpacing: '-0.02em' }}>
              We'll find the <span style={{ fontStyle: 'italic' }}>earliest</span> you could retire — and stay retired.
            </h1>
            <div style={{ fontSize: 15.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 26 }}>
              Tell us what you've saved, what you add each year, and what you plan to spend. We run a thousand market histories against it and return the earliest age you can stop working with money lasting to {planToAge}.
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ height: 46, padding: '0 22px', fontSize: 15 }} onClick={onStart}>Start — about 4 minutes →</button>
              <span className="micro">5 short steps · nothing saved until you say so</span>
            </div>
          </div>
          <div className="intk-card" style={{ padding: '22px 22px' }}>
            <div className="label" style={{ marginBottom: 16 }}>what we'll ask, in order</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <Point n={1}>Your <b style={{ color: 'var(--ink)' }}>age</b> and salary today</Point>
              <Point n={2}>Your <b style={{ color: 'var(--ink)' }}>accounts</b> — balances and what you add</Point>
              <Point n={3}>The <b style={{ color: 'var(--ink)' }}>expenses</b> you expect each year</Point>
              <Point n={4}><b style={{ color: 'var(--ink)' }}>One-time</b> costs — a remodel, a car, a gift</Point>
              <Point n={5}><b style={{ color: 'var(--ink)' }}>Social Security</b> — we'll show you how to get the real figure</Point>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              Returns, taxes, and withdrawal order get sensible defaults you can refine later — but these five are yours alone, so we ask up front.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════ ① AGE & SALARY ════════════════════════════════════════════════════════════
function IntakeAge({ state, dispatch, onNext, onGoto }: StepProps) {
  const { draft } = state
  return (
    <IntakeShell active={0} eyebrow="step 1 of 5 · about you" title="Let's start with your age."
      lead="Your age today sets the clock — it's the distance between now and the earliest you could retire. Salary lets us size contribution limits and your Social Security estimate."
      onNext={onNext} onGoto={onGoto}
      footNote="In today's dollars throughout. You can change any of this later.">
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginBottom: 30 }}>
        <FieldCol label="I'm currently" hint="your age this year">
          <NumField label="Current age" value={draft.currentAge} suf="years old" w={170}
            onChange={(v) => dispatch({ type: 'patchDraft', patch: { currentAge: v } })} />
        </FieldCol>
        <FieldCol label="My salary is" hint="gross, before tax">
          <MoneyField label="Annual salary" value={draft.salary} suf="/ yr" w={190}
            onChange={(v) => dispatch({ type: 'patchDraft', patch: { salary: v } })} />
        </FieldCol>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24, maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="label">plan horizon</span>
          <span className="defpill">default</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Model my plan through age</span>
          <NumField label="Plan to age" value={draft.planToAge} w={84}
            onChange={(v) => dispatch({ type: 'patchDraft', patch: { planToAge: v } })} />
        </div>
        <div className="micro" style={{ marginTop: 10, lineHeight: 1.5, color: 'var(--ink-3)' }}>
          We assume you want money to last to {draft.planToAge}. Plan to 100 and the earliest retirement age rises a year or two; to 90 it falls.
        </div>
      </div>
    </IntakeShell>
  )
}

// ════ ② ACCOUNTS ════════════════════════════════════════════════════════════════
function AccountCard({ a, dispatch }: { a: IntakeAccountDraft; dispatch: Dispatch<IntakeAction> }) {
  const up = (patch: Partial<IntakeAccountDraft>) => dispatch({ type: 'updateAccount', id: a.id, patch })
  const taxable = a.kind === 'taxable'
  const preTax = a.kind === '401k' || a.kind === 'traditional-ira'
  return (
    <div className="intk-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TextField label="Account name" value={a.name} w={260} onChange={(v) => up({ name: v })} />
        <span style={{ marginLeft: 'auto' }}>
          <IconButton label={`Remove ${a.name}`} onClick={() => dispatch({ type: 'removeAccount', id: a.id })}>✕</IconButton>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <FieldCol label="kind"><SelectField label="Account kind" value={a.kind} options={ACCOUNT_KINDS} w={172} onChange={(v) => up({ kind: v })} /></FieldCol>
        <FieldCol label="balance"><MoneyField label="Balance" value={a.balance} w={140} onChange={(v) => up({ balance: v })} /></FieldCol>
        {taxable ? (
          <>
            <FieldCol label="adds"><MoneyField label="Contribution amount" value={a.contributionAmount ?? 0} w={110} onChange={(v) => up({ contributionAmount: v })} /></FieldCol>
            <FieldCol label="how often"><SelectField label="Contribution frequency" value={a.contributionFrequency ?? 'monthly'} options={FREQUENCIES} w={140} onChange={(v) => up({ contributionFrequency: v })} /></FieldCol>
          </>
        ) : (
          <FieldCol label="adds">
            {a.contributeMax
              ? <span className="defpill" style={{ color: 'var(--good)', height: 38, padding: '0 14px' }}>at annual max</span>
              : <MoneyField label="Contribution amount" value={a.contributionAmount ?? 0} suf="/ yr" w={120} onChange={(v) => up({ contributionAmount: v })} />}
          </FieldCol>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <span className="micro">holds</span>
        <NumField label="Stock allocation" value={a.stockAllocationPct} suf="% stocks" w={120} onChange={(v) => up({ stockAllocationPct: v })} />
        <span className="micro" style={{ color: 'var(--ink-3)' }}>· rest grows at the bond rate</span>
      </div>
      {!taxable && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CB on={!!a.contributeMax} strong onToggle={() => up({ contributeMax: !a.contributeMax })}>contribute the IRS annual maximum</CB>
          {preTax && (
            <div>
              <CB on={!!a.employerMatch} strong onToggle={() => up({ employerMatch: a.employerMatch ? undefined : { type: 'flat', annualAmount: 6000 } })}>employer match</CB>
              {a.employerMatch && a.employerMatch.type === 'flat' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingLeft: 28 }}>
                  <MoneyField label="Employer match amount" value={a.employerMatch.annualAmount} suf="/ yr" w={130}
                    onChange={(v) => up({ employerMatch: { type: 'flat', annualAmount: v } })} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IntakeAccounts({ state, dispatch, onBack, onNext, onGoto }: StepProps) {
  const { accounts } = state.draft
  const total = accounts.reduce((s, a) => s + a.balance, 0)
  return (
    <IntakeShell active={1} eyebrow="step 2 of 5 · accounts" title="What have you saved, and where?"
      lead="Add each account — its balance and what you add each year. The kind matters: pre-tax, Roth, and taxable are taxed differently when you draw them down, and we model that."
      onBack={onBack} onNext={onNext} onGoto={onGoto}
      footNote={`${fmtK(total)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'} · contributions default to the IRS annual maximum where they apply.`}>
      {accounts.map((a) => <AccountCard key={a.id} a={a} dispatch={dispatch} />)}
      <AddRowBtn onClick={() => dispatch({ type: 'addAccount' })}>Add an account</AddRowBtn>
    </IntakeShell>
  )
}

// ════ ③ EXPENSES ════════════════════════════════════════════════════════════════
function ExpenseRow({ e, dispatch }: { e: IntakeExpenseDraft; dispatch: Dispatch<IntakeAction> }) {
  const up = (patch: Partial<IntakeExpenseDraft>) => dispatch({ type: 'updateExpense', id: e.id, patch })
  return (
    <div className="intk-exp">
      <TextField label="Expense label" value={e.label} w={204} onChange={(v) => up({ label: v })} />
      <SelectField label="Category" value={e.category} options={CATEGORY_OPTIONS} w={120} onChange={(v) => up({ category: v })} />
      <MoneyField label="Expense amount" value={e.amount} w={92} onChange={(v) => up({ amount: v })} />
      <SelectField label="Per period" value={e.period} options={PERIOD_OPTIONS} w={112} onChange={(v) => up({ period: v })} />
      <span className="micro" style={{ width: 64, color: 'var(--ink-3)', whiteSpace: 'nowrap', flex: 'none' }}>= {fmtK(annualize(e.amount, e.period))}/yr</span>
      <CB on={e.essential} onToggle={() => up({ essential: !e.essential })}>essential</CB>
      <span style={{ marginLeft: 'auto' }}>
        <IconButton label={`Remove ${e.label}`} onClick={() => dispatch({ type: 'removeExpense', id: e.id })}>✕</IconButton>
      </span>
    </div>
  )
}

function IntakeExpenses({ state, dispatch, onBack, onNext, onGoto }: StepProps) {
  const { expenses } = state.draft
  const total = expenses.reduce((s, e) => s + annualize(e.amount, e.period), 0)
  const essential = expenses.filter((e) => e.essential).reduce((s, e) => s + annualize(e.amount, e.period), 0)
  return (
    <IntakeShell active={2} eyebrow="step 3 of 5 · expenses" title="What will you spend in a typical year?"
      lead="List the spending you expect once retired, in today's dollars. Breaking it into a few lines lets us tell needs from wants — the split that powers the guardrails protecting you in bad markets."
      onBack={onBack} onNext={onNext} onGoto={onGoto}
      footNote={`${fmtK(total)}/yr total · ${fmtK(essential)} of it marked essential (the floor markets can't cut below).`}>
      <div className="intk-exp-head">
        <span style={{ width: 204 }}>item</span>
        <span style={{ width: 120 }}>category</span>
        <span style={{ width: 92 }}>amount</span>
        <span style={{ width: 112 }}>per</span>
        <span style={{ width: 64 }}>/ year</span>
        <span>essential?</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {expenses.map((e) => <ExpenseRow key={e.id} e={e} dispatch={dispatch} />)}
      </div>
      <AddRowBtn onClick={() => dispatch({ type: 'addExpense' })}>add an expense</AddRowBtn>
      <div style={{ marginTop: 22 }}>
        <div className="micro" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>commonly missed — click to add</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EXPENSE_SUGGESTIONS.map((s) => (
            <button key={s.label} className="intk-sugg" onClick={() => dispatch({ type: 'addExpense', preset: s })}>
              <span style={{ color: 'var(--accent-ink)', fontWeight: 500 }}>+</span>
              <span>{s.label}</span>
              <span className="micro" style={{ color: 'var(--ink-3)' }}>{fmtK(annualize(s.amount, s.period))}/yr</span>
            </button>
          ))}
        </div>
      </div>
    </IntakeShell>
  )
}

// ════ ④ ONE-TIME COSTS ══════════════════════════════════════════════════════════
function OneTimeRow({ o, dispatch }: { o: IntakeOneTimeDraft; dispatch: Dispatch<IntakeAction> }) {
  const up = (patch: Partial<IntakeOneTimeDraft>) => dispatch({ type: 'updateOneTime', id: o.id, patch })
  return (
    <div className="intk-exp">
      <span className="ldot" style={{ background: 'var(--accent)', flex: 'none' }} />
      <MoneyField label="One-time amount" value={o.amount} w={120} onChange={(v) => up({ amount: v })} />
      <span className="micro">at age</span>
      <NumField label="One-time age" value={o.age} w={64} onChange={(v) => up({ age: v })} />
      <TextField label="One-time label" value={o.label} w={220} onChange={(v) => up({ label: v })} />
      <span style={{ marginLeft: 'auto' }}>
        <IconButton label={`Remove ${o.label}`} onClick={() => dispatch({ type: 'removeOneTime', id: o.id })}>✕</IconButton>
      </span>
    </div>
  )
}

function IntakeOneTime({ state, dispatch, onBack, onNext, onGoto }: StepProps) {
  const { oneTime } = state.draft
  return (
    <IntakeShell active={3} eyebrow="step 4 of 5 · one-time costs" title="Any big one-time expenses ahead?"
      lead="A remodel, a new car, a wedding, a gift, a second home. These land in a single year and can move the earliest retirement age more than people expect — so it's worth naming them."
      onBack={onBack} onNext={onNext} onGoto={onGoto}
      footNote="Each shows as a marker on your projection chart and is drawn from accounts tax-optimally.">
      <div className="intk-exp-head">
        <span style={{ width: 16 }} />
        <span style={{ width: 120 }}>amount</span>
        <span style={{ width: 96 }}>at age</span>
        <span>what for</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {oneTime.map((o) => <OneTimeRow key={o.id} o={o} dispatch={dispatch} />)}
      </div>
      <AddRowBtn onClick={() => dispatch({ type: 'addOneTime' })}>Add a big expense (home, car, gift…)</AddRowBtn>
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 560 }}>
        <span className="ldot" style={{ background: 'var(--accent)', flex: 'none' }} />
        <span className="micro" style={{ lineHeight: 1.5 }}>
          Nothing planned? That's fine — skip ahead. You can always add these later if a big cost comes into view.
        </span>
      </div>
    </IntakeShell>
  )
}

// ════ ⑤ SOCIAL SECURITY ═════════════════════════════════════════════════════════
function IntakeSocialSecurity({ state, dispatch, onBack, onNext, onGoto }: StepProps) {
  const { ss } = state.draft
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, flex: 'none', background: 'var(--bg-elev)', border: '1px solid var(--line-strong)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 1 }}>{n}</span>
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
  return (
    <IntakeShell active={4} eyebrow="step 5 of 5 · social security" primary="See my projection" title="What will Social Security pay you?"
      lead="It's inflation-adjusted income for life, so it meaningfully lifts what you can spend. We've estimated a figure from your salary — but your real number takes two minutes to get."
      onBack={onBack} onNext={onNext} onGoto={onGoto}
      footNote="Claiming later (up to 70) raises the benefit ~8% per year. We treat it as income starting at your claim age.">
      <div className="v2-split2">
        <div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18 }}>
            <FieldCol label="monthly benefit" hint="enter it exactly as ssa.gov shows it">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <MoneyField label="Monthly Social Security benefit" value={ss.monthly} suf="/ mo" w={150}
                  onChange={(v) => dispatch({ type: 'patchDraft', patch: { ss: { ...ss, monthly: v } } })} />
                <span className="micro" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>= <b className="num" style={{ color: 'var(--ink-2)' }}>${(ss.monthly * 12).toLocaleString('en-US')}</b> / yr</span>
              </div>
            </FieldCol>
            <FieldCol label="claim at age" hint="between 62 and 70">
              <NumField label="Claim age" value={ss.claimAge} w={84}
                onChange={(v) => dispatch({ type: 'patchDraft', patch: { ss: { ...ss, claimAge: Math.max(62, Math.min(70, v)) } } })} />
            </FieldCol>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--accent-soft)', borderRadius: 'var(--radius-2)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>Estimated from your salary — replace it with your real figure</span>
          </div>
        </div>
        <div className="intk-card" style={{ background: 'var(--bg-sunk)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', marginBottom: 14 }}>Get your real number</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Step n={1}>Go to <b style={{ color: 'var(--ink)' }}>ssa.gov/myaccount</b> and sign in (or create a free <i>my</i> Social Security account).</Step>
            <Step n={2}>Open <b style={{ color: 'var(--ink)' }}>“Estimated benefits”</b> — it lists your monthly benefit at 62, your full retirement age, and 70.</Step>
            <Step n={3}>Type that <b style={{ color: 'var(--ink)' }}>monthly</b> figure into the benefit box on the left — we convert it to the yearly amount the projection uses.</Step>
          </div>
          <a className="btn btn-sm" style={{ marginTop: 16, whiteSpace: 'nowrap', textDecoration: 'none' }} href="https://www.ssa.gov/myaccount/" target="_blank" rel="noopener noreferrer">
            Open ssa.gov
            <svg width="11" height="11" viewBox="0 0 11 11" style={{ marginLeft: 4 }} aria-hidden><path d="M3 8 L8 3 M8 3 H4.2 M8 3 V6.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </div>
    </IntakeShell>
  )
}

// ════ ORCHESTRATOR ══════════════════════════════════════════════════════════════
export function IntakeWizard({ onComplete }: { onComplete: (inputs: SimulationInputs) => void }) {
  const { step, draft, dispatch } = useIntake()
  const state: IntakeState = { step, draft }
  const next = () => dispatch({ type: 'next' })
  const back = () => dispatch({ type: 'back' })
  // The rail shows the 5 steps; rail index i maps to wizard step i + 1.
  const goto = (railIndex: number) => dispatch({ type: 'goto', step: railIndex + 1 })
  const finish = () => onComplete(buildIntakeInputs(draft))

  const props: StepProps = { state, dispatch, onBack: back, onNext: next, onGoto: goto }

  switch (step) {
    case 0:
      return <IntakeIntro planToAge={draft.planToAge} onStart={next} />
    case 1:
      return <IntakeAge {...props} onBack={undefined} />
    case 2:
      return <IntakeAccounts {...props} />
    case 3:
      return <IntakeExpenses {...props} />
    case 4:
      return <IntakeOneTime {...props} />
    case 5:
      return <IntakeSocialSecurity {...props} onNext={finish} />
    default:
      return <IntakeIntro planToAge={draft.planToAge} onStart={next} />
  }
}
