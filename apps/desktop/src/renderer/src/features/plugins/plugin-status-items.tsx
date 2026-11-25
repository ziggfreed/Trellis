/** Status bar items created by plugins (trellis.ui.createStatusBarItem). */
import { runPluginCommand, usePluginStore } from './plugin-store'

export function PluginStatusItems({ repoPath }: { repoPath: string | null }) {
  const items = usePluginStore((s) => s.statusItems)
  return (
    <>
      {items
        .filter((item) => item.text)
        .map((item) =>
          item.command ? (
            <button
              key={item.id}
              type="button"
              title={item.tooltip || undefined}
              data-testid="plugin-status-item"
              onClick={() => void runPluginCommand(item.command!, { repo: repoPath })}
              className="max-w-64 truncate hover:text-foreground"
            >
              {item.text}
            </button>
          ) : (
            <span
              key={item.id}
              title={item.tooltip || undefined}
              data-testid="plugin-status-item"
              className="max-w-64 truncate"
            >
              {item.text}
            </span>
          ),
        )}
    </>
  )
}
