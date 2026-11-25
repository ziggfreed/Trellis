/**
 * Finds syntax highlighting for a file based on its name.
 *
 * @codemirror/language-data knows ~150 languages but loads each one only
 * when first needed (dynamic import), so the app stays small. The language
 * list itself (and CodeMirror, which it needs) is also loaded on first use,
 * keeping it out of the start-up bundle.
 */
import { useEffect, useState } from 'react'
import type { Parser } from '@lezer/common'
import type { LanguageSupport } from '@codemirror/language'

const cache = new Map<string, Promise<LanguageSupport | null>>()

/** The parser for `path`'s language (loaded on first use), or null if unknown. */
export function useLanguageParser(path: string): Parser | null {
  const [state, setState] = useState<{ path: string; parser: Parser | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadLanguage(path).then((language) => {
      if (!cancelled) setState({ path, parser: language?.language.parser ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [path])
  return state?.path === path ? state.parser : null
}

/** Load the language for `path`, or null if we don't recognise it. */
export async function loadLanguage(path: string): Promise<LanguageSupport | null> {
  const [{ languages }, { LanguageDescription }] = await Promise.all([
    import('@codemirror/language-data'),
    import('@codemirror/language'),
  ])
  const description = LanguageDescription.matchFilename(languages, path)
  if (!description) return null
  let promise = cache.get(description.name)
  if (!promise) {
    promise = description.load().catch(() => null)
    cache.set(description.name, promise)
  }
  return promise
}
