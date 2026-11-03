# HORSE reward claim vault

This Tezos L1 contract lets a Horf trader claim earned HORSE while paying the
Tezos transaction fee. Horf's server computes qualifying trade participation,
then signs the trader's **cumulative** raw HORSE entitlement. The vault holds
HORSE FA2 token `0` and transfers only the difference between that cumulative
amount and its stored `claimed_raw` for the caller. A later signed total can
be claimed again; a replay of the same total cannot pay twice.

The Mainnet claim vault is
[`KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT`](https://tzkt.io/KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT),
originated by wtf.tez in
[`opNZV1q37q7W5dK8u6vaQryK4iGamvNYnzxKnxszrdtqPvUKtoL`](https://tzkt.io/opNZV1q37q7W5dK8u6vaQryK4iGamvNYnzxKnxszrdtqPvUKtoL).
Its TzKT code hash is `490344894`; the deployed Micheline sections and storage
were checked against the compiled build. The Mainnet HORSE token is
[`KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM`](https://tzkt.io/KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM).
The vault's token contract and token ID are fixed at origination. wtf.tez is
the admin. The admin may rotate the claim oracle or bump its epoch to invalidate
old signatures; it has no privileged HORSE withdrawal entrypoint. Unclaimed
funds remain in the vault unless a claimant earns and claims them, so fund it
deliberately rather than treating it as a general wallet.

## Claim permit

The `claim` entrypoint accepts `{ total_raw: nat, signature: signature }`. It
checks the caller, Mainnet chain ID, vault address, cumulative raw amount, and
current oracle epoch with `CHECK_SIGNATURE(PACK(payload))`. The raw Tezos PACK
payload has the right-nested Michelson type:

```michelson
pair chain_id (pair address (pair address (pair nat nat)))
```

The values are `(sp.chain_id, (sp.self_address, (sp.sender,
(total_raw, oracle_epoch))))`. Sign exactly these bytes without a manager
operation watermark. The SmartPy/JavaScript parity fixture is
[`permit-vector.json`](permit-vector.json). The server must query the on-chain
`claimed_raw` value and current oracle epoch before issuing a permit.

A successful claim emits on-chain `horse_reward_claimed` with `claimant`,
`amount_raw` (newly paid units), and `total_raw` (new cumulative amount). A
failed HORSE transfer reverts the entire transaction, including `claimed_raw`.
The `get_claimed_raw(address)` on-chain view returns zero for an unclaimed
wallet.

The contract cannot inspect Objkt or the community trade ledger. The oracle
must sign only reconciled, eligible entitlements. An oracle compromise could
authorize claims against the vault's funded balance; rotate the oracle with
wtf.tez if that key is compromised.

## Build and Mainnet preparation

Run `node contracts/horse-claims/build.mjs`. It requires
`smartpy-tezos==0.24.1` from `requirements.txt`, runs the Tallinn claim
scenarios, checks signed origination size, and writes the compiled Michelson,
fixture storage, and hashes to `artifacts/`. The current compiled JSON SHA-256
is `38084d10617c1a70dc474ebe9a2069380d44ed1f66db02c97c5b3bf5d8fd50bb`.
The build uses a public test admin/key in the fixture; do not originate that
fixture directly.

Store a dedicated oracle secret outside the repository. With the matching
public key independently checked, prepare a read-only plan:

```sh
TEZOS_NETWORK=mainnet \
HORF_HORSE_CLAIM_ADMIN_ADDRESS=tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt \
HORF_HORSE_CLAIM_ORACLE_SECRET_KEY=... \
HORF_HORSE_CLAIM_ORACLE_PUBLIC_KEY=... \
node contracts/horse-claims/prepare-origination.mjs > contracts/horse-claims/plan/origination.json
```

The preparation command verifies `NetXdQprcVkpaWU` against the project's
Mainnet RPC primary (`https://tezos-mainnet.octez.io/`) and approved fallback
(`https://tcinfra.net/rpc/tezos/mainnet`), or an explicit `TEZOS_RPC_URL`. It
prints only public plan data. A plan using the approved fallback is already in
`plan/origination.json` because the primary returned HTTP 503 during handoff.

Serve `originate.html` through the local Vite server, connect wtf.tez in Kukai,
and have the wallet holder review and sign the origination. The page checks
the compiled code hash, storage, admin, fixed HORSE token, oracle public key,
and Mainnet chain ID before opening Kukai. After TzKT confirms the exact code
and storage, configure `HORF_HORSE_CLAIM_CONTRACT_ADDRESS` and
`HORF_HORSE_CLAIM_ORACLE_SECRET_KEY` for the server. Finally, transfer HORSE
token `0` from wtf.tez to the vault as its reward reserve. Users can claim
only while the vault has enough HORSE for their delta.

The separate `fund.html` handoff performs that FA2 transfer. Its
`plan/funding.json` pins the verified vault address above. The page checks
the live vault's exact code, fixed HORSE
token, admin, and oracle through Mainnet RPC, requires an explicit HORSE amount
entered by the owner, and prepares a Kukai request for the owner to sign. It
does not assume a funding amount.

The owner chose an initial reserve of **200,000 HORSE**. Kukai submitted
[`ooVBLDgHC4E3gszbBHqHEtoBiFmKAjJ8sys4xTitnUDUdyVbJqq`](https://tzkt.io/ooVBLDgHC4E3gszbBHqHEtoBiFmKAjJ8sys4xTitnUDUdyVbJqq),
and TzKT confirms an applied transfer of `20000000000000` raw HORSE units
from wtf.tez to the vault at 2026-11-03T18:43:34Z. The indexed vault balance
is 200,000 HORSE after that transfer. This covers 100 traders each sending
200 qualifying horse editions at the sender-only 10 HORSE award rate.
