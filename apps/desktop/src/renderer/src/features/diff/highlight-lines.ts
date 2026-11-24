/**
 * Syntax highlighting for plain lines of code (used by the hunk view, which
 * isn't a CodeMirror editor).
 *
 * The text is parsed with the language's Lezer parser (the same one the
 * diff editor uses), and each token gets a CSS class like "tok-keyword".
 * The colours for those classes are in styles/globals.css, taken from the
 * same --syntax-* variables as the editor, so both match the theme.
 *
 * Hunks are fragments of a file, so a hunk that starts inside a comment or
 * string may be coloured slightly wrongly. That's an accepted trade-off.
 */
import type { Parser } from '@lezer/common'
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight'

export interface Segment {
  text: string
  /** CSS classes, e.g. "tok-keyword", or "" for plain text. */
  className: string
}

const tokenClasses = tagHighlighter([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: t.tagName, class: 'tok-tag' },
  { tag: [t.attributeName, t.propertyName], class: 'tok-attribute' },
  { tag: t.heading, class: 'tok-heading' },
])

/** Highlight `text`, returning one array of segments per line. */
export function highlightLines(text: string, parser: Parser): Segment[][] {
  const lines: Segment[][] = [[]]
  highlightCode(
    text,
    parser.parse(text),
    tokenClasses,
    (code, className) => lines.at(-1)!.push({ text: code, className }),
    () => lines.push([]),
  )
  return lines
}
