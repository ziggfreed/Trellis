import { describe, expect, it } from 'vitest'
import { branchUrl, commitUrl, fileUrl, guessStyle, webUrlFromRemote } from './lib.js'

describe('webUrlFromRemote', () => {
  it.each([
    ['git@github.com:owner/repo.git', 'https://github.com/owner/repo'],
    ['https://github.com/owner/repo.git', 'https://github.com/owner/repo'],
    ['https://github.com/owner/repo', 'https://github.com/owner/repo'],
    ['https://user@bitbucket.org/team/repo.git', 'https://bitbucket.org/team/repo'],
    [
      'ssh://git@gitlab.example.com:2222/group/sub/repo.git',
      'https://gitlab.example.com/group/sub/repo',
    ],
    ['git@gitlab.com:group/sub/repo.git', 'https://gitlab.com/group/sub/repo'],
    ['/home/me/repos/thing.git', null],
    ['C:/repos/thing', null],
    ['file:///tmp/repo', null],
  ])('%s -> %s', (remote, expected) => {
    expect(webUrlFromRemote(remote)).toBe(expected)
  })
})

describe('links', () => {
  const web = 'https://example.com/o/r'
  it('guesses the site type', () => {
    expect(guessStyle('https://gitlab.com/a/b')).toBe('gitlab')
    expect(guessStyle('https://codeberg.org/a/b')).toBe('gitea')
    expect(guessStyle('https://github.com/a/b')).toBe('github')
  })

  it('builds commit, branch and file links for each site type', () => {
    expect(commitUrl(web, 'github', 'abc')).toBe(`${web}/commit/abc`)
    expect(commitUrl(web, 'gitlab', 'abc')).toBe(`${web}/-/commit/abc`)
    expect(commitUrl(web, 'bitbucket', 'abc')).toBe(`${web}/commits/abc`)
    expect(branchUrl(web, 'github', 'feature/x y')).toBe(`${web}/tree/feature/x%20y`)
    expect(branchUrl(web, 'gitea', 'main')).toBe(`${web}/src/branch/main`)
    expect(fileUrl(web, 'gitlab', 'abc', 'src/a b.ts')).toBe(`${web}/-/blob/abc/src/a%20b.ts`)
    expect(fileUrl(web, 'bitbucket', 'abc', 'x.ts')).toBe(`${web}/src/abc/x.ts`)
  })
})
