# Changelog

All notable changes to Trellis are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Delete a tag on the remote too**: the tag's **Delete…** dialog has **Also delete it on origin**. If the remote didn't have the tag, Trellis says so and deletes it locally.
- **Search the sidebar**: a box at the top of the sidebar (`Ctrl/Cmd+Shift+F`, or **Find branches, tags and stashes** in the command palette) filters branches, remote branches, tags, stashes and worktrees as you type, opening folders to show matches and highlighting the matched text. `Enter` shows the first match in the history; `Esc` clears it.

## [0.6.0] - 2026-11-26

### Added

- **Timeline view** of the history: switch between **Graph** and **Timeline** above the history (remembered). Each branch is a horizontal track with its commits placed by date, so you can see when branches started, how long they lived, where they merged and what's happening in parallel.
  - Zoom with Ctrl/Cmd+wheel or the +/− buttons, scroll through time with Shift+wheel, a sideways swipe or by dragging; older history loads as you scroll back.
  - A **minimap** under the tracks shows all loaded history with the visible part boxed: drag it, drag its edges to zoom, or click to jump.
  - **Branches** button: by default local branches and recently active remote ones; tick exactly the branches you want, with search.
  - **Merged branches** shows branches that were merged and deleted, named from their merge commits ("Merge pull request #12 from …").
  - Each track shows how far the branch is ahead of and behind the main branch; branches with no commits for a month are faded and marked **stale**.
  - Click a commit for its details, double-click to check out, right-click for actions; arrow keys move along and between tracks. Search and filters fade non-matching commits, as in the graph.
- **Keep a branch highlighted** in the commit graph: click its label (or choose **Highlight** from the commit's or the sidebar branch's right-click menu) and its line of commits stays highlighted while you scroll. A bar above the list shows which branch; `Esc` or its **✕** clears it.

## [0.5.0] - 2026-11-26

### Changed

- **Branch folders**: branches named with slashes are grouped into folders in the sidebar (`feature/login` and `feature/search` under **feature**), nested as deep as the names go, for local and remote branches. The folder holding the current branch starts open.
- The Changes view lists files by folder, then by name, so each folder's changes are together. In Unstaged, new files still come after changes to existing files, sorted the same way.

### Fixed

- Scrolling the home screen no longer stutters with many repositories. Each row now loads a lighter status (branch and number of changes, not the whole file list), and only a few load at a time instead of dozens of git processes starting at once.

### Added

- **Tips on the home screen**: a card shows one useful feature at a time (a different one each day), with arrows to flip through them and a **Learn more** link. Hide it with its **×**, in **Settings > General**, or from the command palette.
- **Help inside the app**: the **?** button in the status bar opens the [user guide](https://github.com/ziggfreed/Trellis/wiki), and the command palette has **Open the user guide**, **User guide: choose a page…** and **Report a problem or suggest a feature**. Settings > Plugins links to the guide to writing plugins.

### Fixed

- Double-clicking a branch to check it out now responds straight away: a "Switching to …" message shows while git works (a big repository, or a background fetch that's still running, can make that take a few seconds) and changes to "Switched to …" once the branch list shows it. Double-clicking the branch you're already on says so instead of doing nothing.

## [0.4.0] - 2026-11-26

### Fixed

- Very long error messages (for example a failed fetch, which included every "Receiving objects" progress line) no longer grow past the top of the screen: git's progress lines are left out, long messages scroll, and toasts have a close button. Tall dialogs scroll too.

### Added

- **Staged and unstaged in separate lists**: the Changes view shows Staged above Unstaged, each with buttons to stage or unstage, stash and discard the whole list.
- **Select several files** (Ctrl/Cmd+click, Shift+click) to stage, unstage, stash or discard them together, or **drag** them between the two lists.
- **Stash only some files**, so you can commit the rest now.
- **Reuse a recent commit message**: the clock button next to the summary lists your recent messages; take the whole message, or just the summary or description.
- **Discard staged files**: put staged files back to the last commit (undo brings them back).

## [0.3.0] - 2026-11-25

### Added

- **Image diffs**: compare changed images side by side, by swiping between them, or as an onion skin.
- **Bisect assistant**: find the commit that introduced a bug by marking commits good or bad from the history; a banner guides each step and the culprit is marked in the graph.
- **Stacked branches**: see the branches stacked under a branch, rebase the whole stack onto main in one go (one undo reverses it), and push them all.
- **Submodules**: see each submodule's state in the sidebar, set them up after cloning, update them, open one in its own tab, or add a new one.
- **Git LFS**: see which files use LFS (with a warning if git-lfs isn't installed), store a file type with LFS, lock and unlock files, and see real file sizes in diffs of LFS files.
- **Edit in the diff**: change a file right where you review its changes, and save with Ctrl/Cmd+S.
- **Rendered Markdown diffs** and **JSON diffs** that list changed values by path, ignoring formatting and key order.
- **Manage remotes**: add, rename, change the URL of, fetch from and remove remotes from the sidebar.
- **Commit signatures**: commit details show whether a commit is signed (GPG or SSH) and verified; turn on signing for your commits in Settings > General.
- **Find lost commits**: a reflog browser that marks commits on no branch and rescues them onto a new branch.
- **Ignore files** from their right-click menu (the file, its extension or its folder), with an offer to stop tracking files already committed.
- **Clean up branches** in one go, with one undo to bring them back. Pick a target branch (main by default) and Trellis lists branches merged into it, including ones merged with "Squash and merge" or "Rebase and merge" (which git alone can't detect), plus unmerged branches whose remote branch was deleted or that were never pushed. Open it from the broom button on the sidebar's Branches header.
- **Delete merged remote branches** from the clean-up dialog (they start unticked, and Trellis asks first).
- **Panel sizes are remembered** between launches (sidebar, history and changes panels, file history and compare).
- **Commit and push** in one go: tick **Push** next to **Amend**.
- **Side-by-side hunks in the Changes view**, with line and hunk staging still available.
- **History columns**: a new **Changes** column (files and lines changed), plus **Committer** and **Commit date**; choose which columns show from the toolbar or by right-clicking the headers, remembered between launches.
- **Double-click to check out** a remote branch in the sidebar (as a local branch tracking it), a commit in the history (its branch if it has one), or a branch or tag label in the history.
- Branches in the sidebar are marked **local** (never pushed), **gone** (remote branch deleted) or **not tracking** (a remote has the name but the branch doesn't track it).
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

- Maintainers: a **New release** GitHub workflow bumps the version, updates the changelog, tags and builds a draft release in one click (see docs/RELEASING.md).
- Scrollbars match the theme (they were white in dark mode).
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
