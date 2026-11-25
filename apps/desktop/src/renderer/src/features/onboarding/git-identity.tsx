/**
 * Helping new users set their git name and email.
 *
 * Git records an author on every commit and refuses to commit without one
 * ("Please tell me who you are"). This file provides:
 * - useGitIdentity(repo): the identity commits would use (null repo = global)
 * - GitSetupCard: shown on the home screen while no global identity is set
 * - IdentityDialog / openIdentityDialog(): asks for the name and email and
 *   saves them in the global git config
 * The commit box also shows a warning (see commit-box.tsx).
 */
import { useState } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { queryClient } from '@/lib/query-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const identityKey = ['git-identity'] as const

/** The identity commits in `repo` would use, or the global one for null. */
export function useGitIdentity(repo: string | null) {
  return useQuery({
    queryKey: [...identityKey, repo],
    queryFn: () => api.invoke('git:getIdentity', repo),
  })
}

/** Whether an identity is complete (both name and email). */
export const isComplete = (identity: { name: string | null; email: string | null } | undefined) =>
  !!identity?.name && !!identity.email

/** A rough check that catches typos, not a full email validator. */
export function emailProblem(email: string): string | null {
  const value = email.trim()
  if (!value) return 'Enter your email.'
  if (!/^[^\s@]+@[^\s@]+$/.test(value)) return 'That doesn’t look like an email address.'
  return null
}

const useIdentityDialog = create<{ open: boolean }>(() => ({ open: false }))
export const openIdentityDialog = () => useIdentityDialog.setState({ open: true })

/** Home screen card, shown until a global identity is set. */
export function GitSetupCard() {
  const identity = useGitIdentity(null)
  if (identity.isPending || isComplete(identity.data)) return null
  return (
    <section
      aria-labelledby="git-setup-title"
      className="flex items-start gap-3 rounded-lg border border-brand/40 bg-brand/5 p-4"
      data-testid="git-setup-card"
    >
      <UserRound className="mt-0.5 size-5 shrink-0 text-brand" />
      <div className="flex-1 space-y-1">
        <h2 id="git-setup-title" className="text-sm font-medium">
          Tell git who you are
        </h2>
        <p className="text-sm text-muted-foreground">
          Every commit records its author&apos;s name and email. Set them once and every repository
          on this computer will use them.
        </p>
      </div>
      <Button size="sm" onClick={openIdentityDialog}>
        Set up
      </Button>
    </section>
  )
}

/** "Ada <ada@example.com>  Change…", for Settings > General. */
export function IdentitySummary() {
  const identity = useGitIdentity(null).data
  return (
    <div className="flex items-center gap-2 text-sm">
      <span id="setting-identity" className="min-w-0 truncate">
        {isComplete(identity) ? `${identity!.name} <${identity!.email}>` : 'Not set yet'}
      </span>
      <Button size="xs" variant="outline" onClick={openIdentityDialog}>
        Change…
      </Button>
    </div>
  )
}

export function IdentityDialog() {
  const open = useIdentityDialog((s) => s.open)
  const current = useGitIdentity(null).data
  return (
    <Dialog open={open} onOpenChange={(value) => useIdentityDialog.setState({ open: value })}>
      {/* Re-mounted on each open, so the fields start from the saved values. */}
      {open && (
        <IdentityForm initialName={current?.name ?? ''} initialEmail={current?.email ?? ''} />
      )}
    </Dialog>
  )
}

function IdentityForm(props: { initialName: string; initialEmail: string }) {
  const [name, setName] = useState(props.initialName)
  const [email, setEmail] = useState(props.initialEmail)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameProblem = name.trim() ? null : 'Enter your name.'
  const problem = nameProblem ?? emailProblem(email)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (problem) return
    setSaving(true)
    try {
      await api.invoke('git:setIdentity', name, email)
      await queryClient.invalidateQueries({ queryKey: identityKey })
      toast.success('Saved. Your commits will use this name and email.')
      useIdentityDialog.setState({ open: false })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>Your name and email for commits</DialogTitle>
          <DialogDescription>
            Saved in your global git settings (git config --global). Anyone who can see your
            commits, for example on GitHub, will see these.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="identity-name">Name</Label>
          <Input
            id="identity-name"
            autoFocus
            value={name}
            placeholder="Ada Lovelace"
            aria-invalid={touched && nameProblem !== null}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="identity-email">Email</Label>
          <Input
            id="identity-email"
            type="email"
            value={email}
            placeholder="ada@example.com"
            aria-invalid={touched && emailProblem(email) !== null}
            aria-describedby="identity-email-help"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p id="identity-email-help" className="text-xs text-muted-foreground">
            Tip: GitHub can give you a private “noreply” address under Settings &gt; Emails.
          </p>
        </div>
        {touched && problem && (
          <p className="text-sm text-destructive" role="alert">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => useIdentityDialog.setState({ open: false })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
