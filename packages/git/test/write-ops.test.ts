import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  abortOperation,
  checkoutBranch,
  checkoutCommit,
  checkoutRemoteBranch,
  cherryPick,
  commit,
  continueOperation,
  createBranch,
  createTag,
  deleteBranch,
  deleteRemoteBranch,
  deleteRemoteTag,
  deleteTag,
  fetch,
  getHead,
  getHeadMessage,
  getLog,
  getRefs,
  getStashes,
  getStatus,
  merge,
  moveBranch,
  pull,
  push,
  pushTag,
  rebase,
  renameBranch,
  reset,
  revert,
  stageFiles,
  stashApply,
  stashDrop,
  stashPop,
  stashPush,
} from '../src'
import { cloneRepository } from '../src'
import { createRepoWithRemote, createTempDir, createTempRepo, type TempRepo } from './helpers'

const cleanups: (TempRepo | string)[] = []
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  for (const item of cleanups.splice(0)) {
    if (typeof item === 'string')
      await rm(item, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    else await item.cleanup()
  }
})
async function repoWithCommit() {
  const repo = await createTempRepo()
  cleanups.push(repo)
  await repo.write('a.txt', 'base\n')
  await repo.commit('base')
  return repo
}
const subjects = async (path: string) =>
  (await getLog(path, { scope: 'head' })).map((c) => c.subject)

/** main and `other` both change a.txt, so merging them conflicts. */
async function conflictingBranches() {
  const repo = await repoWithCommit()
  await repo.git('switch', '-q', '-c', 'other')
  await repo.write('a.txt', 'other\n')
  await repo.commit('other change')
  await repo.git('switch', '-q', 'main')
  await repo.write('a.txt', 'main\n')
  await repo.commit('main change')
  return repo
}

describe('commit', () => {
  it('commits staged changes and keeps lines starting with #', async () => {
    const repo = await repoWithCommit()
    await repo.write('b.txt', 'b')
    await stageFiles(repo.path, ['b.txt'])
    const sha = await commit(repo.path, 'Add b\n\n#123 is fixed by this')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(await getHeadMessage(repo.path)).toBe('Add b\n\n#123 is fixed by this')
  })

  it('amends the last commit', async () => {
    const repo = await repoWithCommit()
    await repo.write('a.txt', 'more\n')
    await stageFiles(repo.path, ['a.txt'])
    await commit(repo.path, 'base, improved', { amend: true })
    expect(await subjects(repo.path)).toEqual(['base, improved'])
  })

  it('refuses an empty message', async () => {
    const repo = await repoWithCommit()
    await expect(commit(repo.path, '   ')).rejects.toThrow('empty')
  })

  it('reports a failing commit hook', async () => {
    const repo = await repoWithCommit()
    const { writeFile, chmod } = await import('node:fs/promises')
    const hook = join(repo.path, '.git', 'hooks', 'pre-commit')
    await writeFile(hook, '#!/bin/sh\necho "lint failed" >&2\nexit 1\n')
    await chmod(hook, 0o755)
    await repo.write('b.txt', 'b')
    await stageFiles(repo.path, ['b.txt'])
    await expect(commit(repo.path, 'blocked')).rejects.toThrow('lint failed')
  })
})

describe('branches', () => {
  it('creates, switches, renames and deletes branches', async () => {
    const repo = await repoWithCommit()
    await createBranch(repo.path, 'feature', { checkout: true })
    expect(await getHead(repo.path)).toMatchObject({ kind: 'branch', name: 'feature' })
    await renameBranch(repo.path, 'feature', 'feature-2')
    await checkoutBranch(repo.path, 'main')
    await deleteBranch(repo.path, 'feature-2')
    expect((await getRefs(repo.path)).map((r) => r.name)).toEqual(['main'])
  })

  it('refuses to delete an unmerged branch unless forced', async () => {
    const repo = await repoWithCommit()
    await createBranch(repo.path, 'wip', { checkout: true })
    await repo.write('w.txt', 'w')
    await repo.commit('unmerged work')
    await checkoutBranch(repo.path, 'main')
    await expect(deleteBranch(repo.path, 'wip')).rejects.toThrow()
    await deleteBranch(repo.path, 'wip', true)
  })

  it('moves a branch to another commit', async () => {
    const repo = await repoWithCommit()
    const base = (await repo.git('rev-parse', 'HEAD')).trim()
    await createBranch(repo.path, 'pointer')
    await repo.write('more.txt', 'x')
    await repo.commit('more')
    const tip = (await repo.git('rev-parse', 'HEAD')).trim()
    expect((await getRefs(repo.path)).find((r) => r.name === 'pointer')?.sha).toBe(base)
    await moveBranch(repo.path, 'pointer', tip)
    expect((await getRefs(repo.path)).find((r) => r.name === 'pointer')?.sha).toBe(tip)
    await expect(moveBranch(repo.path, 'main', base)).rejects.toThrow() // the checked-out branch
  })

  it('checks out a commit as a detached HEAD', async () => {
    const repo = await repoWithCommit()
    const sha = (await repo.git('rev-parse', 'HEAD')).trim()
    await checkoutCommit(repo.path, sha)
    expect(await getHead(repo.path)).toEqual({ kind: 'detached', sha })
  })
})

