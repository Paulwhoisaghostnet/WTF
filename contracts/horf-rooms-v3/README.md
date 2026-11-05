# HORF Rooms V3

# Mainnet deployment

V3 was originated by wtf.tez on Tezos Mainnet at
`KT1PGhfmETCoE79Pg6BNSZWJfwFHRKscb5gi` in operation
`op6wfKbjk8SzNEyvyyCgECfLZVfgUeSSq2DaocPTXs8ysAcDPJt`. The applied
operation, every Michelson code section, administrator, and oracle public key
were checked against the reviewed plan in `plan/mainnet-deployment.json`.
This does not change the existing V2 Stable contract or migrate its escrow.
The V2 address is
`KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg`; its open listings and credits must
remain reachable until riders resolve them.

| Mode | Deposit | Withdrawal |
| --- | --- | --- |
| `0` Reciprocal | A Marshal-approved horse edition enters shared escrow and gives the depositor one credit. | One credit claims one edition from another owner. Each wallet may claim a given FA2 contract and token ID once, and only when its current balance is zero. |
| `1` Honor | A Marshal-approved horse enters shared escrow. | A different wallet may claim one edition without credit, subject to the same uniqueness and balance checks. |
| `2` Outlaw | A qualifying horse may enter the creator's escrow room without Marshal approval. | A visitor offers one qualifying horse in an automatic swap. The visitor's horse goes directly to the listing owner and one escrowed edition goes to the visitor in the same Tezos operation. |
| `3` Private offer | An owner accepts a particular rider's offer by escrowing exactly one edition of a qualifying horse. The owner pins the rider and the precise horse offered in return. | Only that rider may fulfill with the pinned horse. The offered edition goes to the owner and the escrowed edition goes to the rider atomically. The owner may cancel while unfulfilled. |

Group Stable is absent. A depositor can cancel unclaimed editions. In Reciprocal,
cancellation burns one unspent credit per returned edition; a spent credit keeps
one edition committed to the pool. Outlaw creator listings are not reserved by
someone viewing them; the transaction either takes an available edition or
fails without transferring either asset.

## Entry points

- `deposit({mode, token_contract, token_id, amount, nonce, signature})` accepts
  an oracle eligibility permit, creates a mode 0, 1, or 2 listing, and transfers
  the specified positive edition count into escrow.
- `create_private_offer({token_contract, token_id, offerer,
  input_token_contract, input_token_id, nonce, signature})` creates a mode 3
  listing and escrows exactly one owner edition. The fixed partner and offered
  input horse are stored in `private_terms[listing_id]`.
- `claim({listing_id, completion_nonce})` claims a Reciprocal or Honor edition.
- `swap_outlaw({listing_id, input_token_contract, input_token_id,
  permit_nonce, signature, completion_nonce})` automatically exchanges one
  visitor horse for one Outlaw edition.
- `fulfill_private_offer({listing_id, permit_nonce, signature,
  completion_nonce})` lets only the pinned offerer exchange the pinned input
  horse for the escrowed output. The input horse is read from on-chain
  `private_terms`; the caller cannot substitute a different token.
- `on_balance(list[FA2BalanceResponse])` receives the target FA2 `balance_of`
  callback and completes a claim or swap only when the recipient holds zero
  editions of that output token.
- `assert_completed(completion_nonce: bytes)` **must be batched after** `claim`,
  `swap_outlaw`, or `fulfill_private_offer` in the same signed wallet operation
  group. If the target FA2
  omits the callback, the assertion fails and Tezos rolls the entire group
  back. `abort_pending(unit)` clears a standalone attempt that lacked a callback.
- `cancel({listing_id, amount})`, `set_blacklisted`, `set_oracle_key`, and
  `bump_oracle_epoch` preserve the corresponding V2 administrative controls.
  A private offer may be canceled for its one remaining edition until fulfilled.

`claimed_tokens` is a permanent big map keyed by claimant, FA2 address, and
token ID. Once a wallet claims an edition, it cannot claim that horse again
from any listing or mode in V3. The zero-balance callback checks the wallet's
holdings **at claim time**; no contract can prevent future third-party
transfers into that wallet. The target FA2 must implement standard
`balance_of`; an incompatible token cannot be claimed.

## Oracle permit bytes

The oracle signs raw Tezos PACK bytes, without a manager-operation watermark,
of the right-nested tuple:

```
(chain_id, self_address, caller, action, mode, listing_id,
 token_contract, token_id, amount, nonce, oracle_epoch)
```

Its right-nested Michelson type is:

```
pair chain_id (pair address (pair address (pair nat (pair nat
  (pair nat (pair address (pair nat (pair nat (pair bytes nat)))))))))
```

Action `0` is a listing deposit (`listing_id=0`), including a mode 3 private
escrow with `amount=1`. Action `1` is an Outlaw input horse (`mode=2`,
`amount=1`, `listing_id` bound to the target). Action `2` is the pinned private
input horse (`mode=3`, `amount=1`, `listing_id` bound to the private listing).
For action `2`, the contract itself checks that the caller and input token
match the stored `private_terms`, so the oracle cannot redirect fulfillment.
The
signature is bound to Mainnet chain ID, V3 contract address, caller, action,
token, exact edition count, nonce, and oracle epoch. The service must apply
the Is It a Horse mint-tag rules in both actions; only modes 0 and 1 require
active Marshal approval. HAHA-only tokens still need Marshal approval.

## Trust boundary

The SmartPy test includes an intentionally malicious FA2 whose `transfer`
returns success without moving tokens. If the oracle signs that uninspected
input for an automatic Outlaw swap, the creator's real escrowed horse can be
released without receiving a real horse. Objkt indexing and mint tags do not
prove FA2 transfer semantics. Outlaw must display this risk prominently.
The same trust risk applies to a private offer whose requested input comes from
an uninspected FA2; the owner should see that token and risk before accepting.
Marshal approval reduces this risk in Reciprocal and Honor, but cannot prove
arbitrary FA2 behavior by itself.

## Chain evidence for private offers

`private_offer_escrowed` carries `{listing_id, owner, offerer,
output_contract, output_id, input_contract, input_id}`. `private_offer_fulfilled`
uses `{listing_id, claimant, owner, output_contract, output_id, input_contract,
input_id}`; `claimant` is the offerer. `horse_cancelled` carries
`{listing_id, owner, mode:3, amount:1}` on cancellation. The listing's
`remaining` changes from 1 to 0 on fulfillment or cancellation. A signed
off-chain message alone is not evidence that the escrow or swap completed;
index confirmed Tezos operations and these events for status changes.

## Build

Install `smartpy-tezos==0.24.1`, then run:

```sh
node contracts/horf-rooms-v3/build.mjs
```

The build runs the scenarios, compiles Michelson, applies the repository's
signed-origination size gate, and writes immutable artifacts under
`artifacts/`. The template storage contains test identities and is not a
deployment plan. Mainnet origination still requires fresh config, simulation,
and a wallet signature by the administrator.
