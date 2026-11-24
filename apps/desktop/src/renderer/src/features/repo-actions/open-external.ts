/** Open the repository in the user's own terminal or code editor. */
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'

export async function openInTerminal(repo: string) {
  try {
    await api.invoke('shell:openTerminal', repo)
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

export async function openInEditor(repo: string, file?: string) {
  try {
    await api.invoke('shell:openEditor', repo, file)
  } catch (error) {
    toast.error(errorMessage(error))
  }
}
