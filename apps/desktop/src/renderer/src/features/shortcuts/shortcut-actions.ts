/**
 * Every action that has a keyboard shortcut, with its default. Users can
 * change any of them in Settings; their choices are saved in
 * `settings.keybindings` (action id -> shortcut, or "" to turn it off).
 *
 * To add a shortcut: add an entry here, then handle its id in
 * hooks/use-keyboard-shortcuts.ts.
 *
 * Pure data and functions (no app state), so it can be unit tested.
 */

export interface ShortcutAction {
  id: string
  label: string
  /** Default shortcut, e.g. "Mod+O" (see shortcut-keys.ts), or "" for none. */
  defaultShortcut: string
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'palette', label: 'Command palette', defaultShortcut: 'Mod+K' },
  { id: 'palette.alt', label: 'Command palette (alternative)', defaultShortcut: 'Mod+Shift+P' },
  { id: 'repo.open', label: 'Open repository', defaultShortcut: 'Mod+O' },
  { id: 'repo.clone', label: 'Clone repository', defaultShortcut: 'Mod+Shift+O' },
  { id: 'repo.new', label: 'New repository', defaultShortcut: 'Mod+N' },
  { id: 'tab.close', label: 'Close tab', defaultShortcut: 'Mod+W' },
  { id: 'tab.next', label: 'Next tab', defaultShortcut: 'Ctrl+Tab' },
  { id: 'tab.previous', label: 'Previous tab', defaultShortcut: 'Ctrl+Shift+Tab' },
  { id: 'undo', label: 'Undo last operation', defaultShortcut: 'Mod+Z' },
  { id: 'redo', label: 'Redo', defaultShortcut: 'Mod+Shift+Z' },
  { id: 'history.search', label: 'Search commits', defaultShortcut: 'Mod+F' },
  { id: 'view.history', label: 'Show history', defaultShortcut: 'Mod+Shift+H' },
  { id: 'view.changes', label: 'Show changes', defaultShortcut: 'Mod+Shift+G' },
  { id: 'git.fetch', label: 'Fetch', defaultShortcut: '' },
  { id: 'git.pull', label: 'Pull', defaultShortcut: '' },
  { id: 'git.push', label: 'Push', defaultShortcut: '' },
  { id: 'git.stash', label: 'Stash changes', defaultShortcut: '' },
  { id: 'git.branch', label: 'Create branch', defaultShortcut: '' },
  { id: 'terminal', label: 'Open in terminal', defaultShortcut: 'Mod+Shift+T' },
  { id: 'editor', label: 'Open in editor', defaultShortcut: 'Mod+Shift+E' },
  { id: 'commandLog', label: 'Toggle git command log', defaultShortcut: 'Ctrl+`' },
  { id: 'settings', label: 'Settings', defaultShortcut: 'Mod+,' },
]

export const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** The shortcut currently assigned to an action (the user's choice, or the default). */
export function effectiveShortcut(id: string, keybindings: Record<string, string>): string {
  if (id in keybindings) return keybindings[id]!
  return SHORTCUT_ACTIONS.find((a) => a.id === id)?.defaultShortcut ?? ''
}

/** Actions that share a shortcut with another one, for warnings in Settings. */
export function findConflicts(keybindings: Record<string, string>): Map<string, string[]> {
  const byShortcut = new Map<string, string[]>()
  for (const action of SHORTCUT_ACTIONS) {
    const shortcut = effectiveShortcut(action.id, keybindings).toLowerCase()
    if (!shortcut) continue
    byShortcut.set(shortcut, [...(byShortcut.get(shortcut) ?? []), action.id])
  }
  const conflicts = new Map<string, string[]>()
  for (const ids of byShortcut.values()) {
    if (ids.length > 1)
      for (const id of ids)
        conflicts.set(
          id,
          ids.filter((other) => other !== id),
        )
  }
  return conflicts
}
