/**
 * Runs at most N tasks at a time; the rest wait their turn.
 *
 * Used for the home screen's repository list, which asks for the status of
 * every listed repository at once. Starting dozens of git processes
 * together briefly blocks the main process (each spawn takes a few
 * milliseconds), and the main process also forwards scrolling and other
 * input to the window, so the home screen stuttered. A few at a time keeps
 * the total time about the same while leaving gaps for input in between.
 */
export function createLimiter(max: number) {
  let running = 0
  const waiting: (() => void)[] = []

  /** Run `task` once fewer than `max` tasks are running. */
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    running++
    try {
      return await task()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}
