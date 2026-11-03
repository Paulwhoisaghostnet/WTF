# Horf social routes and HORSE configuration

Horf distinguishes three on-chain activities. Eligible horse-art transfers
between wallets count in the seasonal race and can create social return rides.
Confirmed Horf Stable claims count in the race but their contract rules settle
the exchange. A sender-declared **gift** counts in the race but does not create
a return ride. The fungible HORSE reward token is neither a horse artwork nor a
trade: its transfers are excluded from the race and gift eligibility.

## HORSE token discovery

`GET /api/horf/horse/config?address=<tz-wallet>` returns:

```json
{
  "status": "ready",
  "network": "mainnet",
  "chainId": "NetXdQprcVkpaWU",
  "token": { "contract": "KT1…", "tokenId": "0", "decimals": 8, "symbol": "HORSE" },
  "balanceRaw": "240000000",
  "asOf": "2026-11-03T18:00:00Z"
}
```

The verified Mainnet origination
`KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM` is the built-in contract address;
`HORF_HORSE_CONTRACT_ADDRESS` may override it explicitly. An explicitly empty
value returns `status: "unconfigured"`, `token: null`, and `balanceRaw: null`.
For any configured address,
the server checks the TzKT Mainnet chain ID, exact immutable $WTF code hash
`1454653741`, `wtf.tez` originator address, FA2 token ID `0`, `HORSE` symbol,
and eight decimals before handing the KT1 to the browser. A mismatch returns
503 and disables sends. No private key is sent to the browser. Wallet sends
are signed by the user.

The current season beginning 1 November 2026 accrues **10 HORSE per qualifying
outbound horse-art edition** to its sender. Receiving a horse does not earn
HORSE; sending a qualifying horse back creates a separate sender award. A
Stable claim awards the listing owner when their escrowed horse is claimed;
placing it in escrow alone does not. Each direct season event and each Stable
claim has a distinct event/sender entitlement key, so a rescan cannot create
another award for the same send. Self sends, marketplace
sends, and HORSE currency sends do not enter the canonical horse-art ledger.
Archived seasons remain historical counts and do not create retroactive HORSE
entitlements. A source rescan can void an unpaid entitlement; a previously
claimed entitlement requires review if its source later changes.

`GET /api/horf/horse/rewards?address=<tz-wallet>` reports the current-season
rate (`rateHorse: "10"`, `rateRaw: "1000000000"`), counted edition units,
accrued/claimable/claimed raw amounts, source freshness, and claim readiness.
The self-claim vault is the separate verified Mainnet contract
`KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT` (TzKT code hash `490344894`).
Until its address, oracle signer, and HORSE float are configured in the server,
`vaultAddress` is null and `claimReady` is false. Horf
does not sign or send rewards from the `wtf.tez` wallet. The wallet holder will
submit the claim transaction and pay its Tezos fee after a claim permit is
available. Users can also send HORSE to a trader or community helper.

`POST /api/horf/horse/claim-permit` requires a valid CSRF token and proof of
the exact claimant wallet. It signs the completed current-season cumulative
earned raw amount only after checking the vault's Mainnet chain, exact code
hash, wtf.tez creator/admin, HORSE token ID 0, oracle public key/epoch, and
vault HORSE balance. The response contains `contractAddress`, `chainId`,
`totalRaw`, `claimedRaw`, `claimableRaw`, `oracleEpoch`, and `signature`.
The wallet submits `claim({total_raw: totalRaw, signature})` with zero tez
attached; its own XTZ balance pays the Tezos operation fee. The vault's
`claimed_raw` big map is the source of truth for what was already claimed.
`GET /api/horf/horse/activity?address=<tz-wallet>` reports cumulative
`receivedRaw`, `sentRaw`, and `awardedRaw` (receipts sent by `wtf.tez`) as
decimal strings, with the same verified token configuration. Cumulative
receipts remain visible even after a user sends HORSE onward.
Self-transfers are excluded from received, sent, and award totals. Public
activity scans share a result keyed to the current Mainnet head timestamp so
repeated viewers do not refetch all historical transfers within one block.

## Wallet proof and public reads

