/**
 * CodeMirror styling for the diff viewer.
 *
 * Every colour comes from a CSS variable defined in styles/globals.css, so
 * the editor follows the app's light/dark theme automatically (and plugin
 * themes later) without rebuilding the editor.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'transparent' },
  '.cm-gutters': {
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--ring) 35%, transparent) !important',
  },

  // --- Diff colours (override @codemirror/merge's defaults) ---
  // Unified view: inserted lines are in the document, deleted ones are shown
  // above them as read-only "chunks".
  '.cm-changedLine, &.cm-merge-b .cm-changedLine, .cm-inlineChangedLine': {
    backgroundColor: 'var(--diff-insert) !important',
  },
  '.cm-deletedChunk, &.cm-merge-a .cm-changedLine': {
    backgroundColor: 'var(--diff-delete) !important',
  },
  '.cm-changedText, &.cm-merge-b .cm-changedText': {
    background: 'var(--diff-insert-strong) !important',
  },
  '.cm-deletedChunk .cm-deletedText, &.cm-merge-a .cm-changedText': {
    background: 'var(--diff-delete-strong) !important',
  },
  '.cm-changedLineGutter, &.cm-merge-b .cm-changedLineGutter': {
    background: 'var(--change-added) !important',
  },
  '.cm-deletedLineGutter, &.cm-merge-a .cm-changedLineGutter': {
    background: 'var(--change-deleted) !important',
  },
  '.cm-collapsedLines': {
    background: 'var(--muted) !important',
    color: 'var(--muted-foreground) !important',
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '11px',
  },
})

const highlightStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword],
    color: 'var(--syntax-keyword)',
  },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syntax-number)' },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: 'var(--syntax-function)',
  },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syntax-type)' },
  { tag: [t.tagName], color: 'var(--syntax-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--syntax-attribute)' },
  { tag: t.heading, fontWeight: 'bold', color: 'var(--syntax-keyword)' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
])

/** Extensions that style an editor: add to every diff editor. */
export const diffEditorTheme = [editorTheme, syntaxHighlighting(highlightStyle)]
