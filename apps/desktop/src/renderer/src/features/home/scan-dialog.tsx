/**
 * Home > "Scan folder…": pick a folder, find every git repository inside it
 * (see main/services/scan-repos.ts), then choose which to keep and add them
 * to a new or existing workspace.
 *
 * Found repositories go into a workspace rather than Recent because Recent
 * only keeps the last few repositories you opened.
 */
import { useState } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { ScanResult } from '@shared/ipc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { useSettingsStore } from '@/features/settings/settings-store'
import * as workspaceLogic from '@/features/workspaces/workspace-logic'

interface ScanRequest {
  folder: string
  result: ScanResult
}

const useScanStore = create<{ request: ScanRequest | null }>(() => ({ request: null }))
const close = () => useScanStore.setState({ request: null })

/** Ask for a folder, scan it, and show what was found. */
export async function scanFolder() {
  const folder = await api.invoke('dialog:pickFolder', { title: 'Choose a folder to scan' })
  if (!folder) return
  const scanning = toast.loading('Looking for repositories…')
  try {
    const result = await api.invoke('repo:scanFolder', folder)
    toast.dismiss(scanning)
    if (result.repos.length === 0) toast.info(`No git repositories found in ${folder}.`)
    else useScanStore.setState({ request: { folder, result } })
  } catch (error) {
    toast.error(errorMessage(error), { id: scanning })
  }
}

export function ScanDialog() {
  const request = useScanStore((s) => s.request)
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      {request && <ScanForm key={request.folder} request={request} />}
    </Dialog>
  )
}

/** Value of the "Add to" choice that means "make a new workspace". */
const NEW_WORKSPACE = ''

function ScanForm({ request }: { request: ScanRequest }) {
  const { repos, truncated } = request.result
  const workspaces = useSettingsStore((s) => s.settings.workspaces)
  const [selected, setSelected] = useState(() => new Set(repos.map((r) => r.path)))
  const [target, setTarget] = useState(NEW_WORKSPACE)
  // Suggest the scanned folder's name for the new workspace.
  const [name, setName] = useState(request.folder.split(/[\\/]/).filter(Boolean).pop() ?? '')

  const nameError =
    target === NEW_WORKSPACE ? workspaceLogic.validateWorkspaceName(workspaces, name) : null
  const chosen = repos.filter((r) => selected.has(r.path))

  const toggle = (path: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (nameError || chosen.length === 0) return
    const { update } = useSettingsStore.getState()
    if (target === NEW_WORKSPACE) {
      update({
        workspaces: workspaceLogic.createWorkspace(workspaces, name, chosen, crypto.randomUUID()),
      })
      toast.success(`Created workspace ${name.trim()}`)
    } else {
      update({ workspaces: workspaceLogic.addReposToWorkspace(workspaces, target, chosen) })
      toast.success(`Added ${chosen.length} to ${workspaces.find((w) => w.id === target)?.name}`)
    }
    close()
  }

  return (
    <DialogContent className="sm:max-w-lg">
      {/* min-w-0: let long paths truncate instead of widening the dialog. */}
      <form onSubmit={submit} className="min-w-0 space-y-4">
        <DialogHeader>
          <DialogTitle>
            Found {repos.length} {repos.length === 1 ? 'repository' : 'repositories'}
          </DialogTitle>
          <DialogDescription className="break-all">
            In {request.folder}
            {truncated && ' (the scan stopped early; there may be more)'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{chosen.length} selected</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => setSelected(new Set(repos.map((r) => r.path)))}
          >
            Select all
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
            Select none
          </Button>
        </div>
        <ul
          className="max-h-64 divide-y overflow-y-auto rounded-md border"
          aria-label="Found repositories"
        >
          {repos.map((repo) => (
            <li key={repo.path}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={selected.has(repo.path)}
                  onChange={() => toggle(repo.path)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{repo.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{repo.path}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label htmlFor="scan-target">Add to</Label>
          <select
            id="scan-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value={NEW_WORKSPACE}>A new workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                Workspace “{w.name}”
              </option>
            ))}
          </select>
        </div>
        {target === NEW_WORKSPACE && (
          <div className="space-y-2">
            <Label htmlFor="scan-name">Workspace name</Label>
            <Input
              id="scan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError !== null}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={nameError !== null || chosen.length === 0}>
            Add {chosen.length} {chosen.length === 1 ? 'repository' : 'repositories'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
