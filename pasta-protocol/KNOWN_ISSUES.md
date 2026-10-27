# Review boundaries and known issues

This is a developer review, not a release-readiness or security signoff. The `1.0.1-alpha.1` Suite bundles all eight tools. CH-EASE, Macaroni V3.5, and Spaghetti are marked alpha supported; Gnocchi, Ravioli, Rotini, Penne, and Lasagna are visibly preview. The alpha package permits Shadownet toolkit setup only.

## Macaroni V3.5: review first

The [2026-09-03 assessment](../PASTA_PROTOCOL_ALPHA_READINESS_2026-09-03.md) predates the candidate fixes below. They still require installed-artifact and funded Shadownet proof before release signoff:

- **Stuck work/recovery:** a bearer-protected list/retry route and Studio operator panel now expose parked work and permit only chain-checked retry. Known pre-sign reserve, finalizer-funding, and fee-cap blockers park with actionable diagnostics. Pinning authorization, configuration, and CAR-integrity failures also park; transient publication retries remain visible. Changed-precondition signed attempts remain parked until exact inclusion, finalized failure, or canonical expiry evidence exists; never force requeues or edit SQLite.
- **Signed-attempt reconciliation:** changed preconditions no longer mark unresolved signed attempts failed or release signer-wide single-flight protection. Finalized terminal failures are recorded separately. Review [fulfillment](../companion/macaroni-v35/src/fulfillment.mjs) and [journal](../companion/macaroni-v35/src/journal.mjs) against a funded live run.
- **Companion port collision:** Suite and standalone Macaroni still default to `127.0.0.1:47835` with separate private runtime roots. The Suite now requires a fresh HMAC identity proof before sending its admin token and reports an actionable occupied-port state. Running both apps requires configuring separate ports.
- **Desktop hardening:** external wallet popups no longer receive the native preload; local writes including `/export` require exact Origin and Host in both installers; a parsed URL origin decides whether a child is local. Both packages now copy only Git-tracked regular Companion files, and built archives still need independent inspection. See [Suite main process](../apps/pasta-suite-desktop/src/main.cjs), [standalone Macaroni](../apps/macaroni-desktop/src/main.cjs), and [desktop adapter](../companion/macaroni-v35/desktop-adapter.cjs).
- **Coverage gaps:** focused journal, HTTP, desktop-boundary, and browser tests prove the new guards and operator controls, but mocked lifecycle tests do not replace real contract-binding/allocation-boundary checks or an installed-app, funded end-to-end mint rehearsal. The original report also lists transient rejected-promise caching and unused recovery code.

The creator/finalizer is a custodian, not trustless randomness. A dedicated signer key is stored in private runtime custody; wallet approvals do not mean the application stores no keys. Public Tezos settlement parameters reveal pointers/preimages in the mempool before inclusion; see the [Companion disclosures](../companion/macaroni-v35/README.md).

## Wider suite

The [canonical bounty records](../docs/reference/bug-bounty-records.json) retain open/claimed/unverified Pasta findings. Examples include Ravioli funds/fulfillment (`WTF-BB-500`), proof dependency identity (`WTF-BB-507`), recovery/finality (`WTF-BB-545`), and proof expiration (`WTF-BB-559`). `WTF-BB-662` tracks the Macaroni lifecycle work. Status labels and earlier claims are evidence to investigate, not proof that an issue is either fixed or currently exploitable.

No broader contract/security audit is performed by creating this review hub. Do not use Mainnet funds to find out whether an unresolved path is safe.

## What the evidence means

- The new release's installed smoke receipts cover packaging, launch/relaunch persistence, bundled assets, contract-byte parity, Colander/tool navigation, and the first-run fail-closed setup surface.
- They do not prove the real Companion doctor passes, native setup actions complete configuration, or an installed app fulfills a funded Shadownet purchase end to end.
- The native setup browser story simulates readiness responses. It is UI behavior evidence, not live infrastructure evidence.
- Historical September receipts used dirty source provenance; their passing status must not be attributed to the new installer bytes. New hashes and source identity come only from the review release manifest.
- The September report's source-line counts and `sp.verify` count are not current measurements. Its "conditionally ready" headline must be read alongside its unresolved blockers; it is not approval to distribute a production build.
- Windows/Linux artifacts, physical-device coverage, signing/notarization, production managed-service configuration, and Mainnet promotion are outside this handoff.
