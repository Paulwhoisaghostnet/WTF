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

The contract rejects:

- `rate_numerator_mutez == 0`
- `rate_denominator_wtf_units == 0`
- `wtf_amount == 0`
- `xtz_out_mutez == 0`
- `xtz_out_mutez > remaining_escrow_mutez`

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

