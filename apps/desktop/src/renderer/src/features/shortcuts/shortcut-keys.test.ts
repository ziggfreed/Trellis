import { describe, expect, it } from 'vitest'
import { formatShortcut, matchesShortcut, parseShortcut, shortcutFromEvent } from './shortcut-keys'

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
})

describe('shortcuts', () => {
  it('maps Mod to Ctrl or Cmd', () => {
    expect(parseShortcut('Mod+K', false)).toMatchObject({ ctrl: true, meta: false, key: 'k' })
    expect(parseShortcut('Mod+K', true)).toMatchObject({ ctrl: false, meta: true, key: 'k' })
    expect(parseShortcut('Mod++', false)).toMatchObject({ ctrl: true, key: '+' })
    expect(parseShortcut('Hyper+K', false)).toBeNull()
  })

  it('matches key events exactly', () => {
    expect(matchesShortcut(key('k', { ctrlKey: true }), 'Mod+K', false)).toBe(true)
    expect(matchesShortcut(key('K', { ctrlKey: true, shiftKey: true }), 'Mod+K', false)).toBe(false)
    expect(matchesShortcut(key('O', { metaKey: true, shiftKey: true }), 'Mod+Shift+O', true)).toBe(
      true,
    )
    expect(matchesShortcut(key('`', { ctrlKey: true }), 'Ctrl+`', true)).toBe(true)
  })

  it('records shortcuts from key events', () => {
    expect(shortcutFromEvent(key('p', { ctrlKey: true, shiftKey: true }), false)).toBe(
      'Mod+Shift+P',
    )
    expect(shortcutFromEvent(key('p', { metaKey: true }), true)).toBe('Mod+P')
    expect(shortcutFromEvent(key('Shift', { shiftKey: true }), false)).toBeNull()
    expect(shortcutFromEvent(key('F5'), false)).toBe('F5')
  })

  it('formats shortcuts for each platform', () => {
    expect(formatShortcut('Mod+Shift+O', false)).toBe('Ctrl+Shift+O')
    expect(formatShortcut('Mod+Shift+O', true)).toBe('⌘⇧O')
  })
})
