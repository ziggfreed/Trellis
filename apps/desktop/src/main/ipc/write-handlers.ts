/**
 * IPC handlers for operations that CHANGE a repository (staging, commits,
 * branches, stashes, tags, fetch/pull/push...).
 *
 * Every write runs through `runExclusive`, so two writes to the same
 * repository never overlap (see services/repo-queue.ts). Most are also
 * recorded in the operation log so they can be undone (`recorded`, see
 * packages/git/src/oplog.ts). Not recorded: stashes (they keep their own
 * history), and fetch/push (they change remotes, which undo can't reach). Long remote
 * operations report progress as 'operation:progress' events and can be
 * cancelled with 'operation:cancel'.
 *
 * Arguments come from the UI, so each handler validates them first.
 */
import { basename } from 'node:path'
import * as git from '@trellis/git'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { runExclusive } from '../services/repo-queue'
import { endOperation, startOperation } from '../services/operations'
import { respond } from '../services/auth-prompts'
import type { CommandLog } from '../services/command-log'
import {
  assertCheckoutTarget,
  assertFileInRepo,
  assertAbsolutePath,
  assertIndex,
  assertOneOf,
  assertPushRequest,
  assertRebaseBase,
  assertRebasePlan,
  assertRefArg,
  assertSha,
  assertString,
  assertStringArray,
} from './validate'

