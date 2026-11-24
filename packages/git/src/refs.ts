/**
 * Branches, tags, remotes and stashes.
 */
import { runGit } from './run-git'
import type { Ref, Remote, Stash } from './types'

/**
 * Fields requested from `git for-each-ref`, separated by NUL (%00). Ref names
 * can't contain NUL or newlines, so one ref per line is safe.
 * `*objectname` is the commit an annotated tag points at (empty otherwise).
 */
const REF_FORMAT = [
  '%(refname)',
  '%(objectname)',
  '%(*objectname)',
  '%(HEAD)',
  '%(upstream:short)',
  '%(upstream:track,nobracket)',
].join('%00')

/**
 * Parse the upstream tracking text, e.g. "ahead 2, behind 1", "behind 3" or
 * "gone" (the upstream branch no longer exists).
 */
export function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  return {
    ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    gone: track === 'gone',
  }
}

/** Parse `git for-each-ref --format=<REF_FORMAT>` output. */
export function parseRefs(output: string): Ref[] {
  const refs: Ref[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [fullName = '', sha = '', peeled = '', head = '', upstream = '', track = ''] =
      line.split('\0')

    let type: Ref['type']
    let name: string
    let remote: string | undefined
    if (fullName.startsWith('refs/heads/')) {
      type = 'branch'
      name = fullName.slice('refs/heads/'.length)
    } else if (fullName.startsWith('refs/remotes/')) {
      name = fullName.slice('refs/remotes/'.length)
      // Skip "origin/HEAD", a pointer to the remote's default branch.
      if (name.endsWith('/HEAD')) continue
      type = 'remote-branch'
      remote = name.slice(0, name.indexOf('/'))
    } else if (fullName.startsWith('refs/tags/')) {
      type = 'tag'
      name = fullName.slice('refs/tags/'.length)
    } else {
      continue
    }

    const { ahead, behind, gone } = parseTrack(track)
    refs.push({
      fullName,
      name,
      type,
      sha: peeled || sha,
      isHead: head === '*',
      upstream: upstream || null,
      ahead,
      behind,
      upstreamGone: gone,
      ...(remote ? { remote } : {}),
    })
  }
  return refs
}

/** List all local branches, remote branches and tags, sorted by name. */
export async function getRefs(repoPath: string): Promise<Ref[]> {
  const { stdout } = await runGit(
    ['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags'],
    { cwd: repoPath },
  )
  return parseRefs(stdout)
}

/**
 * Parse `git remote -v` output. Each remote appears twice:
 *   origin  https://github.com/user/repo.git (fetch)
 *   origin  https://github.com/user/repo.git (push)
 */
export function parseRemotes(output: string): Remote[] {
  const remotes = new Map<string, Remote>()
  for (const line of output.split('\n')) {
    const match = /^(\S+)\s+(.+?)\s+\((fetch|push)\)$/.exec(line)
    if (!match) continue
    const [, name, url, kind] = match as unknown as [string, string, string, string]
    const remote = remotes.get(name) ?? { name, fetchUrl: '', pushUrl: '' }
    if (kind === 'fetch') remote.fetchUrl = url
    else remote.pushUrl = url
    remotes.set(name, remote)
  }
  return [...remotes.values()]
}

export async function getRemotes(repoPath: string): Promise<Remote[]> {
  const { stdout } = await runGit(['remote', '-v'], { cwd: repoPath })
  return parseRemotes(stdout)
}

/** Parse `git stash list -z --format=%gd%x1f%H%x1f%ct%x1f%gs`. */
export function parseStashes(output: string): Stash[] {
  return output
    .split('\0')
    .filter((record) => record !== '')
    .map((record, index) => {
      const [name = '', sha = '', time = '0', message = ''] = record.split('\x1f')
      return { index, name, sha, date: Number(time) * 1000, message }
    })
}

/** List stashes, newest first. */
export async function getStashes(repoPath: string): Promise<Stash[]> {
  const { stdout } = await runGit(['stash', 'list', '-z', '--format=%gd%x1f%H%x1f%ct%x1f%gs'], {
    cwd: repoPath,
  })
  return parseStashes(stdout)
}
