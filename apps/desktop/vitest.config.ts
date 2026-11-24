// Unit tests for the desktop app (pure logic only; UI flows are covered by
// the Playwright tests in ./e2e). Run with `pnpm test`.
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
