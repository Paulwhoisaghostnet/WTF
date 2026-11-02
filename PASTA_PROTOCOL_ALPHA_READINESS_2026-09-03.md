# Pasta Protocol — Alpha Shipment Readiness Assessment

> Historical assessment, preserved for review. Start with the [current review hub](pasta-protocol/README.md) and [known issues/evidence corrections](pasta-protocol/KNOWN_ISSUES.md). This report predates the tagged review snapshot and is not shipment approval. All eight tools remain accessible in the suite; installed smokes do not prove a real doctor-to-ready transition or funded lifecycle. Source/guard counts below are historical claims, not current measurements.

- **Date:** 2026-09-03
- **Branch reviewed:** `codex/macaroni-v35` (entire V3.5 body of work uncommitted at review time)
- **Scope:** Macaroni V3.5 secure blind mint — self-hosted Companion runtime, Macaroni Studio and Pasta Suite desktop applications, `MacaroniBlindMintFA2V35` contract, hosted wtfOS server path, and the 2026-09-02 macOS alpha installers (`artifacts/macaroni-v35-alpha-20260902/`)
- **Out of scope:** the wider Pasta Protocol lineage (Ravioli, Gnocchi, Rotini, Penne, Lasagna, Spaghetti publishers), which carries its own tail of claimed-but-unverified P0 records and is correctly excluded from this alpha's tester boundary

---

## Verdict

**Conditionally ready for a controlled, Shadownet-only alpha.** The engineering quality of the V3.5 stack is well above what the "alpha" label implies: the security model, crypto custody, finality discipline, and crash-recovery journaling are real in code and behaviorally tested. Four conditions should be resolved before installers reach testers; one of them (operator recovery of stuck claims) is a genuine functional gap rather than polish.

---

## Review methodology (agentic provenance)

This assessment was intentionally **not** derived from the project's own documentation or the Bug Bounty Board's claims. It was produced by a coordinating agent that ran direct verification and dispatched two independent specialist review agents, each instructed to read source code and artifacts rather than trust docs:

1. **Direct verification (coordinating agent):** executed the Companion test suite per-file, ran the four repo-level policy/coverage gates, hashed the contract artifact across every ship location, diffed the three Companion source trees, confirmed the packaged dependency-resolution model, and skimmed the SmartPy contract's entrypoint and assertion surface.
2. **Companion runtime review agent:** independent line-level review of all ~4,700 lines of `companion/macaroni-v35/src/`, both adapters, and all ten test files, focused on incomplete work, secret leakage, money/finality correctness, robustness, and test quality.
3. **Desktop packaging review agent:** independent review of the uncommitted Electron changes in `apps/macaroni-desktop/` and `apps/pasta-suite-desktop/`, the desktop adapter/setup bridge, the `prepare-assets` pipeline, and the four machine-readable smoke receipts, focused on renderer isolation, secret exclusion, supervision lifecycle, and receipt-versus-README claims.

Findings below are attributed to the agent that produced them. Where the two reviews and the direct checks overlapped, they corroborated each other.

---

## Evidence verified directly

| Check | Result |
| --- | --- |
| Companion test suite (`companion/macaroni-v35`, 10 files) | 50/50 pass, exit 0 |
| V3.5 contract policy (`scripts/macaroni/v35-contract-policy.test.mjs`) | 4/4 pass |
| Desktop package policies + artifact-smoke tests (3 files) | 17/17 pass |
| Server macaroni policy (`server/routes/macaroni-policy.test.ts`) | 24/24 pass |
| Inventory E2E coverage (`npm run test:e2e:inventory:coverage`) | Pass (244 inventory rows, 119 route fixtures, 17 domain workflows, 74 admin surfaces) |
| Contract artifact hash across all four ship locations | Byte-identical `02ff0cf52fc413c4dff111104b1e5f65613a91b7c5ce6e46f88bb17e9a982b9c` |
| SmartPy source hash (`contracts/wtf-collections/MacaroniBlindMintFA2V35.py`) | `ebf8740fe532784b…` — matches the recorded final-source value |
| Companion source trees (`companion/`, both `apps/*/companion/`) | Identical apart from excluded `node_modules` |
| Packaged dependency model | Desktop `package.json` pins the same eight Companion dependencies; a policy test asserts `deepEqual` between the two dependency sets |

The contract itself is a single 2,263-line SmartPy module: 21 entrypoints, ~340 `sp.verify` guards, and embedded lifecycle scenarios asserting claim, subsidy, treasury, and final-sweep balances.

**Not reproduced in this review:** the recorded Shadownet lifecycle proofs (three KT1 originations; the 151,180-mutez subsidy derivation) and the full 659-test inventory E2E UI run. Both are claimed with evidence in the canonical records but were not re-executed tonight.

---

## Strengths confirmed in code

**Companion runtime** (runtime review agent):

