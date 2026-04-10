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

## Verification Checklist (per patch)
- [ ] Unit/scenario tests pass in SmartPy
- [ ] App type-check passes (`npm run check`)
- [ ] App build passes (`npm run build`)
- [ ] Mainnet/sandbox smoke test confirms expected transfer amounts
