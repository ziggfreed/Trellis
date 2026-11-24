/** Whether the clone dialog is open. A store so any button or shortcut can open it. */
import { create } from 'zustand'

interface CreateRepoStore {
  cloneOpen: boolean
  setCloneOpen: (open: boolean) => void
}

export const useCreateRepoStore = create<CreateRepoStore>((set) => ({
  cloneOpen: false,
  setCloneOpen: (cloneOpen) => set({ cloneOpen }),
}))

export const openCloneDialog = () => useCreateRepoStore.getState().setCloneOpen(true)
