# Changelog

All notable changes to Trellis are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Manage remotes**: add, rename, change the URL of, fetch from and remove remotes from the sidebar.
- **Commit signatures**: commit details show whether a commit is signed (GPG or SSH) and verified; turn on signing for your commits in Settings > General.
- **Find lost commits**: a reflog browser that marks commits on no branch and rescues them onto a new branch.
- **Ignore files** from their right-click menu (the file, its extension or its folder), with an offer to stop tracking files already committed.
- **Delete merged branches** in one go, with one undo to bring them back.
- **Automatic updates**: Trellis checks GitHub for new versions, downloads them in the background and offers **Restart to update**. Turn it off or check now in **Settings > General > Updates**.
- **First-run help**: if git doesn't know your name and email yet, the home screen asks for them (commits need them).
- **Keyboard and screen reader improvements**: repository tabs work with the arrow keys and Delete; better contrast throughout the light theme; the reduce-motion system setting is respected.
- An app icon, and a [user guide](docs/USER_GUIDE.md).
- **Plugins.** Plugins add commands to the command palette, items to the commit, branch and file right-click menus, status bar items and their own settings. They run in a separate process so they can't freeze Trellis. See [docs/PLUGINS.md](docs/PLUGINS.md).
- **Settings > Plugins**: turn plugins on and off, change their settings, install from npm or a folder, uninstall, and load a plugin you're developing straight from its folder.
- Built-in plugins: **Open on Remote** (open a commit, branch, file or the repository on GitHub, GitLab, Bitbucket or Gitea) and **Conventional Commits** (write a conventional commit message step by step; the status bar warns about unpushed commits that don't follow the convention).
- `npm create trellis-plugin` to start a new plugin.
- Settings is split into General, Keyboard shortcuts, AI and Plugins tabs.
- **AI features** (off by default, bring your own key): suggest a commit message from the staged changes, explain a commit, and get help with a merge conflict, including a suggested resolution. Works with Anthropic (Claude) or any OpenAI-compatible service, including local models (Ollama, LM Studio). Turn it on in **Settings > AI**; the key is stored encrypted.
- **GitHub plugin** (built in): sign in with a token or the GitHub CLI, see pull requests in the sidebar with their CI and review state, CI results on commits in the history, and this branch's pull request in the status bar.
- Plugin API: sidebar panels, commit badges in the history graph, encrypted secret storage, operation events (commit, checkout, fetch, push...) and password input boxes. These need Trellis 0.3.0.

### Changed

- Faster start-up: the diff editor now loads when it's first needed.

## [0.2.0] - 2026-11-25

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
- **Compare any two branches, tags or commits**: a Compare… button in the history toolbar (and the palette and right-click menus), or Ctrl/Cmd+click a second commit.
- **History filters**: by author, file or folder, date range, and code added or removed (pickaxe search).
- The checked-out branch is always drawn in the leftmost graph lane.
- Hovering a branch label highlights that branch's commits.
- **Scan a folder** for repositories and add them to a workspace.
- **Favourite** repositories with a star; they appear at the top of the home screen.

### Fixed

- Opening a repository on Windows froze the app for about 5 seconds while the file watcher started.
- Git operations on Windows could hang after git had finished, if a helper process kept git's output open.
- Changes made while a repository was just opening are no longer missed.
- "Stage all changes" in the command palette could do nothing right after a repository opened.
- On macOS, right-clicking near the bottom of the window could instantly run the context-menu item under the pointer.
- On Windows, a mistyped editor command now shows an error instead of silently doing nothing.
- Comparing an older commit with the current branch always showed nothing; it now shows what changed since that commit.

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

[Unreleased]: https://github.com/ziggfreed/trellis/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ziggfreed/trellis/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ziggfreed/trellis/releases/tag/v0.1.0
