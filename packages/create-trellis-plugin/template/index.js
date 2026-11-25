/**
 * {{displayName}}: a Trellis plugin.
 *
 * Trellis calls activate() once when the plugin starts. Use it to register
 * the code for the commands declared in package.json. Anything pushed to
 * context.subscriptions is cleaned up when the plugin stops.
 *
 * The full API is described in docs/PLUGINS.md in the Trellis repository.
 */

/** @typedef {import('@trellis/plugin-api').TrellisApi} TrellisApi */
/** @typedef {import('@trellis/plugin-api').PluginContext} PluginContext */

/**
 * @param {TrellisApi} trellis
 * @param {PluginContext} context
 */
export function activate(trellis, context) {
  // "Say hello" in the command palette.
  context.subscriptions.push(
    trellis.commands.register('{{prefix}}.hello', async ({ repo }) => {
      const greeting = trellis.settings.get('greeting')
      if (!repo) {
        trellis.ui.showMessage(`${greeting}! Open a repository and try again.`)
        return
      }
      const branch = await trellis.git.run(repo, ['branch', '--show-current'])
      trellis.ui.showMessage(`${greeting}! You're on ${branch.stdout.trim() || 'a detached HEAD'}.`)
    }),
  )

  // "Show commit details" in the right-click menu of a commit.
  context.subscriptions.push(
    trellis.commands.register('{{prefix}}.showCommit', async ({ repo, sha }) => {
      if (!repo || !sha) return
      const stats = await trellis.git.run(repo, ['show', '--stat', '--format=%an, %ar', sha])
      const [author, ...files] = stats.stdout.trim().split('\n')
      trellis.ui.showMessage(`${author}: ${files.at(-1)?.trim() ?? 'no changes'}`)
    }),
  )
}

/** Optional: called when the plugin stops. */
export function deactivate() {}
