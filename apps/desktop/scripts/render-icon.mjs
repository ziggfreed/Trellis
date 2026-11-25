/**
 * Renders build/icon.svg to build/icon.png (1024×1024), which
 * electron-builder turns into the Windows .ico, macOS .icns and Linux icons.
 * Run after changing the SVG:  node scripts/render-icon.mjs
 * (needs Playwright's Chromium: npx playwright install chromium, or set
 * CHROMIUM_PATH to a Chrome/Chromium executable)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'), 'utf8')
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(
  `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`,
)
await page.screenshot({ path: join(buildDir, 'icon.png'), omitBackground: true })
await browser.close()
console.log('Wrote build/icon.png')
