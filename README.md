# Trellis

A fast, good-looking, open-source git client with **multiple repositories in tabs**, a **visual commit graph** and a **plugin system**. Built with Electron, React, TypeScript, Tailwind CSS and shadcn/ui. Runs on Windows, macOS and Linux.

> **Status: v0.1.0.** Trellis covers everyday git work. Undo, interactive rebase, a conflict editor and plugins are next. See the [roadmap](docs/PLAN.md#5-phased-roadmap) and [changelog](CHANGELOG.md). See the [roadmap](docs/PLAN.md#5-phased-roadmap).

## Features

Working now:

- **Repositories in tabs:** open, clone or create; tabs come back after a restart
- **History** with a coloured commit graph, branch and tag labels, filters and search; smooth with 100,000+ commits
- **Diffs:** unified or side by side, with syntax highlighting
- **Staging:** whole files, hunks or individual lines; discard changes
- **Commit and amend**
- **Branches:** create, check out, rename, delete, merge, rebase
- **Fetch, pull and push** with progress; safe force push. Asks for passwords, tokens and SSH passphrases when git needs them
- **Cherry-pick, revert, reset, tags and stashes** from right-click menus
- **Conflicts:** a banner with Continue / Skip / Abort while a merge or rebase is in progress
- **Command palette** (`Ctrl/Cmd+K`) and a **git command log** (``Ctrl+` ``) showing every command Trellis runs
- Live refresh when files change; light, dark and system themes

Planned: undo, interactive rebase, a built-in conflict editor, blame, worktrees, workspaces, plugins and optional AI (bring your own key, or turn it off). See [docs/FEATURES.md](docs/FEATURES.md).

## Requirements

- [git](https://git-scm.com/downloads) 2.34 or newer on your `PATH`
- To build from source: [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) 10+ (`npm install -g pnpm`, or `corepack enable` from an administrator terminal on Windows)

## Getting started (development)

```bash
git clone https://github.com/ziggfreed/trellis.git
cd trellis
pnpm install
pnpm dev
```

`pnpm dev` opens the app with hot reload: UI changes appear instantly, and main-process changes restart the app.

| Command          | What it does                                               |
| ---------------- | ---------------------------------------------------------- |
| `pnpm dev`       | Run the app in development mode                            |
| `pnpm test`      | Unit tests (Vitest)                                        |
| `pnpm test:e2e`  | Build the app and run end-to-end tests (Playwright)        |
| `pnpm lint`      | Check code with ESLint (`pnpm lint:fix` to auto-fix)       |
| `pnpm format`    | Format code with Prettier                                  |
| `pnpm typecheck` | Type-check every package                                   |
| `pnpm package`   | Build an installer for your OS into `apps/desktop/release` |

## Documentation

- [Contributing guide](CONTRIBUTING.md): start here if you want to help
- [Architecture](docs/ARCHITECTURE.md): how the code is organised and why
- [Plan & roadmap](docs/PLAN.md)
- [Features & ideas](docs/FEATURES.md)
- [Market research](docs/RESEARCH.md)

## License

[MIT](LICENSE)
