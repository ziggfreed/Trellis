/**
 * Settings > General > "Commit signing": turn on signing for every commit,
 * with a GPG key or an SSH key. These are git's own global settings
 * (commit.gpgsign, gpg.format, user.signingkey), so the command line and
 * other tools sign too.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { SigningConfig } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'

const signingKey = ['git-signing'] as const

export function SigningSettings() {
  const saved = useQuery({ queryKey: signingKey, queryFn: () => api.invoke('git:getSigning') })
  if (!saved.data) return null
  // Re-mounted when the saved settings change, so the form starts from them.
  return <SigningForm key={JSON.stringify(saved.data)} saved={saved.data} />
}

function SigningForm({ saved }: { saved: SigningConfig }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(saved)
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const save = async () => {
    try {
      await api.invoke('git:setSigning', draft)
      await queryClient.invalidateQueries({ queryKey: signingKey })
      toast.success(draft.signCommits ? 'New commits will be signed.' : 'Commit signing is off.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-2" data-testid="signing-settings">
      <label className="flex items-center gap-2 text-sm">
        <input
          id="setting-signing"
          type="checkbox"
          checked={draft.signCommits}
          onChange={(e) => setDraft({ ...draft, signCommits: e.target.checked })}
        />
        Sign my commits
      </label>
      <div className="flex gap-2">
        <select
          aria-label="Key type"
          value={draft.format}
          onChange={(e) =>
            setDraft({ ...draft, format: e.target.value as SigningConfig['format'] })
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="openpgp">GPG key</option>
          <option value="ssh">SSH key</option>
        </select>
        <input
          aria-label="Signing key"
          value={draft.key}
          placeholder={
            draft.format === 'ssh' ? '~/.ssh/id_ed25519.pub' : 'Key ID (empty: match my email)'
          }
          onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {draft.format === 'ssh'
          ? 'The path to your public key (or the key itself). Add it to GitHub as a “signing key” so commits show as verified there.'
          : 'gpg must be installed. Find your key ID with: gpg --list-secret-keys --keyid-format=long'}
      </p>
      <Button size="sm" variant="outline" disabled={!changed} onClick={() => void save()}>
        Save signing settings
      </Button>
    </div>
  )
}
