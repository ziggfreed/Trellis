// Tests for release-version.mjs. Run with: node --test scripts/release/
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compareVersions,
  cutChangelog,
  latestTaggedVersion,
  nextVersion,
} from './release-version.mjs'

describe('versions', () => {
  it('finds the latest v-tag, ignoring others', () => {
    assert.equal(latestTaggedVersion(['v0.1.0', 'v0.10.0', 'v0.2.0', 'nightly']), '0.10.0')
    assert.equal(latestTaggedVersion([]), '0.0.0')
  })

  it('orders versions, with pre-releases before their release', () => {
    assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
    assert.ok(compareVersions('1.0.0-beta.2', '1.0.0') < 0)
    assert.ok(compareVersions('1.0.0-beta.10', '1.0.0-beta.2') > 0)
  })

  it('bumps the latest tag', () => {
    const base = { latestTag: '0.2.0', packageVersion: '0.2.0' }
    assert.equal(nextVersion({ ...base, request: 'patch' }), '0.2.1')
    assert.equal(nextVersion({ ...base, request: 'minor' }), '0.3.0')
    assert.equal(nextVersion({ ...base, request: 'major' }), '1.0.0')
    assert.equal(nextVersion({ ...base, request: 'v1.0.0-beta.1' }), '1.0.0-beta.1')
  })

  it('refuses versions that go backwards', () => {
    assert.throws(() => nextVersion({ request: '0.2.0', latestTag: '0.2.0', packageVersion: '0.2.0' }))
    // package.json was already raised to 0.3.0 by hand, so 0.2.1 would go backwards.
    assert.throws(
      () => nextVersion({ request: 'patch', latestTag: '0.2.0', packageVersion: '0.3.0' }),
      /older than the app's version/,
    )
    assert.throws(() => nextVersion({ request: 'huge', latestTag: '0.2.0', packageVersion: '0.2.0' }))
  })
})

describe('cutChangelog', () => {
  const changelog = `# Changelog

Intro.

## [Unreleased]

### Added

- A thing.

## [0.2.0] - 2026-11-01

- Old.
`

  it('moves the unreleased notes under the new version', () => {
    const { changelog: updated, notes } = cutChangelog(changelog, '0.3.0', '2026-11-25')
    assert.equal(notes, '### Added\n\n- A thing.')
    assert.equal(
      updated,
      `# Changelog

Intro.

## [Unreleased]

## [0.3.0] - 2026-11-25

### Added

- A thing.

## [0.2.0] - 2026-11-01

- Old.
`,
    )
  })

  it('refuses an empty Unreleased section or a version already listed', () => {
    const empty = changelog.replace('### Added\n\n- A thing.\n\n', '')
    assert.throws(() => cutChangelog(empty, '0.3.0', '2026-11-25'), /empty/)
    assert.throws(() => cutChangelog(changelog, '0.2.0', '2026-11-25'), /already has/)
  })
})
