PASTA SUITE 1.0.1-alpha.1 — DEVELOPER REVIEW BUILD

2026-10-06 REVIEW SNAPSHOT
Source and known issues: https://github.com/Paulwhoisaghostnet/WTF/tree/pasta-review-2026-10-06/pasta-protocol
This handoff supplies macOS only. Use its manifest/checksums to distinguish older builds with the same version. It is unsigned and unnotarized, not production approved. Use Shadownet and disposable test assets only; Mainnet remains selectable in the application.
Run only Pasta Suite, not standalone Macaroni at the same time: both Companion runtimes default to port 47835. Secure Blind Mint starts locked until the creator configures a dedicated finalizer, pinning, RPC, private backup and public HTTPS/CORS and passes the Companion doctor. Installed launch smoke does not prove a funded mint lifecycle. The dedicated finalizer key is held in private runtime custody.

macOS
1. Open the DMG.
2. Drag Pasta Suite into Applications.
3. Open Pasta Suite from Applications.

If macOS says the developer cannot be verified: close the warning, Control-click Pasta Suite in Applications, choose Open, then choose Open again. This uses only the normal macOS interface.

Windows
1. Open the Pasta Suite Setup EXE.
2. Follow the installation wizard.
3. Open Pasta Suite from the Start menu or desktop shortcut.

If Windows SmartScreen appears: choose More info, confirm the publisher/build name, then choose Run anyway.

64-bit ARM Linux / Raspberry Pi
1. Open the Pasta Suite DEB with the system software installer, or install it with the normal Debian package manager.
2. Open Pasta Suite from the desktop application menu.
3. Remove it with the same software installer or package manager after testing.

No Node.js, npm, Homebrew, terminal, or local web server is required. Pasta Suite starts its private loopback service automatically at 127.0.0.1:30770 and stores installed pages under your Documents/Pasta Suite folder. This address remains fixed so your local projects survive normal quit/relaunch. If another program is using that address, close it and reopen Pasta Suite; do not clear the application's data.

Start on Shadownet. Wallet approvals and blockchain operations remain under the connected wallet's control.

Each alpha build carries a machine-readable source revision. Review only the installer supplied for this alpha and report the exact filename when filing an issue.

Support: support@wtfos.app
