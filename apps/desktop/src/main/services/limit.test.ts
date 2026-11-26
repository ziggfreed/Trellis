import { describe, expect, it } from 'vitest'
import { createLimiter } from './limit'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createLimiter', () => {
  it('never runs more than the limit at once, and runs every task', async () => {
    const limit = createLimiter(2)
    let running = 0
    let most = 0
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limit(async () => {
          running++
          most = Math.max(most, running)
          await delay(5)
          running--
          return n * 10
        }),
      ),
    )
    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(most).toBe(2)
  })

  it('carries on after a task fails', async () => {
    const limit = createLimiter(1)
    const failed = limit(async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(limit(async () => 'ok')).resolves.toBe('ok')
  })
})
