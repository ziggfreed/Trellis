import { describe, expect, it } from 'vitest'
import { effectiveShortcut, findConflicts, SHORTCUT_ACTIONS } from './shortcut-actions'

describe('shortcut actions', () => {
  it('have unique ids and no conflicting defaults', () => {
    expect(new Set(SHORTCUT_ACTIONS.map((a) => a.id)).size).toBe(SHORTCUT_ACTIONS.length)
    expect(findConflicts({})).toEqual(new Map())
  })

  it('use overrides, including turning a shortcut off', () => {
    expect(effectiveShortcut('repo.open', {})).toBe('Mod+O')
    expect(effectiveShortcut('repo.open', { 'repo.open': 'F2' })).toBe('F2')
    expect(effectiveShortcut('repo.open', { 'repo.open': '' })).toBe('')
  })

  it('reports actions that share a shortcut', () => {
    const conflicts = findConflicts({ 'git.fetch': 'Mod+O' })
    expect(conflicts.get('git.fetch')).toEqual(['repo.open'])
    expect(conflicts.get('repo.open')).toEqual(['git.fetch'])
  })
})
