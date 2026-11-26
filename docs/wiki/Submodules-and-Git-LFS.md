# Submodules and Git LFS

## Submodules

A submodule is another repository kept inside this one at a fixed commit, such as a shared library. If a repository has any, a **Submodules** section appears in the sidebar showing each one's state.

- After cloning, submodules show **Not set up yet**. Click one (or right-click it and choose **Set up**) to download it.
- Click a set-up submodule to open it in its own tab.
- Right-click for **Update all submodules** and **Sync URLs**.
- Add a new one with the **+** on the section, or **Add submodule…** in the command palette.

## Git LFS

Git LFS stores large files (images, videos, builds) on a separate server and keeps small pointer files in the repository. It needs [git-lfs](https://git-lfs.com) installed; Trellis warns if a repository uses LFS and it's missing.

- A **Git LFS** section in the sidebar lists which file types use it.
- Right-click a file and use **Git LFS** to store all files of that type with LFS.
- **Locking**: right-click a file to lock or unlock it. A lock stops others pushing changes to a file that can't be merged, like a `.psd`. **Git LFS: locked files…** in the command palette lists every lock.
- Diffs of LFS files show the old and new sizes instead of pointer text.

Fetching, pulling and pushing LFS files needs nothing extra.
