# Writing plugins

Plugins are small JavaScript packages, much like VS Code extensions. This page gets you from nothing to a working plugin and explains the main ideas. The complete reference for every API is in [docs/PLUGINS.md](https://github.com/ziggfreed/Trellis/blob/main/docs/PLUGINS.md).

## What a plugin can do

- Add **commands** to the [command palette](Command-Palette).
- Add items to the **right-click menus** of commits, branches and files.
- Show a **list panel** in the sidebar (like GitHub's pull requests) and **badges** on commits in the history (like CI results).
- Add a **status bar item**, ask for input with **input boxes** and **pick lists**, show **notifications**, and fill in the **commit message**.
- Run **git commands** in a repository. Changes it makes can be undone with `Ctrl+Z`, like Trellis's own.
- Have **settings** (shown in Settings → Plugins), store data, and keep **secrets** (tokens) encrypted.
- React to **events**: switching repository, files changing, or a commit, checkout, fetch, push and so on finishing.

## Your first plugin in five minutes

1. **Create it from the template.** In a terminal:

   ```bash
   npm create trellis-plugin my-plugin
   ```

   (Until the package is published on npm, run `node packages/create-trellis-plugin/index.js my-plugin` from a clone of the [Trellis repository](https://github.com/ziggfreed/Trellis).)

   This makes a `my-plugin` folder with `package.json`, `index.js` and a README.

2. **Load it into Trellis.** Open **Settings → Plugins**, click **Load development folder…** and choose the `my-plugin` folder. It appears in the list as **Running**.

3. **Try it.** Open a repository, press `Ctrl+K` and run **Say hello**: a notification tells you which branch you're on. Right-click a commit and choose **Show commit details**.

4. **Change it.** Edit `index.js`, then click **Reload plugins** in Settings → Plugins (or run **Reload plugins** from the palette). Development folders are used in place, so there's nothing to copy or rebuild.

## How a plugin is put together

A plugin has two parts.

**`package.json`, the manifest**, says what the plugin adds, so Trellis can show its commands and menu items before running any of its code:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "engines": { "trellis": ">=0.3.0" },
  "trellis": {
    "displayName": "My Plugin",
    "contributes": {
      "commands": [
        { "id": "myPlugin.hello", "title": "Say hello" },
        { "id": "myPlugin.showCommit", "title": "Show commit details", "palette": false }
      ],
      "menus": {
        "commit": [{ "command": "myPlugin.showCommit" }]
      },
      "settings": [{ "key": "greeting", "type": "string", "default": "Hello", "title": "Greeting" }]
    }
  }
}
```

- `engines.trellis` says which versions of Trellis the plugin works with.
- `commands` appear in the palette under your plugin's name (`"palette": false` keeps a command out of it, for menu-only commands).
- `menus` puts commands on the right-click menus of `commit`, `branch` or `file`.
- `settings` appear under your plugin in Settings → Plugins.

**The entry file** (`main`) exports `activate`, which Trellis calls once when the plugin starts. It supplies the code for each command declared in the manifest:

```js
export function activate(trellis, context) {
  context.subscriptions.push(
    trellis.commands.register('myPlugin.hello', async ({ repo }) => {
      const greeting = trellis.settings.get('greeting')
      if (!repo) return trellis.ui.showMessage(`${greeting}! Open a repository first.`)
      const result = await trellis.git.run(repo, ['branch', '--show-current'])
      trellis.ui.showMessage(`${greeting}! You're on ${result.stdout.trim()}.`)
    }),

    // From a commit's menu, the command also gets the commit's hash.
    trellis.commands.register('myPlugin.showCommit', async ({ repo, sha }) => {
      const result = await trellis.git.run(repo, ['show', '--stat', '--format=%an', sha])
      trellis.ui.showMessage(result.stdout.split('\n')[0])
    }),
  )
}
```

A command's code receives where it was started from: always `repo` (or `null` on the home screen), plus `sha` from a commit menu, `branch` from a branch menu, `path` from a file menu, or `item` from a panel item. Anything pushed to `context.subscriptions` is cleaned up when the plugin stops.

## The API at a glance

| Part               | Use it to…                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `trellis.commands` | Supply the code for your commands.                                                                                                         |
| `trellis.git`      | Run git in a repository: `run(repo, args, { undoLabel })`. Pass `undoLabel` for commands that change something, so the user can undo them. |
| `trellis.repos`    | Find the active and open repositories, and listen for switching tabs, file changes and finished operations (commit, push…).                |
| `trellis.ui`       | Show messages, input boxes and pick lists; create status bar items; set the commit message; open links; supply sidebar panels.             |
| `trellis.graph`    | Show badges on commits in the history.                                                                                                     |
| `trellis.settings` | Read your settings and hear when they change.                                                                                              |
| `trellis.secrets`  | Store tokens and passwords encrypted with the operating system's keychain.                                                                 |
| `context.storage`  | Keep small bits of data between restarts.                                                                                                  |

Every part is described, with examples, in [docs/PLUGINS.md](https://github.com/ziggfreed/Trellis/blob/main/docs/PLUGINS.md#the-api). The types are in [`packages/plugin-api/src/api.ts`](https://github.com/ziggfreed/Trellis/blob/main/packages/plugin-api/src/api.ts); the template's JSDoc comments give you editor completion in plain JavaScript.

## Debugging

- **Errors while loading** or in `activate` are shown under the plugin in Settings → Plugins. **Errors in commands** appear as notifications.
- **`console.log`** output goes to the terminal Trellis was started from, so start Trellis from a terminal while developing (or run `pnpm dev` in the Trellis repository).
- **Reload plugins** restarts every plugin with fresh code.

## Learning from real plugins

The built-in plugins are complete, commented examples:

- [`plugins/open-on-remote`](https://github.com/ziggfreed/Trellis/tree/main/plugins/open-on-remote): right-click menus, settings, running git, opening links.
- [`plugins/conventional-commits`](https://github.com/ziggfreed/Trellis/tree/main/plugins/conventional-commits): pick lists, input boxes, the commit box, a status bar item, events.
- [`plugins/github`](https://github.com/ziggfreed/Trellis/tree/main/plugins/github): a sidebar panel, commit badges, secrets and network requests.

## Sharing your plugin

1. Make sure `package.json` has `engines.trellis` and the `trellis` section, and add the keyword `trellis-plugin` so people can find it.
2. **Bundle your dependencies** into the entry file. Trellis installs the package exactly as published and doesn't run `npm install`. For example: `esbuild index.js --bundle --platform=node --format=esm --outfile=dist/index.js`, with `main` set to `dist/index.js`.
3. Run `npm publish`. People can then install it from **Settings → Plugins → Install from npm…**.
