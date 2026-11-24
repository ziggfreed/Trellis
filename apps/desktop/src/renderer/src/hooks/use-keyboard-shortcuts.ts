/**
 * Global keyboard shortcuts. "Mod" means Ctrl on Windows/Linux and Cmd on macOS.
 *
 *   Mod+O            Open repository
 *   Mod+Shift+O      Clone repository
 *   Mod+N            New repository
 *   Mod+W            Close current tab
 *   Ctrl+Tab         Next tab        (Ctrl+Shift+Tab: previous)
 *   Mod+1 ... Mod+9  Jump to tab N
 *   Mod+K, Mod+Shift+P  Command palette
 *   Ctrl+`           Toggle the git command log
 *   Mod+Z            Undo the last operation  (Mod+Shift+Z or Ctrl+Y: redo)
 *                    (not while typing in a text box, where it undoes text)
 *
 * Every action is also in the command palette. Customisable keybindings are
 * planned for Phase 4; until then, add new shortcuts here and list them above.
 */
import { useEffect } from 'react'
import { useRepos } from '@/features/repos/use-repos'
import { repoActions } from '@/features/repos/repo-actions'
import { redo, undo } from '@/features/repo-actions/actions'
import { openCommandPalette } from '@/features/command-palette/command-palette'
import { toggleCommandLog } from '@/features/command-log/command-log-store'

const isMac = navigator.userAgent.includes('Mac')

/** Name of the modifier key for showing shortcuts in menus. */
export const modKey = isMac ? '⌘' : 'Ctrl'

export function useKeyboardShortcuts() {
  const { openTabs, activeTab, activate, close, cycle } = useRepos()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = isMac ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()

      const typing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))

      if (mod && key === 'z' && !typing && activeTab) {
        if (event.shiftKey) void redo(activeTab)
        else void undo(activeTab)
      } else if (event.ctrlKey && key === 'y' && !typing && activeTab) {
        void redo(activeTab)
      } else if ((mod && key === 'k') || (mod && event.shiftKey && key === 'p')) {
        openCommandPalette()
      } else if (event.ctrlKey && event.key === '`') {
        toggleCommandLog()
      } else if (event.ctrlKey && key === 'tab') {
        cycle(event.shiftKey ? -1 : 1)
      } else if (mod && key === 'o') {
        if (event.shiftKey) repoActions.clone()
        else repoActions.open()
      } else if (mod && key === 'n') {
        repoActions.create()
      } else if (mod && key === 'w' && activeTab) {
        close(activeTab)
      } else if (mod && /^[1-9]$/.test(key)) {
        const tab = openTabs[Number(key) - 1]
        if (tab) activate(tab.path)
      } else {
        return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openTabs, activeTab, activate, close, cycle])
}
