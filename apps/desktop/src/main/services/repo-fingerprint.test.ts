import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { refsFingerprint } from './repo-fingerprint'

let dir: string | undefined
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

function repo() {
  dir = mkdtempSync(join(tmpdir(), 'trellis-fingerprint-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'T')
  git('config', 'user.email', 't@example.com')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  git('add', '-A')
  git('commit', '-qm', 'first')
  return { path: dir, git }
}

describe('refsFingerprint', () => {
  it('stays the same for working-tree and index changes, and changes with refs', async () => {
    const { path, git } = repo()
    const before = await refsFingerprint(path)
    writeFileSync(join(path, 'a.txt'), 'changed\n')
    git('add', '-A') // the index changes; the status refresh covers that
    expect(await refsFingerprint(path)).toBe(before)

    git('branch', 'feature')
    const withBranch = await refsFingerprint(path)
    expect(withBranch).not.toBe(before)
    git('switch', '-q', 'feature') // HEAD changes
    expect(await refsFingerprint(path)).not.toBe(withBranch)
  })
})
