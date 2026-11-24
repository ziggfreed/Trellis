# Trellis

A fast, good-looking, open-source git client with **multiple repositories in tabs**, a **visual commit graph** and a **plugin system**. Built with Electron, React, TypeScript, Tailwind CSS and shadcn/ui. Runs on Windows, macOS and Linux.

> **Status: early development.** Phase 0 (app shell, repo tabs, build/test pipeline) is done. See the [roadmap](docs/PLAN.md#5-phased-roadmap).

## Features

Working now:

- Open repositories as tabs (drag to reorder, restored on restart)
- Recent repositories on the home screen
- Current branch shown for each repo
- Light, dark and system themes
- Keyboard shortcuts: `Ctrl/Cmd+O` open, `Ctrl/Cmd+W` close tab, `Ctrl+Tab` next tab, `Ctrl/Cmd+1-9` jump to tab

Planned: commit graph, staging and committing, branches, merge, rebase, stash, conflict resolution, undo, worktrees, plugins, optional AI (bring your own key, or turn it off). See [docs/FEATURES.md](docs/FEATURES.md).

## Requirements

- [git](https://git-scm.com/downloads) 2.34 or newer on your `PATH`
- To build from source: [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) 10+ (`corepack enable` installs pnpm)

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
