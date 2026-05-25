import { useState, useEffect } from 'react'
import { get, set as idbSet } from 'idb-keyval'
import type { SimulationInputs } from '../schema'

export interface Scenario {
  id: string
  name: string
  inputs: SimulationInputs
  savedAt: number
}

const IDB_KEY = 'threadwell:scenarios'
const MAX_SCENARIOS = 4

function generateId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export interface ScenarioActions {
  scenarios: Scenario[]
  saveScenario: (name: string, inputs: SimulationInputs) => void
  deleteScenario: (id: string) => void
  loadScenario: (id: string) => Scenario | undefined
}

export function useScenarios(): ScenarioActions {
  const [scenarios, setScenarios] = useState<Scenario[]>([])

  useEffect(() => {
    get<Scenario[]>(IDB_KEY).then((stored) => {
      if (stored) setScenarios(stored)
    })
  }, [])

  const saveScenario = (name: string, inputs: SimulationInputs) => {
    setScenarios((current) => {
      if (current.length >= MAX_SCENARIOS) return current
      const newScenario: Scenario = { id: generateId(), name, inputs, savedAt: Date.now() }
      const updated = [...current, newScenario]
      idbSet(IDB_KEY, updated).catch(() => {})
      return updated
    })
  }

  const deleteScenario = (id: string) => {
    setScenarios((current) => {
      const updated = current.filter((s) => s.id !== id)
      idbSet(IDB_KEY, updated).catch(() => {})
      return updated
    })
  }

  const loadScenario = (id: string): Scenario | undefined =>
    scenarios.find((s) => s.id === id)

  return { scenarios, saveScenario, deleteScenario, loadScenario }
}
