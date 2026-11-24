/**
 * Low-level helper that runs the `git` program and collects its output.
 *
 * Every git operation in Trellis goes through `runGit`. Keeping it in one place
 * means we can:
 *   - set a consistent environment (English output, no interactive prompts),
 *   - log every command for the "show git command" panel (see `onGitCommand`),
 *   - cancel long-running commands with an AbortSignal.
 *
 * Higher-level functions (e.g. `getCurrentBranch`) build on this and parse the
 * output into typed objects. Prefer adding a new high-level function over
 * calling `runGit` directly from the app.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export interface RunGitOptions {
  /** Directory to run git in. Usually the repository root. */
  cwd: string
  /** Cancel the command (the git process is killed). */
  signal?: AbortSignal
  /** Extra environment variables, merged over the defaults. */
  env?: Record<string, string>
  /**
   * Exit codes that should NOT throw. Some git commands use a non-zero exit
   * code to mean "no" rather than "error" (e.g. `git diff --quiet` exits 1
   * when there are changes). Defaults to `[0]`.
   */
  okExitCodes?: number[]
  /** Text to write to git's standard input. */
  stdin?: string
}

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Thrown when git exits with an unexpected code or can't be started. */
export class GitError extends Error {
  constructor(
    message: string,
    readonly args: readonly string[],
    readonly result?: GitResult,
    /** Set when the git program itself could not be found. */
    readonly notInstalled = false,
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/** Information about one finished git command, sent to `onGitCommand` listeners. */
export interface GitCommandEvent {
  args: readonly string[]
  cwd: string
  exitCode: number | null
  durationMs: number
}

type GitCommandListener = (event: GitCommandEvent) => void
const listeners = new Set<GitCommandListener>()

/**
 * Subscribe to every git command that runs. Used for the command log panel.
 * Returns a function that unsubscribes.
 */
export function onGitCommand(listener: GitCommandListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Environment applied to every git process.
 * - `LC_ALL=C` keeps git's messages in English so we can parse them reliably.
 * - `GIT_TERMINAL_PROMPT=0` makes git fail instead of waiting forever for a
 *   username/password on a terminal the user can't see. Credential prompts
 *   will be handled by the app in a later phase.
 * - `GIT_OPTIONAL_LOCKS=0` stops read-only commands like `git status` from
 *   taking locks that could clash with the user's own terminal.
 */
const BASE_ENV: Record<string, string> = {
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
}

/** The git executable. Trellis requires git to be installed and on PATH. */
const GIT_BINARY = 'git'

export function runGit(args: readonly string[], options: RunGitOptions): Promise<GitResult> {
  const okExitCodes = options.okExitCodes ?? [0]
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(GIT_BINARY, args, {
      cwd: options.cwd,
      env: { ...process.env, ...BASE_ENV, ...options.env },
      signal: options.signal,
      // Never open a console window on Windows.
      windowsHide: true,
    })

    // Collect raw bytes and decode once at the end, so multi-byte UTF-8
    // characters split across chunks are decoded correctly.
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const notify = (exitCode: number | null) => {
      const event = { args, cwd: options.cwd, exitCode, durationMs: Date.now() - started }
      for (const listener of listeners) listener(event)
    }

    // 'error' and 'close' can both fire for the same process, so only settle once.
    let settled = false

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      notify(null)
      // Node reports ENOENT both when the git program is missing AND when the
      // working directory doesn't exist, so check which one it was.
      const cwdMissing = err.code === 'ENOENT' && !existsSync(options.cwd)
      const notInstalled = err.code === 'ENOENT' && !cwdMissing
      const message = cwdMissing
        ? `Folder does not exist: ${options.cwd}`
        : notInstalled
          ? 'Git is not installed or is not on your PATH.'
          : `Failed to run git ${args.join(' ')}: ${err.message}`
      reject(new GitError(message, args, undefined, notInstalled))
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      notify(code)
      if (code === null) {
        // Killed by a signal from outside the app.
        reject(new GitError(`git ${args.join(' ')} was killed (${signal})`, args))
        return
      }
      const result: GitResult = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: code,
      }
      if (okExitCodes.includes(code)) {
        resolve(result)
      } else {
        const detail = result.stderr.trim() || `exit code ${code}`
        reject(new GitError(`git ${args.join(' ')} failed: ${detail}`, args, result))
      }
    })

    if (options.stdin !== undefined) child.stdin.end(options.stdin)
    else child.stdin.end()
  })
}
