import { GitError, runGit } from './run-git'
import type { GitInstallation, GitVersion } from './types'

/**
 * Oldest git version Trellis supports. 2.34 ships with Ubuntu 22.04, which is
 * the oldest common distro we want to support. Features that need a newer git
 * should check `isAtLeast` and hide themselves on older versions.
 */
export const MIN_GIT_VERSION = { major: 2, minor: 34, patch: 0 } as const

/**
 * Parse the output of `git --version`.
 * Handles vendor suffixes such as "2.43.0.windows.1" or "2.39.3 (Apple Git-146)".
 * Returns null if the text doesn't look like a git version.
 */
export function parseGitVersion(output: string): GitVersion | null {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    raw: output.trim(),
  }
}

/** True if `version` is the same as or newer than `min`. */
export function isAtLeast(
  version: Pick<GitVersion, 'major' | 'minor' | 'patch'>,
  min: Pick<GitVersion, 'major' | 'minor' | 'patch'>,
): boolean {
  if (version.major !== min.major) return version.major > min.major
  if (version.minor !== min.minor) return version.minor > min.minor
  return version.patch >= min.patch
}

/** Check whether git is installed and new enough. Used at app start-up. */
export async function checkGitInstallation(): Promise<GitInstallation> {
  try {
    const { stdout } = await runGit(['--version'], { cwd: process.cwd() })
    const version = parseGitVersion(stdout)
    if (!version) return { status: 'not-installed' }
    return isAtLeast(version, MIN_GIT_VERSION)
      ? { status: 'ok', version }
      : { status: 'too-old', version }
  } catch (err) {
    if (err instanceof GitError && err.notInstalled) return { status: 'not-installed' }
    throw err
  }
}
