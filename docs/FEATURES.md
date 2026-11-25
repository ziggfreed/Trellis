# Features & Ideas

Priority key: **P0** = MVP (must have) · **P1** = v1.0 · **P2** = later / nice to have · **💡** = idea to explore

Status key: ⬜ not started · 🟨 in progress · ✅ done

---

## 1. Repository management

| Pri | Feature                                                                                      | Status                           |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| P0  | Open a local repo, clone from URL (with progress)                                            | ✅                               |
| P0  | Init a new repo                                                                              | ✅                               |
| P0  | **Repos as tabs** (reorder, close, restore open tabs on launch)                              | ✅                               |
| P0  | Recent repos list and "Repository Manager" home screen                                       | ✅                               |
| P1  | **Workspaces**: named groups of repos (e.g. "Work", "Side projects") with one-click open-all | ✅                               |
| P1  | Scan a folder to discover and import all repos inside it                                     | ✅                               |
| P1  | Dashboard: status of all tracked repos (dirty, ahead/behind, current branch) with bulk fetch | ✅                               |
| P1  | Background auto-fetch (configurable interval)                                                | ✅                               |
| P2  | Tags/labels and favourites for repos                                                         | 🟨 favourites done; labels to do |
| P2  | Split view: two repos side by side                                                           | ⬜                               |

## 2. Commit graph & history

| Pri | Feature                                                                     | Status                                  |
| --- | --------------------------------------------------------------------------- | --------------------------------------- |
| P0  | **Commit graph** with coloured lanes, merges, branch/tag/HEAD/remote badges | ✅                                      |
| P0  | Virtualised list that stays smooth at 100k+ commits (lazy loading)          | ✅ 60 fps at 100k commits               |
| P0  | Commit details panel: message, author, date, parents, changed files, diff   | ✅                                      |
| P1  | Filter graph: by branch, author, path, date range; "current branch only"    | ✅                                      |
| P1  | Search: message, SHA, author, **pickaxe (`-S`/`-G`) content search**        | ✅ (`-S`; regex `-G` to do)             |
| P1  | Collapse/expand merged branches, hide remote branches                       | 🟨 hide remotes ("Local branches") done |
| P1  | Compare any two commits/branches                                            | ✅ Compare dialog, Ctrl/Cmd+click       |
| P2  | Minimap / timeline scrubber for long histories                              | ⬜                                      |
| P2  | Keep the checked-out branch in the leftmost graph lane                      | ✅                                      |
| P2  | Highlight a branch's commits when hovering its badge                        | ✅                                      |
| 💡  | Alternative "branch timeline" view (horizontal, GitKraken/Gource-style)     | ⬜                                      |

## 3. Working copy, staging & committing

| Pri | Feature                                                                          | Status                                                                           |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P0  | File status list (staged / unstaged / untracked / conflicted), tree or flat view | ✅ (flat list)                                                                   |
| P0  | Stage/unstage/discard file                                                       | ✅                                                                               |
| P0  | **Hunk-level and line-level staging** from the diff view                         | ✅                                                                               |
| P0  | Commit, amend, commit message editor with subject-length guide                   | ✅                                                                               |
| P1  | Live auto-refresh via file watcher                                               | ✅                                                                               |
| P1  | Commit templates, co-author picker, Conventional Commits helper                  | 🟨 Conventional Commits helper (built-in plugin); templates and co-authors to do |
| P1  | GPG/SSH commit signing, with verified badges in the graph                        | 🟨 signature shown in commit details; signing setting; graph badges to do        |
| P1  | Respect and display git hooks output (pre-commit failures shown nicely)          | 🟨 hook failures shown in the error toast                                        |
| P2  | Partial discard with confirmation and trash/backup                               | ⬜                                                                               |
| P2  | `.gitignore` editor ("ignore this file / extension / folder")                    | ✅ from a file’s right-click menu                                                |

## 4. Diff viewer

| Pri | Feature                                                                        | Status             |
| --- | ------------------------------------------------------------------------------ | ------------------ |
| P0  | Unified and side-by-side, syntax highlighting                                  | ✅                 |
| P1  | Word-level (intra-line) highlighting, whitespace toggle, context-lines control | 🟨 intra-line done |
| P1  | Image diff (side by side, swipe, onion skin)                                   | ⬜                 |
| P2  | Rendered Markdown diff, JSON-aware diff                                        | ⬜                 |
| P2  | Edit the file directly in the diff                                             | ⬜                 |

