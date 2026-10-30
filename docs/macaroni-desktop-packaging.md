# Macaroni Desktop Packaging

Macaroni Desktop wraps the static Macaroni Studio bundle and the Macaroni V3.5 Companion in Electron so users can install it without Python, npm, Node, or a local web server. The native app starts its private stable origin at `http://127.0.0.1:30771`, loads `studio.html`, and supervises the private Companion on loopback. The fixed Studio origin keeps browser-saved drafts available after quit/relaunch; a second launch focuses the existing window, and an occupied origin fails explicitly instead of silently switching storage namespaces.

The desktop build intentionally does not include wtfOS hosted resources:

- `/api/macaroni/ipfs/pin` returns a native-app error.
- `/api/macaroni/publish` returns a native-app error.
- Studio hides wtfOS pinning, wtfOS publishing, and installer-download controls in native mode.
- Export writes a local `Documents/Macaroni/site` folder and still downloads `macaroni-site.zip`.

## V3.5 Self-Hosted Boundary

The recommended V3.5 path keeps the exported collector page static and secret-free. The bundled Companion owns private artifact custody, deterministic CAR creation, allocation-secret recovery, chain watching, durable transaction state, IPFS publication, and finalizer signing. The Electron main process holds the local admin credential and exposes only an exact same-origin creator API to Studio; neither Studio nor an exported page receives that credential.

A fresh installation deliberately remains **Setup required**. Before a remote sale can open, the creator must configure and pass the bundled doctor for a dedicated funded Tezos finalizer, a private Kubo or CAR-capable pinning provider, the selected Tezos RPC, durable backup/recovery, and an HTTPS public endpoint with the exact collector-page CORS origin. Macaroni does not silently downgrade a failed secure setup to Legacy. The complete setup, provider, funding, trust, backup, and recovery instructions ship in `companion/macaroni-v35/README.md`, `API.md`, `BACKUP_RECOVERY.md`, `.env.example`, and the platform installers/templates.

Legacy Macaroni remains available under Advanced for creators who need a static-only compatibility drop. It does not use the Companion, and Studio requires the creator to read and acknowledge its public-inventory, predictable-allocation, copy-mint, and human-reveal risks before V1 or V2 can be selected, deployed, or exported.

## Local Commands

Packaging contributors should use Node 22+ for these commands. End users do not need Node; the generated installers bundle the runtime.

```bash
npm run macaroni:desktop:check
npm run macaroni:desktop:prepare
npm run pack --prefix apps/macaroni-desktop
npm run dist:alpha:mac --prefix apps/macaroni-desktop
```

`npm run pack --prefix apps/macaroni-desktop` creates an unpacked local app for inspection. Installer builds write to `apps/macaroni-desktop/release/`.
Use `dist:alpha:mac` only for a controlled, explicitly dirty-preflight human-alpha artifact. The normal `dist:mac` publication command continues to require clean exact-commit provenance.

## CI Release Flow

Run the **Macaroni Desktop Installers** workflow manually or push a tag like:

```bash
git tag macaroni-desktop-v1.0.1-alpha.1
git push origin macaroni-desktop-v1.0.1-alpha.1
```

The workflow builds:

- macOS universal DMG and ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi Linux arm64 DEB on the native `ubuntu-24.04-arm` runner

The Raspberry Pi `.deb` build requires package metadata that Linux package tools can expose to users and package managers. Keep `homepage`, `author.email`, `build.linux.maintainer`, and `build.deb.packageName` populated in `apps/macaroni-desktop/package.json`; `npm run macaroni:desktop:check` guards those fields because electron-builder rejects or weakens the `.deb` without them.

The alpha workflow requires the release tag to match the package version, publishes a hyphenated alpha tag as a GitHub prerelease, embeds exact clean source provenance, and runs the packaged macOS/Windows app through boot plus stable-origin relaunch smoke before release publication.

### Historical stable 1.0.0 metadata

The following production values describe the already-published stable `1.0.0` release. They are retained as historical deployment data; they are not valid checksums or filenames for `1.0.1-alpha.1`.

```bash
MACARONI_INSTALLER_MACOS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-mac-universal.dmg
MACARONI_INSTALLER_MACOS_SHA256=9c91ad656bd249d7d921084d429ba23f00692d68819937505aa3deec8e50f600
MACARONI_INSTALLER_WINDOWS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-win-x64.exe
MACARONI_INSTALLER_WINDOWS_SHA256=6b40525d524dd916ba3a46ab28bb36c3238c7cbffd993f2c1803f61f5063e1d4
MACARONI_INSTALLER_RASPBERRY_PI_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-linux-arm64.deb
MACARONI_INSTALLER_RASPBERRY_PI_SHA256=6ed21c165f5b2c5f476b0c8ab23c78397de59a2990d3f4f21dfb741b5e7e6216
MACARONI_INSTALLER_VERSION=1.0.0
```

The wtfOS Studio page only enables installer download buttons when those URLs are configured. It also exposes configured SHA-256 values in the authenticated installer manifest. After publishing the version named by `apps/macaroni-desktop/package.json`, configure that release's URLs and GitHub SHA-256 digests, then verify the download handoff with:

```bash
MACARONI_INSTALLER_COOKIE='connect.sid=...' npm run macaroni:installers:live-check
```

The verifier derives its default version and tag from the current Macaroni package and reads asset digests from the matching GitHub release; it does not treat the historical `1.0.0` checksums as alpha evidence.

## macOS Signing And Notarization

The default pipeline produces unsigned macOS artifacts. That is enough for internal testing, but public macOS distribution should add Developer ID signing and notarization secrets to GitHub Actions before promoting installer URLs:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

After those are configured, remove `dmg.sign: false` or supply the electron-builder signing identity so the DMG can pass Gatekeeper without manual user override.
