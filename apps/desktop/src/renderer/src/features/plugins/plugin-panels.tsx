/**
 * Plugin panels in the repository sidebar (below Stashes). Each panel is a
 * collapsible section whose rows come from the plugin's PanelProvider
 * (`trellis.ui.registerPanel`). Clicking a row runs the row's command.
 *
 * Items are fetched once per panel and repository, and again only when the
 * plugin calls panel.refresh() (see pluginKeys in plugin-store.ts). A panel
 * with no items is hidden, so plugins can stay out of the way in
 * repositories they don't apply to.
 */
import { useQuery } from '@tanstack/react-query'
import { Puzzle } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { StatusIcon } from '@/components/status-icon'
import { Item, Section } from '@/features/sidebar/sidebar-parts'
import {
  pluginKeys,
  pluginPanels,
  runPluginCommand,
  usePluginStore,
  type PluginPanel,
} from './plugin-store'

export function PluginPanels({ repoPath }: { repoPath: string }) {
  const plugins = usePluginStore((s) => s.plugins)
  return pluginPanels(plugins).map((panel) => (
    <PanelSection key={panel.id} panel={panel} repoPath={repoPath} />
  ))
}

function PanelSection({ panel, repoPath }: { panel: PluginPanel; repoPath: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: pluginKeys.panel(panel.id, repoPath),
    queryFn: () => api.invoke('plugins:panelItems', panel.id, repoPath),
  })
  const items = data ?? []
  if (!error && !isPending && items.length === 0) return null
  return (
    <Section title={panel.title} icon={Puzzle} count={items.length}>
      {error ? (
        <p className="px-8 py-0.5 text-xs text-destructive">{errorMessage(error)}</p>
      ) : isPending ? (
        <p className="px-8 py-0.5 text-xs text-muted-foreground">Loading…</p>
      ) : (
        items.map((item, index) => (
          <Item
            key={item.id ?? index}
            label={item.label}
            title={item.tooltip ?? item.label}
            selected={false}
            disabled={!item.command}
            className="disabled:cursor-default disabled:hover:bg-transparent"
            onClick={() => {
              if (item.command) {
                void runPluginCommand(item.command, {
                  repo: repoPath,
                  ...(item.id !== undefined ? { item: item.id } : {}),
                })
              }
            }}
            leading={item.icon && <StatusIcon name={item.icon} />}
            trailing={
              item.description && (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              )
            }
          />
        ))
      )}
    </Section>
  )
}
