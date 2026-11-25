# {{displayName}}

A plugin for [Trellis](https://github.com/ziggfreed/trellis), the open-source git client.

## Developing

1. In Trellis, open **Settings > Plugins** and click **Load development folder…**, then choose this folder.
2. Open the command palette (Ctrl/Cmd+K) and run **Say hello**, or right-click a commit and choose **Show commit details**.
3. After editing `index.js` or `package.json`, click **Reload plugins**.

Errors from `activate()` are shown under the plugin in **Settings > Plugins**. `console.log` output goes to the terminal Trellis was started from.

## Publishing

Publish to npm as usual (`npm publish`). Users install it from **Settings > Plugins > Install from npm…**.

Trellis doesn't run `npm install` for plugins, so if you use other packages, bundle them into one file first (for example with esbuild) and point `main` at the bundle.
