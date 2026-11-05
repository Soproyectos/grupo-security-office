import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { followBatch } from './template-import.polling'
import { getBatchResults, getProgress } from './template-import.api'
import { MAX_POLLS, POLL_INTERVAL_MS } from './template-import.helpers'
import type { BatchResults, BatchSummary } from './template-import.types'

vi.mock('./template-import.api', () => ({ getProgress: vi.fn(), getBatchResults: vi.fn() }))
const batch = (state: BatchSummary['state'] = 'PROCESSING') => ({ batchId: 'batch-a', state, processed: 1, total: 2 } as BatchSummary)
const results = { batch: batch('COMPLETED'), rows: [], unassigned: [] } as BatchResults
const handlers = () => ({ onProgress: vi.fn(), onResult: vi.fn(), onStopped: vi.fn(), onError: vi.fn() })
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(getProgress).mockReset().mockResolvedValue(batch())
  vi.mocked(getBatchResults).mockReset().mockResolvedValue(results)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('batch follow-up used by BatchViewer', () => {
  it('requests immediately, then serially at the configured interval', async () => {
    const callbacks = handlers()
    const stop = followBatch('batch-a', callbacks)
    expect(getProgress).toHaveBeenCalledWith('batch-a')
    await settle()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1)
    expect(getProgress).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getProgress).toHaveBeenCalledTimes(2)
    expect(callbacks.onProgress).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    expect(getProgress).toHaveBeenCalledTimes(2)
  })

  it.each(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'] as const)('loads %s results once without further polling', async (state) => {
    vi.mocked(getProgress).mockResolvedValue(batch(state))
    const callbacks = handlers()
    followBatch('batch-a', callbacks)
    await settle()
    expect(getBatchResults).toHaveBeenCalledExactlyOnceWith('batch-a')
    expect(callbacks.onResult).toHaveBeenCalledWith(results)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(getProgress).toHaveBeenCalledTimes(1)
  })

  it('stops at the query limit and allows a fresh follow-up from history', async () => {
    const callbacks = handlers()
    const stop = followBatch('batch-a', callbacks)
    await vi.runAllTimersAsync()
    expect(getProgress).toHaveBeenCalledTimes(MAX_POLLS)
    expect(callbacks.onStopped).toHaveBeenCalledTimes(1)
    expect(getBatchResults).not.toHaveBeenCalled()
    stop()
    const resume = followBatch('batch-a', handlers())
    await settle()
    expect(getProgress).toHaveBeenCalledTimes(MAX_POLLS + 1)
    resume()
  })

  it('ignores an in-flight response after leaving the viewer', async () => {
    let resolve!: (value: BatchSummary) => void
    vi.mocked(getProgress).mockReturnValue(new Promise((done) => { resolve = done }))
    const callbacks = handlers()
    const stop = followBatch('batch-a', callbacks)
    stop()
    resolve(batch('COMPLETED'))
    await settle()
    expect(callbacks.onProgress).not.toHaveBeenCalled()
    expect(getBatchResults).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores results completing after the viewer is unmounted', async () => {
    let resolve!: (value: BatchResults) => void
    vi.mocked(getProgress).mockResolvedValue(batch('COMPLETED'))
    vi.mocked(getBatchResults).mockReturnValue(new Promise((done) => { resolve = done }))
    const callbacks = handlers()
    const stop = followBatch('batch-a', callbacks)
    await settle()
    stop()
    resolve(results)
    await settle()
    expect(callbacks.onResult).not.toHaveBeenCalled()
  })

  it.each(['progress', 'results'])('reports %s errors without scheduling more requests', async (phase) => {
    const failure = { response: { status: 403 } }
    if (phase === 'progress') vi.mocked(getProgress).mockRejectedValue(failure)
    else { vi.mocked(getProgress).mockResolvedValue(batch('COMPLETED')); vi.mocked(getBatchResults).mockRejectedValue(failure) }
    const callbacks = handlers()
    followBatch('batch-a', callbacks)
    await settle()
    expect(callbacks.onError).toHaveBeenCalledWith(failure)
    expect(vi.getTimerCount()).toBe(0)
  })
})
