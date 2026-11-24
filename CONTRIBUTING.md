# Contributing to Trellis

Thanks for helping! This guide explains how to set up the project, how the code is organised, and the standards we keep so that anyone can pick up any part of the codebase.

## Setup

1. Install [Node.js](https://nodejs.org) 22+, [git](https://git-scm.com) 2.34+, and install pnpm with `npm install -g pnpm` (or `corepack enable`, which needs an administrator terminal on Windows).
2. `pnpm install` (this also downloads the Electron binary)
3. `pnpm dev` to run the app.

Recommended editor: VS Code with the extensions suggested in `.vscode/extensions.json` (ESLint, Prettier, Tailwind CSS). Format-on-save is already configured.

## Where things live

```
apps/desktop/                 The Electron app
  src/main/                   Main process (Node.js): windows, IPC handlers, services
  src/preload/                The tiny bridge between UI and main process
  src/shared/                 Types shared by main and UI, incl. the IPC contract
  src/renderer/src/           The React UI
    components/ui/            shadcn/ui components (generated; edit sparingly)
    components/layout/        App chrome: tab bar, status bar
    features/<name>/          Everything for one feature: components, hooks, logic, tests
    hooks/                    Hooks shared across features
    lib/                      Small shared helpers
  e2e/                        End-to-end tests (Playwright)
packages/git/                 Typed wrapper around the git CLI (no Electron/React)
docs/                         Plans, architecture, research
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces talk to each other.

## Code standards

These matter because Trellis is open source: code is read far more often than it is written.

### Clarity first

- **Every file starts with a short comment** saying what it is for, unless that is obvious from a tiny file.
- **Explain the "why", not the "what".** `// git exits 1 here to mean "no changes", not an error` is useful; `// call runGit` is not.
- **Anything complex gets a comment block**: algorithms (e.g. graph layout), parsing of git output, concurrency, security decisions, and workarounds for platform quirks. Include an example of the input/output where it helps.
- **Exported functions get a doc comment** (`/** ... */`) describing what they return and any surprising behaviour.
- Prefer clear names over clever code. Small functions over long ones.

### Structure

- **Group by feature**, not by file type: `features/repos/` holds the repo tab components, hooks, logic and tests together.
- **Keep logic out of components.** Put rules and state changes in plain functions (like `features/repos/tabs-logic.ts`) so they can be unit tested without React.
- **All git access goes through `packages/git`.** The UI never builds git commands. Parse git output there into typed objects.
- **The renderer never touches Node.js.** It asks the main process through the typed IPC contract (see below).

### TypeScript

- Strict mode is on. Avoid `any`; use `unknown` and narrow it.
- Use `import type` for type-only imports (lint enforces this).

### Styling

- Use Tailwind classes and the theme colours (`bg-background`, `text-muted-foreground`, `bg-brand`...). Never hard-code colours, so light and dark themes keep working.
- Use the shadcn/ui components in `components/ui` before writing your own.
- To add a shadcn component: `cd apps/desktop && pnpm dlx shadcn@latest add <name>`.

## Common tasks

### Add an IPC call (UI asks the main process for something)

1. Add the channel and types to `IpcContract` in `apps/desktop/src/shared/ipc.ts`, and to `channelMap` below it.
2. Implement it in `apps/desktop/src/main/ipc/handlers.ts`. TypeScript will error until you do. Validate arguments: they come from the UI.
3. Call it from the UI: `await api.invoke('area:action', ...args)`.

### Add a git operation

1. Add a function to `packages/git/src/` (or a new file, exported from `index.ts`). Use `runGit` and parse the output into a typed result. Put plain result types in `types.ts`.
2. Add tests in `packages/git/test/` using `createTempRepo()` to build a real throwaway repo.
3. Expose it to the UI with an IPC call (above).

### Add an action that changes a repository

1. Add the git operation (above) and an IPC channel; implement the handler in `apps/desktop/src/main/ipc/write-handlers.ts`, wrapped in `runExclusive(path, ...)`.
2. Add a function to `apps/desktop/src/renderer/src/features/repo-actions/actions.ts` that asks for any input with `textDialog`/`confirmDialog` and calls the channel through `runAction`.
3. Expose it where it makes sense: a right-click menu (`repo-actions/menus.tsx`), the toolbar, and the command palette (`command-palette/built-in-commands.ts`).

### Add a command to the command palette

Add an entry to `builtInCommands` in `apps/desktop/src/renderer/src/features/command-palette/built-in-commands.ts`: an `id`, a `title`, a `group`, and a `run` function. To show a list to choose from first (like "Check out branch…"), return a picker from `run`.

## Tests

- **Unit tests** (`pnpm test`): next to the code as `*.test.ts`, or in `packages/git/test/`. Every git function and every piece of pure logic should have tests.
- **End-to-end tests** (`pnpm test:e2e`): in `apps/desktop/e2e/`. They launch the real app. Add one for each new user-facing flow. On Linux without a display, run `xvfb-run -a pnpm test:e2e`.

## Pull requests

1. Create a branch from `main` (e.g. `feature/commit-graph`, `fix/tab-close`).
2. Before pushing, run `pnpm lint && pnpm typecheck && pnpm test`.
3. Open a PR and fill in the template. CI runs lint, type checks and tests on Windows, macOS and Linux; all must pass.
4. Keep PRs focused: one feature or fix each. Update `docs/FEATURES.md` status when you finish a feature.

## Releases

1. Update `version` in `apps/desktop/package.json` and add a section to `CHANGELOG.md`.
2. Merge to `main`, tag the commit (`git tag v0.2.0`) and push the tag.
3. The Release workflow builds installers and creates a draft GitHub Release; review it and publish.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `feat: add stash list`, `fix(git): handle detached HEAD`, `docs: explain IPC`, `test: ...`, `chore: ...`.
