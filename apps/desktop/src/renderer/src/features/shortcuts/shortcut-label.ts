/** Showing an action's current shortcut in menus and the command palette. */
import { useSettingsStore } from '@/features/settings/settings-store'
import { effectiveShortcut, isMac } from './shortcut-actions'
import { formatShortcut } from './shortcut-keys'

/** The shortcut for an action, formatted for display (e.g. in menus), or undefined. */
export function shortcutLabel(id: string): string | undefined {
  const shortcut = effectiveShortcut(id, useSettingsStore.getState().settings.keybindings)
  return shortcut ? formatShortcut(shortcut, isMac) : undefined
}
