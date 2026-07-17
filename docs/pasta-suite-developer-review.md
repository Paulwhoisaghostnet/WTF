# Pasta Suite Developer Review

## Review artifacts

- macOS 11+ universal installer: `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-mac-universal.dmg`
- Windows 10/11 x64 wizard: `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-win-x64.exe`
- checksums: `apps/pasta-suite-desktop/release/SHA256SUMS.txt`
- machine-readable contents: `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.0-review-manifest.json`
- end-user instructions: `apps/pasta-suite-desktop/release/Pasta-Suite-README.txt`

These are unsigned developer-review artifacts. They require no Node.js, npm, Homebrew, terminal, or separately started web server.

## Install experience

### macOS

1. Open the DMG and accept the pre-release license.
2. Drag **Pasta Suite** to **Applications**.
3. Open **Pasta Suite** from Applications.
4. If Gatekeeper warns about an unidentified developer, Control-click the app, choose **Open**, and confirm **Open**.

### Windows

1. Open the `Pasta-Suite-1.0.0-win-x64.exe` installer.
2. Follow the per-user installation wizard and choose an install location if desired.
3. Leave **Run Pasta Suite** selected or open it from the desktop/Start menu shortcut.
4. If SmartScreen appears, choose **More info**, verify the file name, and choose **Run anyway**.

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

Pasta Suite starts a private random-port server bound only to `127.0.0.1`. It stores installed public pages under the user's `Documents/Pasta Suite/sites` directory. Projects and recovery references use the app's local browser storage. Wallets retain signing authority; Pasta Suite does not persist seed phrases or private keys.

Hosted wtfOS pinning and package-record APIs are deliberately unavailable in the desktop build. Creators use their own Pinata account or Kubo node for durable media, and exported page ZIPs remain portable to any static host.

## Current verification boundary

- The mounted macOS DMG has been checksum-verified, inspected as an `arm64 + x86_64` bundle, and launched through the artifact smoke test. That smoke created a Colander project and opened packaged CH-EASE without runtime errors.
- The Windows output is a valid NSIS GUI installer containing an x64 Electron application and the complete suite ASAR. The GitHub installer workflow now launches the packaged Windows executable and runs the same Colander/CH-EASE artifact smoke on `windows-latest`; that runner must pass before beta distribution is called cross-platform verified.
