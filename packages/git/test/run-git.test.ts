import { afterEach, describe, expect, it } from 'vitest'
import { GitError, errorDetail, onGitCommand, runGit } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

describe('runGit', () => {
  it('returns stdout of a successful command', async () => {
    repo = await createTempRepo()
    const result = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path })
    expect(result).toMatchObject({ stdout: 'true\n', exitCode: 0 })
  })

  it('throws GitError with stderr on failure', async () => {
    repo = await createTempRepo()
    const error = await runGit(['checkout', 'no-such-branch'], { cwd: repo.path }).catch((e) => e)
    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).result?.exitCode).not.toBe(0)
  })

  it('does not throw for exit codes listed in okExitCodes', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a')
    await repo.commit('first')
    await repo.write('a.txt', 'changed')
    const result = await runGit(['diff', '--quiet'], { cwd: repo.path, okExitCodes: [0, 1] })
    expect(result.exitCode).toBe(1)
  })

  it('decodes UTF-8 output', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a')
    await repo.commit('héllo wörld ✓')
    const { stdout } = await runGit(['log', '-1', '--format=%s'], { cwd: repo.path })
    expect(stdout.trim()).toBe('héllo wörld ✓')
  })

  it('notifies onGitCommand listeners', async () => {
    repo = await createTempRepo()
    const seen: string[][] = []
    const off = onGitCommand((e) => seen.push([...e.args]))
    await runGit(['status'], { cwd: repo.path })
    off()
    await runGit(['status'], { cwd: repo.path })
    expect(seen).toEqual([['status']])
  })

  it('finishes when git exits even if a background process keeps its output open', async () => {
    repo = await createTempRepo()
    // A shell alias that leaves `sleep` running in the background, holding
    // git's stdout open after git itself has exited (like an fsmonitor
    // daemon or background maintenance can on Windows).
    const started = Date.now()
    const { stdout } = await runGit(['-c', 'alias.bg=!sleep 4 & echo done', 'bg'], {
      cwd: repo.path,
    })
    expect(stdout.trim()).toBe('done')
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('can be cancelled with an AbortSignal', async () => {
    repo = await createTempRepo()
    const controller = new AbortController()
    controller.abort()
    await expect(
      runGit(['status'], { cwd: repo.path, signal: controller.signal }),
    ).rejects.toThrow()
  })
})

describe('errorDetail', () => {
  it('drops progress lines, keeping the actual error', () => {
    const stderr =
      'remote: Enumerating objects: 56505, done.\n' +
      'remote: Counting objects:  50% (1/2)\rremote: Counting objects: 100% (2/2), done.\n' +
      'remote: Total 56505 (delta 0), reused 0 (delta 0), pack-reused 56505\n' +
      Array.from(
        { length: 300 },
        (_, i) => `Receiving objects: ${i % 100}% (${i}/56505), 32.40 MiB | 21.57 MiB/s`,
      ).join('\r') +
      '\nerror: RPC failed; curl 56 Recv failure: Connection was reset\n' +
      'fatal: early EOF\n'
    expect(errorDetail(stderr)).toBe(
      'error: RPC failed; curl 56 Recv failure: Connection was reset\nfatal: early EOF',
    )
  })

  it('keeps ordinary messages, and only the last lines of a very long one', () => {
    expect(errorDetail("fatal: couldn't find remote ref nope\n")).toBe(
      "fatal: couldn't find remote ref nope",
    )
    const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const detail = errorDetail(long).split('\n')
    expect(detail[0]).toBe('…')
    expect(detail.at(-1)).toBe('line 29')
    expect(detail).toHaveLength(13)
  })
})
