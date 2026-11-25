# Architecture

This document explains how Trellis is put together. If you are new to Electron, read section 1 first.

## 1. Electron in two minutes

An Electron app runs as several processes:

| Process      | What it is                                                                               | In Trellis                          |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| **Main**     | A Node.js program. Creates windows, can use the file system and run programs like `git`. | `apps/desktop/src/main`             |
| **Renderer** | A Chromium web page showing the UI. For security it has **no** Node.js access.           | `apps/desktop/src/renderer` (React) |
| **Preload**  | A small script that runs before the page loads and can expose a limited API to it.       | `apps/desktop/src/preload`          |

The UI and main process talk by sending messages (IPC = inter-process communication).

## 2. How a request flows

Example: the UI wants the current branch of a repository.

```
React component
  └─ useRepoSummary()                       renderer/src/features/repos/use-repo-summary.ts
       └─ api.invoke('repo:getSummary', path)   renderer/src/lib/api.ts
            └─ window.trellis.invoke(...)       preload/index.ts (checks the channel is allowed)
                 └─ ipcMain handler             main/ipc/handlers.ts (validates input)
                      └─ getHead(path)          packages/git/src/repository.ts
                           └─ runGit([...])     packages/git/src/run-git.ts  → spawns `git`
```

The channel name, argument types and result type are declared once in `src/shared/ipc.ts` (`IpcContract`). TypeScript checks both sides against it, so a typo or a wrong argument fails at compile time.

The main process can also **push events** to the UI (`IpcEvents` in the same file), e.g. `repo:changed` when files change or `operation:progress` during a clone. The UI listens with `api.on(event, listener)`, which returns an unsubscribe function.

### Keeping data fresh

```
file changes on disk
  └─ RepoWatcher (main/services/repo-watcher.ts, @parcel/watcher)
       └─ classifyChange(): working-tree file → "status", .git/refs etc → "all"
            └─ debounced 300 ms → event 'repo:changed' { path, scope }
                 └─ useRepoSync() (renderer) invalidates the TanStack Query cache
                      └─ components on screen refetch automatically
```

The UI tells main which repos to watch (`repo:setWatched`) whenever the open tabs change. If watching fails, data still refreshes when the window regains focus.

## 3. Packages

| Package                                           | Purpose                                                                                                                                                                                          | Depends on                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `packages/git` (`@trellis/git`)                   | Runs `git` and parses its output into typed objects. Pure Node.js, unit tested against real temporary repos.                                                                                     | nothing                                                        |
| `packages/graph-layout` (`@trellis/graph-layout`) | Commit graph lane layout (which column each commit goes in, which lines join them). Pure TypeScript; see the comment at the top of `layout.ts`. It can pin a commit (HEAD) to the leftmost lane. | nothing                                                        |
| `packages/plugin-api` (`@trellis/plugin-api`)     | Plugin manifest format and checks, and the types of the API plugins use. See `docs/PLUGINS.md`.                                                                                                  | nothing                                                        |
| `packages/create-trellis-plugin`                  | The `npm create trellis-plugin` scaffolder and its template.                                                                                                                                     | nothing                                                        |
| `plugins/*`                                       | Built-in plugins (Open on Remote, Conventional Commits), shipped with the app.                                                                                                                   | `@trellis/plugin-api` (types only)                             |
| `apps/desktop` (`@trellis/desktop`)               | The Electron app.                                                                                                                                                                                | `@trellis/git`, `@trellis/graph-layout`, `@trellis/plugin-api` |

`@trellis/git` exposes Node-free types at `@trellis/git/types`, so the renderer can import types like `HeadState` without pulling in Node code.

## 4. State in the UI

