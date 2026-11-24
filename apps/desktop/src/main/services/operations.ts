/**
 * Keeps track of long-running operations (like a clone) so the UI can cancel
 * them. Each operation has an id chosen by the UI and an AbortController.
 */
const running = new Map<string, AbortController>()

/** Register an operation and get the AbortSignal to pass to git. */
export function startOperation(id: string): AbortSignal {
  const controller = new AbortController()
  running.set(id, controller)
  return controller.signal
}

/** Mark an operation as finished (successfully or not). */
export function endOperation(id: string): void {
  running.delete(id)
}

/** Cancel a running operation. Does nothing if it already finished. */
export function cancelOperation(id: string): void {
  running.get(id)?.abort()
  running.delete(id)
}
