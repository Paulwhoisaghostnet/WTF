# coLILseum duel and tournament escrow

The contract implements paid two-human duels and eight-seat tournaments with two
through eight paying humans. Unfilled tournament seats are AI. The deployed
address, compiled hash and applied operations are recorded per network under
`proof/`; the Mainnet deployment record is separate from Shadownet.

## Contract boundary

The creator freezes distinct paying wallet addresses, room terms, rules and seed
commitments, currency, entry amount and referee before funding. The server owns
human/account admission and authoritative game results. The contract checks all
competition ranks and computes payouts; callers cannot supply arbitrary awards.
A room uses native XTZ or the deployment's immutable WTF FA2 contract/token ID,
with no conversion. Every participant claim and refund goes to that sender only.
The treasury recipient is immutable at origination; Mainnet must use the verified
wtf.tez resolution. Synthetic Shadownet rehearsals explicitly use a test treasury.

The approved entry and prize step is 0.01 units in either currency: 10,000 mutez
for XTZ and 1,000,000 base units for WTF (eight decimals). Entry must be a positive
multiple. Start requires every paying human's applied deposit. A duel has exactly
two paying humans and awards its full pot to the winner. A tournament has eight
battlefield places and two through eight paying humans; it applies 50/35/15 to
those places. AI in a prize place receive no wallet claim: their share belongs
to the fixed treasury. Tied commanders combine the percentages of occupied
places and divide equally across the full tie group, including AI. Each human
share is rounded down to the currency step; the rest belongs to the treasury.
For example, a 0.08 XTZ pot with unique places awards 0.04/0.02/0.01 XTZ and
0.01 XTZ to treasury. A second/third tie instead awards 0.02 XTZ to each, leaving
no remainder. A below-step share can be zero. No extra atom breaks a tie.

## Compiled interface

`artifacts/interface.json` contains the exact Michelson types. Bytes are lowercase
hex without `0x`; all commitment and identity hashes are 32 bytes. Naturals are
decimal strings. Currency codes are XTZ=0 and WTF=1. Status is funding=0,
active=1, settled=2, technically voided=3.

| Entrypoint | Caller and effect |
| --- | --- |
| `create_room({room_id,terms_hash,rules_hash,seed_commitment,referee,currency,entry_amount,payout_mode,entrants})` | Immutable creator; freezes the paying wallets, duel (`0`) or tournament (`1`) mode and entry quantum. |
| `join_room({room_id,expected_terms_hash})` | Listed unpaid entrant; exact XTZ entry or exact FA2 pull with zero tez. |
| `refund(room_id)` | Funded participant before start or after technical void; removes its funded flag and returns its entire entry. Re-entry is possible only before start. |
| `start_room({room_id,expected_terms_hash,match_id})` | Pinned referee, all paying wallets funded; records match and ends withdrawals. |
| `void_room({room_id,reason_hash,evidence_hash})` | Pinned referee in funding or active state only; records auditable technical failure and enables full refunds. |
| `finalize_room({room_id,match_id,transcript_hash,result_hash,ranks})` | Pinned referee, active state, one `{player,rank,group_size}` record per paying human. Rank and tie size include AI places in tournaments; the contract computes human and treasury liabilities. |
| `claim(room_id)` | The winning wallet itself; single-use transfer to that wallet. |
| `claim_treasury(room_id)` | Anyone may trigger the single-use remainder transfer, but its recipient is always the fixed treasury. The server can automate it. |

The default entrypoint rejects transfers. No admin sweep, claim expiry, new
match timeout or arbitrary cancellation authority exists. Treasury claims are
separate so a failed treasury transfer cannot block player payouts. All failed
native/FA2 transfers roll back the corresponding bookkeeping atomically.

The server derives all eight finish places by elimination round, final raw HP,
final gold, then final fielded-team max HP; remaining ties share occupied prizes.
These off-chain ranking facts are bound by the pinned referee and result hashes,
not recomputed by Michelson. The contract checks that submitted human rank spans
are valid and nonoverlapping. Missing rank spans represent AI finish places.

## Storage and conservation

Deployment fields: creator, WTF contract/token ID, treasury address, XTZ and WTF
quanta. Each room records its immutable commitments, referee, entry, quantum,
roster, paid set, held balance, cumulative deposits, refunds and payouts,
treasury liability/claim status, and optional match/result/technical-void hashes.
Player claims are in a separate `(room_id,wallet)` big map.

At every state: `deposited = held + refunded + paid_out`; `paid_out` includes
player and treasury transfers. Withdrawal removes the paid flag, so start cannot
race past a missing deposit; a re-entry adds a new cumulative deposit. Void
cannot follow settlement, and neither start nor settlement can follow void.
Each room keeps its own reserve; transfers never spend another room's liability.