- **Settings** (theme, open tabs, recent repos) live in a Zustand store (`features/settings/settings-store.ts`). The main process owns the file on disk (`main/services/settings-store.ts`). The UI updates its copy immediately and sends the change to be saved.
- **Tab logic** (open, close, reorder, cycle) is in pure functions (`features/repos/tabs-logic.ts`) with unit tests. `use-repos.ts` connects them to the store.
- **Repo data** (status, history, branches, diffs) is loaded with TanStack Query hooks in `features/repos/use-repo-data.ts`. Query keys start with `['repo', path]`, so one repository's data can be refreshed at once.
- **View state per tab** (History/Changes, selected commit and file) lives in `features/repo-view/repo-view-store.ts`, so switching tabs keeps your place.

### Changing a repository

```
Menu item / toolbar button / palette command
  └─ features/repo-actions/actions.ts   asks for input (dialogs), confirms destructive actions
       └─ runAction() (lib/run-action.ts) shows git's error as a toast, warns about conflicts,
            │                              refreshes the repository's data afterwards
            └─ api.invoke('repo:…')
                 └─ main/ipc/write-handlers.ts  validates arguments
                      └─ runExclusive()          one write at a time per repository
                           └─ packages/git       runs git
```

Long remote operations (fetch, pull, push) are wrapped in `trackOperation`, which gives them an id; main sends `operation:progress` events for that id, shown in the status bar.

Every action is also a command in the **command palette**. Commands come from providers registered with `registerCommands()` (`features/command-palette/registry.ts`); the built-in ones are in `built-in-commands.ts`. Plugins will register their own providers the same way.

### Finding commits: search and filters

The history search box and the Filter popover (author, file or folder, dates, code added or removed) build one `CommitFilter` (`features/history/history-filter.ts`). `findCommits` in `packages/git/src/log.ts` turns it into `git log` options (`--grep`, `--author`, `--since`/`--until`, `-S`, a pathspec) and returns matching hashes. The list keeps showing the full graph and fades commits that don't match, so the graph stays correct.

### Running git: when is a command finished?

`runGit` treats git's `exit` as authoritative, then waits at most 250 ms for remaining output. Waiting for Node's `close` event alone can hang forever: if git leaves a helper process running that inherited its output pipes (e.g. an fsmonitor daemon or background maintenance on Windows), the pipes never close. There is a test for this in `packages/git/test/run-git.test.ts`.

### Credentials

When git or ssh needs to ask the user something (a password, token, SSH passphrase or host key confirmation), it runs the program in `GIT_ASKPASS` / `SSH_ASKPASS`. Trellis points those at a small script that forwards the question over a local socket to the main process, which shows a dialog (`auth:prompt` → `auth:respond`). Details and a diagram are at the top of `main/services/askpass.ts`. Credentials saved in a git credential helper are used without asking.

### Hunk and line staging

The UI asks for a file's diff (`repo:getFilePatch`), the user selects lines, `buildPartialPatch` (`packages/git/src/patch.ts`) builds a smaller patch with just those lines, and main applies it with `git apply --cached` (stage), `--cached --reverse` (unstage) or `--reverse` (discard). The comments in `patch.ts` explain how unselected lines are handled in each direction.

### Undo and redo

Every write handler wraps its git call in `recorded(path, label, worktree, task)` (`main/ipc/write-handlers.ts`), which uses `recordOperation` from `packages/git/src/oplog.ts`:

1. Before the operation, `createSnapshot` saves HEAD, local branches and tags, the index (as a tree) and, if the operation can change files, the working tree (as a tree, via a temporary index). These are ordinary git objects, so unchanged files cost nothing.
2. After it, the new positions of HEAD and the refs are recorded.
3. Undo computes which refs the operation changed, checks nobody changed them since (`planRefChanges`), and restores the snapshot. Redo does the reverse.

The log is `.git/trellis/oplog.json`; the file watcher ignores `.git/trellis/` so writing it doesn't trigger refreshes.

### The file watcher process

`@parcel/watcher` runs in an Electron `utilityProcess` (`main/services/watcher-process.ts`), not in the main process: on Windows, starting to watch a folder blocked the calling thread for seconds. The main process (`repo-watcher.ts`) sends it the list of folders, receives changed paths, classifies and debounces them. When a folder becomes watched, the app refreshes that repository once, in case anything changed while watching was starting.

