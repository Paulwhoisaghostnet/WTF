# WTFMarketplace Contract Security Audit

## Executive Summary

The marketplace contract has one blocking correctness issue (the source file is not valid Python/SmartPy syntax as written), one high-impact economic correctness risk (token unit handling appears inconsistent with `WTF` decimals), and several medium/low hardening gaps. The contract's core transfer flow is straightforward, but deployment reliability and payment semantics need tightening before production use.

Scope reviewed:
- `contracts/WTFMarketplace.py`
- pricing/unit usage context in `shared/types.ts` and `client/src/pages/Marketplace.tsx`

## Critical Findings

### C-001: Contract source is syntactically invalid as written (compile/deploy blocker)
- Severity: Critical
- File: `contracts/WTFMarketplace.py:230`
- Evidence: The file ends with:
  - `@sp.add_compilation_target(...)` (lines 230-239)
  - no following function/class definition for decorator attachment
- Impact: The contract source does not parse as Python, so standard SmartPy/Python execution paths fail before compilation. This blocks reproducible builds and increases risk that deployed bytecode does not match repository source.
- Recommendation:
  - Replace decorator form with direct call:
    - `sp.add_compilation_target("WTFMarketplace", WTFMarketplace(...))`
  - Add CI check that compiles contract artifacts from source.

## High Findings

### H-001: WTF amount unit mismatch risk (decimals vs raw nat) can misprice sales
- Severity: High
- Files:
  - `contracts/WTFMarketplace.py:157-158` (price/royalty math on raw `nat`)
  - `shared/types.ts:5` (`decimals: 8`)
  - `client/src/pages/Marketplace.tsx:199-201` (`parseInt` for `priceWtf`)
  - `client/src/pages/Marketplace.tsx:443` (displayed directly as `X WTF`)
- Impact: If `WTF` truly uses 8 decimals, then entering/displaying "25 WTF" but transferring `25` raw units yields `0.00000025 WTF` on-chain. This can undercharge sales by up to 1e8.
- Recommendation:
  - Normalize all on-chain marketplace amounts to raw base units.
  - Convert user-facing decimal amounts with a `toRawWtf()`-style helper before calling contract methods.
  - Use formatted display (`formatWtf`) for values read from chain/storage.

## Medium Findings

### M-001: Royalty config allows `royalty_bps > 0` with no recipient, reducing seller payout unintentionally
- Severity: Medium
- File: `contracts/WTFMarketplace.py:122`, `contracts/WTFMarketplace.py:160-167`
- Impact: When `royalty_recipient=None` and `royalty_bps>0`, buyer transfers only `price - royalty` to seller and no royalty transfer occurs. Seller receives less than expected; buyers pay less than listed price.
- Recommendation:
  - Enforce invariant at listing creation:
    - `royalty_bps == 0` OR `royalty_recipient.is_some()`
  - Alternatively force `royalty_bps=0` whenever recipient is `None`.

### M-002: Non-payable entrypoints do not reject attached XTZ
- Severity: Medium
- Files: `contracts/WTFMarketplace.py:103`, `149`, `181`, `203`, `209`, `215`, `221`
- Impact: Users/integrators can accidentally send XTZ to functional entrypoints (`create_listing`, `buy`, etc.). XTZ remains in contract until admin withdrawal, which is a recoverability and trust issue.
- Recommendation:
  - Add `sp.verify(sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED")` to non-`default` entrypoints.
  - Keep treasury behavior explicit via `default`.

## Low Findings

### L-001: Missing contract-level test coverage for critical invariants
- Severity: Low
- File: `contracts/WTFMarketplace.py` (entire contract; no associated tests found in repo)
- Impact: Regressions in payout split, cancellation auth, and unit semantics may go undetected.
- Recommendation:
  - Add SmartPy tests for:
    - listing creation escrow success/failure
    - buy payout split correctness (with/without royalties)
    - cancel auth (`seller` vs `admin`)
    - rejection of accidental XTZ on non-payable entrypoints
    - decimal/raw unit conversion expectations

## Notes / Assumptions

- The high-severity unit mismatch finding assumes `WTF` decimals are intended to be `8` per `shared/types.ts`.
- This audit focuses on contract/source-level security and economic correctness, not formal verification.
