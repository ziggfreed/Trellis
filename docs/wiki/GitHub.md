# GitHub

The built-in GitHub plugin shows pull requests and CI results inside Trellis for repositories hosted on GitHub.

## Signing in

1. Open a repository whose remote is on GitHub. A **Pull requests** panel appears in the sidebar.
2. Click **Sign in to GitHub…** in the panel (or run **GitHub: Sign in** in the [command palette](Command-Palette)).
3. Either paste a [personal access token](https://github.com/settings/tokens), or reuse the GitHub CLI's sign-in if you've run `gh auth login`.

The token is stored encrypted on your computer.

## What you get

- **Pull requests** in the sidebar, this branch's first, with their CI and review state. Click one to open it on GitHub.
- **CI results** as small badges on the latest commits in the history. Click a badge to open the run.
- **This branch's pull request** in the status bar.

For GitHub Enterprise, set the API address under **Settings → Plugins → GitHub → Settings**.

## Opening things on GitHub (and GitLab, Bitbucket, Gitea)

The built-in **Open on Remote** plugin adds **Open … on remote** to the right-click menus of commits, branches and files, and to the command palette. It works with GitHub, GitLab, Bitbucket and Gitea.
