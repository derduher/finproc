import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultInputs } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'

vi.mock('comlink', () => ({
  wrap: vi.fn(),
  proxy: vi.fn((fn: unknown) => ({ __proxied: fn })),
}))

vi.mock('./simulator', () => ({
  simulate: vi.fn(),
  sustainableSpend: vi.fn(),
  earliestRetirementAge: vi.fn(),
  requiredExtraSavings: vi.fn(),
  sensitivity: vi.fn(),
  insights: vi.fn(),
}))

const MOCK_RESULT = { successRate: 0.91 } as unknown as MonteCarloResult

class FakeWorker {
  static instances: FakeWorker[] = []
  listeners: Record<string, (event: { message?: string }) => void> = {}
  constructor(
    public url: URL,
    public options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this)
  }
  addEventListener(type: string, fn: (event: { message?: string }) => void) {
    this.listeners[type] = fn
  }
  terminate() {}
}

/**
 * The client caches its Worker singleton in module state, so each test gets a
 * fresh module graph. Imports must stay sequential — concurrent imports right
 * after resetModules race vitest's mock resolution and load the real module.
 */
async function loadFresh() {
  vi.resetModules()
  const client = await import('./client')
  const direct = await import('./simulator')
  const comlink = await import('comlink')
  return { client, direct, comlink }
}

