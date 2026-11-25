/**
 * Pure helpers for the GitHub plugin: reading the remote URL, the GraphQL
 * query, and turning GitHub's answer into panel items, commit badges and
 * the status bar text. Kept apart from index.js so they can be unit tested
 * (lib.test.js) without Trellis or the network.
 */

/** @typedef {import('@trellis/plugin-api').PanelItem} PanelItem */
/** @typedef {import('@trellis/plugin-api').CommitDecoration} CommitDecoration */
/** @typedef {import('@trellis/plugin-api').StatusIcon} StatusIcon */

/**
 * A GitHub check rollup state: the combined result of a commit's CI checks.
 * @typedef {'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED'} RollupState
 */

/**
 * @typedef {object} PullRequest
 * @property {number} number
 * @property {string} title
 * @property {string} url
 * @property {boolean} isDraft
 * @property {string} headRefName
 * @property {{ login: string } | null} author
 * @property {'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null} reviewDecision
 * @property {{ nodes: { commit: { statusCheckRollup: { state: RollupState } | null } }[] }} commits
 */

/**
 * The parts of GitHub's answer the plugin uses (see QUERY).
 * @typedef {object} RepoData
 * @property {string} url
 * @property {{ name: string } | null} defaultBranchRef
 * @property {{ nodes: PullRequest[] }} pullRequests
 * @property {{ target: { history?: { nodes: { oid: string, url: string, statusCheckRollup: { state: RollupState } | null }[] } } } | null} ref
 */

/**
 * Where to send API requests, and which host the remote must be on.
 * @param {string} apiUrl the "GitHub Enterprise API address" setting
 */
export function apiEndpoint(apiUrl) {
  const url = apiUrl.trim()
  if (!url) return { graphql: 'https://api.github.com/graphql', host: 'github.com' }
  const host = /^https?:\/\/([^/:]+)/i.exec(url)?.[1]?.toLowerCase() ?? ''
  return { graphql: url, host }
}

/**
 * Owner and repository name from a GitHub remote URL, e.g.
 *   git@github.com:acme/widgets.git     -> acme / widgets
 *   https://github.com/acme/widgets     -> acme / widgets
 *   ssh://git@github.com:22/acme/widgets.git
 * Returns null if the remote isn't on `host`.
 * @param {string} remote
 * @param {string} host
 * @returns {{ owner: string, name: string } | null}
 */
export function parseRemote(remote, host) {
  const url = remote.trim()
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(url)
  const full = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url)
  const match = !url.includes('://') && scp ? scp : full
  if (!match || match[1]?.toLowerCase() !== host) return null
  const parts = (match[2] ?? '')
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '')
    .split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { owner: parts[0], name: parts[1] }
}

/** How many of the branch's latest commits get CI badges. */
export const CHECKED_COMMITS = 30

/**
 * One request fetches everything: open pull requests (with the CI result
 * of their latest commit) and the CI results of the branch's latest commits.
 */
export const QUERY = `query TrellisRepo($owner: String!, $name: String!, $branch: String!, $count: Int!) {
  repository(owner: $owner, name: $name) {
    url
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number title url isDraft headRefName reviewDecision
        author { login }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
    ref(qualifiedName: $branch) {
      target {
        ... on Commit {
          history(first: $count) { nodes { oid url statusCheckRollup { state } } }
        }
      }
    }
  }
}`

/**
 * @param {RollupState | undefined | null} state
 * @returns {StatusIcon}
 */
export function rollupIcon(state) {
  if (state === 'SUCCESS') return 'success'
  if (state === 'FAILURE' || state === 'ERROR') return 'failure'
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending'
  return 'neutral'
}

/** @param {RollupState | undefined | null} state */
export function rollupLabel(state) {
  if (state === 'SUCCESS') return 'Checks passed'
  if (state === 'FAILURE' || state === 'ERROR') return 'Checks failed'
  if (state === 'PENDING' || state === 'EXPECTED') return 'Checks running'
  return 'No checks'
}

/** @param {PullRequest} pr */
const prState = (pr) => pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null

/** @param {PullRequest['reviewDecision']} decision */
function reviewLabel(decision) {
  if (decision === 'APPROVED') return 'approved'
  if (decision === 'CHANGES_REQUESTED') return 'changes requested'
  if (decision === 'REVIEW_REQUIRED') return 'review required'
  return ''
}

/**
 * The open pull request for `branch`, if there is one.
 * @param {RepoData} data
 * @param {string} branch the branch name on GitHub
 */
export function currentPullRequest(data, branch) {
  return data.pullRequests.nodes.find((pr) => pr.headRefName === branch) ?? null
}

/**
 * Panel rows: this branch's pull request first (or an offer to create one),
 * then the other open pull requests.
 * @param {RepoData} data
 * @param {string} branch
 * @returns {PanelItem[]}
 */
export function panelItems(data, branch) {
  const current = currentPullRequest(data, branch)
  const isDefault = data.defaultBranchRef?.name === branch
  /** @param {PullRequest} pr @returns {PanelItem} */
  const item = (pr) => {
    const review = reviewLabel(pr.reviewDecision)
    return {
      id: pr.url,
      label: `#${pr.number} ${pr.title}`,
      description: [pr === current ? 'this branch' : '', pr.isDraft ? 'draft' : '']
        .filter(Boolean)
        .join(', '),
      tooltip: [
        `#${pr.number} ${pr.title}`,
        `${pr.headRefName}${pr.author ? ` by ${pr.author.login}` : ''}`,
        [rollupLabel(prState(pr)), review].filter(Boolean).join(', '),
        'Click to open on GitHub.',
      ].join('\n'),
      icon: rollupIcon(prState(pr)),
      command: 'github.openPullRequest',
    }
  }
  /** @type {PanelItem[]} */
  const items = []
  if (current) items.push(item(current))
  else if (branch && !isDefault) {
    items.push({
      label: `Create pull request for ${branch}…`,
      icon: 'info',
      command: 'github.createPullRequest',
    })
  }
  for (const pr of data.pullRequests.nodes) if (pr !== current) items.push(item(pr))
  return items
}

/**
 * CI badges for the branch's latest commits (only those with checks).
 * @param {RepoData} data
 * @returns {CommitDecoration[]}
 */
export function commitDecorations(data) {
  const nodes = data.ref?.target.history?.nodes ?? []
  return nodes
    .filter((commit) => commit.statusCheckRollup)
    .map((commit) => ({
      sha: commit.oid,
      icon: rollupIcon(commit.statusCheckRollup?.state),
      tooltip: `${rollupLabel(commit.statusCheckRollup?.state)} (GitHub). Click to see them.`,
      url: `${commit.url}/checks`,
    }))
}

/**
 * Status bar text for the branch's pull request, e.g. "✓ PR #12".
 * @param {PullRequest | null} pr
 */
export function statusText(pr) {
  if (!pr) return ''
  /** @type {Record<string, string>} */
  const icons = { success: '✓', failure: '✗', pending: '●' }
  const icon = icons[rollupIcon(prState(pr))] ?? ''
  return `${icon ? `${icon} ` : ''}PR #${pr.number}`
}

/**
 * The page where GitHub offers to open a pull request for `branch`.
 * @param {string} repoUrl e.g. https://github.com/acme/widgets
 * @param {string} branch
 */
export function compareUrl(repoUrl, branch) {
  return `${repoUrl}/compare/${branch.split('/').map(encodeURIComponent).join('/')}?expand=1`
}
