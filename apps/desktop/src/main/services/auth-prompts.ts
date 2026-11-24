/**
 * Connects git's credential questions (from the AskpassServer) to the UI.
 *
 * Each question gets an id and is sent to the window as an 'auth:prompt'
 * event; the answer comes back through 'auth:respond'. If no window is
 * open, or the window is closed while waiting, the question is cancelled.
 */
import { randomUUID } from 'node:crypto'
import { isSecretPrompt } from './askpass'

type Send = (payload: { id: string; prompt: string; secret: boolean }) => boolean

const pending = new Map<string, (answer: string | null) => void>()

/** Ask the user. `send` returns false if there was no window to ask. */
export function askUser(prompt: string, send: Send): Promise<string | null> {
  const id = randomUUID()
  return new Promise((resolve) => {
    pending.set(id, resolve)
    if (!send({ id, prompt, secret: isSecretPrompt(prompt) })) respond(id, null)
  })
}

/** Deliver the user's answer (null = cancelled). Unknown ids are ignored. */
export function respond(id: string, answer: string | null): void {
  const resolve = pending.get(id)
  pending.delete(id)
  resolve?.(answer)
}

/** Cancel every open question (e.g. when the window closes). */
export function cancelAllPrompts(): void {
  for (const id of [...pending.keys()]) respond(id, null)
}
