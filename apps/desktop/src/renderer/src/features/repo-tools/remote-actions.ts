/**
 * Managing remotes from the sidebar: add, rename, change URL, remove.
 * Each asks with the standard dialogs, then runs the git command in main.
 */
import type { Remote } from '@shared/ipc'
import { remoteNameProblem } from '@trellis/git/remote-names'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { confirmDialog, textDialog } from '@/features/dialogs/dialog-store'

const urlProblem = (url: string) =>
  url.trim() ? (url.trim().startsWith('-') ? 'That isn’t a valid URL.' : null) : 'Enter the URL.'

/** Ask for a name and URL, then add the remote. */
export async function addRemote(repo: string, existing: Remote[]) {
  const taken = new Set(existing.map((r) => r.name))
  const name = await textDialog({
    title: 'Add remote',
    description: 'A remote is another copy of this repository, usually on a server such as GitHub.',
    label: 'Name',
    initialValue: taken.has('origin') ? (taken.has('upstream') ? '' : 'upstream') : 'origin',
    confirmLabel: 'Next',
    validate: (value) =>
      taken.has(value.trim())
        ? 'There’s already a remote with that name.'
        : remoteNameProblem(value),
  })
  if (!name) return
  const url = await textDialog({
    title: `Add remote “${name.trim()}”`,
    label: 'URL',
    placeholder: 'https://github.com/owner/repository.git',
    confirmLabel: 'Add remote',
    validate: urlProblem,
  })
  if (!url) return
  await runAction(repo, () => api.invoke('repo:addRemote', repo, name.trim(), url.trim()), {
    success: `Added remote ${name.trim()}. Fetch to see its branches.`,
  })
}

export async function editRemoteUrl(repo: string, remote: Remote) {
  const url = await textDialog({
    title: `Change URL of ${remote.name}`,
    label: 'URL',
    initialValue: remote.fetchUrl,
    confirmLabel: 'Save',
    validate: (value) =>
      value.trim() === remote.fetchUrl ? 'Enter a different URL.' : urlProblem(value),
  })
  if (url) {
    await runAction(repo, () => api.invoke('repo:setRemoteUrl', repo, remote.name, url.trim()))
  }
}

export async function renameRemote(repo: string, remote: Remote, existing: Remote[]) {
  const taken = new Set(existing.map((r) => r.name))
  const name = await textDialog({
    title: `Rename ${remote.name}`,
    description: 'Its remote branches and the branches that track them are renamed too.',
    label: 'New name',
    initialValue: remote.name,
    confirmLabel: 'Rename',
    validate: (value) =>
      value.trim() === remote.name
        ? 'Enter a different name.'
        : taken.has(value.trim())
          ? 'There’s already a remote with that name.'
          : remoteNameProblem(value),
  })
  if (name) {
    await runAction(repo, () => api.invoke('repo:renameRemote', repo, remote.name, name.trim()))
  }
}

export async function removeRemote(repo: string, remote: Remote) {
  const ok = await confirmDialog({
    title: `Remove remote ${remote.name}?`,
    description:
      'Trellis forgets this remote and its remote branches. Nothing is deleted on the server, and you can add it again later.',
    confirmLabel: 'Remove',
    destructive: true,
  })
  if (ok) await runAction(repo, () => api.invoke('repo:removeRemote', repo, remote.name))
}
