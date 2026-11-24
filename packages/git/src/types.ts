/**
 * Plain data types returned by @trellis/git.
 *
 * This file must not import anything from Node.js. The UI (which can't use
 * Node) imports these types through `@trellis/git/types`.
 */

export interface GitVersion {
  major: number
  minor: number
  patch: number
  /** Full output, e.g. "git version 2.43.0.windows.1". */
  raw: string
}

export type GitInstallation =
  | { status: 'ok'; version: GitVersion }
  | { status: 'too-old'; version: GitVersion }
  | { status: 'not-installed' }

/** What HEAD points at. */
export type HeadState =
  /** On a branch. `unborn` means the branch has no commits yet (fresh repo). */
  | { kind: 'branch'; name: string; unborn: boolean }
  /** HEAD points directly at a commit, not a branch. */
  | { kind: 'detached'; sha: string }
