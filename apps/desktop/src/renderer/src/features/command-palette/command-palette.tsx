/**
 * The command palette (Ctrl/Cmd+K or Ctrl/Cmd+Shift+P): search and run any
 * command. Some commands open a second list to pick from (e.g. "Check out
 * branch…" lists branches); Backspace in an empty search goes back.
 */
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { useRefs, useStatus } from '@/features/repos/use-repo-data'
import { useRepos } from '@/features/repos/use-repos'
import { useSettingsStore } from '@/features/settings/settings-store'
import { getCommands, registerCommands, type CommandPicker } from './registry'
import { builtInCommands } from './built-in-commands'

registerCommands(builtInCommands)

interface PaletteStore {
  open: boolean
  setOpen: (open: boolean) => void
}
export const usePaletteStore = create<PaletteStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
export const openCommandPalette = () => usePaletteStore.getState().setOpen(true)

export function CommandPalette() {
  const open = usePaletteStore((s) => s.open)
  const setOpen = usePaletteStore((s) => s.setOpen)
  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search for a command to run"
    >
      {/* Mount the contents only while open, so each opening starts fresh. */}
      {open && <PaletteContents close={() => setOpen(false)} />}
    </CommandDialog>
  )
}

function PaletteContents({ close }: { close: () => void }) {
  const { activeRepo, openTabs } = useRepos()
  const repoPath = activeRepo?.path ?? ''
  const status = useStatus(repoPath).data
  const refs = useRefs(repoPath).data
  const workspaces = useSettingsStore((s) => s.settings.workspaces)
  const [picker, setPicker] = useState<CommandPicker | null>(null)
  const [search, setSearch] = useState('')

  const commands = useMemo(
    () =>
      getCommands({
        repo: activeRepo,
        status: activeRepo ? (status ?? null) : null,
        refs: activeRepo ? (refs ?? []) : [],
        openTabs,
        workspaces,
      }),
    [activeRepo, status, refs, openTabs, workspaces],
  )
  const groups = useMemo(() => {
    const map = new Map<string, typeof commands>()
    for (const command of commands)
      map.set(command.group, [...(map.get(command.group) ?? []), command])
    return [...map.entries()]
  }, [commands])

  /** Switch between the command list (null) and a picker, starting with an empty search. */
  const showPicker = (next: CommandPicker | null) => {
    setPicker(next)
    setSearch('')
  }

  const run = (action: () => void | CommandPicker) => {
    const result = action()
    if (result) showPicker(result)
    else close()
  }

  return (
    <>
      <CommandInput
        placeholder={picker?.placeholder ?? 'Type a command…'}
        value={search}
        onValueChange={setSearch}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && search === '' && picker) showPicker(null)
        }}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {picker ? (
          <CommandGroup>
            {picker.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.detail ?? ''}`}
                onSelect={() => run(item.run)}
              >
                {item.label}
                {item.detail && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">{item.detail}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  value={command.title}
                  keywords={command.keywords}
                  onSelect={() => run(command.run)}
                >
                  {command.title}
                  {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </>
  )
}
