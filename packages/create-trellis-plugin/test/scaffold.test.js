import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseManifest } from '@trellis/plugin-api'
import { checkName, namesFor, scaffold } from '../scaffold.js'

const temps = []
afterEach(() => temps.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('create-trellis-plugin', () => {
  it('checks names and derives display names and command prefixes', () => {
    expect(checkName('my-plugin')).toBeNull()
    expect(checkName('My Plugin')).toMatch(/can't be a package name/)
    expect(checkName('')).toMatch(/Give your plugin a name/)
    expect(namesFor('hello-trellis')).toEqual({
      name: 'hello-trellis',
      displayName: 'Hello Trellis',
      prefix: 'helloTrellis',
    })
  })

  it('creates a plugin that Trellis accepts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'create-plugin-'))
    temps.push(root)
    const folder = join(root, 'hello-trellis')
    expect(await scaffold(folder, 'hello-trellis')).toEqual([
      '.gitignore',
      'README.md',
      'index.js',
      'package.json',
    ])
    const manifest = parseManifest(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')))
    expect(manifest.ok && manifest.manifest).toMatchObject({
      id: 'hello-trellis',
      displayName: 'Hello Trellis',
      contributes: { commands: [{ id: 'helloTrellis.hello' }, { id: 'helloTrellis.showCommit' }] },
    })
    expect(readFileSync(join(folder, 'index.js'), 'utf8')).toContain(
      "register('helloTrellis.hello'",
    )
    await expect(scaffold(folder, 'hello-trellis')).rejects.toThrow(/already exists/)
  })
})
