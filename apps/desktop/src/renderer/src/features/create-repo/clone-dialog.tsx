/**
 * Dialog for cloning a repository: enter a URL, choose where to put it, and
 * watch the progress. When finished, the new repository opens in a tab.
 *
 * The dialog can't be closed while cloning except via Cancel, which stops git.
 */
import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/features/settings/settings-store'
import { openRepoTab } from '@/features/repos/use-repos'
import { joinPath, repoNameFromUrl, validateFolderName } from './clone-paths'
import { useCreateRepoStore } from './create-repo-store'

type CloneState =
  | { status: 'idle' }
  | { status: 'cloning'; operationId: string; phase: string; percent: number }
  | { status: 'error'; message: string }

export function CloneDialog() {
  const open = useCreateRepoStore((s) => s.cloneOpen)
  const setOpen = useCreateRepoStore((s) => s.setCloneOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Mounting the form only while open resets it each time. */}
      {open && <CloneForm onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function CloneForm({ onDone }: { onDone: () => void }) {
  const lastFolder = useSettingsStore((s) => s.settings.lastCloneFolder)
  const updateSettings = useSettingsStore((s) => s.update)

  const [url, setUrl] = useState('')
  const [folder, setFolder] = useState(lastFolder ?? '')
  // The name follows the URL until the user types their own.
  const [customName, setCustomName] = useState<string | null>(null)
  const [state, setState] = useState<CloneState>({ status: 'idle' })

  const name = customName ?? repoNameFromUrl(url)
  const nameError = name ? validateFolderName(name) : null
  const cloning = state.status === 'cloning'
  const canClone = url.trim() !== '' && folder !== '' && name !== '' && !nameError && !cloning

  // Show progress events for our clone.
  const operationId = cloning ? state.operationId : null
  useEffect(() => {
    if (!operationId) return
    return api.on('operation:progress', (event) => {
      if (event.operationId !== operationId) return
      setState({ status: 'cloning', operationId, phase: event.phase, percent: event.percent })
    })
  }, [operationId])

  const browse = async () => {
    const picked = await api.invoke('dialog:pickFolder', { title: 'Clone into folder' })
    if (picked) setFolder(picked)
  }

  const clone = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canClone) return
    const id = crypto.randomUUID()
    setState({ status: 'cloning', operationId: id, phase: 'Starting', percent: 0 })
    updateSettings({ lastCloneFolder: folder })
    const result = await api.invoke('repo:clone', id, url.trim(), joinPath(folder, name))
    if (result.ok) {
      openRepoTab(result.repo)
      onDone()
    } else {
      setState({ status: 'error', message: result.message })
    }
  }

  const cancel = () => {
    if (state.status === 'cloning') void api.invoke('operation:cancel', state.operationId)
    else onDone()
  }

  return (
    <DialogContent
      onInteractOutside={(e) => cloning && e.preventDefault()}
      onEscapeKeyDown={(e) => cloning && e.preventDefault()}
      showCloseButton={!cloning}
    >
      <form onSubmit={(e) => void clone(e)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>Clone repository</DialogTitle>
          <DialogDescription>Download a copy of a repository from a URL.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="clone-url">Repository URL</Label>
          <Input
            id="clone-url"
            autoFocus
            placeholder="https://github.com/user/repo.git"
            value={url}
            disabled={cloning}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clone-folder">Clone into</Label>
          <div className="flex gap-2">
            <Input
              id="clone-folder"
              placeholder="Choose a folder…"
              value={folder}
              disabled={cloning}
              onChange={(e) => setFolder(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={cloning}
              onClick={() => void browse()}
            >
              <FolderOpen />
              Browse
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clone-name">Folder name</Label>
          <Input
            id="clone-name"
            value={name}
            disabled={cloning}
            aria-invalid={nameError !== null}
            onChange={(e) => setCustomName(e.target.value)}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          {folder && name && !nameError && (
            <p className="truncate text-xs text-muted-foreground">{joinPath(folder, name)}</p>
          )}
        </div>

        {state.status === 'cloning' && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={state.percent} />
            <p className="text-xs text-muted-foreground">
              {state.phase}… {state.percent}%
            </p>
          </div>
        )}
        {state.status === 'error' && (
          <p className="text-sm break-words text-destructive" role="alert">
            {state.message}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canClone}>
            {cloning ? 'Cloning…' : 'Clone'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
