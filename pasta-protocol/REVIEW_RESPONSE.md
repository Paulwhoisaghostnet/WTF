# Pasta Protocol Review & Engineering Handoff Response

**To:** Paul (@Paulwhoisaghostnet)  
**From:** skllz (@skullzarmy)  
**Review Target:** `pasta-review-2026-10-06` (commit [`b351cccd4b1b5958ab668f2fad22d089672946c4`](https://github.com/Paulwhoisaghostnet/WTF/commit/b351cccd4b1b5958ab668f2fad22d089672946c4))  
**Package:** `Pasta-Suite-1.0.1-alpha.1-mac-universal.dmg` / `.zip`  
**Environment:** macOS (Apple Silicon & Intel Universal), Shadownet review lane  

---

Paul,

I’ve gone through your notes, the review hub in `pasta-protocol/`, the release manifest, and the V3.5 documentation. The packaging hygiene, single-installer Colander experience, and the fail-closed custody model in Macaroni V3.5 are massive leaps forward from the earlier alpha states.

Below is my direct review pass on the desktop suite and Macaroni setup, followed by a set of concrete, battle-tested solutions drawn from the work we’ve been doing on **Aleatory** that directly resolve the open blockers you called out in `KNOWN_ISSUES.md`.

---

## Part 1: Suite Walkthrough & UX Observations

### 1. Colander & General Suite Navigation
* **Hub & Routing:** Colander booting on `http://127.0.0.1:30770` with all eight tools accessible inside one native shell works seamlessly. Moving from Colander → CH-EASE → Publisher tools is intuitive, and project drafts persist cleanly across app restarts.
* **Network Guardrails:** While the notes specify Shadownet-only, the network switcher still exposes Mainnet across the tools. I recommend injecting a prominent warning banner or defaulting the desktop environment variable strictly to Shadownet for alpha builds so test keys aren’t accidentally exposed on Mainnet.
* **Port Conflict:** As noted in your warnings, running standalone Macaroni alongside Pasta Suite causes an unhandled port collision on `47835`. Since Pasta Suite now bundles everything, we should have the shell detect whether `47835` is already bound and display an explicit error modal rather than failing silently.

### 2. Macaroni V3.5 First-Run Experience
* **Fail-Closed State:** Verified that Secure Blind Mint properly remains locked on a fresh install. This is the correct security posture.
* **Doctor Friction:** The sequence required to satisfy the Companion doctor (RPC disclosures, HTTPS reverse proxy, CORS, finalizer funding floor of `~756,263 mutez`, and private IPFS pinning) is technically rigorous, but a solo creator will find it daunting without interactive CLI tooling or an automated local Docker helper. The error explanations in the UI when the doctor fails are accurate, but they would benefit from actionable inline remediation links.

---

## Part 2: Addressing the Open Blockers with Aleatory Standards

You specifically flagged several unresolved findings in `KNOWN_ISSUES.md`: the unverified state of the wider suite (Rotini in particular), unhandled `manual_review` recovery in Macaroni, and risks around split payouts. We’ve already spent the last few weeks solving these exact challenges in Aleatory (`skullzarmy/aleatory`). 

Here is how we should apply those solutions directly to Pasta Protocol:

### 1. Rotini: Full Standard Adherence to `ALEATORY-001`

Rotini has historically suffered from contract bloat, reservation timeouts, zero-mutez transfer bugs, and canvas capture edge cases. Instead of maintaining a separate, bespoke generative engine in Rotini, **Rotini should adopt the `ALEATORY-001` standard in full.**

* **Declared Libraries (`<meta name="alea:library" content="package@version">`):**
  * *The Problem:* Inlining `p5.js` (~900 KB) bloats contract storage and blows past the 32 KB Tezos operation cap.
  * *The Fix:* Rotini projects declare dependencies via meta tags. The runtime injects hash-verified libraries into the rendering harness. This shrinks the on-chain generator contract to **`<15 KB`** and drops creator origination costs to `~3.5 ꜩ`.
* **Static Parameter Extraction (`alea:params`):**
  * Up to 5 typed artist parameters parsed statically via AST without executing untrusted JavaScript on the studio origin.
* **Single-Op Deterministic Minting:**
  * Seed = mint operation hash. The piece is a pure function `f(code, seed, params)`. This completely eliminates Rotini’s fragile multi-step reservation contracts and timing race conditions.
* **Sandboxed Rendering Boundary:**
  * Untrusted artist scripts render in a sandboxed iframe on an isolated origin with zero network access, protecting local desktop tokens, keys, and session storage.
* **Completion Signal (`$alea.ready()`):**
  * The generator explicitly signals when rendering is complete, preventing blank covers or half-drawn canvas captures.
* **Ecosystem Interoperability:**
  * Rotini declaring `interfaces: ["TZIP-012", "TZIP-016", "ALEATORY-001"]` means generators created in Pasta Suite will be immediately indexable and tradeable across Aleatory, Objkt, and Teia from day one.

---

### 2. Safe Collaborations & Splits (The Aleatory PR #143 Pattern)

Across Spaghetti, Gnocchi, Rotini, and Macaroni, revenue splits introduce critical vulnerabilities: an unpayable `KT1` recipient can brick the entire mint operation, and deployers can spoof co-authorship.

We should port Aleatory’s collaboration pattern (from PR #143):
1. **Probe-and-Route-to-Admin Fallback:**
   * In on-chain mint splits (`collab.shares`, max 8 recipients), the contract probes each recipient. If an address reverts or cannot receive tez, **its share plus any division remainder automatically routes to the contract administrator.** The mint always succeeds; the edition never bricks.
2. **Attribution vs. Money Separation:**
   * Being named in `collab.shares` pays out immediately from mint #1.
   * However, appearing in the public TZIP-21 `creators` metadata array requires an explicit `accept_collaboration()` on-chain call (`collab.confirmed`). This prevents deployers from riding the reputation of artists who never consented.
3. **Pre-Origination Payable Simulation:**
   * CH-EASE and studio deploy forms must dry-run every `KT1` recipient via `run_operation` to ensure its `default` entrypoint accepts plain transfers before allowing origination.

---

### 3. Resolving the Macaroni V3.5 `manual_review` Recovery Blocker

Your primary blocker in Macaroni V3.5 is:
> *"manual_review work has no supported operator list/inspect/recovery route. Some failure paths retry indefinitely."*

Aleatory’s provider service (`provider/stuck.mts`, `provider/retry.mts`, `provider/heartbeat.ts`) solves this exact architecture:
* **Heartbeat & Stuck Detection:** Differentiate between transient network drops and terminal precondition failures.
* **Bounded Exponential Backoff:** End the indefinite retry loop by capping retry attempts and recording a terminal stalled state.
* **Operator Rescue Endpoint:** Add `GET /v1/admin/projects/{dropRef}/stuck-claims` and a guarded `POST .../reconcile` route to the Companion Admin API. This gives operators a safe, cryptographically validated inspection and recovery path without manually hacking the SQLite journal.

---

## Part 4: Studio Preflight Guardrails & Canvas Verification

From our recent studio releases in Aleatory (`3e68c13`, `5656c6b`, `984ed85`):
* **Black/Empty Canvas Detector:** Intercept cover capture and read pixel buffers. If an image is blank (e.g., missing WebGL `preserveDrawingBuffer: true`), block the publish flow before bad metadata is pinned.
* **Preflight Modal:** Enforce determinism, finish signal emission, and network isolation checks as a hard gate before the wallet origination prompt.
* **Permanent Action Acknowledgement:** Explicit checkbox requiring the creator to confirm: *"I have verified the cover image and understand it cannot be changed after deploy."*

---

## Part 5: Indexer Resilience & Caching (The `LastGood` Pattern)

Past Pasta Protocol test sessions revealed that Colander and exported static sites frequently stalled or displayed empty states when public Shadownet RPCs or TzKT indexers lagged.

### The Solution:
Adopt Aleatory's multi-tiered caching and graceful degradation model (`ea33c16`, `201b8ba`, `17ad55f`):
* **In-Flight Promise Coalescing:** De-duplicate identical RPC/TzKT calls made across concurrent component renders.
* **`LastGood` State Container:** When an indexer query fails or times out, serve the last verified cached state alongside a non-blocking background retry indicator (`ReadFailed`), preventing blank screens or hard error boundaries.
* **Portable Export Hardening:** Ship the `LastGood` stale-while-revalidate pattern directly inside the standalone exported collector sites.

---

## Next Steps

1. **Rotini Spec Alignment:** I can draft the SmartPy updates to bring Rotini into 100% compliance with `ALEATORY-001`.
2. **Macaroni Stuck Queue:** I can map Aleatory's `stuck.mts` logic directly into `companion/macaroni-v35/src/fulfillment.mjs` to close the `manual_review` bounty.
3. **Collab Split Module:** We can extract the probe-and-route split logic into a shared SmartPy library across the suite.

Let me know which of these three you’d like me to wire up first.
