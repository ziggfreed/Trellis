# Writing Trellis plugins

Plugins add commands, right-click menu items, status bar items and settings to Trellis. They're written in JavaScript (or anything that compiles to it) and work much like VS Code extensions.

- [Quick start](#quick-start)
- [How a plugin is put together](#how-a-plugin-is-put-together)
- [The manifest (package.json)](#the-manifest-packagejson)
- [The API](#the-api)
- [Debugging](#debugging)
- [Publishing](#publishing)
- [How it works inside Trellis](#how-it-works-inside-trellis)

> **Plugins are trusted code.** They run with the same access to your computer as Trellis itself, so only install plugins from people you trust. Trellis shows this warning whenever someone installs one.

## Quick start

1. Create a plugin from the template:

   ```bash
   npm create trellis-plugin my-plugin
   ```

   (Until the package is on npm, run `node packages/create-trellis-plugin/index.js my-plugin` from a clone of this repository.)

2. In Trellis, open **Settings > Plugins**, click **Load development folder…** and choose the `my-plugin` folder.
3. Open the command palette (Ctrl/Cmd+K) and run **Say hello**. Right-click a commit to find **Show commit details**.
4. Edit `index.js`, then click **Reload plugins** to try your change.

Two complete plugins ship with Trellis and are good examples to read:

- [`plugins/open-on-remote`](../plugins/open-on-remote): right-click menus, settings, running git, opening links.
- [`plugins/conventional-commits`](../plugins/conventional-commits): pick lists, input boxes, the commit box, a status bar item, events.

## How a plugin is put together

A plugin is a folder (usually an npm package) with:

- `package.json`: the **manifest**. It names the plugin and declares its commands, menu items and settings, so Trellis can show them.
- An **entry file** (`main` in package.json) that exports `activate`. Trellis calls it once when the plugin starts, passing the `trellis` API and a `context` for this plugin. `activate` supplies the code for each declared command.

```js
// index.js
export function activate(trellis, context) {
  context.subscriptions.push(
    trellis.commands.register('myPlugin.hello', async ({ repo }) => {
      trellis.ui.showMessage(repo ? `Hello from ${repo}` : 'Hello!')
    }),
  )
}

// Optional: called when the plugin stops (after a reload, or when turned off).
export function deactivate() {}
```

Entry files can be ES modules (as above, with `"type": "module"`) or CommonJS (`exports.activate = ...`).

## The manifest (package.json)

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
        { "id": "myPlugin.inspect", "title": "Inspect commit", "palette": false }
      ],
      "menus": {
        "commit": [{ "command": "myPlugin.inspect" }]
      },
      "settings": [{ "key": "greeting", "type": "string", "default": "Hello", "title": "Greeting" }]
    }
  }
}
```

| Field                 | Required | Meaning                                                                                                                                                                      |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | yes      | The plugin's id. A valid npm package name.                                                                                                                                   |
| `version`             | yes      | Shown in the plugin manager.                                                                                                                                                 |
| `main`                | yes      | Entry file, inside the plugin folder.                                                                                                                                        |
| `engines.trellis`     | yes      | Trellis versions the plugin works with, e.g. `>=0.3.0` or `^0.3.0`. Supported forms: `*`, `1.2.3`, `>=`, `>`, `<=`, `<`, `^` and `~`, combined with spaces (all must match). |
| `description`         | no       | Shown in the plugin manager.                                                                                                                                                 |
| `trellis`             | yes      | Marks the package as a Trellis plugin.                                                                                                                                       |
| `trellis.displayName` | no       | Readable name (defaults to `name`).                                                                                                                                          |
| `trellis.contributes` | no       | Commands, menus, settings and panels (below).                                                                                                                                |

While Trellis is at version 0.x, `^0.3.0` means "0.3.x only" (like npm), because 0.x releases may change the API. Use `>=0.3.0` if you'd rather not update your plugin for every release.

### Commands

```json
"commands": [{ "id": "myPlugin.hello", "title": "Say hello", "palette": true }]
```

- `id`: unique; start it with your plugin's name.
- `title`: shown in the command palette (grouped under your plugin's name) and in menus.
- `palette`: `false` keeps it out of the palette, for commands that only make sense from a menu.

A command must be declared here before `activate` can register its code.

### Menus

```json
"menus": {
  "commit": [{ "command": "myPlugin.inspect" }],
  "branch": [{ "command": "myPlugin.branchThing" }],
  "file":   [{ "command": "myPlugin.fileThing" }]
}
```

Adds items to the bottom of the right-click menu of commits (history list), branches (sidebar, local and remote) and files (commit details, Changes view, file history). Each item runs a declared command.

### Settings

```json
"settings": [
  { "key": "greeting", "type": "string", "default": "Hello", "title": "Greeting", "description": "Shown when…" },
  { "key": "enabled", "type": "boolean", "default": true, "title": "Turn the check on" },
  { "key": "limit", "type": "number", "default": 20, "title": "How many" },
  { "key": "style", "type": "enum", "default": "auto", "options": ["auto", "github", "gitlab"], "title": "Style" }
]
```

Settings appear under the plugin in **Settings > Plugins**. Read them with `trellis.settings.get(key)`.

### Panels

```json
"panels": [{ "id": "myPlugin.list", "title": "My list" }]
```

A list in the repository sidebar. Its items come from your code; see [Panels](#panels-1) in the API section.

## The API

`activate(trellis, context)` receives:

### `context`

| Member                                                           | What it is                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `context.id`                                                     | Your plugin's id.                                                                 |
| `context.path`                                                   | Absolute path of your plugin's folder.                                            |
| `context.subscriptions`                                          | Push anything with a `dispose()` here; it's cleaned up when the plugin stops.     |
| `context.storage.get(key)` / `.set(key, value)` / `.delete(key)` | A small key/value store that survives restarts. Values must be JSON-serialisable. |

### `trellis.commands`

`register(id, run)` supplies the code for a declared command and returns a disposable. `run` receives where the command was started from:

| Field    | When it's set                                                |
| -------- | ------------------------------------------------------------ |
| `repo`   | Always: the repository's path, or `null` on the home screen. |
| `sha`    | From a commit menu: the full commit hash.                    |
| `branch` | From a branch menu: e.g. `main` or `origin/main`.            |
| `path`   | From a file menu: the file's path inside the repository.     |
| `item`   | From a panel item: the item's `id`.                          |

If `run` throws or rejects, Trellis shows the error message to the user.

### `trellis.git`

```js
const result = await trellis.git.run(repo, ['log', '-1', '--format=%s'])
console.log(result.stdout, result.stderr, result.exitCode)
```

- Commands go through the same per-repository queue as Trellis's own, so they never run at the same time as another change to that repository, and they appear in the **Git log** panel.
- A non-zero exit code rejects the promise, unless you list it: `{ okExitCodes: [0, 1] }`.
- For commands that **change** the repository, pass `{ undoLabel: 'Squash fixups' }`. The change is then recorded so the user can undo it with Ctrl/Cmd+Z, like any other Trellis operation.

### `trellis.repos`

| Method                        | What it does                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active()`                    | The repository in the active tab, or `null`.                                                                                                                                                                                                                                                                                                        |
| `open()`                      | Every repository open in a tab.                                                                                                                                                                                                                                                                                                                     |
| `onDidChangeActive(listener)` | Called with the new repository (or `null`) when the user switches tab.                                                                                                                                                                                                                                                                              |
| `onDidChange(listener)`       | Called with a repository's path when its files or refs change.                                                                                                                                                                                                                                                                                      |
| `onDidRunOperation(listener)` | Called with `{ repo, kind }` after a git command that changes a repository succeeds. `kind` is `commit`, `checkout`, `fetch`, `pull`, `push`, `merge`, `rebase`, `reset`, `cherry-pick`, `revert`, `branch`, `tag` or `stash`. Covers commands run by Trellis and plugins (including your own, so guard against loops), not ones run in a terminal. |

### `trellis.ui`

| Method                                                           | What it does                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `showMessage(text, kind?)`                                       | A notification. `kind` is `'info'` (default), `'warning'` or `'error'`.                                                                     |
| `showInput({ title, prompt?, value?, placeholder?, password? })` | Asks for text (`password: true` hides what's typed). Resolves to the text, or `undefined` if cancelled.                                     |
| `showQuickPick(items, { placeholder? })`                         | A searchable list of `{ label, detail? }`. Resolves to the chosen item, or `undefined`.                                                     |
| `createStatusBarItem()`                                          | An item in the status bar. Set `text` (empty hides it), `tooltip` and `command` (run on click).                                             |
| `setCommitMessage(repo, message)`                                | Puts a message in the repository's commit box and shows the Changes view.                                                                   |
| `openExternal(url)`                                              | Opens an `http`/`https` link in the browser.                                                                                                |
| `registerPanel(id, provider)`                                    | Supplies the items of a panel declared in `contributes.panels` (see [Panels](#panels-1)). Returns a panel with `refresh()` and `dispose()`. |

#### Panels

A panel is a collapsible list in the repository sidebar, below Stashes. Declare it, then supply its items:

```json
"contributes": { "panels": [{ "id": "todo.list", "title": "To do" }] }
```

```js
const panel = trellis.ui.registerPanel('todo.list', {
  async getItems(repo) {
    return [
      {
        id: 'fix-1',
        label: 'Fix the parser',
        description: 'today',
        icon: 'warning',
        command: 'todo.open',
      },
    ]
  },
})
context.subscriptions.push(panel)
// Later, when your data changes:
panel.refresh()
```

Each item has a `label` and optionally `description` (muted text), `tooltip`, `icon` (`success`, `failure`, `pending`, `neutral`, `info` or `warning`), and `command`: one of your commands, run with `args.item` set to the item's `id` when it's clicked. `getItems` is called when the panel is first shown for a repository and after `refresh()`, not on every file change, so it's fine to fetch from the network there. Return `[]` to hide the panel (e.g. in repositories your plugin doesn't apply to).

### `trellis.graph`

`setDecorations(repo, decorations)` shows small badges on commits in the history graph, replacing your previous badges for that repository (`[]` clears them). Each decoration is `{ sha, icon, tooltip?, url? }`, with the same icons as panel items; a badge with a `url` (http/https) opens it when clicked. The GitHub plugin uses this for CI results.

### `trellis.secrets`

Encrypted storage for tokens and passwords: `get(key)`, `set(key, value)` and `delete(key)`, all returning promises. Values are encrypted with the operating system's keychain (Keychain on macOS, DPAPI on Windows, the secret service on Linux) and each plugin sees only its own. Use it instead of `context.storage` or settings for anything secret. They're removed when the plugin is uninstalled.

### `trellis.settings`

`get(key)` returns the current value of one of your settings (or its default). `onDidChange(listener)` is called after the user changes any of them.

### `trellis.version`

The running Trellis version, e.g. `"0.3.0"`. Panels, graph decorations, secrets, `onDidRunOperation` and `password` input boxes need Trellis 0.3.0 or later, so use `"engines": { "trellis": ">=0.3.0" }` if you rely on them.

### Types

Every part of the API is typed in [`packages/plugin-api/src/api.ts`](../packages/plugin-api/src/api.ts). In plain JavaScript you can get editor completion with JSDoc:

```js
/** @param {import('@trellis/plugin-api').TrellisApi} trellis */
export function activate(trellis, context) { … }
```

## Debugging

- **Errors** thrown while loading or in `activate` are shown under the plugin in **Settings > Plugins**. Errors in commands are shown as notifications.
- **`console.log`** output goes to the terminal Trellis was started from (run Trellis from a terminal, or `pnpm dev` in this repository).
- **Reload plugins** (Settings > Plugins, or the command palette) restarts every plugin with fresh code. Development folders are loaded in place, so there's nothing to copy.
- A plugin that crashes its process takes the other plugins with it until you reload; the plugin manager says so.

## Publishing

1. Make sure `package.json` has `engines.trellis` and the `trellis` section, and add the keyword `trellis-plugin` so people can find it.
2. `npm publish`.
3. Users install it from **Settings > Plugins > Install from npm…**. Trellis picks the newest version whose `engines.trellis` accepts the running Trellis.

Trellis installs the package exactly as published and **doesn't run `npm install`**, so plugins must bundle any dependencies into their entry file (for example `esbuild index.js --bundle --platform=node --format=esm --outfile=dist/index.js`, with `main` pointing at `dist/index.js`).

Plugins can also be installed from a folder (**Install from folder…**), which copies it into Trellis's plugins folder.

## How it works inside Trellis

For contributors working on the plugin system itself:

```
 Renderer (UI)                    Main process                         Plugin host (utilityProcess)
 ─────────────                    ────────────                         ───────────────────────────
 palette, menus, status bar  ──►  plugin-ipc.ts (plugins:* IPC)
 Settings > Plugins               PluginManager  ── RPC (rpc.ts) ──►   plugin-host.ts
 prompts (use-plugin-sync)   ◄──  askUi()        ◄── requests ───      builds `trellis` for each plugin,
                                  git.run via repo queue               calls activate()
```

| File                                                  | Role                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-api`                                 | Manifest parsing/validation, engine version check, and the API types.                                                         |
| `apps/desktop/src/main/plugins/discovery.ts`          | Finds built-in, installed and development plugins and checks them.                                                            |
| `apps/desktop/src/main/plugins/plugin-manager.ts`     | Starts/stops the host, tracks plugin state, serves the host's requests (git, UI).                                             |
| `apps/desktop/src/main/plugins/plugin-host.ts`        | The separate process that loads plugins and implements the `trellis` object.                                                  |
| `apps/desktop/src/main/plugins/rpc.ts`, `protocol.ts` | The request/response messages between main and the host.                                                                      |
| `apps/desktop/src/main/plugins/install.ts`, `tar.ts`  | Installing from a folder or npm (with a small, path-safe tar reader), uninstalling.                                           |
| `apps/desktop/src/main/plugins/plugin-ipc.ts`         | Folder locations and the `plugins:*` IPC channels.                                                                            |
| `apps/desktop/src/main/plugins/operation-kind.ts`     | Turns finished git commands into `onDidRunOperation` events.                                                                  |
| `apps/desktop/src/main/services/secret-store.ts`      | Encrypted storage behind `trellis.secrets` (and the AI key).                                                                  |
| `apps/desktop/src/renderer/src/features/plugins/`     | Plugin store, palette commands, menu items, status bar items, panels, commit badges, prompts, and the Settings > Plugins tab. |
| `plugins/`                                            | Built-in plugins, shipped in the installer's resources folder.                                                                |
| `packages/create-trellis-plugin`                      | The `npm create trellis-plugin` scaffolder and its template.                                                                  |

Plugins run in a separate process so a slow or crashing plugin can't freeze or take down the app. Changing which plugins run (install, uninstall, turn on/off, reload) restarts that process, which keeps the lifecycle simple: every plugin always starts from a clean state.
