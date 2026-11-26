# Troubleshooting

## "Git doesn't know your name and email"

Set them from the card on the home screen, or run **Set your git name and email…** in the [command palette](Command-Palette).

## A git command failed

The message shows git's own error. Open the **Git log** (`` Ctrl+` ``, or **Git log** in the status bar) to see exactly which command ran and what it printed. See [the git log](The-Repository-Window#the-git-log-see-exactly-what-trellis-runs).

## A commit failed because of a hook

Repositories can have hooks (such as a pre-commit check) that run before a commit and can stop it. Their output is shown in the error message. Fix what they complain about and commit again.

## Pushing or pulling asks for a password every time

Set up a [credential manager](https://git-scm.com/doc/credential-helpers) or SSH keys. Trellis uses whatever git is configured with.

## My push was rejected

Someone else pushed first. **Pull** (or **Pull with rebase**) to get their commits, then push again. See [Fetch, pull and push](Branches-and-Remotes#fetch-pull-and-push).

## I did something by mistake

Press `Ctrl+Z`. If that's not enough, see [Undo and recovering work](Undo-and-Recovering-Work), including how to find commits that seem lost.

## I'm stuck in a merge or rebase

The banner at the top has **Abort**, which puts everything back to how it was before it started. See [Conflicts](Merges-Rebases-and-Conflicts#conflicts).

## Windows or macOS won't open Trellis

Until the builds are signed, Windows shows "Windows protected your PC" (click **More info → Run anyway**) and macOS blocks the app (open **System Settings → Privacy & Security** and click **Open Anyway**).

## A plugin misbehaves

Turn it off in **Settings → Plugins**. Errors are shown under the plugin. See [Using plugins](Using-Plugins#when-a-plugin-misbehaves).

## Something else

Please [open an issue](https://github.com/ziggfreed/Trellis/issues) with the steps to reproduce it. A copy of the relevant lines from the Git log helps a lot.
