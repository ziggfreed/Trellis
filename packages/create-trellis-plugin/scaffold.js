/**
 * Creates a new plugin folder from ./template, filling in the plugin's
 * name. Used by index.js (the `npm create trellis-plugin` command) and by
 * the tests.
 *
 * Template files contain placeholders:
 *   {{name}}         the package name, e.g. "hello-trellis"
 *   {{displayName}}  a readable name, e.g. "Hello Trellis"
 *   {{prefix}}       a command id prefix, e.g. "helloTrellis"
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'template')

/**
 * An npm package name: lowercase letters, digits, "-", "." and "_".
 * Returns an error message, or null if the name is fine.
 * @param {string} name
 */
export function checkName(name) {
  if (!name) return 'Give your plugin a name, e.g. npm create trellis-plugin my-plugin'
  if (!/^[a-z0-9][a-z0-9-._]*$/.test(name)) {
    return `"${name}" can't be a package name. Use lowercase letters, digits and dashes, e.g. my-plugin.`
  }
  return null
}

/**
 * "hello-trellis" -> { displayName: "Hello Trellis", prefix: "helloTrellis" }
 * @param {string} name
 */
export function namesFor(name) {
  const words = name.split(/[-._]+/).filter(Boolean)
  return {
    name,
    displayName: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
    prefix: words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''),
  }
}

/**
 * Copy the template into `folder` (which must not exist yet).
 * @param {string} folder
 * @param {string} name
 * @returns {Promise<string[]>} the files written, relative to `folder`
 */
export async function scaffold(folder, name) {
  const problem = checkName(name)
  if (problem) throw new Error(problem)
  if (existsSync(folder)) throw new Error(`${folder} already exists.`)
  const vars = namesFor(name)
  /** @param {string} text */
  const fill = (text) =>
    text.replace(
      /\{\{(name|displayName|prefix)\}\}/g,
      (_, key) => vars[/** @type {keyof typeof vars} */ (key)],
    )

  const written = []
  for (const file of await readdir(TEMPLATE, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue
    const source = join(file.parentPath, file.name)
    // npm drops files called .gitignore when publishing, so it's stored as "gitignore".
    const relative = source
      .slice(TEMPLATE.length + 1)
      .replace(/(^|[/\\])gitignore$/, '$1.gitignore')
    const target = join(folder, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, fill(await readFile(source, 'utf8')))
    written.push(relative.replaceAll('\\', '/'))
  }
  return written.sort()
}
