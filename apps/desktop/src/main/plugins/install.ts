/**
 * Installing and removing plugins in the user's plugins folder
 * (<user data>/plugins/<plugin id>).
 *
 *   installFromFolder  copy a plugin folder in (e.g. one you built or unzipped)
 *   installFromNpm     download the newest version that supports this Trellis
 *                      from the npm registry and unpack it
 *   uninstall          delete an installed plugin's folder
 *
 * Every plugin is checked (package.json, entry file, Trellis version) before
 * it replaces anything, so a broken download can't remove a working plugin.
 *
 * npm packages are installed as published: Trellis doesn't run `npm install`,
 * so plugins must bundle their dependencies (see docs/PLUGINS.md).
 */
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { satisfiesEngine } from '@trellis/plugin-api'
import { readPlugin } from './discovery'
import { readTar } from './tar'

const REGISTRY = 'https://registry.npmjs.org'

/** Valid npm package names: "name" or "@scope/name". */
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/**
 * Check the plugin in `folder` and move/copy it to <installedDir>/<id>,
 * replacing an older copy. Returns the plugin id.
 */
async function putInPlace(
  folder: string,
  installedDir: string,
  appVersion: string,
  move: boolean,
): Promise<string> {
  const plugin = await readPlugin(folder, 'installed', appVersion)
  if (!plugin.manifest) throw new Error(plugin.error ?? 'Not a Trellis plugin.')
  if (plugin.error) throw new Error(plugin.error)
  const id = plugin.manifest.id
  const target = join(installedDir, id)
  await mkdir(dirname(target), { recursive: true })
  // Put the new copy beside the old one first, then swap, so a failure
  // part-way through leaves the old version working.
  const incoming = `${target}.incoming`
  await rm(incoming, { recursive: true, force: true })
  if (move) await rename(folder, incoming)
  else {
    await cp(folder, incoming, {
      recursive: true,
      // Version control data isn't part of the plugin.
      filter: (source) => !/[/\\]\.git([/\\]|$)/.test(source.slice(folder.length)),
    })
  }
  await rm(target, { recursive: true, force: true })
  await rename(incoming, target)
  return id
}

export function installFromFolder(folder: string, installedDir: string, appVersion: string) {
  return putInPlace(folder, installedDir, appVersion, false)
}

interface RegistryPackage {
  versions?: Record<string, { engines?: { trellis?: string }; dist?: { tarball?: string } }>
}

/** Compare "1.2.3" versions, newest first (pre-releases are skipped by the caller). */
function newestFirst(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  return pb[0]! - pa[0]! || pb[1]! - pa[1]! || pb[2]! - pa[2]!
}

/** Download a plugin from npm and install it. Returns the plugin id. */
export async function installFromNpm(
  name: string,
  installedDir: string,
  tempDir: string,
  appVersion: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const pkg = name.trim()
  if (!NPM_NAME.test(pkg)) throw new Error(`“${pkg}” isn’t a valid npm package name.`)

  const response = await fetchFn(`${REGISTRY}/${pkg.replace('/', '%2f')}`)
  if (response.status === 404) throw new Error(`There’s no package called “${pkg}” on npm.`)
  if (!response.ok) throw new Error(`npm replied ${response.status} ${response.statusText}.`)
  const info = (await response.json()) as RegistryPackage

  // The newest stable version whose engines.trellis accepts this Trellis.
  const versions = Object.entries(info.versions ?? {})
    .filter(([version]) => /^\d+\.\d+\.\d+$/.test(version))
    .sort(([a], [b]) => newestFirst(a, b))
  if (!versions.some(([, v]) => v.engines?.trellis)) {
    throw new Error(`“${pkg}” isn’t a Trellis plugin (no "engines.trellis" in its package.json).`)
  }
  const match = versions.find(
    ([, v]) => v.engines?.trellis && satisfiesEngine(appVersion, v.engines.trellis),
  )
  if (!match?.[1].dist?.tarball) {
    throw new Error(`No version of “${pkg}” supports Trellis ${appVersion}.`)
  }

  const download = await fetchFn(match[1].dist.tarball)
  if (!download.ok) throw new Error(`Downloading ${pkg} failed: ${download.status}.`)
  const entries = readTar(gunzipSync(Buffer.from(await download.arrayBuffer())))

  // npm tarballs keep everything under a top folder, usually "package/".
  await mkdir(tempDir, { recursive: true })
  const staging = await mkdtemp(join(tempDir, 'plugin-'))
  try {
    for (const entry of entries) {
      const relative = entry.path.split('/').slice(1).join('/')
      if (!relative) continue
      const destination = join(staging, relative)
      if (entry.type === 'directory') await mkdir(destination, { recursive: true })
      else {
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, entry.data)
      }
    }
    return await putInPlace(staging, installedDir, appVersion, true)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/** Delete an installed plugin's folder. */
export async function uninstall(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true })
}
