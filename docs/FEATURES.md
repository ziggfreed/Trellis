# Features & Ideas

Priority key: **P0** = MVP (must have) · **P1** = v1.0 · **P2** = later / nice to have · **💡** = idea to explore

Status key: ⬜ not started · 🟨 in progress · ✅ done

---

## 1. Repository management

| Pri | Feature                                                                                      | Status                                    |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P0  | Open a local repo, clone from URL (with progress)                                            | ✅                                        |
| P0  | Init a new repo                                                                              | ✅                                        |
| P0  | **Repos as tabs** (reorder, close, restore open tabs on launch)                              | ✅                                        |
| P0  | Recent repos list and "Repository Manager" home screen                                       | 🟨 recent list done, dashboard is Phase 4 |
| P1  | **Workspaces**: named groups of repos (e.g. "Work", "Side projects") with one-click open-all | ⬜                                        |
| P1  | Scan a folder to discover and import all repos inside it                                     | ⬜                                        |
| P1  | Dashboard: status of all tracked repos (dirty, ahead/behind, current branch) with bulk fetch | ⬜                                        |
| P1  | Background auto-fetch (configurable interval)                                                | ⬜                                        |
| P2  | Tags/labels and favourites for repos                                                         | ⬜                                        |
| P2  | Split view: two repos side by side                                                           | ⬜                                        |

## 2. Commit graph & history

| Pri | Feature                                                                     | Status                                        |
| --- | --------------------------------------------------------------------------- | --------------------------------------------- |
| P0  | **Commit graph** with coloured lanes, merges, branch/tag/HEAD/remote badges | 🟨 ref badges done; lanes in Phase 2          |
| P0  | Virtualised list that stays smooth at 100k+ commits (lazy loading)          | 🟨 list virtualised + paged; graph in Phase 2 |
| P0  | Commit details panel: message, author, date, parents, changed files, diff   | ✅                                            |
| P1  | Filter graph: by branch, author, path, date range; "current branch only"    | ⬜                                            |
| P1  | Search: message, SHA, author, **pickaxe (`-S`/`-G`) content search**        | ⬜                                            |
| P1  | Collapse/expand merged branches, hide remote branches                       | ⬜                                            |
| P1  | Compare any two commits/branches                                            | ⬜                                            |
| P2  | Minimap / timeline scrubber for long histories                              | ⬜                                            |
| P2  | Highlight a branch's commits when hovering its badge                        | ⬜                                            |
| 💡  | Alternative "branch timeline" view (horizontal, GitKraken/Gource-style)     | ⬜                                            |

## 3. Working copy, staging & committing

| Pri | Feature                                                                          | Status         |
| --- | -------------------------------------------------------------------------------- | -------------- |
| P0  | File status list (staged / unstaged / untracked / conflicted), tree or flat view | ✅ (flat list) |
| P0  | Stage/unstage/discard file                                                       | ⬜             |
| P0  | **Hunk-level and line-level staging** from the diff view                         | ⬜             |
| P0  | Commit, amend, commit message editor with subject-length guide                   | ⬜             |
| P1  | Live auto-refresh via file watcher                                               | ✅             |
| P1  | Commit templates, co-author picker, Conventional Commits helper                  | ⬜             |
| P1  | GPG/SSH commit signing, with verified badges in the graph                        | ⬜             |
| P1  | Respect and display git hooks output (pre-commit failures shown nicely)          | ⬜             |
| P2  | Partial discard with confirmation and trash/backup                               | ⬜             |
| P2  | `.gitignore` editor ("ignore this file / extension / folder")                    | ⬜             |

## 4. Diff viewer

| Pri | Feature                                                                        | Status             |
| --- | ------------------------------------------------------------------------------ | ------------------ |
| P0  | Unified and side-by-side, syntax highlighting                                  | ✅                 |
| P1  | Word-level (intra-line) highlighting, whitespace toggle, context-lines control | 🟨 intra-line done |
| P1  | Image diff (side by side, swipe, onion skin)                                   | ⬜                 |
| P2  | Rendered Markdown diff, JSON-aware diff                                        | ⬜                 |
| P2  | Edit the file directly in the diff                                             | ⬜                 |

## 5. Branches, remotes & syncing

| Pri | Feature                                                                                         | Status |
| --- | ----------------------------------------------------------------------------------------------- | ------ |
| P0  | Sidebar: local branches, remotes, tags, stashes                                                 | ✅     |
| P0  | Create / checkout / rename / delete branch                                                      | ⬜     |
| P0  | Fetch / pull (merge or rebase) / push, with progress and ahead/behind counts                    | ⬜     |
| P0  | Merge branch (with conflict detection)                                                          | ⬜     |
| P0  | Auth: use system git credential helpers + SSH agent; prompt for credentials when needed         | ⬜     |
| P1  | **Drag and drop** in the graph: drag branch onto branch to merge/rebase, drag to remote to push | ⬜     |
| P1  | Cherry-pick, revert, reset (soft/mixed/hard) from context menu                                  | ⬜     |
| P1  | Stash: save (with message, include untracked), apply/pop/drop, view diff                        | ⬜     |
| P1  | Tags: create (annotated/lightweight), push, delete                                              | ⬜     |
| P1  | Manage remotes (add/edit/remove)                                                                | ⬜     |
| P1  | Force push with `--force-with-lease` safety by default                                          | ⬜     |
| P2  | Prune stale branches helper ("delete all branches merged into main")                            | ⬜     |
| P2  | Git-flow / trunk-based helpers                                                                  | ⬜     |

