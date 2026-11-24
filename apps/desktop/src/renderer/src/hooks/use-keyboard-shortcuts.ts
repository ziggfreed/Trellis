/**
 * Global keyboard shortcuts. "Mod" means Ctrl on Windows/Linux and Cmd on macOS.
 *
 *   Mod+O            Open repository
 *   Mod+W            Close current tab
 *   Ctrl+Tab         Next tab        (Ctrl+Shift+Tab: previous)
 *   Mod+1 ... Mod+9  Jump to tab N
 *
 * These will move into the command palette / customisable keybindings system
 * in Phase 3. Until then, add new shortcuts here and list them above.
 */
import { useEffect } from 'react'
import { toast } from 'sonner'
import { pickAndOpenRepo, useRepos } from '@/features/repos/use-repos'

const isMac = navigator.userAgent.includes('Mac')

export function useKeyboardShortcuts() {
  const { openTabs, activeTab, activate, close, cycle } = useRepos()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = isMac ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()

      if (event.ctrlKey && key === 'tab') {
        cycle(event.shiftKey ? -1 : 1)
      } else if (mod && key === 'o') {
        void pickAndOpenRepo().then((r) => r.ok === false && toast.error(r.message))
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
