/**
 * Creating repositories: `git clone` (with progress reporting) and `git init`.
 */
import { mkdir } from 'node:fs/promises'
import { runGit } from './run-git'

export interface CloneProgress {
  /** What git is doing, e.g. "Receiving objects" or "Resolving deltas". */
  phase: string
  /** 0-100 for the current phase. */
  percent: number
}

/**
 * Parse the last progress line in a chunk of `git clone --progress` stderr.
 *
 * Git redraws its progress line in place using carriage returns, so a chunk
 * looks like: "Receiving objects:  45% (450/1000)\rReceiving objects:  46% ..."
 * Returns null if the chunk contains no progress line.
 */
export function parseCloneProgress(chunk: string): CloneProgress | null {
  let latest: CloneProgress | null = null
  for (const line of chunk.split(/[\r\n]+/)) {
    // Lines may be prefixed with "remote: " when the server reports progress.
    const match = /^(?:remote: )?([A-Za-z][A-Za-z ]+):\s+(\d+)%/.exec(line.trim())
    if (match) latest = { phase: match[1]!, percent: Number(match[2]) }
  }
  return latest
}

export interface CloneOptions {
  onProgress?: (progress: CloneProgress) => void
  signal?: AbortSignal
}

/**
 * Clone `url` into `targetDir` (which must not exist or be empty).
 * `--progress` makes git report progress even though stderr isn't a terminal.
 */
export async function cloneRepository(
  url: string,
  targetDir: string,
  options: CloneOptions = {},
): Promise<void> {
  await runGit(['clone', '--progress', '--', url, targetDir], {
    // Run from the current directory: the target may not exist yet.
    cwd: process.cwd(),
    signal: options.signal,
    onStderr: (chunk) => {
      const progress = parseCloneProgress(chunk)
      if (progress) options.onProgress?.(progress)
    },
  })
}

/** Create a new, empty repository in `dir` (creating the folder if needed). */
export async function initRepository(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await runGit(['init'], { cwd: dir })
}

/**
 * Suggest a folder name from a clone URL, like git does:
 *   https://github.com/user/my-repo.git -> "my-repo"
 *   git@github.com:user/my-repo         -> "my-repo"
 */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, '')
  const last = trimmed.split(/[\\/:]/).pop() ?? ''
  return last.replace(/\.git$/, '')
}
