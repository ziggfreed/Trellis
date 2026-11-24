/**
 * Finds syntax highlighting for a file based on its name.
 *
 * @codemirror/language-data knows ~150 languages but loads each one only
 * when first needed (dynamic import), so the app stays small.
 */
import type { LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { LanguageDescription } from '@codemirror/language'

const cache = new Map<string, Promise<LanguageSupport | null>>()

/** Load the language for `path`, or null if we don't recognise it. */
export function loadLanguage(path: string): Promise<LanguageSupport | null> {
  const description = LanguageDescription.matchFilename(languages, path)
  if (!description) return Promise.resolve(null)
  let promise = cache.get(description.name)
  if (!promise) {
    promise = description.load().catch(() => null)
    cache.set(description.name, promise)
  }
  return promise
}
