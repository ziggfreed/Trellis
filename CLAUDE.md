# Trellis: notes for AI coding assistants

Read CONTRIBUTING.md and docs/ARCHITECTURE.md before making changes. Key rules:

- Monorepo with pnpm. App in `apps/desktop` (Electron + React + TS + Tailwind v4 + shadcn/ui), git wrapper in `packages/git`.
- The project is open source and the owner wants human contributors to follow the code easily: add a header comment to new files, comment anything complex (explain _why_), and doc-comment exported functions.
- All git access goes through `packages/git` (`runGit`), with tests using real temp repos (`test/helpers.ts`).
- New UI→main calls: add to `IpcContract` + `channelMap` in `src/shared/ipc.ts`, implement in `src/main/ipc/handlers.ts`.
- Put feature logic in pure, unit-tested functions inside `features/<name>/`; keep components thin.
- Use theme tokens (`bg-background`, `text-muted-foreground`, `text-brand`), never hard-coded colours.
- Before finishing: `pnpm lint && pnpm typecheck && pnpm test`, and `xvfb-run -a pnpm test:e2e` on Linux for UI changes.
- Add e2e tests for new user-facing flows, and update `docs/FEATURES.md` statuses.
- Use Conventional Commit messages.
