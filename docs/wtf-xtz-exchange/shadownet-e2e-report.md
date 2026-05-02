# Shadownet E2E Report

- Status: BLOCKED
- Timestamp: 2026-05-02T14:45:09.664Z
- RPC: https://rpc.shadownet.teztnets.com
- Expected chain ID: NetXsqzbfFenSTS

## Blocker

Missing required environment variables: DUMMY_WTF_ADDRESS, EXCHANGE_ADDRESS, LISTING_OWNER_SECRET_KEY, TAKER_SECRET_KEY

Required values:

- `DUMMY_WTF_ADDRESS`: Shadownet dummy FA2 KT1 address deployed by Kiln.
- `EXCHANGE_ADDRESS`: Shadownet exchange KT1 address deployed by Kiln.
- `LISTING_OWNER_SECRET_KEY`: funded Shadownet secret key that is dummy token admin/listing owner.
- `TAKER_SECRET_KEY`: funded Shadownet secret key that receives dummy WTF and swaps.
