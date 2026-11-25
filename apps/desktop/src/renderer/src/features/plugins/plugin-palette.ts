/**
 * Adds running plugins' commands to the command palette (grouped under the
 * plugin's name). Registered once by the command palette.
 */
import type { CommandProvider } from '@/features/command-palette/registry'
import { pluginCommands, runPluginCommand, usePluginStore } from './plugin-store'

export const pluginPaletteCommands: CommandProvider = (context) =>
  pluginCommands(usePluginStore.getState().plugins)
    .filter((command) => command.palette)
    .map((command) => ({
      id: `plugin:${command.id}`,
      title: command.title,
      group: command.plugin,
      keywords: ['plugin'],
      run: () => void runPluginCommand(command.id, { repo: context.repo?.path ?? null }),
    }))
