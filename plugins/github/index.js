/**
 * GitHub: a built-in Trellis plugin.
 *
 * - "Pull requests" panel in the sidebar: this branch's pull request (or a
 *   link to create one) and the repository's other open pull requests, each
 *   with its CI result.
 * - CI badges on the current branch's latest commits in the history graph.
 * - The status bar shows this branch's pull request; click to open it.
 *
 * Sign in with a personal access token, or reuse the GitHub CLI's sign-in
 * (`gh auth token`). The token is kept in Trellis's encrypted secret
 * storage. Data comes from GitHub's GraphQL API in one request per
 * repository (see QUERY in lib.js), refreshed after fetch/push/checkout and
 * every few minutes while the repository is open.
 *
 * It also shows off the newer plugin API: panels, commit decorations,
 * secrets and operation events.
 */
import { execFile } from 'node:child_process'
import {
  CHECKED_COMMITS,
  QUERY,
  apiEndpoint,
  commitDecorations,
  compareUrl,
  currentPullRequest,
  panelItems,
  parseRemote,
  statusText,
} from './lib.js'

/** @typedef {import('@trellis/plugin-api').TrellisApi} TrellisApi */
/** @typedef {import('@trellis/plugin-api').PluginContext} PluginContext */
/** @typedef {import('./lib.js').RepoData} RepoData */

/**
 * What the plugin knows about one repository.
 * @typedef {{ kind: 'ok', data: RepoData, branch: string }
 *   | { kind: 'signedOut' }
 *   | { kind: 'notGitHub', reason: string }
 *   | { kind: 'error', message: string }} RepoState
 */

/** Data younger than this is reused instead of asking GitHub again. */
const CACHE_MS = 60_000
/** How often the active repository is refreshed in the background. */
const POLL_MS = 3 * 60_000

/**
 * @param {TrellisApi} trellis
 * @param {PluginContext} context
 */
