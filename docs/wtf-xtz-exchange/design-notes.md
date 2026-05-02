# WTF -> XTZ Exchange Design Notes

## Research Sources Checked

- Tezos FA2 docs: https://docs.tezos.com/architecture/tokens/FA2
- SmartPy contract syntax: https://smartpy.tezos.com/manual/syntax/contracts.html
- SmartPy integer and mutez docs: https://smartpy.tezos.com/manual/data-types/integers-and-mutez.html
- SmartPy FA2 library docs and local `smartpy.templates.fa2_lib` source.
- Taquito FA2 parameter docs: https://taquito.io/docs/24.2.0/fa2_parameters/
- Objkt marketplace contract docs: https://docs.objkt.com/product/objkt-protocol/marketplace-contracts
- Teia smart contracts: https://github.com/teia-community/teia-smart-contracts
- Tezos Open Tools: https://github.com/maximus-ai-dev/tezos-open-tools
- Local WTF SmartPy contracts, especially `contracts/wtf-buyback/WtfBuybackV1.py`, `contracts/WTFMarketplaceV1_2.py`, and collection FA2 contracts.
- Local Kiln API schemas under `../building/shadownet kiln/src/lib/api-schemas.ts`.

## Findings Used

- FA2 token movement must use the standard `transfer` entrypoint and exact Michelson layout for `transfer_params`. The exchange therefore declares the FA2 transfer type with `("to_", ("token_id", "amount"))` and `("from_", "txs")` layouts.
- WTF token identity is storage-configured by contract address plus token id. Mainnet WTF is `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`. Token metadata is not trusted for settlement.
- SmartPy `sp.split_tokens` rounds to nearest mutez. This exchange uses nat multiplication, `sp.ediv`, floor quotient, and `utils.nat_to_mutez` instead.
- WTF metadata reports `decimals = 8`; human WTF display is a UI concern. Contract amounts are FA2 base units.
- Tezos internal operations are atomic with the parent operation: if the FA2 transfer fails, XTZ payout and listing storage changes roll back.

## Patterns Rejected

- `sp.split_tokens`: rejected because round-to-nearest can overpay by 1 mutez in edge cases.
- `mutez_per_wtf_base_unit`: rejected because 8-decimal WTF can have realistic rates below 1 mutez per base unit.
- Admin sweep of listing escrow: rejected because it would allow admin theft of user-funded listings.
- Off-chain remaining-balance bookkeeping: rejected because UI/indexers must read `remaining_escrow_mutez` directly from storage.

## Contract Design

`contracts/wtf-xtz-exchange/WtfXtzExchange.py` implements one-way WTF -> XTZ swaps.

Storage:

- `admin`: emergency/admin account.
- `pending_admin`: optional two-step admin receiver.
- `paused`: blocks `create_listing` and `swap`.
- `wtf_token_address`: FA2 contract address.
- `wtf_token_id`: FA2 token id, `0` for WTF.
- `next_listing_id`: monotonically increasing listing id.
- `listings`: big map from listing id to UI-readable listing record.
- `metadata`: contract metadata big map.

Listing state:

- `listing_id`
- `owner`
- `original_escrow_mutez`
- `remaining_escrow_mutez`
- `rate_numerator_mutez`
- `rate_denominator_wtf_units`
- `active`
- `status_code`: `0 = active`, `1 = exhausted`, `2 = cancelled`
- `total_wtf_filled`
- `total_xtz_paid_out_mutez`
- `created_at`
- `closed_at`
- `cancelled_at`
- `cancelled_refund_mutez`

Entrypoints:

- `create_listing(rate_numerator_mutez, rate_denominator_wtf_units)`: payable; initializes escrow.
- `swap(listing_id, wtf_amount)`: non-payable; pulls WTF from taker to owner and pays XTZ to taker.
- `cancel_listing(listing_id)`: owner-only; allowed while paused; refunds exact remaining escrow.
- `pause`, `unpause`
- `propose_admin`, `accept_admin`, `cancel_pending_admin`
- `default`: rejects accidental default calls.

Views:

- `get_listing(listing_id)`
- `get_remaining_escrow(listing_id)`
- `is_paused()`

## Dummy WTF

`contracts/wtf-xtz-exchange/DummyWtfFA2.py` uses the SmartPy FA2 library single-asset implementation with:

- token id `0`
- metadata `symbol = WTF`, `decimals = 8`
- standard `transfer`, `balance_of`, `update_operators`
- admin-only library `mint` for test setup

## Security Notes

- No admin entrypoint can transfer listing escrow.
- Swaps fail on inactive listings, zero WTF amount, zero-output rounding, insufficient escrow, missing FA2 operator approval, and insufficient taker WTF balance.
- Cancellation is owner-only and refunds exactly the live remaining escrow.
- Listing accounting is updated only after computing and checking the floor-rounded XTZ payout.
- Exhaustion is `remaining_escrow_mutez == 0`. With this rate design, any positive remaining escrow can satisfy at least a 1 mutez valid swap if the taker provides enough WTF units, so the minimum valid XTZ payout threshold is 1 mutez.

