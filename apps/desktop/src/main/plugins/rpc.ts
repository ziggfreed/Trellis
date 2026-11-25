/**
 * A tiny request/response layer over a message channel (the plugin host's
 * parentPort, or a utilityProcess from main's side). Both ends create one:
 *
 *   const rpc = createRpc<TheirMethods, TheirEvents>(send, myMethods, myEvents)
 *   channel.on('message', rpc.receive)
 *   const result = await rpc.request('someMethod', params)
 *
 * Errors thrown by a method are sent back as messages and re-thrown on the
 * calling side as Error objects.
 */
import type { RpcMessage } from './protocol'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Methods = Record<string, (params: any) => unknown>
type Events = Record<string, unknown>

export interface Rpc<Remote extends Methods, RemoteEvents extends Events> {
  /** Call a method on the other side. */
  request<M extends keyof Remote & string>(
    method: M,
    ...params: Parameters<Remote[M]> extends [] ? [] : [Parameters<Remote[M]>[0]]
  ): Promise<Awaited<ReturnType<Remote[M]>>>
  /** Send an event to the other side (no reply). */
  emit<E extends keyof RemoteEvents & string>(name: E, payload: RemoteEvents[E]): void
  /** Feed every message received from the other side into this. */
  receive(message: unknown): void
  /** Reject everything still waiting (e.g. the other side died). */
  close(reason: string): void
}

export function createRpc<Remote extends Methods, RemoteEvents extends Events = Events>(
  send: (message: RpcMessage) => void,
  methods: Partial<Methods>,
  onEvent: (name: string, payload: any) => void = () => {},
): Rpc<Remote, RemoteEvents> {
  let nextId = 1
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()

  const respond = async (id: number, method: string, params: unknown) => {
    const handler = methods[method]
    try {
      if (!handler) throw new Error(`Unknown method: ${method}`)
      send({ kind: 'response', id, result: await handler(params) })
    } catch (error) {
      send({ kind: 'response', id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    request: (method, ...params) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        send({ kind: 'request', id, method, params: params[0] })
      }),
    emit: (name, payload) => send({ kind: 'event', name, payload }),
    receive: (raw) => {
      const message = raw as RpcMessage
      if (message?.kind === 'request') void respond(message.id, message.method, message.params)
      else if (message?.kind === 'event') onEvent(message.name, message.payload)
      else if (message?.kind === 'response') {
        const waiting = pending.get(message.id)
        if (!waiting) return
        pending.delete(message.id)
        if (message.error !== undefined) waiting.reject(new Error(message.error))
        else waiting.resolve(message.result)
      }
    },
    close: (reason) => {
      for (const { reject } of pending.values()) reject(new Error(reason))
      pending.clear()
    },
  }
}
