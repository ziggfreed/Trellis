/**
 * Finding plugins on disk and checking them.
 *
 * Plugins come from three places, in increasing priority (a plugin with the
 * same id in a later place replaces the earlier one):
 *   built-in    shipped with Trellis (the repository's plugins/ folder)
 *   installed   copied into <user data>/plugins by the plugin manager
 *   development folders the user linked in Settings > Plugins, loaded in place
 *               so changes show up after "Reload plugins"
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parseManifest, satisfiesEngine, type PluginManifest } from '@trellis/plugin-api'
import type { PluginSource } from '@shared/ipc'

export interface DiscoveredPlugin {
  /** Plugin folder. */
  path: string
  source: PluginSource
  /** Null if package.json is missing or invalid (see `error`). */
  manifest: PluginManifest | null
  /** Why the plugin can't run, or null if it can. */
  error: string | null
}

/** Read and check one plugin folder. */
export async function readPlugin(
  folder: string,
  source: PluginSource,
  appVersion: string,
): Promise<DiscoveredPlugin> {
  const result = (error: string, manifest: PluginManifest | null = null): DiscoveredPlugin => ({
    path: folder,
    source,
    manifest,
    error,
  })
  let json: unknown
  try {
    json = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
  } catch (error) {
    return result(
      existsSync(join(folder, 'package.json'))
        ? `package.json isn’t valid JSON: ${(error as Error).message}`
        : 'No package.json in this folder.',
    )
  }
  const parsed = parseManifest(json)
  if (!parsed.ok) return result(parsed.error)
  const { manifest } = parsed

  const main = resolve(folder, manifest.main)
  if (isAbsolute(relative(folder, main)) || relative(folder, main).startsWith('..')) {
    return result(`"main" must point to a file inside the plugin folder.`, manifest)
  }
  if (!existsSync(main))
    return result(`The entry file ${manifest.main} doesn’t exist. Is the plugin built?`, manifest)
  if (!satisfiesEngine(appVersion, manifest.engine)) {
    return result(`Needs Trellis ${manifest.engine}; this is Trellis ${appVersion}.`, manifest)
  }
  return { path: folder, source, manifest, error: null }
}

/** Every plugin folder directly inside `dir` (none if it doesn't exist). */
async function pluginFolders(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const folders: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Scoped packages (@scope/name) are installed one level deeper.
    if (entry.name.startsWith('@')) {
      for (const inner of await readdir(join(dir, entry.name), { withFileTypes: true })) {
        if (inner.isDirectory()) folders.push(join(dir, entry.name, inner.name))
      }
    } else if (!entry.name.startsWith('.')) {
      folders.push(join(dir, entry.name))
    }
  }
  return folders.sort()
}

/**
 * Find all plugins. If two have the same id, the higher-priority source
 * wins (development > installed > built-in).
 */
export async function discoverPlugins(options: {
  builtInDir: string
  installedDir: string
  devFolders: readonly string[]
  appVersion: string
}): Promise<DiscoveredPlugin[]> {
  const found: DiscoveredPlugin[] = []
  const add = async (folders: string[], source: PluginSource) => {
    for (const folder of folders) found.push(await readPlugin(folder, source, options.appVersion))
  }
  await add(await pluginFolders(options.builtInDir), 'builtin')
  await add(await pluginFolders(options.installedDir), 'installed')
  await add([...options.devFolders], 'dev')

  // Keep the last plugin for each id; ones without a manifest are kept too
  // (so their error can be shown), keyed by folder.
  const byId = new Map<string, DiscoveredPlugin>()
  for (const plugin of found) byId.set(plugin.manifest?.id ?? `folder:${plugin.path}`, plugin)
  return [...byId.values()]
}
