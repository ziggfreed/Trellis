/**
 * Shows git's credential questions (username, password, token, SSH key
 * passphrase, or "do you trust this SSH host?") as a dialog, and sends the
 * answer back to git. See src/main/services/askpass.ts for how the question
 * gets here. Mount once.
 */
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { IpcEvents } from '@shared/ipc'
import { api } from '@/lib/api'
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

type Prompt = IpcEvents['auth:prompt']

/** SSH asks "Are you sure you want to continue connecting (yes/no/[fingerprint])?" */
const isYesNo = (prompt: string) => /\(yes\/no/.test(prompt)

export function AuthPrompt() {
  const [queue, setQueue] = useState<Prompt[]>([])
  const current = queue[0]

  useEffect(() => api.on('auth:prompt', (prompt) => setQueue((q) => [...q, prompt])), [])

  const answer = (value: string | null) => {
    if (!current) return
    void api.invoke('auth:respond', current.id, value)
    setQueue((q) => q.slice(1))
  }

  return (
    <Dialog open={current !== undefined} onOpenChange={(open) => !open && answer(null)}>
      {current && <PromptForm key={current.id} prompt={current} onAnswer={answer} />}
    </Dialog>
  )
}

function PromptForm({
  prompt,
  onAnswer,
}: {
  prompt: Prompt
  onAnswer: (value: string | null) => void
}) {
  const [value, setValue] = useState('')
  const yesNo = isYesNo(prompt.prompt)

  return (
    <DialogContent className="sm:max-w-md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          onAnswer(value)
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {yesNo ? 'Trust this server?' : 'Git needs your credentials'}
          </DialogTitle>
          <DialogDescription className="break-words whitespace-pre-line">
            {prompt.prompt.trim()}
          </DialogDescription>
        </DialogHeader>
        {!yesNo && (
          <>
            <Input
              autoFocus
              type={prompt.secret ? 'password' : 'text'}
              aria-label={prompt.prompt}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For GitHub and most hosts, use a personal access token instead of your password. If
              you have a git credential helper set up, it can remember this for you.
            </p>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAnswer(yesNo ? 'no' : null)}>
            {yesNo ? 'No' : 'Cancel'}
          </Button>
          {yesNo ? (
            <Button type="button" onClick={() => onAnswer('yes')}>
              Yes, connect
            </Button>
          ) : (
            <Button type="submit">OK</Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
