/**
 * The built-in GitHub plugin, against a fake GitHub GraphQL API: sign in
 * with a token, see pull requests in the sidebar, CI badges in the history
 * and this branch's pull request in the status bar.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'
import { startFakeServer } from './fake-server'

test.afterAll(cleanupTempDirs)

test('signs in, lists pull requests and shows CI results', async () => {
  const repo = createRepo()
  // The plugin finds owner/name from the remote, whose host must match the API's.
  repo.git('remote', 'add', 'origin', 'https://127.0.0.1/acme/widgets.git')
  repo.git('switch', '-c', 'feature')
  repo.write('a.txt', 'a\n')
  repo.commit('Add a')
  const head = repo.git('rev-parse', 'HEAD').trim()

  const pr = (number: number, title: string, branch: string, state: string) => ({
    number,
    title,
    url: `https://github.com/acme/widgets/pull/${number}`,
    isDraft: false,
    headRefName: branch,
    reviewDecision: null,
    author: { login: 'sam' },
    commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
  })
  const github = await startFakeServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    if (request.headers.authorization !== 'bearer ghp_test') {
      response.end(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }))
      return
    }
    const { query } = request.body as { query: string }
    response.end(
      JSON.stringify(
        query.includes('viewer')
          ? { data: { viewer: { login: 'octo' } } }
          : {
              data: {
                repository: {
                  url: 'https://github.com/acme/widgets',
                  defaultBranchRef: { name: 'main' },
                  pullRequests: {
                    nodes: [
                      pr(7, 'Tidy docs', 'docs', 'PENDING'),
                      pr(12, 'Add a', 'feature', 'SUCCESS'),
                    ],
                  },
                  ref: {
                    target: {
                      history: {
                        nodes: [
                          {
                            oid: head,
                            url: `https://github.com/acme/widgets/commit/${head}`,
                            statusCheckRollup: { state: 'FAILURE' },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
      ),
    )
  })

  const userData = tempDir()
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ pluginSettings: { github: { apiUrl: `${github.url}/graphql` } } }),
  )
  const { app, window } = await launch(userData)
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { opened?: string[] }).opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await openRepo(app, window, repo.path)

  // Not signed in yet: the panel offers to sign in.
  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: 'Sign in to GitHub…' }).click()
  await window.getByRole('option', { name: /Paste a personal access token/ }).click()
  const dialog = window.getByRole('dialog')
  // A password box, so the token isn't shown on screen.
  const tokenBox = dialog.locator('input[type=password]')
  await expect(tokenBox).toBeVisible()
  await tokenBox.fill('ghp_test')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(window.getByText('Signed in to GitHub as octo.')).toBeVisible()

  // This branch's pull request comes first, then the others.
  const current = sidebar.getByRole('button', { name: /#12 Add a/ })
  await expect(current).toContainText('this branch')
  await expect(sidebar.getByRole('button', { name: /#7 Tidy docs/ })).toBeVisible()
  await expect(
    window.getByTestId('plugin-status-item').filter({ hasText: '✓ PR #12' }),
  ).toBeVisible()

  // CI result badge on the latest commit.
  await window.getByRole('tab', { name: /History/ }).click()
  const badge = window
    .getByTestId('commit-row')
    .filter({ hasText: 'Add a' })
    .getByTestId('commit-decoration')
  await expect(badge).toHaveAttribute('title', /Checks failed/)
  await expect(badge).toHaveAttribute(
    'href',
    `https://github.com/acme/widgets/commit/${head}/checks`,
  )

  await current.click()
  await expect
    .poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened))
    .toEqual(['https://github.com/acme/widgets/pull/12'])
  await app.close()
  await github.close()
})
