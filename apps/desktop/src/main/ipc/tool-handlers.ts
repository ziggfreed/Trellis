/**
 * IPC handlers for repository housekeeping: managing remotes, commit
 * signatures and signing settings, the reflog, .gitignore, and cleaning up
 * branches. Spread into the full handler list in handlers.ts.
 *
 * Arguments come from the renderer, so they're checked first. Changes that
 * undo can restore (branch deletions) are recorded as operations; changes
 * it can't (remote settings, .gitignore) just go through the repo queue.
 */
import * as git from '@trellis/git'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { runExclusive } from '../services/repo-queue'
import {
  assertFileInRepo,
  assertOneOf,
  assertRefArg,
  assertSha,
  assertString,
  assertStringArray,
} from './validate'

type ToolChannel =
  | 'repo:addRemote'
  | 'repo:renameRemote'
  | 'repo:setRemoteUrl'
  | 'repo:removeRemote'
  | 'repo:getSignature'
  | 'git:getSigning'
  | 'git:setSigning'
  | 'repo:getReflog'
  | 'repo:ignore'
  | 'repo:untrack'
  | 'repo:getDefaultBranch'
  | 'repo:getBranchCleanup'
  | 'repo:deleteBranches'

type ToolHandlers = {
  [C in ToolChannel & IpcChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/** A remote URL: any text git accepts, but never something read as an option. */
function assertUrl(value: unknown): asserts value is string {
  assertString(value, 'url')
  if (!value.trim() || value.trim().startsWith('-')) throw new TypeError('url is not valid')
}

/** A remote name, checked with the same rule the UI shows. */
function assertRemoteName(value: unknown, name: string): asserts value is string {
  assertString(value, name)
  const problem = git.remoteNameProblem(value)
  if (problem) throw new TypeError(problem)
}

export function createToolHandlers(): ToolHandlers {
  return {
    // --- Remotes -------------------------------------------------------------
    'repo:addRemote': (path, name, url) => {
      assertString(path, 'path')
      assertRemoteName(name, 'name')
      assertUrl(url)
      return runExclusive(path, () => git.addRemote(path, name.trim(), url.trim()))
    },
    'repo:renameRemote': (path, from, to) => {
      assertString(path, 'path')
      assertRefArg(from, 'from')
      assertRemoteName(to, 'to')
      return runExclusive(path, () => git.renameRemote(path, from, to.trim()))
    },
    'repo:setRemoteUrl': (path, name, url) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      assertUrl(url)
      return runExclusive(path, () => git.setRemoteUrl(path, name, url.trim()))
    },
    'repo:removeRemote': (path, name) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      return runExclusive(path, () => git.removeRemote(path, name))
    },

    // --- Signatures ------------------------------------------------------------
    'repo:getSignature': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return git.getCommitSignature(path, sha)
    },
    'git:getSigning': () => git.getSigningConfig(),
    'git:setSigning': (config) => {
      if (typeof config !== 'object' || config === null)
        throw new TypeError('config must be an object')
      if (typeof config.signCommits !== 'boolean')
        throw new TypeError('signCommits must be a boolean')
      assertOneOf(config.format, ['openpgp', 'ssh'] as const, 'format')
      assertString(config.key, 'key')
      return git.setSigningConfig(config)
    },

    // --- Reflog --------------------------------------------------------------
    'repo:getReflog': async (path) => {
      assertString(path, 'path')
      const entries = await git.getReflog(path)
      const unreachable = await git.findUnreachable(
        path,
        entries.map((e) => e.sha),
      )
      return { entries, unreachable: [...unreachable] }
    },

    // --- .gitignore ----------------------------------------------------------
    'repo:ignore': (path, file, kind) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      assertOneOf(kind, ['file', 'extension', 'folder'] as const, 'kind')
      const pattern = git.ignorePattern(file, kind)
      if (!pattern) throw new Error('That kind of pattern doesn’t apply to this file.')
      return runExclusive(path, async () => {
        const added = await git.addToGitignore(path, pattern)
        return { pattern, added, trackedMatches: await git.trackedIgnoredFiles(path) }
      })
    },
    'repo:untrack': (path, files) => {
      assertString(path, 'path')
      assertStringArray(files, 'files')
      for (const file of files) assertFileInRepo(path, file)
      return runExclusive(path, () => git.untrack(path, files))
    },

    // --- Cleaning up branches -------------------------------------------------
    'repo:getDefaultBranch': (path) => {
      assertString(path, 'path')
      return git.getDefaultBranch(path)
    },
    'repo:getBranchCleanup': (path, target) => {
      assertString(path, 'path')
      assertRefArg(target, 'target')
      return git.getBranchCleanup(path, target)
    },
    'repo:deleteBranches': (path, names, options) => {
      assertString(path, 'path')
      assertStringArray(names, 'names')
      for (const name of names) assertRefArg(name, 'name')
      const forced = options?.force ?? []
      assertStringArray(forced, 'options.force')
      const force = new Set(forced)
      const label = `Delete ${names.length} ${names.length === 1 ? 'branch' : 'branches'}`
      // One recorded operation, so a single undo brings them all back.
      return runExclusive(path, () =>
        git.recordOperation(path, label, { worktree: false }, async () => {
          const deleted: string[] = []
          const failed: { name: string; error: string }[] = []
          for (const name of names) {
            try {
              // Only forced when asked (squash-merged branches, or ones the user
              // chose to delete anyway); otherwise git refuses if a branch isn't
              // fully merged after all. Undo restores either kind.
              await git.deleteBranch(path, name, force.has(name))
              deleted.push(name)
            } catch (error) {
              failed.push({ name, error: error instanceof Error ? error.message : String(error) })
            }
          }
          return { deleted, failed }
        }),
      )
    },
  }
}
