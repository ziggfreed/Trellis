/**
 * Automated accessibility checks (axe-core) on the main screens, in light
 * and dark themes. They catch problems like missing labels, poor colour
 * contrast and broken ARIA; they can't judge everything, so keyboard and
 * screen reader use still need trying by hand.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { AxeResults } from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

// axe-core is injected with evaluate() rather than @axe-core/playwright,
// which needs to open extra pages (Electron doesn't allow that). evaluate()
// also isn't blocked by the app's Content Security Policy.
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
)

/** Run axe on the page; returns a readable list of problems. */
async function findViolations(window: Page, where: string): Promise<string[]> {
  // Let open/close animations finish: half-faded text fails contrast checks.
  await window.waitForFunction(() => document.getAnimations().length === 0)
  const results = (await window.evaluate(
    `${axeSource}\naxe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })`,
  )) as AxeResults
  const problems = results.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact}): ${v.help}\n    at ${n.target.join(' ')}\n    ${n.failureSummary ?? ''}\n    HTML: ${n.html.slice(0, 300)}`,
    ),
  )
  return problems.map((p) => `[${where}] ${p}`)
}

for (const theme of ['light', 'dark'] as const) {
  test(`main screens have no detectable accessibility problems (${theme})`, async () => {
    const repo = createRepo()
    repo.write('README.md', '# changed\n')
    const { app, window } = await launch()
    const problems: string[] = []
    const check = async (where: string) => problems.push(...(await findViolations(window, where)))
    await window.emulateMedia({ colorScheme: theme })

    await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
    await check('home screen')

    await openRepo(app, window, repo.path)
    await expect(window.getByTestId('commit-row').first()).toBeVisible()
    await window.getByTestId('commit-row').first().click()
    await check('history')
    await window
      .getByRole('button', { name: /README\.md/ })
      .first()
      .click()
    await check('history with a diff')

    await window.getByRole('radio', { name: 'Timeline' }).click()
    await window.getByTestId('timeline-commit').first().click()
    await check('history timeline')
    await window.getByRole('button', { name: 'Timeline branches' }).click()
    await check('timeline branch picker')
    await window.keyboard.press('Escape')
    await window.getByRole('radio', { name: 'Graph' }).click()

    await window.getByRole('tab', { name: /Changes/ }).click()
    await window
      .getByRole('button', { name: /README\.md/ })
      .first()
      .click()
    await check('changes with a diff')

    await window.keyboard.press('Control+`')
    await check('git log panel')
    await window.keyboard.press('Control+`')

    await window.getByRole('button', { name: 'Branch', exact: true }).click()
    await expect(window.getByRole('dialog')).toBeVisible()
    await check('new branch dialog')
    await window.keyboard.press('Escape')

    await window.keyboard.press('ControlOrMeta+,')
    for (const tab of ['General', 'Keyboard shortcuts', 'AI', 'Plugins']) {
      await window.getByRole('tab', { name: tab }).click()
      await check(`settings: ${tab}`)
    }
    await window.keyboard.press('Escape')

    await window.keyboard.press('ControlOrMeta+k')
    await expect(window.getByPlaceholder('Type a command…')).toBeVisible()
    await check('command palette')
    await app.close()
    // Checked at the end, so one run lists every problem on every screen.
    expect(problems, problems.join('\n')).toEqual([])
  })
}
