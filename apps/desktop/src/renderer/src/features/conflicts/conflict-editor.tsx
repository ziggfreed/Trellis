/**
 * Resolve merge conflicts inside Trellis.
 *
 * Each conflict block shows the current and incoming versions side by
 * side, with buttons to keep one, keep both, or edit the result by hand.
 * When every block has a choice, "Save and mark resolved" writes the file
 * and stages it.
 *
 * With AI turned on, "Ask AI" explains the conflict and suggests a
 * resolved file (see features/ai/ai-dialog.tsx).
 *
 * Conflicts without markers (e.g. one side deleted the file) can't be
 * merged line by line, so whole-file choices are offered instead.
 *
 * Parsing and building the result are pure functions in
 * @trellis/git/conflicts (with tests); this file is only the UI.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ExternalLink, Pencil, Sparkles } from 'lucide-react'
import {
  chosenLines,
  parseConflicts,
  resolveConflicts,
  type ConflictChoice,
  type ConflictSegment,
} from '@trellis/git/conflicts'
import type { RepoOperation } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { repoKeys } from '@/lib/query-client'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/features/dialogs/dialog-store'
import { useStatus } from '@/features/repos/use-repo-data'
import { useAiEnabled } from '@/features/ai/ai-client'
import { resolveConflictWithAi } from '@/features/ai/ai-dialog'

type Conflict = Extract<ConflictSegment, { kind: 'conflict' }>

/** Lines of unchanged text shown around each conflict. */
const CONTEXT_LINES = 3

/**
 * Plain-language names for the two sides. During a rebase git's "ours" is
 * the branch being rebased onto and "theirs" is your own commit.
 */
function sideNames(operation: RepoOperation | null | undefined, conflict: Conflict) {
  if (operation === 'rebase') {
    return {
      current: 'Upstream (rebasing onto)',
      incoming: `Your commit (${conflict.incomingLabel})`,
    }
  }
  return {
    current: `Current (${conflict.currentLabel || 'HEAD'})`,
    incoming: `Incoming (${conflict.incomingLabel})`,
  }
}

export function ConflictEditor({ repoPath, file }: { repoPath: string; file: string }) {
  const operation = useStatus(repoPath).data?.operation
  const aiEnabled = useAiEnabled()
  const { data, error } = useQuery({
    // Under 'diff', so it reloads when the file changes on disk.
    queryKey: [...repoKeys.all(repoPath), 'diff', 'conflict', file],
    queryFn: () => api.invoke('repo:readWorkingFile', repoPath, file),
  })
  const text = data?.kind === 'text' ? data.text : null
  const parsed = useMemo(() => (text === null ? null : parseConflicts(text)), [text])
  const conflicts = useMemo(
    () => (parsed?.segments.filter((s) => s.kind === 'conflict') as Conflict[] | undefined) ?? [],
    [parsed],
  )

  // Choices belong to one version of the file; reset when it changes.
  const [state, setState] = useState<{
    text: string | null
    choices: (ConflictChoice | undefined)[]
  }>({
    text: null,
    choices: [],
  })
  const choices = state.text === text ? state.choices : []
  const choose = (index: number, choice: ConflictChoice | undefined) => {
    const next = [...choices]
    next[index] = choice
    setState({ text, choices: next })
  }

  const openFile = () => void runAction(repoPath, () => api.invoke('repo:openFile', repoPath, file))

  if (error) return <p className="p-6 text-sm text-destructive">{error.message}</p>
  if (!data) return null

  // No markers to work with: offer whole-file choices.
  if (!parsed || conflicts.length === 0) {
    return (
      <WholeFileChoices repoPath={repoPath} file={file} hasText={text !== null} onOpen={openFile} />
    )
  }

  const resolvedCount = conflicts.filter((_, i) => choices[i]).length
  const allResolved = resolvedCount === conflicts.length
  const save = () =>
    runAction(
      repoPath,
      () => api.invoke('repo:saveResolvedFile', repoPath, file, resolveConflicts(parsed, choices)),
      {
        success: `Resolved ${file}`,
      },
    )

  let conflictIndex = 0
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conflict-editor">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {parsed.segments.map((segment, i) => {
          if (segment.kind === 'text') {
            return (
              <Context
                key={i}
                lines={segment.lines}
                first={i === 0}
                last={i === parsed.segments.length - 1}
              />
            )
          }
          const index = conflictIndex++
          return (
            <ConflictBlock
              key={i}
              number={index + 1}
              conflict={segment}
              names={sideNames(operation, segment)}
              choice={choices[index]}
              onChoose={(choice) => choose(index, choice)}
            />
          )
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2">
        <span className="text-sm whitespace-nowrap text-muted-foreground" role="status">
          {resolvedCount} of {conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'}{' '}
          resolved
        </span>
        {aiEnabled && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => resolveConflictWithAi(repoPath, file)}
            title="Explain this conflict and suggest a resolution with AI"
          >
            <Sparkles />
            Ask AI
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={cn(!aiEnabled && 'ml-auto')}
          onClick={openFile}
        >
          <ExternalLink />
          Open in editor
        </Button>
        <Button size="sm" disabled={!allResolved} onClick={() => void save()}>
          <Check />
          Save and mark resolved
        </Button>
      </div>
    </div>
  )
}

