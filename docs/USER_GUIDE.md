# Trellis user guide

The user guide is now the **[Trellis wiki](https://github.com/ziggfreed/Trellis/wiki)**, with screenshots. Its pages are kept in [`docs/wiki`](wiki) in this repository and published to the wiki automatically when they change on `main` (`.github/workflows/wiki.yml`), so update them there, in the same pull request as the feature they describe.

| Topic                                                      | Wiki page                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installing, git name and email, opening repositories       | [Getting started](https://github.com/ziggfreed/Trellis/wiki/Getting-Started)                                                                           |
| What's on screen                                           | [The repository window](https://github.com/ziggfreed/Trellis/wiki/The-Repository-Window)                                                               |
| Ctrl/Cmd+K                                                 | [Command palette](https://github.com/ziggfreed/Trellis/wiki/Command-Palette)                                                                           |
| The graph, search, filters, compare, blame, bisect         | [History and diffs](https://github.com/ziggfreed/Trellis/wiki/History-and-Diffs)                                                                       |
| Staging files and lines, commit messages, stashes          | [Staging and committing](https://github.com/ziggfreed/Trellis/wiki/Staging-and-Committing)                                                             |
| Branches, fetch/pull/push, drag and drop, clean-up, stacks | [Branches and remotes](https://github.com/ziggfreed/Trellis/wiki/Branches-and-Remotes)                                                                 |
| Merge, rebase, interactive rebase, conflicts               | [Merges, rebases and conflicts](https://github.com/ziggfreed/Trellis/wiki/Merges-Rebases-and-Conflicts)                                                |
| Undo, lost commits                                         | [Undo and recovering work](https://github.com/ziggfreed/Trellis/wiki/Undo-and-Recovering-Work)                                                         |
| Tabs, favourites, workspaces, worktrees                    | [Several repositories](https://github.com/ziggfreed/Trellis/wiki/Several-Repositories)                                                                 |
| Submodules, Git LFS                                        | [Submodules and Git LFS](https://github.com/ziggfreed/Trellis/wiki/Submodules-and-Git-LFS)                                                             |
| GitHub, AI                                                 | [GitHub](https://github.com/ziggfreed/Trellis/wiki/GitHub), [AI features](https://github.com/ziggfreed/Trellis/wiki/AI-Features)                       |
| Plugins                                                    | [Using plugins](https://github.com/ziggfreed/Trellis/wiki/Using-Plugins), [Writing plugins](https://github.com/ziggfreed/Trellis/wiki/Writing-Plugins) |
| Settings, shortcuts, signing, updates                      | [Settings and keyboard shortcuts](https://github.com/ziggfreed/Trellis/wiki/Settings-and-Keyboard-Shortcuts)                                           |
| Problems                                                   | [Troubleshooting](https://github.com/ziggfreed/Trellis/wiki/Troubleshooting)                                                                           |

The screenshots in `docs/wiki/images` are taken by `apps/desktop/screenshots/wiki.spec.ts`; see `apps/desktop/playwright.screenshots.config.ts` to regenerate them after UI changes.
