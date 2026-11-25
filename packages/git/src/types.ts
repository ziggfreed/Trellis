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

// ---------------------------------------------------------------------------
// Working tree status (git status)
// ---------------------------------------------------------------------------

/** How a file changed. */
export type ChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  /** File type changed, e.g. a regular file became a symlink. */
  | 'type-changed'
  | 'untracked'
  /** Both sides changed the file in a merge/rebase and it needs resolving. */
  | 'conflicted'

/** One changed file in the working tree. */
export interface FileStatus {
  /** Path relative to the repository root, always with forward slashes. */
  path: string
  /** For renames/copies: the path before the change. */
  origPath?: string
  /** Change staged in the index (what the next commit will contain), or null. */
  staged: ChangeKind | null
  /** Change in the working tree that is NOT staged yet, or null. */
  unstaged: ChangeKind | null
}

/** Branch information from `git status`. */
export interface BranchStatus {
  /** Current branch name, or null when HEAD is detached. */
  head: string | null
  /** Commit HEAD points at, or null in a repo with no commits yet. */
  oid: string | null
  /** Upstream branch such as "origin/main", or null if none is set. */
  upstream: string | null
  /** Commits on this branch that the upstream doesn't have. */
  ahead: number
  /** Commits on the upstream that this branch doesn't have. */
  behind: number
}

/** A multi-step operation that is in progress (usually stopped for conflicts). */
export type RepoOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export interface RepoStatus {
  branch: BranchStatus
  files: FileStatus[]
  /** The merge/rebase/cherry-pick/revert in progress, or null. */
  operation: RepoOperation | null
}

// ---------------------------------------------------------------------------
// History (git log)
// ---------------------------------------------------------------------------

/**
 * Which commits to include in the history:
 * - 'all':   every local branch, remote branch and tag, plus HEAD
 * - 'local': local branches and tags plus HEAD, without remote branches
 * - 'head':  only commits reachable from HEAD (the current branch)
 */
export type LogScope = 'all' | 'local' | 'head'

export interface Commit {
  /** Full 40-character commit hash. */
  sha: string
  /** Parent hashes: none for the first commit, two or more for merges. */
  parents: string[]
  authorName: string
  authorEmail: string
  /** When the change was originally written (Unix time in milliseconds). */
  authorDate: number
  committerName: string
  committerEmail: string
  /** When the commit was created/last rewritten (Unix time in milliseconds). */
  commitDate: number
  /** First line of the commit message. */
  subject: string
  /** Rest of the commit message after the subject (may be empty). */
  body: string
}

// ---------------------------------------------------------------------------
// Branches, tags, remotes and stashes
// ---------------------------------------------------------------------------

export type RefType = 'branch' | 'remote-branch' | 'tag'

export interface Ref {
  /** Full name, e.g. "refs/heads/main" or "refs/remotes/origin/main". */
  fullName: string
  /** Display name, e.g. "main", "origin/main" or "v1.0". */
  name: string
  type: RefType
  /** Commit this ref points at (annotated tags are resolved to their commit). */
  sha: string
  /** For local branches: true if this is the checked-out branch. */
  isHead: boolean
  /** For local branches: upstream such as "origin/main", or null. */
  upstream: string | null
  /** For local branches with an upstream: commits ahead/behind it. */
  ahead: number
  behind: number
  /** True when the upstream branch was deleted on the remote. */
  upstreamGone: boolean
  /** For remote branches: the remote's name, e.g. "origin". */
  remote?: string
}

export interface Remote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface Stash {
  /** Position in the stash list: 0 is the newest (stash@{0}). */
  index: number
  /** Ref name such as "stash@{0}". */
  name: string
  /** Commit hash of the stash entry. */
  sha: string
  /** Message, e.g. "WIP on main: 1a2b3c4 Fix bug". */
  message: string
  /** When the stash was created (Unix time in milliseconds). */
  date: number
}

// ---------------------------------------------------------------------------
// Commit details and file contents
// ---------------------------------------------------------------------------

/** One file changed by a commit. */
export interface ChangedFile {
  path: string
  /** For renames/copies: the old path. */
  oldPath?: string
  change: ChangeKind
  /** Lines added/removed, or null for binary files. */
  additions: number | null
  deletions: number | null
}

export interface CommitDetails {
  commit: Commit
  /**
   * Files changed compared with the first parent (or with nothing, for the
   * first commit). For merges this shows what the merge brought in.
   */
  files: ChangedFile[]
}

/** The contents of one version of a file, for showing diffs. */
export type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; size: number }
  /** The file doesn't exist on this side (added or deleted). */
  | { kind: 'missing' }
  /** Too big to show in the diff viewer. */
  | { kind: 'too-large'; size: number }

