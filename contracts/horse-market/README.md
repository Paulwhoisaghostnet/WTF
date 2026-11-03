# Horf HORSE Market

This is a Tezos L1 fixed-price market for horse FA2 editions. Buyers pay the
seller in HORSE FA2 token ID 0. The intended Mainnet HORSE contract is
`KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM` (eight decimal places). The contract
has **no platform fee or royalty**: the full quoted HORSE price goes to the
seller. It does not buy Objkt XTZ listings; those use Objkt's own contracts.

The sale and cancellation paths follow the escrow and expected-term patterns
of the repository's `WTFMarketplaceV2.py`, limited to listings. Offers and
auctions are intentionally absent so neither can bypass the inspection gate.

## Inspection and custody

`create_listing` requires a one-use signature from the Horf Stables eligibility
oracle. The service **must issue it only after** the wallet, token identity,
horse eligibility, and active HORF MARSHAL approval have been checked. The
contract verifies the signature and escrows `quantity` editions. The admin can
block a token after inspection revocation with `set_token_blocked`; blocked
assets cannot be listed or bought, but their sellers can cancel. There is a
window between off-chain revocation and the confirmed block operation in which
a direct chain call can still buy. The server should suppress buys immediately
and the admin should submit the block promptly.

Marshal inspection is a human trust decision. It cannot prove that an arbitrary
FA2's `transfer` entrypoint actually changed balances. A malicious FA2 can
pretend to deposit and deliver a horse while accepting the buyer's real HORSE.
The existing Horf Stables bounty `WTF-BB-765` documents this risk. Inspectors
must review transfer semantics as well as token metadata, and the UI must not
claim trustless custody.

## Entrypoints

- `create_listing({token_contract,token_id,quantity,unit_price_horse,nonce,signature})`:
  positive quantity and price in raw HORSE units; seller first grants the
  market FA2 operator permission for this token ID. `nonce` is 32 bytes.
- `buy_listing({listing_id,quantity,expected_seller,expected_token:{token_contract,token_id},expected_unit_price_horse})`:
  buyer first grants the market FA2 operator permission over HORSE token ID 0
  for `quantity * unit_price_horse` raw units. The buyer's expected terms are
  checked against storage. HORSE transfer to seller and horse transfer to buyer
  are emitted in the same Tezos transaction group, so an honest FA2 failure
  reverts both.
- `cancel_listing(listing_id)`: seller or admin returns the remaining editions
  to the seller. This remains available when a wallet or token is blocked.
- `set_token_blocked({token_contract,token_id,blocked})`,
  `set_blacklisted({wallet,blocked})`, `set_oracle_key(key)`, and
  `bump_oracle_epoch()` are admin-only.

The admin is intended to be `wtf.tez`
(`tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`). The oracle public key at
origination should match the existing Stables signer if the service reuses its
secret; the known Stables public key is
`edpkvZL5ek6Njb9RWQVtnUMkV2HJQtNFsycFdrgDjTnshrsXmzEzVy`.
Neither admin nor oracle key is hard-coded in the contract.

## Listing permit

The oracle signs `PACK` of this exact right-nested Michelson pair, without an
operation watermark:

```
(chain_id,
  (market_address,
    (seller,
      (token_contract,
        (token_id,
          (quantity,
            (unit_price_horse,
              (nonce, oracle_epoch))))))))
```

Types are `chain_id, address, address, address, nat, nat, nat, bytes, nat`.
The market contract address and chain ID domain-separate signatures from
Stables and other market originations. `oracle_epoch` starts at zero and is
incremented when the admin rotates or invalidates the signing key. Nonces are
single-use per market contract.

## Events and season rewards

`horse_market_listed` carries listing ID, seller, token contract/ID, quantity,
and unit HORSE price. `horse_market_bought` carries listing ID, seller, buyer,
token contract/ID, quantity, and total HORSE paid. `horse_market_cancelled`
carries the returned listing details. The contract cannot access an operation
hash; the indexer must take it from TzKT, verify successful internal transfers,
and deduplicate by event ID or operation hash plus listing ID. The sale event
identifies one recognized sale, even when quantity is greater than one. The
season ledger should exclude the escrow movements from ordinary send counting
and apply the user's sender-only reward policy once to the seller for a
recognized sale.

## Build and state

Run `node contracts/horse-market/build.mjs` after installing
`requirements.txt`. It tests the contract, compiles Tallinn Michelson, checks
origination size, and writes hashed artifacts under `artifacts/`. The generated
storage fixture has test-account admin and oracle identities and must never be
originated directly. No origination or HORSE funding is performed by the build.

## Mainnet origination handoff

`plan/origination.json` is a non-signing plan pinned to Tezos Mainnet, wtf.tez,
the existing Stables oracle public key, HORSE FA2 token ID 0, and the compiled
source and artifact hashes. Reproduce it with:

```sh
TEZOS_NETWORK=mainnet node contracts/horse-market/prepare-origination.mjs > contracts/horse-market/plan/origination.json
```

If `HORF_STABLES_ORACLE_SECRET_KEY` is supplied, the preparation script also
derives its public key locally and rejects a mismatch without printing the
secret. The script checks the configured Mainnet RPC chain ID. The browser
handoff is `contracts/horse-market/originate.html` on the local Vite server;
its `originate.ts` verifies the reviewed plan, source, Michelson, storage,
Mainnet chain, and connected wtf.tez address before enabling the Kukai
signature request. The page never signs automatically. After confirmation,
verify the originated contract on TzKT before setting
`HORF_HORSE_MARKET_CONTRACT_ADDRESS` or exposing paid listings.
