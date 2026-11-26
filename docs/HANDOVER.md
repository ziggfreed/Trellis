# Handover: where Trellis is up to

A snapshot for whoever (human or AI assistant) picks up the work next. Last updated 2026-11-25, after PR #14 was merged.

## The project

Trellis is an open-source (MIT) desktop git client: Electron + React + TypeScript + Tailwind v4 + shadcn/ui, in a pnpm monorepo. Windows is the main platform; macOS and Linux are supported too. The owner wants code that contributors can follow: header comments on new files, comments explaining _why_ on anything complex, and doc comments on exported functions (see `CLAUDE.md`).

- Repository: `ziggfreed/Trellis` on GitHub (**public**). Main branch: `main`.
- App version: **0.3.0** (`apps/desktop/package.json`; not released yet; the last release was v0.2.0). `CHANGELOG.md`'s `## [Unreleased]` section lists everything since.

## State right now

- **All work up to PR #14 is merged into `main`.**
- **CI** (`.github/workflows/ci.yml`) runs on every pull request (Windows, macOS and Linux) and by hand from the Actions tab; not on push to `main`, since `main` only changes through pull requests and the pull request run already tests the merge result. CI isn't a required check, so the owner may merge before it finishes. Still verify changes locally (commands below). The "Release" workflow builds Windows, macOS and Linux.
- **Owner's working preferences**:
  - Open a pull request (via `gh api repos/ziggfreed/trellis/pulls`) as soon as a substantial piece of work is finished, without waiting to be asked. Work on a new branch from the latest `main`.
  - Use Conventional Commit messages.
  - Releases: Actions → **New release** opens a `chore(release): vX.Y.Z` pull request (version bump + changelog); merging it tags the release and builds a draft release (`tag-release.yml`). `main` only accepts changes through pull requests (the "Branch cleanliness" ruleset). See `docs/RELEASING.md`.
  - Don't delete remote branches (the environment blocks it anyway; tell the owner which ones can go).

## What's been built (by phase)

The roadmap is `docs/PLAN.md` (sections 8–15 record what each phase delivered).

| Phase / PR | What                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–3        | Scaffold, read-only client, commit graph, everyday write operations (stage/commit/branch/merge/fetch/pull/push…), command palette, git command log                                                                        |
| 4          | Undo/redo, interactive rebase, conflict editor, blame, file history, compare, drag and drop, worktrees, workspaces, background fetch, custom shortcuts                                                                    |
| #5         | Repo management (scan folder, favourites), history filters, compare fixes                                                                                                                                                 |
| 5          | Plugin system: plugin host process, manifest, palette/menu/status-bar contributions, Settings > Plugins, npm/folder install, built-in plugins Open on Remote + Conventional Commits, `create-trellis-plugin`              |
| 6          | Plugin API 0.3 (sidebar panels, commit badges, secrets, operation events), built-in GitHub plugin (PRs, CI badges), built-in AI (bring your own key: Anthropic or OpenAI-compatible; commit messages, explain, conflicts) |
| 7 (#8)     | Onboarding (git name/email), accessibility (axe checks in e2e), auto-update (electron-updater), signing-ready releases, app icon, performance (lazy diff editor), user guide                                              |
| #9         | Manage remotes, commit signatures + signing settings, reflog browser ("find lost commits"), .gitignore helper, delete merged branches                                                                                     |
| #10        | Submodules, Git LFS, editing in the diff, rendered Markdown and JSON diffs                                                                                                                                                |
| #11        | Image diffs (side by side / swipe / onion skin), bisect assistant, stacked branches                                                                                                                                       |
| #13        | Double-click to check out (remote branches, history commits and labels), "local"/"gone" branch markers, clean-up finds squash- and rebase-merged branches                                                                 |
| #14        | Remembered panel sizes and history columns (Changes, Committer, Commit date), commit-and-push, side-by-side hunks in Changes, themed scrollbars, deleting merged remote branches                                          |

## What's left

`docs/FEATURES.md` is the full list with statuses (⬜ not started, 🟨 partly done, ✅ done). Notable remaining items:

- Signature badges in the history graph (only commit details show signatures; checking every row would be slow)
- Commit templates and a co-author picker; nicer display of commit-hook failures
- Whitespace toggle and context-line control in diffs
- Embedded terminal panel; custom themes; i18n; beginner "git explained" tooltips
- GitLab/Bitbucket plugins; checking out PRs and inline review comments; clone from an account's repo list
- AI: explain any diff, PR descriptions, natural-language command bar
- Plugin API: toolbar buttons, iframe panels, custom diff renderers, a plugin registry
- Split view (two repos), minimap, horizontal timeline view, git-flow helpers
- Release blockers outside the code: buying signing certificates (see `docs/RELEASING.md`), publishing `@trellis/plugin-api` and `create-trellis-plugin` to npm, a website

## Files to read to get up to speed

| File                                      | Why                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                               | Rules for AI assistants working on the repo (short; read first)                                       |
| `CONTRIBUTING.md`                         | Repo layout, how to run things, conventions                                                           |
| `docs/ARCHITECTURE.md`                    | How main/preload/renderer fit together, IPC, data freshness, undo, security, plugins, AI              |
| `docs/FEATURES.md`                        | Every feature and its status                                                                          |
| `docs/PLAN.md`                            | Roadmap and what each phase delivered                                                                 |
| `CHANGELOG.md`                            | User-facing changes since v0.2.0 (the Unreleased section)                                             |
| `docs/USER_GUIDE.md`                      | How the app is used, feature by feature                                                               |
| `docs/PLUGINS.md`                         | Plugin authoring guide, API reference, and a map of the plugin internals                              |
| `docs/RELEASING.md`                       | Making a release, code signing secrets, auto-update                                                   |
| `apps/desktop/src/shared/ipc.ts`          | The typed contract of every UI → main call and main → UI event (best single overview of capabilities) |
| `apps/desktop/src/main/ipc/*.ts`          | Handlers: `handlers.ts` (core), `write-handlers.ts`, `tool-handlers.ts`, `content-handlers.ts`        |
| `packages/git/src/index.ts`               | Everything the git layer offers, one module per area                                                  |
| `apps/desktop/src/renderer/src/features/` | UI, one folder per feature                                                                            |
| `apps/desktop/e2e/`                       | End-to-end tests; good executable examples of each feature                                            |

## Checking changes locally

```bash
pnpm install
pnpm lint && pnpm typecheck && npx prettier --check .
pnpm test                                   # unit tests, all packages
cd apps/desktop && npx electron-vite build && xvfb-run -a npx playwright test --trace off   # e2e (Linux)
```

At the last run: all unit tests and all 83 e2e tests passed on Linux. A few e2e tests are timing-sensitive on slow Windows CI runners and have flaked there before; re-running passed them.

Gotchas seen in this environment:

- The sandbox's global git config sets `gpg.ssh.program` to a custom tool; tests that sign with SSH set it back to `ssh-keygen` per repository.
- Local `file://` submodules need `protocol.file.allow=always` (git 2.38+ security default); the tests pass it via `-c` or `GIT_CONFIG_*` env.
- On Windows, fresh checkouts may use CRLF line endings; tests compare with `\r\n` normalised.
