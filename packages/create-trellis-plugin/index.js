#!/usr/bin/env node
/**
 * npm create trellis-plugin <name>
 *
 * Creates a folder with a working Trellis plugin to start from, and explains
 * how to load it into Trellis while you develop it.
 */
import { resolve } from 'node:path'
import { scaffold } from './scaffold.js'

const name = process.argv[2] ?? ''
try {
  const folder = resolve(name)
  const files = await scaffold(folder, name)
  console.log(`\nCreated ${name} in ${folder}:\n`)
  for (const file of files) console.log(`  ${file}`)
  console.log(`
Next:
  1. In Trellis, open Settings > Plugins and click "Load development folder…".
     Choose ${folder}.
  2. Open the command palette (Ctrl/Cmd+K) and run "Say hello".
  3. Edit index.js, then click "Reload plugins" to see your changes.

The guide to writing plugins: https://github.com/ziggfreed/trellis/blob/main/docs/PLUGINS.md
`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
