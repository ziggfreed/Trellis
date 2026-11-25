/**
 * The "Signature" row in commit details: whether the selected commit is
 * signed (GPG or SSH) and whether the signature checks out.
 *
 * Checking runs gpg / ssh-keygen in main, so it's done only for the
 * selected commit, and cached (a commit's signature never changes).
 */
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react'
import type { CommitSignature } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Plain-language summary of a signature, for the row and its tooltip. */
export function describeSignature(signature: CommitSignature): { label: string; detail: string } {
  if (signature.status === 'none') return { label: 'Not signed', detail: '' }
  const who = signature.signer ?? (signature.key ? `key ${signature.key}` : 'an unknown key')
  switch (signature.status) {
    case 'good':
      return { label: `Verified: ${who}`, detail: 'The signature is valid and the key is trusted.' }
    case 'untrusted':
      return {
        label: `Signed by ${who}`,
        detail:
          'The signature is valid, but the key isn’t marked as trusted here, or it has expired or been revoked.',
      }
    case 'bad':
      return {
        label: 'Bad signature',
        detail: 'The signature doesn’t match the commit: it may have been changed after signing.',
      }
    case 'unknown':
      return {
        label: `Signed with ${signature.key ? `key ${signature.key}` : 'a key'} (can’t check)`,
        detail: 'This computer doesn’t have the public key needed to check the signature.',
      }
  }
}

const ICONS = {
  good: { Icon: ShieldCheck, className: 'text-change-added' },
  untrusted: { Icon: ShieldAlert, className: 'text-change-modified' },
  bad: { Icon: ShieldX, className: 'text-destructive' },
  unknown: { Icon: ShieldQuestion, className: 'text-muted-foreground' },
} as const

export function SignatureRow({ repoPath, sha }: { repoPath: string; sha: string }) {
  const { data } = useQuery({
    queryKey: ['signature', repoPath, sha],
    queryFn: () => api.invoke('repo:getSignature', repoPath, sha),
    staleTime: Infinity,
  })
  // Unsigned commits are the norm in many projects: say nothing.
  if (!data || data.status === 'none') return null
  const { label, detail } = describeSignature(data)
  const { Icon, className } = ICONS[data.status]
  return (
    <>
      <dt className="text-muted-foreground">Signature</dt>
      <dd className={cn('flex items-center gap-1', className)} title={detail}>
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate" data-testid="commit-signature">
          {label}
        </span>
      </dd>
    </>
  )
}
