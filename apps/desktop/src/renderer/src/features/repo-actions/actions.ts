/**
 * Every user action that changes a repository, in one place.
 *
 * Menus, toolbar buttons and the command palette all call these functions,
 * so each action behaves the same wherever it's started: it asks for any
 * input it needs (dialogs), confirms anything destructive, shows progress
 * for remote operations, and reports errors (see runAction).
 *
 * Each function takes the repository path first and returns nothing useful;
 * results appear in the UI as the repository's data refreshes.
 */
import { toast } from 'sonner'
import type { Ref, Stash, Worktree } from '@shared/ipc'
import { api } from '@/lib/api'
import { queryClient, repoKeys } from '@/lib/query-client'
import { runAction } from '@/lib/run-action'
import { errorMessage } from '@/lib/errors'
import { shortSha } from '@/lib/format'
import {
  confirmDialog,
  confirmWithOptions,
  textDialog,
  textDialogWithOptions,
} from '@/features/dialogs/dialog-store'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import { remoteBranchShortName } from '@/features/sidebar/group-refs'
import { planPush } from './push-plan'
import { trackOperation } from './operations-store'
import { validateRefName } from './ref-names'
import { joinPath } from '@/features/create-repo/clone-paths'
import { openRepoTab } from '@/features/repos/use-repos'

const getStatus = (repo: string) =>
  queryClient.fetchQuery({
    queryKey: repoKeys.status(repo),
    queryFn: () => api.invoke('repo:getStatus', repo),
  })
const getRemotes = (repo: string) =>
  queryClient.fetchQuery({
    queryKey: repoKeys.remotes(repo),
    queryFn: () => api.invoke('repo:getRemotes', repo),
  })

// ---------------------------------------------------------------------------
// Remotes
// ---------------------------------------------------------------------------

export function fetchAll(repo: string) {
  return runAction(repo, () =>
    trackOperation(repo, 'Fetching', (id) => api.invoke('repo:fetch', id, repo, 'all')),
  )
}

/** Fetch from one remote. */
export function fetchRemote(repo: string, remote: string) {
  return runAction(repo, () =>
    trackOperation(repo, `Fetching ${remote}`, (id) => api.invoke('repo:fetch', id, repo, remote)),
  )
}

export async function pull(repo: string, rebase = false) {
  const status = await getStatus(repo)
  if (!status.branch.upstream) {
    toast.error('This branch has no upstream branch to pull from. Push it first to create one.')
    return
  }
  await runAction(repo, () =>
    trackOperation(repo, `Pulling from ${status.branch.upstream}`, (id) =>
      api.invoke('repo:pull', id, repo, { rebase }),
    ),
  )
}

