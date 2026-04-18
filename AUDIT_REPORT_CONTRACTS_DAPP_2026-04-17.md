# WTF Gameshow — Contract & dApp Security Audit

**Date:** 2026-04-17
**Scope:** `contracts/WTFMarketplaceV1_2.py`, `contracts/WTFBarterBoardV1_2.py`, client Tezos
dApp layer (`client/src/lib/tezos/**`, `client/src/lib/wallet-context.tsx`), server
contract-facing endpoints (`server/routes/marketplace.ts`, `server/routes/barter.ts`,
`server/routes/contract-activity.ts`, `server/auth/wallet-verify.ts`).
**Methodology:** Guided by the `tezos_contract_lifecycle`, `tezos_dapp_wallet_ops`, and
`smartpy-new-syntax` skills. Focus — per the user's directive — on bugs, security
concerns, and loopholes where UI/UX handles (or omits) contract logic in a way that
creates unsafe conditions or bypasses contract restrictions.
**CI status at audit time:** Both `Quality Gates` and `Deploy to Hetzner` passed for the
bundled audit-fixes merge (`5d219f9d`).

---

## Executive summary

The on-chain contracts themselves are in reasonable shape: they follow the defensive
patterns recommended by the skills (pausable, two-step admin, XTZ-rejection, self-action
bans, offer escrow/refund, bounded loops, event emission, on-chain views). The previously
applied audit tags (H-1, H-2, M-1–M-5, L-2, L-3, L-8) are in place. No critical-severity
on-chain defects were identified.

The **real risk surface is the off-chain layer**: the server trusts client-supplied
marketplace writes without any on-chain reconciliation, the dApp never asserts the
wallet's chain-id before signing, and a hardcoded contract-address fallback is duplicated
across three files. Together these create a meaningful fraud/phishing vector — a
malicious client can populate the public listings feed with fake listings, and a
misconfigured deployment can silently send users' operations to a wrong-network
contract.

**Totals:** 2 High · 6 Medium · 6 Low · 4 Informational.

---

## High

### H-1 — Server creates marketplace listings from unverified client input
**Files:** `server/routes/marketplace.ts:690-818`.
**Summary:** `POST /api/marketplace` writes directly to `marketplace_listings` using
`tokenContract`, `tokenId`, `tokenName`, `tokenThumbnail`, `priceWtf`, `listingType`,
`opHash`, and `onChainId` sourced from the request body. Validation checks only structural
shape (regex for KT1 address, integer ranges). There is **no check that `opHash` actually
exists on Tezos, points at `MARKETPLACE_CONTRACT_ADDRESS`, was signed by the caller's
wallet, or produced a listing with the claimed `onChainId`.**

**Exploit sketch:**
1. Attacker authenticates (any logged-in user).
2. Sends `POST /api/marketplace` with `tokenContract=KT1RealCollection`,
   `tokenName="Hero NFT #1/1"`, `tokenThumbnail="https://…/real.jpg"`, `priceWtf=1`,
   `opHash="op…"` (random string ≤51 chars), `onChainId="9999"`.
3. Row appears on the `/marketplace` feed with the attacker as seller, looking like a
   bargain sale of a legitimate asset.
4. A buyer clicks the listing in the UI; the UI may fall back to on-chain data (the
   current Marketplace page does fetch `/api/marketplace/onchain` separately), but since
   the two paths are shown together, any UI that prefers the DB path will surface the
   phantom listing.

**Impact:** Reputation risk and buyer confusion; setup for social-engineering scams where
an attacker DMs a link to the phantom listing, then offers to "complete the trade
privately" off-chain.
**Likelihood:** High — any authenticated user can do it.
**Recommendation:** Change the write path so listings are **created from the confirmed
on-chain state**, not the client's claim. Options:
- **Best:** server fetches TzKT `operations/{opHash}` (or polls the `listing_created`
  event via the big-map diff) and inserts the DB row only when the op has landed and
  matches the expected contract + sender. Mark intermediate state as `pending_onchain`.
