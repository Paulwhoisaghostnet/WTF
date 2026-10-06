# Pasta Protocol — skllz review handoff

**Start here: [Pasta review hub](https://github.com/Paulwhoisaghostnet/WTF/tree/pasta-review-2026-10-06/pasta-protocol).**

One entry point for Colander, CH-EASE, Macaroni, Spaghetti, Gnocchi, Ravioli, Rotini, Penne and Lasagna: what each does, source/contracts/tests, install instructions, review order, and known issues. No wtfOS account or database is needed to open the desktop suite.

## Downloads

- Choose the universal macOS DMG or ZIP; they contain the same Pasta Suite `1.0.1-alpha.1` app for Intel/Apple silicon. No standalone Macaroni installation is needed.
- `Pasta-Review-Manifest.json` binds the exact clean source commit to the installer hashes and installed ZIP/DMG smoke receipts. Check `SHA256SUMS.txt`; older local builds used the same version string.
- `pasta-suite-*-smoke.json` and `pasta-suite-*-first-run.png` record installed-artifact verification, not just development launch.
- Windows/Linux packages are not included in this review handoff. Their older `1.0.0` releases are not substitutes for this V3.5 snapshot.

## Important boundaries

Unsigned and unnotarized developer-review builds. Use Shadownet, disposable test wallets and test artwork; Mainnet is still selectable and is not approved for this review. Run only one Pasta/Macaroni desktop app at a time because their Companion defaults share port 47835.

Macaroni's secure path stays locked until its dedicated finalizer, pinning, RPC, private backup, and public HTTPS/CORS configuration passes the Companion doctor. Known operator-recovery and signed-attempt findings remain unresolved. The suite exposes all eight tools, including those with unverified historical proof records.

Source checks cover Companion tests, desktop/contract policies, hosted Macaroni policy tests, inventory registration, the root build, and focused mocked-browser stories. Installed smokes cover launch/relaunch, asset and contract parity, all eight tools, and first-run setup UX. They do **not** prove a real doctor-to-ready transition or a funded installed-app mint lifecycle. Full wtfOS inventory UI and live actor/funded-chain tests are not part of this handoff.

This is an isolated review snapshot, not a merge or deployment to production `main`. [Known issues and evidence limits](https://github.com/Paulwhoisaghostnet/WTF/blob/pasta-review-2026-10-06/pasta-protocol/KNOWN_ISSUES.md) take precedence over the dated September readiness headline.
