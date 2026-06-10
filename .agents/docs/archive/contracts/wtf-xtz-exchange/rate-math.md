# Rate Math

Rates are stored as an explicit fraction:

- `rate_numerator_mutez`
- `rate_denominator_wtf_units`

All WTF amounts are FA2 base units. The UI should convert human WTF using token metadata decimals `8`.

For a swap:

```text
raw = wtf_amount * rate_numerator_mutez
xtz_out_mutez = floor(raw / rate_denominator_wtf_units)
```

The caller must pass `expected_xtz_out_mutez`, and the contract rejects unless it equals the computed floor value. The caller also passes the expected owner and rate fraction so a stale UI cannot sign a swap against a listing whose terms changed or whose id was misunderstood.

The contract rejects:

- `rate_numerator_mutez == 0`
- `rate_denominator_wtf_units == 0`
- `wtf_amount == 0`
- `xtz_out_mutez == 0`
- `xtz_out_mutez > remaining_escrow_mutez`
- `expected_owner != listing.owner`
- `expected_rate_numerator_mutez != listing.rate_numerator_mutez`
- `expected_rate_denominator_wtf_units != listing.rate_denominator_wtf_units`
- `expected_xtz_out_mutez != xtz_out_mutez`

Rounding always floors in favor of the escrow/listing owner. This prevents a taker from receiving more mutez than the integer fraction actually permits.

Example:

```text
rate_numerator_mutez = 3
rate_denominator_wtf_units = 2
wtf_amount = 2001

xtz_out_mutez = floor(2001 * 3 / 2)
              = floor(6003 / 2)
              = 3001 mutez
```

`sp.split_tokens` is intentionally not used because SmartPy rounds to nearest mutez.