- **Minimum:** DB row is created in `pending_onchain` status and hidden from public
  queries; a reconciliation worker promotes it to `active` after TzKT confirms the op.
- **Immediate hotfix:** on ingest, require that the supplied `opHash` matches the form
  `o[A-HJ-NP-Za-km-z1-9]{50}` (already bounded to ≤51 chars — tighten) and add a
  `verifyOpOnChain(opHash, contract, sender)` guard before insert.

---

### H-2 — Chain-ID / network not verified before sensitive contract operations
**Files:** `client/src/lib/tezos/wallet.ts` (adapter init, `getTezos()`), all functions in
`client/src/lib/tezos/marketplace.ts` and `client/src/lib/tezos/barter.ts`.
**Summary:** The app sets `preferredNetwork` on Beacon/Octez during `init()` but never
asserts that the wallet's *currently active* account is on the same network at the
moment we send an operation. The `tezos_dapp_wallet_ops` skill explicitly calls this out
as a required hardening: "verify chain-id before each sensitive operation… block send
when wallet network and app network diverge."

**Exploit sketch / failure mode:**
- User connects wallet on ghostnet. App runs on mainnet. `connectWallet` succeeded on
  first load because `requestPermissions` will happily bind to whatever network the
  wallet is currently on. Later operations go through our mainnet RPC but the wallet
  signs assuming its active network.
- In the worst case (contract address exists on both networks), funds go to the wrong
  contract. More commonly the op fails at simulation and the user loses gas.
**Impact:** Silent gas loss, confusing errors, potential asset misdirection.
**Likelihood:** Medium — users with multiple networks enabled in their wallet.
**Recommendation:**
- Before every contract op, call `tezos.rpc.getChainId()` and compare to the expected
  chain ID (Ithacanet/mainnet/ghostnet hashes). If mismatch, show a blocking modal
  asking the user to switch network in their wallet.
- Also pull the wallet's active account network at send time
  (`adapter.client.getActiveAccount()` returns the network too) and diff against
  `getNetwork()`.
- Display the expected network + contract address next to every sign-button (see L-2).

---

## Medium

### M-1 — Auction bid history accepts arbitrary client-supplied amounts
**File:** `server/routes/marketplace.ts:867-951`.
**Summary:** `POST /api/marketplace/:id/bid` inserts `req.body.amountWtf` and
`req.body.opHash` into `marketplace_bids` with no schema validation, no range check, and
no on-chain reconciliation.

**Exploit:** an authenticated user can POST
`{ amountWtf: "999999999999999", opHash: "fake" }` to any auction listing, polluting the
bid ledger with inflated bids that appear as "highest bid" in the UI.
**Recommendation:** zod-validate `amountWtf` as a non-negative integer string within
contract precision limits; verify the supplied `opHash` via TzKT matches a `bid`
invocation against the marketplace contract from `req.user`'s linked wallet.

---

### M-2 — `/sold` endpoint lacks ownership check and on-chain reconciliation
**File:** `server/routes/marketplace.ts:953-1006`.
**Summary:** Any authenticated user can call `POST /api/marketplace/:id/sold` on any
active listing. The handler flips `status` to `sold` and notifies the seller that
"$ACTOR bought your listing". There is no verification that the caller actually bought
the token on-chain.

