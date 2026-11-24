/**
 * Workspace actions used by the home screen, tab bar menu and palette.
 */
import { toast } from 'sonner'
import type { Workspace } from '@shared/ipc'
import { api } from '@/lib/api'
import { confirmDialog, textDialog } from '@/features/dialogs/dialog-store'
import { useSettingsStore } from '@/features/settings/settings-store'
import { openRepoAtPath } from '@/features/repos/use-repos'
import { trackOperation } from '@/features/repo-actions/operations-store'
import { errorMessage } from '@/lib/errors'
import { queryClient, repoKeys } from '@/lib/query-client'
import * as logic from './workspace-logic'

const workspaces = () => useSettingsStore.getState().settings.workspaces
const save = (list: Workspace[]) => useSettingsStore.getState().update({ workspaces: list })

/** Save the open tabs as a new workspace. */
export async function saveTabsAsWorkspace() {
  const tabs = useSettingsStore.getState().settings.openTabs
  if (!tabs.length) {
    toast.info('Open some repositories first.')
    return
  }
  const name = await textDialog({
    title: 'Save tabs as workspace',
    description: `A workspace remembers a group of repositories so you can open them together. It will contain the ${tabs.length} open ${tabs.length === 1 ? 'repository' : 'repositories'}.`,
    label: 'Name',
    placeholder: 'Work',
    confirmLabel: 'Save workspace',
    validate: (value) => logic.validateWorkspaceName(workspaces(), value),
  })
  if (name) {
    save(logic.createWorkspace(workspaces(), name, tabs, crypto.randomUUID()))
    toast.success(`Saved workspace ${name.trim()}`)
  }
}

/** Open every repository in a workspace as a tab. */
export async function openWorkspace(workspace: Workspace) {
  const missing: string[] = []
  for (const repo of workspace.repos) {
    const result = await openRepoAtPath(repo.path)
    if (result.ok === false) missing.push(repo.name)
  }
  if (missing.length) toast.warning(`Couldn’t open: ${missing.join(', ')}`)
}

export async function renameWorkspace(workspace: Workspace) {
  const name = await textDialog({
    title: `Rename ${workspace.name}`,
    label: 'Name',
    initialValue: workspace.name,
    confirmLabel: 'Rename',
    validate: (value) => logic.validateWorkspaceName(workspaces(), value, workspace.id),
  })
  if (name) save(logic.renameWorkspace(workspaces(), workspace.id, name))
}

export async function deleteWorkspace(workspace: Workspace) {
  const ok = await confirmDialog({
    title: `Delete workspace ${workspace.name}?`,
    description: 'Only the workspace is deleted. The repositories and their files are not touched.',
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) save(logic.deleteWorkspace(workspaces(), workspace.id))
}

export function addOpenTabsToWorkspace(workspace: Workspace) {
  save(
    logic.addReposToWorkspace(
      workspaces(),
      workspace.id,
      useSettingsStore.getState().settings.openTabs,
    ),
  )
}

export function removeFromWorkspace(workspace: Workspace, path: string) {
  save(logic.removeRepoFromWorkspace(workspaces(), workspace.id, path))
}

/** Fetch a list of repositories one after another, reporting failures at the end. */
export async function fetchRepos(paths: string[]) {
  const failed: string[] = []
  for (const path of paths) {
    try {
      await trackOperation(path, `Fetching ${path.split(/[\\/]/).pop()}`, (id) =>
        api.invoke('repo:fetch', id, path, 'all'),
      )
    } catch (error) {
      failed.push(`${path.split(/[\\/]/).pop()}: ${errorMessage(error)}`)
    }
    void queryClient.invalidateQueries({ queryKey: repoKeys.all(path) })
  }
  if (failed.length) toast.error(`Some fetches failed:\n${failed.join('\n')}`, { duration: 10_000 })
  else
    toast.success(`Fetched ${paths.length} ${paths.length === 1 ? 'repository' : 'repositories'}`)
}
