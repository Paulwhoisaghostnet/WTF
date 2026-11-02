# Pasta Protocol branch consolidation — 2026-11-02

## Authoritative line

`codex/pasta-mainnet-alpha-integration` at `be276100` contains the review-handoff and alpha-readiness implementation, plus later Macaroni V3.5 and hosted integration work. The current-main consolidation candidate merges it with `origin/main` at `07ce5b8a` and then applies a hosted and managed-service Shadownet-only alpha guard. The local candidate branch is `codex/pasta-consolidated-2026-11-02`; after its gates pass, fast-forward the existing PR #50 head to this commit so there is one review line. The candidate is not Mainnet approval.

`codex/pasta-review-handoff` and `codex/pasta-alpha-readiness` are ancestors or semantic predecessors of this line. `origin/skllz/pasta-review-response` at `9ba30e89` adds only review documentation beyond the older alpha line; its `pasta-protocol/REVIEW_RESPONSE.md` is byte-identical to the candidate. These branches can be retired after the final PR retains their work.

The workspace rescue snapshot predates the October 30 Macaroni recovery work. Its 92 generated Companion copies and nine September screenshots are not canonical source. Its divergent Companion files are older than this line; copying them would remove later recovery and tests. Keep canonical Companion source in `companion/macaroni-v35/` and build the desktop copies from tracked files.

## PR #39 (`codex/rotini-aleatory-001`)

PR #39 is based on the older review-handoff branch. A direct merge with the current candidate has 58 conflicts. Its Macaroni parked-work idea, desktop boundary work, single-flight recovery, doctor messages, dependency audit, and CI runner correction are represented by later, stricter implementations on the candidate. In particular, the candidate uses HMAC Companion identity, bearer-protected attention/retry routes with exact signed-attempt chain evidence, and the supported Ubuntu 24.04 CI runner. Do not replace those files with the older PR #39 versions.

The unique Rotini and collaboration additions in PR #39 are deliberately excluded:

- Its manifest declares `xmur3-sfc32`, while the current Rotini trait selector uses `mulberry32`; adding the tag would misdescribe the generated artwork. The proposed `$alea` object in exported ZIPs does not supply the declared seeded runtime, and the Studio's blanket solid-black rejection would discard intentional black artwork. A versioned, isolated, opt-in script mode needs its own output and determinism proof before declaring `ALEATORY-001` compatibility.
- `PastaCollabSplitFA2.py` claims a recipient that fails can be routed to the administrator without reverting the mint. `sp.contract` can detect a missing/incompatible entrypoint, but a recipient can still fail *during* `sp.transfer`, reverting the operation. Redirecting a collaborator's entitlement also requires an agreed economic policy and consent. The contract has no integration or payout tests.
- `REPLY_TO_NIMROD.md` is a draft response to an older review. The corrected and current disposition is `REVIEW_RESPONSE.md`.
- The fixed 10 MB Companion JSON cap is not adopted: it is not derived from the permitted metadata/setup payloads and could reject a valid large project. The current binary upload route streams separately. A JSON limit can be added when a measured protocol-specific bound is defined.

PR #39 should be closed as superseded after this disposition is acknowledged; its Aleatory and split proposals are intentionally unresolved product designs, not hidden in a duplicate branch. `codex/pasta-review-handoff` must remain until that PR is closed or retargeted.

`codex/commission-fulfillment` is a separate older Macaroni V3 WIP allocation design. Main's verified V3 correction uses creator-sealed deterministic order, one-way inventory finalization, and a full-edition reveal gate. Its CSPRNG deck is incompatible with that chosen contract and should be archived as a superseded design, not cherry-picked into V3.5.

## Release boundary

Hosted V3.5 Studio, managed registration/creator actions, private upload, publishing, and worker execution now reject Mainnet even when Mainnet signer/RPC settings are present. Native alpha packages already disable Mainnet. Existing Macaroni compatibility profiles retain their separate behavior. Shadownet alpha evidence covers one installed local-loopback paid drop; remote collector HTTPS/CORS, production managed configuration, additional sale modes, signing/notarization, and the wider Pasta P0 contract findings in `KNOWN_ISSUES.md` still need their own proof before a public or Mainnet release claim.
