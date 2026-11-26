// Takes the screenshots used in the wiki (docs/wiki/images). Not a test
// suite: run it after UI changes that make the pictures out of date.
//
//   pnpm screenshots
//
// On Linux without a display, give the virtual screen room for a 2× window:
//   xvfb-run -a -s "-screen 0 3200x2000x24" pnpm screenshots
//
// Optionally shrink the files afterwards (ImageMagick; a 256-colour palette
// is plenty for UI pictures and halves their size):
//   for f in ../../docs/wiki/images/*.png; do convert "$f" -colors 256 "PNG8:$f"; done
//
// See screenshots/wiki.spec.ts for what's captured and how.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './screenshots',
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'off' },
})
