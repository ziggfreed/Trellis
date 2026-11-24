/**
 * Simple promise-based dialogs, usable from anywhere (menus, the command
 * palette, toolbar buttons):
 *
 *   if (await confirmDialog({ title: 'Delete branch?', destructive: true })) ...
 *   const name = await textDialog({ title: 'New branch', label: 'Name' })
 *
 * One dialog is shown at a time. <Dialogs /> (mounted once in app.tsx)
 * renders whatever is in this store.
 */
import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** Red confirm button for actions that lose work. */
  destructive?: boolean
  /** Optional checkbox, e.g. "Also delete on the remote". Its value is returned. */
  checkbox?: { label: string; defaultChecked?: boolean }
}

export interface TextOptions {
  title: string
  description?: string
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  /** Allow multiple lines (a textarea instead of a single-line input). */
  multiline?: boolean
  /** Allow submitting an empty value. */
  optional?: boolean
  /** Return an error message to show, or null if the value is OK. */
  validate?: (value: string) => string | null
  checkbox?: { label: string; defaultChecked?: boolean }
}

type DialogKind =
  | {
      kind: 'confirm'
      options: ConfirmOptions
      resolve: (result: { checked: boolean } | null) => void
    }
  | {
      kind: 'text'
      options: TextOptions
      resolve: (result: { value: string; checked: boolean } | null) => void
    }

/** A dialog waiting to be shown; `id` is unique, so React can reset the form for each one. */
export type DialogRequest = DialogKind & { id: number }

let nextId = 1

interface DialogStore {
  current: DialogRequest | null
  queue: DialogRequest[]
  open: (request: DialogKind) => void
  close: () => void
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,
  queue: [],
  open: (kind) => {
    const request = { ...kind, id: nextId++ }
    if (get().current) set({ queue: [...get().queue, request] })
    else set({ current: request })
  },
  close: () => {
    const [next = null, ...rest] = get().queue
    set({ current: next, queue: rest })
  },
}))

/** Ask the user to confirm. Resolves to null if cancelled. */
export function confirmWithOptions(options: ConfirmOptions): Promise<{ checked: boolean } | null> {
  return new Promise((resolve) =>
    useDialogStore.getState().open({ kind: 'confirm', options, resolve }),
  )
}

/** Ask the user to confirm. Resolves to true if they did. */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return (await confirmWithOptions(options)) !== null
}

/** Ask for text (and an optional checkbox). Resolves to null if cancelled. */
export function textDialogWithOptions(
  options: TextOptions,
): Promise<{ value: string; checked: boolean } | null> {
  return new Promise((resolve) =>
    useDialogStore.getState().open({ kind: 'text', options, resolve }),
  )
}

/** Ask for text. Resolves to null if cancelled. */
export async function textDialog(options: TextOptions): Promise<string | null> {
  return (await textDialogWithOptions(options))?.value ?? null
}
