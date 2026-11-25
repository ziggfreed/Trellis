/**
 * Editing a working-tree file right in its diff (Changes view > Edit).
 *
 * A CodeMirror editor holds the file as it is on disk, with the version
 * git has (the staged one, or the last commit) shown inline as the
 * "before", so you can see your changes while you tweak them. Save
 * (Ctrl/Cmd+S) writes the file; the diff and the changes list then refresh
 * from disk as usual.
 *
 * Loaded on demand (it's part of the CodeMirror chunk, see diff-panel.tsx).
 */
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { unifiedMergeView } from '@codemirror/merge'
import { loadLanguage } from './load-language'
import { diffEditorTheme } from './editor-theme'

interface DiffEditorProps {
  /** The version git has (shown as deleted/changed lines). */
  original: string
  /** The file on disk, which is what gets edited. */
  initial: string
  path: string
  /** Called with the full text on every edit. */
  onChange: (text: string) => void
  /** Called for Ctrl/Cmd+S. */
  onSave: () => void
}

export function DiffEditor({ original, initial, path, onChange, onSave }: DiffEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Callbacks change on every render; the editor should keep the latest ones
  // without being re-created (which would lose the cursor and undo history).
  const callbacks = useRef({ onChange, onSave })
  useEffect(() => {
    callbacks.current = { onChange, onSave }
  })

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    let view: EditorView | null = null
    let destroyed = false
    void loadLanguage(path).then((language) => {
      if (destroyed) return
      view = new EditorView({
        parent,
        doc: initial,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => (callbacks.current.onSave(), true) },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.contentAttributes.of({ 'aria-label': `Edit ${path}` }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
          diffEditorTheme,
          language ?? [],
          unifiedMergeView({ original, mergeControls: false }),
          EditorState.tabSize.of(4),
        ],
      })
      view.focus()
    })
    return () => {
      destroyed = true
      view?.destroy()
    }
    // Only re-create for a different file; edits live in the editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return (
    <div
      ref={containerRef}
      data-testid="diff-editor"
      className="h-full overflow-auto select-text [&_.cm-editor]:min-h-full"
    />
  )
}