beforeEach(() => {
  FakeWorker.instances = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('worker client — direct fallback (no Worker global)', () => {
  it('delegates simulate to the direct import, passing onProgress unwrapped', async () => {
    vi.stubGlobal('Worker', undefined)
    const { client, direct, comlink } = await loadFresh()
    vi.mocked(direct.simulate).mockResolvedValue(MOCK_RESULT)

    const inputs = defaultInputs()
    const onProgress = vi.fn()
    const res = await client.simulate(inputs, 500, onProgress)

    expect(res).toBe(MOCK_RESULT)
    expect(direct.simulate).toHaveBeenCalledWith(inputs, 500, onProgress)
    expect(comlink.wrap).not.toHaveBeenCalled()
    expect(comlink.proxy).not.toHaveBeenCalled()
  })

  it('delegates every solver/analysis function to the direct import', async () => {
    vi.stubGlobal('Worker', undefined)
    const { client, direct } = await loadFresh()
    const inputs = defaultInputs()

    vi.mocked(direct.sustainableSpend).mockResolvedValue('spend' as never)
    vi.mocked(direct.earliestRetirementAge).mockResolvedValue('age' as never)
    vi.mocked(direct.requiredExtraSavings).mockResolvedValue('save' as never)
    vi.mocked(direct.sensitivity).mockResolvedValue('sens' as never)
    vi.mocked(direct.insights).mockResolvedValue('cards' as never)

    await expect(client.sustainableSpend(inputs, 0.9, { runCount: 100 })).resolves.toBe('spend')
    expect(direct.sustainableSpend).toHaveBeenCalledWith(inputs, 0.9, { runCount: 100 })

    await expect(client.earliestRetirementAge(inputs, 0.85)).resolves.toBe('age')
    expect(direct.earliestRetirementAge).toHaveBeenCalledWith(inputs, 0.85, undefined)

    await expect(client.requiredExtraSavings(inputs)).resolves.toBe('save')
    expect(direct.requiredExtraSavings).toHaveBeenCalledWith(inputs, 0.9, undefined)

    await expect(client.sensitivity(inputs, 200)).resolves.toBe('sens')
    expect(direct.sensitivity).toHaveBeenCalledWith(inputs, 200)

    await expect(client.insights(inputs, 1000)).resolves.toBe('cards')
    expect(direct.insights).toHaveBeenCalledWith(inputs, 1000)
  })
})

describe('worker client — Worker path', () => {
  function makeRemote() {
    return {
      simulate: vi.fn().mockResolvedValue(MOCK_RESULT),
      sustainableSpend: vi.fn().mockResolvedValue('spend'),
      earliestRetirementAge: vi.fn().mockResolvedValue('age'),
      requiredExtraSavings: vi.fn().mockResolvedValue('save'),
      sensitivity: vi.fn().mockResolvedValue('sens'),
      insights: vi.fn().mockResolvedValue('cards'),
    }
  }

  it('instantiates one shared module Worker and routes all calls through it', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { client, direct, comlink } = await loadFresh()
    const remote = makeRemote()
    vi.mocked(comlink.wrap).mockReturnValue(remote as never)

    const inputs = defaultInputs()
    await client.simulate(inputs, 1000)
    await client.sustainableSpend(inputs)
    await client.earliestRetirementAge(inputs)
    await client.requiredExtraSavings(inputs)
    await client.sensitivity(inputs)
    await client.insights(inputs)

    // One Worker, created as a module worker from the simulator entry
    expect(FakeWorker.instances).toHaveLength(1)
    const { url, options } = FakeWorker.instances[0]
    expect(String(url)).toContain('worker/simulator')
    expect(options?.type).toBe('module')
    expect(comlink.wrap).toHaveBeenCalledTimes(1)

    // All six functions hit the remote, never the direct import
    expect(remote.simulate).toHaveBeenCalled()
    expect(remote.sustainableSpend).toHaveBeenCalled()
    expect(remote.earliestRetirementAge).toHaveBeenCalled()
    expect(remote.requiredExtraSavings).toHaveBeenCalled()
    expect(remote.sensitivity).toHaveBeenCalled()
    expect(remote.insights).toHaveBeenCalled()
    expect(direct.simulate).not.toHaveBeenCalled()
    expect(direct.sensitivity).not.toHaveBeenCalled()
  })

  it('wraps onProgress in Comlink.proxy before crossing the boundary', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { client, comlink } = await loadFresh()
    const remote = makeRemote()
    vi.mocked(comlink.wrap).mockReturnValue(remote as never)

    const inputs = defaultInputs()
    const onProgress = vi.fn()
    await client.simulate(inputs, 1000, onProgress)

    expect(comlink.proxy).toHaveBeenCalledWith(onProgress)
    expect(remote.simulate).toHaveBeenCalledWith(inputs, 1000, { __proxied: onProgress })
  })

  it('passes undefined (not a proxy) when no onProgress is given', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { client, comlink } = await loadFresh()
    const remote = makeRemote()
    vi.mocked(comlink.wrap).mockReturnValue(remote as never)

    await client.simulate(defaultInputs(), 1000)

    expect(comlink.proxy).not.toHaveBeenCalled()
    expect(remote.simulate).toHaveBeenCalledWith(expect.anything(), 1000, undefined)
  })

  it('falls back to the direct import when Worker construction throws', async () => {
    class ThrowingWorker {
      constructor() {
        throw new Error('CSP says no')
      }
    }
    vi.stubGlobal('Worker', ThrowingWorker)
    const { client, direct, comlink } = await loadFresh()
    vi.mocked(direct.simulate).mockResolvedValue(MOCK_RESULT)

    const res = await client.simulate(defaultInputs(), 1000)

    expect(res).toBe(MOCK_RESULT)
    expect(direct.simulate).toHaveBeenCalled()
    expect(comlink.wrap).not.toHaveBeenCalled()
  })

  it('only attempts Worker construction once when the constructor throws', async () => {
    let constructions = 0
    class ThrowingWorker {
      constructor() {
        constructions++
        throw new Error('CSP says no')
      }
    }
    vi.stubGlobal('Worker', ThrowingWorker)
    const { client, direct } = await loadFresh()
    vi.mocked(direct.simulate).mockResolvedValue(MOCK_RESULT)
    vi.mocked(direct.sensitivity).mockResolvedValue('sens' as never)

    await client.simulate(defaultInputs(), 1000)
    await client.sensitivity(defaultInputs())

    expect(constructions).toBe(1)
  })

  it('rejects in-flight calls and falls back to direct when the worker fails asynchronously', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { client, direct, comlink } = await loadFresh()
    const remote = makeRemote()
    // The worker script never loads, so the Comlink call never settles.
    remote.simulate = vi.fn(() => new Promise(() => {}))
    vi.mocked(comlink.wrap).mockReturnValue(remote as never)
    vi.mocked(direct.simulate).mockResolvedValue(MOCK_RESULT)

    const pending = client.simulate(defaultInputs(), 1000)
    // The browser reports async load failures via the worker's `error` event.
    FakeWorker.instances[0].listeners['error']?.({ message: 'failed to fetch worker script' })

    await expect(pending).resolves.toBe(MOCK_RESULT)
    expect(direct.simulate).toHaveBeenCalled()
  })

  it('routes subsequent calls directly after a worker failure, without reconstructing', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { client, direct, comlink } = await loadFresh()
    const remote = makeRemote()
    remote.simulate = vi.fn(() => new Promise(() => {}))
    vi.mocked(comlink.wrap).mockReturnValue(remote as never)
    vi.mocked(direct.simulate).mockResolvedValue(MOCK_RESULT)
    vi.mocked(direct.sensitivity).mockResolvedValue('sens' as never)

    const pending = client.simulate(defaultInputs(), 1000)
    FakeWorker.instances[0].listeners['error']?.({ message: 'worker crashed' })
    await pending

    await expect(client.sensitivity(defaultInputs())).resolves.toBe('sens')
    expect(direct.sensitivity).toHaveBeenCalled()
    expect(remote.sensitivity).not.toHaveBeenCalled()
    expect(FakeWorker.instances).toHaveLength(1)
  })
})
