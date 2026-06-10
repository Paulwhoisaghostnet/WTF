# Legacy Marketplace Pause Run

- Status: DRY_RUN
- Timestamp: 2026-06-08T05:52:18.141Z
- Contract: KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj
- TzKT: https://api.tzkt.io
- RPC: https://mainnet.api.tez.ie

## Storage

```json
{
  "admin": "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt",
  "offers": 804193,
  "paused": false,
  "auctions": 804190,
  "listings": 804192,
  "wtf_token_id": "0",
  "auction_tokens": 804189,
  "listing_tokens": 804191,
  "next_auction_id": "0",
  "next_listing_id": "3",
  "wtf_token_address": "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD"
}
```

## Hidden Multi-Edition Offers

- Active offers with token_amount > 1 found by TzKT: 1
```json
[
  {
    "id": 69547665,
    "active": true,
    "hash": "expruSCg2amV8fNvgmHHGQHvd25hTSbTyRf9SrNkrDFbAkYdVDyzQG",
    "key": {
      "token_id": "2",
      "token_contract": "KT1HErfW6XogrdKHrHFhXn3HWC1nFhiYivch"
    },
    "value": {
      "offerer": "tz2K1rDmszPuzVQYUcyDFxeSm7ZEJdDvhXx4",
      "amount_wtf": "110000000",
      "target_owner": "tz1ae2d1BJt7YUqaaec6Xenh3mBqS7VjSZtK",
      "token_amount": "9990000"
    },
    "firstLevel": 12962626,
    "lastLevel": 12962676,
    "updates": 2
  }
]
```

## Action

No transaction sent. Re-run with `--execute` and the admin secret key to call `toggle_pause` once.
