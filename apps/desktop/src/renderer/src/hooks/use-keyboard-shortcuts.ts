/**
 * Global keyboard shortcuts. "Mod" means Ctrl on Windows/Linux and Cmd on macOS.
 *
 *   Mod+O            Open repository
 *   Mod+Shift+O      Clone repository
 *   Mod+N            New repository
 *   Mod+W            Close current tab
 *   Ctrl+Tab         Next tab        (Ctrl+Shift+Tab: previous)
 *   Mod+1 ... Mod+9  Jump to tab N
 *
 * These will move into the command palette / customisable keybindings system
 * in Phase 3. Until then, add new shortcuts here and list them above.
 */
import { useEffect } from 'react'
import { useRepos } from '@/features/repos/use-repos'
import { repoActions } from '@/features/repos/repo-actions'

const isMac = navigator.userAgent.includes('Mac')

/** Name of the modifier key for showing shortcuts in menus. */
export const modKey = isMac ? '⌘' : 'Ctrl'

export function useKeyboardShortcuts() {
  const { openTabs, activeTab, activate, close, cycle } = useRepos()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = isMac ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()

      if (event.ctrlKey && key === 'tab') {
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
