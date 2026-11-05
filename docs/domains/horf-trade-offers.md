# Horf wallet-held trade offers

An active Open Range availability sign can receive a private proposal for one
currently owned, Horf-qualified horse edition. A proposal records the sign,
both verified wallets, both exact FA2 token identities, and an optional message.
The requested horse stays in the sign owner's wallet until the owner creates a
V3 private escrow. A proposal is a message, not a token transfer.

`GET /api/horf/trade-offers?address=<wallet>&box=incoming|outgoing` returns only
offers for the verified wallet. `POST /api/horf/trade-offers` creates a proposal
with `{offererAddress,signId,offeredTokenContract,offeredTokenId,message?}`.
`POST /api/horf/trade-offers/:id/decline` requires the sign owner's wallet;
`POST /api/horf/trade-offers/:id/cancel` requires the offerer's wallet. All
writes require the Horf CSRF token, and every private read/write requires a
verified, non-blacklisted wallet session. The DB prevents duplicate open
proposals for the same sign, offerer, and offered token.

The owner creates a V3 `create_private_offer` escrow pinned to the exact
offerer and offered horse. `POST /api/horf/trade-offers/:id/accept` can mark it
accepted only after a confirmed Mainnet `private_offer_escrowed` event matches
the offer and listing ID. Fulfillment and owner escrow cancellation likewise
require confirmed `private_offer_fulfilled` and mode-3 `horse_cancelled`
events. The service compares Mainnet chain ID, configured V3 KT1, operation
hash, participant wallets, token identities, and listing ID. Client-supplied
status or event fields never advance an offer. If a local decline or cancellation
races a confirmed escrow, chain custody takes precedence so the locked horse
remains visible for fulfillment or recovery.

`GET /api/horf/rooms/private/:listingId?address=<wallet>` shows the exact
open escrow and pinned input token to the owner or offerer. The accepted
message links to that detail. `GET /api/horf/rooms/private?address=<wallet>`
lists open private escrows for that verified wallet, including an owner
recovery path if a confirmation did not reach the message table. The owner
can return an unfulfilled edition through the V3 `cancel` entrypoint and
confirm `/api/horf/trade-offers/:id/escrow-cancel` when a matching offer is
known. The browser keeps submitted operation hashes across refreshes and
retries chain-proof recording without asking the wallet to send again.

Migration: `drizzle/0156_horf_trade_offer_messages.sql`. The actor-backed local
puppet database includes it. Offer messages do not award HORSE; only verified
horse transfers in the season ledger can do that.