Visitors can open `/horf` directly without signing in to WTF OS. Public
`GET /api/horf/season`, `/api/horf/stables`, `/api/horf/horse/config`,
`/api/horf/horse/activity`, `/api/horf/token-eligibility`,
`/api/horf/trader-status`, and `/api/horf/wallet/tokens` read Mainnet data.
`POST /api/horf/wallet/challenge` creates an origin-bound one-time Mainnet
challenge; `POST /api/horf/wallet/verify` proves the public key and signature
and sets an HttpOnly Horf wallet session. Both require the normal session CSRF
token. `GET /api/horf/wallet/session?address=` reports exact wallet scope and
`POST /api/horf/wallet/disconnect` clears the guest scope. Signed-in users can
also use their already linked WTF OS wallets. New WTF wallet links continue
through the existing `/api/wallets` flow.

## Posse contacts

Posse contacts belong to the exact proven Tezos wallet, so a guest and a
signed-in holder of the same linked wallet see the same contacts.
`GET /api/horf/posse?address=<owner>` returns
`{ "partners": [{ "id", "address", "nickname", "createdAt" }] }`.
`POST /api/horf/posse` accepts `{ "ownerAddress", "address", "nickname"? }` and creates or
renames a partner. `DELETE /api/horf/posse/:id` removes only a partner owned
by the proven wallet. This list helps the browser choose recipients; it does
not authorize transfers or grant access to their wallets.

## Gifts and return notes

`GET /api/horf/token-eligibility?contract=<KT1>&tokenId=<nat>` validates an
art token against the same fresh Objkt name, description, and tag policy used
for Stables permits. It is available even when no Stable is deployed. Gift
senders use the normal Tezos wallet FA2 transfer flow, then submit
`POST /api/horf/gifts/confirm`:

```json
{
  "address": "tz1Sender…",
  "opHash": "o…",
  "gifts": [
    { "recipient": "tz1Receiver…", "tokenContract": "KT1…", "tokenId": "7", "amount": "1" }
  ]
}
```

The sender's address must be proven in the Horf session or already linked to
the signed-in account. The server
requires a Mainnet TzKT head, an applied transaction under that hash from the
sender, and a distinct indexed FA2 transfer with the exact recipient,
contract, token ID, and amount for each declared gift. It rechecks Objkt
eligibility before saving. If the operation is not indexed yet, the response
is `202 { "status": "pending", "opHash": "o…" }`; the client keeps the
hash so the sender can retry confirmation without resending tokens. Repeated
confirmation is idempotent by TzKT transfer ID.

Objkt exposes `ophash` on direct transfer events. Horf persists it and matches
verified gift transfers to those season events. The source-policy version
also includes the configured HORSE KT1, so setting that contract triggers a
rescan and keeps HORSE reward transfers out of horse-art counts.

The direct Trade send branch submits the same Mainnet TzKT operation proof to
`POST /api/horf/trades/confirm` with a `trades` array instead of `gifts`.
Confirmed rows share the unique transfer-ID ledger but carry `kind: "trade"`.
They set Open Range's `tradedThroughHorf` badge without entering gift
settlement, so an ordinary direct send still creates the social return ride.
Both confirmation paths may return `202 {status:"pending",opHash}` while
TzKT indexes the transfer; retrying that hash never resends the token.

`GET /api/horf/gifts?address=<recipient>` returns the proven receiving
wallet's gifts as `{ "gifts": [...] }`, each with `id`, `from`, `to`, `token`,
`amount`, `timestamp`, `opHash`, `returnedFavor`, and `returnedAt`.
`POST /api/horf/gifts/:id/returned` accepts
`{ "returnedFavor": true | false }`. Only that proven receiving wallet may
change the note. This is a self-reported social
marker; it does not send a token or change the on-chain transfer.

## Community moderation

WTF OS admins can add a Horf wallet restriction with a required reason and
optional http(s) evidence, or clear it, through
`/api/horf/admin/blacklist`. Public
`GET /api/horf/trader-status?address=` returns
`{address,blacklisted,reason,evidenceUrl,listedAt}`. The race retains past
counts and annotates restricted wallets; private Horf actions return 403
`HORF_BLACKLISTED` for an active restriction. The database restriction cannot
reverse Tezos transfers or on-chain Stable credits. Once a Stable is
originated, admins must separately send its `set_blacklisted` operation to
block direct deposit and claim calls.
