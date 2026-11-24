/**
 * Parsing and resolving merge conflict markers. Pure functions (no Node.js),
 * so the UI uses them directly as `@trellis/git/conflicts`.
 *
 * When git can't merge part of a file, it writes both versions into the
 * file between markers:
 *
 *   <<<<<<< HEAD                 <- start; label of the "current" side
 *   our version of the lines
 *   ||||||| base                 <- (only with merge.conflictStyle=diff3/zdiff3)
 *   the original lines
 *   =======                      <- separator
 *   their version of the lines
 *   >>>>>>> feature              <- end; label of the "incoming" side
 *
 * "Current" (ours) is the branch you were on; "incoming" (theirs) is what's
 * being merged in. (During a rebase it's the other way round: current is the
 * branch you're rebasing onto and incoming is your own commit.)
 */

export type ConflictSegment =
  | { kind: 'text'; lines: string[] }
  | {
      kind: 'conflict'
      /** Label after <<<<<<< (e.g. "HEAD"). */
      currentLabel: string
      /** Label after >>>>>>> (e.g. a branch name or commit). */
      incomingLabel: string
      current: string[]
      /** The common ancestor's lines, if git wrote them (diff3 style). */
      base: string[] | null
      incoming: string[]
    }

export interface ParsedConflicts {
  segments: ConflictSegment[]
  /** The file's line ending, kept when the file is written back. */
  eol: '\n' | '\r\n'
  /** Whether the file ended with a newline. */
  finalNewline: boolean
}

/** How to resolve one conflict. */
export type ConflictChoice =
  | { kind: 'current' }
  | { kind: 'incoming' }
  /** Both versions: current first, then incoming. */
  | { kind: 'both' }
  /** Both versions: incoming first, then current. */
  | { kind: 'both-reversed' }
  /** Text the user typed. */
  | { kind: 'custom'; text: string }

// Markers are exactly 7 characters (git's default conflict-marker-size)
// followed by a space and a label, or nothing.
const START = /^<{7}(?: (.*))?$/
const BASE = /^\|{7}(?: .*)?$/
const SEPARATOR = /^={7}$/
const END = /^>{7}(?: (.*))?$/

/**
 * Split a file into plain text and conflict blocks. Returns null if a
 * conflict block isn't properly closed (the file has been partly edited),
 * so the caller can fall back to showing the raw file.
 */
export function parseConflicts(text: string): ParsedConflicts | null {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const finalNewline = text.endsWith('\n')
  const lines = text.split(/\r?\n/)
  if (finalNewline) lines.pop()

  const segments: ConflictSegment[] = []
  let plain: string[] = []
  let i = 0
  while (i < lines.length) {
    const start = START.exec(lines[i]!)
    if (!start) {
      plain.push(lines[i]!)
      i++
      continue
    }
    if (plain.length) segments.push({ kind: 'text', lines: plain })
    plain = []

    const current: string[] = []
    let base: string[] | null = null
    const incoming: string[] = []
    let section: 'current' | 'base' | 'incoming' = 'current'
    let endLabel: string | null = null
    i++
    for (; i < lines.length; i++) {
      const line = lines[i]!
      if (section === 'current' && BASE.test(line)) {
        section = 'base'
        base = []
      } else if (section !== 'incoming' && SEPARATOR.test(line)) {
        section = 'incoming'
      } else if (section === 'incoming' && END.test(line)) {
        endLabel = END.exec(line)![1] ?? ''
        i++
        break
      } else if (section === 'current') current.push(line)
      else if (section === 'base') base!.push(line)
      else incoming.push(line)
    }
    if (endLabel === null) return null // ran out of lines before >>>>>>>
    segments.push({
      kind: 'conflict',
      currentLabel: start[1] ?? '',
      incomingLabel: endLabel,
      current,
      base,
      incoming,
    })
  }
  if (plain.length) segments.push({ kind: 'text', lines: plain })
  return { segments, eol, finalNewline }
}

/** Number of conflict blocks. */
export function countConflicts(parsed: ParsedConflicts): number {
  return parsed.segments.filter((s) => s.kind === 'conflict').length
}

/** The lines a choice produces for one conflict block. */
export function chosenLines(
  conflict: Extract<ConflictSegment, { kind: 'conflict' }>,
  choice: ConflictChoice,
): string[] {
  switch (choice.kind) {
    case 'current':
      return conflict.current
    case 'incoming':
      return conflict.incoming
    case 'both':
      return [...conflict.current, ...conflict.incoming]
    case 'both-reversed':
      return [...conflict.incoming, ...conflict.current]
    case 'custom':
      return choice.text === ''
        ? []
        : choice.text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  }
}

/**
 * Build the resolved file. `choices[i]` is the choice for the i-th conflict
 * block; blocks without a choice keep their markers (still unresolved).
 */
export function resolveConflicts(
  parsed: ParsedConflicts,
  choices: readonly (ConflictChoice | undefined)[],
): string {
  const out: string[] = []
  let index = 0
  for (const segment of parsed.segments) {
    if (segment.kind === 'text') {
      out.push(...segment.lines)
      continue
    }
    const choice = choices[index++]
    if (choice) {
      out.push(...chosenLines(segment, choice))
    } else {
      out.push(`<<<<<<< ${segment.currentLabel}`.trimEnd(), ...segment.current)
      if (segment.base) out.push('|||||||', ...segment.base)
      out.push('=======', ...segment.incoming, `>>>>>>> ${segment.incomingLabel}`.trimEnd())
    }
  }
  const body = out.join(parsed.eol)
  return parsed.finalNewline && out.length ? body + parsed.eol : body
}
