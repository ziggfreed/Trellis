/**
 * Runs write operations on a repository one at a time, and reports the ones
 * that take a while so the UI can say what's happening.
 *
 * Two git commands that both change the repository (e.g. clicking "Stage"
 * twice quickly) can collide on git's index.lock file and fail. Queueing
 * writes per repository avoids that. Different repositories don't wait for
 * each other, and read-only commands aren't queued.
 *
 * A task given a `label` (e.g. "Merge feature") that's still running after
 * BUSY_DELAY_MS is reported to the busy listener, and again when it ends.
 * Every write the user starts passes through here, so this one place gives
 * them all a "Merge feature…" notice, while quick ones show nothing (no
 * flicker). Network operations report their own progress instead.
 */
const tails = new Map<string, Promise<unknown>>()

/** How long a labelled task runs before it's reported as busy. */
export const BUSY_DELAY_MS = 400

export interface BusyNotice {
  /** Identifies this task, so its "done" notice matches its "busy" one. */
  id: number
  repoPath: string
  /** What's happening, e.g. "Merge feature"; null when it has finished. */
  label: string | null
}

let busyListener: (notice: BusyNotice) => void = () => {}
let nextId = 1

/** Where busy notices go (the IPC layer forwards them to the UI). */
export function onBusy(listener: (notice: BusyNotice) => void): void {
  busyListener = listener
}

export function runExclusive<T>(
  repoPath: string,
  task: () => Promise<T>,
  label?: string,
): Promise<T> {
  const previous = tails.get(repoPath) ?? Promise.resolve()
  const run = label ? () => reportIfSlow(repoPath, label, task) : task
  // Run after the previous task finishes, whether it succeeded or failed.
  const result = previous.then(run, run)
  const tail = result.catch(() => {})
  tails.set(repoPath, tail)
  // Forget the queue once it's empty, so the map doesn't grow forever.
  void tail.then(() => {
    if (tails.get(repoPath) === tail) tails.delete(repoPath)
  })
  return result
}

/** Run `task`, telling the busy listener if it takes longer than BUSY_DELAY_MS. */
async function reportIfSlow<T>(repoPath: string, label: string, task: () => Promise<T>) {
  const id = nextId++
  let reported = false
  const timer = setTimeout(() => {
    reported = true
    busyListener({ id, repoPath, label })
  }, BUSY_DELAY_MS)
  try {
    return await task()
  } finally {
    clearTimeout(timer)
    if (reported) busyListener({ id, repoPath, label: null })
  }
}
