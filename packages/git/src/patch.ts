/**
 * Parsing `git diff` output ("patches") and building partial patches, which
 * is how hunk and line staging works:
 *
 *   1. Get the diff for one file (`git diff` or `git diff --cached`).
 *   2. The user picks some changed lines.
 *   3. `buildPartialPatch` makes a smaller patch containing only those.
 *   4. `git apply --cached` (stage) or `git apply --cached --reverse`
 *      (unstage) or `git apply --reverse` (discard) applies it.
 *
 * Pure functions only (no git calls), so they're easy to test.
 *
 * A patch looks like this:
 *
 *   diff --git a/greet.ts b/greet.ts      <- file header (kept as-is)
 *   index 1a2b3c4..5d6e7f8 100644
 *   --- a/greet.ts
 *   +++ b/greet.ts
 *   @@ -1,3 +1,4 @@ export function    <- hunk header: old start,count  new start,count
 *    unchanged line                     <- ' ' context
 *   -removed line                       <- '-' only in the old version
 *   +added line                         <- '+' only in the new version
 *   \ No newline at end of file         <- marker for the line above it
 */

export type PatchLineKind = 'context' | 'add' | 'delete'

export interface PatchLine {
  kind: PatchLineKind
  /** The line's text without the leading ' ', '+' or '-'. */
  text: string
  /** Line number in the old version (context and deleted lines). */
  oldLine: number | null
  /** Line number in the new version (context and added lines). */
  newLine: number | null
  /** The line has no newline at its end (it's the last line of the file). */
  noNewline: boolean
}

export interface Hunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** Text after the second @@, usually the enclosing function name. */
  context: string
  lines: PatchLine[]
}

export interface FilePatch {
  /** Lines before the first hunk (diff --git, index, ---, +++ ...). */
  header: string[]
  hunks: Hunk[]
  /** True when git reported "Binary files ... differ" (no hunks to show). */
  binary: boolean
  /** True for a newly added file. */
  isNew: boolean
  /** True for a deleted file. */
  isDeleted: boolean
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

/** Parse the diff of a single file. Returns null for empty output (no changes). */
export function parsePatch(text: string): FilePatch | null {
  if (text.trim() === '') return null
  const lines = text.split('\n')
  // A trailing newline produces one empty string at the end; drop it.
  if (lines.at(-1) === '') lines.pop()

  const patch: FilePatch = { header: [], hunks: [], binary: false, isNew: false, isDeleted: false }
  let hunk: Hunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    const header = HUNK_HEADER.exec(line)
    if (header) {
      hunk = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        context: header[5] ?? '',
        lines: [],
      }
      patch.hunks.push(hunk)
      oldLine = hunk.oldStart
      newLine = hunk.newStart
      continue
    }

    if (!hunk) {
      patch.header.push(line)
      if (line.startsWith('Binary files ') || line === 'GIT binary patch') patch.binary = true
      if (line.startsWith('new file mode')) patch.isNew = true
      if (line.startsWith('deleted file mode')) patch.isDeleted = true
      continue
    }

    if (line.startsWith('\\')) {
      // "\ No newline at end of file" applies to the line before it.
      const previous = hunk.lines.at(-1)
      if (previous) previous.noNewline = true
    } else if (line.startsWith('+')) {
      hunk.lines.push({
        kind: 'add',
        text: line.slice(1),
        oldLine: null,
        newLine: newLine++,
        noNewline: false,
      })
    } else if (line.startsWith('-')) {
      hunk.lines.push({
        kind: 'delete',
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: null,
        noNewline: false,
      })
    } else {
      // Context line. (An empty context line can lose its leading space in some tools.)
      hunk.lines.push({
        kind: 'context',
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
        noNewline: false,
      })
    }
  }
  return patch
}

/** Identifies one line in a patch: "<hunk index>:<line index>". */
export type LineId = `${number}:${number}`

export const lineId = (hunk: number, line: number): LineId => `${hunk}:${line}`

/** All changed (added or deleted) lines of a hunk, e.g. to select a whole hunk. */
export function hunkLineIds(patch: FilePatch, hunkIndex: number): LineId[] {
  const ids: LineId[] = []
  patch.hunks[hunkIndex]?.lines.forEach((line, i) => {
    if (line.kind !== 'context') ids.push(lineId(hunkIndex, i))
  })
  return ids
}

/** All changed lines in the whole patch. */
export function allLineIds(patch: FilePatch): LineId[] {
  return patch.hunks.flatMap((_, i) => hunkLineIds(patch, i))
}

/**
 * Build a patch containing only the selected changed lines.
 *
 * `reverse` describes how the patch will be applied:
 * - false: applied forwards to the OLD side (staging lines from the working
 *   tree into the index). Unselected deletions must stay in the result, so
 *   they become context; unselected additions are dropped.
 * - true: applied in reverse to the NEW side (unstaging lines from the index,
 *   or discarding lines from the working tree). Unselected additions must
 *   stay, so they become context; unselected deletions are dropped.
 *
 * Returns null if no changed line is selected.
 */
export function buildPartialPatch(
  patch: FilePatch,
  selected: ReadonlySet<string>,
  reverse: boolean,
): string | null {
  const out: string[] = [...patch.header]
  // Running difference between new and old line numbers caused by the hunks
  // we've written so far, used to compute each hunk's new start line.
  let offset = 0
  let anySelected = false

  patch.hunks.forEach((hunk, hunkIndex) => {
    const body: string[] = []
    let oldCount = 0
    let newCount = 0
    let hasChange = false

    const push = (prefix: ' ' | '+' | '-', line: PatchLine) => {
      body.push(prefix + line.text)
      if (line.noNewline) body.push('\\ No newline at end of file')
      if (prefix !== '+') oldCount++
      if (prefix !== '-') newCount++
    }

    hunk.lines.forEach((line, lineIndex) => {
      const isSelected = selected.has(lineId(hunkIndex, lineIndex))
      if (line.kind === 'context') push(' ', line)
      else if (isSelected) {
        push(line.kind === 'add' ? '+' : '-', line)
        hasChange = true
      } else if (line.kind === 'add' && reverse) push(' ', line)
      else if (line.kind === 'delete' && !reverse) push(' ', line)
      // Otherwise the unselected line is left out entirely.
    })

    if (!hasChange) return
    anySelected = true

    // Line numbers for the hunk header. git positions a patch using the side
    // it is applied to, and that side is never changed by the rules above:
    // forwards, the old side is untouched (unselected deletions became
    // context); in reverse, the new side is untouched. So that side keeps
    // its original start line, and the other side is shifted by the
    // difference built up from earlier hunks.
    const oldStart = reverse ? Math.max(0, hunk.newStart - offset) : hunk.oldStart
    const newStart = reverse ? hunk.newStart : Math.max(0, hunk.oldStart + offset)
    const suffix = hunk.context ? ` ${hunk.context}` : ''
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${suffix}`)
    out.push(...body)
    offset += newCount - oldCount
  })

  return anySelected ? out.join('\n') + '\n' : null
}
