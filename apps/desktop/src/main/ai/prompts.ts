/**
 * The instructions Trellis sends to the AI for each task, built from
 * repository data that ai-service.ts gathers. Pure functions, so they're
 * easy to test and tweak.
 *
 * Every prompt is two parts: `system` (what the AI is and how to answer)
 * and `user` (the data for this request). Repository data can be huge (a
 * diff of a generated file, a vendored library), so it's limited to
 * MAX_INPUT_CHARS; when that happens the prompt says so and the UI tells
 * the user, rather than silently sending part of it.
 */

export interface Prompt {
  system: string
  user: string
  /** True when some repository data was left out because it was too long. */
  truncated: boolean
  /** Rough cap on the answer's length. */
  maxTokens: number
  /**
   * How much thinking the task deserves: a commit message is quick, a
   * conflict needs care. Providers that don't support it ignore it.
   */
  effort: 'low' | 'medium' | 'high'
}

/**
 * About 50k tokens of input: plenty for a normal commit or conflicted file,
 * while keeping requests fast and cheap. Bigger inputs are cut down.
 */
export const MAX_INPUT_CHARS = 200_000

/** Cut `text` to `max` characters, at a line break where possible. */
export function limitText(
  text: string,
  max = MAX_INPUT_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  const cut = text.lastIndexOf('\n', max)
  return { text: text.slice(0, cut > max / 2 ? cut : max), truncated: true }
}

const TRUNCATION_NOTE =
  '\n\n[Trellis: the rest was left out because it was too long. Base your answer on the part shown and mention that it was cut short.]'

/**
 * Write a commit message for the staged changes. Recent subjects are
 * included so the message follows the repository's style (e.g.
 * Conventional Commits, or a ticket prefix).
 */
export function commitMessagePrompt(stagedDiff: string, recentSubjects: string[]): Prompt {
  const diff = limitText(stagedDiff)
  return {
    system: [
      'You write git commit messages.',
      'Reply with the commit message only: no introduction, no quotes, no code fences.',
      'First line: a summary of at most 72 characters, in the imperative mood ("Add", "Fix", not "Added").',
      'If the change needs explaining, add a blank line and then a short body (wrapped at 72 characters) saying what changed and why.',
      'Match the style of the recent commit messages you are shown (prefixes, capitalisation, language).',
    ].join('\n'),
    user: [
      recentSubjects.length
        ? `Recent commit messages in this repository:\n${recentSubjects.map((s) => `- ${s}`).join('\n')}`
        : 'This repository has no commits yet.',
      `Staged changes (git diff --cached):\n\n${diff.text}${diff.truncated ? TRUNCATION_NOTE : ''}`,
    ].join('\n\n'),
    truncated: diff.truncated,
    maxTokens: 2000,
    effort: 'low',
  }
}

/** Explain a commit (git show output) to someone reviewing history. */
export function explainCommitPrompt(show: string): Prompt {
  const commit = limitText(show)
  return {
    system: [
      'You explain git commits to developers reading a project’s history.',
      'Start with one or two sentences on what the commit does and why, as far as the changes and message show.',
      'Then describe the important changes, grouped sensibly, and point out anything risky or surprising.',
      'Be concise. Use plain text with short paragraphs or "-" bullet lists; no headings, tables or Markdown emphasis.',
    ].join('\n'),
    user: `The commit (git show):\n\n${commit.text}${commit.truncated ? TRUNCATION_NOTE : ''}`,
    truncated: commit.truncated,
    maxTokens: 8000,
    effort: 'medium',
  }
}

/** Fence used for the resolved file, so it can be found in the answer. */
export const RESOLVED_FENCE = 'resolved'

/** Explain a conflicted file and suggest a resolution. */
export function resolveConflictPrompt(path: string, content: string, context: string): Prompt {
  // Not limited here: a partial file can't be resolved, so ai-service.ts
  // refuses files over MAX_INPUT_CHARS instead.
  return {
    system: [
      'You help resolve git merge conflicts.',
      'You are given a file containing conflict markers (<<<<<<<, =======, >>>>>>>).',
      'First, in a few short sentences of plain text, explain what each side changed and how you combined them. Mention anything the user should check.',
      `Then give the complete resolved file in a single code block that starts with \`\`\`${RESOLVED_FENCE} on its own line and ends with \`\`\` on its own line.`,
      'The resolved file must contain no conflict markers, and must keep every line outside the conflicts exactly as it is.',
    ].join('\n'),
    user: `${context}\n\nFile: ${path}\n\n${content}`,
    truncated: false,
    maxTokens: 32000,
    effort: 'high',
  }
}

/**
 * Split a conflict answer into the explanation and the resolved file.
 * `resolved` is null if the answer has no usable code block (or still has
 * conflict markers), in which case only the explanation is shown.
 */
export function parseConflictAnswer(answer: string): {
  explanation: string
  resolved: string | null
} {
  const start = answer.indexOf(`\`\`\`${RESOLVED_FENCE}\n`)
  if (start === -1) return { explanation: answer.trim(), resolved: null }
  const bodyStart = start + RESOLVED_FENCE.length + 4
  const end = answer.lastIndexOf('\n```')
  if (end < bodyStart - 1) return { explanation: answer.trim(), resolved: null }
  const resolved = `${answer.slice(bodyStart, end)}\n`
  const hasMarkers = /^(<{7}|={7}|>{7})( |$)/m.test(resolved)
  return {
    explanation: answer.slice(0, start).trim(),
    resolved: hasMarkers ? null : resolved,
  }
}

/** A tiny request to check the provider settings work. */
export function testPrompt(): Prompt {
  return {
    system: 'Reply with exactly: Connected.',
    user: 'Test',
    truncated: false,
    maxTokens: 50,
    effort: 'low',
  }
}

/** Remove fences or quotes some models wrap around a commit message. */
export function cleanCommitMessage(text: string): string {
  let message = text.trim()
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(message)
  if (fenced) message = fenced[1]!.trim()
  if (/^".*"$/s.test(message) && !message.slice(1, -1).includes('"')) message = message.slice(1, -1)
  return message
}
