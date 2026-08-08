# Pasta Suite Desktop Packaging

Pasta Suite Desktop bundles the local-first Pasta Protocol creator tools into one Electron app:

- CH-EASE
- Macaroni
- Spaghetti
- Gnocchi
- Ravioli
- Rotini
- Penne
- Lasagna

The package serves the tools from the stable private origin `http://127.0.0.1:30770` using production-style `/creation-tools/<tool>/...` paths. Keeping that origin stable is part of the local persistence contract: Colander workspaces, studio drafts, remembered contracts, and recovery references remain in the same browser-storage namespace after quit/relaunch. This also keeps wallet, RPC, and static asset assumptions aligned with `wtfos.app` while disabling hosted wtfOS-only services inside the downloaded app.

Every Pasta desktop product owns a different loopback port so the suite and standalone apps can run together:

| Product | Loopback origin |
| --- | --- |
| Pasta Suite | `http://127.0.0.1:30770` |
| Macaroni | `http://127.0.0.1:30771` |
| Spaghetti | `http://127.0.0.1:30772` |
| Gnocchi | `http://127.0.0.1:30773` |
| Ravioli | `http://127.0.0.1:30774` |
| Rotini | `http://127.0.0.1:30775` |
| Penne | `http://127.0.0.1:30776` |
| Lasagna | `http://127.0.0.1:30777` |
| CH-EASE | `http://127.0.0.1:30778` |

Each shell allows one running instance. A second launch focuses the existing window. If an unrelated process owns the assigned origin, startup fails with explicit guidance instead of selecting another port and making saved browser data appear missing.

## Local Builds

```bash
npm run pasta-suite:desktop:check
npm run pasta-suite:desktop:prepare
npm run dist:alpha:mac --prefix apps/pasta-suite-desktop
```

Platform-specific package commands:

- controlled macOS human-alpha DMG/ZIP from an uncommitted integrated tree: `npm run dist:alpha:mac --prefix apps/pasta-suite-desktop`
- macOS universal DMG/ZIP: `npm run dist:mac --prefix apps/pasta-suite-desktop`
- Windows x64 NSIS installer: `npm run dist:windows --prefix apps/pasta-suite-desktop`
- Raspberry Pi arm64 Debian package: `npm run dist:raspberry-pi --prefix apps/pasta-suite-desktop`

`dist:alpha:mac` is the only installable command allowed to carry dirty-preflight provenance. It exists so a developer can install and smoke the integrated app before source promotion. `dist:mac`, `dist:windows`, `dist:raspberry-pi`, and the platform-default `dist` remain publication commands and fail closed when the checkout is dirty.

The resulting macOS DMG uses the normal drag-to-Applications experience. The Windows EXE uses a per-user NSIS wizard with install-location selection, Start menu and desktop shortcuts, and an optional launch-on-finish step. End users do not need Node.js, npm, Homebrew, or a terminal.

### Pasta icon assets

The active icon set is the Sugo palette. Its canonical SVGs and the two review palettes are published under `public/pasta-icons/`, with the selected app-specific SVG used by every static Pasta page as its favicon. Each desktop package carries the same Sugo source as `build/icon.svg`, a 1024px RGBA `build/icon.png`, and a Windows `build/icon.ico`; Electron Builder derives the platform wrapper from those assets. The palette manifest keeps Night Market and Paper Archive available for a later visual review without changing the active production set.

## Alpha provenance and smoke gate

The human-alpha package version is `1.0.1-alpha.1`. Every suite and standalone package embeds `provenance/build-provenance.json` with the product package name, exact version, 40-character base source Git SHA, dirty-worktree state, source revision, and target platform/architecture/format. Local `start`, `pack`, unpacked review builds, and the explicit `dist:alpha:mac` controlled-alpha lane may record a `-dirty` source revision. Every publication command still rejects dirty source; a publishable artifact must identify one clean source commit exactly. CI compares that embedded SHA with the workflow commit, and publication rejects an already-existing release tag when it dereferences to any other commit.

The shared macOS smoke can persist one receipt and screenshot per distributed form by setting `PASTA_DESKTOP_SMOKE_EVIDENCE_DIR`. After all nine pairs pass, generate the exact cross-suite inventory and developer runbook with:

