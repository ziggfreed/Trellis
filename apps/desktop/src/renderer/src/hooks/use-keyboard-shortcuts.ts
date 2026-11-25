/**
 * Global keyboard shortcuts.
 *
 * The list of actions and their default shortcuts is in
 * features/shortcuts/shortcut-actions.ts; users can change them in
 * Settings. This hook listens for key presses and runs the matching action.
 *
 * Mod+1 ... Mod+9 (jump to tab N) are fixed and not listed there.
 * Undo/redo don't fire while typing in a text box, where they undo text.
 */
import { useEffect } from 'react'
import { useRepos } from '@/features/repos/use-repos'
import { repoActions } from '@/features/repos/repo-actions'
import * as actions from '@/features/repo-actions/actions'
import { openCommandPalette } from '@/features/command-palette/command-palette'
import { toggleCommandLog } from '@/features/command-log/command-log-store'
import { openSettings } from '@/features/settings/settings-dialog'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import { effectiveShortcut, isMac, SHORTCUT_ACTIONS } from '@/features/shortcuts/shortcut-actions'
import { matchesShortcut } from '@/features/shortcuts/shortcut-keys'
import { openInEditor, openInTerminal } from '@/features/repo-actions/open-external'

/** Name of the modifier key for showing shortcuts in menus. */
export const modKey = isMac ? '⌘' : 'Ctrl'

/** Actions that shouldn't run while the user is typing in a text field. */
const NOT_WHILE_TYPING = new Set(['undo', 'redo', 'history.search'])

/** Focus an element after the view has updated. */
function focusSoon(selector: string) {
  setTimeout(() => {
    const element = document.querySelector<HTMLInputElement>(selector)
    element?.focus()
    element?.select?.()
  }, 50)
}

export function useKeyboardShortcuts() {
  const { openTabs, activeTab, activate, close, cycle } = useRepos()
  const keybindings = useSettingsStore((s) => s.settings.keybindings)

  useEffect(() => {
    const repo = activeTab
    const setView = (
      patch: Parameters<ReturnType<typeof useRepoViewStore.getState>['update']>[1],
    ) => repo && useRepoViewStore.getState().update(repo, patch)

    /** What each action does. Repository actions do nothing on the home screen. */
    const handlers: Record<string, () => void> = {
      palette: openCommandPalette,
      'palette.alt': openCommandPalette,
      'repo.open': repoActions.open,
      'repo.clone': repoActions.clone,
      'repo.new': repoActions.create,
      'tab.close': () => repo && close(repo),
      'tab.next': () => cycle(1),
      'tab.previous': () => cycle(-1),
      undo: () => repo && void actions.undo(repo),
      redo: () => repo && void actions.redo(repo),
      'history.search': () => {
        setView({ view: 'history' })
        focusSoon('[aria-label="Search commits"]')
      },
      'view.history': () => setView({ view: 'history' }),
      'view.changes': () => setView({ view: 'changes' }),
      'git.fetch': () => repo && void actions.fetchAll(repo),
      'git.pull': () => repo && void actions.pull(repo),
      'git.push': () => repo && void actions.push(repo),
      'git.stash': () => repo && void actions.stash(repo),
      'git.branch': () => repo && void actions.createBranch(repo),
      terminal: () => repo && void openInTerminal(repo),
      editor: () => repo && void openInEditor(repo),
      commandLog: toggleCommandLog,
      settings: () => openSettings(),
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

      // Fixed: Mod+1..9 jumps to that tab.
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (mod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        const tab = openTabs[Number(event.key) - 1]
        if (tab) activate(tab.path)
        event.preventDefault()
        return
      }

      for (const action of SHORTCUT_ACTIONS) {
        const shortcut = effectiveShortcut(action.id, keybindings)
        if (!shortcut || !matchesShortcut(event, shortcut, isMac)) continue
        if (typing && NOT_WHILE_TYPING.has(action.id)) return
        event.preventDefault()
        handlers[action.id]?.()
        return
      }
      // Ctrl+Y also redoes on Windows and Linux, like most apps.
      if (!isMac && !typing && event.ctrlKey && event.key.toLowerCase() === 'y' && repo) {
        event.preventDefault()
        void actions.redo(repo)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openTabs, activeTab, activate, close, cycle, keybindings])
}
