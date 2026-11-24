/**
 * Test helpers: create throwaway git repositories in the OS temp folder.
 * Each test gets a fresh repo, and `cleanup` deletes it afterwards.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runGit } from '../src'

export interface TempRepo {
  path: string
  git: (...args: string[]) => Promise<string>
  write: (file: string, content: string) => Promise<void>
  /** Stage everything and commit. Returns the new commit SHA. */
  commit: (message: string) => Promise<string>
  cleanup: () => Promise<void>
}

export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'trellis-test-'))
}

export async function createTempRepo(options: { bare?: boolean } = {}): Promise<TempRepo> {
  const path = await createTempDir()
  const git = async (...args: string[]) => (await runGit(args, { cwd: path })).stdout
  await git('init', '--initial-branch=main', ...(options.bare ? ['--bare'] : []))
  // Local identity so commits work on CI machines with no global git config.
  await git('config', 'user.name', 'Trellis Test')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'commit.gpgsign', 'false')

  return {
    path,
    git,
    write: async (file, content) => {
      await mkdir(dirname(join(path, file)), { recursive: true })
      await writeFile(join(path, file), content)
    },
    commit: async (message) => {
      await git('add', '-A')
      await git('commit', '-m', message)
      return (await git('rev-parse', 'HEAD')).trim()
    },
    cleanup: () => rm(path, { recursive: true, force: true }),
  }
}

/**
 * Create a repo with a commit, pushed to a bare "origin" remote, so tests can
 * check remote branches and ahead/behind counts. Clean up both when done.
 */
export async function createRepoWithRemote(): Promise<{ repo: TempRepo; remote: TempRepo }> {
  const remote = await createTempRepo({ bare: true })
  const repo = await createTempRepo()
  await repo.write('README.md', '# test\n')
  await repo.commit('initial commit')
  await repo.git('remote', 'add', 'origin', remote.path)
  await repo.git('push', '-u', 'origin', 'main')
  return { repo, remote }
}

/**
 * Quickly add `count` commits on top of `branch` using `git fast-import`,
 * which writes commits directly instead of running `git commit` each time.
 * Each commit changes file.txt and has the message "commit <n>".
 */
export async function addLinearCommits(repo: TempRepo, count: number, branch = 'main') {
  const lines: string[] = []
  const hasCommits =
    (
      await runGit(['rev-parse', '--verify', '-q', branch], {
        cwd: repo.path,
        okExitCodes: [0, 1, 128],
      })
    ).exitCode === 0
  for (let i = 1; i <= count; i++) {
    const message = `commit ${i}`
    const content = `version ${i}\n`
    lines.push(
      `commit refs/heads/${branch}`,
      `committer Trellis Test <test@example.com> ${1_700_000_000 + i} +0000`,
      `data ${Buffer.byteLength(message)}`,
      message,
      ...(i === 1 && hasCommits ? [`from refs/heads/${branch}^0`] : []),
      `M 100644 inline file.txt`,
      `data ${Buffer.byteLength(content)}`,
      content,
    )
  }
  await runGit(['fast-import', '--quiet'], { cwd: repo.path, stdin: lines.join('\n') + '\n' })
  // fast-import doesn't update the working tree; reset it so status is clean.
  await runGit(['reset', '--hard', '-q'], { cwd: repo.path, okExitCodes: [0, 128] })
}
