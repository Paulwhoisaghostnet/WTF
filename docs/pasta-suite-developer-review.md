# Pasta Suite Developer Review

## Current controlled-alpha artifacts

- macOS 11+ universal installer: `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.1-alpha.1-mac-universal.dmg`
- macOS 11+ universal archive: `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.1-alpha.1-mac-universal.zip`
- all nine app installers, checksums, smoke receipts, screenshots, and exact inventory: `artifacts/pasta-alpha-installers-20260808/`
- developer handoff: `artifacts/pasta-alpha-installers-20260808/PASTA-ALPHA-INSTALLER-HANDOFF.md`

The current macOS artifacts are intentionally dirty-preflight builds for controlled human alpha. Their embedded `provenance/build-provenance.json` identifies base Git SHA `81dd26f2a050a412b60a2e0236b33e6ba341f81b`, `dirty: true`, and target `darwin/universal/dmg+zip`; the handoff binds each file to a SHA-256 plus its installed-runtime receipt. They are reviewable but not publishable. A clean tagged rebuild remains mandatory before public distribution.

The alpha artifacts are unsigned developer-review builds. They require no Node.js, npm, Homebrew, terminal, or separately started web server.

Windows 10/11 x64 NSIS and 64-bit ARM Debian/Raspberry Pi packages remain separate native-platform alpha gates. Their expected `1.0.1-alpha.1` workflows are configured, but they are not part of this macOS handoff.

## Install experience

### macOS

1. Open the DMG and accept the pre-release license.
2. Drag **Pasta Suite** to **Applications**.
3. Open **Pasta Suite** from Applications.
4. If Gatekeeper warns about an unidentified developer, Control-click the app, choose **Open**, and confirm **Open**.

### Windows

1. Open the `Pasta-Suite-1.0.1-alpha.1-win-x64.exe` installer.
2. Follow the per-user installation wizard and choose an install location if desired.
3. Leave **Run Pasta Suite** selected or open it from the desktop/Start menu shortcut.
4. If SmartScreen appears, choose **More info**, verify the file name, and choose **Run anyway**.

### 64-bit ARM Linux / Raspberry Pi

1. Open `Pasta-Suite-1.0.1-alpha.1-linux-arm64.deb` with the system software installer, or install it with the normal Debian package manager.
2. Open **Pasta Suite** from the desktop application menu.
3. After review, remove **Pasta Suite** with the same software installer or package manager.

## Required review stories

1. Fresh launch opens Colander without a terminal or browser setup step.
2. Fresh project creation and the contract manager both visibly default to Shadownet; Mainnet requires an explicit selection.
3. Colander shows CH-EASE, Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne, and Lasagna.
4. Create, rename, duplicate, archive, restore, export, import, and delete a project.
5. Open CH-EASE, prepare media/metadata, save recovery state, and hand the package to a publisher.
6. In each publisher, create or resume a contract, export its public page, and return the artifact to Colander.
7. Install a public page, open it from the local registry, rebuild it in its owner app, and uninstall it.
8. Quit and reopen Pasta Suite; confirm project, draft, contract, and page records recover.
9. Connect a wallet on Shadownet and inspect every operation before approval.
10. Uninstall the application. Confirm user-owned project/site data is preserved unless deliberately deleted in Colander.

## UX/UI review priorities

- First-run orientation: make the Colander → CH-EASE → publisher → public page sequence obvious without documentation.
- Language: distinguish **forget record**, **uninstall local page**, and irreversible blockchain actions.
- Hierarchy: keep Colander visibly central while retaining each standalone tool's identity.
- Recovery: canonical KT1 addresses, network, owner app, verification time, and next action must remain legible.
- Safety: Shadownet/mainnet state and wallet approval consequences should be visible before every send.
- Accessibility: keyboard order, focus visibility, text scaling, contrast, error recovery, and confirmation controls.
- Installer polish: icon rendering, DMG layout, Windows wizard copy, shortcuts, first launch, upgrade, and uninstall behavior.

## Storage and network boundary

Pasta Suite starts a private server at the stable origin `http://127.0.0.1:30770`. The stable origin keeps projects and recovery references in the same local browser-storage namespace after the app quits and relaunches. A second launch focuses the existing process; if another program occupies port 30770, Pasta Suite stops with a data-preserving error instead of falling back to a new origin. It stores installed public pages under the user's `Documents/Pasta Suite/sites` directory. Wallets retain signing authority; Pasta Suite does not persist seed phrases or private keys.

Hosted wtfOS pinning and package-record APIs are deliberately unavailable in the desktop build. Creators use their own Pinata account or Kubo node for durable media, and exported page ZIPs remain portable to any static host.

## Current verification boundary

- Source and policy verification cover all nine package definitions, the shared packaged-runtime smoke contract, current Ravioli/Rotini assets, stable-origin relaunch persistence, clean source provenance, and tag/version parity.
- All nine fresh macOS universal ZIPs were extracted, integrity-tested, launched, quit, and relaunched; all nine DMGs were verified, accepted/mounted, copied as installed apps, launched, quit, and relaunched. Every executable contains `arm64` and `x86_64` slices.
- The 18 runtime smokes reported zero failures, verified every required packaged asset, matched embedded dirty-preflight provenance to the base SHA, recovered browser state at every fixed origin, and captured a first-run screenshot. Pasta Suite additionally created persistent Shadownet-default Colander state and opened all eight child tools.
- The exact artifact hashes and per-format receipts live in `artifacts/pasta-alpha-installers-20260808/`. This clears the controlled macOS human-alpha gate without weakening the clean provenance requirement for publication.
- A Windows alpha artifact becomes reviewable only after the workflow installs the exact NSIS output, verifies that its desktop and Start menu shortcuts target the installed executable, launches and relaunches that executable through the same smoke, and successfully uninstalls it.
- The Debian artifact becomes reviewable only after a native 64-bit ARM Ubuntu runner verifies its architecture and package identity, installs it, verifies its desktop application entry, launches and relaunches it through the same smoke, and purges it. Physical Raspberry Pi testing remains part of the human alpha device matrix; an x64 cross-build alone is never accepted as runtime evidence.
- Clean public promotion remains blocked until the intended source is committed and every selected platform rebuilds with exact clean provenance.
