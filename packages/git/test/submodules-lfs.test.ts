/** Submodules and Git LFS helpers. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getLfsPatterns,
  getLfsVersion,
  getSubmodules,
  lfsTrack,
  lfsUntrack,
  parseGitmodules,
  parseLfsLocks,
  parseLfsPatterns,
  parseLfsPointer,
  parseSubmoduleStatus,
  updateSubmodules,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

const cleanup: TempRepo[] = []
afterEach(async () => {
  for (const repo of cleanup.splice(0)) await repo.cleanup()
})

async function repo() {
  const r = await createTempRepo()
  cleanup.push(r)
  await r.write('README.md', '# test\n')
  await r.commit('initial commit')
  return r
}

describe('submodules', () => {
  it('parses status flags and .gitmodules', () => {
    expect(
      parseSubmoduleStatus(
        '-abc123 libs/a\n+def456 libs/b (v1.0-2-gdef456)\n 0123ab libs/c (heads/main)\nUfff000 libs/d\n',
      ),
    ).toEqual([
      { sha: 'abc123', path: 'libs/a', state: 'uninitialized' },
      { sha: 'def456', path: 'libs/b', state: 'changed' },
      { sha: '0123ab', path: 'libs/c', state: 'ok' },
      { sha: 'fff000', path: 'libs/d', state: 'conflict' },
    ])
    expect(
      parseGitmodules(
        'submodule.lib.path libs/lib\nsubmodule.lib.url https://example.com/lib.git\n',
      ),
    ).toEqual(new Map([['lib', { path: 'libs/lib', url: 'https://example.com/lib.git' }]]))
  })

  it('lists a submodule, uninitialised after cloning, then updates it', async () => {
    const library = await repo()
    const project = await repo()
    // Local file:// submodules need this since git 2.38 (a security default).
    await project.git('-c', 'protocol.file.allow=always', 'submodule', 'add', library.path, 'lib')
    await project.commit('add lib')
    expect(await getSubmodules(project.path)).toMatchObject([
      { name: 'lib', path: 'lib', url: library.path, state: 'ok' },
    ])

    // A fresh clone has the submodule declared but not checked out.
    const clone = await repo()
    await clone.git('remote', 'add', 'origin', project.path)
    await clone.git('fetch', '-q', 'origin')
    await clone.git('reset', '-q', '--hard', 'origin/main')
    expect((await getSubmodules(clone.path))[0]?.state).toBe('uninitialized')

    process.env.GIT_CONFIG_COUNT = '1'
    process.env.GIT_CONFIG_KEY_0 = 'protocol.file.allow'
    process.env.GIT_CONFIG_VALUE_0 = 'always'
    try {
      await updateSubmodules(clone.path)
    } finally {
      delete process.env.GIT_CONFIG_COUNT
      delete process.env.GIT_CONFIG_KEY_0
      delete process.env.GIT_CONFIG_VALUE_0
    }
    expect((await getSubmodules(clone.path))[0]?.state).toBe('ok')
    // A fresh submodule checkout follows the machine's line-ending setting (CRLF on Windows).
    const readme = await readFile(join(clone.path, 'lib', 'README.md'), 'utf8')
    expect(readme.replace(/\r\n/g, '\n')).toBe('# test\n')
  })

  it('is empty without submodules', async () => {
    expect(await getSubmodules((await repo()).path)).toEqual([])
  })
})

describe('Git LFS', () => {
  it('reads LFS patterns from .gitattributes', () => {
    expect(
      parseLfsPatterns(
        '# assets\n*.psd filter=lfs diff=lfs merge=lfs -text\n*.txt text\nvideos/** filter=lfs\n',
      ),
    ).toEqual(['*.psd', 'videos/**'])
  })

  it('recognises pointer files', () => {
    const oid = 'a'.repeat(64)
    expect(
      parseLfsPointer(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 1234\n`),
    ).toEqual({ oid, size: 1234 })
    expect(parseLfsPointer('hello')).toBeNull()
  })

  it('parses locks', () => {
    expect(
      parseLfsLocks(
        '[{"id":"1","path":"art/logo.psd","owner":{"name":"Ada"},"locked_at":"2026-01-02T03:04:05Z"}]',
      ),
    ).toEqual([
      { id: '1', path: 'art/logo.psd', owner: 'Ada', lockedAt: Date.parse('2026-01-02T03:04:05Z') },
    ])
  })

  it('tracks and untracks patterns when git-lfs is installed', async () => {
    const r = await repo()
    if (!(await getLfsVersion(r.path))) return // git-lfs isn't installed here
    await lfsTrack(r.path, '*.psd')
    expect(await getLfsPatterns(r.path)).toEqual(['*.psd'])
    await lfsUntrack(r.path, '*.psd')
    expect(await getLfsPatterns(r.path)).toEqual([])
  })
})
