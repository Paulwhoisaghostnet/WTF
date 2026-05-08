# Independent Contract Audit Panel #2

Scope: `contracts/WTFMarketplace.py` and `contracts/WTFBarterBoard.py`

Focus: authorization, role boundaries, pause semantics, cancel/accept permissions, and griefing vectors.

## Executive Summary

I did not confirm any access-control, auth, or admin-safety vulnerabilities in the requested scope.

The two contracts consistently enforce:
- admin-only control over pause/admin/withdraw actions
- seller/maker-only cancellation where expected
- token-owner or offer-target acceptance where expected
- pause gates on creation, bidding, and acceptance flows

I also ran the repo's SmartPy e2e suites for both contracts plus a compile pass. All passed cleanly.

## Confirmed Issues

None confirmed in the requested scope.

## Non-Issues Checked

### 1. Admin-only controls are enforced

Checked:
- `WTFMarketplace.toggle_pause`, `set_admin`, and `admin_withdraw_xtz`
- `WTFBarterBoard.toggle_pause`, `set_admin`, and `admin_withdraw_xtz`

Evidence:
- Marketplace admin gates at [`contracts/WTFMarketplace.py:966`](./contracts/WTFMarketplace.py#L966), [`contracts/WTFMarketplace.py:972`](./contracts/WTFMarketplace.py#L972), and [`contracts/WTFMarketplace.py:979`](./contracts/WTFMarketplace.py#L979)
- Barter admin gates at [`contracts/WTFBarterBoard.py:560`](./contracts/WTFBarterBoard.py#L560), [`contracts/WTFBarterBoard.py:566`](./contracts/WTFBarterBoard.py#L566), and [`contracts/WTFBarterBoard.py:573`](./contracts/WTFBarterBoard.py#L573)
- Marketplace tests cover unauthorized pause/admin-cancel paths at [`contracts/WTFMarketplace.py:1534`](./contracts/WTFMarketplace.py#L1534) and [`contracts/WTFMarketplace.py:1596`](./contracts/WTFMarketplace.py#L1596)
- Barter tests cover unauthorized admin-like paths at [`contracts/WTFBarterBoard.py:1090`](./contracts/WTFBarterBoard.py#L1090) and [`contracts/WTFBarterBoard.py:1332`](./contracts/WTFBarterBoard.py#L1332)

### 2. Cancel permissions match the intended actor model

Checked:
- Listing cancellation is seller-or-admin only
- Auction cancellation is creator-or-admin only, and only before any bid exists
- Trade cancellation is maker-or-admin before expiry, and anyone after expiry
- Offer cancellation is offerer, target owner, or listing seller when a listing exists

Evidence:
- Listing cancel gate at [`contracts/WTFMarketplace.py:415`](./contracts/WTFMarketplace.py#L415)
- Auction cancel gate at [`contracts/WTFMarketplace.py:697`](./contracts/WTFMarketplace.py#L697)
- Trade cancel gate at [`contracts/WTFBarterBoard.py:529`](./contracts/WTFBarterBoard.py#L529)
- Offer cancel gate at [`contracts/WTFMarketplace.py:806`](./contracts/WTFMarketplace.py#L806)
- Marketplace tests for cancel permission boundaries at [`contracts/WTFMarketplace.py:1233`](./contracts/WTFMarketplace.py#L1233) and [`contracts/WTFMarketplace.py:1435`](./contracts/WTFMarketplace.py#L1435)
- Barter tests for cancel/expiry behavior at [`contracts/WTFBarterBoard.py:838`](./contracts/WTFBarterBoard.py#L838)

### 3. Acceptance permissions are scoped correctly

Checked:
- Listed token offers can only be accepted by the listing seller
- Unlisted token offers can only be accepted by the recorded target owner
- Barter trades can only be accepted by a non-maker taker

Evidence:
- Marketplace listed-token acceptance at [`contracts/WTFMarketplace.py:844`](./contracts/WTFMarketplace.py#L844) and [`contracts/WTFMarketplace.py:848`](./contracts/WTFMarketplace.py#L848)
- Marketplace unlisted-token acceptance at [`contracts/WTFMarketplace.py:920`](./contracts/WTFMarketplace.py#L920) and [`contracts/WTFMarketplace.py:921`](./contracts/WTFMarketplace.py#L921)
- Barter self-accept guard at [`contracts/WTFBarterBoard.py:299`](./contracts/WTFBarterBoard.py#L299)
- Barter tests for wrong-sender failures at [`contracts/WTFBarterBoard.py:1126`](./contracts/WTFBarterBoard.py#L1126) and [`contracts/WTFBarterBoard.py:1144`](./contracts/WTFBarterBoard.py#L1144)

### 4. Pause semantics are internally consistent

Checked:
- Creation, bid, and acceptance flows are blocked while paused
- Cancellation paths remain available while paused

Evidence:
- Marketplace pause gates at [`contracts/WTFMarketplace.py:274`](./contracts/WTFMarketplace.py#L274), [`contracts/WTFMarketplace.py:327`](./contracts/WTFMarketplace.py#L327), [`contracts/WTFMarketplace.py:448`](./contracts/WTFMarketplace.py#L448), [`contracts/WTFMarketplace.py:509`](./contracts/WTFMarketplace.py#L509), [`contracts/WTFMarketplace.py:729`](./contracts/WTFMarketplace.py#L729), and [`contracts/WTFMarketplace.py:838`](./contracts/WTFMarketplace.py#L838)
- Barter pause gates at [`contracts/WTFBarterBoard.py:212`](./contracts/WTFBarterBoard.py#L212) and [`contracts/WTFBarterBoard.py:292`](./contracts/WTFBarterBoard.py#L292)
- Marketplace pause test coverage at [`contracts/WTFMarketplace.py:1534`](./contracts/WTFMarketplace.py#L1534)
- Barter pause test coverage at [`contracts/WTFBarterBoard.py:1089`](./contracts/WTFBarterBoard.py#L1089) and [`contracts/WTFBarterBoard.py:1311`](./contracts/WTFBarterBoard.py#L1311)

### 5. Single-edition offer rule is enforced

Checked:
- Marketplace offer creation only allows `token_amount == 1`
- UI also blocks multi-edition offer submission

Evidence:
- Contract guard at [`contracts/WTFMarketplace.py:734`](./contracts/WTFMarketplace.py#L734)
- Client-side guard at [`client/src/lib/tezos/marketplace.ts:375`](./client/src/lib/tezos/marketplace.ts#L375)

## Test Evidence

Executed successfully:
- `bash scripts/test-marketplace-contract.sh /tmp/wtf-marketplace-test /tmp/wtf-marketplace-compile`
- `smartpy test contracts/WTFBarterBoard.py /tmp/wtf-barter-test --purge`
- `smartpy compile contracts/WTFBarterBoard.py /tmp/wtf-barter-compile --purge`

Observed result:
- all runs completed with exit code `0`
- marketplace run emitted only SmartPy deprecation warnings about `.contains(...)`

## Residual Observations

These are not access-control findings, so I did not count them as confirmed issues here:
- `create_auction` does not check `listing_tokens` before opening an auction on the same token key
- token-key maps are keyed by `(token_contract, token_id)` only, which can matter if the underlying asset is multi-owner / edition-based
- unlisted offer acceptance pays the seller without royalties, which is an economic policy decision rather than an auth break

If you want, I can turn this into a fix plan next and patch the highest-risk residual issue first.
