# Horf Open Range mint source

Open Range shows qualifying horse tokens minted during a selected Horf season,
across the union of known seasons, or in All Horse Search regardless of mint
date. Its read source is [Objkt's Tezos Mainnet GraphQL API](https://docs.objkt.com/product/objkt-protocol/api),
using `token.pk` as an ascending cursor. The source query filters name,
description, and token tags by Horf's candidate horse expression, then the
server reapplies the exact `tokenQualifies` and Objkt tag-group count rules.
Explicit tags such as `horse`, `horf`, and `haha` qualify even when their group
has five or fewer tokens; other horse-family tags need more than five. HORSE
reward currency and fractional FA2 tokens are excluded from art listings.

Each `GET /api/horf/open-range?season=<key>&cursor=<pk>` response advances
one measured metadata-safe Objkt source page. `season` accepts a known Horf
season key, `all-seasons`, or `all-horse-search`; omitting it selects the
current season. The initial cursor is `0`. An empty filtered `items` page may
still have `hasMore:true` and a `nextCursor`; the browser must keep paging.
There is no total scan cap. `mintedAt:null` is included only for All Horse
Search because Objkt has indexed tokens with no mint timestamp, which cannot
be placed reliably in a season. The season views are complete only relative
to Objkt's indexed, non-null mint timestamp data.

The three status badges are independent:

- `tradedThroughHorf` means Horf confirmed a gift or direct Trade FA2 transfer
  by applied Mainnet TzKT operation, or indexed a Stable claim. Generic horse
  transfers in the season race do not set this badge.
- `activelyForTradeOnHorf` means a proven owner posted an active non-escrow
  Open Range offer. Ownership is checked when posting; the offer is an intent
  signal, so traders should still check current holdings before arranging a
  direct swap.
- `approvedForMarshalsMarket` means a current global HORF MARSHAL approval
  exists for the exact contract/token. It enables that art token for new
  Stable deposit permits, subject to a fresh Mainnet identity and code check.

`POST /api/horf/open-range/offers` requires a Horf-proven wallet, live
positive Mainnet balance covering the posted amount, and horse-art
eligibility. `DELETE /api/horf/open-range/offers/:id` lets that owner remove
the non-escrow offer. Direct sends and gifts in the Outlaw Corral remain
available without marshal approval and still count under the Horf season
rules. The Marshal's Market applies inspection to all three escrow Stables.

Horf's TzKT reads use an explicit Mainnet index (`HORF_MAINNET_TZKT_URL`
override or `https://api.tzkt.io/v1`), separate from WTF OS's generic
Shadownet development index. Contract scripts use the explicit
`HORF_MAINNET_RPC_URL` override or the configured Mainnet RPC, then the
project's Mainnet primary/fallback. Chain IDs are checked before trust
decisions.
