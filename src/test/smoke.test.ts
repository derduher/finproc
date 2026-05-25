// Phase 0 smoke test — verifies the test harness is wired up
import { describe, it, expect } from 'vitest'

describe('scaffold', () => {
  it('vitest is running', () => {
    expect(1 + 1).toBe(2)
  })
})