- Constant-time admin auth (`timingSafeEqual` over SHA-256 digests) checked before any body parsing.
- Exact-origin CORS allowlist, deny-by-default, no wildcard mode; placeholder origins rejected at config load.
- AES-256-GCM with fresh 96-bit IVs, verified auth tags (tamper-tested), no unauthenticated modes, correct V1/V2 framing offsets and streaming-decrypt bounds.
- No path traversal: every path segment regex-gated (UUIDs, `[a-z0-9-]+`, digits) before any `path.join`.
- Dual secret-scrub layers: `assertSecretFree` on every HTTP response (a leak becomes a 500, behaviorally tested) plus a journal-payload guard.
- Single-flight settlement enforced twice (partial unique index on `(network, signer)` plus an explicit blocking check), encrypted signed-bytes journaling before injection, immutable operation hashes via SQL triggers, replacement only after branch-TTL expiry plus a block-by-block canonical-absence scan.
- Two-block finality required consistently: head−2 claim reads, 0/1-confirmation rejection, finalized-snapshot contract binding. All boundary cases tested.
- Fail-closed startup: the service refuses to listen unless the doctor passes.
- Zero TODO/FIXME/stub markers; every route promised in `API.md` exists.

**Desktop packaging** (desktop review agent):

- Admin token never reaches the renderer: generated in the main process (0600), injected as a header only inside the main-process proxy; preload exposes two benign IPC wrappers.
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on all windows and popups; IPC handlers validate exact sender origin and pathname.
- Proxy enforces `Host` + `Origin` equality before forwarding state-changing routes; belt-and-braces response sanitization in both the adapter and the Companion.
- Packaging excludes `.env`, `secrets/`, `data/`, `node_modules`, `state.sqlite` — receipt-verified in all four installed packages.
- Restart-loop protection via a failed-configuration fingerprint; port conflicts on the Studio origins produce an explicit dialog rather than a silent origin switch.
- The four smoke receipts are genuine installed-app checks (launch, stable-origin relaunch persistence, asset presence, contract byte-equality, native setup card state transition), not fabricated evidence.

---

## Findings and conditions

### Condition 1 — Commit the branch (release hygiene, blocking by policy)

The entire V3.5 effort — roughly 10,400 added lines in tracked files plus the new Companion trees, contract, and DB migration `0126` — sits uncommitted on `codex/macaroni-v35`. All four installers carry `dirty: true` provenance (declared honestly in the artifact README). A single accidental checkout or reset destroys the release. Committing is the cheapest, highest-value step available and is a prerequisite for the repo's own clean-provenance release policy.

### Condition 2 — No operator recovery path for stuck claims (functional gap, alpha-blocking)

*Source: runtime review agent.* Work items can reach `manual_review` (`src/journal.mjs:1045-1048`) and claims can reach `attention_required` (`src/fulfillment.mjs:521-522`), but `http-service.mjs` exposes no route to list, inspect, or requeue them; `leaseNext` never selects `manual_review` rows; and `BACKUP_RECOVERY.md` explicitly tells operators not to force retries without offering an alternative. Recovery today means hand-editing SQLite. Alpha testers on flaky testnet RPC/TzKT **will** park claims in these states. Related: failed work retries forever at a flat one-block interval (`fulfillment.mjs:632-636`); `attempt_count` is stored but never consulted, so a dead pinning endpoint spins silently while a claim sits in `publishing_to_ipfs`.

### Condition 3 — `failed` reconciliation without canonical-absence proof (evidence-discipline gap)

*Source: runtime review agent.* In the injection state machine's else-branch (`fulfillment.mjs:287-291`, reached on `fifo_cursor_changed` / `arm_precondition_changed`), a signed-but-uninjected attempt is reconciled to `failed` without the branch-expiry-plus-absence proof the rest of the codebase requires. This frees the single-flight lock while the old bytes remain includable within TTL. Blast radius is bounded — the contract's FIFO cursor prevents any double-settle; worst case is a fee-level loss on a counter conflict — but it violates the system's own discipline and is a small fix.

### Condition 4 — Companion port collision when both apps are installed

*Source: desktop review agent.* Both apps hardcode Companion port 47835 with per-app runtime roots. The alpha README offers both installers; a tester who runs both concurrently gets the second app probing the first app's Companion, passing the health-schema check, failing admin auth, and seeing a misleading "the private Studio adapter could not authenticate" message (`desktop-adapter.cjs:311-320`). Either vary the port per app or instruct testers to install exactly one app.

---

## Should-fix before wider distribution (not alpha-blocking)

