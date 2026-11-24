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
