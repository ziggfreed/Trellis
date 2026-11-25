import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverPlugins } from './discovery'
import { installFromFolder, installFromNpm } from './install'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'trellis-plugins-'))
  temps.push(dir)
  return dir
}

function manifest(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    version: '1.0.0',
    main: 'index.js',
    engines: { trellis: '^0.2.0' },
    trellis: { displayName: name.toUpperCase() },
    ...extra,
  }
}

/** Write a plugin folder; `main: false` leaves out the entry file. */
function writePlugin(dir: string, json: object, main = true) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json))
  if (main) writeFileSync(join(dir, 'index.js'), 'export function activate() {}\n')
  return dir
}

describe('discoverPlugins', () => {
  it('finds plugins in each place, lets later places win, and reports problems', async () => {
    const root = temp()
    const builtInDir = join(root, 'builtin')
    const installedDir = join(root, 'installed')
    writePlugin(join(builtInDir, 'alpha'), manifest('alpha'))
    writePlugin(join(builtInDir, 'beta'), manifest('beta'))
    writePlugin(join(installedDir, 'beta'), manifest('beta', { version: '2.0.0' }))
    writePlugin(join(installedDir, '@me', 'scoped'), manifest('@me/scoped'))
    writePlugin(
      join(installedDir, 'future'),
      manifest('future', { engines: { trellis: '^9.0.0' } }),
    )
    writePlugin(join(installedDir, 'unbuilt'), manifest('unbuilt'), false)
    mkdirSync(join(installedDir, 'empty'))
    const dev = writePlugin(join(root, 'dev-alpha'), manifest('alpha', { version: '0.0.1-dev' }))

    const found = await discoverPlugins({
      builtInDir,
      installedDir,
      devFolders: [dev],
      appVersion: '0.2.0',
    })
    const summary = Object.fromEntries(
      found.map((p) => [p.manifest?.id ?? 'no manifest', [p.source, p.manifest?.version, p.error]]),
    )
    expect(summary).toEqual({
      alpha: ['dev', '0.0.1-dev', null],
      beta: ['installed', '2.0.0', null],
      '@me/scoped': ['installed', '1.0.0', null],
      future: ['installed', '1.0.0', 'Needs Trellis ^9.0.0; this is Trellis 0.2.0.'],
      unbuilt: ['installed', '1.0.0', expect.stringMatching(/doesn’t exist/)],
      'no manifest': ['installed', undefined, 'No package.json in this folder.'],
    })
  })
})

describe('installing', () => {
  it('copies a plugin folder in, replacing an older version', async () => {
    const root = temp()
    const installedDir = join(root, 'installed')
    const source = writePlugin(join(root, 'src'), manifest('hello'))
    mkdirSync(join(source, '.git'))
    writeFileSync(join(source, '.git', 'HEAD'), 'ref')
    expect(await installFromFolder(source, installedDir, '0.2.0')).toBe('hello')
    writePlugin(source, manifest('hello', { version: '1.1.0' }))
    await installFromFolder(source, installedDir, '0.2.0')
    expect(
      JSON.parse(readFileSync(join(installedDir, 'hello', 'package.json'), 'utf8')).version,
    ).toBe('1.1.0')
    expect(existsSync(join(installedDir, 'hello', '.git'))).toBe(false)
  })

  it('refuses a folder that isn’t a usable plugin', async () => {
    const root = temp()
    const source = writePlugin(join(root, 'src'), { name: 'x', version: '1.0.0', main: 'index.js' })
    await expect(installFromFolder(source, join(root, 'installed'), '0.2.0')).rejects.toThrow(
      /"trellis" section/,
    )
  })

  it('downloads the newest compatible version from npm', async () => {
    const root = temp()
    const installedDir = join(root, 'installed')
    const tarball = gzipSync(
      tar([
        ['package/package.json', JSON.stringify(manifest('npm-plugin', { version: '1.2.0' }))],
        ['package/index.js', 'export function activate() {}'],
      ]),
    )
    const requested: string[] = []
    const fakeFetch = (async (url: string) => {
      requested.push(url)
      if (url.endsWith('/npm-plugin')) {
        return Response.json({
          versions: {
            '1.2.0': { engines: { trellis: '^0.2.0' }, dist: { tarball: 'https://x/1.2.0.tgz' } },
            '2.0.0': { engines: { trellis: '^0.3.0' }, dist: { tarball: 'https://x/2.0.0.tgz' } },
            '3.0.0-beta.1': {
              engines: { trellis: '^0.2.0' },
              dist: { tarball: 'https://x/beta.tgz' },
            },
          },
        })
      }
      if (url === 'https://x/1.2.0.tgz') return new Response(tarball)
      return new Response('', { status: 404 })
    }) as typeof fetch

    expect(
      await installFromNpm('npm-plugin', installedDir, join(root, 'tmp'), '0.2.0', fakeFetch),
    ).toBe('npm-plugin')
    expect(requested).toEqual(['https://registry.npmjs.org/npm-plugin', 'https://x/1.2.0.tgz'])
    expect(existsSync(join(installedDir, 'npm-plugin', 'index.js'))).toBe(true)

    await expect(
      installFromNpm('missing', installedDir, join(root, 'tmp'), '0.2.0', fakeFetch),
    ).rejects.toThrow(/no package called/)
    await expect(
      installFromNpm('Bad Name', installedDir, join(root, 'tmp'), '0.2.0', fakeFetch),
    ).rejects.toThrow(/valid npm package name/)
  })
})

/** A minimal tar archive of [path, content] files. */
function tar(files: [string, string][]) {
  const blocks = files.flatMap(([name, content]) => {
    const data = Buffer.from(content)
    const header = Buffer.alloc(512)
    header.write(name, 0)
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124)
    header.write('0', 156)
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512)
    data.copy(padded)
    return [header, padded]
  })
  return Buffer.concat([...blocks, Buffer.alloc(1024)])
}