export async function push(repo: string, options: { force?: boolean } = {}) {
  const [status, remotes] = await Promise.all([getStatus(repo), getRemotes(repo)])
  const plan = planPush(status.branch, remotes)
  if (!plan.ok) {
    toast.error(plan.reason)
    return
  }
  const { request } = plan
  const target = `${request.remote}/${request.remoteBranch ?? request.branch}`
  if (options.force) {
    const ok = await confirmDialog({
      title: `Force push ${request.branch} to ${target}?`,
      description:
        'This replaces the remote branch with yours. It only goes ahead if nobody else has pushed since your last fetch (“force with lease”), but commits you don’t have locally may still be lost.',
      confirmLabel: 'Force push',
      destructive: true,
    })
    if (!ok) return
  }
  await runAction(
    repo,
    () =>
      trackOperation(repo, `Pushing ${request.branch} to ${target}`, (id) =>
        api.invoke('repo:push', id, repo, { ...request, force: options.force === true }),
      ),
    { success: `Pushed to ${target}` },
  )
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Ask for a name and create a branch at `startPoint` (default: HEAD). */
export async function createBranch(repo: string, startPoint?: { ref: string; label: string }) {
  const result = await textDialogWithOptions({
    title: 'Create branch',
    description: startPoint
      ? `The branch will start at ${startPoint.label}.`
      : 'The branch will start at your current commit.',
    label: 'Branch name',
    placeholder: 'feature/my-change',
    confirmLabel: 'Create branch',
    validate: validateRefName,
    checkbox: { label: 'Switch to the new branch', defaultChecked: true },
  })
  if (!result) return
  await runAction(
    repo,
    () =>
      api.invoke('repo:createBranch', repo, result.value, {
        checkout: result.checked,
        ...(startPoint ? { startPoint: startPoint.ref } : {}),
      }),
    { success: `Created ${result.value}` },
  )
}

export function checkoutBranch(repo: string, name: string) {
  return runAction(repo, () => api.invoke('repo:checkout', repo, { kind: 'branch', name }), {
    success: `Switched to ${name}`,
  })
}

/** Check out a remote branch as a local branch with the same name (created if needed). */
export function checkoutRemoteBranch(repo: string, ref: Ref) {
  const localName = remoteBranchShortName(ref)
  return runAction(
    repo,
    () => api.invoke('repo:checkout', repo, { kind: 'remote-branch', name: ref.name, localName }),
    { success: `Switched to ${localName}` },
  )
}

export async function checkoutCommit(repo: string, sha: string) {
  const ok = await confirmDialog({
    title: `Check out ${shortSha(sha)}?`,
    description:
      'You’ll be on this commit directly, not on a branch (“detached HEAD”). New commits here won’t belong to any branch unless you create one.',
    confirmLabel: 'Check out',
  })
  if (ok) await runAction(repo, () => api.invoke('repo:checkout', repo, { kind: 'commit', sha }))
}

export async function renameBranch(repo: string, name: string) {
  const newName = await textDialog({
    title: `Rename ${name}`,
    label: 'New name',
    initialValue: name,
    confirmLabel: 'Rename',
    validate: (value) => (value === name ? 'Enter a different name.' : validateRefName(value)),
  })
  if (newName) await runAction(repo, () => api.invoke('repo:renameBranch', repo, name, newName))
}

export async function deleteBranch(repo: string, branch: Ref) {
  if (branch.isHead) {
    toast.error('You can’t delete the branch you’re on. Switch to another branch first.')
    return
  }
  const remote = branch.upstream && !branch.upstreamGone ? branch.upstream : null
  const answer = await confirmWithOptions({
    title: `Delete branch ${branch.name}?`,
    description: 'Git refuses if the branch has commits that aren’t merged anywhere else.',
    confirmLabel: 'Delete',
    destructive: true,
    ...(remote ? { checkbox: { label: `Also delete ${remote} on the remote` } } : {}),
  })
  if (!answer) return

  try {
    await api.invoke('repo:deleteBranch', repo, branch.name, false)
  } catch (error) {
    if (!errorMessage(error).includes('not fully merged')) {
      toast.error(errorMessage(error))
      return
    }
    // The branch has commits that would be lost. Offer to delete it anyway.
    const force = await confirmDialog({
      title: `${branch.name} has unmerged commits`,
      description: 'Its commits aren’t on any other branch. Deleting it anyway may lose them.',
      confirmLabel: 'Delete anyway',
      destructive: true,
    })
    if (!force) return
    const done = await runAction(repo, () =>
      api.invoke('repo:deleteBranch', repo, branch.name, true).then(() => true),
    )
    if (!done) return
  }
  await queryClient.invalidateQueries({ queryKey: repoKeys.all(repo) })
  toast.success(`Deleted ${branch.name}`)
  if (answer.checked && remote) {
    const slash = remote.indexOf('/')
    await deleteRemoteBranchByName(repo, remote.slice(0, slash), remote.slice(slash + 1))
  }
}

export async function deleteRemoteBranch(repo: string, ref: Ref) {
  if (!ref.remote) return
  const ok = await confirmDialog({
    title: `Delete ${ref.name} on the remote?`,
    description: 'The branch is removed from the server for everyone.',
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) await deleteRemoteBranchByName(repo, ref.remote, remoteBranchShortName(ref))
}

function deleteRemoteBranchByName(repo: string, remote: string, branch: string) {
  return runAction(
    repo,
    () =>
      trackOperation(repo, `Deleting ${remote}/${branch}`, (id) =>
        api.invoke('repo:deleteRemoteBranch', id, repo, remote, branch),
      ),
    { success: `Deleted ${remote}/${branch}` },
  )
}

export async function mergeIntoCurrent(repo: string, ref: string) {
  const status = await getStatus(repo)
  const current = status.branch.head ?? 'the current commit'
  const answer = await confirmWithOptions({
    title: `Merge ${ref} into ${current}?`,
    confirmLabel: 'Merge',
    checkbox: { label: 'Always create a merge commit (--no-ff)' },
  })
  if (!answer) return
  const result = await runAction(repo, () =>
    api.invoke('repo:merge', repo, ref, { noFastForward: answer.checked }),
  )
  if (result?.status === 'done') toast.success(`Merged ${ref} into ${current}`)
}

export async function rebaseOnto(repo: string, ref: string) {
  const status = await getStatus(repo)
  const ok = await confirmDialog({
    title: `Rebase ${status.branch.head ?? 'HEAD'} onto ${ref}?`,
    description:
      'Your commits are replayed on top of it, rewriting them. Don’t rebase commits others already have.',
    confirmLabel: 'Rebase',
  })
  if (!ok) return
  const result = await runAction(repo, () => api.invoke('repo:rebase', repo, ref))
  if (result?.status === 'done') toast.success(`Rebased onto ${ref}`)
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

export async function cherryPick(repo: string, sha: string) {
  const result = await runAction(repo, () => api.invoke('repo:cherryPick', repo, sha))
  if (result?.status === 'done') toast.success(`Cherry-picked ${shortSha(sha)}`)
}

export async function revertCommit(repo: string, sha: string) {
  const ok = await confirmDialog({
    title: `Revert ${shortSha(sha)}?`,
    description: 'A new commit is made that undoes its changes.',
    confirmLabel: 'Revert',
  })
  if (!ok) return
  const result = await runAction(repo, () => api.invoke('repo:revert', repo, sha))
  if (result?.status === 'done') toast.success(`Reverted ${shortSha(sha)}`)
}

const RESET_DESCRIPTIONS = {
  soft: 'Later commits are undone, but their changes stay staged.',
  mixed: 'Later commits are undone, and their changes stay in your files, unstaged.',
  hard: 'Later commits AND all uncommitted changes are thrown away. This can’t be undone.',
} as const

export async function resetTo(repo: string, sha: string, mode: 'soft' | 'mixed' | 'hard') {
  const status = await getStatus(repo)
  const ok = await confirmDialog({
    title: `Reset ${status.branch.head ?? 'HEAD'} to ${shortSha(sha)} (${mode})?`,
    description: RESET_DESCRIPTIONS[mode],
    confirmLabel: 'Reset',
    destructive: mode === 'hard',
  })
  if (ok) await runAction(repo, () => api.invoke('repo:reset', repo, sha, mode))
}

export async function copyToClipboard(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.success(`Copied ${what}`)
}

// ---------------------------------------------------------------------------
// Merge / rebase / cherry-pick in progress
// ---------------------------------------------------------------------------

export async function abortOperation(repo: string) {
  const ok = await confirmDialog({
    title: 'Abort?',
    description:
      'Everything goes back to how it was before it started. Conflict resolutions you’ve made are lost.',
    confirmLabel: 'Abort',
    destructive: true,
  })
  if (ok) await runAction(repo, () => api.invoke('repo:operation', repo, 'abort'))
}

export function continueOperation(repo: string) {
  return runAction(repo, () => api.invoke('repo:operation', repo, 'continue'))
}

export function skipCommit(repo: string) {
  return runAction(repo, () => api.invoke('repo:operation', repo, 'skip'))
}

// ---------------------------------------------------------------------------
// Stashes
// ---------------------------------------------------------------------------

export async function stash(repo: string) {
  const result = await textDialogWithOptions({
    title: 'Stash changes',
    description:
      'Put your uncommitted changes aside, leaving a clean working tree. You can apply them again later.',
    label: 'Message (optional)',
    optional: true,
    confirmLabel: 'Stash',
    checkbox: { label: 'Include untracked files', defaultChecked: true },
  })
  if (!result) return
  const created = await runAction(repo, () =>
    api.invoke('repo:stash', repo, {
      message: result.value.trim(),
      includeUntracked: result.checked,
    }),
  )
  if (created === false) toast.info('There were no changes to stash.')
  else if (created) toast.success('Changes stashed')
}

export async function applyStash(repo: string, entry: Stash, pop: boolean) {
  const result = await runAction(repo, () => api.invoke('repo:stashApply', repo, entry.index, pop))
  if (result?.status === 'done') toast.success(pop ? 'Stash applied and removed' : 'Stash applied')
}

export async function dropStash(repo: string, entry: Stash) {
  const ok = await confirmDialog({
    title: `Delete ${entry.name}?`,
    description: `“${entry.message}” will be deleted. This can’t be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) await runAction(repo, () => api.invoke('repo:stashDrop', repo, entry.index))
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function createTag(repo: string, sha: string) {
  const name = await textDialog({
    title: `Create tag at ${shortSha(sha)}`,
    label: 'Tag name',
    placeholder: 'v1.0.0',
    confirmLabel: 'Next',
    validate: validateRefName,
  })
  if (!name) return
  const message = await textDialog({
    title: `Create tag ${name}`,
    description:
      'Add a message to make an annotated tag (recommended for releases), or leave it empty for a lightweight tag.',
    label: 'Message (optional)',
    optional: true,
    multiline: true,
    confirmLabel: 'Create tag',
  })
  if (message === null) return
  await runAction(repo, () => api.invoke('repo:createTag', repo, name, sha, message), {
    success: `Created tag ${name}`,
  })
}

export async function deleteTag(repo: string, name: string) {
  const ok = await confirmDialog({
    title: `Delete tag ${name}?`,
    description: 'Only the local tag is deleted.',
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) await runAction(repo, () => api.invoke('repo:deleteTag', repo, name))
}

export async function pushTag(repo: string, name: string) {
  const remotes = await getRemotes(repo)
  const remote = remotes.find((r) => r.name === 'origin') ?? remotes[0]
  if (!remote) {
    toast.error('This repository has no remotes to push to.')
    return
  }
  await runAction(
    repo,
    () =>
      trackOperation(repo, `Pushing tag ${name}`, (id) =>
        api.invoke('repo:pushTag', id, repo, remote.name, name),
      ),
    { success: `Pushed ${name} to ${remote.name}` },
  )
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

/**
 * Create a worktree: ask for a branch (new or existing) and a folder (by
 * default next to the repository, e.g. "myrepo-feature-x"), then open it.
 */
export async function addWorktree(repo: string) {
  const branch = await textDialogWithOptions({
    title: 'New worktree',
    description:
      'A worktree is a second working folder for this repository, with its own checked-out branch.',
    label: 'Branch',
    placeholder: 'feature/my-change',
    validate: validateRefName,
    confirmLabel: 'Next',
    checkbox: {
      label: 'Create a new branch (untick to use an existing one)',
      defaultChecked: true,
    },
  })
  if (!branch) return
  const parent = repo.replace(/[\\/][^\\/]+[\\/]?$/, '')
  const repoName = repo.split(/[\\/]/).filter(Boolean).pop() ?? 'repo'
  const folder = await textDialog({
    title: 'New worktree',
    label: 'Folder',
    initialValue: joinPath(parent, `${repoName}-${branch.value.replaceAll('/', '-')}`),
    confirmLabel: 'Create worktree',
  })
  if (!folder) return
  const result = await runAction(repo, () =>
    api.invoke(
      'repo:addWorktree',
      repo,
      folder,
      branch.checked ? { newBranch: branch.value } : { branch: branch.value },
    ),
  )
  if (result?.ok) openRepoTab(result.repo)
}

export async function removeWorktree(repo: string, worktree: Worktree) {
  const answer = await confirmWithOptions({
    title: `Remove the worktree at ${worktree.path}?`,
    description: 'Its folder is deleted. Its branch and commits stay in the repository.',
    confirmLabel: 'Remove',
    destructive: true,
    checkbox: { label: 'Remove even if it has uncommitted changes (they will be lost)' },
  })
  if (!answer) return
  await runAction(
    repo,
    () => api.invoke('repo:removeWorktree', repo, worktree.path, answer.checked),
    {
      success: 'Worktree removed',
    },
  )
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

/** Undo the last operation made in Trellis, offering Redo in the toast. */
export async function undo(repo: string) {
  const label = await runAction(repo, () => api.invoke('repo:undo', repo))
  if (label === null) toast.info('Nothing to undo.')
  else if (label)
    toast.success(`Undone: ${label}`, { action: { label: 'Redo', onClick: () => void redo(repo) } })
}

export async function redo(repo: string) {
  const label = await runAction(repo, () => api.invoke('repo:redo', repo))
  if (label === null) toast.info('Nothing to redo.')
  else if (label) toast.success(`Redone: ${label}`)
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Open a file's blame or history in the File view. */
export function openFileView(repo: string, path: string, mode: 'blame' | 'history') {
  useRepoViewStore
    .getState()
    .update(repo, { view: 'file', file: { path, mode, revisions: [] }, selectedFile: null })
}

/**
 * Compare `head` with `base` in the Compare view: the commits `head` has
 * that `base` doesn't. Without a base, compares with the current branch.
 *
 * If `head` is already in `base`'s history (e.g. an older commit on the
 * current branch), that comparison would always be empty, so the two are
 * swapped to show what changed since `head` instead.
 */
export async function openCompare(repo: string, head: string, base?: string) {
  let from = base ?? (await getStatus(repo)).branch.head ?? 'HEAD'
  let to = head
  const [fromSha, toSha] = await Promise.all([
    api.invoke('repo:resolveCommit', repo, from),
    api.invoke('repo:resolveCommit', repo, to),
  ])
  if (
    fromSha &&
    toSha &&
    fromSha !== toSha &&
    (await api.invoke('repo:isAncestor', repo, to, from))
  ) {
    ;[from, to] = [to, from]
  }
  useRepoViewStore
    .getState()
    .update(repo, { view: 'compare', compare: { base: from, head: to }, selectedFile: null })
}

/** Switch the repository view to Changes (e.g. after a merge stops with conflicts). */
export function showChanges(repo: string) {
  useRepoViewStore.getState().update(repo, { view: 'changes', selectedFile: null })
}
