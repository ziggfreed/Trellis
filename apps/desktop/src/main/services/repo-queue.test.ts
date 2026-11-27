import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSY_DELAY_MS, onBusy, runExclusive, type BusyNotice } from './repo-queue'

let notices: BusyNotice[]
beforeEach(() => {
  vi.useFakeTimers()
  notices = []
  onBusy((notice) => notices.push(notice))
})
afterEach(() => vi.useRealTimers())

/** A task that finishes after `ms` (fake) milliseconds. */
const taking = (ms: number) => () =>
  new Promise<string>((resolve) => setTimeout(() => resolve('done'), ms))

describe('runExclusive', () => {
  it('reports a labelled task that takes a while, then reports it finished', async () => {
    const result = runExclusive('/repo', taking(BUSY_DELAY_MS * 3), 'Merge feature')
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS)
    expect(notices).toEqual([{ id: expect.any(Number), repoPath: '/repo', label: 'Merge feature' }])
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS * 2)
    expect(await result).toBe('done')
    expect(notices[1]).toEqual({ id: notices[0]!.id, repoPath: '/repo', label: null })
  })

  it('says nothing about quick tasks or unlabelled ones', async () => {
    const quick = runExclusive('/repo', taking(BUSY_DELAY_MS / 2), 'Stage 1 file')
    const unlabelled = runExclusive('/repo', taking(BUSY_DELAY_MS * 3))
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS * 5)
    await Promise.all([quick, unlabelled])
    expect(notices).toEqual([])
  })

  it('reports a failed task as finished too', async () => {
    const failing = runExclusive(
      '/repo',
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('conflict')), BUSY_DELAY_MS * 2),
        ),
      'Rebase',
    )
    const caught = failing.catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS * 3)
    expect(await caught).toBe('conflict')
    expect(notices.map((n) => n.label)).toEqual(['Rebase', null])
  })
})
