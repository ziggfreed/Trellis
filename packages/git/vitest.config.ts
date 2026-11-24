// Tests here run real git commands. Starting processes is much slower on
// Windows CI machines (several hundred ms each), so allow more time than
// vitest's 5 second default for tests that run a dozen commands.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