/**
 * Which two versions of a file to compare.
 * - `commit`: the file in a commit vs. the same file in its first parent.
 * - `range`: the file at one commit vs. another.
 * - `staged`: HEAD vs. the index (what `git diff --cached` shows).
 * - `unstaged`: the index vs. the working tree (what `git diff` shows).
 */
export type DiffTarget =
  | { kind: 'commit'; sha: string; path: string; oldPath?: string }
  /** The file at commit `from` vs. at commit `to` (used when comparing branches). */
  | { kind: 'range'; from: string; to: string; path: string; oldPath?: string }
  | { kind: 'staged'; path: string; oldPath?: string }
  | { kind: 'unstaged'; path: string }

export interface FileDiffContents {
  old: FileContent
  new: FileContent
}

/** Result of an operation that can stop because of merge conflicts. */
export type MergeResult = { status: 'done' } | { status: 'conflicts' }

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

/** What HEAD pointed at in a snapshot. `ref` is a full name like "refs/heads/main". */
export type SnapshotHead =
  { kind: 'branch'; ref: string; unborn: boolean } | { kind: 'detached'; sha: string }

/** Repository state saved for undo/redo. See snapshot.ts. */
export interface Snapshot {
  time: number
  head: SnapshotHead
  /** Local branches and tags: full ref name -> commit hash. */
  refs: Record<string, string>
  /** The index saved as a tree, or null if it couldn't be (unresolved conflicts). */
  indexTree: string | null
  /** The working tree saved as a tree, or null if not recorded. */
  worktreeTree: string | null
}

/** The undo/redo actions currently available. */
export interface UndoState {
  undo: { label: string; time: number } | null
  redo: { label: string; time: number } | null
}

// ---------------------------------------------------------------------------
// Interactive rebase
// ---------------------------------------------------------------------------

/**
 * What to do with a commit during an interactive rebase:
 * - pick:   keep it as it is
 * - reword: keep it, with a new message
 * - squash: combine it into the commit before it, keeping both messages
 * - fixup:  combine it into the commit before it, keeping only that commit's message
 * - drop:   remove it
 */
export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface RebasePlanItem {
  sha: string
  action: RebaseAction
  /** New message, for 'reword'. */
  message?: string
}

// ---------------------------------------------------------------------------
// File history, blame and compare
// ---------------------------------------------------------------------------

/** One commit in a file's history. */
export interface FileHistoryEntry {
  commit: Commit
  /** The file's path in this commit (it can change through renames). */
  path: string
  /** For renames: the path before this commit. */
  oldPath?: string
  change: ChangeKind
}

export interface BlameLine {
  /** Commit that last changed this line (all zeros if not committed yet). */
  sha: string
  /** Line number in that commit's version of the file. */
  origLine: number
  /** Line number in the version being blamed. */
  line: number
  text: string
}

export interface BlameCommit {
  sha: string
  author: string
  authorEmail: string
  /** Unix time in milliseconds. */
  authorTime: number
  summary: string
  /** The file's path in this commit. */
  filename: string
  /** The commit before this one that touched the file, for "blame previous revision". */
  previous?: { sha: string; path: string }
}

export interface BlameResult {
  lines: BlameLine[]
  commits: Record<string, BlameCommit>
}

export interface Comparison {
  /** Where the two histories split, or null if they share no history. */
  mergeBase: string | null
  /** Commits on the compared ref that the base doesn't have, newest first. */
  commits: Commit[]
  /** How many commits the base has that the compared ref doesn't. */
  behind: number
  /** Files changed since the merge base. */
  files: ChangedFile[]
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

export interface Worktree {
  /** Folder of the worktree (as git reports it, with forward slashes on Windows). */
  path: string
  /** Commit checked out there, or null for a brand-new repository. */
  head: string | null
  /** Branch checked out there, or null if detached. */
  branch: string | null
  /** The original working folder of the repository (listed first by git). */
  isMain: boolean
  bare: boolean
  locked: boolean
  /** The folder no longer exists; `git worktree prune` will forget it. */
  prunable: boolean
}

/**
 * What to look for when filtering history. Every field is optional; a
 * commit must match all the fields that are set.
 */
export interface CommitFilter {
  /**
   * Free text: matches the message, the author, or a commit hash. (If
   * `author` is also set, only the message and hash are searched.)
   */
  text?: string
  /** Author name or email contains this. */
  author?: string
  /** Changed this file or folder (a path from the repository root; `*` wildcards work). */
  path?: string
  /** Committed on or after this day (YYYY-MM-DD). */
  since?: string
  /** Committed on or before this day (YYYY-MM-DD). */
  until?: string
  /** Added or removed this exact text in its changes (git's "pickaxe", `log -S`). */
  content?: string
}