```bash
npm run pasta:desktop:alpha-handoff -- --evidence-dir=artifacts/pasta-alpha-installers-20260808
```

The finalizer independently verifies all DMG images, tests every ZIP, requires both `arm64` and `x86_64` executable slices, validates all 18 runtime receipts, and writes `SHA256SUMS.txt`, `pasta-alpha-installer-inventory.json`, and `PASTA-ALPHA-INSTALLER-HANDOFF.md`.

The macOS and Windows workflow jobs do more than compile:

- unpack/install the artifact produced by that job;
- launch the packaged executable and load its stable loopback origin;
- verify the embedded provenance and required product assets;
- write browser storage, quit, relaunch with the same profile, and prove the value persists;
- for Pasta Suite, create a Shadownet-default Colander project and open all eight bundled tool surfaces;
- for Ravioli and Rotini, require the current deployment certificate, controller, artifact, and mint runtimes;
- on Windows, also verify Start menu and desktop shortcuts and then run the uninstaller.

Raspberry Pi packages are built and structurally inspected in CI, but their executable runtime smoke must run on an arm64 Raspberry Pi or arm64 Linux runner before that platform is considered human-alpha verified.

### Unsigned review builds

Unsigned artifacts are supported for developer review and early beta distribution. They include GUI-only fallback instructions in `apps/pasta-suite-desktop/build/README.txt`:

- macOS: Control-click the installed app, choose **Open**, then confirm **Open**.
- Windows: choose **More info**, verify the build name, then choose **Run anyway**.

Signing removes these warnings but does not change the packaged application. Public release builds should use an Apple Developer ID plus notarization and an Authenticode certificate when those credentials are available.

## GitHub Release Builds

Run the **Pasta Suite Desktop Installers** workflow manually or push a tag like:

```bash
git tag pasta-suite-desktop-v1.0.1-alpha.1
git push origin pasta-suite-desktop-v1.0.1-alpha.1
```

The workflow builds:

- macOS universal DMG/ZIP on `macos-latest`
- Windows x64 NSIS installer on `windows-latest`
- Raspberry Pi arm64 `.deb` on `ubuntu-latest`

For a manual release, run the workflow with `publish_release=true` and `release_tag=pasta-suite-desktop-v1.0.1-alpha.1`. The tag must match `apps/pasta-suite-desktop/package.json` exactly. Hyphenated alpha versions publish as GitHub prereleases.

Each product has an independent workflow and release tag. Electron Builder uses `executableName` for standalone macOS bundle names, not the display-facing product name:

| Product | Workflow | Packaged macOS bundle | Release tag |
| --- | --- | --- | --- |
| Pasta Suite | `pasta-suite-desktop-installers.yml` | `Pasta Suite.app` | `pasta-suite-desktop-v1.0.1-alpha.1` |
| Macaroni | `macaroni-desktop-installers.yml` | `macaroni-studio.app` | `macaroni-desktop-v1.0.1-alpha.1` |
| CH-EASE | `ch-ease-desktop-installers.yml` | `ch-ease-studio.app` | `ch-ease-desktop-v1.0.1-alpha.1` |
| Spaghetti | `spaghetti-desktop-installers.yml` | `spaghetti-studio.app` | `spaghetti-desktop-v1.0.1-alpha.1` |
| Gnocchi | `gnocchi-desktop-installers.yml` | `gnocchi-studio.app` | `gnocchi-desktop-v1.0.1-alpha.1` |
| Ravioli | `ravioli-desktop-installers.yml` | `ravioli-studio.app` | `ravioli-desktop-v1.0.1-alpha.1` |
| Rotini | `rotini-desktop-installers.yml` | `rotini-studio.app` | `rotini-desktop-v1.0.1-alpha.1` |
| Penne | `penne-desktop-installers.yml` | `penne-studio.app` | `penne-desktop-v1.0.1-alpha.1` |
| Lasagna | `lasagna-desktop-installers.yml` | `lasagna-studio.app` | `lasagna-desktop-v1.0.1-alpha.1` |

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
