/**
 * Runs write operations on a repository one at a time.
 *
 * Two git commands that both change the repository (e.g. clicking "Stage"
 * twice quickly) can collide on git's index.lock file and fail. Queueing
 * writes per repository avoids that. Different repositories don't wait for
 * each other, and read-only commands aren't queued.
 */
const tails = new Map<string, Promise<unknown>>()

export function runExclusive<T>(repoPath: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(repoPath) ?? Promise.resolve()
  // Run after the previous task finishes, whether it succeeded or failed.
  const result = previous.then(task, task)
  const tail = result.catch(() => {})
  tails.set(repoPath, tail)
  // Forget the queue once it's empty, so the map doesn't grow forever.
  void tail.then(() => {
    if (tails.get(repoPath) === tail) tails.delete(repoPath)
  })
  return result
}
