/**
 * Open on Remote: a built-in Trellis plugin, and a small example of the
 * plugin API (commands, right-click menus, settings, running git, opening
 * links).
 *
 * Adds "Open … on remote" to the commit, branch and file menus, and "Open
 * repository on remote" to the command palette. The links are built from the
 * remote's URL (see lib.js).
 */
import { branchUrl, commitUrl, fileUrl, guessStyle, webUrlFromRemote } from './lib.js'

/** @typedef {import('@trellis/plugin-api').TrellisApi} TrellisApi */
/** @typedef {import('@trellis/plugin-api').PluginContext} PluginContext */
/** @typedef {import('@trellis/plugin-api').CommandArgs} CommandArgs */

/**
 * @param {TrellisApi} trellis
 * @param {PluginContext} context
 */
export function activate(trellis, context) {
  /**
   * The repository's website and how to build links for it, or null (after
   * telling the user why) if there isn't one.
   * @param {string | null} repo
   */
  async function site(repo) {
    if (!repo) {
      trellis.ui.showMessage('Open a repository first.', 'warning')
      return null
    }
    const remote = String(trellis.settings.get('remote') || 'origin')
    const result = await trellis.git.run(repo, ['remote', 'get-url', remote], {
      okExitCodes: [0, 2],
    })
    const web = result.exitCode === 0 ? webUrlFromRemote(result.stdout) : null
    if (!web) {
      trellis.ui.showMessage(
        result.exitCode === 0
          ? `The remote “${remote}” isn’t on a website Trellis can link to.`
          : `This repository has no remote called “${remote}”. You can change the remote in Settings > Plugins.`,
        'warning',
      )
      return null
    }
    /** @type {string} */
    const setting = trellis.settings.get('style')
    const style = /** @type {import('./lib.js').SiteStyle} */ (
      setting === 'auto' ? guessStyle(web) : setting
    )
    return { repo, remote, web, style }
  }

  /**
   * The branch name on the remote: "origin/main" -> "main"; a local branch
   * uses its upstream's name when it has one.
   * @param {string} repo
   * @param {string} remote
   * @param {string} branch
   */
  async function remoteBranchName(repo, remote, branch) {
    if (branch.startsWith(`${remote}/`)) return branch.slice(remote.length + 1)
    const upstream = await trellis.git.run(
      repo,
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`],
      { okExitCodes: [0, 128] },
    )
    const name = upstream.stdout.trim()
    return upstream.exitCode === 0 && name.startsWith(`${remote}/`)
      ? name.slice(remote.length + 1)
      : branch
  }

  /**
   * Register a command that opens a link built from the site and the
   * command's arguments.
   * @param {string} id
   * @param {(s: NonNullable<Awaited<ReturnType<typeof site>>>, args: CommandArgs) => Promise<string | null> | string | null} link
   */
  function linkCommand(id, link) {
    context.subscriptions.push(
      trellis.commands.register(id, async (args) => {
        const s = await site(args.repo)
        if (!s) return
        const url = await link(s, args)
        if (url) await trellis.ui.openExternal(url)
      }),
    )
  }

  linkCommand('openOnRemote.repo', (s) => s.web)
  linkCommand('openOnRemote.commit', (s, args) =>
    args.sha ? commitUrl(s.web, s.style, args.sha) : null,
  )
  linkCommand('openOnRemote.branch', async (s, args) =>
    args.branch
      ? branchUrl(s.web, s.style, await remoteBranchName(s.repo, s.remote, args.branch))
      : null,
  )
  linkCommand('openOnRemote.file', async (s, args) => {
    if (!args.path) return null
    // Link to the file as it is in the checked-out commit.
    const head = await trellis.git.run(s.repo, ['rev-parse', 'HEAD'])
    return fileUrl(s.web, s.style, head.stdout.trim(), args.path)
  })
}
