/**
 * Performance check for large histories.
 *
 * Builds a repository with BENCH_COMMITS commits (default 20,000 so CI stays
 * quick; run with BENCH_COMMITS=100000 for the full benchmark), then measures:
 *   - time until the first commits appear,
 *   - frame times while scrolling the history,
 *   - time to scroll all the way to the first commit.
 *
 * Results are printed and attached to the Playwright report. The limits are
 * generous because CI machines (and virtual displays) are slow; they catch
 * big regressions, not small ones.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, launch, openRepo, tempDir } from './helpers'

const COMMITS = Number(process.env.BENCH_COMMITS ?? 20_000)
const script = join(import.meta.dirname, '../../../scripts/create-benchmark-repo.mjs')

test.afterAll(cleanupTempDirs)

test(`history of ${COMMITS} commits stays fast`, async () => {
  test.setTimeout(180_000)
  const repoPath = join(tempDir(), 'big')
  execFileSync(process.execPath, [script, repoPath, String(COMMITS)])

  const { app, window } = await launch()
  const opened = Date.now()
  await openRepo(app, window, repoPath)
  await window.getByTestId('commit-row').first().waitFor()
  const firstRowsMs = Date.now() - opened

  // Scroll down 140px per frame (5 rows) for 120 frames and time each frame.
  const frames = await window.evaluate(async () => {
    const list = document.querySelector('[aria-label="Commits"]')!
    const times: number[] = []
    let last = performance.now()
    for (let i = 0; i < 120; i++) {
      list.scrollTop += 140
      await new Promise(requestAnimationFrame)
      const now = performance.now()
      times.push(now - last)
      last = now
    }
    return times
  })
  const sorted = [...frames].sort((a, b) => a - b)
  const medianFrameMs = sorted[Math.floor(sorted.length / 2)]!
  const p95FrameMs = sorted[Math.floor(sorted.length * 0.95)]!

  // Jump to the bottom repeatedly until the very first commit has loaded.
  const started = Date.now()
  const firstCommit = window.getByText('Commit 1 on main', { exact: true })
  while (!(await firstCommit.isVisible())) {
    await window.evaluate(() => {
      const list = document.querySelector('[aria-label="Commits"]')!
      list.scrollTop = list.scrollHeight
    })
    await window.waitForTimeout(50)
    if (Date.now() - started > 120_000) throw new Error('Never reached the first commit')
  }
  const toEndMs = Date.now() - started
  await app.close()

  const results = {
    commits: COMMITS,
    firstRowsMs,
    medianFrameMs: Math.round(medianFrameMs),
    p95FrameMs: Math.round(p95FrameMs),
    toEndMs,
  }
  console.log('Performance:', JSON.stringify(results))
  await test.info().attach('performance', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  })

  expect(firstRowsMs).toBeLessThan(5_000)
  expect(medianFrameMs).toBeLessThan(50)
  expect(toEndMs).toBeLessThan(60_000)
})
