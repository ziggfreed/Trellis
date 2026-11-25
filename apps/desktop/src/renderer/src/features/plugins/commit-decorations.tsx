/**
 * Plugin badges on commits in the history graph (`trellis.graph.setDecorations`),
 * e.g. the GitHub plugin's CI results. A badge with a link opens it in the
 * browser (main's window-open handler only allows http/https links).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PluginCommitDecoration } from '@shared/ipc'
import { api } from '@/lib/api'
import { StatusIcon } from '@/components/status-icon'
import { pluginKeys } from './plugin-store'

/** Plugin badges for a repository, by commit hash. */
export function useCommitDecorations(repoPath: string): Map<string, PluginCommitDecoration[]> {
  const { data } = useQuery({
    queryKey: pluginKeys.decorations(repoPath),
    queryFn: () => api.invoke('plugins:decorations', repoPath),
  })
  return useMemo(() => {
    const map = new Map<string, PluginCommitDecoration[]>()
    for (const decoration of data ?? []) {
      map.set(decoration.sha, [...(map.get(decoration.sha) ?? []), decoration])
    }
    return map
  }, [data])
}

export function CommitDecorations({ decorations }: { decorations: PluginCommitDecoration[] }) {
  return decorations.map((d, index) =>
    d.url ? (
      <a
        key={index}
        href={d.url}
        target="_blank"
        rel="noreferrer"
        title={d.tooltip}
        data-testid="commit-decoration"
        // Don't select the commit (or open its menu) when clicking the badge.
        onClick={(event) => event.stopPropagation()}
        className="shrink-0 rounded hover:bg-accent"
      >
        <StatusIcon name={d.icon} />
      </a>
    ) : (
      <span key={index} title={d.tooltip} data-testid="commit-decoration" className="shrink-0">
        <StatusIcon name={d.icon} />
      </span>
    ),
  )
}
