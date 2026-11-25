/**
 * Conventional Commits: a built-in Trellis plugin, and an example of the
 * plugin API's prompts (pick lists and input boxes), the commit box, status
 * bar items, settings and events.
 *
 * - "Write a conventional commit message…" (command palette) asks for the
 *   type, scope and description, then puts the message in the commit box.
 * - The status bar warns when unpushed commits on the current branch don't
 *   follow the convention; click it to list them.
 */
import { formatMessage, isConventional, parseTypes, TYPE_HELP } from './lib.js'

/** @typedef {import('@trellis/plugin-api').TrellisApi} TrellisApi */
/** @typedef {import('@trellis/plugin-api').PluginContext} PluginContext */

/**
 * @param {TrellisApi} trellis
 * @param {PluginContext} context
 */
export function activate(trellis, context) {
  const types = () => parseTypes(String(trellis.settings.get('types') ?? ''))

  // --- Writing a message ----------------------------------------------------

  context.subscriptions.push(
    trellis.commands.register('conventionalCommits.compose', async ({ repo }) => {
      if (!repo) {
        trellis.ui.showMessage('Open a repository first.', 'warning')
        return
      }
      const picked = await trellis.ui.showQuickPick(
        types().map((type) => ({ label: type, detail: TYPE_HELP[type] ?? '' })),
        { placeholder: 'What kind of change is this?' },
      )
      if (!picked) return
      const scope = await trellis.ui.showInput({
        title: `${picked.label}: scope (optional)`,
        prompt: 'The part of the project this changes, e.g. "parser". Leave empty for none.',
      })
      if (scope === undefined) return
      const description = await trellis.ui.showInput({
        title: 'Description',
        prompt: 'A short summary in the present tense, e.g. "add support for arrays".',
      })
      if (!description?.trim()) return
      const breaking = await trellis.ui.showQuickPick(
        [
          { label: 'No', detail: 'Nothing that depends on this needs to change' },
          { label: 'Yes, a breaking change', detail: 'Adds "!" to the type' },
        ],
        { placeholder: 'Does this break anything that depends on it?' },
      )
      if (!breaking) return
      await trellis.ui.setCommitMessage(
        repo,
        formatMessage({
          type: picked.label,
          scope,
          breaking: breaking.label !== 'No',
          description,
        }),
      )
    }),
  )

  // --- Checking unpushed commits -------------------------------------------

  const status = trellis.ui.createStatusBarItem()
  status.command = 'conventionalCommits.showUnconventional'
  context.subscriptions.push(status)
  /** @type {{ repo: string | null, subjects: string[] }} */
  let lastCheck = { repo: null, subjects: [] }

  /** Subjects of commits on the current branch that aren't on its upstream yet. */
  async function unpushedSubjects(/** @type {string} */ repo) {
    const result = await trellis.git.run(repo, ['log', '--format=%s', '@{upstream}..HEAD'], {
      okExitCodes: [0, 128], // 128: no upstream (nothing to compare with)
    })
    return result.exitCode === 0 ? result.stdout.split('\n').filter(Boolean) : []
  }

  async function check() {
    const repo = await trellis.repos.active()
    if (!repo || !trellis.settings.get('checkUnpushed')) {
      status.text = ''
      return
    }
    const allowed = types()
    const subjects = (await unpushedSubjects(repo)).filter((s) => !isConventional(s, allowed))
    lastCheck = { repo, subjects }
    const n = subjects.length
    status.text = n ? `⚠ ${n} non-conventional ${n === 1 ? 'commit' : 'commits'}` : ''
    status.tooltip =
      'Unpushed commits whose messages don’t follow Conventional Commits. Click to list them.'
  }
  const recheck = () => void check().catch(() => {})

  context.subscriptions.push(
    trellis.commands.register('conventionalCommits.showUnconventional', () => {
      if (!lastCheck.subjects.length) return
      void trellis.ui.showQuickPick(
        lastCheck.subjects.map((subject) => ({ label: subject })),
        { placeholder: 'These unpushed commits don’t follow Conventional Commits' },
      )
    }),
    trellis.repos.onDidChangeActive(recheck),
    trellis.repos.onDidChange((repo) => {
      if (repo === lastCheck.repo || lastCheck.repo === null) recheck()
    }),
    trellis.settings.onDidChange(recheck),
  )
  recheck()
}