**Exploit:** targeted harassment notifications; state corruption (listing marked sold
even though it's still active on-chain).
**Recommendation:** require the caller to supply an `opHash`; verify on TzKT that the op
is a `buy(listingId)` from their linked wallet targeting the marketplace contract.
Alternative: drive state purely from on-chain events and remove this endpoint entirely.

---

### M-3 — Hardcoded marketplace contract fallback in three files
**Files:**
- `client/src/lib/tezos/marketplace.ts:5`
- `server/routes/marketplace.ts:25`
- `server/routes/contract-activity.ts:19`

All three default to `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj` when the env var is missing.
If a production deployment forgets to set `VITE_MARKETPLACE_CONTRACT_ADDRESS` or
`MARKETPLACE_CONTRACT_ADDRESS`, the entire stack silently targets that address without a
visible warning to users.

**Recommendation:**
- Production server: **fail closed** at boot if `MARKETPLACE_CONTRACT_ADDRESS` is unset
  (throw and refuse to start, same pattern used by the new `session-secret.ts`).
- Client build: fail the Vite build if `VITE_MARKETPLACE_CONTRACT_ADDRESS` is empty when
  `NODE_ENV=production`.
- Add an explicit network-keyed contract map in a shared constants file so ghostnet and
  mainnet addresses are picked automatically from `getNetwork()`.

---

### M-4 — Client `toNat` converts via JS `Number`, losing precision above 2^53
**Files:** `client/src/lib/tezos/marketplace.ts:24-30`,
`client/src/lib/tezos/barter.ts:71-77`.
**Summary:** Both helpers do `Number(string)` and only check
`isFinite && isInteger && ≥0`; they do **not** check `Number.isSafeInteger`. For WTF
balances or any large FA2 amount above `2**53 - 1 ≈ 9.0e15`, IEEE-754 silently rounds the
value before it reaches Taquito.

**Example:** a user pays `1_000_000_000_000_000_001` mutez-WTF. `Number("1000000000000000001")` →
`1000000000000000000` (rounded). `Number.isInteger` returns true. The contract receives the
**wrong amount** (off by 1 mutez-unit; worse with larger inputs).

For current WTF decimals (0), realistic amounts stay well under the limit, so this is
theoretical today but becomes exploitable if WTF (or any other FA2 the marketplace lists)
uses ≥10 decimals.

**Recommendation:** require amounts as **strings** all the way down to Taquito — Taquito
accepts native string/BigNumber and correctly handles `sp.nat`. Or add
`Number.isSafeInteger` check and reject over-precision values with a clear error.

---

### M-5 — Wallet signature verification accepts 8 strategies
**File:** `server/auth/wallet-verify.ts:52-123`.
**Summary:** `verifyWalletSignature` tries eight combinations of hex payload × watermark
presence and treats any successful verification as valid. This was added to handle wallet
quirks but is a defense-in-depth concern: if any wallet (or any future Taquito release)
ever produces a signature over `raw msgHex` without the 0x05 watermark, that signature
would be accepted even though it is semantically a signature over the underlying bytes
— a much weaker constraint than "signed this login challenge."

There is no immediate cross-domain attack (operation watermark 0x03 never matches payload
watermark 0x05), but the permissive surface violates least-privilege.

**Recommendation:** identify the exact strategy used by the Beacon + Octez SDKs in
`client/src/lib/tezos/wallet.ts` (they should produce `correctPayload + 05 wm` = the
canonical micheline-string hash). Lock verification to that single strategy plus a
fallback for `clientPayload + 05 wm` (the char-count variant) if legacy clients still
exist. Remove the no-watermark strategies entirely.

---

### M-6 — Contract activity ledger stores unauthenticated wallet claims
**File:** `server/routes/contract-activity.ts:459-544`.
**Summary:** Any authenticated user can POST `walletAddress: "tz1Victim…"` and have it
recorded as a contract interaction attempt. Admin-ledger readers see spoofed attribution;
the failure-notification path (`createNotification` on status=failure) is keyed on the
caller's session user, so it's not directly exploitable for notification spoofing, but
the audit trail is unreliable.

**Recommendation:** ignore the client's `walletAddress` and derive it from the caller's
set of linked wallets (from `user_wallets`), marking the log as `walletAddress: null`
when the user has no linked wallet. If the caller supplies a wallet, assert it is one of
the user's verified linked wallets before persisting.

---

## Low

### L-1 — No post-op on-chain reconciliation
**Files:** `client/src/lib/tezos/marketplace.ts`, `client/src/lib/tezos/barter.ts`
(`op.confirmation(1)` call sites).
Client treats one confirmation as success and fires `sendActivity({status:"success"})`.
A single-block reorg would roll back the op while DB state moves on. The server never
re-verifies via TzKT after the success telemetry lands.
**Recommendation:** add a reconciler that polls TzKT for the stored `opHash` and either
confirms (after N blocks) or rolls back the DB row.

### L-2 — Pre-sign UI does not surface network, contract, or expected effects
No Marketplace or Barter submit flow shows "You are signing on **mainnet**, contract
**KT1Jt6gU…**, expected effect **buy listing #12 for 25 WTF + 1 FA2 transfer**." This is
explicitly flagged by `tezos_dapp_wallet_ops` as a core UX safeguard.
**Recommendation:** add a `<TxPreview />` component rendered next to the submit button
that displays network, contract address, entrypoint, and the exact args being signed,
with a collapsed raw-parameters section.

### L-3 — `place_offer` does not verify target actually owns the token
**File:** `contracts/WTFMarketplaceV1_2.py:727-784`.
Anyone can place an offer targeting an address that never owned the token. Offerer's WTF
is escrowed until they cancel. Offerer-only harm, not contract-funds harm, but allows
an attacker to grief by spamming offer slots if they want to consume storage.
**Recommendation:** optional — add a `balance_of` pre-check (adds a round-trip) or a
dApp-side TzKT pre-check before submitting the tx. Since the target address can be
anything and ownership may legitimately change, blocking in-contract is overkill.

### L-4 — Offers stale after target transfers token
Once placed with `target_owner = tz1A`, the offer is accept-able only by `tz1A`. If `tz1A`
transfers the token to `tz1B` via plain FA2 `transfer`, the offer is forever unacceptable
but the WTF stays escrowed until the offerer cancels.
**Recommendation:** dApp-side — alert the offerer when the TzKT-observed current owner of
`(contract, id)` is no longer `target_owner`, with a one-click "cancel offer" button.

### L-5 — 100% royalty permitted
**File:** `contracts/WTFMarketplaceV1_2.py:933`, `set_token_royalty` bounds
`royalty_bps ≤ 10_000`.
An admin (accidental or malicious) can set royalty to 100%, causing all sales to route
every WTF to the royalty recipient. Current scope is admin-only so risk is low, but a
tighter cap (e.g. 5000 bps / 50%) prevents an obvious admin footgun.

### L-6 — Barter wildcard request mode can enable low-value dumping
**File:** `contracts/WTFBarterBoardV1_2.py:293-494` (accept_trade).
When a requested item has `token_id = None` (wildcard), the taker chooses which
`token_id` from that contract to deliver. Maker receives whatever the taker picks.
Intentional feature, but easily misused if the UI doesn't make the wildcard meaning
explicit. Makers setting wildcard may accept floor-priced dumps.
**Recommendation:** dApp — require an extra confirmation when wildcard mode is selected
("I understand the taker can send ANY token from this collection"). Optionally add a
minimum-price or allowlist filter to the requested_item record in a future contract
revision.

---

## Informational

### I-1 — `admin_force_cancel` does not refund maker
**File:** `contracts/WTFBarterBoardV1_2.py:534-540`.
By design: this is the explicit H-2 emergency escape hatch for trades where the escrowed
FA2 contract is permanently broken and `cancel_trade` would revert on every transfer.
The comment states this. **Recommendation:** document the same caveat in the admin
runbook and add an on-chain guard (e.g. `assert self.data.paused == True, "UNPAUSE_FIRST"`)
so the admin cannot use this entrypoint during normal operation.

### I-2 — Activity "attempt" logged before user consents
`trackContractActivity` sends `status:"attempt"` telemetry before the wallet prompt
appears. Users who cancel the sign prompt still leave an attempt row. Harmless but
inflates "attempted but never completed" counts.

### I-3 — Listing thumbnail URLs accept any https host
`listingUpdateSchema` validates `tokenThumbnail` only with `z.url()`. The UI shows the
image directly in the marketplace grid. A seller can point the thumbnail at an arbitrary
host (tracking pixel, deceptive image). Consider an allowlist (ipfs.io, cloudflare-ipfs,
our own CDN) or proxy through `/api/media/proxy` with a CSP whitelist.

### I-4 — Hard dependency on `api.tzkt.io/v1`
`fetchOnChainSnapshot` has no fallback indexer. A TzKT outage breaks the marketplace and
barter on-chain views. Availability issue only — safety is unaffected.

---

## Strengths observed (worth keeping)

- **Pausable contracts with XTZ-rejection and self-action bans** — `WTFMarketplaceV1_2`
  and `WTFBarterBoardV1_2` both assert `sp.amount == sp.mutez(0)` on every entrypoint and
  block self-buy/self-offer/self-accept.
- **Two-step admin transfer** (`propose_admin` / `accept_admin`) on both contracts.
- **Offer escrow + automatic refund** on `cancel_listing` and `buy`
  (`_refund_offer_if_exists`), with the state deletion placed before the FA2 transfer
  emission (Tezos atomicity means order doesn't matter, but the pattern is still good
  defensive practice).
- **Bounded loop iterations** — shares ≤ 25, auction extension ≤ 86_400s, requested
  transfers ≤ 25 — prevent gas exhaustion DoS.
- **On-chain views + event emission** on every state-changing entrypoint for indexer
  compatibility.
- **Wallet adapter as a true singleton** with promise-caching
  (`adapterInitPromise`/`connectPromise`) — matches `tezos_dapp_wallet_ops` guidance and
  avoids duplicate Beacon/Octez initialization.
- **Session-rehydration via localStorage** for non-sensitive wallet metadata only
  (address + provider name, never signatures), so page refresh does not re-prompt
  signatures — deliberate UX fix from an earlier iteration.
- **`linkWalletToUser` short-circuits** if the wallet is already linked, so the common
  case does **not** prompt a signature on reload.
- **Contract activity ledger** gives you a forensic paper trail independent of the chain.

---

## Recommended remediation sequencing

1. **Today (High):** Gate `POST /api/marketplace` and `/bid` and `/sold` behind on-chain
   verification (TzKT op lookup + sender/contract/entrypoint/params match). Hide
   `pending_onchain` rows from public feeds until confirmed.
2. **Today (High):** Add chain-id / network assertion in `getTezos()` before every
   sensitive op, plus a blocking "switch network" modal.
3. **This week (Medium):** Remove hardcoded contract fallbacks in production (fail-closed
   boot check); switch `toNat` to string/BigNumber; constrain
   `verifyWalletSignature` to the canonical strategy; derive ledger wallet from linked
   wallets server-side.
4. **Next sprint (Low):** `<TxPreview />` component, reconciliation worker, royalty cap
   reduction, barter wildcard confirmation UX.
5. **Informational:** thumbnail allowlist, TzKT fallback (e.g. better-call.dev), runbook
   entry for `admin_force_cancel`.

---

## Out of scope / not reviewed in depth

- `transferContractActivityLogs` internal DB schema (trusted).
- Additional FA2 token contracts beyond WTF (the marketplace is generic enough to accept
  any FA2, but we only audited the WTF-specific flow).
- The Studio, Inbox, and non-blockchain modules (covered in the earlier e2e audit).
- SmartPy compile artifacts (`.tz`) — assumed current per the lifecycle skill; a
  compile/diff in CI before each deploy is still recommended.

---

**Reviewed by the WTF assistant. For follow-up or to drill into any of these, open the
file and we can patch-and-test individually.**
