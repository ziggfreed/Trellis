/**
 * Shows the difference between two versions of a file using CodeMirror.
 *
 * - `unified`: one editor showing the new file, with deleted lines shown
 *   above the lines that replaced them (like `git diff`).
 * - `split`: old and new side by side.
 *
 * Unchanged stretches are collapsed to keep the focus on the changes.
 * CodeMirror manages its own DOM, so we create it in an effect and destroy
 * it when the inputs change.
 */
import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers, highlightSpecialChars } from '@codemirror/view'
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { loadLanguage } from './load-language'
import { diffEditorTheme } from './editor-theme'

interface DiffViewerProps {
  oldText: string
  newText: string
  /** File path, used to choose syntax highlighting. */
  path: string
  layout: 'unified' | 'split'
}

/** Hide long unchanged regions, keeping 3 lines of context around changes. */
const COLLAPSE = { margin: 3, minSize: 6 }

function baseExtensions(language: Extension | null): Extension[] {
  return [
    lineNumbers(),
    highlightSpecialChars(),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    diffEditorTheme,
    language ?? [],
  ]
}

export function DiffViewer({ oldText, newText, path, layout }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    let destroyed = false
    let destroy = () => {}

    // Load the language first (usually cached), then build the editor.
    void loadLanguage(path).then((language) => {
      if (destroyed) return
      if (layout === 'split') {
        const view = new MergeView({
          a: { doc: oldText, extensions: baseExtensions(language) },
          b: { doc: newText, extensions: baseExtensions(language) },
          parent,
          gutter: true,
          collapseUnchanged: COLLAPSE,
        })
        destroy = () => view.destroy()
      } else {
        const view = new EditorView({
          parent,
          doc: newText,
          extensions: [
            ...baseExtensions(language),
            unifiedMergeView({
              original: oldText,
              mergeControls: false,
              collapseUnchanged: COLLAPSE,
            }),
          ],
        })
        destroy = () => view.destroy()
      }
    })

    return () => {
      destroyed = true
      destroy()
    }
  }, [oldText, newText, path, layout])

  // The split view sizes itself to its content, so this wrapper scrolls it.
  return (
    <div
      ref={containerRef}
      data-testid="diff-viewer"
      className="h-full overflow-auto select-text [&_.cm-mergeView]:min-h-full"
    />
  )
}