## 6. Advanced git

| Pri | Feature                                                                           | Status |
| --- | --------------------------------------------------------------------------------- | ------ |
| P1  | **Interactive rebase editor**: drag to reorder, squash, fixup, reword, drop, edit | ⬜     |
| P1  | **Conflict resolution UI**: ours/theirs/both per hunk, 3-way merge editor         | ⬜     |
| P1  | Blame view with "blame prior revision" navigation                                 | ⬜     |
| P1  | File history (follows renames)                                                    | ⬜     |
| P1  | **Worktrees**: list, create, open as tab, remove                                  | ⬜     |
| P2  | Submodules: view status, init/update, open submodule as tab                       | ⬜     |
| P2  | Git LFS: status, lock/unlock                                                      | ⬜     |
| P2  | Bisect assistant (mark good/bad visually)                                         | ⬜     |
| P2  | Reflog browser ("find my lost commit")                                            | ⬜     |
| 💡  | Stacked branches (rebase a whole stack at once, `--update-refs`)                  | ⬜     |

## 7. UX & productivity

| Pri | Feature                                                                                | Status |
| --- | -------------------------------------------------------------------------------------- | ------ |
| P0  | **Command palette** (Ctrl/Cmd+K / Ctrl+Shift+P) for every action                       | ⬜     |
| P0  | Dark/light/system themes (shadcn tokens)                                               | ✅     |
| P1  | **Undo / redo** for git operations (backed by reflog and operation log snapshots)      | ⬜     |
| P1  | **"Show git command"**: every action logs the exact command it ran, in a console panel | ⬜     |
| P1  | Built-in terminal panel (xterm.js) opened at the repo root                             | ⬜     |
| P1  | Customisable keyboard shortcuts, keyboard-first navigation (j/k in graph)              | ⬜     |
| P1  | Toast notifications and an activity/operations panel with cancel                       | ⬜     |
| P1  | "Open in…" editor / file manager / terminal integrations                               | ⬜     |
| P2  | Custom themes (and themes as plugins)                                                  | ⬜     |
| P2  | Onboarding and in-app "git explained" tooltips for beginners                           | ⬜     |
| P2  | i18n                                                                                   | ⬜     |

## 8. Plugin system

| Pri | Feature                                                                                              | Status |
| --- | ---------------------------------------------------------------------------------------------------- | ------ |
| P1  | Plugin manifest (`package.json` with `contributes` section, VS Code-style)                           | ⬜     |
| P1  | Plugins run in an isolated **extension host** process with a typed, permission-gated API             | ⬜     |
| P1  | Contribution points: commands, context menus (commit/branch/file), toolbar buttons, status bar items | ⬜     |
| P1  | Custom panels/views (rendered in sandboxed iframes, themed via CSS variables)                        | ⬜     |
| P1  | Events API: `onCommit`, `onCheckout`, `onFetch`, `onRepoOpen`, etc.                                  | ⬜     |
| P1  | Plugin manager UI: install from folder/URL/npm, enable/disable, permissions view                     | ⬜     |
| P2  | Graph decorations (badges and colours on commits, e.g. CI status)                                    | ⬜     |
| P2  | Commit message providers (AI, templates, ticket IDs)                                                 | ⬜     |
| P2  | Diff renderers (e.g. custom viewer for a file type)                                                  | ⬜     |
| P2  | Plugin marketplace / registry                                                                        | ⬜     |
| P2  | Plugin SDK package + `create-plugin` scaffolder + docs                                               | ⬜     |

**First-party plugins to build (they also validate the API):**

- GitHub / GitLab / Bitbucket integration (PRs, issues, CI status)
- AI assistant (commit messages, explain commit, conflict suggestions, PR descriptions)
- Jira / Linear ticket linking
- Conventional Commits + changelog generator
- Repo stats (contributors, activity heatmap, code churn)

## 9. Integrations (likely shipped as plugins)

| Pri | Feature                                                               | Status |
| --- | --------------------------------------------------------------------- | ------ |
| P2  | Hosting accounts (GitHub/GitLab/Bitbucket/Azure DevOps) via OAuth/PAT | ⬜     |
| P2  | Create/view/checkout PRs, PR review comments inline in diff           | ⬜     |
| P2  | CI status on commits and branches                                     | ⬜     |
| P2  | Clone from account repo list                                          | ⬜     |

## 10. AI (built in, optional)

| Pri | Feature                                                                                                                           | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P1  | Settings: choose provider, bring your own API key (stored with OS-level encryption), or **disable AI entirely** (hides all AI UI) | ⬜     |
| P1  | Generate commit message from staged changes                                                                                       | ⬜     |
| P2  | Explain a commit / diff                                                                                                           | ⬜     |
| P2  | Suggest conflict resolutions                                                                                                      | ⬜     |
| P2  | Natural-language command bar (shows the git commands before running them)                                                         | ⬜     |

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
