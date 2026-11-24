/**
 * Keyboard shortcut strings like "Mod+Shift+O": parsing, matching key
 * events, and displaying them. Pure functions, so they're easy to test.
 *
 * "Mod" means Ctrl on Windows/Linux and Cmd on macOS. Other modifiers:
 * Ctrl, Alt, Shift, Meta (Cmd/Windows key). The key is the last part, e.g.
 * "K", "Enter", "Tab", ",", "`" or "F5".
 */

export interface ParsedShortcut {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** Lower-case key, e.g. "k", "enter", ",". */
  key: string
}

/** Turn "Mod+Shift+O" into its parts, for the given platform. */
export function parseShortcut(shortcut: string, isMac: boolean): ParsedShortcut | null {
  const parts = shortcut.split('+').map((p) => p.trim())
  // "Mod++" means Mod and the "+" key.
  if (shortcut.endsWith('++')) parts.splice(parts.length - 2, 2, '+')
  const key = parts.pop()?.toLowerCase()
  if (!key) return null
  const result: ParsedShortcut = { ctrl: false, alt: false, shift: false, meta: false, key }
  for (const part of parts.map((p) => p.toLowerCase())) {
    if (part === 'mod') {
      if (isMac) result.meta = true
      else result.ctrl = true
    } else if (part === 'ctrl' || part === 'control') result.ctrl = true
    else if (part === 'alt' || part === 'option') result.alt = true
    else if (part === 'shift') result.shift = true
    else if (part === 'meta' || part === 'cmd' || part === 'win') result.meta = true
    else return null
  }
  return result
}

/** Does this key event match the shortcut? */
export function matchesShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  shortcut: string,
  isMac: boolean,
): boolean {
  const parsed = parseShortcut(shortcut, isMac)
  if (!parsed) return false
  return (
    event.key.toLowerCase() === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.metaKey === parsed.meta
  )
}

/**
 * Build a shortcut string from a key event (for recording a new shortcut).
 * Returns null while only modifier keys are held down.
 */
export function shortcutFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  isMac: boolean,
): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null
  const parts: string[] = []
  // Store the platform's main modifier as "Mod" so shortcuts work on every OS.
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('Mod')
  if (isMac && event.ctrlKey) parts.push('Ctrl')
  if (!isMac && event.metaKey) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key === ' ' ? 'Space' : key)
  return parts.join('+')
}

/** Show a shortcut for this platform, e.g. "Mod+Shift+O" -> "Ctrl+Shift+O" or "⌘⇧O". */
export function formatShortcut(shortcut: string, isMac: boolean): string {
  if (!isMac) return shortcut.replace(/\bMod\b/, 'Ctrl')
  const symbols: Record<string, string> = { Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
  return shortcut
    .split('+')
    .map((part) => symbols[part] ?? part)
    .join('')
}
