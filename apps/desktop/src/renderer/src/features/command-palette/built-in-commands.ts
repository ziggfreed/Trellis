/**
 * Trellis's own commands for the command palette. Most call the same
 * functions as the menus and toolbar (features/repo-actions/actions.ts).
 */
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { localBranches, remoteBranchShortName } from '@/features/sidebar/group-refs'
import { repoActions } from '@/features/repos/repo-actions'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import { useSettingsStore } from '@/features/settings/settings-store'
import { toggleCommandLog } from '@/features/command-log/command-log-store'
import { openSettings } from '@/features/settings/settings-dialog'
import { openWorkspace, saveTabsAsWorkspace } from '@/features/workspaces/workspace-actions'
import { groupChanges } from '@/features/changes/group-changes'
import { stageEntries, unstageEntries } from '@/features/changes/change-actions'
import { modKey } from '@/hooks/use-keyboard-shortcuts'
import * as actions from '@/features/repo-actions/actions'
import { openRepoTab } from '@/features/repos/use-repos'
import { splitCommitMessage } from '@/features/changes/commit-message'
import type { Command, CommandContext } from './registry'

/** Focus an element after the palette has closed and the view has updated. */
function focusLater(selector: string) {
  setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 50)
}

export function builtInCommands(context: CommandContext): Command[] {
  const commands: Command[] = [
    {
      id: 'repo.open',
      title: 'Open repository…',
      group: 'Repository',
      shortcut: `${modKey}+O`,
      run: repoActions.open,
    },
    {
      id: 'repo.clone',
      title: 'Clone repository…',
      group: 'Repository',
      shortcut: `${modKey}+Shift+O`,
      run: repoActions.clone,
    },
    {
      id: 'repo.new',
      title: 'New repository…',
      group: 'Repository',
      shortcut: `${modKey}+N`,
      run: repoActions.create,
    },
    {
      id: 'app.settings',
      title: 'Settings…',
      group: 'View',
      shortcut: `${modKey}+,`,
      keywords: ['preferences', 'options'],
      run: openSettings,
    },
    {
      id: 'repo.saveWorkspace',
      title: 'Save open tabs as workspace…',
      group: 'Repository',
      run: () => void saveTabsAsWorkspace(),
    },
    ...context.workspaces.map((workspace) => ({
      id: `repo.openWorkspace.${workspace.id}`,
      title: `Open workspace: ${workspace.name}`,
      group: 'Repository',
      run: () => void openWorkspace(workspace),
    })),
    {
      id: 'view.commandLog',
      title: 'Toggle git command log',
      group: 'View',
      shortcut: 'Ctrl+`',
      keywords: ['terminal', 'output', 'history'],
      run: toggleCommandLog,
    },
    ...(['light', 'dark', 'system'] as const).map((theme) => ({
      id: `view.theme.${theme}`,
      title: `Theme: ${theme[0]!.toUpperCase()}${theme.slice(1)}`,
      group: 'View',
      keywords: ['appearance', 'colour', 'color'],
      run: () => useSettingsStore.getState().update({ theme }),
    })),
  ]

  if (context.openTabs.length > 1) {
    commands.push({
      id: 'repo.switch',
      title: 'Switch to repository…',
      group: 'Repository',
      keywords: ['tab'],
      run: () => ({
        placeholder: 'Choose a repository',
        items: context.openTabs.map((tab) => ({
          id: tab.path,
          label: tab.name,
          detail: tab.path,
          run: () => openRepoTab(tab),
        })),
      }),
    })
  }

  const repo = context.repo
  if (!repo) return commands
  const path = repo.path
  const setView = (patch: Parameters<ReturnType<typeof useRepoViewStore.getState>['update']>[1]) =>
    useRepoViewStore.getState().update(path, patch)
  const changes = groupChanges(context.status?.files ?? [])
  const operation = context.status?.operation

  commands.push(
    {
      id: 'view.history',
      title: 'Show history',
      group: 'View',
      run: () => setView({ view: 'history' }),
    },
    {
      id: 'view.changes',
      title: 'Show changes',
      group: 'View',
      run: () => setView({ view: 'changes' }),
    },
    {
      id: 'view.search',
      title: 'Search commits',
      group: 'View',
      shortcut: `${modKey}+F`,
      run: () => {
        setView({ view: 'history' })
        focusLater('[aria-label="Search commits"]')
      },
    },
    {
      id: 'git.fetch',
      title: 'Fetch',
      group: 'Git',
      keywords: ['download', 'update'],
      run: () => void actions.fetchAll(path),
    },
    { id: 'git.pull', title: 'Pull', group: 'Git', run: () => void actions.pull(path) },
    {
      id: 'git.pullRebase',
      title: 'Pull with rebase',
      group: 'Git',
      run: () => void actions.pull(path, true),
    },
    {
      id: 'git.push',
      title: 'Push',
      group: 'Git',
      keywords: ['upload'],
      run: () => void actions.push(path),
    },
    {
      id: 'git.forcePush',
      title: 'Force push (with lease)…',
      group: 'Git',
      run: () => void actions.push(path, { force: true }),
    },
    {
      id: 'git.commit',
      title: 'Commit…',
      group: 'Git',
      run: () => {
        setView({ view: 'changes' })
        focusLater('[aria-label="Commit summary"]')
      },
    },
    {
      id: 'git.amend',
      title: 'Amend last commit…',
      group: 'Git',
      run: () => {
        setView({ view: 'changes', amend: true })
        // Start from the last commit's message, as ticking "Amend" does.
        void api.invoke('repo:getHeadMessage', path).then((message) => {
          if (message) {
            const { summary, description } = splitCommitMessage(message)
            setView({ commitSummary: summary, commitDescription: description })
          }
        })
        focusLater('[aria-label="Commit summary"]')
      },
    },
    {
      id: 'git.stageAll',
      title: 'Stage all changes',
      group: 'Git',
      run: () => void stageEntries(path, changes.unstaged),
    },
    {
      id: 'git.unstageAll',
      title: 'Unstage all changes',
      group: 'Git',
      run: () => void unstageEntries(path, changes.staged),
    },
    { id: 'git.stash', title: 'Stash changes…', group: 'Git', run: () => void actions.stash(path) },
    {
      id: 'git.stashPop',
      title: 'Pop latest stash',
      group: 'Git',
      run: () => void runAction(path, () => api.invoke('repo:stashApply', path, 0, true)),
    },
    {
      id: 'git.branch',
      title: 'Create branch…',
      group: 'Branches',
      run: () => void actions.createBranch(path),
    },
    {
      id: 'git.checkout',
      title: 'Check out branch…',
      group: 'Branches',
      keywords: ['switch'],
      run: () => ({
        placeholder: 'Choose a branch to check out',
        items: [
          ...localBranches(context.refs)
            .filter((b) => !b.isHead)
            .map((b) => ({
              id: b.fullName,
              label: b.name,
              run: () => void actions.checkoutBranch(path, b.name),
            })),
          ...context.refs
            .filter((r) => r.type === 'remote-branch')
            .map((r) => ({
              id: r.fullName,
              label: r.name,
              detail: `as ${remoteBranchShortName(r)}`,
              run: () => void actions.checkoutRemoteBranch(path, r),
            })),
        ],
      }),
    },
    {
      id: 'git.merge',
      title: 'Merge branch into current…',
      group: 'Branches',
      run: () => ({
        placeholder: 'Choose a branch to merge into the current branch',
        items: context.refs
          .filter((r) => r.type !== 'tag' && !r.isHead)
          .map((r) => ({
            id: r.fullName,
            label: r.name,
            run: () => void actions.mergeIntoCurrent(path, r.name),
          })),
      }),
    },
  )

  commands.push({
    id: 'git.compare',
    title: 'Compare current branch with…',
    group: 'Branches',
    keywords: ['diff', 'pull request'],
    run: () => ({
      placeholder: 'Choose a branch to compare with',
      items: context.refs
        .filter((r) => r.type !== 'tag' && !r.isHead)
        .map((r) => ({
          id: r.fullName,
          label: r.name,
          run: () => void actions.openCompare(path, r.name),
        })),
    }),
  })

  if (operation) {
    commands.push(
      {
        id: 'git.continue',
        title: `Continue ${operation}`,
        group: 'Git',
        run: () => void actions.continueOperation(path),
      },
      {
        id: 'git.abort',
        title: `Abort ${operation}…`,
        group: 'Git',
        run: () => void actions.abortOperation(path),
      },
    )
  }
  return commands
}
