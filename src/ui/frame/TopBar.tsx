import { Logo } from './Logo'
import { useStore } from '../../store'
import { Seg } from '../shared/Field'

const DISPLAY_OPTIONS = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'real', label: 'Real' },
]

export function TopBar() {
  const displayMode = useStore((s) => s.ui.displayMode)
  const setDisplayMode = useStore((s) => s.setDisplayMode)

  return (
    <div style={{
      height: 52,
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      background: 'var(--bg-elev)',
      flexShrink: 0,
    }}>
      <Logo />

      <div style={{ flex: 1 }} />

      <Seg
        options={DISPLAY_OPTIONS}
        value={displayMode}
        onChange={(v) => setDisplayMode(v as 'nominal' | 'real')}
      />

      <button
        className="btn btn-sm"
        onClick={() => {
          navigator.clipboard?.writeText(window.location.href)
        }}
      >
        Share
      </button>
    </div>
  )
}
