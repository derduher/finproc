/**
 * GuessCheck — the gap-closer that puts the three consequential first-run guesses
 * (Social Security, employer match, account mix) ON the result instead of in a
 * drawer the user may never open. Each row shows what we guessed, how much it
 * swings the answer, and a one-tap "About right" (confirm) or "Fix it" (correct
 * inline). When all three are checked, the queue collapses to `ConfirmedStrip`
 * and the range hero settles to a single number.
 *
 * Confirmation lives in the store (`confirmGuess`); inline fixes patch the real
 * inputs via `patchInputs`, so the live simulation reflects the user's figures.
 */
import { useState } from 'react'
import { useStore } from '../../store'
import { MoneyInput } from '../shared/MoneyInput'
import type { GuessId } from '../../store'
import type { SimulationInputs } from '../../schema'

/** Green check disc — shared with the first-run banner. */
export function GCheck({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="7.2" fill="var(--good)" />
      <path d="M4.8 8.3 L7 10.4 L11.2 5.7" fill="none" stroke="var(--bg)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SwingTag({ swing }: { swing: number | null }) {
  const label = swing == null ? 'measuring…' : `moves this ±$${Math.max(1, Math.round(swing / 1000))}K/yr`
  return (
    <span className="swing">
      <svg width="9" height="11" viewBox="0 0 10 12"><path d="M5 1.5 V10.5 M2.5 4 L5 1.5 L7.5 4 M2.5 8 L5 10.5 L7.5 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </span>
  )
}

/** The flat employer-match account (the one the guess-check edits), if any. */
function matchAccount(inputs: SimulationInputs) {
  return inputs.accounts.find((a) => a.employerMatch?.type === 'flat')
}

function fmtK(n: number) {
  return `$${Math.round(n / 1000)}K`
}

export function GuessCheck({
  swings,
  onOpenAdvanced,
}: {
  swings: Record<GuessId, number | null>
  onOpenAdvanced: () => void
}) {
  const inputs = useStore((s) => s.inputs)
  const checked = useStore((s) => s.ui.firstRun.checked)
  const confirmGuess = useStore((s) => s.confirmGuess)
  const patchInputs = useStore((s) => s.patchInputs)
  const [editing, setEditing] = useState<GuessId | null>(null)

  // Editor drafts (seeded from the live inputs when a row opens).
  const ss = inputs.socialSecurity
  const match = matchAccount(inputs)
  const [ssAmount, setSsAmount] = useState(ss?.annualAmountPresentDollars ?? 30_000)
  const [ssClaim, setSsClaim] = useState(ss?.claimAge ?? 67)
  const [matchAmount, setMatchAmount] = useState(match?.employerMatch?.type === 'flat' ? match.employerMatch.annualAmount : 6_000)

  const checkedCount = (['ss', 'match', 'mix'] as GuessId[]).filter((id) => checked[id]).length

  const saveSs = () => {
    patchInputs({ socialSecurity: { annualAmountPresentDollars: ssAmount, claimAge: ssClaim } })
    confirmGuess('ss')
    setEditing(null)
  }
  const saveMatch = () => {
    if (match) {
      patchInputs({
        accounts: inputs.accounts.map((a) =>
          a.id === match.id ? { ...a, employerMatch: { type: 'flat' as const, annualAmount: matchAmount } } : a,
        ),
      })
    }
    confirmGuess('match')
    setEditing(null)
  }

  const k401 = inputs.accounts.find((a) => a.accountSubtype === '401k')
  const ira = inputs.accounts.find((a) => a.accountSubtype === 'ira')
  const taxable = inputs.accounts.find((a) => a.type === 'taxable')

  // ── one row of the queue ──────────────────────────────────────────
  function Row({ id, title, children, basis, doneLabel }: { id: GuessId; title: string; children: React.ReactNode; basis: string; doneLabel: React.ReactNode }) {
    if (checked[id]) {
      return (
        <div className="guess-row done">
          <GCheck />
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{doneLabel}</div>
          <span className="micro" style={{ marginLeft: 'auto' }}>checked</span>
        </div>
      )
    }
    return (
      <div className="guess-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 14.5, color: 'var(--ink)', fontWeight: 500 }}>{title}</span>
            <SwingTag swing={swings[id]} />
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            {children} <span className="micro" style={{ color: 'var(--ink-3)' }}>· {basis}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          <button className="btn btn-sm" onClick={() => confirmGuess(id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginRight: 4 }}><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="var(--good)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            About right
          </button>
          <button className="btn btn-sm" onClick={() => (id === 'mix' ? (onOpenAdvanced(), confirmGuess('mix')) : setEditing(id))}>Fix it</button>
        </div>
      </div>
    )
  }

  return (
    <div className="guess-card">
      <div className="gc-head">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>before you lean on this number</div>
          <h3 style={{ fontSize: 17 }}>Three things only you know</h3>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3, maxWidth: 520 }}>
            Everything else has a safe default. These three we had to guess — and they're what's holding your result to a range.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none', paddingTop: 4 }}>
          <span className="micro">{checkedCount} of 3 checked</span>
          {(['ss', 'match', 'mix'] as GuessId[]).map((id) => (
            <span key={id} className={'gdot' + (checked[id] ? ' on' : '')} />
          ))}
        </div>
      </div>

      {/* Social Security */}
      {editing === 'ss' ? (
        <div className="guess-row editing">
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 14.5, color: 'var(--ink)', fontWeight: 500 }}>Social Security</span>
              <SwingTag swing={swings.ss} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="micro">benefit / yr</span>
                <span className="lever-value" style={{ padding: '6px 10px' }}>
                  <span className="lv-pre">$</span>
                  <MoneyInput aria-label="Social Security benefit per year" value={ssAmount} onChange={setSsAmount} step={500} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'var(--ink)', width: 90, outline: 'none' }} />
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="micro">claim at age</span>
                <span className="lever-value" style={{ padding: '6px 10px' }}>
                  <input type="number" aria-label="Social Security claim age" min={62} max={70} value={ssClaim} onChange={(e) => setSsClaim(Number(e.target.value))} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'var(--ink)', width: 44, outline: 'none' }} />
                </span>
              </label>
            </div>
            <div className="micro" style={{ marginTop: 10, color: 'var(--ink-3)' }}>
              Your real figure is on ssa.gov — two minutes, and the single biggest fix you can make here.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <button className="btn btn-sm btn-primary" onClick={saveSs}>Use this number</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <Row id="ss" title="Social Security" basis="estimated from your salary"
          doneLabel={<>Social Security · <b className="num">${(ss?.annualAmountPresentDollars ?? 0).toLocaleString('en-US')} / yr</b> at {ss?.claimAge ?? 67}</>}>
          We guessed <b className="num" style={{ color: 'var(--ink)' }}>${(ss?.annualAmountPresentDollars ?? 0).toLocaleString('en-US')} / yr</b>, claiming at {ss?.claimAge ?? 67}
        </Row>
      )}

      {/* Employer match */}
      {editing === 'match' ? (
        <div className="guess-row editing">
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 14.5, color: 'var(--ink)', fontWeight: 500 }}>Employer match</span>
              <SwingTag swing={swings.match} />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="micro">flat match / yr</span>
              <span className="lever-value" style={{ padding: '6px 10px', width: 'fit-content' }}>
                <span className="lv-pre">$</span>
                <MoneyInput aria-label="Employer match per year" value={matchAmount} onChange={setMatchAmount} step={500} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'var(--ink)', width: 90, outline: 'none' }} />
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <button className="btn btn-sm btn-primary" onClick={saveMatch}>Use this number</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <Row id="match" title="Employer match" basis="typical at your salary"
          doneLabel={<>Employer match · <b className="num">${(match?.employerMatch?.type === 'flat' ? match.employerMatch.annualAmount : 0).toLocaleString('en-US')} / yr</b> flat</>}>
          We guessed a flat <b className="num" style={{ color: 'var(--ink)' }}>${(match?.employerMatch?.type === 'flat' ? match.employerMatch.annualAmount : 0).toLocaleString('en-US')} / yr</b> on top of your additions
        </Row>
      )}

      {/* Account mix */}
      <Row id="mix" title="Account mix" basis="a common shape for your savings"
        doneLabel={<>Account mix · 401(k) / IRA / taxable split</>}>
        We guessed mostly pre-tax: <b className="num" style={{ color: 'var(--ink)' }}>{fmtK(k401?.balance ?? 0)}</b> 401(k) · <b className="num" style={{ color: 'var(--ink)' }}>{fmtK(ira?.balance ?? 0)}</b> IRA · <b className="num" style={{ color: 'var(--ink)' }}>{fmtK(taxable?.balance ?? 0)}</b> taxable
      </Row>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderTop: '1px dashed var(--line)' }}>
        <span className="micro" style={{ color: 'var(--ink-3)' }}>Everything else we assumed — returns, taxes, withdrawal order — has a stated default and bias.</span>
        <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={onOpenAdvanced}>See all in Advanced →</button>
      </div>
    </div>
  )
}

/** Collapsed strip shown once all three guesses are checked. */
export function ConfirmedStrip() {
  const inputs = useStore((s) => s.inputs)
  const ss = inputs.socialSecurity
  const match = matchAccount(inputs)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'var(--good-soft)', border: '1px solid color-mix(in srgb, var(--good) 35%, var(--line))', borderRadius: 'var(--radius-3)' }}>
      <GCheck />
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
        The three inputs that move this number are yours, not our guesses — <b className="num" style={{ color: 'var(--ink)' }}>Social Security ${(ss?.annualAmountPresentDollars ?? 0).toLocaleString('en-US')} at {ss?.claimAge ?? 67}</b> · <b className="num" style={{ color: 'var(--ink)' }}>match ${(match?.employerMatch?.type === 'flat' ? match.employerMatch.annualAmount : 0).toLocaleString('en-US')}/yr</b> · <b style={{ color: 'var(--ink)' }}>account mix</b>.
      </div>
    </div>
  )
}
