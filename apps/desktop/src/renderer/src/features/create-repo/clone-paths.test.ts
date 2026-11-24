import { describe, expect, it } from 'vitest'
import { joinPath, repoNameFromUrl, validateFolderName } from './clone-paths'

describe('repoNameFromUrl', () => {
  it.each([
    ['https://github.com/user/my-repo.git', 'my-repo'],
    ['https://github.com/user/my-repo', 'my-repo'],
    ['https://github.com/user/my-repo/', 'my-repo'],
    ['git@github.com:user/my-repo.git', 'my-repo'],
    ['C:\\code\\local-repo', 'local-repo'],
    ['', ''],
  ])('%s -> %s', (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name)
  })
})

describe('joinPath', () => {
  it('uses the separator style of the folder', () => {
    expect(joinPath('C:\\Users\\me\\code', 'repo')).toBe('C:\\Users\\me\\code\\repo')
    expect(joinPath('C:\\Users\\me\\code\\', 'repo')).toBe('C:\\Users\\me\\code\\repo')
    expect(joinPath('/home/me/code/', 'repo')).toBe('/home/me/code/repo')
  })
})

describe('validateFolderName', () => {
  it('accepts ordinary names and rejects bad ones', () => {
    expect(validateFolderName('my-repo')).toBeNull()
    expect(validateFolderName('')).not.toBeNull()
    expect(validateFolderName('a/b')).not.toBeNull()
    expect(validateFolderName('..')).not.toBeNull()
  })
})