1. **Wallet-popup preload exposure and variant divergence.** Pasta Suite explicitly injects its preload into external wallet popups (kukai.app, templewallet.com — `apps/pasta-suite-desktop/src/main.cjs:413-427`); Macaroni omits it but may inherit the opener's preload. Sender validation currently blocks abuse; both variants should explicitly strip the preload for non-local popups. *(Desktop review agent)*
2. **`POST /export` lacks the origin/host validation the Companion proxy has** — any local process or browser tab can overwrite `Documents/Macaroni/site`, including `drop.config.js` the creator may later publish. Pre-existing, one-check fix. *(Desktop review agent)*
3. **`prepare-assets` secret exclusion is a top-level denylist.** A stray `.env.local` or a key dropped into `templates/` would package silently. `desktop-setup.cjs:7-20` already demonstrates the allowlist-plus-forbidden-names pattern; mirror it. *(Desktop review agent)*
4. **Admin token is sent to whatever answers on 127.0.0.1:47835** with the right health schema; a different local user could bind the port and phish the token. Consider a per-install handshake secret. *(Desktop review agent)*
5. **Zero unit tests for the two most safety-critical on-chain guards** — `verifyContractBinding` and `verifyAllocationBoundary` (`tezos-watcher.mjs:337-427, 473-509`); the E2E suite stubs them out. Also untested: the `ensureExactAttemptInjected` expiry→re-sign→manual-review branches end-to-end, both pinning adapters, the upload route, and OPTIONS preflight. *(Runtime review agent)*
6. **Cached rejected promises** (`fundingPolicyPromise`, `artifactPromise` via `||=`) brick their feature until restart after one transient read failure. Fail-closed, one-line fix. *(Runtime review agent)*
7. **Dead code:** `recoverSubmittedSettlement` (`tezos-watcher.mjs:814+`) is fully implemented and never called; `journal.listAuxAssets` is unused. Remove or wire up. *(Runtime review agent)*
8. **README smoke-claim precision:** the artifact README says the "protected guide/config actions" were checked; the harness only asserts the functions exist and buttons are enabled — it never invokes them and has no negative sender test. Soften the claim or extend the harness. *(Desktop review agent)*
9. **Generated `apps/*/companion/` copies are about to be committed as build outputs.** They regenerate on every build, so drift self-heals, but committing three copies invites confusion; prefer gitignoring the generated trees. *(Desktop review agent)*

## Mainnet-promotion checklist (explicitly deferred, acceptable for Shadownet)

- Finalizer secret key unencrypted at rest (doctor enforces 0600; move toward OS keychain or encryption-at-rest).
- No rate limiting on public endpoints; `GET /static-manifest` triggers a server-side self-fetch per call and `GET /purchases/{hash}` fans out to TzKT — add small caches before public exposure.
- `private_full_scan` duplicate checking pages the entire Objkt index (privacy-preserving by design, expensive at mainnet scale).
- Canonical-absence proofs scan up to a full TTL window block-by-block (~hundreds of sequential RPC calls on replacement decisions).
- Unsigned, dirty-provenance builds: a public release requires clean-commit provenance, signing/notarization, and the platform release workflow (already stated in the artifact README).

---

## Recommendations (prioritized)

| # | Action | Effort | Rationale |
| --- | --- | --- | --- |
| 1 | Commit `codex/macaroni-v35` (and gitignore or accept the generated companion copies deliberately) | Small | Protects ~10k lines of finished work; prerequisite for provenance |
| 2 | Add a sanctioned `manual_review` recovery path: an admin route (list + inspect + requeue) or a documented desktop/CLI action; surface `last_error` prominently in Studio | Medium | The single most likely alpha-support failure mode |
| 3 | Require canonical-absence proof before reconciling a signed attempt to `failed`; otherwise route to manual review without freeing single-flight | Small | Closes the one evidence-discipline gap in the settlement path |
| 4 | Add retry escalation (promote to `manual_review` after N attempts) | Small | Converts silent infinite spins into visible operator states |
| 5 | Resolve the 47835 collision (per-app port) or add a one-app-at-a-time instruction to the tester README | Trivial–Small | Prevents the most confusing co-install failure |
| 6 | Strip preload from external wallet popups in both variants; align the two apps | Small | Removes unnecessary IPC exposure to remote content |
| 7 | Add origin/host validation to `POST /export` | Trivial | Closes a silent local overwrite of publishable output |
| 8 | Convert `prepare-assets` exclusions to an allowlist | Small | Structural protection against future secret leakage into installers |
| 9 | Unit-test `verifyContractBinding` and `verifyAllocationBoundary` | Medium | The two highest-value untested guards in the system |
| 10 | Update tester documentation: receipts prove packaging and first-run UX, not end-to-end companion function; the secure path stays locked until real setup (finalizer key, RPC, pinning, HTTPS/CORS) completes — and that setup journey is precisely what this alpha tests | Trivial | Sets accurate tester expectations |

Items 1–5 are the shipment conditions. Items 6–10 should land before any distribution beyond the initial controlled cohort.

---

## What this alpha does and does not prove

The 2026-09-02 receipts prove: the installers launch, persist across relaunch on a stable origin, contain the complete Companion payload with byte-identical contract artifacts, exclude all secret/state paths, and present the fail-closed native setup card. They do **not** prove a packaged Companion passing its doctor and completing a blind-mint lifecycle end to end — by design, since that requires a funded finalizer, real IPFS publication, and creator-supplied RPC. Alpha testers should be told this plainly: the product surface under test is the setup journey plus the Shadownet rehearsal, and the secure default remains locked until their own configuration proves out.

---

*Prepared by an agentic review pass: one coordinating agent (direct verification), one Companion-runtime review agent, and one desktop-packaging review agent, 2026-09-03. Findings were cross-checked against executed test output and hashed artifacts, not project documentation.*
