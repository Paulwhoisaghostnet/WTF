# UI-Readable Listing State

The UI/indexer can read each listing directly from the `listings` big map.

Important fields:

- `listing_id`: big-map key and record field.
- `owner`: listing creator and WTF recipient.
- `original_escrow_mutez`: XTZ originally deposited.
- `remaining_escrow_mutez`: live XTZ available for future swaps.
- `rate_numerator_mutez` and `rate_denominator_wtf_units`: integer rate fraction.
- `active`: whether `swap` can still execute.
- `status_code`: `0 = active`, `1 = exhausted`, `2 = cancelled`.
- `total_wtf_filled`: cumulative WTF base units accepted.
- `total_xtz_paid_out_mutez`: cumulative XTZ paid to takers.
- `created_at`, `closed_at`, `cancelled_at`.
- `cancelled_refund_mutez`: exact refund amount on cancel.

Suggested UI language:

- Active and `remaining_escrow_mutez > 0`: “This listing has XTZ remaining.”
- Active and `total_wtf_filled > 0`: “This listing is partially filled.”
- `status_code == 1`: “This listing is exhausted.”
- `status_code == 2`: “This listing was cancelled.”

No off-chain bookkeeping is required to show the live remaining XTZ. Read `remaining_escrow_mutez`.

