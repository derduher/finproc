import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useScenarios } from './useScenarios'
import { defaultInputs } from '../schema'

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}))

const inp1 = { ...defaultInputs(), annualExpenses: 50000 }
const inp2 = { ...defaultInputs(), annualExpenses: 60000 }
const inp3 = { ...defaultInputs(), annualExpenses: 70000 }
const inp4 = { ...defaultInputs(), annualExpenses: 80000 }
const inp5 = { ...defaultInputs(), annualExpenses: 90000 }

describe('useScenarios — CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with empty scenarios', async () => {
    const { result } = renderHook(() => useScenarios())
    await waitFor(() => expect(result.current.scenarios).toEqual([]))
  })

  it('saveScenario adds a scenario', async () => {
    const { result } = renderHook(() => useScenarios())
    await waitFor(() => expect(result.current.scenarios).toEqual([]))

    act(() => {
      result.current.saveScenario('Plan A', inp1)
    })
    expect(result.current.scenarios).toHaveLength(1)
    expect(result.current.scenarios[0].name).toBe('Plan A')
    expect(result.current.scenarios[0].inputs.annualExpenses).toBe(50000)
  })

  it('enforces maximum of 4 scenarios', async () => {
    const { result } = renderHook(() => useScenarios())
    await waitFor(() => expect(result.current.scenarios).toEqual([]))

    act(() => {
      result.current.saveScenario('A', inp1)
      result.current.saveScenario('B', inp2)
      result.current.saveScenario('C', inp3)
      result.current.saveScenario('D', inp4)
    })
    expect(result.current.scenarios).toHaveLength(4)

    // Trying to add a 5th should not exceed 4
    act(() => {
      result.current.saveScenario('E', inp5)
    })
    expect(result.current.scenarios).toHaveLength(4)
  })

  it('deleteScenario removes a scenario by id', async () => {
    const { result } = renderHook(() => useScenarios())
    await waitFor(() => expect(result.current.scenarios).toEqual([]))

    act(() => {
      result.current.saveScenario('Plan A', inp1)
      result.current.saveScenario('Plan B', inp2)
    })
    expect(result.current.scenarios).toHaveLength(2)

    const idToDelete = result.current.scenarios[0].id
    act(() => {
      result.current.deleteScenario(idToDelete)
    })
    expect(result.current.scenarios).toHaveLength(1)
    expect(result.current.scenarios[0].name).toBe('Plan B')
  })
})
