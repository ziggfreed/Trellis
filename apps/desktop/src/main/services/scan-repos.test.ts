import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanForRepos } from './scan-repos'

let root: string | undefined
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Make folders under the temp root; a path ending in "/.git" makes a repo marker. */
function tree(...paths: string[]) {
  root = mkdtempSync(join(tmpdir(), 'trellis-scan-'))
  for (const path of paths) {
    if (path.endsWith('.git-file')) {
      const dir = join(root, path.replace(/\/\.git-file$/, ''))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, '.git'), 'gitdir: elsewhere\n')
    } else {
      mkdirSync(join(root, path), { recursive: true })
    }
  }
  return root
}

/** Pretend git accepts every candidate and reports it as its own root. */
const asIs = async (folder: string) => folder

describe('scanForRepos', () => {
  it('finds repositories, without looking inside them or in skipped folders', async () => {
    const dir = tree(
      'app/.git',
      'app/vendor/lib/.git', // inside a repo: not listed
      'work/api/.git',
      'work/site/.git-file', // a worktree (".git" is a file)
      'work/notes', // not a repo
      'node_modules/pkg/.git',
      '.hidden/repo/.git',
    )
    const { repos, truncated } = await scanForRepos(dir, asIs)
    expect(repos.map((r) => r.path)).toEqual(
      [join(dir, 'app'), join(dir, 'work', 'api'), join(dir, 'work', 'site')].sort((a, b) =>
        a.localeCompare(b),
      ),
    )
    expect(repos.map((r) => r.name)).toContain('api')
    expect(truncated).toBe(false)
  })

  it('respects the depth and count limits', async () => {
    const dir = tree('a/b/c/deep/.git', 'one/.git', 'two/.git', 'three/.git')
    expect((await scanForRepos(dir, asIs, { maxDepth: 2 })).repos.map((r) => r.name)).toEqual([
      'one',
      'three',
      'two',
    ])
    const limited = await scanForRepos(dir, asIs, { maxRepos: 2 })
    expect(limited.repos).toHaveLength(2)
    expect(limited.truncated).toBe(true)
  })

  it('uses git’s root path and drops folders git rejects', async () => {
    const dir = tree('good/.git', 'broken/.git')
    const resolve = async (folder: string) =>
      folder.endsWith('broken') ? null : `${folder.replaceAll('\\', '/')}`
    const { repos } = await scanForRepos(dir, resolve)
    expect(repos).toEqual([{ path: join(dir, 'good').replaceAll('\\', '/'), name: 'good' }])
  })
})
