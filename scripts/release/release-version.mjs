/**
 * Pure helpers for preparing a release (used by prepare-release.mjs and the
 * "New release" workflow): working out the next version number and moving
 * the changelog's "Unreleased" notes under that version.
 *
 * Versions follow Semantic Versioning (https://semver.org): MAJOR.MINOR.PATCH,
 * optionally with a pre-release part such as "1.0.0-beta.1".
 */

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/**
 * Parse "1.2.3" or "v1.2.3-beta.1".
 * @param {string} text
 * @returns {{ major: number, minor: number, patch: number, pre: string | null } | null}
 */
export function parseVersion(text) {
  const match = VERSION.exec(text.trim().replace(/^v/, ''))
  if (!match) return null
  return { major: +match[1], minor: +match[2], patch: +match[3], pre: match[4] ?? null }
}

/**
 * Compare two versions: negative if a < b, 0 if equal, positive if a > b.
 * A pre-release sorts before its release (1.0.0-beta < 1.0.0).
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`)
  for (const key of /** @type {const} */ (['major', 'minor', 'patch'])) {
    if (x[key] !== y[key]) return x[key] - y[key]
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

/**
 * The newest version among git tags like "v0.2.0" (other tags are ignored),
 * or "0.0.0" when there are none yet.
 * @param {string[]} tags
 */
export function latestTaggedVersion(tags) {
  return tags
    .filter((tag) => /^v/.test(tag) && parseVersion(tag))
    .map((tag) => tag.slice(1))
    .reduce((best, v) => (compareVersions(v, best) > 0 ? v : best), '0.0.0')
}

/**
 * The version to release.
 *
 * `request` is "patch", "minor" or "major" (bump the latest tagged version)
 * or an exact version such as "1.0.0-beta.1". The result must be newer than
 * the latest tag, and not older than the app's current package.json version
 * (which may already have been raised by hand).
 *
 * @param {{ request: string, latestTag: string, packageVersion: string }} input
 * @returns {string}
 */
export function nextVersion({ request, latestTag, packageVersion }) {
  let version
  const base = parseVersion(latestTag)
  if (!base) throw new Error(`Not a version: ${latestTag}`)
  if (request === 'major') version = `${base.major + 1}.0.0`
  else if (request === 'minor') version = `${base.major}.${base.minor + 1}.0`
  else if (request === 'patch') version = `${base.major}.${base.minor}.${base.patch + 1}`
  else if (parseVersion(request)) version = request.replace(/^v/, '')
  else throw new Error(`Expected patch, minor, major or a version like 1.2.3, not "${request}".`)

  if (compareVersions(version, latestTag) <= 0) {
    throw new Error(`${version} isn't newer than the latest release (v${latestTag}).`)
  }
  if (compareVersions(version, packageVersion) < 0) {
    throw new Error(
      `${version} is older than the app's version in package.json (${packageVersion}). ` +
        `Choose a bigger bump, or enter ${packageVersion} as the exact version.`,
    )
  }
  return version
}

/**
 * Move the notes under "## [Unreleased]" to a new "## [version] - date"
 * section, leaving an empty Unreleased section above it for the next release.
 * Throws if there are no unreleased notes (nothing to release).
 *
 * @param {string} changelog the whole CHANGELOG.md
 * @param {string} version e.g. "0.3.0"
 * @param {string} date e.g. "2026-11-25"
 * @returns {{ changelog: string, notes: string }} the new file, and the notes released
 */
export function cutChangelog(changelog, version, date) {
  const heading = /^## \[Unreleased\][^\n]*\n/m
  const match = heading.exec(changelog)
  if (!match) throw new Error('CHANGELOG.md has no "## [Unreleased]" section.')
  const start = match.index + match[0].length
  const rest = changelog.slice(start)
  const next = /^## /m.exec(rest)
  const notes = (next ? rest.slice(0, next.index) : rest).trim()
  if (!notes) throw new Error('The "Unreleased" section of CHANGELOG.md is empty: nothing to release.')
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}.`)
  }
  const before = changelog.slice(0, match.index)
  const after = next ? rest.slice(next.index) : ''
  const updated = `${before}## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n${after ? `\n${after}` : ''}`
  return { changelog: updated, notes }
}