## 5. Branches, remotes & syncing

| Pri | Feature                                                                                         | Status                                    |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P0  | Sidebar: local branches, remotes, tags, stashes                                                 | ✅                                        |
| P0  | Create / checkout / rename / delete branch                                                      | ✅                                        |
| P0  | Fetch / pull (merge or rebase) / push, with progress and ahead/behind counts                    | ✅                                        |
| P0  | Merge branch (with conflict detection)                                                          | ✅                                        |
| P0  | Auth: use system git credential helpers + SSH agent; prompt for credentials when needed         | ✅ helpers + askpass prompts (HTTPS, SSH) |
| P1  | **Drag and drop** in the graph: drag branch onto branch to merge/rebase, drag to remote to push | ✅                                        |
| P1  | Cherry-pick, revert, reset (soft/mixed/hard) from context menu                                  | ✅                                        |
| P1  | Stash: save (with message, include untracked), apply/pop/drop, view diff                        | ✅                                        |
| P1  | Tags: create (annotated/lightweight), push, delete                                              | ✅                                        |
| P1  | Manage remotes (add/edit/remove)                                                                | ✅                                        |
| P1  | Force push with `--force-with-lease` safety by default                                          | ✅                                        |
| P2  | Prune stale branches helper ("delete all branches merged into main")                            | ✅ local branches; one undo               |
| P2  | Git-flow / trunk-based helpers                                                                  | ⬜                                        |

## 6. Advanced git

| Pri | Feature                                                                           | Status |
| --- | --------------------------------------------------------------------------------- | ------ |
| P1  | **Interactive rebase editor**: drag to reorder, squash, fixup, reword, drop, edit | ✅     |
| P1  | **Conflict resolution UI**: ours/theirs/both per hunk, 3-way merge editor         | ✅     |
| P1  | Blame view with "blame prior revision" navigation                                 | ✅     |
| P1  | File history (follows renames)                                                    | ✅     |
| P1  | **Worktrees**: list, create, open as tab, remove                                  | ✅     |
| P2  | Submodules: view status, init/update, open submodule as tab                       | ⬜     |
| P2  | Git LFS: status, lock/unlock                                                      | ⬜     |
| P2  | Bisect assistant (mark good/bad visually)                                         | ⬜     |
| P2  | Reflog browser ("find my lost commit")                                            | ✅     |
| 💡  | Stacked branches (rebase a whole stack at once, `--update-refs`)                  | ⬜     |

## 7. UX & productivity

| Pri | Feature                                                                                | Status                                                     |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P0  | **Command palette** (Ctrl/Cmd+K / Ctrl+Shift+P) for every action                       | ✅                                                         |
| P0  | Dark/light/system themes (shadcn tokens)                                               | ✅                                                         |
| P1  | **Undo / redo** for git operations (backed by reflog and operation log snapshots)      | ✅                                                         |
| P1  | **"Show git command"**: every action logs the exact command it ran, in a console panel | ✅                                                         |
| P1  | Built-in terminal panel (xterm.js) opened at the repo root                             | 🟨 open external terminal done; embedded terminal deferred |
| P1  | Customisable keyboard shortcuts, keyboard-first navigation (j/k in graph)              | ✅                                                         |
| P1  | Toast notifications and an activity/operations panel with cancel                       | 🟨 toasts + status bar progress                            |
| P1  | "Open in…" editor / file manager / terminal integrations                               | ✅                                                         |
| P2  | Custom themes (and themes as plugins)                                                  | ⬜                                                         |
| P2  | Onboarding and in-app "git explained" tooltips for beginners                           | 🟨 git name/email setup, user guide; tooltips to do        |
| P2  | i18n                                                                                   | ⬜                                                         |
| P1  | Accessibility: keyboard navigation, screen reader labels, WCAG AA contrast             | ✅ checked automatically (axe) on the main screens         |
| P1  | Automatic updates (GitHub Releases)                                                    | ✅ macOS needs a signed build to install                   |
| P1  | Signed and notarised installers                                                        | 🟨 release workflow ready; needs certificates              |

## 8. Plugin system