describe('merge, rebase and conflicts', () => {
  it('merges without conflicts', async () => {
    const repo = await repoWithCommit()
    await createBranch(repo.path, 'feature', { checkout: true })
    await repo.write('f.txt', 'f')
    await repo.commit('feature work')
    await checkoutBranch(repo.path, 'main')
    expect(await merge(repo.path, 'feature', { noFastForward: true })).toEqual({ status: 'done' })
    expect((await getLog(repo.path, { scope: 'head' }))[0]?.parents).toHaveLength(2)
  })

  it('reports conflicts, then aborts the merge', async () => {
    const repo = await conflictingBranches()
    expect(await merge(repo.path, 'other')).toEqual({ status: 'conflicts' })
    expect((await getStatus(repo.path)).operation).toBe('merge')
    await abortOperation(repo.path, 'merge')
    expect((await getStatus(repo.path)).operation).toBeNull()
    expect((await getStatus(repo.path)).files).toEqual([])
  })

  it('continues a merge after the conflict is resolved', async () => {
    const repo = await conflictingBranches()
    await merge(repo.path, 'other')
    await repo.write('a.txt', 'resolved\n')
    await stageFiles(repo.path, ['a.txt'])
    await continueOperation(repo.path, 'merge') // must not open an editor
    expect((await getStatus(repo.path)).operation).toBeNull()
    expect((await getLog(repo.path, { scope: 'head' }))[0]?.parents).toHaveLength(2)
  })

  it('reports rebase conflicts', async () => {
    const repo = await conflictingBranches()
    expect(await rebase(repo.path, 'other')).toEqual({ status: 'conflicts' })
    expect((await getStatus(repo.path)).operation).toBe('rebase')
    await abortOperation(repo.path, 'rebase')
  })

  it('throws real errors instead of reporting conflicts', async () => {
    const repo = await repoWithCommit()
    await expect(merge(repo.path, 'no-such-branch')).rejects.toThrow()
  })
})

describe('cherry-pick, revert, reset', () => {
  it('cherry-picks and reverts commits', async () => {
    const repo = await repoWithCommit()
    await createBranch(repo.path, 'feature', { checkout: true })
    await repo.write('f.txt', 'f')
    await repo.commit('feature work')
    const sha = (await repo.git('rev-parse', 'HEAD')).trim()
    await checkoutBranch(repo.path, 'main')

    expect(await cherryPick(repo.path, sha)).toEqual({ status: 'done' })
    expect(await subjects(repo.path)).toEqual(['feature work', 'base'])
    const picked = (await repo.git('rev-parse', 'HEAD')).trim()
    expect(await revert(repo.path, picked)).toEqual({ status: 'done' })
    expect((await subjects(repo.path))[0]).toBe('Revert "feature work"')
  })

  it('resets soft, mixed and hard', async () => {
    const repo = await repoWithCommit()
    const base = (await repo.git('rev-parse', 'HEAD')).trim()
    await repo.write('a.txt', 'two\n')
    await repo.commit('two')

    await reset(repo.path, base, 'soft')
    expect((await getStatus(repo.path)).files).toEqual([
      { path: 'a.txt', staged: 'modified', unstaged: null },
    ])
    await reset(repo.path, base, 'mixed')
    expect((await getStatus(repo.path)).files).toEqual([
      { path: 'a.txt', staged: null, unstaged: 'modified' },
    ])
    await reset(repo.path, base, 'hard')
    expect((await getStatus(repo.path)).files).toEqual([])
  })
})

describe('stashes', () => {
  it('pushes, applies, pops and drops stashes', async () => {
    const repo = await repoWithCommit()
    expect(await stashPush(repo.path)).toBe(false) // nothing to stash

    await repo.write('a.txt', 'stashed\n')
    await repo.write('new.txt', 'untracked')
    expect(await stashPush(repo.path, { message: 'my stash', includeUntracked: true })).toBe(true)
    expect((await getStatus(repo.path)).files).toEqual([])
    expect((await getStashes(repo.path))[0]?.message).toContain('my stash')

    expect(await stashApply(repo.path, 0)).toEqual({ status: 'done' })
    expect(await getStashes(repo.path)).toHaveLength(1)
    await repo.git('reset', '-q', '--hard')
    await repo.git('clean', '-fq')

    expect(await stashPop(repo.path, 0)).toEqual({ status: 'done' })
    expect(await getStashes(repo.path)).toEqual([])
    expect((await getStatus(repo.path)).files.map((f) => f.path).sort()).toEqual([
      'a.txt',
      'new.txt',
    ])

    await stashPush(repo.path, { includeUntracked: true })
    await stashDrop(repo.path, 0)
    expect(await getStashes(repo.path)).toEqual([])
  })
})

