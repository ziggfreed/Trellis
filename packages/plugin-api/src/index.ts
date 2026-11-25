/**
 * @trellis/plugin-api: everything needed to write a Trellis plugin.
 *
 *   manifest.ts  what a plugin declares in package.json (commands, menus, settings)
 *   api.ts       the `trellis` object a plugin's activate() function receives
 *
 * See docs/PLUGINS.md for a step-by-step guide.
 */
export * from './api'
export * from './manifest'
