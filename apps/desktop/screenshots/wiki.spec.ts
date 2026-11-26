/**
 * Screenshots for the wiki (docs/wiki/images/*.png).
 *
 * Builds a small, realistic demo repository ("acme-website": a few authors,
 * feature branches, merges, tags, a remote, a stash and uncommitted work),
 * opens it in the real app and captures each screen the wiki explains.
 * Run with `pnpm screenshots` (see playwright.screenshots.config.ts).
 *
 * Each shot is its own step, in order: later ones change the repository
 * (the last one starts a merge with a conflict). Pictures are taken at 2×
 * so they stay sharp on high-resolution screens, in the light theme.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, stubFolderPicker, tempDir } from '../e2e/helpers'

const OUT = join(import.meta.dirname, '../../../docs/wiki/images')
const appEntry = join(import.meta.dirname, '../out/main/index.js')

test.afterAll(cleanupTempDirs)

/** A git config file with a name and email, so the app skips the onboarding card. */
function gitConfig(withIdentity: boolean): string {
  const file = join(tempDir(), 'gitconfig')
  writeFileSync(file, withIdentity ? '[user]\n\tname = Ann Lee\n\temail = ann@example.com\n' : '')
  return file
}

/** Launch Trellis at 2× in a fixed-size window, with its own settings and git config. */
async function launchForScreenshots(globalGitConfig: string) {
  const app = await electron.launch({
    args: [
      appEntry,
      '--force-device-scale-factor=2',
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    ],
    env: {
      ...process.env,
      TRELLIS_USER_DATA_DIR: tempDir(),
      GIT_CONFIG_GLOBAL: globalGitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
  const window = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!
    win.setContentSize(1360, 820)
    win.center()
  })
  await window.emulateMedia({ colorScheme: 'light' })
  return { app, window }
}

/** Wait for animations to settle, then save a screenshot of the page or one element. */
async function shot(window: Page, name: string, element?: ReturnType<Page['locator']>) {
  await window.waitForTimeout(300)
  await window.waitForFunction(() => document.getAnimations().length === 0)
  mkdirSync(OUT, { recursive: true })
  const path = join(OUT, `${name}.png`)
  if (element) await element.screenshot({ path })
  else await window.screenshot({ path })
}

/**
 * Draw numbered markers over parts of the window (for the annotated tour).
 * Each marker is centred at a point inside its element: `fx`/`fy` are
 * fractions of the element's width/height (0 = left/top, 1 = right/bottom).
 */
async function annotate(window: Page, targets: { selector: string; fx: number; fy: number }[]) {
  const boxes = []
  for (const target of targets) {
    const box = await window.locator(target.selector).first().boundingBox()
    if (!box) throw new Error(`Nothing to annotate at ${target.selector}`)
    boxes.push({ x: box.x + box.width * target.fx - 13, y: box.y + box.height * target.fy - 13 })
  }
  await window.evaluate((points) => {
    points.forEach((point, index) => {
      const badge = document.createElement('div')
      badge.className = 'wiki-annotation'
      badge.textContent = String(index + 1)
      Object.assign(badge.style, {
        position: 'fixed',
        left: `${point.x}px`,
        top: `${point.y}px`,
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        background: '#e11d48',
        color: 'white',
        font: 'bold 14px system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 3px white, 0 2px 6px rgba(0,0,0,.35)',
        zIndex: '100000',
        pointerEvents: 'none',
      })
      document.body.append(badge)
    })
  }, boxes)
}

const clearAnnotations = (window: Page) =>
  window.evaluate(() => document.querySelectorAll('.wiki-annotation').forEach((el) => el.remove()))

// ---------------------------------------------------------------------------
// The demo repository
// ---------------------------------------------------------------------------

interface DemoRepo {
  path: string
  git: (...args: string[]) => string
  write: (file: string, content: string | Buffer) => void
}

const AUTHORS = {
  ann: ['Ann Lee', 'ann@example.com'],
  ben: ['Ben Ortiz', 'ben@example.com'],
  chloe: ['Chloe Park', 'chloe@example.com'],
} as const

/** Make the demo repository, with commits spread over the last few weeks. */
function createDemoRepo(logo: { before: Buffer; after: Buffer }): DemoRepo {
  const root = tempDir()
  const path = join(root, 'acme-website')
  const remote = join(root, 'origin.git')
  mkdirSync(path)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])

  // Commits get decreasing ages, so the history reads naturally.
  let hoursAgo = 200
  let author: keyof typeof AUTHORS = 'ann'
  const git = (...args: string[]) => {
    const date = new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
    const [name, email] = AUTHORS[author]
    return execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    })
  }
  const write = (file: string, content: string | Buffer) => {
    mkdirSync(join(path, file, '..'), { recursive: true })
    writeFileSync(join(path, file), content)
  }
  const commit = (who: keyof typeof AUTHORS, message: string, hours: number) => {
    author = who
    hoursAgo -= hours
    git('add', '-A')
    git('commit', '-q', '-m', message)
  }

  git('init', '-q', '--initial-branch=main')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.autocrlf', 'false')

  const styles = (accent: string, background = '#ffffff') =>
    `:root {\n  --accent: ${accent};\n  --background: ${background};\n}\n\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: var(--background);\n}\n\n.nav a {\n  color: var(--accent);\n}\n`
  write('README.md', '# Acme website\n\nThe public website for Acme.\n')
  write(
    'index.html',
    '<!doctype html>\n<html>\n  <head>\n    <title>Acme</title>\n    <link rel="stylesheet" href="styles.css">\n  </head>\n  <body>\n    <h1>Welcome to Acme</h1>\n  </body>\n</html>\n',
  )
  write('styles.css', styles('#2563eb'))
  commit('ann', 'Create the site skeleton', 0)

  write(
    'index.html',
    '<!doctype html>\n<html>\n  <head>\n    <title>Acme</title>\n    <link rel="stylesheet" href="styles.css">\n  </head>\n  <body>\n    <nav class="nav">\n      <a href="/">Home</a>\n      <a href="/about">About</a>\n    </nav>\n    <h1>Welcome to Acme</h1>\n  </body>\n</html>\n',
  )
  commit('ben', 'Add a navigation bar', 20)
  git('tag', '-a', 'v1.0.0', '-m', 'First release')

  // A feature branch, merged with a merge commit.
  git('switch', '-q', '-c', 'feature/contact-form')
  write('contact.html', '<form>\n  <input name="email">\n  <button>Send</button>\n</form>\n')
  commit('chloe', 'Add a contact form', 26)
  write(
    'contact.html',
    '<form>\n  <label>Email <input name="email" type="email" required></label>\n  <button>Send</button>\n</form>\n',
  )
  commit('chloe', 'Validate the email address', 5)
  git('switch', '-q', 'main')
  write('footer.html', '<footer>\n  <a href="/privacy">Privacy</a>\n</footer>\n')
  commit('ann', 'Add a footer', 3)
  git('merge', '-q', '--no-ff', 'feature/contact-form', '-m', "Merge branch 'feature/contact-form'")
  hoursAgo -= 1

  // A small fix, merged by fast-forward (a branch that can be cleaned up).
  git('switch', '-q', '-c', 'fix/footer-links')
  write(
    'footer.html',
    '<footer>\n  <a href="/privacy">Privacy policy</a>\n  <a href="/terms">Terms</a>\n</footer>\n',
  )
  commit('ann', 'Fix the footer links', 30)
  git('switch', '-q', 'main')
  git('merge', '-q', '--ff-only', 'fix/footer-links')

  write('logo.png', logo.before)
  commit('chloe', 'Add the logo', 20)
  git('tag', '-a', 'v1.1.0', '-m', 'Contact form and logo')
  git('remote', 'add', 'origin', remote)
  git('push', '-q', '-u', 'origin', 'main', '--tags')

  // A feature in progress, on the remote too. It changes the same line of
  // styles.css as a later commit on main, for the conflict screenshot.
  git('switch', '-q', '-c', 'feature/dark-mode')
  write('styles.css', styles('#2563eb', '#0b1120'))
  commit('ben', 'Add a dark background', 18)
  write('theme.js', "export const theme = matchMedia('(prefers-color-scheme: dark)')\n")
  commit('ben', 'Follow the system theme', 4)
  write(
    'theme.js',
    "export const theme = matchMedia('(prefers-color-scheme: dark)')\ntheme.addEventListener('change', () => location.reload())\n",
  )
  commit('ben', 'Switch theme without restarting', 3)
  git('push', '-q', '-u', 'origin', 'feature/dark-mode')

  // An experiment whose remote branch was deleted ("gone").
  git('switch', '-q', '-c', 'experiment/new-font', 'main')
  write('styles.css', styles('#2563eb').replace('system-ui', 'Inter, system-ui'))
  commit('chloe', 'Try the Inter font', 10)
  git('push', '-q', '-u', 'origin', 'experiment/new-font')
  git('push', '-q', 'origin', '--delete', 'experiment/new-font')
  git('fetch', '-q', '--prune')

  // A local branch that was never pushed.
  git('switch', '-q', '-c', 'feature/search', 'main')
  write(
    'search.js',
    'export function search(query) {\n  return fetch(`/api/search?q=${query}`)\n}\n',
  )
  commit('chloe', 'Add a search box', 8)

  git('switch', '-q', 'main')
  write('styles.css', styles('#7c3aed'))
  commit('ann', 'Use the new brand colour', 14)
  write('logo.png', logo.after)
  commit('chloe', 'Update the logo to the new brand', 6)
  write(
    'README.md',
    '# Acme website\n\nThe public website for Acme.\n\n## Running locally\n\nOpen `index.html` in a browser.\n',
  )
  commit('ann', 'Explain how to run the site', 2)

  // A stash, and some uncommitted work: one file staged, others not.
  write('index.html', readFile(path, 'index.html').replace('Welcome to Acme', 'Welcome to Acme!'))
  git('stash', 'push', '-q', '-m', 'Try a louder heading')
  write(
    'index.html',
    readFile(path, 'index.html').replace(
      '    <h1>Welcome to Acme</h1>\n',
      '    <h1>Welcome to Acme</h1>\n    <p>We make useful things.</p>\n',
    ),
  )
  git('add', 'index.html')
  write(
    'styles.css',
    readFile(path, 'styles.css').replace(
      'margin: 0;',
      'margin: 0;\n  line-height: 1.5;\n  color: #111827;',
    ),
  )
  write('pricing.html', '<h1>Pricing</h1>\n<p>Coming soon.</p>\n')

  return {
    path,
    git: (...args) => execFileSync('git', args, { cwd: path, encoding: 'utf8' }),
    write,
  }
}

