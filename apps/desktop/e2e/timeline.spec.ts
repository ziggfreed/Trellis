/**
 * The history timeline: branches as tracks over time, switching to it,
 * selecting commits, merged branches, the branch picker, stale branches
 * and ahead/behind counts, zooming and the minimap.
 */
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, type TestRepo } from './helpers'

test.afterAll(cleanupTempDirs)

const DAY = 24 * 60 * 60 * 1000

/** Commit all changes with both dates set to `daysAgo` days ago. */
function commitAt(repo: TestRepo, message: string, daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * DAY).toISOString()
  repo.write(`${message.replace(/\W+/g, '-')}.txt`, message)
  repo.git('add', '-A')
  execFileSync('git', ['commit', '-m', message], {
    cwd: repo.path,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

/** Run a git command with both dates set to `daysAgo` days ago (for merges). */
function gitAt(repo: TestRepo, daysAgo: number, ...args: string[]) {
  const date = new Date(Date.now() - daysAgo * DAY).toISOString()
  execFileSync('git', args, {
    cwd: repo.path,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

/**
 * main:     base (20d) - main 2 (15d) - main 3 (10d, tag v1.0) - merge login (5d) - main 5 (1d)
 * login:    from main 2: login 1 (12d), login 2 (8d); merged, then deleted
 * feature:  from main 3: feature 1 (6d), feature 2 (3d)
 * spike:    from base: spike work (45d after base? no: 19d) and left alone
 */
function timelineRepo() {
  const repo = createRepo()
  commitAt(repo, 'base work', 20)
  repo.git('switch', '-c', 'spike')
  commitAt(repo, 'spike work', 19)
  repo.git('switch', 'main')
  commitAt(repo, 'main 2', 15)
  repo.git('switch', '-c', 'login')
  commitAt(repo, 'login 1', 12)
  commitAt(repo, 'login 2', 8)
  repo.git('switch', 'main')
  commitAt(repo, 'main 3', 10)
  repo.git('tag', 'v1.0')
  repo.git('switch', '-c', 'feature')
  commitAt(repo, 'feature 1', 6)
  commitAt(repo, 'feature 2', 3)
  repo.git('switch', 'main')
  gitAt(repo, 5, 'merge', '--no-ff', '-m', "Merge branch 'login'", 'login')
  repo.git('branch', '-d', 'login')
  commitAt(repo, 'main 5', 1)
  return repo
}

/** Open the repository and switch the history to the timeline. */
async function openTimeline(repo: TestRepo) {
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('radio', { name: 'Timeline' }).click()
  await expect(window.getByTestId('timeline')).toBeVisible()
  return { app, window }
}

const trackNames = (window: Page) =>
  window.getByTestId('timeline-track').evaluateAll((els) => els.map((e) => e.textContent ?? ''))

const dot = (window: Page, subject: string) =>
  window.locator(`[data-testid="timeline-commit"][aria-label^="${subject},"]`)

test('shows branches as tracks, with merged branches on request', async () => {
  const repo = timelineRepo()
  const { app, window } = await openTimeline(repo)

  // main first (the main branch, also checked out), then the rest by recent activity.
  await expect(window.getByTestId('timeline-track')).toHaveCount(3)
  const names = await trackNames(window)
  expect(names[0]).toContain('main')
  expect(names[1]).toContain('feature')
  expect(names[2]).toContain('spike')
  // feature is 2 commits ahead of main; main has 4 it doesn't (the merge, login's two, main 5).
  await expect(window.getByTestId('timeline-track').nth(1)).toContainText('↑2 ↓4')

  // Every commit on the shown branches has a dot; login's commits only show
  // once merged branches are turned on.
  await expect(dot(window, 'feature 2')).toBeVisible()
  await expect(dot(window, 'main 5')).toBeVisible()
  await expect(window.getByTestId('timeline-tag')).toContainText('v1.0')
  await expect(dot(window, 'login 1')).toHaveCount(0)

  await window.getByRole('button', { name: 'Merged branches' }).click()
  await expect(dot(window, 'login 1')).toBeVisible()
  // Its row is labelled with its name, next to the track.
  await expect(window.getByTestId('timeline-merged-row')).toContainText('login')
  await expect(window.locator('svg text', { hasText: /^login$/ })).toBeVisible()

  // The choice of view is remembered: back to the graph and the list returns.
  await window.getByRole('radio', { name: 'Graph' }).click()
  await expect(window.getByTestId('commit-row').first()).toBeVisible()
  await app.close()
})

test('selecting a commit shows its details; the arrow keys move along the track', async () => {
  const repo = timelineRepo()
  const { app, window } = await openTimeline(repo)

  await dot(window, 'feature 1').click()
  await expect(window.getByTestId('commit-details')).toContainText('feature 1')
  await expect(dot(window, 'feature 1')).toHaveAttribute('aria-selected', 'true')

  await window.getByRole('listbox', { name: 'Commit timeline' }).focus()
  await window.keyboard.press('ArrowRight')
  await expect(window.getByTestId('commit-details')).toContainText('feature 2')
  await window.keyboard.press('ArrowUp') // nearest commit on main
  await expect(window.getByTestId('commit-details')).toContainText(/main 5|Merge branch/)

  // Hovering shows the commit in a tooltip.
  await dot(window, 'main 2').hover()
  await expect(window.getByRole('tooltip')).toContainText('main 2')
  await app.close()
})

test('the branch picker chooses which branches get a track', async () => {
  const repo = timelineRepo()
  const { app, window } = await openTimeline(repo)
  await expect(window.getByTestId('timeline-track')).toHaveCount(3)

  await window.getByRole('button', { name: 'Timeline branches' }).click()
  await window.getByRole('combobox', { name: 'Search branches' }).fill('spi')
  await window.getByRole('option', { name: 'spike', exact: true }).click()
  await window.keyboard.press('Escape')
  await expect(window.getByTestId('timeline-track')).toHaveCount(2)
  await expect(window.getByRole('button', { name: 'Timeline branches' })).toHaveText(/2 branches/)

  await window.getByRole('button', { name: 'Timeline branches' }).click()
  await window.getByRole('button', { name: 'Use default' }).click()
  await window.keyboard.press('Escape')
  await expect(window.getByTestId('timeline-track')).toHaveCount(3)
  await app.close()
})

test('stale branches are faded', async () => {
  const repo = createRepo()
  commitAt(repo, 'recent work', 2)
  repo.git('switch', '-c', 'old-idea', 'HEAD~1')
  commitAt(repo, 'old idea', 40)
  repo.git('switch', 'main')
  const { app, window } = await openTimeline(repo)

  const old = window.getByTestId('timeline-track').filter({ hasText: 'old-idea' })
  await expect(old).toHaveAttribute('data-stale', 'true')
  await expect(old).toContainText('stale')
  await expect(
    window.getByTestId('timeline-track').filter({ hasText: 'main' }),
  ).not.toHaveAttribute('data-stale')
  await app.close()
})

test('zooming changes the part of history shown in the minimap', async () => {
  const repo = timelineRepo()
  const { app, window } = await openTimeline(repo)
  const box = window.getByTestId('timeline-minimap-window')
  const widthOf = async () => Number(await box.getAttribute('width'))

  await window.screenshot({ path: test.info().outputPath('before.png') })
  const before = await widthOf()
  await window.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(widthOf).toBeLessThan(before)

  // Zoomed in on the last few days, older commits are off screen until you
  // scroll back (here by clicking the start of the minimap).
  await window.getByRole('button', { name: 'Zoom in' }).click()
  await expect(dot(window, 'base work')).toHaveCount(0)
  // spike's only commit is off screen now: its row points to where it is.
  const spikeHint = window.getByTestId('timeline-edge-hint').filter({ hasText: 'last commit' })
  await expect(spikeHint).toHaveCount(1)
  const minimap = window.getByTestId('timeline-minimap')
  const area = (await minimap.boundingBox())!
  await minimap.click({ position: { x: 4, y: area.height / 2 } })
  await window.screenshot({ path: test.info().outputPath('after.png') })
  await expect(dot(window, 'base work')).toBeVisible()
  await app.close()
})
