# coLILseum sponsor prize escrow

The same compiled artifact was originated as a separate contract on both
networks. The old Duel and Tournament contracts and their room routes were not
changed by these originations.

| Network | Contract | Origination operation | Verified code hash |
| --- | --- | --- | --- |
| Tezos Shadownet | `KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ` | `ooqmS6CvntNp1HN6mwtJRKJrE4DogC8sEhHDq8LgJpmDUECrwLx` | `77947dbf0ef86261826f76a1affe4a4e52b80593f07253ad46bbbf527a296aae` |
| Tezos Mainnet | `KT1MmvdGHAaTbRLvSwNuw1W94scbGMtpQs4u` | `onqQ6KexjakZqaT4UEKLC5TaEavi9w1f8srcUmjZMyPsC366bpE` | `77947dbf0ef86261826f76a1affe4a4e52b80593f07253ad46bbbf527a296aae` |

The Shadownet paid XTZ lifecycle (`58bbd8a2…49b4be`) and free-entry sponsor
lifecycle (`41d2d345…11c9a6f`) each reached settlement, paid their claims,
and ended with zero held XTZ. Mainnet origination is not a funded Mainnet
match proof. The host still must enable its network-specific signer allowlists,
environment settings, and game UI before players can use these contracts.

This is a new escrow contract. It leaves the deployed Duel and Tournament
entry-pot contracts untouched. The hosted game must not offer sponsored rooms
until a network-specific instance has been originated, its code identity is
verified, and the room funding service is bound to that instance.

## Room terms and custody

`create_room` registers a manifest without moving assets. The manifest is the
normalized `game/core/sponsored-prizes.cjs` plan: one to three ordered prize
places, XTZ/WTF amounts, arbitrary FA2 lots (`token_address`, `token_id`,
`amount`), fixed/random/pick mode, human minimum, and optional XTZ or WTF
entry fee with an exact pool-share fraction. The game server's room creator
registers each human wallet progressively. The sponsor may deposit prizes
before any entrant arrives.

The sponsor calls `fund_sponsor_xtz` for the exact XTZ prize total plus the
Mainnet house fee when the room has a paid XTZ entry. The sponsor separately
calls `fund_sponsor_wtf` and `fund_sponsor_lot` for each FA2 lot. Each FA2 call
atomically invokes that token's standard `transfer` entrypoint. The sponsor
must first authorize escrow as an operator for each token ID. `join_room`
accepts only a registered human wallet and takes its exact entry amount, or
zero for a free room. A funding quote, wallet signature request, or token
operator approval alone is not custody; only confirmed funding calls count.

The referee may start only after all sponsor assets are funded, every
registered human has joined, and the sponsor's human minimum is met. AI seats
have no registered wallet and cannot receive prizes. Finalization accepts a
tie-resolved human ordering plus one place assignment per FA2 lot. The contract
checks fixed assignments and per-place pick counts. For random and pick
allocation, the trusted game server must validate the replay/seed and submit
the resulting assignment. This matches the server-validated result model of
the existing game; the contract does not independently replay battles or
compute randomness.

Cash awards include sponsor amounts plus any entry-pool portion allocated by
the manifest's place weights. The non-prize entry-fee portion pays 95% to the
designated wallet and 5% to the immutable wtf.tez treasury. Each share is
rounded down to the room currency's 0.01 quantum; the treasury receives the
remainder. A Mainnet XTZ paid-room house fee is configured as 500000 mutez at
origination, held separately from prizes, and paid to the treasury on normal
settlement. Configure the Shadownet instance with zero house fee. Free
sponsor-only prize rooms have no inferred house fee.

Cash and FA2 claims are permissionless to trigger, but the destination is
bound on chain. The server can automate disbursal without asking a winner to
sign. There is no admin sweep. The sponsor can cancel before combat, and the
referee can record an evidence-bound technical void before or during combat;
both make exact sponsor assets, entrants' entries, and the house fee refundable
to their original funders. A rejecting destination rolls back only its own
claim or refund call, not the room's other claims.

## Interface

The authoritative Michelson parameter and storage types are in
`artifacts/interface.json`; the deployed compiled artifact is `artifacts/contract.json`.
Bytes32 values are lowercase hex without `0x` at the Taquito interface.

| Actor | Entrypoints |
| --- | --- |
| Room creator | `create_room`, `register_entrant`, `unregister_entrant` |
| Sponsor | `fund_sponsor_xtz`, `fund_sponsor_wtf`, `fund_sponsor_lot`, `cancel_room` |
| Registered human | `join_room` |
| Referee | `start_room`, `finalize_room`, `void_room` |
| Anyone, to recorded recipient | `claim_cash`, `claim_lot`, `refund_entry`, `refund_sponsor_xtz`, `refund_sponsor_wtf`, `refund_sponsor_lot` |

The on-chain views `get_room`, `get_cash_claim`, and `get_lot_claim` expose
funding flags, held balances, recipients, and claim state. The host must compare
the entire on-chain manifest with the room's immutable terms before showing a
prize as verified or starting play.

## Local gate and network gate

Run:

```sh
python3 contracts/wtfiap-sponsor-escrow/test_arithmetic.py
SMARTPY_PYTHON="$(command -v python3)" bash scripts/smartpy-cli-wrapper.sh test \
  contracts/wtfiap-sponsor-escrow/test_escrow.py /tmp/colilseum-sponsor-test
node contracts/wtfiap-sponsor-escrow/build-artifacts.mjs \
  /tmp/colilseum-sponsor-test/sponsor_free_room
```

The SmartPy test covers free and paid XTZ, exact 95/5 and dust accounting,
mixed XTZ/WTF/FA2 awards, cancellation refunds, and technical-void refunds.
The independent arithmetic test checks both currency quanta and the exact
per-place/fee conservation. The artifact was typechecked with the configured
Tezos Shadownet primary RPC; Taquito local forging measured 22,240 bytes for
the sample origination. The deployment scripts encoded the exact constructor
storage, checked chain ID and fees, and verified the finalized script and
storage after origination. A real Shadownet paid and free XTZ custody-to-claim
lifecycle followed. WTF and arbitrary FA2 token custody still require their
own live network receipts before those assets can be called live-tested.

## Trust boundary

An arbitrary FA2 contract may implement a nonstandard or dishonest `transfer`
entrypoint. This contract relies on FA2's standard operator and transfer
semantics. The host should show the contract address and token ID and should
verify the recipient balance or indexed transfer before reporting custody.
For result settlement, the referee is a trusted server authority whose signed
submission must be backed by the replay record and final human ranking.