## 5. Security

- The renderer runs with `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`.
- The preload exposes only `window.trellis.invoke`, restricted to the channels in `IPC_CHANNELS`.
- IPC handlers validate their arguments, since they come from the UI. Ref names may not start with `-`, so they can never be read as git options.
- The askpass socket only answers clients that present a random token generated at start-up.
- A Content Security Policy in `index.html` only allows the app's own scripts.
- External links open in the system browser, and in-app navigation is blocked.
- Secrets (the AI key, plugin tokens) are encrypted with Electron's `safeStorage` (the OS keychain) in `services/secret-store.ts`, and never sent to the UI process.

## 6. Running git

`runGit` (packages/git/src/run-git.ts) is the single place git is started. It:

- uses the git installed on the user's `PATH` (Trellis requires git ≥ 2.34),
- forces English output (`LC_ALL=C`) so output can be parsed,
- disables terminal prompts (`GIT_TERMINAL_PROMPT=0`) so git never hangs waiting for input nobody can see,
- supports cancellation via `AbortSignal`,
- reports every command to `onGitCommand` listeners (this will power the "git command log" panel).

## 7. Plugins

Plugins work like VS Code extensions: trusted code the user chooses to install. A plugin is a package with a manifest (`package.json` with a `trellis` section declaring commands, menu items and settings) and an `activate(trellis, context)` function. Plugins run in a separate **plugin host** process (an Electron `utilityProcess`), so a slow or crashing plugin can't freeze the UI. Main runs their git commands through the same per-repo queue as the app, and relays their prompts to the window.

The authoring guide, API reference and a map of the implementation are in [`docs/PLUGINS.md`](PLUGINS.md).

Built-in plugins live in the root `plugins/` folder: Open on Remote, Conventional Commits and GitHub (pull requests panel, CI badges in the graph).

## 7a. AI

AI features are built in (not a plugin), off by default, and use the user's own key. Everything runs in the main process, in `src/main/ai/`:

| File            | Role                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `ai-ipc.ts`     | The `ai:*` IPC channels: key status, save key, run a task (streamed back as `ai:chunk` events), cancel. |
| `ai-service.ts` | Checks AI is on, gathers the repository data a task needs (staged diff, `git show`, conflicted file).   |
| `prompts.ts`    | The instructions for each task (pure, unit-tested), size limits, and parsing the conflict answer.       |
| `providers.ts`  | Anthropic (official SDK) and OpenAI-compatible services (fetch + `sse.ts`), with plain-word errors.     |

The UI side is `renderer/src/features/ai/`: Settings > AI, the answer dialog, and the Suggest / Explain / Ask AI buttons, which only appear when AI is turned on. Nothing is sent to a service until the user clicks one of them. Inputs over about 200,000 characters are cut down and the user is told; a conflicted file that large is refused rather than resolved from part of it.

## 8. Build & release

Releases, code signing and auto-update (`src/main/services/updater.ts`) are described in [`docs/RELEASING.md`](RELEASING.md). Accessibility is checked automatically by `e2e/accessibility.spec.ts` (axe-core); keep it passing when changing colours or markup.

- `electron-vite` builds main, preload and renderer into `apps/desktop/out/`.
- The only native module is `@parcel/watcher`. Its per-platform binaries are listed in the app's `optionalDependencies` so electron-builder packages them (see the comment in `electron-builder.yml`).
- `electron-builder` (`apps/desktop/electron-builder.yml`) packages `out/` into installers: NSIS (Windows), DMG (macOS), AppImage and deb (Linux).
- GitHub Actions (`.github/workflows/ci.yml`) runs lint, type checks, unit and end-to-end tests on all three OSes for every PR, and builds installers on every push to `main` (downloadable from the workflow run's artifacts).
