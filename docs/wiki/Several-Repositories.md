# Several repositories

## Tabs

Each repository opens in its own tab, and your tabs come back when you restart Trellis.

| Shortcut                      | Action                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab                                                   |
| `Ctrl+W`                      | Close the tab                                                         |
| Arrow keys, `Delete`          | Move between tabs / close the focused one, when the tab bar has focus |

Drag tabs to reorder them. To jump to a tab by name, use **Switch to repository…** in the [command palette](Command-Palette).

## The home screen

The home screen (the Trellis logo at the top left) lists your repositories with their current branch, how far ahead and behind they are, and how many files have changed. **Fetch all** fetches every one of them.

- **Favourites**: hover over a repository and click the star to keep it at the top.
- **Scan folder…** finds every repository inside a folder and adds them all.

## Workspaces

A workspace is a named group of repositories you open together, such as "Work" or "Side projects".

1. Open the repositories you want.
2. Choose **Save open tabs as workspace…** (on the home screen, the **+** menu next to the tabs, or the command palette) and give it a name.
3. Open them all again later from the home screen, or with **Open workspace: …** in the command palette.

## Worktrees

A worktree is a second folder checked out from the same repository, on a different branch. You can work on two branches at once, such as fixing a bug while a long feature branch stays open, without stashing or switching.

- **Create one** with the **+** on the **Worktrees** section of the sidebar.
- **Click** a worktree to open it in its own tab.
- **Right-click** it to remove it.

Worktrees share the repository's history, so a commit made in one is visible in the others straight away.