function readFile(repo: string, file: string): string {
  return execFileSync('git', ['show', `:${file}`], { cwd: repo, encoding: 'utf8' })
}

/**
 * Draw the logo (a rounded square with "A") in the app's page and return it
 * as PNG bytes: no image library needed.
 */
async function drawLogo(window: Page, colour: string, label: string): Promise<Buffer> {
  const dataUrl = await window.evaluate(
    ([fill, text]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 240
      canvas.height = 240
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = fill!
      ctx.beginPath()
      ctx.roundRect(20, 20, 200, 200, 40)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.font = 'bold 120px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text!, 120, 128)
      return canvas.toDataURL('image/png')
    },
    [colour, label],
  )
  return Buffer.from(dataUrl.split(',')[1]!, 'base64')
}

// ---------------------------------------------------------------------------
// The screenshots
// ---------------------------------------------------------------------------

test('onboarding card on the home screen', async () => {
  const { app, window } = await launchForScreenshots(gitConfig(false))
  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await shot(window, 'home-onboarding')
  await app.close()
})

test('wiki screenshots', async () => {
  const { app, window } = await launchForScreenshots(gitConfig(true))
  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  const repo = createDemoRepo({
    before: await drawLogo(window, '#2563eb', 'A'),
    after: await drawLogo(window, '#7c3aed', 'A'),
  })

  await stubFolderPicker(app, repo.path)
  await window.getByRole('button', { name: 'Open repository' }).first().click()
  const rows = window.getByTestId('commit-row')
  await expect(rows.first()).toBeVisible()

  // The home screen, listing the repository with its branch and changes.
  await window.getByRole('button', { name: 'Home' }).click()
  await expect(window.getByTestId('recent-repos')).toBeVisible()
  await shot(window, 'home')
  await window.getByRole('tab', { name: 'acme-website' }).click()
  await rows.filter({ hasText: 'Use the new brand colour' }).click()
  await window
    .getByRole('button', { name: /styles\.css/ })
    .first()
    .click()

  // The annotated tour of the repository window.
  const nav = window.getByRole('navigation', { name: 'Repository' })
  await annotate(window, [
    { selector: 'nav[aria-label="Repository"]', fx: 0.5, fy: 0.65 },
    { selector: '[role="tab"]:has-text("Changes")', fx: 1.05, fy: 0.5 },
    { selector: 'button:has-text("Fetch")', fx: 0.5, fy: 1.15 },
    { selector: '[data-testid="commit-row"]', fx: 0.55, fy: 0.5 },
    { selector: 'text=1 file changed', fx: 0.5, fy: 3.5 },
    { selector: '.cm-editor', fx: 0.6, fy: 0.5 },
    { selector: 'footer, [role="contentinfo"]', fx: 0.3, fy: 0.5 },
  ])
  await shot(window, 'repo-window')
  await clearAnnotations(window)

  // Branch folders in the sidebar: open "feature" (and close it again after).
  const featureFolder = nav
    .getByRole('group', { name: 'feature folder' })
    .first()
    .getByRole('button', { name: /^feature/ })
  await featureFolder.click()
  // Just the top of the sidebar: the rest is empty.
  const navBox = (await nav.boundingBox())!
  await window.waitForTimeout(300)
  await window.screenshot({
    path: join(OUT, 'branch-folders.png'),
    clip: { x: navBox.x, y: navBox.y, width: navBox.width, height: 440 },
  })
  await featureFolder.click()

  // The command palette, then one of its pickers.
  await window.keyboard.press('Control+K')
  const palette = window.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await shot(window, 'command-palette')
  await palette.getByRole('combobox').fill('check out')
  await shot(window, 'command-palette-search')
  await window.keyboard.press('Enter')
  await expect(palette.getByRole('option', { name: /feature\/dark-mode/ }).first()).toBeVisible()
  await shot(window, 'command-palette-picker')
  await window.keyboard.press('Escape')
  await expect(palette).toBeHidden()

  // Filtering the history.
  await window.getByRole('button', { name: 'Filter' }).click()
  const filter = window.getByRole('dialog', { name: 'Filter commits' })
  await filter.getByLabel('Author').fill('chloe')
  await expect(window.getByRole('button', { name: 'Filter (1 active)' })).toBeVisible()
  await shot(window, 'history-filter')
  await filter.getByRole('button', { name: 'Clear filters' }).click()
  await window.keyboard.press('Escape')

  // The timeline: branches as tracks over time, merged branches included.
  await rows.filter({ hasText: 'Add a dark background' }).click()
  await window.getByRole('radio', { name: 'Timeline' }).click()
  await window.getByRole('button', { name: 'Merged branches' }).click()
  await window.getByRole('button', { name: 'Show all loaded history' }).click()
  await expect(window.getByTestId('timeline-track').first()).toBeVisible()
  await shot(window, 'history-timeline')
  await window.getByRole('radio', { name: 'Graph' }).click()

  // Side-by-side diff of a commit.
  await rows.filter({ hasText: 'Follow the system theme' }).click()
  await window
    .getByRole('button', { name: /theme\.js/ })
    .first()
    .click()
  await window.getByRole('button', { name: 'Side-by-side view' }).first().click()
  await shot(window, 'commit-details')
  await window.getByRole('button', { name: 'Unified view' }).first().click()

  // Comparing two versions of an image.
  await rows.filter({ hasText: 'Update the logo' }).click()
  await window
    .getByRole('button', { name: /logo\.png/ })
    .first()
    .click()
  const image = window.getByTestId('image-diff')
  await image.getByRole('radio', { name: 'Swipe' }).click()
  await image.getByLabel('Swipe position').fill('50')
  await shot(window, 'image-diff-swipe')

  // Dragging a branch label onto another branch.
  await rows.filter({ hasText: 'Explain how to run' }).click()
  await window
    .locator('[data-ref="refs/heads/feature/dark-mode"]')
    .dragTo(window.locator('[data-ref="refs/heads/main"]'))
  await expect(
    window.getByRole('menuitem', { name: /Merge feature\/dark-mode into main/ }),
  ).toBeVisible()
  await shot(window, 'drag-branch-menu')
  await window.keyboard.press('Escape')

  // Interactive rebase (opened, not started).
  await rows.filter({ hasText: 'Add the logo' }).click({ button: 'right' })
  await shot(window, 'commit-menu')
  await window.getByRole('menuitem', { name: 'Interactive rebase from here…' }).click()
  await expect(window.getByTestId('rebase-list')).toBeVisible()
  // Show a couple of choices made: fold the logo update into "Add the logo".
  await window.getByLabel('Action for Update the logo to the new brand').selectOption('fixup')
  await window.getByRole('button', { name: /Move .*Update the logo to the new brand.* up/ }).click()
  await shot(window, 'interactive-rebase')
  await window.keyboard.press('Escape')

  // Cleaning up branches.
  await nav.getByRole('button', { name: 'Clean up branches…' }).click()
  await expect(window.getByRole('dialog')).toBeVisible()
  await shot(window, 'clean-up-branches')
  await window.keyboard.press('Escape')

  // The Changes view: one file staged, two not, with a diff selected.
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByRole('region', { name: 'Unstaged', exact: true })
    .getByRole('button', { name: /styles\.css/ })
    .click()
  await shot(window, 'changes')

  // Selecting one changed line, to stage just that line.
  await window
    .getByTestId('patch-view')
    .getByRole('checkbox', { name: /line-height/ })
    .click()
  await expect(window.getByText('1 line selected')).toBeVisible()
  await shot(window, 'stage-lines')

  // The git log panel.
  await window.keyboard.press('Control+`')
  await shot(window, 'git-log')
  await window.keyboard.press('Control+`')

  // Settings > Plugins.
  await window.keyboard.press('Control+,')
  await window.getByRole('tab', { name: 'Plugins' }).click()
  await shot(window, 'settings-plugins')
  await window.getByRole('tab', { name: 'Keyboard shortcuts' }).click()
  await shot(window, 'settings-shortcuts')
  await window.keyboard.press('Escape')

  // A merge with a conflict (done with git, as if from a terminal).
  repo.git('stash', 'push', '-q', '--include-untracked', '-m', 'Pricing page')
  try {
    repo.git('merge', 'feature/dark-mode')
  } catch {
    // Expected: styles.css conflicts.
  }
  const banner = window.getByTestId('operation-banner')
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: 'Show conflicts' }).click()
  await window
    .getByRole('region', { name: 'Conflicts', exact: true })
    .getByRole('button', { name: /styles\.css/ })
    .click()
  await expect(window.getByTestId('conflict-editor')).toBeVisible()
  await shot(window, 'conflict-editor')

  await app.close()
})
