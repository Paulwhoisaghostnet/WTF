# Spaghetti Desktop Packaging

Spaghetti Desktop wraps the static Spaghetti standard collection publisher in Electron so users can install the tool without Python, npm, Node, or a local web server. The native app starts a private `127.0.0.1` server, loads the bundled publisher, and keeps the same Tezos wallet/RPC and self-managed artifact workflow as the wtfOS version.

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
npm run dist:mac --prefix apps/spaghetti-desktop
```

`npm run pack --prefix apps/spaghetti-desktop` creates an unpacked local app for inspection. Installer builds write to `apps/spaghetti-desktop/release/`.

## CI Release Flow

Run the **Spaghetti Desktop Installers** workflow manually or push a tag like:

```bash
git tag spaghetti-desktop-v1.0.0
git push origin spaghetti-desktop-v1.0.0
```

The workflow builds:

- macOS universal DMG and ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi Linux arm64 DEB on `ubuntu-latest`

For a manual release, run the workflow with `publish_release=true` and `release_tag=spaghetti-desktop-v1.0.0`.

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
