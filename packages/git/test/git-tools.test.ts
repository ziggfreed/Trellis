/**
 * Remotes, signatures, the reflog, .gitignore helpers and merged branches.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addRemote,
  addToGitignore,
  findUnreachable,
  getCommitSignature,
  getDefaultBranch,
  getMergedBranches,
  getReflog,
  getRemotes,
  getSigningConfig,
  ignorePattern,
  isTracked,
  trackedIgnoredFiles,
  parseReflog,
  parseSignature,
  remoteNameProblem,
  removeRemote,
  renameRemote,
  setRemoteUrl,
  setSigningConfig,
  untrack,
} from '../src'
import { createTempDir, createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

async function repoWithCommit() {
  repo = await createTempRepo()
  await repo.write('README.md', '# test\n')
  await repo.commit('initial commit')
  return repo
}

describe('remotes', () => {
  it('adds, renames, re-points and removes remotes', async () => {
    const r = await repoWithCommit()
    await addRemote(r.path, 'origin', 'https://example.com/a.git')
    await renameRemote(r.path, 'origin', 'upstream')
    await setRemoteUrl(r.path, 'upstream', 'git@example.com:b.git')
    expect(await getRemotes(r.path)).toEqual([
      { name: 'upstream', fetchUrl: 'git@example.com:b.git', pushUrl: 'git@example.com:b.git' },
    ])
    await removeRemote(r.path, 'upstream')
    expect(await getRemotes(r.path)).toEqual([])
  })

  it('explains bad remote names', () => {
    expect(remoteNameProblem('origin')).toBeNull()
    expect(remoteNameProblem('my fork')).toMatch(/no spaces/)
    expect(remoteNameProblem('-x')).toMatch(/can’t start/)
    expect(remoteNameProblem('')).toMatch(/Enter a name/)
  })
})

describe('signatures', () => {
  it('reads git’s signature letters', () => {
    expect(parseSignature('N\0\0\n')).toEqual({ status: 'none' })
    expect(parseSignature('G\0Ada <ada@example.com>\0ABC123\n')).toEqual({
      status: 'good',
      signer: 'Ada <ada@example.com>',
      key: 'ABC123',
    })
    expect(parseSignature('E\0\0ABC123').status).toBe('unknown')
    expect(parseSignature('B\0x\0y').status).toBe('bad')
    expect(parseSignature('U\0x\0y').status).toBe('untrusted')
  })

  it('reports an unsigned commit', async () => {
    const r = await repoWithCommit()
    const sha = (await r.git('rev-parse', 'HEAD')).trim()
    expect(await getCommitSignature(r.path, sha)).toEqual({ status: 'none' })
  })

  it('saves and reads the global signing settings', async () => {
    const env = { GIT_CONFIG_GLOBAL: join(await createTempDir(), 'gitconfig') }
    expect(await getSigningConfig({ env })).toEqual({
      signCommits: false,
      format: 'openpgp',
      key: '',
    })
    await setSigningConfig(
      { signCommits: true, format: 'ssh', key: '~/.ssh/id_ed25519.pub' },
      { env },
    )
    expect(await getSigningConfig({ env })).toEqual({
      signCommits: true,
      format: 'ssh',
      key: '~/.ssh/id_ed25519.pub',
    })
    await setSigningConfig({ signCommits: false, format: 'openpgp', key: '' }, { env })
    expect((await getSigningConfig({ env })).key).toBe('')
  })
})

describe('reflog', () => {
  it('parses entries', () => {
    const output =
      'abc\x1fHEAD@{0}\x1fcheckout: moving from main to topic\x1f1700000000\x1fSubject\0'
    expect(parseReflog(output)).toEqual([
      {
        sha: 'abc',
        selector: 'HEAD@{0}',
        kind: 'checkout',
        description: 'moving from main to topic',
        date: 1700000000000,
        subject: 'Subject',
      },
    ])
  })

  it('finds a commit lost by a reset', async () => {
    const r = await repoWithCommit()
    await r.write('a.txt', 'a\n')
    const lost = await r.commit('commit that gets lost')
    await r.git('reset', '--hard', 'HEAD~1')

    const entries = await getReflog(r.path)
    expect(entries[0]?.kind).toBe('reset')
    const lostEntry = entries.find((e) => e.sha === lost)
    expect(lostEntry?.subject).toBe('commit that gets lost')

    const unreachable = await findUnreachable(
      r.path,
      entries.map((e) => e.sha),
    )
    expect([...unreachable]).toEqual([lost])
  })

  it('is empty in a repository without commits', async () => {
    repo = await createTempRepo()
    expect(await getReflog(repo.path)).toEqual([])
  })
})

describe('.gitignore', () => {
  it('builds patterns for a file, its extension and its folder', () => {
    expect(ignorePattern('src/debug.log', 'file')).toBe('/src/debug.log')
    expect(ignorePattern('src/debug.log', 'extension')).toBe('*.log')
    expect(ignorePattern('src/debug.log', 'folder')).toBe('/src/')
    expect(ignorePattern('build/', 'folder')).toBe('/build/')
    expect(ignorePattern('.env', 'extension')).toBeNull()
    expect(ignorePattern('top.txt', 'folder')).toBeNull()
    expect(ignorePattern('notes/[draft]*.md', 'file')).toBe('/notes/\\[draft\\]\\*.md')
    expect(ignorePattern('#todo', 'file')).toBe('/#todo')
  })

  it('appends once, keeping the file’s line endings', async () => {
    const r = await repoWithCommit()
    await writeFile(join(r.path, '.gitignore'), 'node_modules\r\ndist')
    expect(await addToGitignore(r.path, '*.log')).toBe(true)
    expect(await addToGitignore(r.path, '*.log')).toBe(false)
    expect(await readFile(join(r.path, '.gitignore'), 'utf8')).toBe(
      'node_modules\r\ndist\r\n*.log\r\n',
    )
  })

  it('untracks a committed file but keeps it on disk', async () => {
    const r = await repoWithCommit()
    await r.write('secret.env', 'x\n')
    await r.commit('add secret')
    expect(await isTracked(r.path, 'secret.env')).toBe(true)
    await addToGitignore(r.path, '*.env')
    expect(await trackedIgnoredFiles(r.path)).toEqual(['secret.env'])
    await untrack(r.path, ['secret.env'])
    expect(await isTracked(r.path, 'secret.env')).toBe(false)
    expect(await readFile(join(r.path, 'secret.env'), 'utf8')).toBe('x\n')
  })
})

describe('merged branches', () => {
  it('lists branches merged into the target, leaving protected and current ones', async () => {
    const r = await repoWithCommit()
    await r.git('branch', 'merged-feature')
    await r.git('branch', 'develop')
    await r.git('switch', '-c', 'unmerged')
    await r.write('b.txt', 'b\n')
    await r.commit('not on main')
    await r.git('switch', 'main')

    expect(await getDefaultBranch(r.path)).toBe('main')
    expect(await getMergedBranches(r.path, 'main')).toEqual(['merged-feature'])
  })
})
