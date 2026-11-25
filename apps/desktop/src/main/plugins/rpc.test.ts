import { describe, expect, it } from 'vitest'
import { createRpc, type Rpc } from './rpc'
import type { RpcMessage } from './protocol'

/** The methods side B offers in these tests. */
type TestMethods = {
  add(params: { x: number; y: number }): number
  fail(): void
  slow(): string
  missing(): void
}

/** Two RPC ends wired to each other through a fake channel. */
function pair() {
  let a: Rpc<TestMethods, { hello: { n: number } }> | null = null
  let b: Rpc<Record<string, never>, Record<string, never>> | null = null
  const events: [string, unknown][] = []
  // Deliver asynchronously, like a real message channel.
  const toB = (m: RpcMessage) => queueMicrotask(() => b!.receive(structuredClone(m)))
  const toA = (m: RpcMessage) => queueMicrotask(() => a!.receive(structuredClone(m)))
  a = createRpc<TestMethods, { hello: { n: number } }>(toB, {})
  b = createRpc(
    toA,
    {
      add: ({ x, y }: { x: number; y: number }) => x + y,
      fail: () => {
        throw new Error('nope')
      },
      slow: () => new Promise((resolve) => setTimeout(() => resolve('done'), 5)),
    },
    (name, payload) => events.push([name, payload]),
  )
  return { a, events }
}

describe('createRpc', () => {
  it('calls methods on the other side and returns results', async () => {
    const { a } = pair()
    expect(await a.request('add', { x: 2, y: 3 })).toBe(5)
    expect(await a.request('slow')).toBe('done')
  })

  it('passes errors back as rejected promises', async () => {
    const { a } = pair()
    await expect(a.request('fail')).rejects.toThrow('nope')
    await expect(a.request('missing')).rejects.toThrow('Unknown method: missing')
  })

  it('delivers events, and rejects pending calls when closed', async () => {
    const { a, events } = pair()
    a.emit('hello', { n: 1 })
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toEqual([['hello', { n: 1 }]])
    const waiting = a.request('slow')
    a.close('host stopped')
    await expect(waiting).rejects.toThrow('host stopped')
  })
})