| Pri | Feature                                                                                              | Status                                                  |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| P1  | Plugin manifest (`package.json` with `contributes` section, VS Code-style)                           | ✅                                                      |
| P1  | Plugins run in an isolated **extension host** process with a typed, permission-gated API             | ✅ typed API; no permissions (plugins are trusted)      |
| P1  | Contribution points: commands, context menus (commit/branch/file), toolbar buttons, status bar items | 🟨 commands, menus, status bar, settings; toolbar to do |
| P1  | Custom panels/views (rendered in sandboxed iframes, themed via CSS variables)                        | 🟨 sidebar list panels; iframe views to do              |
| P1  | Events API: `onCommit`, `onCheckout`, `onFetch`, `onRepoOpen`, etc.                                  | ✅ `onDidRunOperation`, active repo, repo changed       |
| P1  | Plugin manager UI: install from folder/URL/npm, enable/disable, permissions view                     | ✅ folder, npm, development folders                     |
| P2  | Graph decorations (badges and colours on commits, e.g. CI status)                                    | ✅ status badges                                        |
| P2  | Commit message providers (AI, templates, ticket IDs)                                                 | 🟨 `setCommitMessage`                                   |
| P2  | Diff renderers (e.g. custom viewer for a file type)                                                  | ⬜                                                      |
| P2  | Plugin marketplace / registry                                                                        | ⬜                                                      |
| P2  | Plugin SDK package + `create-plugin` scaffolder + docs                                               | ✅ docs/PLUGINS.md                                      |

**First-party plugins to build (they also validate the API):**

- GitHub / GitLab / Bitbucket integration (PRs, issues, CI status) (✅ GitHub plugin and Open on Remote are built in; GitLab/Bitbucket to do)
- Secret storage for plugin tokens (✅ `trellis.secrets`)
- AI assistant (commit messages, explain commit, conflict suggestions, PR descriptions) (✅ built into the app instead; PR descriptions to do)
- Jira / Linear ticket linking
- Conventional Commits + changelog generator (✅ Conventional Commits helper is built in)
- Repo stats (contributors, activity heatmap, code churn)

## 9. Integrations (likely shipped as plugins)

| Pri | Feature                                                               | Status                          |
| --- | --------------------------------------------------------------------- | ------------------------------- |
| P2  | Hosting accounts (GitHub/GitLab/Bitbucket/Azure DevOps) via OAuth/PAT | 🟨 GitHub (token or GitHub CLI) |
| P2  | Create/view/checkout PRs, PR review comments inline in diff           | 🟨 view PRs, create via GitHub  |
| P2  | CI status on commits and branches                                     | ✅ GitHub, on commits and PRs   |
| P2  | Clone from account repo list                                          | ⬜                              |

## 10. AI (built in, optional)

| Pri | Feature                                                                                                                           | Status                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P1  | Settings: choose provider, bring your own API key (stored with OS-level encryption), or **disable AI entirely** (hides all AI UI) | ✅ Anthropic or OpenAI-compatible (incl. local models); off by default |
| P1  | Generate commit message from staged changes                                                                                       | ✅                                                                     |
| P2  | Explain a commit / diff                                                                                                           | 🟨 commits                                                             |
| P2  | Suggest conflict resolutions                                                                                                      | ✅                                                                     |
| P2  | Natural-language command bar (shows the git commands before running them)                                                         | ⬜                                                                     |

## 11. 💡 Cool / differentiating ideas

- **Operation log with time travel**: a timeline of every action taken in the app, restorable (GitButler-style oplog).
- **"What will happen?" preview**: before merge/rebase, show a dry-run preview of the resulting graph and any predicted conflicts (`git merge-tree --write-tree`).
- **Natural-language command bar**: "squash my last 3 commits", "undo last push". AI turns it into git commands, shows them, asks for confirmation.
- **Repo health check**: large files, missing `.gitignore` entries, stale branches, secrets committed (with a scan).
- **Multi-repo actions**: run fetch/pull/checkout-branch/command across every repo in a workspace.
- **Activity heatmap and contributor insights** per repo.
- **Commit graph export** as SVG/PNG for docs and presentations.
- **Focus mode**: show only the commits relevant to the current branch versus main.
- **AI agent worktree view**: see several worktrees (e.g. ones AI coding agents are working in) side by side, with their diffs.
- **Snapshots / auto-stash safety net** before any destructive operation.
