import { describe, expect, it } from 'vitest'
import type { PluginInfo } from '@shared/ipc'
import { pluginCommands, pluginMenuItems } from './plugin-store'

const plugin = (overrides: Partial<PluginInfo>): PluginInfo => ({
  id: 'p',
  displayName: 'P',
  version: '1.0.0',
  description: '',
  path: '/p',
  source: 'installed',
  enabled: true,
  state: 'running',
  error: null,
  contributes: { commands: [], menus: {}, settings: [] },
  readyCommands: [],
  ...overrides,
})

describe('plugin contributions', () => {
  const running = plugin({
    displayName: 'Remote',
    contributes: {
      commands: [
        { id: 'r.open', title: 'Open' },
        { id: 'r.menu', title: 'Menu only', palette: false },
      ],
      menus: { commit: [{ command: 'r.menu' }] },
      settings: [],
    },
  })
  const stopped = plugin({
    state: 'disabled',
    contributes: {
      commands: [{ id: 's.x', title: 'X' }],
      menus: { commit: [{ command: 's.x' }] },
      settings: [],
    },
  })

  it('lists commands of running plugins only', () => {
    expect(pluginCommands([running, stopped])).toEqual([
      { id: 'r.open', title: 'Open', plugin: 'Remote', palette: true },
      { id: 'r.menu', title: 'Menu only', plugin: 'Remote', palette: false },
    ])
  })

  it('lists menu items for a location', () => {
    expect(pluginMenuItems([running, stopped], 'commit').map((c) => c.id)).toEqual(['r.menu'])
    expect(pluginMenuItems([running], 'branch')).toEqual([])
  })
})
