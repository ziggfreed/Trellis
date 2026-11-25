/**
 * Managing remotes: add, rename, change URL, remove.
 * (Listing them is getRemotes in refs.ts.)
 */
import { runGit } from './run-git'

export { remoteNameProblem } from './remote-names'

export async function addRemote(repoPath: string, name: string, url: string): Promise<void> {
  // "--" stops a URL starting with "-" from being read as an option.
  await runGit(['remote', 'add', '--', name, url], { cwd: repoPath })
}

/** Rename a remote; its remote-tracking branches and upstream settings follow. */
export async function renameRemote(repoPath: string, from: string, to: string): Promise<void> {
  await runGit(['remote', 'rename', '--', from, to], { cwd: repoPath })
}

/** Change where a remote points (both fetch and push, unless push is set separately). */
export async function setRemoteUrl(repoPath: string, name: string, url: string): Promise<void> {
  await runGit(['remote', 'set-url', '--', name, url], { cwd: repoPath })
}

/** Remove a remote and its remote-tracking branches (the remote itself is untouched). */
export async function removeRemote(repoPath: string, name: string): Promise<void> {
  await runGit(['remote', 'remove', '--', name], { cwd: repoPath })
}
