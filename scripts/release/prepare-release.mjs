/**
 * Prepares a release: picks the next version, sets it in
 * apps/desktop/package.json, and moves CHANGELOG.md's "Unreleased" notes
 * under it. Run by the "New release" workflow (.github/workflows/new-release.yml),
 * which then commits, tags and builds. It only edits files; it never runs git
 * commands that change anything, so it's safe to try locally:
 *
 *   node scripts/release/prepare-release.mjs minor --dry-run
 *
 * Arguments: patch | minor | major | an exact version (e.g. 1.0.0-beta.1),
 * and optionally --dry-run (show what would change, write nothing).
 *
 * Prints the version, and the notes to release. When run in GitHub Actions
 * it also sets the step outputs `version`, `tag` and `notes_file`.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cutChangelog, latestTaggedVersion, nextVersion } from './release-version.mjs'

const root = join(import.meta.dirname, '..', '..')
const packagePath = join(root, 'apps', 'desktop', 'package.json')
const changelogPath = join(root, 'CHANGELOG.md')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const request = args.find((a) => !a.startsWith('--'))
if (!request) {
  console.error('Usage: prepare-release.mjs <patch|minor|major|x.y.z> [--dry-run]')
  process.exit(2)
}

try {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  const latestTag = latestTaggedVersion(tags)
  const pkgText = readFileSync(packagePath, 'utf8')
  const pkg = JSON.parse(pkgText)
  const version = nextVersion({ request, latestTag, packageVersion: pkg.version })
  const date = new Date().toISOString().slice(0, 10)
  const { changelog, notes } = cutChangelog(readFileSync(changelogPath, 'utf8'), version, date)

  console.log(`Latest release: v${latestTag}. App version in package.json: ${pkg.version}.`)
  console.log(`New version: ${version}${dryRun ? ' (dry run: nothing written)' : ''}\n`)
  console.log(notes)

  const notesFile = join(root, 'release-notes.md')
  if (!dryRun) {
    // Replace just the version line, keeping the file's formatting.
    writeFileSync(
      packagePath,
      pkgText.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`),
    )
    writeFileSync(changelogPath, changelog)
  }
  writeFileSync(notesFile, `${notes}\n`)

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\ntag=v${version}\nnotes_file=${notesFile}\n`,
    )
  }
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
