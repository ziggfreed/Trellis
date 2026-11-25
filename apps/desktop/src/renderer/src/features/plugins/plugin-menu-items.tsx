/**
 * Right-click menu items added by plugins. Rendered at the end of the
 * commit, branch and file menus (see repo-actions/menus.tsx); shows nothing
 * when no plugin adds to that menu.
 */
import type { CommandArgs, MenuLocation } from '@shared/ipc'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { pluginMenuItems, runPluginCommand, usePluginStore } from './plugin-store'

export function PluginMenuItems({ location, args }: { location: MenuLocation; args: CommandArgs }) {
  const plugins = usePluginStore((s) => s.plugins)
  const items = pluginMenuItems(plugins, location)
  if (items.length === 0) return null
  return (
    <>
      <ContextMenuSeparator />
      {items.map((item) => (
        <ContextMenuItem
          key={item.id}
          title={`From the ${item.plugin} plugin`}
          onSelect={() => void runPluginCommand(item.id, args)}
        >
          {item.title}
        </ContextMenuItem>
      ))}
    </>
  )
}
