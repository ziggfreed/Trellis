# Releasing Trellis

How to publish a new version, and how code signing and auto-update work. This is for maintainers; contributors don't need any of it.

## Making a release

1. In `apps/desktop/package.json`, set `"version"` to the new version (e.g. `0.4.0`).
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.4.0] - <date>` and add a new, empty `## [Unreleased]` section above it.
3. Merge that to `main`, then tag the merge commit and push the tag:

   ```bash
   git tag v0.4.0
   git push origin v0.4.0
   ```

   The tag must match the version exactly, or the release workflow stops.

4. The **Release** workflow (`.github/workflows/release.yml`) builds Windows, macOS and Linux installers and attaches them to a **draft** GitHub release, with notes from the changelog.
5. Check the draft, then click **Publish release**.

Publishing is what rolls the update out: installed copies of Trellis only see published releases.

## Auto-update

Trellis checks for a new version 10 seconds after it starts and every 4 hours after that, unless the user turns it off in **Settings > General > Updates**. The code is in `apps/desktop/src/main/services/updater.ts` and uses [electron-updater](https://www.electron.build/auto-update).

- The release workflow uploads `latest.yml` (Windows), `latest-mac.yml` and `latest-linux.yml` next to the installers. electron-updater reads them from the latest published release.
- New versions download in the background. The status bar then shows **Restart to update**; otherwise the update installs the next time Trellis quits.
- **Windows** (the NSIS installer) and **Linux** (AppImage and .deb) update themselves.
- **macOS** only installs updates into apps signed with a Developer ID. Unsigned macOS builds show "Trellis x.y.z available" with a download link instead.
- Development builds, and Linux copies run from an unpacked folder, never update.

To test an update end to end, publish a release (for example a pre-release from a fork), install the older version and wait about 10 seconds after starting it, or click **Check now** in Settings.

## Code signing

Without signing, the installers work, but Windows SmartScreen warns ("Windows protected your PC") and macOS Gatekeeper refuses to open the app until the user allows it in System Settings. The release workflow signs automatically when these **repository secrets** are set (Settings > Secrets and variables > Actions):

| Secret                                                     | For                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CSC_LINK`, `CSC_KEY_PASSWORD`                             | macOS: a "Developer ID Application" certificate exported as `.p12`, base64-encoded (`base64 -i cert.p12`), and its password. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarisation: your Apple ID, an [app-specific password](https://support.apple.com/102654), and your team ID.           |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Windows: a code signing certificate (`.pfx`), base64-encoded, and its password.                                              |

Leave a secret out and that part is skipped: the build still succeeds, unsigned.

Where to get certificates:

- **macOS:** an [Apple Developer Program](https://developer.apple.com/programs/) membership (paid, yearly) gives you a Developer ID certificate and notarisation.
- **Windows:** certificates come from a certificate authority, and new ones are usually issued on hardware tokens, which can't be used from CI as a `.pfx` file. [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/) works from CI and is often the simplest choice for open-source projects; electron-builder supports it through `win.azureSignOptions` in `apps/desktop/electron-builder.yml`. Open-source projects can also apply for free signing from [SignPath Foundation](https://signpath.org/).

## The app icon

`apps/desktop/build/icon.svg` is the source; `build/icon.png` (1024×1024) is generated from it and is what electron-builder uses for every platform. After editing the SVG, run:

```bash
node apps/desktop/scripts/render-icon.mjs
```
