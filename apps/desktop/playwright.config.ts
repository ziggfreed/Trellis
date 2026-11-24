// End-to-end tests: launch the real built app and click through it.
// Run with `pnpm test:e2e` (builds first). On Linux without a display, wrap
// the command in `xvfb-run` (CI does this).
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Electron apps share the single-instance lock, so run one at a time
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'off' },
})
