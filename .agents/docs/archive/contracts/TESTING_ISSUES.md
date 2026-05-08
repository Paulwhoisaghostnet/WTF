# WTF Contracts Testing Issues Log

Purpose: keep a running, repo-local record of contract and contract-adjacent issues found during QA, plus fixes and follow-ups.

## Status Legend
- `OPEN`: confirmed bug, no fix merged yet
- `PATCHED`: fix merged in code, needs deploy/verification
- `VERIFIED`: fix confirmed in deployed behavior
- `WONTFIX`: accepted behavior / intentionally deferred

## Issue Log

### MKT-001 - Offer accepted 12 editions instead of expected 1
- Date found: 2026-04-10
- Area: Marketplace offer flow (`place_offer` / `accept_offer`)
- Severity: Critical
- Status: `PATCHED`
- Symptom:
  - Token had 12 editions in wallet, 3 on trade board.
  - Offer accepted transferred 12 editions.
- Root cause:
  - Trade-board API exposed full wallet balance as offer quantity.
  - UI forwarded that quantity into `place_offer.token_amount`.
  - Contract honored stored `offer.token_amount`.
- On-chain evidence:
  - Operation `opQX3YxbQEWkbgDBkKCJDJnGZA3MsR2N9PXxy8ZtWXgFXGTZXzG`
  - Offer big_map value showed `token_amount = 12`.
  - Internal FA2 transfer moved `amount = 12`.
- Fix implemented:
  - Trade-board API now caps offerable quantity to `min(tradeBoardQuantity, walletBalance)`.
  - UI added safeguards for stale/oversized offers and explicit acceptance warnings.

### MKT-002 - Offers must be single-edition only
- Date found: 2026-04-10
- Area: Marketplace contract + UI
- Severity: High
- Status: `PATCHED`
- Requirement:
  - Offers must always represent exactly one edition.
- Fix implemented:
  - Contract guard in `place_offer` enforces `token_amount == 1`.
  - Additional guard blocks offers on listings where `listing.token_amount != 1`.
  - Client offer call hard-enforces `token_amount = 1`.
  - Offer quantity control removed from UI.

### OPS-001 - Origination backtracked with `storage_exhausted.operation`
- Date found: 2026-04-10
- Area: Deployment settings
- Severity: Medium
- Status: `VERIFIED`
- Root cause:
  - Storage limit set too low at origination.
- Resolution:
  - Redeploy with higher storage limit.
- Notes:
  - Operational issue, not contract logic bug.

## Potential Optimization / Audit Backlog

### OPT-001 - Offer write/read path micro-optimization
- Status: `OPEN`
- Idea:
  - In `place_offer`, avoid repeated `contains` / repeated map lookup by caching prior-offer presence/value in local variables.
- Expected impact:
  - Slight gas reduction on offer placement and replacement paths.

### OPT-002 - Lifecycle cleanup strategy for stale offers
- Status: `OPEN`
- Idea:
  - Consider explicit stale-offer cleanup tooling/endpoint visibility for owners/admin (off-chain UX + indexer hints).
- Expected impact:
  - Reduced user confusion and fewer failed accept attempts on outdated state.

### OPT-003 - SmartPy `.contains(...)` deprecation cleanup
- Status: `OPEN`
- Idea:
  - Replace legacy `big_map.contains(key)` checks with `key in big_map` style.
- Expected impact:
  - Removes compile warnings and reduces risk during future SmartPy upgrades.

## External Audit Review (Gemini) - 2026-04-10

Source document reviewed:
- `/Users/joshuafarnworth/Downloads/wtf_contract_analysis.md`

Cross-check performed against:
- `contracts/WTFMarketplace.py`
- `contracts/WTFBarterBoard.py`

### AUD-001 - Offer overwrite by mismatched `token_amount`
- Date reviewed: 2026-04-10
- Area: Marketplace `place_offer`
- Severity: Previously High, now mitigated
- Status: `VERIFIED`
- Audit claim:
  - Higher total WTF offer could overwrite a different `token_amount` offer on same token key.