/** Unchanged lines between conflicts: only a few lines nearest each conflict are shown. */
function Context({ lines, first, last }: { lines: string[]; first: boolean; last: boolean }) {
  const before = first ? [] : lines.slice(0, CONTEXT_LINES)
  const after = last ? [] : lines.slice(-CONTEXT_LINES)
  const hidden = lines.length - before.length - after.length
  if (hidden <= 0) return <Code lines={lines} className="text-muted-foreground" />
  return (
    <div>
      <Code lines={before} className="text-muted-foreground" />
      <p className="py-1 text-center text-xs text-muted-foreground">⋯ {hidden} unchanged lines ⋯</p>
      <Code lines={after} className="text-muted-foreground" />
    </div>
  )
}

function ConflictBlock(props: {
  number: number
  conflict: Conflict
  names: { current: string; incoming: string }
  choice: ConflictChoice | undefined
  onChoose: (choice: ConflictChoice | undefined) => void
}) {
  const { conflict, choice, onChoose } = props
  const [editing, setEditing] = useState(false)
  const result = choice ? chosenLines(conflict, choice) : null
  const pick = (kind: Exclude<ConflictChoice['kind'], 'custom'>) => {
    setEditing(false)
    onChoose({ kind })
  }
  const isChosen = (kind: ConflictChoice['kind']) => choice?.kind === kind

  return (
    <section className="rounded-md border" aria-label={`Conflict ${props.number}`}>
      <div className="flex flex-wrap items-center gap-1 bg-muted px-2 py-1">
        <span className="mr-2 text-sm font-medium">Conflict {props.number}</span>
        <ChoiceButton active={isChosen('current')} onClick={() => pick('current')}>
          Use current
        </ChoiceButton>
        <ChoiceButton active={isChosen('incoming')} onClick={() => pick('incoming')}>
          Use incoming
        </ChoiceButton>
        <ChoiceButton active={isChosen('both')} onClick={() => pick('both')}>
          Use both
        </ChoiceButton>
        <ChoiceButton active={isChosen('both-reversed')} onClick={() => pick('both-reversed')}>
          Both, incoming first
        </ChoiceButton>
        <ChoiceButton
          active={isChosen('custom') || editing}
          onClick={() => {
            setEditing(true)
            onChoose({ kind: 'custom', text: (result ?? conflict.current).join('\n') })
          }}
        >
          <Pencil />
          Edit
        </ChoiceButton>
        {choice && (
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => onChoose(undefined)}>
            Reset
          </Button>
        )}
      </div>

      {choice && !editing ? (
        <div className="border-t">
          <p className="px-2 pt-1 text-xs text-muted-foreground">Result</p>
          <Code lines={result ?? []} className="bg-[var(--diff-insert)]" empty="(nothing)" />
        </div>
      ) : editing && choice?.kind === 'custom' ? (
        <textarea
          aria-label={`Resolution for conflict ${props.number}`}
          value={choice.text}
          rows={Math.max(3, choice.text.split('\n').length + 1)}
          onChange={(e) => onChoose({ kind: 'custom', text: e.target.value })}
          className="w-full border-t bg-transparent p-2 font-mono text-xs outline-none"
        />
      ) : (
        <div className="grid grid-cols-2 divide-x border-t">
          <Side title={props.names.current} lines={conflict.current} />
          <Side title={props.names.incoming} lines={conflict.incoming} />
        </div>
      )}
      {conflict.base && !choice && (
        <details className="border-t px-2 py-1 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Original (before both changes)
          </summary>
          <Code lines={conflict.base} />
        </details>
      )}
    </section>
  )
}

function Side({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="min-w-0">
      <p className="truncate px-2 pt-1 text-xs text-muted-foreground">{title}</p>
      <Code lines={lines} empty="(nothing)" />
    </div>
  )
}

function Code({
  lines,
  className,
  empty,
}: {
  lines: string[]
  className?: string
  empty?: string
}) {
  if (lines.length === 0) {
    return empty ? <p className="px-2 py-1 text-xs text-muted-foreground italic">{empty}</p> : null
  }
  return (
    <pre
      className={cn('overflow-x-auto px-2 py-1 font-mono text-xs leading-5 select-text', className)}
    >
      {lines.join('\n')}
    </pre>
  )
}

function ChoiceButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant={props.active ? 'default' : 'outline'}
      size="xs"
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

function WholeFileChoices(props: {
  repoPath: string
  file: string
  hasText: boolean
  onOpen: () => void
}) {
  const resolve = (choice: 'current' | 'incoming' | 'delete') =>
    runAction(
      props.repoPath,
      () => api.invoke('repo:resolveFileWith', props.repoPath, props.file, choice),
      {
        success: `Resolved ${props.file}`,
      },
    )
  const markResolved = async () => {
    const ok = await confirmDialog({
      title: 'Mark as resolved?',
      description:
        'The file will be staged exactly as it is now. Make sure no conflict markers are left in it.',
      confirmLabel: 'Mark as resolved',
    })
    if (ok)
      await runAction(props.repoPath, () => api.invoke('repo:stage', props.repoPath, [props.file]))
  }
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm"
      data-testid="conflict-editor"
    >
      <p className="max-w-md">
        {props.hasText
          ? 'This conflict has no markers to resolve line by line. Usually one side changed the file and the other deleted it. Choose which version to keep:'
          : 'This file can’t be shown (it’s binary or too large). Choose which version to keep:'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void resolve('current')}>
          Keep current version
        </Button>
        <Button size="sm" variant="outline" onClick={() => void resolve('incoming')}>
          Use incoming version
        </Button>
        <Button size="sm" variant="outline" onClick={() => void resolve('delete')}>
          Delete the file
        </Button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={props.onOpen}>
          <ExternalLink />
          Open file
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void markResolved()}>
          Mark as resolved as it is
        </Button>
      </div>
    </div>
  )
}
