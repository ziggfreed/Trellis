/**
 * Pure helpers: turn git remote URLs into website links.
 * Kept separate from index.js so they can be unit tested (lib.test.js).
 */

/** @typedef {'github' | 'gitlab' | 'bitbucket' | 'gitea'} SiteStyle */

/**
 * The repository's web address for a git remote URL, e.g.
 *   git@github.com:owner/repo.git     -> https://github.com/owner/repo
 *   https://user@host/group/repo.git  -> https://host/group/repo
 *   ssh://git@host:2222/owner/repo    -> https://host/owner/repo
 * Returns null for remotes that aren't on a website (e.g. local folders).
 * @param {string} remote
 * @returns {string | null}
 */
export function webUrlFromRemote(remote) {
  const url = remote.trim()
  let host
  let path
  // scp-like syntax: [user@]host:path (no "://")
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(url)
  if (!url.includes('://') && scp) {
    host = scp[1]
    path = scp[2]
  } else {
    const match = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url)
    if (!match) return null
    host = match[1]
    path = match[2]
  }
  path = (path ?? '').replace(/\.git\/?$/, '').replace(/\/+$/, '')
  if (!host || !path) return null
  return `https://${host}/${path}`
}

/**
 * Guess the website type from its address.
 * @param {string} webUrl
 * @returns {SiteStyle}
 */
export function guessStyle(webUrl) {
  const host = /^https?:\/\/([^/]+)/.exec(webUrl)?.[1] ?? ''
  if (host.includes('gitlab')) return 'gitlab'
  if (host.includes('bitbucket')) return 'bitbucket'
  if (host.includes('gitea') || host.includes('codeberg') || host.includes('forgejo'))
    return 'gitea'
  return 'github'
}

/** @param {string} path */
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/')

/**
 * @param {string} web  repository web address
 * @param {SiteStyle} style
 * @param {string} sha
 */
export function commitUrl(web, style, sha) {
  return style === 'bitbucket'
    ? `${web}/commits/${sha}`
    : style === 'gitlab'
      ? `${web}/-/commit/${sha}`
      : `${web}/commit/${sha}`
}

/**
 * @param {string} web
 * @param {SiteStyle} style
 * @param {string} branch
 */
export function branchUrl(web, style, branch) {
  const name = encodePath(branch)
  switch (style) {
    case 'gitlab':
      return `${web}/-/tree/${name}`
    case 'bitbucket':
      return `${web}/branch/${name}`
    case 'gitea':
      return `${web}/src/branch/${name}`
    default:
      return `${web}/tree/${name}`
  }
}

/**
 * Link to a file as it is at `sha`.
 * @param {string} web
 * @param {SiteStyle} style
 * @param {string} sha
 * @param {string} path
 */
export function fileUrl(web, style, sha, path) {
  const file = encodePath(path)
  switch (style) {
    case 'gitlab':
      return `${web}/-/blob/${sha}/${file}`
    case 'bitbucket':
      return `${web}/src/${sha}/${file}`
    case 'gitea':
      return `${web}/src/commit/${sha}/${file}`
    default:
      return `${web}/blob/${sha}/${file}`
  }
}
