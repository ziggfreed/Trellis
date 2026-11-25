/**
 * Plugin manager actions: install, remove, enable/disable, development
 * folders and reloading. Used by the Plugins tab in Settings and the command
 * palette.
 *
 * Plugins can run any code on the user's computer, so installing one always
 * asks for confirmation first.
 */
import { toast } from 'sonner'
import type { PluginInfo } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { confirmDialog, textDialog } from '@/features/dialogs/dialog-store'

const TRUST_WARNING =
  'Plugins can run any code on your computer, with the same access as Trellis. Only install plugins from people you trust.'

/** Run a plugin action, reporting errors and an optional success message. */
async function attempt<T>(task: () => Promise<T>, success?: (result: T) => string) {
  try {
    const result = await task()
    if (success) toast.success(success(result))
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

export async function installFromFolder() {
  const folder = await api.invoke('dialog:pickFolder', { title: 'Choose a plugin folder' })
  if (!folder) return
  const ok = await confirmDialog({
    title: 'Install this plugin?',
    description: `${folder}\n\n${TRUST_WARNING}`,
    confirmLabel: 'Install',
  })
  if (ok)
    await attempt(
      () => api.invoke('plugins:installFromFolder', folder),
      (id) => `Installed ${id}`,
    )
}

export async function installFromNpm() {
  const name = await textDialog({
    title: 'Install a plugin from npm',
    description: TRUST_WARNING,
    label: 'Package name',
    placeholder: 'e.g. trellis-plugin-example',
    confirmLabel: 'Install',
    validate: (value) => (value.trim() ? null : 'Enter the package name.'),
  })
  if (!name) return
  const installing = toast.loading(`Installing ${name.trim()}…`)
  await attempt(
    () => api.invoke('plugins:installFromNpm', name.trim()),
    (id) => `Installed ${id}`,
  )
  toast.dismiss(installing)
}

/** Load a folder in place while developing a plugin. */
export async function addDevFolder() {
  const folder = await api.invoke('dialog:pickFolder', {
    title: 'Choose the plugin you’re developing',
  })
  if (folder) {
    await attempt(
      () => api.invoke('plugins:addDevFolder', folder),
      () => 'Loaded. Use “Reload plugins” after changing its code.',
    )
  }
}

export async function setEnabled(plugin: PluginInfo, enabled: boolean) {
  if (plugin.id) await attempt(() => api.invoke('plugins:setEnabled', plugin.id!, enabled))
}

export async function remove(plugin: PluginInfo) {
  if (plugin.source === 'dev') {
    await attempt(() => api.invoke('plugins:removeDevFolder', plugin.path))
    return
  }
  const ok = await confirmDialog({
    title: `Uninstall ${plugin.displayName}?`,
    description: 'Its files are deleted. Its saved settings are kept in case you install it again.',
    confirmLabel: 'Uninstall',
    destructive: true,
  })
  if (ok && plugin.id) {
    await attempt(
      () => api.invoke('plugins:uninstall', plugin.id!),
      () => `Uninstalled ${plugin.displayName}`,
    )
  }
}

export function reloadPlugins() {
  return attempt(
    () => api.invoke('plugins:reload'),
    () => 'Plugins reloaded',
  )
}
