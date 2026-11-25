/**
 * Keeps the UI's view of plugins current and carries out what plugins ask
 * the UI to do (messages, input boxes, pick lists, commit messages).
 *
 * Mount once, near the top of the app.
 */
import { useEffect } from 'react'
import { toast } from 'sonner'
import type { PluginUiRequest } from '@shared/ipc'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { textDialog } from '@/features/dialogs/dialog-store'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import { splitCommitMessage } from '@/features/changes/commit-message'
import { pluginKeys, usePluginStore } from './plugin-store'
import { quickPick } from './quick-pick-dialog'

/** Do what a plugin asked; the result goes back to the plugin. */
async function handleUiRequest(request: PluginUiRequest): Promise<unknown> {
  switch (request.kind) {
    case 'message': {
      const show = { info: toast.info, warning: toast.warning, error: toast.error }[request.level]
      const plugin = usePluginStore.getState().plugins.find((p) => p.id === request.plugin)
      show(request.message, { description: plugin?.displayName ?? request.plugin })
      return undefined
    }
    case 'input': {
      const value = await textDialog({
        title: request.title,
        label: request.prompt ?? request.title,
        optional: true,
        ...(request.password ? { secret: true } : {}),
        ...(request.value !== undefined ? { initialValue: request.value } : {}),
        ...(request.placeholder ? { placeholder: request.placeholder } : {}),
      })
      return value ?? undefined
    }
    case 'quickPick':
      return quickPick(request.items, request.placeholder)
    case 'setCommitMessage': {
      const { summary, description } = splitCommitMessage(request.message)
      useRepoViewStore.getState().update(request.repo, {
        view: 'changes',
        commitSummary: summary,
        commitDescription: description,
      })
      return undefined
    }
  }
}

export function usePluginSync() {
  useEffect(() => {
    const { refresh } = usePluginStore.getState()
    void refresh()
    const stops = [
      api.on('plugins:changed', () => {
        void refresh()
        // A panel may have just been registered (or its plugin restarted).
        void queryClient.invalidateQueries({ queryKey: pluginKeys.panels })
      }),
      api.on('plugins:panelChanged', ({ panel }) => {
        void queryClient.invalidateQueries({ queryKey: [...pluginKeys.panels, panel] })
      }),
      api.on('plugins:decorationsChanged', ({ repo }) => {
        void queryClient.invalidateQueries({ queryKey: pluginKeys.decorations(repo) })
      }),
      api.on('plugins:statusItems', (statusItems) => usePluginStore.setState({ statusItems })),
      api.on('plugins:ui', ({ requestId, request }) => {
        void handleUiRequest(request)
          .catch(() => undefined)
          .then((value) => api.invoke('plugins:uiResponse', requestId, value))
      }),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])
}
