# Review boundaries and known issues

This is a developer review, not a release-readiness or security signoff. All eight tools remain accessible in Pasta Suite; the Macaroni-focused September assessment cannot exclude the other tools from the actual installer surface.

## Macaroni V3.5: review first

These are unresolved findings in the [2026-09-03 assessment](../PASTA_PROTOCOL_ALPHA_READINESS_2026-09-03.md), not fixes delivered by this handoff:

- **Stuck work/recovery:** `manual_review` work has no supported operator list/inspect/recovery route. Some failure paths retry indefinitely. Do not force requeues or edit SQLite to resolve ambiguous chain operations.
- **Signed-attempt reconciliation:** a changed-precondition branch can mark a signed attempt failed without the canonical-absence evidence otherwise required before releasing single-flight protection. Review [fulfillment](../companion/macaroni-v35/src/fulfillment.mjs) and [journal](../companion/macaroni-v35/src/journal.mjs).
- **Companion port collision:** Suite and standalone Macaroni both default to `127.0.0.1:47835` with separate private runtime roots. Run only one desktop app at a time. This handoff supplies the suite, so installing Macaroni separately is unnecessary.
- **Desktop hardening findings:** review external wallet-popup preload exposure, `/export` origin/host checks, packaging's top-level secret denylist, and authentication to whichever local service answers on the Companion port. See [Suite main process](../apps/pasta-suite-desktop/src/main.cjs) and [desktop adapter](../companion/macaroni-v35/desktop-adapter.cjs).
- **Coverage gaps:** mocked lifecycle tests do not replace real contract-binding/allocation-boundary checks or an installed-app, funded end-to-end mint rehearsal. The original report also lists transient rejected-promise caching and unused recovery code.

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
