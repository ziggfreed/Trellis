/**
 * App updates in the UI (the work happens in main/services/updater.ts):
 * - useUpdateSync(): mount once; keeps the status current and announces a
 *   downloaded update with a toast
 * - UpdateStatusItem: the status bar button ("Restart to update")
 * - UpdateSettings: the "Updates" row in Settings > General
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { toast } from 'sonner'
import { ArrowDownToLine, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '@shared/ipc'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/features/settings/settings-store'

const useUpdateStore = create<{ status: UpdateStatus }>(() => ({ status: { state: 'idle' } }))

const restart = () => void api.invoke('update:install')

export function useUpdateSync() {
  useEffect(() => {
    void api.invoke('update:getStatus').then((status) => useUpdateStore.setState({ status }))
    return api.on('update:status', (status) => {
      useUpdateStore.setState({ status })
      if (status.state === 'ready') {
        toast.success(`Trellis ${status.version} is ready to install`, {
          duration: Infinity,
          action: { label: 'Restart now', onClick: restart },
        })
      }
    })
  }, [])
}

/** Plain-language description of the status, for Settings. */
export function describeStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return ''
    case 'checking':
      return 'Checking for updates…'
    case 'upToDate':
      return 'Trellis is up to date.'
    case 'available':
      return `Trellis ${status.version} is available.`
    case 'downloading':
      return `Downloading Trellis ${status.version}… ${status.percent}%`
    case 'ready':
      return `Trellis ${status.version} is ready. Restart to install it.`
    case 'unsupported':
    case 'error':
      return status.message
  }
}

/** Status bar item, shown only when there's something to act on. */
export function UpdateStatusItem() {
  const status = useUpdateStore((s) => s.status)
  if (status.state === 'ready') {
    return (
      <button
        type="button"
        onClick={restart}
        className="flex items-center gap-1 text-brand hover:underline"
        title={`Restart Trellis to install version ${status.version}`}
      >
        <ArrowDownToLine className="size-3.5" />
        Restart to update
      </button>
    )
  }
  if (status.state === 'available') {
    return (
      <a
        href={status.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-brand hover:underline"
      >
        <ArrowDownToLine className="size-3.5" />
        Trellis {status.version} available
      </a>
    )
  }
  return null
}

export function UpdateSettings() {
  const status = useUpdateStore((s) => s.status)
  const enabled = useSettingsStore((s) => s.settings.checkForUpdates)
  const update = useSettingsStore((s) => s.update)
  const busy = status.state === 'checking' || status.state === 'downloading'
  const info = useQuery({ queryKey: ['app-info'], queryFn: () => api.invoke('app:getInfo') })
  return (
    <div className="space-y-2">
      {info.data && (
        <p className="text-sm text-muted-foreground">You have Trellis {info.data.version}.</p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          id="setting-updates"
          type="checkbox"
          checked={enabled}
          onChange={(e) => update({ checkForUpdates: e.target.checked })}
        />
        Check for updates automatically
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {status.state === 'ready' ? (
          <Button size="sm" onClick={restart}>
            Restart to update
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void api.invoke('update:check')}
          >
            <RefreshCw className={busy ? 'animate-spin' : ''} />
            Check now
          </Button>
        )}
        {status.state === 'available' && (
          <a href={status.url} target="_blank" rel="noreferrer" className="text-sm underline">
            Download
          </a>
        )}
        <span role="status" className="text-xs text-muted-foreground">
          {describeStatus(status)}
        </span>
      </div>
    </div>
  )
}
