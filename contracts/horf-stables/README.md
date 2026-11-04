# Horf Stables contract

`HorfStables.py` is a Tezos L1 SmartPy contract for the three Horf pools. Its
asset transfers use FA2 `transfer`; the depositing wallet must approve this
contract as an operator for each token ID before calling `deposit`.

| Mode | Deposit result | Claim rule | Cancel rule |
| --- | --- | --- | --- |
| `0` reciprocal | One claim credit per deposited edition | Spend one credit to claim one edition from another owner's listing | Return unclaimed editions only while the owner has at least one unspent reciprocal credit per returned edition |
| `1` honor | No credits | Anyone except the donor may claim one edition without depositing | Donor may recover unclaimed editions |
| `2` group | Thirty claim credits once per depositor and `(FA2 contract, token ID)`, regardless of deposited edition count or split deposits | Spend one credit to claim one edition from another owner's listing; each wallet may claim a given `(FA2 contract, token ID)` only once across this contract | Partial returns keep the grant; returning every edition before any outside claim burns thirty unspent credits and clears the contribution for later resubmission |

All three modes accept a positive number of editions per deposit. Listings
record `submitted` and `remaining` units. A claim transfers exactly one unit to
the caller and cannot target the caller's own listing. Group's per-token claim
marker is permanent for this contract, including across different listings and
trading seasons. Credits are separate between reciprocal and group modes.
For group deposits, the contract records each depositor's token identity,
current unclaimed editions across listings, and whether anyone has claimed an
edition. Extra editions of the same token identity add no credits. Once another
trader has claimed an edition, that depositor's thirty-credit grant remains
one-time even if they later add more editions.

## Eligibility permits

Objkt token names, descriptions, tags, and tag-group sizes are off-chain data.
The contract cannot query Objkt. Horf's server checks the token against the
horse-trading policy and an active horse-inspector approval for its FA2
contract and token ID, then signs a one-use deposit permit with the configured
eligibility key. This inspection gate applies to all three modes. The contract
stores `oracle_key`, `oracle_epoch`, and used
32-byte nonces. The admin may rotate the public key or bump the epoch to
invalidate outstanding permits; the admin has no token-withdrawal entrypoint.

`deposit` takes `{ mode, token_contract, token_id, amount, nonce, signature }`.
The oracle signs **raw Tezos PACK bytes, without a manager-operation
watermark**, of this right-nested Michelson type:

```michelson
pair chain_id
  (pair address
    (pair address
      (pair nat
        (pair address
          (pair nat
            (pair nat
              (pair bytes nat)))))))
```

Values, in order: `sp.chain_id`, `sp.self_address`, `sp.sender`, stable mode,
FA2 contract, token ID, edition amount, nonce, and current oracle epoch. The
signature binds the recipient/depositor, token, quantity, stable, chain, and
contract address. No expiry is imposed: a permit records eligibility at issue
time and can be used once until its epoch is invalidated. The concrete
SmartPy/Taquito cross-language example is in `permit-vector.json` and checked
by `test_stables.py`.

The admin can mark a wallet as blacklisted on-chain. A blacklisted wallet
cannot deposit or claim, including from an existing listing. It may still
cancel its own unclaimed editions, subject to the ordinary unused-credit rule.
Horf's public moderation record is separate: an admin must sign the
`set_blacklisted` transaction before the contract enforces that record.

If a token's Objkt metadata later changes, previously issued unused permits
remain valid until an oracle epoch bump. This is the trust boundary of the
off-chain qualification and inspection rules. Revoking an inspection approval
stops new permits; to invalidate already signed permits, the admin must bump
`oracle_epoch` on-chain. Only the Horf server should hold the oracle
secret; browsers receive a signature, never that secret.

## Entry points, storage, and events

| Entry point | Parameter | Effect |
| --- | --- | --- |
| `deposit` | `{mode, token_contract, token_id, amount, nonce, signature}` | Validate one-use permit, create listing, credit trader, move FA2 units into escrow atomically |
| `claim` | `listing_id: nat` | Transfer one unit to caller under the selected mode's rule |
| `cancel` | `{listing_id, amount}` | Return unclaimed units to owner and burn required unused credits |
| `set_oracle_key` | `key` | Admin-only key rotation, increments epoch |
| `bump_oracle_epoch` | `unit` | Admin-only revocation of outstanding permits |
| `set_blacklisted` | `{wallet, blocked}` | Admin-only restriction of deposits and claims for a wallet; `blocked: false` clears it |

`default` rejects tez; every other entry point also rejects attached tez.
Views: `get_listing(nat)`, `get_credits(address)`,
`has_claimed_group({claimant, token_contract, token_id})`, and
`is_blacklisted(address)`. Indexed storage fields
are `listings`, `reciprocal_credits`, `group_credits`, `group_claimed`,
`group_contributions`, `blacklisted`,
`next_listing_id`, `oracle_key`, `oracle_epoch`, and `used_permits`. Events are
`horse_deposited`, `horse_claimed`, and `horse_cancelled`, each with explicit
field annotations in the compiled Michelson. A claim event represents one
edition; the deposit and cancel events include `amount`.

