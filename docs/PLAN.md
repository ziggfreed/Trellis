# Trellis: Project Plan

> Status: **Phase 0 complete** (2026-11-24). Next up: Phase 1.

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

## 9. Phase 1 plan (next)

1. `packages/git`: parsers for `status` (porcelain v2 `-z`), `log` (custom format, NUL separated), branches/tags/remotes (`for-each-ref`), stashes, and `diff`/`show`
2. File watcher in main (`@parcel/watcher` on the working tree and `.git`), with a debounced "repo changed" event pushed to the UI
3. Sidebar: real branches, remotes, tags, stashes
4. Commit list (virtualised) + commit details panel
5. Diff viewer (CodeMirror 6, unified and side-by-side)
6. Clone and init repository dialogs
7. TanStack Query for caching repo data per tab