export function activate(trellis, context) {
  /** @type {Map<string, { at: number, state: Promise<RepoState> }>} */
  const cache = new Map()

  const setting = (/** @type {string} */ key) => trellis.settings.get(key)
  const endpoint = () => apiEndpoint(String(setting('apiUrl') ?? ''))

  // --- Talking to GitHub ----------------------------------------------------

  /**
   * Run a GraphQL query, explaining failures in plain words.
   * @param {string} token
   * @param {string} query
   * @param {Record<string, unknown>} variables
   */
  async function graphql(token, query, variables = {}) {
    let response
    try {
      response = await fetch(endpoint().graphql, {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Trellis',
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch {
      throw new Error('Couldn’t reach GitHub. Check your internet connection.')
    }
    if (response.status === 401) {
      throw new Error('GitHub rejected the token. Sign in again (GitHub: Sign in…).')
    }
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`)
    const body = /** @type {{ data?: any, errors?: { message: string }[] }} */ (
      await response.json()
    )
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join(' '))
    return body.data
  }

  /** The repository's owner/name on GitHub and its branch there, or why not. */
  async function repoInfo(/** @type {string} */ repo) {
    const remote = String(setting('remote') || 'origin')
    const url = await trellis.git.run(repo, ['remote', 'get-url', remote], { okExitCodes: [0, 2] })
    const github = url.exitCode === 0 ? parseRemote(url.stdout, endpoint().host) : null
    if (!github) {
      return {
        github: null,
        reason:
          url.exitCode === 0
            ? `The remote “${remote}” isn’t on ${endpoint().host}.`
            : `No remote called “${remote}” (change it in Settings > Plugins).`,
        branch: '',
      }
    }
    // The branch's name on GitHub: its upstream's name, or the local name.
    const upstream = await trellis.git.run(
      repo,
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      { okExitCodes: [0, 128] },
    )
    const head = await trellis.git.run(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      okExitCodes: [0, 128],
    })
    const tracked = upstream.stdout.trim()
    const branch =
      upstream.exitCode === 0 && tracked.startsWith(`${remote}/`)
        ? tracked.slice(remote.length + 1)
        : head.stdout.trim() === 'HEAD'
          ? '' // detached
          : head.stdout.trim()
    return { github, reason: '', branch }
  }

  /** @returns {Promise<RepoState>} */
  async function fetchState(/** @type {string} */ repo) {
    const info = await repoInfo(repo)
    if (!info.github) return { kind: 'notGitHub', reason: info.reason }
    const token = await trellis.secrets.get('token')
    if (!token) return { kind: 'signedOut' }
    try {
      const data = await graphql(token, QUERY, {
        owner: info.github.owner,
        name: info.github.name,
        branch: info.branch || 'HEAD',
        count: CHECKED_COMMITS,
      })
      if (!data?.repository) {
        return { kind: 'error', message: 'GitHub can’t find this repository with your token.' }
      }
      return { kind: 'ok', data: data.repository, branch: info.branch }
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * The repository's state, from the cache when it's fresh. Requests for
   * the same repository share one fetch.
   * @param {string} repo
   * @param {boolean} [force]
   */
  function load(repo, force = false) {
    const cached = cache.get(repo)
    if (cached && !force && Date.now() - cached.at < CACHE_MS) return cached.state
    const state = fetchState(repo)
    cache.set(repo, { at: Date.now(), state })
    void state.then((s) => show(repo, s))
    return state
  }

  // --- Showing it -----------------------------------------------------------

  const status = trellis.ui.createStatusBarItem()
  status.command = 'github.openCurrentPullRequest'
  context.subscriptions.push(status)

  /** Update badges and the status bar from a repository's state. */
  async function show(/** @type {string} */ repo, /** @type {RepoState} */ state) {
    const ok = state.kind === 'ok'
    trellis.graph.setDecorations(
      repo,
      ok && setting('showChecks') ? commitDecorations(state.data) : [],
    )
    if (repo !== (await trellis.repos.active())) return
    const pr = ok ? currentPullRequest(state.data, state.branch) : null
    status.text = statusText(pr)
    status.tooltip = pr ? `#${pr.number} ${pr.title}\nClick to open on GitHub.` : ''
  }

  const panel = trellis.ui.registerPanel('github.pullRequests', {
    async getItems(repo) {
      const state = await load(repo)
      switch (state.kind) {
        case 'ok':
          return panelItems(state.data, state.branch)
        case 'signedOut':
          return [{ label: 'Sign in to GitHub…', icon: 'info', command: 'github.signIn' }]
        case 'notGitHub':
          return [] // hides the panel in repositories that aren't on GitHub
        case 'error':
          return [
            {
              label: 'Couldn’t load pull requests',
              tooltip: `${state.message}\nClick to try again.`,
              icon: 'warning',
              command: 'github.refresh',
            },
          ]
      }
    },
  })
  context.subscriptions.push(panel)

  /** Fetch again now and redraw everything for this repository. */
  async function refresh(/** @type {string | null} */ repo) {
    if (!repo) return
    await load(repo, true)
    panel.refresh()
  }

  // --- Commands ---------------------------------------------------------------

  /** Ask GitHub who the token belongs to (checks it works). */
  async function whoAmI(/** @type {string} */ token) {
    const data = await graphql(token, 'query { viewer { login } }')
    return String(data.viewer.login)
  }

  /** The GitHub CLI's token, if it's installed and signed in. */
  function ghCliToken() {
    return new Promise((resolve) => {
      execFile('gh', ['auth', 'token', '--hostname', endpoint().host], (error, stdout) =>
        resolve(error ? '' : stdout.trim()),
      )
    })
  }

  const commands = {
    'github.signIn': async (/** @type {import('@trellis/plugin-api').CommandArgs} */ args) => {
      const method = await trellis.ui.showQuickPick(
        [
          {
            label: 'Paste a personal access token',
            detail: 'Create one on GitHub under Settings > Developer settings (repo scope)',
            id: 'token',
          },
          {
            label: 'Use the GitHub CLI’s sign-in',
            detail: 'If you’ve run "gh auth login"',
            id: 'gh',
          },
        ],
        { placeholder: 'How do you want to sign in to GitHub?' },
      )
      if (!method) return
      let token
      if (method.id === 'gh') {
        token = await ghCliToken()
        if (!token) {
          trellis.ui.showMessage(
            'The GitHub CLI isn’t installed or isn’t signed in. Run "gh auth login" first, or use a token.',
            'warning',
          )
          return
        }
      } else {
        token = (
          await trellis.ui.showInput({
            title: 'GitHub personal access token',
            prompt: 'Paste a token with access to your repositories. It is stored encrypted.',
            password: true,
          })
        )?.trim()
        if (!token) return
      }
      const login = await whoAmI(token)
      await trellis.secrets.set('token', token)
      trellis.ui.showMessage(`Signed in to GitHub as ${login}.`)
      cache.clear()
      await refresh(args.repo ?? (await trellis.repos.active()))
    },

    'github.signOut': async () => {
      await trellis.secrets.delete('token')
      cache.clear()
      for (const repo of await trellis.repos.open()) trellis.graph.setDecorations(repo, [])
      status.text = ''
      panel.refresh()
      trellis.ui.showMessage('Signed out of GitHub.')
    },

    'github.refresh': (/** @type {{ repo: string | null }} */ args) => refresh(args.repo),

    'github.openPullRequest': async (/** @type {{ item?: string }} */ args) => {
      if (args.item) await trellis.ui.openExternal(args.item)
    },

    'github.openCurrentPullRequest': async (/** @type {{ repo: string | null }} */ args) => {
      const state = args.repo ? await load(args.repo) : null
      const pr = state?.kind === 'ok' ? currentPullRequest(state.data, state.branch) : null
      if (pr) await trellis.ui.openExternal(pr.url)
      else trellis.ui.showMessage('This branch has no open pull request.')
    },

    'github.createPullRequest': async (/** @type {{ repo: string | null }} */ args) => {
      if (!args.repo) return
      const state = await load(args.repo)
      if (state.kind !== 'ok') {
        trellis.ui.showMessage(
          state.kind === 'signedOut'
            ? 'Sign in to GitHub first.'
            : state.kind === 'notGitHub'
              ? state.reason
              : state.message,
          'warning',
        )
        return
      }
      if (!state.branch) {
        trellis.ui.showMessage('Check out a branch first.', 'warning')
        return
      }
      // GitHub's own page picks the base branch and lets you write the description.
      await trellis.ui.openExternal(compareUrl(state.data.url, state.branch))
    },
  }
  for (const [id, run] of Object.entries(commands)) {
    context.subscriptions.push(trellis.commands.register(id, run))
  }

  // --- Keeping it current -----------------------------------------------------

  const refreshActive = async () => refresh(await trellis.repos.active())
  /** Operations after which pull requests or CI results may have changed. */
  const relevant = new Set(['fetch', 'pull', 'push', 'checkout', 'branch', 'merge', 'rebase'])

  context.subscriptions.push(
    trellis.repos.onDidChangeActive((repo) => {
      // Uses the cache, so switching tabs back and forth doesn't refetch.
      if (repo) void load(repo)
      else status.text = ''
    }),
    trellis.repos.onDidRunOperation((event) => {
      if (relevant.has(event.kind)) void refresh(event.repo)
    }),
    trellis.settings.onDidChange(() => {
      cache.clear()
      void refreshActive()
    }),
  )
  const timer = setInterval(() => void refreshActive(), POLL_MS)
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
  void refreshActive()
}
