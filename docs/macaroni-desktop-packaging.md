# Macaroni Desktop Packaging

Macaroni Desktop wraps the static Macaroni Studio bundle in Electron so users can install it without Python, npm, Node, or a local web server. The native app starts a private `127.0.0.1` server, loads `studio.html`, and keeps the same Tezos wallet/RPC and self-managed Pinata/IPFS-node workflow as the wtfOS version.

The desktop build intentionally does not include wtfOS hosted resources:

- `/api/macaroni/ipfs/pin` returns a native-app error.
- `/api/macaroni/publish` returns a native-app error.
- Studio hides wtfOS pinning, wtfOS publishing, and installer-download controls in native mode.
- Export writes a local `Documents/Macaroni/site` folder and still downloads `macaroni-site.zip`.

## Local Commands

Packaging contributors should use Node 22+ for these commands. End users do not need Node; the generated installers bundle the runtime.

```bash
npm run macaroni:desktop:check
npm run macaroni:desktop:prepare
npm run pack --prefix apps/macaroni-desktop
npm run dist:mac --prefix apps/macaroni-desktop
```

`npm run pack --prefix apps/macaroni-desktop` creates an unpacked local app for inspection. Installer builds write to `apps/macaroni-desktop/release/`.

## CI Release Flow

Run the **Macaroni Desktop Installers** workflow manually or push a tag like:

```bash
git tag macaroni-desktop-v1.0.0
git push origin macaroni-desktop-v1.0.0
```

The workflow builds:

- macOS universal DMG and ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi Linux arm64 DEB on `ubuntu-latest`

When the workflow publishes a GitHub release, set the production app env values to the release asset URLs:

```bash
MACARONI_INSTALLER_MACOS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-mac-universal.dmg
MACARONI_INSTALLER_WINDOWS_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-win-x64.exe
MACARONI_INSTALLER_RASPBERRY_PI_URL=https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v1.0.0/Macaroni-Studio-1.0.0-linux-arm64.deb
MACARONI_INSTALLER_VERSION=1.0.0
```

The wtfOS Studio page only enables installer download buttons when those URLs are configured.

## macOS Signing And Notarization

The default pipeline produces unsigned macOS artifacts. That is enough for internal testing, but public macOS distribution should add Developer ID signing and notarization secrets to GitHub Actions before promoting installer URLs:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

After those are configured, remove `dmg.sign: false` or supply the electron-builder signing identity so the DMG can pass Gatekeeper without manual user override.
