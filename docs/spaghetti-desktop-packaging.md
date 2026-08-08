# Spaghetti Desktop Packaging

Spaghetti Desktop wraps the static Spaghetti standard collection publisher in Electron so users can install the tool without Python, npm, Node, or a local web server. The native app starts its private stable origin at `http://127.0.0.1:30772`, loads the bundled publisher, and keeps the same Tezos wallet/RPC and self-managed artifact workflow as the wtfOS version. The fixed origin keeps browser-saved drafts available after quit/relaunch; a second launch focuses the existing window, and an occupied origin fails explicitly instead of silently switching storage namespaces.

The desktop build intentionally does not include wtfOS hosted resources:

- `/api/auth/user` returns a native-app unauthenticated response.
- `/api/macaroni/ipfs/pin` returns a native-app error.
- `/api/macaroni/publish` returns a native-app error.
- `/api/spaghetti/installers` returns an empty native manifest inside the downloaded app.
- Users must bring their own Pinata account, IPFS node, or exported artifacts for standalone publishing.

## Local Commands

Packaging contributors should use Node 22+ for these commands. End users do not need Node; the generated installers bundle the runtime.

```bash
npm run spaghetti:desktop:check
npm run spaghetti:desktop:prepare
npm run pack --prefix apps/spaghetti-desktop
npm run dist:alpha:mac --prefix apps/spaghetti-desktop
```

`npm run pack --prefix apps/spaghetti-desktop` creates an unpacked local app for inspection. Installer builds write to `apps/spaghetti-desktop/release/`.
Use `dist:alpha:mac` only for a controlled, explicitly dirty-preflight human-alpha artifact. The normal `dist:mac` publication command continues to require clean exact-commit provenance.

## CI Release Flow

Run the **Spaghetti Desktop Installers** workflow manually or push a tag like:

```bash
git tag spaghetti-desktop-v1.0.1-alpha.1
git push origin spaghetti-desktop-v1.0.1-alpha.1
```

The workflow builds:

- macOS universal DMG and ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi Linux arm64 DEB on `ubuntu-latest`

For a manual release, run the workflow with `publish_release=true` and `release_tag=spaghetti-desktop-v1.0.1-alpha.1`. The tag must match the package version. The workflow embeds exact clean source provenance, publishes a hyphenated alpha tag as a prerelease, and runs the packaged macOS/Windows app through boot plus stable-origin relaunch smoke.

## Historical stable 1.0.0 release metadata

These values describe the already-published stable `1.0.0` release. They are retained as historical deployment data; they are not valid checksums or filenames for `1.0.1-alpha.1`.

```bash
SPAGHETTI_INSTALLER_VERSION=1.0.0
SPAGHETTI_INSTALLER_MACOS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/spaghetti-desktop-v1.0.0/Spaghetti-Studio-1.0.0-mac-universal.dmg
SPAGHETTI_INSTALLER_MACOS_SHA256=0cca2e45d91d6438bab7b4c10ebc41226dffdee934afa24e5c34221a88f1c60a
SPAGHETTI_INSTALLER_WINDOWS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/spaghetti-desktop-v1.0.0/Spaghetti-Studio-1.0.0-win-x64.exe
SPAGHETTI_INSTALLER_WINDOWS_SHA256=ba402284209fc777c7995ad6573ab017444604da80f475aeb81c7385b47b42d4
SPAGHETTI_INSTALLER_RASPBERRY_PI_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/spaghetti-desktop-v1.0.0/Spaghetti-Studio-1.0.0-linux-arm64.deb
SPAGHETTI_INSTALLER_RASPBERRY_PI_SHA256=3e8687bc87992f64af2666401f5f2e3b38b4641182dabe1ff46590f1497a9dd8
```

Before changing any production URL or checksum, refresh this block from `gh release view spaghetti-desktop-v1.0.0 --json assets`.

## Production Manifest

`GET /api/spaghetti/installers` is authenticated and reads:

- `SPAGHETTI_INSTALLER_VERSION`
- `SPAGHETTI_INSTALLER_MACOS_URL`
- `SPAGHETTI_INSTALLER_MACOS_SHA256`
- `SPAGHETTI_INSTALLER_WINDOWS_URL`
- `SPAGHETTI_INSTALLER_WINDOWS_SHA256`
- `SPAGHETTI_INSTALLER_RASPBERRY_PI_URL`
- `SPAGHETTI_INSTALLER_RASPBERRY_PI_SHA256`

Production remote installer URLs must be HTTPS. Same-origin relative paths are allowed, and loopback HTTP is allowed only outside production for local development. The manifest marks a platform available only when both the URL and SHA-256 digest are configured.

After publishing a release and configuring production env, verify the public/authenticated installer surface with:

```bash
SPAGHETTI_INSTALLER_COOKIE='connect.sid=...' npm run spaghetti:installers:live-check
```

The live check fetches the expected GitHub release, compares asset URLs and GitHub SHA-256 digests to the authenticated `/api/spaghetti/installers` manifest, and confirms unauthenticated requests stay protected.

## Native Boundary

The app exposes `window.SPAGHETTI_DESKTOP.native` and `window.PASTA_TOOL_DESKTOP.native`. The local runtime blocks hosted wtfOS pinning, publishing, preview-processing, and hosted-resource API calls server-side, so downloaded builds require user-owned storage and wallet configuration.