FA2 contracts do not notify this contract about a direct transfer. Tokens sent
straight to its KT1 outside `deposit` are not listings and cannot be claimed or
cancelled through Horf. The wallet flow should batch an FA2 operator grant,
`deposit`, and operator removal in one Tezos operation group when the FA2
supports standard operator updates.

## Build and mainnet origination preparation

Use `smartpy-tezos==0.24.1` from `requirements.txt`. Run:

```sh
node contracts/horf-stables/build.mjs
```

This runs seven Tallinn SmartPy scenario suites, checks the repo's
[signed-origination size policy](../../scripts/pasta-protocol/check-smartpy-origination-size.mjs),
and regenerates `artifacts/contract.json`, `contract.tz`,
`storage.fixture.json`, and `build-manifest.json`. The local checker currently
reports 6,383 signed-origination bytes using its configured codec. A current
mainnet RPC simulation remains necessary before live origination. The fixture
storage contains public test-account identifiers and is **not** deployable
configuration.

Set `TEZOS_NETWORK=mainnet`, `HORF_STABLES_ADMIN_ADDRESS`,
`HORF_STABLES_ORACLE_SECRET_KEY`, and an independently checked
`HORF_STABLES_ORACLE_PUBLIC_KEY`, then run:

```sh
node contracts/horf-stables/prepare-origination.mjs > horf-origination-plan.json
```

This read-only command derives the oracle public key from the server signer
secret, requires it to match the independently provided public key, checks the
compiled artifact hashes, replaces the template storage admin/key fields,
and verifies the RPC's chain ID is mainnet `NetXdQprcVkpaWU`. It uses the
project's Tezos mainnet RPC primary `https://tezos-mainnet.octez.io/` and
fallback `https://tcinfra.net/rpc/tezos/mainnet` unless `TEZOS_RPC_URL` is
explicitly set. It prints no secret and signs or injects no operation.

For the wtf.tez wallet handoff, save that public JSON output as
`plan/origination.json`, then open `originate.html` from the local Vite server.
The page verifies the compiled code and empty storage fixture against the
build manifest, confirms the intended admin and oracle public key, checks
Tezos Mainnet, and asks Kukai to sign the origination. The secret oracle key
stays outside the repository and browser. Kukai displays the current fee and
storage burn before signature.

Originating requires an authorized Tezos signer and a current-chain simulation.
The **per-token V2** Stables contract was originated on Mainnet at
[`KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg`](https://tzkt.io/KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg)
in applied operation
[`ooxwCr7EMzuBer3wvBdpD6LoQjuRJeM9vSsCsfdibm7BwhmDCiV`](https://tzkt.io/ooxwCr7EMzuBer3wvBdpD6LoQjuRJeM9vSsCsfdibm7BwhmDCiV)
at 2026-11-04 19:00:37 UTC. The current source and artifacts implement this
per-token rule. Production commit `3cc5fc65` switched Horf to V2: the public
Stable API reports Tezos Mainnet `NetXdQprcVkpaWU`, this KT1, `status: ready`,
`permitReady: true`, `custodyReady: true`, and admin `wtf.tez`. Mainnet RPC
`/script` verification matched the deployed parameter, storage, code, and all
four view sections to the compiled artifact. A live browser displays the
thirty-claims-per-distinct-token rule and the V2 KT1.

The earlier **per-edition V1** Stables contract was originated on Mainnet by `wtf.tez` at
[`KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m`](https://tzkt.io/KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m)
in applied operation
[`opQFVP9LJUfR8tTn3ziBuJtPtNtYap3es4Ay1puSNJZH5FV4hk3`](https://tzkt.io/opQFVP9LJUfR8tTn3ziBuJtPtNtYap3es4Ay1puSNJZH5FV4hk3).
At its original deployment, Mainnet RPC verification matched every deployed
script section to that version's built artifact, including all four views. The
current source and artifacts implement the **per-token** replacement and do
not match that earlier immutable KT1. On 2026-11-04, TzKT reported
`next_listing_id = 0` and no active listings or reciprocal/group credit keys
on the earlier KT1, so there is no existing escrow balance or claim credit to
migrate. TzKT storage confirmed the earlier contract's admin
`tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`, oracle public key
`edpkvZL5ek6Njb9RWQVtnUMkV2HJQtNFsycFdrgDjTnshrsXmzEzVy`, epoch `0`,
and no listings at the original launch check. After the V2 application switch,
`wtf.tez` called V1 `bump_oracle_epoch` in applied operation
[`ongncdmJDQntVdoJch8eiPr3QeJKbYhz5echgH9xnX2EgZ8om5u`](https://tzkt.io/ongncdmJDQntVdoJch8eiPr3QeJKbYhz5echgH9xnX2EgZ8om5u)
at 2026-11-04 19:11:55 UTC. TzKT storage shows the V1 oracle epoch advanced
from `0` to `1`, invalidating its previously issued unused deposit permits.
The client reads the verified KT1 from the Stable API and has no separate
contract-address configuration.

For network staging, keep Tezos Shadownet separate from mainnet. The project
RPC defaults are `https://tezos-shadownet.octez.io/` and
`https://tcinfra.net/rpc/tezos/shadownet`; the mainnet preparation command
intentionally rejects Shadownet configuration. A Shadownet deployment must
use its actual chain ID in permits and its own KT1 and signer configuration.
