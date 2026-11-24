/**
 * Tracks long-running remote operations (fetch, pull, push...) so the UI
 * can show what's happening and how far along it is.
 */
import { create } from 'zustand'
import { api } from '@/lib/api'

export interface RunningOperation {
  id: string
  repoPath: string
  /** e.g. "Pushing main to origin" */
  label: string
  phase?: string
  percent?: number
}

interface OperationsStore {
  running: RunningOperation[]
  start: (operation: RunningOperation) => void
  progress: (id: string, phase: string, percent: number) => void
  finish: (id: string) => void
}

export const useOperationsStore = create<OperationsStore>((set) => ({
  running: [],
  start: (operation) => set((s) => ({ running: [...s.running, operation] })),
  progress: (id, phase, percent) =>
    set((s) => ({
      running: s.running.map((op) => (op.id === id ? { ...op, phase, percent } : op)),
    })),
  finish: (id) => set((s) => ({ running: s.running.filter((op) => op.id !== id) })),
}))

/**
 * Run `task` as a tracked operation with a fresh id. Progress events from
 * the main process for that id update the store while it runs.
 */
export async function trackOperation<T>(
  repoPath: string,
  label: string,
  task: (operationId: string) => Promise<T>,
): Promise<T> {
  const id = crypto.randomUUID()
  const store = useOperationsStore.getState()
  store.start({ id, repoPath, label })
  const stop = api.on('operation:progress', (event) => {
    if (event.operationId === id)
      useOperationsStore.getState().progress(id, event.phase, event.percent)
  })
  try {
    return await task(id)
  } finally {
    stop()
    useOperationsStore.getState().finish(id)
  }
}
