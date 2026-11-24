import { describe, expect, it } from 'vitest'
import { runExclusive } from './repo-queue'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runExclusive', () => {
  it('runs tasks for the same repository one after another', async () => {
    const order: string[] = []
    const task = (name: string, ms: number) => async () => {
      order.push(`start ${name}`)
      await delay(ms)
      order.push(`end ${name}`)
    }
    await Promise.all([runExclusive('/a', task('1', 20)), runExclusive('/a', task('2', 1))])
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('keeps going after a task fails', async () => {
    const failed = runExclusive('/b', async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(runExclusive('/b', async () => 'ok')).resolves.toBe('ok')
  })

  it('does not make different repositories wait for each other', async () => {
    const order: string[] = []
    await Promise.all([
      runExclusive('/c', async () => {
        await delay(20)
        order.push('slow')
      }),
      runExclusive('/d', async () => {
        order.push('fast')
      }),
    ])
    expect(order).toEqual(['fast', 'slow'])
  })
})
