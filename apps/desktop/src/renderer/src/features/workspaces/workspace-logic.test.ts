import { describe, expect, it } from 'vitest'
import type { RepoTab, Workspace } from '@shared/ipc'
import {
  addReposToWorkspace,
  createWorkspace,
  deleteWorkspace,
  removeRepoFromWorkspace,
  renameWorkspace,
  validateWorkspaceName,
} from './workspace-logic'

const repo = (name: string): RepoTab => ({ path: `/r/${name}`, name })

describe('workspaces', () => {
  it('creates, renames, edits and deletes workspaces', () => {
    let list: Workspace[] = []
    list = createWorkspace(list, ' Work ', [repo('a'), repo('b'), repo('a')], 'w1')
    expect(list).toEqual([{ id: 'w1', name: 'Work', repos: [repo('a'), repo('b')] }])
    list = renameWorkspace(list, 'w1', 'Job')
    list = addReposToWorkspace(list, 'w1', [repo('b'), repo('c')])
    list = removeRepoFromWorkspace(list, 'w1', '/r/a')
    expect(list[0]).toEqual({ id: 'w1', name: 'Job', repos: [repo('b'), repo('c')] })
    expect(deleteWorkspace(list, 'w1')).toEqual([])
  })

  it('validates names', () => {
    const list = createWorkspace([], 'Work', [], 'w1')
    expect(validateWorkspaceName(list, '  ')).not.toBeNull()
    expect(validateWorkspaceName(list, 'work')).toMatch(/already exists/)
    expect(validateWorkspaceName(list, 'work', 'w1')).toBeNull() // renaming itself
    expect(validateWorkspaceName(list, 'Side projects')).toBeNull()
  })
})
