# Trellis user guide

Trellis is a desktop app for working with git repositories. This guide walks through everyday use. For anything not covered here, the **command palette** (`Ctrl+K` on Windows and Linux, `Cmd+K` on macOS) lists every action, so try typing what you want to do.

Shortcuts below use `Ctrl`; on macOS use `Cmd` instead (except where it says `Ctrl` explicitly, such as `Ctrl+Tab`).

## Contents

1. [Getting started](#getting-started)
2. [The repository window](#the-repository-window)
3. [History](#history)
4. [Staging and committing](#staging-and-committing)
5. [Branches, fetching, pulling and pushing](#branches-fetching-pulling-and-pushing)
6. [Merges, rebases and conflicts](#merges-rebases-and-conflicts)
7. [Undo](#undo)
8. [Several repositories](#several-repositories)
9. [Submodules and Git LFS](#submodules-and-git-lfs)
10. [GitHub](#github)
11. [AI features](#ai-features)
12. [Plugins](#plugins)
13. [Settings, shortcuts and updates](#settings-shortcuts-and-updates)
14. [Troubleshooting](#troubleshooting)

## Getting started

Trellis uses the git installed on your computer (version 2.34 or newer). If git is missing, Trellis says so and links to the download.

**Your name and email.** Every commit records who made it. The first time you start Trellis, a card on the home screen asks for your name and email, if git doesn't have them yet. They're saved in git's global settings, so other git tools use them too. To change them later, search the command palette for "Set your git name and email".

**Opening a repository.** From the home screen:

- **Open repository** (`Ctrl+O`): choose a folder that contains a git repository.
- **Clone** (`Ctrl+Shift+O`): copy a repository from a URL, for example from GitHub.
- **New** (`Ctrl+N`): create a new, empty repository.
- **Scan folder…**: find every repository inside a folder (for example your projects folder) and add them all at once.

Each repository opens in its own tab. Tabs come back when you restart Trellis.

## The repository window

- **Sidebar** (left): branches, remotes, worktrees, tags and stashes, plus panels from plugins (such as GitHub's pull requests). Click an item to show its commit; right-click it for actions.
- **History** and **Changes** (top): switch between the commit graph and your uncommitted work.
- **Toolbar** (top right): undo/redo, Fetch, Pull, Push, Branch and Stash.
- **Status bar** (bottom): the current branch and how many commits it is ahead of or behind its upstream, running operations, the **Git log** (`` Ctrl+` ``, which lists every git command Trellis runs), settings and theme.

Drag the dividers between panels to resize them; Trellis remembers the sizes next time.

Trellis watches the repository's files, so changes made in other tools appear straight away.

## History

The history shows every commit as a graph, newest first, with branch and tag labels. It stays fast even with hundreds of thousands of commits.

- **Select** a commit to see its details and changed files. Click a file to see its diff, unified or side by side (switch with the buttons above the diff). For Markdown files, **Rendered** shows the document as it displays, with added blocks in green and removed ones in red. For JSON files, **Data** lists the values that changed, ignoring formatting and key order. Changed **images** are shown as pictures: **Side by side**, **Swipe** (drag the slider to wipe between old and new) or **Onion skin** (fade the new image over the old one, which makes small shifts stand out).
- **Search** (`Ctrl+F`) by message, author or hash; the arrows jump between matches.
- **Filter** to one branch, an author, a file or folder, a date range, or commits that added or removed some text.
- **Compare**: right-click a commit and choose a compare option, or `Ctrl`+click a second commit to compare the two.
- **Blame and file history**: right-click a file and choose **Blame** (who last changed each line) or **File history** (every commit that changed it, following renames).
- **Drag** a branch label onto another branch or a commit to merge, rebase or move it.
- **Columns**: click the columns button in the history toolbar (or right-click the column headers) to choose what's shown: **Changes** (files and lines changed), **Author**, **Date**, **Committer**, **Commit date** and the **Commit** hash. Your choice is remembered.
- **Double-click** a commit to check it out. If a branch points at it, you switch to that branch (a remote branch becomes a local one); otherwise Trellis asks before checking out the bare commit. Double-click a branch label to check out that branch.

## Staging and committing

Open **Changes** (`Ctrl+Shift+G`) to see what you've changed.

1. **Stage** what should go in the commit: a whole file (the + button, or **Stage all**), or select a file and stage single hunks or lines in its diff. Staged files are listed at the top and unstaged ones below.
2. Write a **summary** (the first line, ideally under about 72 characters) and, if useful, a **description**. To reuse an earlier message (handy when several commits belong to one ticket), click the clock button next to the summary: it lists your recent commit messages. Click one to fill in both parts, or use its **Summary** or **Description** button to take just one.
3. Click **Commit** or press `Ctrl+Enter`.

**Working with several files.** The Changes view has two lists: **Staged** (what the next commit will contain) above **Unstaged**. Drag the divider between them to resize them. Each list's header has buttons to stage or unstage, **stash** and **discard** the whole list.

- **Select several files** with Ctrl+click (Cmd+click on a Mac) or Shift+click for a range. The header buttons then act on just the selected files (for example **Stage selected**), and so do a file's own buttons and right-click menu.
- **Drag** files (one, or the selection) from one list to the other to stage or unstage them. Double-clicking a file does the same.
- **Stash** puts files aside for later, staged and unstaged changes alike, and leaves the other files alone. That way you can commit some files and keep the rest for another time. Apply the stash again from the sidebar's **Stashes** section.
- **Discard** in the Unstaged list throws away the unstaged changes. In the Staged list, **Discard staged changes** puts the files back to the last commit, losing their staged and unstaged changes, and files added since then are deleted. Trellis asks first, and undo (Ctrl+Z) brings them back.

**Editing in the diff.** Select a changed file and choose **Edit** above its diff to change it right there; what git has is shown inline so you can see your changes as you go. Press `Ctrl+S` (or **Save**) to save it to disk. **Rendered** and **Data** are also available here for Markdown and JSON files.

Tick **Amend** to replace the last commit instead, for example to fix its message. Tick **Push** to push straight after committing (it stays ticked until you untick it); after amending a commit you'd already pushed, Trellis offers a safe force push.

The Unified / Side-by-side buttons above a file's diff work here too, and you can still select lines and stage, unstage or discard hunks in the side-by-side view. To throw away changes, use the discard button on a file (or **Discard all**), or select lines in its diff and discard just those. Right-click a file for its blame and history, or choose **Ignore** to add the file, every file with its extension, or its folder to `.gitignore`. If matching files are already committed, Trellis offers to stop tracking them (they stay on your computer).

With AI turned on, **Suggest** writes the message from your staged changes (see [AI features](#ai-features)).

## Branches, fetching, pulling and pushing

- **Create a branch**: **Branch** in the toolbar, or right-click a commit and choose **Create branch here…**.
- **Switch branch**: double-click it in the sidebar, or right-click it and choose **Check out**. Double-clicking a remote branch (such as `origin/feature`) switches to a local `feature` branch, creating one that tracks it if needed.
- **Branches not on a remote** are marked in the sidebar: **local** means it was never pushed, **gone** means its remote branch was deleted (often because its pull request was merged), and **not tracking** means a remote has a branch of that name but yours isn't linked to it.
- **Fetch** downloads new commits from remotes without changing your work. Trellis also fetches in the background every 10 minutes (you can change this in Settings).
- **Pull** brings your branch up to date with its upstream.
- **Push** uploads your commits. If the remote has commits you don't, Trellis explains the options; a force push is only ever "with lease", so it can't overwrite work you haven't seen.

When git needs a password, token or SSH passphrase, Trellis asks for it.

**Remotes.** Add one with the **+** next to Remotes in the sidebar (hover over the heading to see it). Right-click a remote to fetch from it, change its URL, rename it or remove it. Removing a remote only makes Trellis forget it; nothing is deleted on the server.

**Stacked branches.** If you build branches on top of each other (say `feature-api`, then `feature-ui` on top of it), search the command palette for "Branch stack", or right-click the top branch and choose **Show stack…**. It lists the branches between it and the base (usually main). **Rebase stack onto main** moves them all at once, keeping each branch's own commits (one undo puts them all back). **Push stack** then pushes them all, safely (force with lease). This needs git 2.38 or newer.

**Cleaning up branches.** Click the broom button on the sidebar's **Branches** header (or search the command palette for "Clean up branches", or right-click a branch and choose **Clean up branches merged into …**). Pick the target branch (main by default) and Trellis checks every local branch:

- **Merged into main**: all its commits are on main. Ticked.
- **Squash- or rebase-merged into main**: its changes are on main, but as different commits, as with GitHub's "Squash and merge" or "Rebase and merge". Git itself calls these unmerged; Trellis compares the changes instead. Ticked.
- **Remote branch deleted, not merged** and **Never pushed, not merged**: shown so you can decide, but not ticked, because they have changes that aren't on main.

Branches still in progress (unmerged and on a remote) aren't listed. Below them, **Remote branches merged into main** lists branches on the server whose work is already on main, such as a feature branch you merged; tick them to delete them from the remote too. These start unticked and Trellis asks first, because deleting a remote branch affects everyone and can't be undone. (You can also delete a single remote branch by right-clicking it under **Remotes** and choosing **Delete on remote…**.) Untick any you want to keep and click **Delete**. main, master, develop and checked-out branches are never offered, remote branches aren't touched, and one undo brings the deleted ones back. Run **Fetch** first so Trellis knows which remote branches were deleted.

**Finding the commit that broke something (bisect).** Right-click a commit that has the bug and choose **Bisect › Start: this commit has the bug**. Then right-click an older commit where it worked and choose **Bisect › Mark good**. Trellis checks out a commit halfway between: test it, then click **Good**, **Bad** or **Skip** in the banner. Each answer halves the range (about 10 steps for 1,000 commits) until the banner names the first bad commit, which is marked in the history. Click **Stop bisecting** to go back to where you were.

## Merges, rebases and conflicts

Right-click a branch to merge it into the current branch or rebase onto it. Right-click a commit and choose **Interactive rebase from here…** to reorder, reword, squash, fix up or drop commits.

If changes conflict, a banner explains what's happening, with **Continue**, **Skip** and **Abort**. Click **Show conflicts**, then a conflicted file:

- For each conflict, choose **Use current**, **Use incoming**, **Use both**, or **Edit** to write the result yourself.
- When every conflict has a choice, click **Save and mark resolved**.
- With AI turned on, **Ask AI** explains the conflict and suggests a resolution you can review and apply.

When all files are resolved, click **Continue** in the banner.

## Undo

`Ctrl+Z` undoes the last thing you did in Trellis (commit, stage, discard, checkout, merge, rebase, reset, branch and tag changes, pull) and `Ctrl+Shift+Z` redoes it. Undo never moves a branch that has changed somewhere else since, so it can't lose other work.

**Finding lost commits.** If a commit seems to have vanished (after a reset, a rebase, or deleting a branch, including ones done outside Trellis), search the command palette for "Find lost commits". It lists everywhere the repository has been, newest first, and marks commits that aren't on any branch. Click **Create branch…** on one to keep it. Git keeps this history for about 90 days.

## Several repositories

- **Favourites**: star a repository on the home screen to keep it at the top.
- **Workspaces**: save your open tabs as a named workspace (the + menu next to the tabs), then reopen them all at once. The home screen shows each repository's branch and changes, with **Fetch all**.
- **Worktrees**: check out another branch in a second folder from the sidebar's Worktrees section, so you can work on two branches at once.

## Submodules and Git LFS

**Submodules** are other repositories kept inside this one at a fixed commit. If a repository has any, a **Submodules** section appears in the sidebar showing each one's state. After cloning, submodules show "Not set up yet": click one (or right-click it and choose **Set up**) to download it. Click a set-up submodule to open it in its own tab. Right-click for **Update all submodules** and **Sync URLs**; add a new one with the **+** on the section, or "Add submodule" in the command palette.

**Git LFS** stores large files (images, videos, builds) on a separate server. It needs [git-lfs](https://git-lfs.com) installed; Trellis warns if a repository uses it and it's missing. A **Git LFS** section in the sidebar lists which files use it. Right-click a file and use **Git LFS** to store all files of that type with LFS, or to lock and unlock it (locking stops others pushing changes to a file that can't be merged, like a .psd). "Git LFS: locked files" in the command palette lists every lock. Diffs of LFS files show the old and new sizes instead of pointer text. Fetching, pulling and pushing LFS files needs nothing extra.

## GitHub

The built-in GitHub plugin adds a **Pull requests** panel to the sidebar for repositories hosted on GitHub.

1. Click **Sign in to GitHub…** in the panel (or search the palette for "GitHub: Sign in").
2. Paste a [personal access token](https://github.com/settings/tokens), or reuse the GitHub CLI's sign-in if you've run `gh auth login`.

You then get:

- the pull requests, with this branch's first, showing their CI and review state
- CI results as small badges on the latest commits in the history
- this branch's pull request in the status bar

Click an item to open it on GitHub. For GitHub Enterprise, set the API address under **Settings > Plugins > GitHub**.

## AI features

AI is off until you turn it on in **Settings > AI**. You use your own account with an AI service:

- **Anthropic** (Claude): paste an API key from the [Anthropic Console](https://console.anthropic.com).
- **OpenAI-compatible**: OpenAI, OpenRouter, or a model running on your own computer with Ollama or LM Studio. Enter the service's address and model name.

Your key is stored encrypted on your computer. Nothing is sent until you click an AI button:

- **Suggest** (commit box): writes a commit message from the staged changes.
- **Explain with AI** (right-click a commit): explains what the commit does.
- **Ask AI** (conflict editor): explains a conflict and suggests a resolved file.

The changes involved are sent to the service you chose. AI can be wrong, so check its answers.

## Plugins

Plugins add commands, menu items, sidebar panels and more. Manage them in **Settings > Plugins**: turn them on or off, change their settings, install new ones from npm or a folder, or remove them. Three come built in: GitHub, Open on Remote, and Conventional Commits.

Plugins can run any code on your computer, so only install ones you trust. To write your own, see [PLUGINS.md](PLUGINS.md).

## Settings, shortcuts and updates

Open Settings with `Ctrl+,`:

- **General**: theme, diff layout, code editor, background fetch, your git name and email, commit signing, and updates.
- **Keyboard shortcuts**: change any shortcut.
- **AI** and **Plugins**: see above.

Default shortcuts:

| Action                    | Shortcut                             |
| ------------------------- | ------------------------------------ |
| Command palette           | `Ctrl+K` (or `Ctrl+Shift+P`)         |
| Open / clone / new        | `Ctrl+O` / `Ctrl+Shift+O` / `Ctrl+N` |
| Close tab                 | `Ctrl+W`                             |
| Next / previous tab       | `Ctrl+Tab` / `Ctrl+Shift+Tab`        |
| Undo / redo               | `Ctrl+Z` / `Ctrl+Shift+Z`            |
| Search commits            | `Ctrl+F`                             |
| History / Changes         | `Ctrl+Shift+H` / `Ctrl+Shift+G`      |
| Commit                    | `Ctrl+Enter` in the commit box       |
| Open in terminal / editor | `Ctrl+Shift+T` / `Ctrl+Shift+E`      |
| Git log                   | `` Ctrl+` ``                         |
| Settings                  | `Ctrl+,`                             |

In the tab bar, the arrow keys move between tabs and `Delete` closes the focused one.

**Commit signing.** To sign your commits, tick **Sign my commits** in Settings > General and choose a GPG key or an SSH key (gpg must be installed for GPG keys). These are git's own settings, so the command line signs too. The commit details show whether a selected commit is signed and whether its signature checks out.

**Updates.** Trellis checks for new versions in the background and downloads them; click **Restart to update** in the status bar when it appears. You can turn this off, or check now, in **Settings > General > Updates**. (On macOS, unsigned builds link to the download instead of installing it.)

## Troubleshooting

- **"Git doesn't know your name and email"**: set them from the home screen card or the command palette.
- **A command failed**: the message shows git's own error. Open the **Git log** (`` Ctrl+` ``) to see exactly which command ran and what it printed.
- **Pushing or pulling asks for a password every time**: set up a [credential manager](https://git-scm.com/doc/credential-helpers) or SSH keys; Trellis uses whatever git is configured with.
- **A plugin misbehaves**: turn it off in Settings > Plugins. Errors are shown under the plugin.
- **Something else**: please [open an issue](https://github.com/ziggfreed/Trellis/issues) with the steps to reproduce it.