- Code reality:
  - Current contract enforces `params.token_amount == 1` and rejects non-single-edition offers (`OFFER_SINGLE_EDITION_ONLY`).
  - This removes token-amount mismatch overwrite conditions in current code.
- Notes:
  - Covered by prior patch `MKT-002`.
  - Keep regression test coverage for this invariant.

### AUD-002 - `create_auction` missing active-listing exclusivity check
- Date reviewed: 2026-04-10
- Area: Marketplace `create_auction`
- Severity: Medium
- Status: `OPEN`
- Audit claim:
  - Auction creation checks active auctions/offers, but not active listings.
- Code reality:
  - Confirmed: `create_auction` checks `auction_tokens` and `offers`, but not `listing_tokens`.
- Risk:
  - Same `token_contract + token_id` can be listed and auctioned concurrently when seller has sufficient balance/operator.
  - UX and state consistency can become confusing/fragile.
- Needed change:
  - Add listing exclusivity guard in `create_auction`.
  - Add scenario test: listing exists -> auction creation fails.

### AUD-003 - Global token-key collision across different owners
- Date reviewed: 2026-04-10
- Area: Marketplace indexing model (`listing_tokens`, `auction_tokens`, `offers`)
- Severity: High (for editions/fungibles)
- Status: `OPEN`
- Audit claim:
  - Token references are keyed only by `(token_contract, token_id)`, not seller/owner.
- Code reality:
  - Confirmed: token maps are keyed by `token_ref_type` without owner dimension.
- Risk:
  - One user’s listing/offer/auction can block other owners of same edition/fungible token id.
  - Prevents parallel listings/offers per owner and can misalign trade-board expectations.
- Needed change:
  - Redesign keying strategy to include owner (or move to id-first references and owner-scoped indexes).
  - Add tests with two owners holding same token id.

### AUD-004 - Unlisted `accept_offer` path does not apply royalties
- Date reviewed: 2026-04-10
- Area: Marketplace `accept_offer` unlisted branch
- Severity: Medium (policy/economic)
- Status: `OPEN`
- Audit claim:
  - Royalties are enforced from listing config only; unlisted offer acceptance pays full amount to seller.
- Code reality:
  - Confirmed: unlisted branch transfers full `offer.amount_wtf` to seller.
- Risk:
  - Users can route secondary sales through unlisted offers to bypass creator royalties.
- Needed decision:
  - `WONTFIX` (explicitly allow P2P no-royalty trades), or
  - enforce royalty source for unlisted path (metadata/view policy), or
  - disallow accepting offers unless token is listed with royalty terms.

### AUD-005 - Internal operation count / looped transfers
- Date reviewed: 2026-04-10
- Area: Marketplace + Barter settlement loops
- Severity: Low/Medium (gas & operation-limit risk)
- Status: `OPEN`
- Audit claim:
  - Many `sp.transfer` calls inside loops can increase gas and risk hitting operation limits.
- Code reality:
  - Confirmed in:
    - Marketplace `settle_auction` shares loop.
    - Barter `create_trade`, `accept_trade`, `cancel_trade` loops.
- Risk:
  - Higher failure risk for large transfer sets.
  - Unbounded `shares` list in auctions worsens worst-case cost profile.
- Needed changes:
  - Batch by FA2 contract where possible (aggregate `txs` into fewer `sp.transfer` calls).
  - Add practical length caps (especially auction shares).
  - Add stress tests for max list sizes and gas headroom.

## Independent 5-Agent Panel Audit - 2026-04-10

Panel mode:
- Five independent audits were run in parallel with different focus areas:
  - economic invariants,
  - auth/role boundaries,
  - listing/auction/offer interaction collisions,
  - barter settlement correctness,
  - gas/protocol-limit risk.

