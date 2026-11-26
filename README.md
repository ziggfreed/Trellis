# Trellis

A fast, good-looking, open-source git client with **multiple repositories in tabs**, a **visual commit graph** and a **plugin system**. Built with Electron, React, TypeScript, Tailwind CSS and shadcn/ui. Runs on Windows, macOS and Linux.

> **Status: early development.** Everyday git work (v0.1) plus power features (undo, interactive rebase, a conflict editor, blame, worktrees and workspaces), plugins, a GitHub integration, optional AI and automatic updates. v1.0 is close. New here? Read the [user guide on the wiki](https://github.com/ziggfreed/Trellis/wiki). See the [roadmap](docs/PLAN.md#5-phased-roadmap) and [changelog](CHANGELOG.md).

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
- **Undo and redo** for operations made in Trellis
- **Interactive rebase**, a **conflict editor**, **blame**, **file history** and **compare**
- **Drag branches** onto branches or commits to merge, rebase or move them
- **Worktrees**, **workspaces** and a dashboard of all your repositories; background fetch
- **Custom keyboard shortcuts**; open the repository in your terminal or editor
- Live refresh when files change; light, dark and system themes
- **Plugins:** commands, right-click menu items, status bar items, sidebar panels, commit badges and settings, installed from npm or a folder. Three come built in: GitHub, Open on Remote and Conventional Commits. [Write your own](docs/PLUGINS.md)
- **GitHub:** pull requests in the sidebar, CI results on commits, this branch's pull request in the status bar
- **Optional AI** with your own key (Anthropic, OpenAI-compatible or a local model): commit message suggestions, commit explanations and conflict help. Off until you turn it on

Planned: GitLab/Bitbucket integrations and more. See [docs/FEATURES.md](docs/FEATURES.md).

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
- [User guide](https://github.com/ziggfreed/Trellis/wiki) (the wiki; its pages live in [docs/wiki](docs/wiki)): how to use Trellis
- [Architecture](docs/ARCHITECTURE.md): how the code is organised and why
- [Plan & roadmap](docs/PLAN.md)
- [Features & ideas](docs/FEATURES.md)
- [Market research](docs/RESEARCH.md)
- [Releasing](docs/RELEASING.md): making a release, code signing and auto-update (maintainers)

## License

[MIT](LICENSE)
