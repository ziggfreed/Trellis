import { describe, expect, it } from 'vitest'
import { parseManifest, satisfiesEngine, settingValues, type SettingContribution } from '../src'

const valid = {
  name: 'open-on-remote',
  version: '1.0.0',
  main: 'index.js',
  description: 'Open things on GitHub',
  engines: { trellis: '^0.2.0' },
  trellis: {
    displayName: 'Open on Remote',
    contributes: {
      commands: [
        { id: 'openOnRemote.commit', title: 'Open commit on remote' },
        { id: 'openOnRemote.menuOnly', title: 'Menu only', palette: false },
      ],
      menus: { commit: [{ command: 'openOnRemote.commit' }] },
      settings: [
        { key: 'remote', type: 'string', default: 'origin', title: 'Remote' },
        { key: 'style', type: 'enum', default: 'a', options: ['a', 'b'], title: 'Style' },
      ],
    },
  },
}

const withTrellis = (trellis: unknown) => ({ ...valid, trellis })
const errorOf = (json: unknown) => {
  const result = parseManifest(json)
  return result.ok ? null : result.error
}

describe('parseManifest', () => {
  it('reads a valid manifest', () => {
    const result = parseManifest(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest).toMatchObject({
      id: 'open-on-remote',
      displayName: 'Open on Remote',
      engine: '^0.2.0',
      main: 'index.js',
    })
    expect(result.manifest.contributes.commands[1]).toEqual({
      id: 'openOnRemote.menuOnly',
      title: 'Menu only',
      palette: false,
    })
    expect(result.manifest.contributes.menus.commit).toEqual([{ command: 'openOnRemote.commit' }])
  })

  it('fills in defaults for optional parts', () => {
    const result = parseManifest(withTrellis({}))
    expect(result.ok && result.manifest).toMatchObject({
      displayName: 'open-on-remote',
      contributes: { commands: [], menus: {}, settings: [] },
    })
  })

  it('explains what is wrong', () => {
    expect(errorOf(null)).toMatch(/JSON object/)
    expect(errorOf({ ...valid, name: 'Bad Name' })).toMatch(/valid package name/)
    expect(errorOf({ ...valid, main: undefined })).toMatch(/"main"/)
    expect(errorOf({ ...valid, trellis: undefined })).toMatch(/"trellis" section/)
    expect(errorOf({ ...valid, engines: {} })).toMatch(/engines/)
    expect(errorOf(withTrellis({ contributes: { commands: [{ id: 'x' }] } }))).toMatch(/title/)
    expect(errorOf(withTrellis({ contributes: { menus: { toolbar: [] } } }))).toMatch(
      /Unknown menu "toolbar"/,
    )
    expect(
      errorOf(withTrellis({ contributes: { menus: { commit: [{ command: 'missing' }] } } })),
    ).toMatch(/isn't in "contributes.commands"/)
    expect(
      errorOf(
        withTrellis({
          contributes: { settings: [{ key: 'n', title: 'N', type: 'number', default: 'x' }] },
        }),
      ),
    ).toMatch(/default/)
    expect(
      errorOf(
        withTrellis({
          contributes: {
            settings: [{ key: 'e', title: 'E', type: 'enum', default: 'c', options: ['a'] }],
          },
        }),
      ),
    ).toMatch(/one of its options/)
  })
})

describe('satisfiesEngine', () => {
  it.each([
    ['0.2.0', '^0.2.0', true],
    ['0.2.5', '^0.2.0', true],
    ['0.3.0', '^0.2.0', false],
    ['0.1.9', '^0.2.0', false],
    ['1.4.0', '^1.2.0', true],
    ['2.0.0', '^1.2.0', false],
    ['1.2.9', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['0.5.0', '>=0.2.0', true],
    ['0.5.0', '>=0.2.0 <0.5.0', false],
    ['0.2.0', '0.2.0', true],
    ['0.2.1', '0.2.0', false],
    ['0.2.0', '*', true],
    ['0.2.0', 'nonsense', false],
  ])('%s satisfies %s: %s', (version, range, expected) => {
    expect(satisfiesEngine(version, range)).toBe(expected)
  })
})

describe('settingValues', () => {
  it('uses saved values of the right type and defaults for the rest', () => {
    const declared: SettingContribution[] = [
      { key: 'remote', type: 'string', default: 'origin', title: 'Remote' },
      { key: 'on', type: 'boolean', default: true, title: 'On' },
      { key: 'style', type: 'enum', default: 'a', options: ['a', 'b'], title: 'Style' },
    ]
    expect(
      settingValues(declared, { remote: 'upstream', on: 'yes', style: 'c', extra: 1 }),
    ).toEqual({
      remote: 'upstream',
      on: true,
      style: 'a',
    })
    expect(settingValues(declared, undefined)).toEqual({
      remote: 'origin',
      on: true,
      style: 'a',
    })
  })
})
