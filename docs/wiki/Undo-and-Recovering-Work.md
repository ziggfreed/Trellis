# Undo and recovering work

## Undo and redo

**`Ctrl+Z`** undoes the last thing you did in Trellis, and **`Ctrl+Shift+Z`** redoes it. The undo and redo buttons are at the left of the toolbar; hover over them to see what they'll undo, such as "Undo: Commit “Fix the footer links”".

Undo covers commits (including amend), staging and unstaging, discarding changes, checkouts, merges, rebases (including interactive ones), resolving conflicts, resets, cherry-picks, reverts, pulls, and creating, deleting, renaming and moving branches and tags.

It's safe: undo never moves a branch that has changed somewhere else since, so it can't throw away work you or others did afterwards. Pushes can't be undone, because they change the server; use **Revert** to undo a pushed commit instead.

## Finding lost commits

Commits are hard to lose in git, even after a hard reset, a rebase gone wrong, or deleting a branch (including ones done outside Trellis). Git keeps a record of everywhere your repository has been for about 90 days, called the **reflog**.

Open the [command palette](Command-Palette) and run **Find lost commits (reflog)…**. It lists every place the repository has been, newest first, and marks commits that aren't on any branch any more. Click **Create branch…** on one to keep it.
