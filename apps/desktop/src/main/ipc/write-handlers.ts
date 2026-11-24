/**
 * IPC handlers for operations that CHANGE a repository (staging, commits,
 * branches, stashes, tags, fetch/pull/push...).
 *
 * Every write runs through `runExclusive`, so two writes to the same
 * repository never overlap (see services/repo-queue.ts). Long remote
 * operations report progress as 'operation:progress' events and can be
 * cancelled with 'operation:cancel'.
 *
 * Arguments come from the UI, so each handler validates them first.
 */
import * as git from '@trellis/git'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { runExclusive } from '../services/repo-queue'
import { endOperation, startOperation } from '../services/operations'
import { respond } from '../services/auth-prompts'
import type { CommandLog } from '../services/command-log'
import {
  assertCheckoutTarget,
  assertIndex,
  assertOneOf,
  assertPushRequest,
  assertRefArg,
  assertSha,
  assertString,
  assertStringArray,
} from './validate'

type Handlers = {
  [C in IpcChannel]?: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/** Send progress for a long operation to the UI. */
type ProgressSender = (operationId: string, phase: string, percent: number) => void

/** Run a remote operation with progress reporting and cancellation. */
async function remoteOperation<T>(
  operationId: string,
  repoPath: string,
  sendProgress: ProgressSender,
  run: (options: git.RemoteOptions) => Promise<T>,
): Promise<T> {
  assertString(operationId, 'operationId')
  assertString(repoPath, 'path')
  const signal = startOperation(operationId)
  try {
    return await runExclusive(repoPath, () =>
      run({ signal, onProgress: (p) => sendProgress(operationId, p.phase, p.percent) }),
    )
  } finally {
    endOperation(operationId)
  }
}

export function createWriteHandlers(commandLog: CommandLog, sendProgress: ProgressSender) {
  return {
    // --- Staging and committing ---------------------------------------------
    'repo:stage': (path, files) => {
      assertString(path, 'path')
      assertStringArray(files, 'files')
      return runExclusive(path, () => git.stageFiles(path, files))
    },

    'repo:unstage': (path, files) => {
      assertString(path, 'path')
      assertStringArray(files, 'files')
      return runExclusive(path, () => git.unstageFiles(path, files))
    },

    'repo:discard': (path, files) => {
      assertString(path, 'path')
      if (!Array.isArray(files)) throw new TypeError('files must be an array')
      for (const file of files) assertString(file?.path, 'file.path')
      return runExclusive(path, () =>
        git.discardFiles(
          path,
          files.map((f) => ({ path: f.path, untracked: f.untracked === true })),
        ),
      )
    },

    'repo:getFilePatch': (path, file, area) => {
      assertString(path, 'path')
      assertString(file, 'file')
      assertOneOf(area, ['staged', 'unstaged', 'untracked'] as const, 'area')
      return git.getFilePatch(path, file, area)
    },

    'repo:applyPatch': (path, patch, action) => {
      assertString(path, 'path')
      assertString(patch, 'patch')
      assertOneOf(action, ['stage', 'unstage', 'discard'] as const, 'action')
      return runExclusive(path, () => git.applyPatch(path, patch, action))
    },

    'repo:commit': (path, message, options) => {
      assertString(path, 'path')
      if (typeof message !== 'string') throw new TypeError('message must be a string')
      return runExclusive(path, () => git.commit(path, message, { amend: options?.amend === true }))
    },

    'repo:getHeadMessage': (path) => {
      assertString(path, 'path')
      return git.getHeadMessage(path)
    },

    // --- Branches and history -----------------------------------------------
    'repo:createBranch': (path, name, options) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      if (options?.startPoint !== undefined) assertRefArg(options.startPoint, 'startPoint')
      return runExclusive(path, () =>
        git.createBranch(path, name, {
          checkout: options?.checkout === true,
          ...(options?.startPoint ? { startPoint: options.startPoint } : {}),
        }),
      )
    },

    'repo:checkout': (path, target) => {
      assertString(path, 'path')
      assertCheckoutTarget(target)
      return runExclusive(path, () => {
        if (target.kind === 'branch') return git.checkoutBranch(path, target.name)
        if (target.kind === 'remote-branch')
          return git.checkoutRemoteBranch(path, target.name, target.localName)
        return git.checkoutCommit(path, target.sha)
      })
    },

    'repo:renameBranch': (path, from, to) => {
      assertString(path, 'path')
      assertRefArg(from, 'from')
      assertRefArg(to, 'to')
      return runExclusive(path, () => git.renameBranch(path, from, to))
    },

    'repo:deleteBranch': (path, name, force) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      return runExclusive(path, () => git.deleteBranch(path, name, force === true))
    },

    'repo:merge': (path, ref, options) => {
      assertString(path, 'path')
      assertRefArg(ref, 'ref')
      return runExclusive(path, () =>
        git.merge(path, ref, { noFastForward: options?.noFastForward === true }),
      )
    },

    'repo:rebase': (path, onto) => {
      assertString(path, 'path')
      assertRefArg(onto, 'onto')
      return runExclusive(path, () => git.rebase(path, onto))
    },

    'repo:cherryPick': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return runExclusive(path, () => git.cherryPick(path, sha))
    },

    'repo:revert': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return runExclusive(path, () => git.revert(path, sha))
    },

    'repo:reset': (path, sha, mode) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      assertOneOf(mode, ['soft', 'mixed', 'hard'] as const, 'mode')
      return runExclusive(path, () => git.reset(path, sha, mode))
    },

    'repo:operation': (path, action) => {
      assertString(path, 'path')
      assertOneOf(action, ['abort', 'continue', 'skip'] as const, 'action')
      return runExclusive(path, async () => {
        const operation = await git.getRepoOperation(path)
        if (!operation)
          throw new Error('There is no merge, rebase, cherry-pick or revert in progress.')
        if (action === 'abort') return git.abortOperation(path, operation)
        if (action === 'continue') return git.continueOperation(path, operation)
        if (operation !== 'rebase' && operation !== 'cherry-pick') {
          throw new Error(`A ${operation} can't skip commits.`)
        }
        return git.skipCommit(path, operation)
      })
    },

    // --- Stashes and tags ---------------------------------------------------
    'repo:stash': (path, options) => {
      assertString(path, 'path')
      const message = typeof options?.message === 'string' ? options.message : undefined
      return runExclusive(path, () =>
        git.stashPush(path, {
          includeUntracked: options?.includeUntracked === true,
          ...(message ? { message } : {}),
        }),
      )
    },

    'repo:stashApply': (path, index, pop) => {
      assertString(path, 'path')
      assertIndex(index, 'index')
      return runExclusive(path, () =>
        pop ? git.stashPop(path, index) : git.stashApply(path, index),
      )
    },

    'repo:stashDrop': (path, index) => {
      assertString(path, 'path')
      assertIndex(index, 'index')
      return runExclusive(path, () => git.stashDrop(path, index))
    },

    'repo:createTag': (path, name, sha, message) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      assertSha(sha, 'sha')
      const text = typeof message === 'string' && message.trim() ? message : undefined
      return runExclusive(path, () => git.createTag(path, name, sha, text))
    },

    'repo:deleteTag': (path, name) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      return runExclusive(path, () => git.deleteTag(path, name))
    },

    // --- Remotes --------------------------------------------------------------
    'repo:fetch': (operationId, path, remote) => {
      assertRefArg(remote, 'remote')
      return remoteOperation(operationId, path, sendProgress, (o) => git.fetch(path, remote, o))
    },

    'repo:pull': (operationId, path, options) =>
      remoteOperation(operationId, path, sendProgress, (o) =>
        git.pull(path, { ...o, rebase: options?.rebase === true }),
      ),

    'repo:push': (operationId, path, request) => {
      assertPushRequest(request)
      return remoteOperation(operationId, path, sendProgress, (o) =>
        git.push(path, {
          ...o,
          remote: request.remote,
          branch: request.branch,
          setUpstream: request.setUpstream === true,
          force: request.force === true,
          ...(request.remoteBranch ? { remoteBranch: request.remoteBranch } : {}),
        }),
      )
    },

    'repo:deleteRemoteBranch': (operationId, path, remote, branch) => {
      assertRefArg(remote, 'remote')
      assertRefArg(branch, 'branch')
      return remoteOperation(operationId, path, sendProgress, (o) =>
        git.deleteRemoteBranch(path, remote, branch, o),
      )
    },

    'repo:pushTag': (operationId, path, remote, tag) => {
      assertRefArg(remote, 'remote')
      assertRefArg(tag, 'tag')
      return remoteOperation(operationId, path, sendProgress, (o) =>
        git.pushTag(path, remote, tag, o),
      )
    },

    // --- Command log and credentials -------------------------------------------
    'git:getCommandLog': () => commandLog.list(),

    'auth:respond': (id, answer) => {
      assertString(id, 'id')
      respond(id, typeof answer === 'string' ? answer : null)
    },
  } satisfies Handlers
}
