/**
 * Streams a repository's history from a single `git log` process and serves
 * it page by page.
 *
 * WHY: the simple approach, `git log --skip=N --max-count=500` for every page,
 * makes git walk all N earlier commits again for each page. Deep in a big
 * history (100k+ commits) every page gets slower. Instead we start ONE git
 * process, parse its output as it arrives, and keep the parsed commits in
 * memory. Pages are then just slices of an array.
 *
 * To avoid reading a huge history nobody scrolls to, we pause git's output
 * once we are READ_AHEAD commits past the furthest page requested, and
 * resume when a later page is asked for. (While paused, git simply blocks
 * writing to its output pipe.)
 *
 * Usage:
 *   const reader = new LogReader(repoPath, 'all')
 *   const page = await reader.getPage(0, 500)  // { commits, hasMore }
 *   reader.dispose()                            // stop git when done
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawnGit } from './run-git'
import { logArgs, logRevisions, parseCommits } from './log'
import type { Commit, LogOrder, LogScope } from './types'

/** How many commits to read beyond the furthest page requested. */
const READ_AHEAD = 2000

export interface LogPageResult {
  commits: Commit[]
  /** False when the end of the history has been reached. */
  hasMore: boolean
}

interface Waiter {
  /** Resolve once at least this many commits are loaded (or git finished). */
  needed: number
  resolve: () => void
  reject: (error: Error) => void
}

export class LogReader {
  private readonly commits: Commit[] = []
  /** Bytes received but not yet parsed (an incomplete record at the end). */
  private pending: Buffer = Buffer.alloc(0)
  private child: ChildProcessWithoutNullStreams | null = null
  private finished = false
  private error: Error | null = null
  private waiters: Waiter[] = []
  /** Number of commits the furthest page request needs. */
  private wanted = 0
  private readonly started: Promise<void>

  constructor(
    private readonly repoPath: string,
    readonly scope: LogScope = 'all',
    readonly order: LogOrder = 'topo',
  ) {
    this.started = this.start().catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    })
  }

  /**
   * Get `limit` commits starting at position `skip`. Waits until they have
   * been read from git (or the history ends).
   */
  async getPage(skip: number, limit: number): Promise<LogPageResult> {
    // Ask for one extra commit so we know whether another page exists.
    const needed = skip + limit + 1
    this.wanted = Math.max(this.wanted, needed)
    this.resumeIfNeeded()
    await this.started
    await this.waitFor(needed)
    return {
      commits: this.commits.slice(skip, skip + limit),
      hasMore: this.commits.length > skip + limit,
    }
  }

  /** Stop git. Pending page requests fail with an error. */
  dispose(): void {
    this.child?.kill()
    this.child = null
    this.fail(new Error('Log reader was closed'))
  }

  private async start(): Promise<void> {
    const revisions = await logRevisions(this.repoPath, this.scope)
    if (this.finished) return // disposed while we were checking
    if (!revisions) {
      // Empty repository: nothing to read.
      this.finish()
      return
    }

    const child = spawnGit(logArgs(revisions, [], this.order), { cwd: this.repoPath })
    this.child = child
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => this.fail(error))
    child.on('close', (code) => {
      this.child = null
      if (code === 0 || code === null) {
        // Parse anything left over (output normally ends with NUL, so usually nothing).
        this.parse(true)
        this.finish()
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim()
        this.fail(new Error(`git log failed: ${message || `exit code ${code}`}`))
      }
    })
  }

  private onData(chunk: Buffer): void {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk
    this.parse(false)
    this.notifyWaiters()
    // Far enough ahead of what anyone has asked for: stop reading for now.
    if (this.commits.length >= this.wanted + READ_AHEAD) this.child?.stdout.pause()
  }

  /**
   * Parse complete records from `pending`. Each commit ends with a NUL byte.
   * We split on bytes (not text) so a multi-byte UTF-8 character that was cut
   * in half between two chunks is never decoded incorrectly.
   */
  private parse(final: boolean): void {
    const end = final ? this.pending.length : this.pending.lastIndexOf(0) + 1
    if (end <= 0) return
    const complete = this.pending.subarray(0, end).toString('utf8')
    this.pending = this.pending.subarray(end)
    for (const commit of parseCommits(complete)) this.commits.push(commit)
  }

  private resumeIfNeeded(): void {
    const stdout = this.child?.stdout
    if (stdout?.isPaused() && this.commits.length < this.wanted + READ_AHEAD) stdout.resume()
  }

  private waitFor(needed: number): Promise<void> {
    if (this.error) return Promise.reject(this.error)
    if (this.finished || this.commits.length >= needed) return Promise.resolve()
    return new Promise((resolve, reject) => this.waiters.push({ needed, resolve, reject }))
  }

  private notifyWaiters(): void {
    this.waiters = this.waiters.filter((waiter) => {
      if (this.commits.length < waiter.needed) return true
      waiter.resolve()
      return false
    })
  }

  private finish(): void {
    this.finished = true
    for (const waiter of this.waiters) waiter.resolve()
    this.waiters = []
  }

  private fail(error: Error): void {
    if (this.finished) return
    this.error = error
    this.finished = true
    for (const waiter of this.waiters) waiter.reject(error)
    this.waiters = []
  }
}
