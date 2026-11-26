/**
 * Settings > Plugins: every plugin Trellis found, with its state, an on/off
 * switch, its own settings, and buttons to install, uninstall, load a
 * development folder or reload.
 *
 * The list comes from the plugin store (kept current by usePluginSync).
 * Plugin settings are saved like any other setting (settings store), and
 * main passes the new values on to the plugin.
 */
import { useState } from 'react'
import { ChevronRight, Download, FolderOpen, Package, RefreshCw, Wrench } from 'lucide-react'
import { settingValues, type SettingContribution } from '@trellis/plugin-api'
import type { PluginInfo } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/features/settings/settings-store'
import { usePluginStore } from './plugin-store'
import * as actions from './plugin-actions'
import { openUserGuide } from '@/lib/help'

const SOURCE_LABELS: Record<PluginInfo['source'], string> = {
  builtin: 'Built-in',
  installed: 'Installed',
  dev: 'Development',
}

export function PluginsPanel() {
  const plugins = usePluginStore((s) => s.plugins)
  return (
    <div className="space-y-3" data-testid="plugins-panel">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void actions.installFromNpm()}>
          <Download />
          Install from npm…
        </Button>
        <Button size="sm" variant="outline" onClick={() => void actions.installFromFolder()}>
          <FolderOpen />
          Install from folder…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void actions.addDevFolder()}>
          <Wrench />
          Load development folder…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void actions.reloadPlugins()}>
          <RefreshCw />
          Reload plugins
        </Button>
      </div>
      {plugins.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No plugins yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {plugins.map((plugin) => (
            <PluginRow key={plugin.path} plugin={plugin} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Plugins can run any code on your computer. Only install plugins you trust. Want to write
        one?{' '}
        <button
          type="button"
          className="text-brand underline-offset-2 hover:underline"
          onClick={() => openUserGuide('Writing-Plugins')}
        >
          Read the guide to writing plugins
        </button>
        .
      </p>
    </div>
  )
}

function PluginRow({ plugin }: { plugin: PluginInfo }) {
  const [showSettings, setShowSettings] = useState(false)
  const hasSettings = plugin.contributes.settings.length > 0
  return (
    <li className="space-y-1 p-3" aria-label={plugin.displayName}>
      <div className="flex items-start gap-3">
        <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{plugin.displayName}</span>
            {plugin.version && (
              <span className="text-xs text-muted-foreground">{plugin.version}</span>
            )}
            <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
              {SOURCE_LABELS[plugin.source]}
            </span>
            <StateLabel plugin={plugin} />
          </div>
          {plugin.description && (
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          )}
          {plugin.error && (
            <p className="text-sm break-words text-destructive" role="alert">
              {plugin.error}
            </p>
          )}
          {plugin.source === 'dev' && (
            <p className="truncate text-xs text-muted-foreground" title={plugin.path}>
              {plugin.path}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {plugin.source !== 'builtin' && (
            <Button size="xs" variant="ghost" onClick={() => void actions.remove(plugin)}>
              {plugin.source === 'dev' ? 'Remove' : 'Uninstall'}
            </Button>
          )}
          {plugin.id && (
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={plugin.enabled}
                onChange={(e) => void actions.setEnabled(plugin, e.target.checked)}
              />
              On
            </label>
          )}
        </div>
      </div>
      {hasSettings && plugin.id && (
        <div className="pl-7">
          <button
            type="button"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3 transition-transform', showSettings && 'rotate-90')}
            />
            Settings
          </button>
          {showSettings && <PluginSettings id={plugin.id} declared={plugin.contributes.settings} />}
        </div>
      )}
    </li>
  )
}

function StateLabel({ plugin }: { plugin: PluginInfo }) {
  const labels = {
    running: 'Running',
    starting: 'Starting…',
    disabled: 'Off',
    error: 'Not running',
  }
  return (
    <span
      className={cn(
        'text-xs',
        plugin.state === 'running' && 'text-brand',
        plugin.state === 'error' && 'text-destructive',
        (plugin.state === 'disabled' || plugin.state === 'starting') && 'text-muted-foreground',
      )}
    >
      {labels[plugin.state]}
    </span>
  )
}

/** A plugin's own settings, edited in place. */
function PluginSettings({ id, declared }: { id: string; declared: SettingContribution[] }) {
  const saved = useSettingsStore((s) => s.settings.pluginSettings[id])
  const update = useSettingsStore((s) => s.update)
  const values = settingValues(declared, saved)
  const set = (key: string, value: unknown) => {
    const all = useSettingsStore.getState().settings.pluginSettings
    update({ pluginSettings: { ...all, [id]: { ...all[id], [key]: value } } })
  }

  return (
    <div className="mt-2 space-y-3">
      {declared.map((setting) => {
        const inputId = `plugin-setting-${id}-${setting.key}`
        const value = values[setting.key]
        return (
          <div key={setting.key} className="space-y-1">
            {setting.type === 'boolean' ? (
              <label htmlFor={inputId} className="flex items-center gap-2 text-sm">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => set(setting.key, e.target.checked)}
                />
                {setting.title}
              </label>
            ) : (
              <>
                <label htmlFor={inputId} className="block text-sm">
                  {setting.title}
                </label>
                {setting.type === 'enum' ? (
                  <select
                    id={inputId}
                    value={String(value)}
                    onChange={(e) => set(setting.key, e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {setting.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type={setting.type === 'number' ? 'number' : 'text'}
                    value={String(value)}
                    onChange={(e) =>
                      set(
                        setting.key,
                        setting.type === 'number' ? Number(e.target.value) : e.target.value,
                      )
                    }
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                )}
              </>
            )}
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
