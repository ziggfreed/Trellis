/**
 * "Compare…" dialog: pick any two branches, tags or commits and open them
 * in the Compare view.
 *
 * Both boxes suggest branch and tag names as you type (a native
 * <datalist>), and also accept commit hashes. Names are checked with git
 * before the Compare view opens, so a typo shows an error here rather than
 * an empty comparison.
 *
 * Open it from anywhere with openCompareDialog(repo); it's mounted once in
 * app.tsx.
 */
import { useState } from 'react'
import { create } from 'zustand'
import { ArrowUpDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useRefs, useStatus } from '@/features/repos/use-repo-data'
import { openCompare } from '@/features/repo-actions/actions'

interface CompareDialogRequest {
  repo: string
  /** Prefill for the "compare" box (e.g. the branch that was right-clicked). */
  head?: string
}

const useCompareDialogStore = create<{ request: CompareDialogRequest | null }>(() => ({
  request: null,
}))

/** Open the Compare dialog for `repo`, optionally with the "compare" box filled in. */
export function openCompareDialog(repo: string, head?: string) {
  useCompareDialogStore.setState({ request: { repo, ...(head ? { head } : {}) } })
}

const close = () => useCompareDialogStore.setState({ request: null })

export function CompareDialog() {
  const request = useCompareDialogStore((s) => s.request)
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      {request && <CompareForm key={`${request.repo}:${request.head}`} request={request} />}
    </Dialog>
  )
}

function CompareForm({ request }: { request: CompareDialogRequest }) {
  const { repo } = request
  const refs = useRefs(repo).data ?? []
  const currentBranch = useStatus(repo).data?.branch.head ?? ''
  const [base, setBase] = useState(currentBranch)
  const [head, setHead] = useState(request.head ?? '')
  const [errors, setErrors] = useState<{ base?: string; head?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const from = base.trim()
    const to = head.trim()
    setBusy(true)
    const [fromSha, toSha] = await Promise.all([
      from ? api.invoke('repo:resolveCommit', repo, from).catch(() => null) : null,
      to ? api.invoke('repo:resolveCommit', repo, to).catch(() => null) : null,
    ])
    const notFound = (name: string) =>
      name ? `No branch, tag or commit called “${name}”.` : 'Enter a branch, tag or commit.'
    const nextErrors = {
      ...(fromSha ? {} : { base: notFound(from) }),
      ...(toSha ? {} : { head: notFound(to) }),
    }
    setErrors(nextErrors)
    setBusy(false)
    if (fromSha && toSha) {
      close()
      await openCompare(repo, to, from)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
          <DialogDescription>
            See the commits and file changes one branch, tag or commit has that another doesn’t.
          </DialogDescription>
        </DialogHeader>

        <datalist id="compare-refs">
          {refs.map((ref) => (
            <option key={ref.fullName} value={ref.name} />
          ))}
        </datalist>

        <RefField
          id="compare-head"
          label="Compare"
          value={head}
          error={errors.head}
          placeholder="Branch, tag or commit hash"
          onChange={setHead}
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setBase(head)
              setHead(base)
              setErrors({})
            }}
          >
            <ArrowUpDown />
            Swap
          </Button>
        </div>
        <RefField
          id="compare-base"
          label="With"
          value={base}
          error={errors.base}
          placeholder="Branch, tag or commit hash"
          onChange={setBase}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Compare
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

function RefField(props: {
  id: string
  label: string
  value: string
  error: string | undefined
  placeholder: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        list="compare-refs"
        autoFocus={props.autoFocus}
        value={props.value}
        placeholder={props.placeholder}
        aria-invalid={Boolean(props.error)}
        onChange={(e) => props.onChange(e.target.value)}
        spellCheck={false}
      />
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  )
}
