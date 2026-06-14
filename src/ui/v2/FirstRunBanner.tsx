/**
 * FirstRunBanner — the phase-aware welcome banner for the post-splash first run.
 * During the rough phase it frames the result as honestly provisional and nudges
 * the user to check the three guesses; once confirmed it flips to a reassuring
 * "now built on your figures" note. Dismissible. Renders nothing if dismissed.
 */
import { useStore } from '../../store'
import { GCheck } from './GuessCheck'

export function FirstRunBanner({ phase }: { phase: 'rough' | 'confirmed' }) {
  const dismissed = useStore((s) => s.ui.firstRun.bannerDismissed)
  const dismiss = useStore((s) => s.dismissFirstRunBanner)
  if (dismissed) return null

  if (phase === 'confirmed') {
    return (
      <div className="firstrun-banner" style={{ background: 'var(--good-soft)', borderBottom: '1px solid var(--line)', padding: '12px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GCheck />
          <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            That's everything that materially moves your number — it's now <b style={{ color: 'var(--ink)' }}>built on your figures</b>. Tune anything else in Advanced, anytime.
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={dismiss}>Got it ✕</button>
      </div>
    )
  }

  return (
    <div className="firstrun-banner" style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--line)', padding: '12px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8 L6.5 11.5 L13 4" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ fontSize: 13.5, color: 'var(--accent-ink)' }}>
          Here's your first read — honestly rough. <b>We guessed three things only you'd know</b>; checking them takes about 30 seconds.
        </span>
      </div>
      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--accent-ink)' }} onClick={dismiss}>Got it ✕</button>
    </div>
  )
}
