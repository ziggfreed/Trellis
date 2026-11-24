# Changelog

All notable changes to Trellis are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Undo and redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or the toolbar) for commits, staging, discards, checkouts, merges, rebases, resets, branch and tag changes and pulls. Undo never moves a branch that was changed elsewhere since.
- **Interactive rebase editor**: right-click a commit, then reorder, reword, squash, fix up or drop commits.
- **Conflict editor**: resolve merge conflicts block by block (current, incoming, both, or your own edit), or keep one side of a whole file.
- **Blame** with "blame before this change", **file history** that follows renames, and **compare** a branch or commit with the current branch.
- **Drag and drop** branches onto other branches or commits to merge, rebase, move or compare.
- **Worktrees**: create, open, and remove them from the sidebar.
- **Workspaces** and a home-screen **dashboard** showing each repository's branch, commits to push/pull and changes, with Fetch all.
- **Background fetch** for open repositories (every 10 minutes by default; never asks for passwords).
- **Settings** window (Ctrl/Cmd+,) with **customisable keyboard shortcuts**, editor command, theme and diff layout.
- **Open in terminal** and **open in editor**.
- Syntax highlighting in the hunk view.

### Fixed

- Opening a repository on Windows froze the app for about 5 seconds while the file watcher started.
- Git operations on Windows could hang after git had finished, if a helper process kept git's output open.
- Changes made while a repository was just opening are no longer missed.

## [0.1.0] - 2026-11-24

The first release: Trellis can now replace the git command line for everyday work.

### Added

- **Repositories in tabs:** open, clone (with progress) or create repositories; tabs are restored on restart.
- **History with a commit graph:** coloured branch lanes and merge lines, branch and tag labels, smooth with 100,000+ commits. Filter to all, local or current branch; search by message, author or hash.
- **Commit details and diffs:** unified or side-by-side diffs with syntax highlighting.
- **Staging:** stage, unstage or discard whole files, hunks, or individual lines.
- **Committing:** commit message box with summary length hint; amend the last commit.
- **Branches:** create, check out (including remote branches), rename, delete (local and on the remote), merge, rebase.
- **Remotes:** fetch, pull (merge or rebase) and push with progress; safe force push ("with lease"). Trellis asks for usernames, passwords, tokens and SSH passphrases when git needs them, and uses your saved git credentials otherwise.
- **Commits:** cherry-pick, revert, reset (soft, mixed, hard), create tags, check out any commit.
- **Stashes:** stash (optionally with untracked files), apply, pop and delete.
- **Conflicts:** a banner while a merge, rebase, cherry-pick or revert is in progress, with Continue, Skip and Abort; mark conflicted files as resolved.
- **Command palette** (Ctrl/Cmd+K) and keyboard shortcuts.
- **Git command log** (Ctrl+`): see every git command Trellis runs, and copy it.
- Live refresh when files change, light/dark/system themes.

[Unreleased]: https://github.com/ziggfreed/trellis/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ziggfreed/trellis/releases/tag/v0.1.0
