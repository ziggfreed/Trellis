# Trellis: Project Plan

> Status: **Phase 3 complete: v0.1.0 ready to release** (2026-11-24). Next up: Phase 4 (power features).

## 1. Goals

- A fast, good-looking, cross-platform (Windows/macOS/**Linux**) git client.
- Multiple repos open as tabs, plus workspaces.
- A best-in-class commit graph that stays smooth on very large repos.
- **Extensible from day one** through a real plugin API. This is our main differentiator.
- No account required. Works offline. Never hides what git is doing.

## 2. Tech stack

| Concern              | Choice                                                                                                                             | Why                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Shell                | **Electron** (latest stable)                                                                                                       | Requested. Proven by GitHub Desktop and VS Code                         |
| Build tooling        | **electron-vite**                                                                                                                  | Fast HMR for main, preload and renderer. Vite ecosystem                 |
| UI                   | **React 19 + TypeScript (strict)**                                                                                                 | Requested                                                               |
| Styling / components | **Tailwind CSS v4 + shadcn/ui** (Radix primitives)                                                                                 | Requested. Themeable via CSS variables, which plugins can reuse         |
| Icons                | lucide-react                                                                                                                       | Comes with shadcn                                                       |
| Client state         | **Zustand**                                                                                                                        | Simple, works outside React (IPC handlers)                              |
| Async/server state   | **TanStack Query**                                                                                                                 | Caching and invalidation of git data per repo                           |
| Big lists            | **TanStack Virtual**                                                                                                               | Graph, file lists                                                       |
| Graph rendering      | Custom: lane layout in a **worker**, drawn with **Canvas/SVG per visible row**                                                     | Performance at 100k+ commits                                            |
| Diff / editor        | **CodeMirror 6** (+ `@codemirror/merge`)                                                                                           | Lighter than Monaco, has a good merge view                              |
| Terminal panel       | xterm.js + node-pty                                                                                                                |                                                                         |
| Git backend          | **System `git` CLI** through a typed wrapper (child_process, `-z`/porcelain formats, streaming), optional bundled git via `dugite` | Full compatibility (hooks, credential helpers, signing, LFS, worktrees) |
| File watching        | `@parcel/watcher`                                                                                                                  | Fast native watcher. Debounced status refresh                           |
| Persistence          | `electron-store` (settings) + **SQLite (better-sqlite3)** for repo index, oplog and caches                                         |                                                                         |
| Secrets              | Electron `safeStorage`                                                                                                             | `keytar` is archived                                                    |
| IPC                  | Typed RPC layer over `contextBridge` (shared TS contract, zod validation)                                                          | Type safety across processes                                            |
| Testing              | **Vitest** (unit), **Playwright for Electron** (e2e), fixture repos built by scripts                                               |                                                                         |
| Lint/format          | ESLint + Prettier (or Biome)                                                                                                       |                                                                         |
| Packaging            | **electron-builder** + auto-update (GitHub Releases)                                                                               |                                                                         |
| CI                   | GitHub Actions: lint, test, build on all 3 OSes                                                                                    |                                                                         |

## 3. Architecture

```
┌──────────────────────────── Renderer (React) ────────────────────────────┐
│  Tabs • Sidebar • Graph • Diff • Staging • Command palette • Plugin UI   │
│  Zustand + TanStack Query  ──►  window.api (typed RPC client)            │
└───────────────────────────────▲──────────────────────────────────────────┘
                                │ contextBridge / IPC (validated)
┌───────────────────────────────┴───────── Main process ────────────────────┐
│  RepoManager (tabs, workspaces)   GitService (per repo, queued commands)  │
│  Watcher   Settings/DB   Credentials   OperationLog (undo)   Updater      │
│  PluginManager ───────────────┐                                           │
└───────────────────────────────┼───────────────────────────────────────────┘
                                │ MessagePort RPC
┌───────────────────────────────▼──────── Extension host (utilityProcess) ──┐
│  Loads plugins • exposes the `@app/plugin-api` • permission-checked calls │
└───────────────────────────────────────────────────────────────────────────┘
        Workers: graph layout, large-log parsing, search indexing
```

Key principles:

- **The renderer never touches Node.** Everything goes through the typed API (`contextIsolation: true`, `sandbox: true`).
- **A per-repo command queue.** Write operations are serialised. Reads can run in parallel. Long operations are cancellable and report progress.
- **Every git invocation is logged** (powers "Show git command" and debugging).
- **Undo** = record HEAD/refs/index snapshot (and auto-stash) before each mutating op in the oplog. Undo restores it.

### Plugin model (summary, detailed spec to follow)

- A plugin is an npm-style package: `package.json` with `engines.app`, `main`, `activationEvents`, `contributes` (commands, menus, views, settings, themes) and `permissions` (e.g. `git:read`, `git:write`, `network`, `fs:repo`).
- Code runs in the **extension host** (an Electron `utilityProcess`), not in the renderer, so a misbehaving plugin can't freeze or compromise the UI.
- UI contributions are mostly **declarative** (menus, commands, status bar). Custom panels render in **sandboxed iframes** that get theme CSS variables and talk over postMessage.
- API surface: `repos`, `git` (high-level + raw `exec` behind permission), `commands`, `ui` (notifications, quick-pick, input box), `events`, `storage`, `settings`.
- We build first-party plugins (GitHub integration, AI commit messages) against the public API to dogfood it.

## 4. Project structure (monorepo, pnpm workspaces)

```
git-client/
  apps/desktop/
    src/main/        # Electron main: services, IPC handlers
    src/preload/     # contextBridge API
    src/renderer/    # React app (features/, components/ui = shadcn)
    src/shared/      # IPC contract, types
  packages/
    git/             # Typed git CLI wrapper + parsers (pure, unit tested)
    graph-layout/    # Lane assignment algorithm (pure, unit tested)
    plugin-api/      # Public types/SDK published for plugin authors
    plugin-host/     # Extension host runtime
  plugins/           # First-party plugins (github, ai-commit, …)
  docs/
```

## 5. Phased roadmap

Each phase ends with something usable.

### Phase 0: Foundations (scaffold)

- Monorepo, electron-vite, React, TS strict, Tailwind v4, shadcn init, ESLint/Prettier, Vitest, Playwright
- Typed IPC layer, secure window defaults, app shell (title bar, tab bar, sidebar, panels layout)
- Theme switching. CI on 3 OSes
- **Done when:** the app launches with an empty tabbed shell, and tests and CI are green

### Phase 1: Core read-only client (MVP-a)

- `packages/git`: status, log, branches, refs, diff, show parsers + tests against fixture repos
- Open/clone/init repo, repo tabs (persisted), recent repos home screen
- Sidebar (branches/remotes/tags/stashes), commit list + details, diff viewer (CodeMirror)
- File watcher → live refresh
- **Done when:** you can browse several repos' history and diffs in tabs

### Phase 2: Commit graph

- Lane layout algorithm in a worker, virtualised canvas rendering, ref badges, colours
- Incremental loading for huge repos (benchmark: 100k commits, e.g. the Linux kernel subset)
- Filters and search (message/author/SHA)
- **Done when:** the graph scrolls at 60fps on a 100k-commit repo

### Phase 3: Everyday write operations (MVP-b, first usable release)

- Stage/unstage/discard (file, hunk, line). Commit/amend
- Branch create/checkout/rename/delete, merge, fetch/pull/push with progress
- Credentials: credential helpers, SSH agent, auth prompts
- Stash, tags, cherry-pick, revert, reset
- Command palette, git command log panel, toasts and operations panel
- **Done when:** the app can replace the CLI for daily work → **v0.1 release**

### Phase 4: Power features

- Undo/redo via oplog
- Interactive rebase editor, conflict resolution UI (3-way merge)
- Blame, file history, compare refs, drag-and-drop in the graph
- Worktrees, workspaces + multi-repo dashboard, auto-fetch
- Integrated terminal, keybinding customisation

### Phase 5: Plugin system

- Extension host, plugin-api package, manifest and permissions, contribution points
- Plugin manager UI, install from folder/npm
- SDK + scaffolder + docs. Example plugins
- **Done when:** a third party could build and install a plugin → **v0.5**

### Phase 6: Integrations & AI (as plugins)

- GitHub/GitLab: accounts, PRs, CI status in the graph
- AI: commit messages, explain commit/diff, conflict help, natural-language commands

### Phase 7: Polish & ship v1.0

- Performance pass, accessibility, onboarding, i18n scaffold
- Signing/notarisation, auto-update, website/docs

## 6. Risks & mitigations

| Risk                                                                | Mitigation                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Electron performance and memory (the GitKraken complaint)           | Workers for heavy work, virtualisation everywhere, stream git output, perf budgets in CI |
| Graph layout complexity on huge or messy histories                  | Pure, heavily tested package. Compare against `git log --graph`. Incremental layout      |
| Cross-platform git quirks (paths, line endings, credential prompts) | CI on all OSes, fixture-repo tests, optional bundled git                                 |
| Plugin security                                                     | Separate process, permission manifest, no Node in renderer, sandboxed iframes            |
| Scope creep                                                         | Phase gates. FEATURES.md priorities drive each phase                                     |

## 7. Decisions

| Topic      | Decision                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Name       | **Trellis**                                                                                                                                  |
| Licence    | Open source, **MIT**                                                                                                                         |
| Git        | **Require git ≥ 2.34 installed** on PATH. The app shows a friendly screen if it's missing. Bundling git into the installer is a later option |
| Platforms  | **Windows first-class** (main dev platform), with macOS and Linux fully supported. CI tests all three                                        |
| Plugins    | **Trusted, VS Code-style.** No permission system                                                                                             |
| AI         | Built in, **bring your own API key**, and can be **turned off completely** in settings. Provider-agnostic interface                          |
| Repo & CI  | GitHub (`ziggfreed/trellis`). GitHub Actions run lint, typecheck, unit and e2e tests on all 3 OSes, and build installers on `main`           |
| Code style | Code must stay clean and easy for contributors: header comments, comments on anything complex, feature-based folders. See CONTRIBUTING.md    |

## 8. Phase 0 delivered

- pnpm monorepo: `apps/desktop` (Electron 45, React 19, TS 6, Tailwind 4, shadcn/ui) and `packages/git`
- Secure window setup (context isolation, sandbox, CSP) and a typed IPC contract
- App shell: repo tabs (open, close, reorder by drag, restore on restart), home screen with recent repos, status bar, light/dark/system theme
- git installation check with a "git missing / too old" screen
- Keyboard shortcuts: open, close tab, next/previous tab, jump to tab N
- Tests: 38 unit tests (Vitest), 4 end-to-end tests (Playwright driving the real app)
- CI on Windows, macOS and Linux, plus installer builds (NSIS, DMG, AppImage, deb)
- Contributor docs: README, CONTRIBUTING, ARCHITECTURE, PR and issue templates

## 9. Phase 1 delivered

- `packages/git`: status (porcelain v2), paged log, branches/tags/remotes, stashes, commit details with line counts, file contents for diffs (commit, staged, unstaged; binary and size limits), clone with progress, init. 65 tests against real repos
- Main → UI events (`repo:changed`, `operation:progress`) alongside the request/response IPC
- File watcher (`@parcel/watcher`) with debouncing and a tested change classifier: edits refresh the Changes view, git operations refresh everything
- TanStack Query for per-repo caching, invalidated by watcher events
- Repository view: resizable sidebar / commit list / details / diff layout, History and Changes views, selection kept per tab
- Sidebar: branches with ahead/behind, remotes grouped by remote, tags (natural version sort), stashes
- Virtualised, infinitely-scrolling commit list with branch/tag badges and keyboard navigation
- CodeMirror 6 diff viewer: unified and side-by-side, syntax highlighting for ~150 languages (loaded on demand), collapsed unchanged regions, theme driven by CSS variables
- Clone dialog with progress and cancel; New repository; Open/Clone/New menu and shortcuts
- 9 end-to-end tests, including live refresh, clone and init

## 10. Phase 2 delivered

- `packages/graph-layout`: incremental lane layout. Validated by replaying the drawn lines over random histories; 100k commits lay out in ~200 ms
- **Decision:** layout runs on the UI thread, not in a Web Worker as first planned. Pages of 500 commits take ~1 ms each, so a worker would add complexity for no visible benefit. Revisit if profiling ever shows otherwise
- `LogReader`: one streaming `git log` per repository instead of `--skip` paging, so deep history stays fast
- Graph column in the history: coloured lanes, merge curves, hollow dots for merges, a ring on HEAD. The column sizes itself to the rows on screen
- Branch filter (all / local / current branch) and search over messages, authors and hashes, with next/previous navigation that loads older history when needed
- `scripts/create-benchmark-repo.mjs` builds large realistic histories; `e2e/performance.spec.ts` measures them

Benchmark (Linux, virtual display, 100,000 commits, 6,228 merges):

| Measure                         | Result                                   |
| ------------------------------- | ---------------------------------------- |
| First commits on screen         | ~260 ms                                  |
| Frame time while scrolling      | 17 ms median and p95 (60 fps)            |
| Scroll to the very first commit | ~11 s (200 pages, mostly test wait time) |

## 11. Phase 3 delivered (v0.1.0)

- `packages/git`: staging (files, hunks, lines via partial patches), commit/amend, branches, merge/rebase/cherry-pick/revert with conflict detection, abort/continue/skip, reset, stashes, tags, fetch/pull/push with progress
- Credentials: an askpass helper forwards git's and ssh's questions (passwords, tokens, passphrases, host keys) to an in-app dialog; saved credential helpers are used first
- Main process: per-repository write queue, git command log, argument validation (ref names can't start with "-")
- UI: Changes view with stage/unstage/discard and a hunk/line view; commit box; toolbar (fetch, pull, push, branch, stash); right-click menus on branches, remote branches, tags, stashes and commits; conflict banner; command palette with a registry ready for plugins; git command log panel
- Release workflow: pushing a `v*` tag builds installers for all three platforms and creates a draft GitHub Release with notes from CHANGELOG.md

## 12. Phase 4 plan (next): power features

1. Undo/redo for git operations (operation log with snapshots)
2. Interactive rebase editor (reorder, squash, fixup, reword, drop)
3. Built-in 3-way conflict resolution
4. Blame and file history; compare branches/commits
5. Drag and drop in the graph (drag a branch onto another to merge/rebase)
6. Worktrees; workspaces and a multi-repo dashboard with auto-fetch
7. Integrated terminal; customisable keyboard shortcuts
8. Syntax highlighting in the hunk view