describe('tags', () => {
  it('creates lightweight and annotated tags and deletes them', async () => {
    const repo = await repoWithCommit()
    const sha = (await repo.git('rev-parse', 'HEAD')).trim()
    await createTag(repo.path, 'v1', sha)
    await createTag(repo.path, 'v2', sha, 'Release 2')
    const tags = (await getRefs(repo.path)).filter((r) => r.type === 'tag')
    expect(tags.map((t) => [t.name, t.sha])).toEqual([
      ['v1', sha],
      ['v2', sha],
    ])
    expect((await repo.git('cat-file', '-t', 'v2')).trim()).toBe('tag') // annotated
    await deleteTag(repo.path, 'v1')
    expect((await getRefs(repo.path)).filter((r) => r.type === 'tag')).toHaveLength(1)
  })
})

describe('fetch, pull and push', () => {
  /** A remote, our repo, and a second clone ("teammate") pushing to the same remote. */
  async function team() {
    const { repo, remote } = await createRepoWithRemote()
    const dir = await createTempDir()
    cleanups.push(repo, remote, dir)
    const teammate = join(dir, 'teammate')
    await cloneRepository(remote.path, teammate)
    const { runGit } = await import('../src')
    const tg = (...args: string[]) => runGit(args, { cwd: teammate })
    await tg('config', 'user.name', 'Teammate')
    await tg('config', 'user.email', 'team@example.com')
    return { repo, remote, teammate, tg }
  }

  it('fetches and pulls a teammate’s commit, reporting progress', async () => {
    const { repo, teammate, tg } = await team()
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(teammate, 't.txt'), 't')
    await tg('add', '.')
    await tg('commit', '-qm', 'teammate work')
    await tg('push', '-q')

    await fetch(repo.path, 'origin')
    expect((await getStatus(repo.path)).branch.behind).toBe(1)
    const progress: string[] = []
    expect(await pull(repo.path, { onProgress: (p) => progress.push(p.phase) })).toEqual({
      status: 'done',
    })
    expect((await subjects(repo.path))[0]).toBe('teammate work')
  })

  it('pushes a new branch with upstream, then deletes it on the remote', async () => {
    const { repo } = await team()
    await createBranch(repo.path, 'feature', { checkout: true })
    await repo.write('f.txt', 'f')
    await repo.commit('feature')
    await push(repo.path, { remote: 'origin', branch: 'feature', setUpstream: true })
    expect((await getStatus(repo.path)).branch.upstream).toBe('origin/feature')

    await deleteRemoteBranch(repo.path, 'origin', 'feature')
    await fetch(repo.path, 'all')
    expect((await getRefs(repo.path)).some((r) => r.name === 'origin/feature')).toBe(false)
  })

  it('refuses a non-fast-forward push unless forced with lease', async () => {
    const { repo, tg } = await team()
    await repo.write('mine.txt', 'mine')
    await repo.commit('mine')
    await push(repo.path, { remote: 'origin', branch: 'main' })
    // Rewrite our history so the next push is not a fast-forward.
    await repo.git('commit', '--amend', '-qm', 'mine (amended)')
    await expect(push(repo.path, { remote: 'origin', branch: 'main' })).rejects.toThrow()
    await push(repo.path, { remote: 'origin', branch: 'main', force: true })
    // The teammate can still update from the rewritten history.
    await tg('pull', '-q', '--rebase')
  })

  it('pushes a tag and checks out a remote branch', async () => {
    const { repo, tg } = await team()
    const sha = (await repo.git('rev-parse', 'HEAD')).trim()
    await createTag(repo.path, 'v1', sha)
    await pushTag(repo.path, 'origin', 'v1')
    await tg('fetch', '-q', '--tags')
    // Teammate pushes a branch; we check it out by its remote name.
    await tg('switch', '-qc', 'shared')
    await tg('push', '-q', '-u', 'origin', 'shared')
    await fetch(repo.path, 'origin')
    await checkoutRemoteBranch(repo.path, 'origin/shared', 'shared')
    expect((await getStatus(repo.path)).branch).toMatchObject({
      head: 'shared',
      upstream: 'origin/shared',
    })
  })
})

describe('deleteRemoteTag', () => {
  it('deletes a pushed tag on the remote, and says when there was none', async () => {
    const { repo, remote } = await createRepoWithRemote()
    cleanups.push(repo, remote)
    const sha = (await repo.git('rev-parse', 'HEAD')).trim()
    await createTag(repo.path, 'v1', sha)
    await pushTag(repo.path, 'origin', 'v1')
    expect(await remote.git('tag', '--list')).toContain('v1')

    expect(await deleteRemoteTag(repo.path, 'origin', 'v1')).toBe(true)
    expect((await remote.git('tag', '--list')).trim()).toBe('')
    // Already gone: no error, just false.
    expect(await deleteRemoteTag(repo.path, 'origin', 'v1')).toBe(false)
  })
})