type Handlers = {
  [C in IpcChannel]?: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/**
 * Run a write operation through the queue AND record it for undo.
 * `worktree`: whether the operation can change files (then they are snapshotted too).
 */
function recorded<T>(
  path: string,
  label: string,
  worktree: boolean,
  task: () => Promise<T>,
): Promise<T> {
  return runExclusive(path, () => git.recordOperation(path, label, { worktree }, task))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
      return recorded(path, `Stage ${plural(files.length, 'file')}`, false, () =>
        git.stageFiles(path, files),
      )
    },

    'repo:unstage': (path, files) => {
      assertString(path, 'path')
      assertStringArray(files, 'files')
      return recorded(path, `Unstage ${plural(files.length, 'file')}`, false, () =>
        git.unstageFiles(path, files),
      )
    },

    'repo:discard': (path, files) => {
      assertString(path, 'path')
      if (!Array.isArray(files)) throw new TypeError('files must be an array')
      for (const file of files) assertString(file?.path, 'file.path')
      return recorded(path, `Discard changes to ${plural(files.length, 'file')}`, true, () =>
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
      const labels = { stage: 'Stage lines', unstage: 'Unstage lines', discard: 'Discard lines' }
      return recorded(path, labels[action], action === 'discard', () =>
        git.applyPatch(path, patch, action),
      )
    },

    'repo:commit': (path, message, options) => {
      assertString(path, 'path')
      if (typeof message !== 'string') throw new TypeError('message must be a string')
      const amend = options?.amend === true
      const summary = message.trim().split('\n')[0] ?? ''
      return recorded(path, `${amend ? 'Amend' : 'Commit'} “${summary}”`, false, () =>
        git.commit(path, message, { amend }),
      )
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
      return recorded(path, `Create branch ${name}`, options?.checkout === true, () =>
        git.createBranch(path, name, {
          checkout: options?.checkout === true,
          ...(options?.startPoint ? { startPoint: options.startPoint } : {}),
        }),
      )
    },

    'repo:checkout': (path, target) => {
      assertString(path, 'path')
      assertCheckoutTarget(target)
      const label =
        target.kind === 'commit'
          ? `Check out ${target.sha.slice(0, 7)}`
          : `Check out ${target.kind === 'branch' ? target.name : target.localName}`
      return recorded(path, label, true, () => {
        if (target.kind === 'branch') return git.checkoutBranch(path, target.name)
        if (target.kind === 'remote-branch')
          return git.checkoutRemoteBranch(path, target.name, target.localName)
        return git.checkoutCommit(path, target.sha)
      })
    },

    'repo:moveBranch': (path, name, target) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      assertRefArg(target, 'target')
      return recorded(path, `Move ${name}`, false, () => git.moveBranch(path, name, target))
    },

    'repo:renameBranch': (path, from, to) => {
      assertString(path, 'path')
      assertRefArg(from, 'from')
      assertRefArg(to, 'to')
      return recorded(path, `Rename ${from} to ${to}`, false, () =>
        git.renameBranch(path, from, to),
      )
    },

    'repo:deleteBranch': (path, name, force) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      return recorded(path, `Delete branch ${name}`, false, () =>
        git.deleteBranch(path, name, force === true),
      )
    },

    'repo:merge': (path, ref, options) => {
      assertString(path, 'path')
      assertRefArg(ref, 'ref')
      return recorded(path, `Merge ${ref}`, true, () =>
        git.merge(path, ref, { noFastForward: options?.noFastForward === true }),
      )
    },

    'repo:rebase': (path, onto) => {
      assertString(path, 'path')
      assertRefArg(onto, 'onto')
      return recorded(path, `Rebase onto ${onto}`, true, () => git.rebase(path, onto))
    },

    'repo:cherryPick': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return recorded(path, `Cherry-pick ${sha.slice(0, 7)}`, true, () => git.cherryPick(path, sha))
    },

    'repo:revert': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return recorded(path, `Revert ${sha.slice(0, 7)}`, true, () => git.revert(path, sha))
    },

    'repo:reset': (path, sha, mode) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      assertOneOf(mode, ['soft', 'mixed', 'hard'] as const, 'mode')
      return recorded(path, `Reset (${mode}) to ${sha.slice(0, 7)}`, mode === 'hard', () =>
        git.reset(path, sha, mode),
      )
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
      return recorded(path, `Create tag ${name}`, false, () => git.createTag(path, name, sha, text))
    },

    'repo:deleteTag': (path, name) => {
      assertString(path, 'path')
      assertRefArg(name, 'name')
      return recorded(path, `Delete tag ${name}`, false, () => git.deleteTag(path, name))
    },

    // --- Remotes --------------------------------------------------------------
    'repo:fetch': (operationId, path, remote) => {
      assertRefArg(remote, 'remote')
      return remoteOperation(operationId, path, sendProgress, (o) => git.fetch(path, remote, o))
    },

    'repo:pull': (operationId, path, options) =>
      remoteOperation(operationId, path, sendProgress, (o) =>
        // Recorded so a pull can be undone (the queue lock is already held here).
        git.recordOperation(path, 'Pull', { worktree: true }, () =>
          git.pull(path, { ...o, rebase: options?.rebase === true }),
        ),
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

    // --- File history, blame and compare (read-only) ---------------------------
    'repo:getFileHistory': (path, file) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      return git.getFileHistory(path, file)
    },

    'repo:getBlame': (path, file, revision) => {
      assertString(path, 'path')
      assertString(file, 'file') // may be an old path from history, so not checked against the disk
      if (file.startsWith('-')) throw new TypeError('file must not start with "-"')
      if (revision !== undefined) assertSha(revision, 'revision')
      return git.getBlame(path, file, revision)
    },

    'repo:getComparison': (path, base, head) => {
      assertString(path, 'path')
      assertRefArg(base, 'base')
      assertRefArg(head, 'head')
      return git.getComparison(path, base, head)
    },
    'repo:isAncestor': (path, ancestor, commit) => {
      assertString(path, 'path')
      assertRefArg(ancestor, 'ancestor')
      assertRefArg(commit, 'commit')
      return git.isAncestor(path, ancestor, commit)
    },
    'repo:resolveCommit': (path, ref) => {
      assertString(path, 'path')
      assertRefArg(ref, 'ref')
      return git.resolveCommit(path, ref)
    },

    // --- Worktrees --------------------------------------------------------------
    'repo:getWorktrees': (path) => {
      assertString(path, 'path')
      return git.getWorktrees(path)
    },

    'repo:addWorktree': async (path, folder, options) => {
      assertString(path, 'path')
      assertAbsolutePath(folder, 'folder')
      if (options?.branch !== undefined) assertRefArg(options.branch, 'branch')
      if (options?.newBranch !== undefined) assertRefArg(options.newBranch, 'newBranch')
      await runExclusive(path, () =>
        git.addWorktree(path, folder, {
          ...(options?.branch ? { branch: options.branch } : {}),
          ...(options?.newBranch ? { newBranch: options.newBranch } : {}),
        }),
      )
      const root = await git.getRepoRoot(folder)
      return root
        ? { ok: true, repo: { path: root, name: basename(root) } }
        : { ok: false, reason: 'not-a-repo', path: folder }
    },

    'repo:removeWorktree': (path, folder, force) => {
      assertString(path, 'path')
      assertAbsolutePath(folder, 'folder')
      return runExclusive(path, () => git.removeWorktree(path, folder, force === true))
    },

    'repo:pruneWorktrees': (path) => {
      assertString(path, 'path')
      return runExclusive(path, () => git.pruneWorktrees(path))
    },

    // --- Conflicts --------------------------------------------------------------
    'repo:readWorkingFile': (path, file) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      return git.readWorkingFile(path, file)
    },

    'repo:saveResolvedFile': (path, file, content) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      if (typeof content !== 'string') throw new TypeError('content must be a string')
      return recorded(path, `Resolve ${file}`, true, () =>
        git.saveResolvedFile(path, file, content),
      )
    },

    'repo:resolveFileWith': (path, file, choice) => {
      assertString(path, 'path')
      assertFileInRepo(path, file)
      assertOneOf(choice, ['current', 'incoming', 'delete'] as const, 'choice')
      return recorded(path, `Resolve ${file}`, true, () => git.resolveFileWith(path, file, choice))
    },

    // --- Interactive rebase --------------------------------------------------
    'repo:getRebaseCommits': (path, base) => {
      assertString(path, 'path')
      assertRebaseBase(base)
      return git.getRebaseCommits(path, base)
    },

    'repo:interactiveRebase': (path, base, plan) => {
      assertString(path, 'path')
      assertRebaseBase(base)
      assertRebasePlan(plan)
      return recorded(path, 'Interactive rebase', true, () =>
        git.interactiveRebase(path, base, plan),
      )
    },

    // --- Undo / redo ------------------------------------------------------------
    'repo:getUndoState': (path) => {
      assertString(path, 'path')
      return git.getUndoState(path)
    },

    'repo:undo': (path) => {
      assertString(path, 'path')
      return runExclusive(path, () => git.undo(path))
    },

    'repo:redo': (path) => {
      assertString(path, 'path')
      return runExclusive(path, () => git.redo(path))
    },

    // --- Command log and credentials -------------------------------------------
    'git:getCommandLog': () => commandLog.list(),

    'auth:respond': (id, answer) => {
      assertString(id, 'id')
      respond(id, typeof answer === 'string' ? answer : null)
    },
  } satisfies Handlers
}