## Local proof and read-only preflight

```sh
bash scripts/test-wtfiap-escrow-contract.sh
npx tsx --test contracts/wtfiap-escrow/shadownet-proof.test.ts contracts/wtfiap-escrow/preflight-origination.test.ts
npx tsx contracts/wtfiap-escrow/preflight-origination.ts <public-config.json> <new-report-directory>
```

The SmartPy version is pinned in `requirements.txt`. The independent Fraction
oracle exhausts all 64 tie partitions, both approved quanta, all 420 rounding
residue classes (LCM of denominator5 and possible tied sizes1..7), and an entry
above JavaScript's safe-integer range. Scenarios exercise XTZ/standard FA2,
withdraw/rejoin/start ordering, technical voids, exact refunds, tie payouts,
treasury remainder, permissions/replays and failed-recipient isolation.

Preflight uses supplied public creator/token/treasury settings, empty liabilities
and fixed approved quanta. It typechecks code and typed storage on the chosen
chain and estimates origination. It has no signing or injection path. Fixture
storage files must never be deployed unchanged. Mainnet remains preparation only
until the exact payer is funded and an applied origination is verified. The
`originate-mainnet.ts` wrapper pins the approved Mainnet artifact, creator,
real WTF token, treasury and configured Mainnet RPC. It defaults to read-only;
`--execute` requires an explicitly selected Mainnet keyring wallet ID in the
public config. The Shadownet wrapper refuses a Mainnet config.

## Coordinated Shadownet lifecycle

Fill `shadownet-config.template.json` with the confirmed synthetic deployment,
unique rehearsal ID and commitments. Its eight public e2e wallet identities are
reserved for a sequential run; it contains no keys. Root origination and this
harness must not send from the same wallets concurrently. `originate-shadownet.ts`
accepts the public origination config, writes a read-only preflight by default,
and originates only with `--execute`. Its source is the verified local signer;
the immutable creator may be a separately configured host referee. Both code
and constructor values are checked again in the finalized origination receipt.

```sh
npx tsx contracts/wtfiap-escrow/shadownet-proof.ts <public-config.json> <new-proof-directory>
# After deployment and wallet handoff are explicitly coordinated:
npx tsx contracts/wtfiap-escrow/shadownet-proof.ts <public-config.json> <same-proof-directory> --execute
```

Read-only mode verifies exact code, chain, immutable token/treasury/quanta and
public balances. Execution runs XTZ unique payout, WTF third/fourth tie payout,
and a withdraw/rejoin/start/technical-void/full-refund case in each currency.
Dummy minting supplies exactly the two required WTF entries per entrant and
only accepts the exact standards-based test token controlled by the test creator.

Public intents are fsynced before sending; returned operation hashes are fsynced
before confirmation. Empty e2e wallets receive only the protocol's one-mutez
activation minimum, then their known native entry and unsigned reveal fee plus
one remaining atomic unit needed for simulation. A finalized equivalent call may supply the initial measured funding target;
each recipient still receives its own simulation before signing. Further top-ups
use only an RPC-reported shortfall or the complete measured operation estimate. These
transfers have their own prepared/hash/applied records and amount-authority
evidence; there is no flat wallet budget or discretionary funding buffer.
An unknown prepared send never automatically resubmits.
Existing hashes are reconciled from recorded start level; applied steps are
skipped. Proof verifies exact manager parameters and internal applied results,
actual FA2 recipient/treasury balances, native payout/refund destinations and
amounts, and per-room reserves. Final reads use `head~2` because
[Octez Tenderbake finality](https://octez.tezos.com/docs/alpha/consensus.html)
requires two successor blocks, not because of an invented retry timer.

These are synthetic contract cases. Browser-played multiplayer, durable server
settlement and a Mainnet preparation package require their separate evidence.

## Hosted rehearsal funding handoff

`execute-shadownet-plan.ts` reads an explicit public plan of approved recipients,
measured target balances, and exact dummy-token mint amounts. It uses the same
existing local keyring and proof-kit signer, verifies the Shadownet chain and
exact fixture-token code/admin, and submits only with `--execute`. Its own durable
journal binds the plan hash and records prepared, injected and applied outcomes.
Previously funded targets and completed mint operations are not repeated.
Funding amounts carry their public cost or entry-rule authority. The hosted
referee's operating reserve must come from a measured full control-operation
cycle and actual recipient allocation state, without a discretionary buffer.

`verify-shadownet-indexer.ts` independently matches the completed deployment and
lifecycle journals against the configured Shadownet TzKT API. It checks the exact
inclusion block, status, source and destination of each operation, then records
compact public receipts and response hashes. Mainnet is not an execution target
of either helper.
