/**
 * The "Keyboard shortcuts" list in Settings. Click "Change", then press the
 * new key combination (Escape cancels, Backspace removes the shortcut).
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/features/settings/settings-store'
import { effectiveShortcut, findConflicts, isMac, SHORTCUT_ACTIONS } from './shortcut-actions'
import { formatShortcut, shortcutFromEvent } from './shortcut-keys'

export function ShortcutsEditor() {
  const keybindings = useSettingsStore((s) => s.settings.keybindings)
  const update = useSettingsStore((s) => s.update)
  const [recording, setRecording] = useState<string | null>(null)
  const conflicts = findConflicts(keybindings)
  const label = (id: string) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id

  const set = (id: string, shortcut: string) =>
    update({ keybindings: { ...keybindings, [id]: shortcut } })
  const reset = (id: string) => {
    const next = { ...keybindings }
    delete next[id]
    update({ keybindings: next })
  }

  return (
    <ul
      className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm"
      aria-label="Keyboard shortcuts"
    >
      {SHORTCUT_ACTIONS.map((action) => {
        const shortcut = effectiveShortcut(action.id, keybindings)
        const isRecording = recording === action.id
        const conflict = conflicts.get(action.id)
        return (
          <li key={action.id} className="flex items-center gap-2 px-2 py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{action.label}</span>
              {conflict && (
                <span className="block text-xs text-destructive">
                  Also used by: {conflict.map(label).join(', ')}
                </span>
              )}
            </span>
            {isRecording ? (
              <input
                autoFocus
                readOnly
                aria-label={`New shortcut for ${action.label}`}
                placeholder="Press keys…"
                onBlur={() => setRecording(null)}
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.key === 'Escape') return setRecording(null)
                  if (event.key === 'Backspace') {
                    set(action.id, '')
                    return setRecording(null)
                  }
                  const next = shortcutFromEvent(event.nativeEvent, isMac)
                  if (next) {
                    set(action.id, next)
                    setRecording(null)
                  }
                }}
                className="h-7 w-36 rounded-md border-2 border-ring px-2 text-xs"
              />
            ) : (
              <kbd className="min-w-16 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground">
                {shortcut ? formatShortcut(shortcut, isMac) : '—'}
              </kbd>
            )}
            <Button variant="ghost" size="xs" onClick={() => setRecording(action.id)}>
              Change
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!(action.id in keybindings)}
              onClick={() => reset(action.id)}
            >
              Reset
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
