import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from './TopBar'
import { useStore } from '../../store'
import { defaultInputs } from '../../schema'

const mockSaveScenario = vi.fn()
const mockLoadScenario = vi.fn()
vi.mock('../../hooks/useScenarios', () => ({
  useScenarios: vi.fn(() => ({
    scenarios: [],
    saveScenario: mockSaveScenario,
    deleteScenario: vi.fn(),
    loadScenario: mockLoadScenario,
  })),
}))

beforeEach(() => {
  mockSaveScenario.mockClear()
  mockLoadScenario.mockClear()
  useStore.setState({
    inputs: { ...defaultInputs(), scenarioName: 'Baseline plan' },
    ui: {
      activeStep: 0,
      displayMode: 'nominal',
      aesthetic: 'warm',
      theme: 'light',
      density: 'comfortable',
      lastCommittedAt: null,
    },
  })
})

describe('TopBar — scenario chip', () => {
  it('renders the current scenarioName', () => {
    render(<TopBar />)
    expect(screen.getByText('Baseline plan')).toBeInTheDocument()
  })

  it('renders an updated scenarioName when the store changes', () => {
    useStore.setState((s) => ({ inputs: { ...s.inputs, scenarioName: 'Retire at 60' } }))
    render(<TopBar />)
    expect(screen.getByText('Retire at 60')).toBeInTheDocument()
  })
})

describe('TopBar — auto-saved indicator', () => {
  it('shows "auto-saved Ns ago" when lastCommittedAt is recent', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    useStore.setState((s) => ({ ui: { ...s.ui, lastCommittedAt: now - 3000 } }))
    render(<TopBar />)
    expect(screen.getByText(/auto-saved/i)).toBeInTheDocument()
  })

  it('omits the indicator when lastCommittedAt is null', () => {
    render(<TopBar />)
    expect(screen.queryByText(/auto-saved/i)).toBeNull()
  })
})

describe('TopBar — aesthetic seg', () => {
  it('clicking a different aesthetic updates the store', () => {
    render(<TopBar />)
    const coolButton = screen.getByRole('radio', { name: /cool/i })
    fireEvent.click(coolButton)
    expect(useStore.getState().ui.aesthetic).toBe('cool')
  })
})

describe('TopBar — theme toggle', () => {
  it('clicking the theme button flips light ↔ dark', () => {
    render(<TopBar />)
    const btn = screen.getByRole('button', { name: /theme|dark|light/i })
    fireEvent.click(btn)
    expect(useStore.getState().ui.theme).toBe('dark')
    fireEvent.click(btn)
    expect(useStore.getState().ui.theme).toBe('light')
  })
})

describe('TopBar — display mode seg', () => {
  it('toggles nominal/real', () => {
    render(<TopBar />)
    const realBtn = screen.getByRole('radio', { name: /real/i })
    fireEvent.click(realBtn)
    expect(useStore.getState().ui.displayMode).toBe('real')
  })
})

describe('TopBar — Share button', () => {
  it('renders a Share button', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
  })
})

describe('TopBar — Help button', () => {
  it('renders a help button', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument()
  })

  it('clicking Help opens a help dialog', () => {
    render(<TopBar />)
    // Dialog is closed by default
    expect(screen.queryByRole('dialog', { name: /help/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^help$/i }))
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument()
  })

  it('Help dialog has a close button that dismisses it', () => {
    render(<TopBar />)
    fireEvent.click(screen.getByRole('button', { name: /^help$/i }))
    const dialog = screen.getByRole('dialog', { name: /help/i })
    const closeBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.match(/close|dismiss|×/i),
    ) as HTMLButtonElement
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: /help/i })).toBeNull()
  })
})

describe('TopBar — scenario chip dropdown', () => {
  it('renders the chip as a button (interactive)', () => {
    render(<TopBar />)
    const chip = screen.getByRole('button', { name: /current scenario|baseline plan/i })
    expect(chip).toBeInTheDocument()
  })

  it('clicking the chip opens a scenario menu', () => {
    render(<TopBar />)
    expect(screen.queryByRole('menu', { name: /scenarios/i })).toBeNull()
    const chip = screen.getByRole('button', { name: /current scenario|baseline plan/i })
    fireEvent.click(chip)
    expect(screen.getByRole('menu', { name: /scenarios/i })).toBeInTheDocument()
  })

  it('menu contains a "save current as new scenario" item', () => {
    render(<TopBar />)
    const chip = screen.getByRole('button', { name: /current scenario|baseline plan/i })
    fireEvent.click(chip)
    const menu = screen.getByRole('menu', { name: /scenarios/i })
    expect(menu.textContent).toMatch(/save.*new|save current/i)
  })
})
