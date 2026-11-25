/**
 * The Settings dialog (Ctrl/Cmd+, or "Settings…" in the command palette),
 * in four tabs: General, Keyboard shortcuts, AI and Plugins.
 * Each control saves immediately; there's no OK button to forget.
 */
import { create } from 'zustand'
import type { Settings } from '@shared/ipc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select } from './fields'
import { useSettingsStore } from './settings-store'
import { ShortcutsEditor } from '@/features/shortcuts/shortcuts-editor'
import { PluginsPanel } from '@/features/plugins/plugins-panel'
import { AiSettingsPanel } from '@/features/ai/ai-settings-panel'
import { UpdateSettings } from '@/features/updates/updates'
import { cn } from '@/lib/utils'

type SettingsSection = 'general' | 'shortcuts' | 'ai' | 'plugins'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'ai', label: 'AI' },
  { id: 'plugins', label: 'Plugins' },
]

interface SettingsDialogStore {
  open: boolean
  section: SettingsSection
  setOpen: (open: boolean) => void
}
export const useSettingsDialog = create<SettingsDialogStore>((set) => ({
  open: false,
  section: 'general',
  setOpen: (open) => set({ open }),
}))
/** Open Settings, optionally on a particular tab. */
export const openSettings = (section: SettingsSection = 'general') =>
  useSettingsDialog.setState({ open: true, section })

const AUTO_FETCH_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
]

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open)
  const section = useSettingsDialog((s) => s.section)
  const setOpen = useSettingsDialog((s) => s.setOpen)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes are saved straight away.</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="Settings sections" className="flex gap-1 border-b">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              onClick={() => useSettingsDialog.setState({ section: s.id })}
              className={cn(
                '-mb-px border-b-2 px-3 py-1.5 text-sm',
                section === s.id
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {section === 'shortcuts' && <ShortcutsEditor />}
        {section === 'ai' && <AiSettingsPanel />}
        {section === 'plugins' && <PluginsPanel />}
        {section === 'general' && (
          <div className="space-y-4">
            <Field id="setting-theme" label="Theme">
              <Select
                id="setting-theme"
                value={settings.theme}
                onChange={(theme) => update({ theme: theme as Settings['theme'] })}
                options={[
                  { value: 'system', label: 'Same as system' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Field>
            <Field id="setting-diff" label="Diffs">
              <Select
                id="setting-diff"
                value={settings.diffLayout}
                onChange={(diffLayout) =>
                  update({ diffLayout: diffLayout as Settings['diffLayout'] })
                }
                options={[
                  { value: 'unified', label: 'Unified' },
                  { value: 'split', label: 'Side by side' },
                ]}
              />
            </Field>
            <Field
              id="setting-editor"
              label="Code editor"
              help="The command that starts your editor, e.g. code (VS Code), cursor, subl or idea."
            >
              <input
                id="setting-editor"
                value={settings.editorCommand}
                placeholder="code"
                onChange={(e) => update({ editorCommand: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </Field>
            <Field
              id="setting-autofetch"
              label="Fetch in the background"
              help="Keeps branches and push/pull counts up to date for open repositories. Never asks for passwords."
            >
              <Select
                id="setting-autofetch"
                value={String(settings.autoFetchMinutes)}
                onChange={(minutes) => update({ autoFetchMinutes: Number(minutes) })}
                options={AUTO_FETCH_CHOICES.map((c) => ({
                  value: String(c.value),
                  label: c.label,
                }))}
              />
            </Field>
            <Field id="setting-updates" label="Updates">
              <UpdateSettings />
            </Field>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
