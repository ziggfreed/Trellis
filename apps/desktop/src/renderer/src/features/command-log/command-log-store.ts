/**
 * The git command log, kept in the UI: loaded once from the main process,
 * then extended with each 'git:command' event. Also whether the panel is open.
 */
import { create } from 'zustand'
import type { GitCommandEntry } from '@shared/ipc'
import { api } from '@/lib/api'

const MAX_ENTRIES = 500

interface CommandLogStore {
  entries: GitCommandEntry[]
  open: boolean
  showReadOnly: boolean
  setOpen: (open: boolean) => void
  setShowReadOnly: (show: boolean) => void
  /** Start loading and listening. Returns a function that stops listening. */
  connect: () => () => void
}

export const useCommandLogStore = create<CommandLogStore>((set, get) => ({
  entries: [],
  open: false,
  showReadOnly: false,
  setOpen: (open) => set({ open }),
  setShowReadOnly: (showReadOnly) => set({ showReadOnly }),
  connect: () => {
    void api.invoke('git:getCommandLog').then((initial) => {
      // Keep any entries that arrived while the initial list was loading.
      const known = new Set(initial.map((e) => e.id))
      set({
        entries: [...initial, ...get().entries.filter((e) => !known.has(e.id))].slice(-MAX_ENTRIES),
      })
    })
    return api.on('git:command', (entry) =>
      set({ entries: [...get().entries, entry].slice(-MAX_ENTRIES) }),
    )
  },
}))

export const toggleCommandLog = () => {
  const { open, setOpen } = useCommandLogStore.getState()
  setOpen(!open)
}
