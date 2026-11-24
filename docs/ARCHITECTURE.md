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

## 3. Packages

| Package                             | Purpose                                                                                                      | Depends on     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| `packages/git` (`@trellis/git`)     | Runs `git` and parses its output into typed objects. Pure Node.js, unit tested against real temporary repos. | nothing        |
| `apps/desktop` (`@trellis/desktop`) | The Electron app.                                                                                            | `@trellis/git` |

Planned: `packages/graph-layout` (commit graph lane algorithm), `packages/plugin-api` (types for plugin authors).

`@trellis/git` exposes Node-free types at `@trellis/git/types`, so the renderer can import types like `HeadState` without pulling in Node code.

## 4. State in the UI

- **Settings** (theme, open tabs, recent repos) live in a Zustand store (`features/settings/settings-store.ts`). The main process owns the file on disk (`main/services/settings-store.ts`). The UI updates its copy immediately and sends the change to be saved.
- **Tab logic** (open, close, reorder, cycle) is in pure functions (`features/repos/tabs-logic.ts`) with unit tests. `use-repos.ts` connects them to the store.
- **Repo data** (branch etc.) is fetched per repo and refreshed when the window regains focus. In Phase 1 a file watcher replaces this, and TanStack Query takes over caching once there is more data.

## 5. Security

- The renderer runs with `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`.
- The preload exposes only `window.trellis.invoke`, restricted to the channels in `IPC_CHANNELS`.
- IPC handlers validate their arguments, since they come from the UI.
- A Content Security Policy in `index.html` only allows the app's own scripts.
- External links open in the system browser, and in-app navigation is blocked.

## 6. Running git

`runGit` (packages/git/src/run-git.ts) is the single place git is started. It:

- uses the git installed on the user's `PATH` (Trellis requires git ≥ 2.34),
- forces English output (`LC_ALL=C`) so output can be parsed,
- disables terminal prompts (`GIT_TERMINAL_PROMPT=0`) so git never hangs waiting for input nobody can see,
- supports cancellation via `AbortSignal`,
- reports every command to `onGitCommand` listeners (this will power the "git command log" panel).

## 7. Plugins (planned, Phase 5)

Plugins will work like VS Code extensions: trusted code that the user chooses to install. A plugin is a package with a manifest (`package.json` with a `contributes` section) and an `activate(context)` function. It runs in a separate extension-host process (Electron `utilityProcess`) so a slow plugin can't freeze the UI, and gets a typed API for commands, menus, panels, git and events. Details will be in `docs/PLUGINS.md` when that phase starts.

## 8. Build & release

- `electron-vite` builds main, preload and renderer into `apps/desktop/out/`.
- `electron-builder` (`apps/desktop/electron-builder.yml`) packages `out/` into installers: NSIS (Windows), DMG (macOS), AppImage and deb (Linux).
- GitHub Actions (`.github/workflows/ci.yml`) runs lint, type checks, unit and end-to-end tests on all three OSes for every PR, and builds installers on every push to `main` (downloadable from the workflow run's artifacts).
