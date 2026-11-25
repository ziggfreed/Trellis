/**
 * The plugins the UI knows about, and their status bar items.
 *
 * usePluginSync() (mounted once in app.tsx) loads them, keeps them up to
 * date when main reports changes, and answers plugins' UI requests (see
 * plugin-ui-bridge.ts). Components read from this store with
 * usePluginStore().
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import type { CommandArgs, MenuLocation, PluginInfo, PluginStatusItem } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { queryClient, repoKeys } from '@/lib/query-client'

interface PluginStore {
  plugins: PluginInfo[]
  statusItems: PluginStatusItem[]
  /** Fetch the plugin list again. */
  refresh: () => Promise<void>
}

export const usePluginStore = create<PluginStore>((set) => ({
  plugins: [],
  statusItems: [],
  refresh: async () => {
    const [plugins, statusItems] = await Promise.all([
      api.invoke('plugins:list'),
      api.invoke('plugins:statusItems'),
    ])
    set({ plugins, statusItems })
  },
}))

/** A command contributed by a running plugin, with the plugin's name for display. */
export interface PluginCommand {
  id: string
  title: string
  plugin: string
  /** Shown in the command palette (false for menu-only commands). */
  palette: boolean
}

/** Commands from plugins that are running. */
export function pluginCommands(plugins: readonly PluginInfo[]): PluginCommand[] {
  return plugins
    .filter((p) => p.state === 'running')
    .flatMap((p) =>
      p.contributes.commands.map((c) => ({
        id: c.id,
        title: c.title,
        plugin: p.displayName,
        palette: c.palette !== false,
      })),
    )
}

/** Commands running plugins added to a right-click menu. */
export function pluginMenuItems(
  plugins: readonly PluginInfo[],
  location: MenuLocation,
): PluginCommand[] {
  const commands = new Map(pluginCommands(plugins).map((c) => [c.id, c]))
  return plugins
    .filter((p) => p.state === 'running')
    .flatMap((p) => p.contributes.menus[location] ?? [])
    .map((item) => commands.get(item.command))
    .filter((c): c is PluginCommand => c !== undefined)
}

/**
 * Run a plugin command. Errors are shown as a toast; the repository's data
 * is refreshed afterwards in case the command changed it.
 */
export async function runPluginCommand(command: string, args: CommandArgs): Promise<void> {
  try {
    await api.invoke('plugins:executeCommand', command, args)
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    if (args.repo) void queryClient.invalidateQueries({ queryKey: repoKeys.all(args.repo) })
  }
}
