# Pasta Suite Desktop Packaging

Pasta Suite Desktop bundles the local-first Pasta Protocol creator tools into one Electron app:

- Macaroni
- Spaghetti
- Gnocchi
- Ravioli
- Rotini
- Penne
- Lasagna

The package serves the tools from a private `127.0.0.1` server using production-style `/creation-tools/<tool>/...` paths. This keeps wallet, RPC, and static asset assumptions aligned with `wtfos.app` while disabling hosted wtfOS-only services inside the downloaded app.

## Local Builds

```bash
npm run pasta-suite:desktop:check
npm run pasta-suite:desktop:prepare
npm run dist:mac --prefix apps/pasta-suite-desktop
```

Platform-specific package commands:

- macOS universal DMG/ZIP: `npm run dist:mac --prefix apps/pasta-suite-desktop`
- Windows x64 NSIS installer: `npm run dist:windows --prefix apps/pasta-suite-desktop`
- Raspberry Pi arm64 Debian package: `npm run dist:raspberry-pi --prefix apps/pasta-suite-desktop`

The resulting macOS DMG uses the normal drag-to-Applications experience. The Windows EXE uses a per-user NSIS wizard with install-location selection, Start menu and desktop shortcuts, and an optional launch-on-finish step. End users do not need Node.js, npm, Homebrew, or a terminal.

### Unsigned review builds

Unsigned artifacts are supported for developer review and early beta distribution. They include GUI-only fallback instructions in `apps/pasta-suite-desktop/build/README.txt`:

- macOS: Control-click the installed app, choose **Open**, then confirm **Open**.
- Windows: choose **More info**, verify the build name, then choose **Run anyway**.

Signing removes these warnings but does not change the packaged application. Public release builds should use an Apple Developer ID plus notarization and an Authenticode certificate when those credentials are available.

## GitHub Release Builds

Run the **Pasta Suite Desktop Installers** workflow manually or push a tag like:

```bash
git tag pasta-suite-desktop-v1.0.0
git push origin pasta-suite-desktop-v1.0.0
```

The workflow builds:

- macOS universal DMG/ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi arm64 `.deb` on `ubuntu-latest`

For a manual release, run the workflow with `publish_release=true` and `release_tag=pasta-suite-desktop-v1.0.0`.

## Production Manifest

`GET /api/pasta/installers` is authenticated and reads:

- `PASTA_SUITE_INSTALLER_VERSION`
- `PASTA_SUITE_INSTALLER_MACOS_URL`
- `PASTA_SUITE_INSTALLER_MACOS_SHA256`
- `PASTA_SUITE_INSTALLER_WINDOWS_URL`
- `PASTA_SUITE_INSTALLER_WINDOWS_SHA256`
- `PASTA_SUITE_INSTALLER_RASPBERRY_PI_URL`
- `PASTA_SUITE_INSTALLER_RASPBERRY_PI_SHA256`

Production remote installer URLs must be HTTPS. Same-origin relative paths are allowed, and loopback HTTP is allowed only outside production for local development.

After publishing a release and configuring production env, verify the public/authenticated installer surface with:

```bash
PASTA_SUITE_INSTALLER_COOKIE='connect.sid=...' npm run pasta-suite:installers:live-check
```

The live check fetches the expected GitHub release, compares asset URLs and GitHub SHA-256 digests to the authenticated `/api/pasta/installers` manifest, and confirms unauthenticated requests stay protected.

## Native Boundary

The suite exposes `window.PASTA_SUITE_DESKTOP.native` and `window.MACARONI_DESKTOP.native`. Macaroni uses that second flag to hide hosted wtfOS publishing and installer-download controls. The suite also blocks hosted pinning and publish API calls server-side, so downloaded builds require user-owned Pinata or IPFS node configuration.