Execution evidence captured during panel run:
- `smartpy test contracts/WTFMarketplace.py build/smartpy/marketplace-test --purge` (pass)
- `smartpy compile contracts/WTFMarketplace.py build/smartpy/marketplace-compile --purge` (pass)
- `smartpy test contracts/WTFBarterBoard.py build/smartpy/barter-test --purge` (pass)
- `smartpy compile contracts/WTFBarterBoard.py build/smartpy/barter-compile --purge` (pass)

Consensus findings and statuses:

### PANEL-001 - Owner collision from global token keying
- Date reviewed: 2026-04-10
- Area: Marketplace `listing_tokens` / `auction_tokens` / `offers` key model
- Severity: High
- Status: `OPEN`
- Confirmed by panel:
  - Active state is keyed by `(token_contract, token_id)` only.
  - Multi-holder editions/fungibles can block/overwrite each other.
- Additional notes:
  - This aligns with `AUD-003`.

### PANEL-002 - Missing listing exclusivity in `create_auction`
- Date reviewed: 2026-04-10
- Area: Marketplace `create_auction`
- Severity: Medium
- Status: `OPEN`
- Confirmed by panel:
  - `create_auction` checks active auction + offer, but not active listing for same token key.
- Additional notes:
  - This aligns with `AUD-002`.

### PANEL-003 - Stale offer persists across listing resolution
- Date reviewed: 2026-04-10
- Area: Marketplace `buy` and `cancel_listing` lifecycle cleanup
- Severity: Medium
- Status: `OPEN`
- Confirmed by panel:
  - Listing can resolve while offer escrow remains recorded for same token key.
  - Creates awkward authorization/refund lifecycle for post-sale ownership states.
- Needed change:
  - Ensure listing resolution paths clear/refund offer state for that owner-token.

### PANEL-004 - Royalty bypass path on unlisted `accept_offer`
- Date reviewed: 2026-04-10
- Area: Marketplace `accept_offer` (unlisted branch)
- Severity: Medium
- Status: `OPEN`
- Confirmed by panel:
  - Unlisted acceptance pays seller full offer amount.
  - Can be used to bypass listing-specific royalty logic.
- Additional notes:
  - This aligns with `AUD-004`.

### PANEL-005 - Auction share fanout risk (unbounded recipients)
- Date reviewed: 2026-04-10
- Area: Marketplace `create_auction` + `settle_auction`
- Severity: Medium/High (operational)
- Status: `OPEN`
- Confirmed by panel:
  - Share percentage total is bounded, but recipient count was not bounded in legacy contract.
  - Settlement performs per-share payout operations, increasing gas/internal-op pressure.
- Needed change:
  - Cap share list length and/or batch payouts.

### PANEL-006 - Barter contract correctness (current)
- Date reviewed: 2026-04-10
- Area: `WTFBarterBoard`
- Severity: Informational
- Status: `VERIFIED`
- Panel outcome:
  - No confirmed exploitable settlement correctness bug was reproduced.
  - Residual recommendation remains gas-headroom stress coverage expansion.

### PANEL-007 - Contract CI coverage gap
- Date reviewed: 2026-04-10
- Area: test automation
- Severity: Low
- Status: `OPEN`
- Confirmed by panel:
  - `npm run contract:test` script only covers marketplace flow.
  - Barter contract test/compile required direct SmartPy commands during audit.

### PANEL-008 - SmartPy deprecation warnings (`.contains`)
- Date reviewed: 2026-04-10
- Area: contract style maintenance
- Severity: Low
- Status: `OPEN`
- Confirmed by panel:
  - Legacy `.contains(...)` usage triggers warnings in marketplace compile/test runs.
  - Not a runtime blocker, but future-compatibility debt.

## Verification Checklist (per patch)
- [ ] Unit/scenario tests pass in SmartPy
- [ ] App type-check passes (`npm run check`)
- [ ] App build passes (`npm run build`)
- [ ] Mainnet/sandbox smoke test confirms expected transfer amounts
