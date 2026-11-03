# Horf stables: server and chain boundary

Horf's three stables are one Tezos **mainnet** FA2 custody contract. The contract owns deposited editions until a valid claim or cancellation. The browser signs FA2 operator approval and the `deposit`, `claim`, or `cancel` operation. The server never transfers a user's tokens.

| Mode | Deposit credit | Claim rule |
| --- | --- | --- |
| Reciprocal (`0`) | One claim per deposited edition | Claim one edition from another trader's live listing. |
| Honor (`1`) | None required | Anyone except the donor can claim a live edition for free. |
| Group (`2`) | Thirty claims per deposited edition | Claim one edition from another trader's live listing; the contract permits at most one edition of each FA2 contract/token ID per claimant. |

The contract prevents depositors from cancelling editions after spending the reciprocal or group credits that those editions created. Honor donors may cancel unclaimed editions. Claims are on-chain horse receipts for the race and recent log, but they do not create a personal return obligation: the pool rules settle the exchange.

## Eligibility proof

Objkt names, descriptions, tags, and tag-group token counts are off-chain. On each deposit request, the server looks up the exact FA2 contract and token ID at [Objkt's mainnet GraphQL API](https://docs.objkt.com/product/objkt-protocol/api), applies Horf's existing keyword/group rule, and rejects fractional tokens. A qualifying token receives a one-use signature for the specific wallet, stable mode, FA2 token, edition amount, 32-byte nonce, contract address, mainnet chain ID, and oracle epoch. The contract checks the signature and consumes the nonce. A previously issued proof cannot be replayed; proof issuance reflects Objkt metadata at the time of that request.

Michelson cannot query Objkt. A user may hold an unused permit and submit it later even if the token's metadata or tag count has changed since issuance. If an eligibility rule changes or the oracle signer is compromised, the contract administrator must bump `oracle_epoch` (and rotate `oracle_key` when needed), invalidating every unused earlier permit. The server must be updated to the matching private key before it resumes issuance. This trusted eligibility service is the material limit of contract-enforced horse criteria; no private key is committed to this repository.

The POST endpoint requires the exact wallet to have a Horf signature-backed
server session or be linked to the current WTF OS account. A guest needs no
WTF OS login. The contract additionally requires `sp.sender` to equal the
wallet in the proof. The signing key stays server-side. Before signing, the
server checks active marshal approval, exact Mainnet FA2 identity/script,
its own public key against the deployed `oracle_key`, and TzKT Mainnet chain
ID `NetXdQprcVkpaWU`. Missing configuration or upstream data returns 503;
there is no unsigned fallback.

## FA2 escrow trust boundary — human review

The Objkt metadata check proves that a token looks like eligible horse art; it
does not prove that its FA2 code moves balances. A deliberately nonconforming
FA2 can return successfully from `transfer` without reducing the depositor's
balance or crediting the Stable. Tezos runs generated contract operations
after the calling entrypoint, so Horf's deposit cannot read the post-transfer
balance within that entrypoint. A malicious FA2 could also lie through the
standard `balance_of` callback. In the current SmartPy contract, a successful
no-op `transfer` still creates a listing and reciprocal/group claim credits,
which could be spent on genuine horses deposited by others. A SmartPy no-op
FA2 scenario reproduced this credit-forgery path. [Tezos operations](https://docs.tezos.com/smart-contracts/logic/operations)
and [FA2 interface](https://docs.tezos.com/architecture/tokens/FA2) document
the execution and callback semantics.

The Marshal's Market deposit-permit service now requires an active HORF MARSHAL inspection
approval for the exact FA2 contract and token ID in **all three Stables**.
**No token has been approved yet.** The Mainnet Stable was originated at
[`KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m`](https://tzkt.io/KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m),
and its deployed code, admin, and oracle key match the reviewed build.
Marshal approval is a trust decision rather than a guarantee of
safe escrow. This review uses dated
Objkt metadata, Mainnet ownership, transfer samples, contract creator, TzKT
code hash, and a SHA-256 of the full Michelson code. It is not a proof that
the FA2 transfers honestly or lacks privileged bypasses. Direct Open Range
wallet trades and the race continue to count qualifying tokens without
inspection. A TzKT `tzips: ["fa2"]` label
or Objkt listing is not an implementation audit. Objkt [states that it
automatically indexes all FA2 token contracts](https://docs.objkt.com/product/product-guides/collections-contracts/editing-a-non-objkt-collection),
so its index cannot attest escrow movement.

On 2026-11-03, the 25 already indexed current-season horse-art transfers
spanned 10 FA2 contract addresses and four on-chain Michelson code families.
This focused review read the Mainnet RPC scripts and their `%transfer` paths;
it is **not** a full audit of every entrypoint. `codeHash` below is TzKT's
32-bit same-script search key, not a collision-resistant trust anchor.

| Observed family | Current events | Transfer and privilege finding | Review note |
| --- | ---: | --- | --- |
| Objkt Collection Factory v3 clones (`codeHash -2061727315`) | 7 | Owner/operator check and positive-amount ledger debit/credit; reviewed `%burn` also requires owner/operator. | Evidence for a marshal to review; not automatically approved. |
| Open objkt (`codeHash 964496845`) | 4 | Owner/operator check and positive-amount ledger debit/credit; reviewed `%burn` also requires owner/operator. | Evidence for a marshal to review; not automatically approved. |
| Hic et Nunc (`codeHash 1973375561`) | 3 | Transfer debits/credits, but `%administrator` may transfer from any owner, including escrow. | Privileged bypass is a material custody risk for human review. |
| Objkt Minting Factory clones (`codeHash 199145999`) | 11 | Transfer debits/credits, but `%administrator` may transfer from any owner, including escrow. | Privileged bypass is a material custody risk for human review. |

The two candidate reference digests are SHA-256 of
`JSON.stringify(script.code)` from Tezos Mainnet RPC Micheline. A marshal's
approved token record is compared with the current full script before each
new permit: Objkt v3
`e78e04778833c9b26c66f5c98fd17f36d88df8375e114b4e012cceeef621a9b3`
and Open objkt
`fe6270753f1fefbbb4e52e65c804024172f58e7bedaf0fc94dc73ce298bb4677`.
The reviewed Objkt v3 examples were
`KT1QVADjPQty14KpcKPm1m9xTJrdQRAaFcxy` and
`KT1StD4NB74LmSkkY4EwhuE7HAiQxrpFoE4f`, both originated by the
Objkt Collection Factory v3
`KT1HdoDy4YhwWQMEocRcQmrYYtDS5CZPiURv`. The Open objkt reference
is `KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E`, originated by Objkt issuer
`tz1TWrPXuG3T3rR9NR5EqsBegJMwiMcobjkt`.
Two sampled Objkt v3 and Minting Factory clones matched their respective full
code digests. The reference contract and factory identities must also be
bound to any registry entry so a compatible script deployed under an
unexpected issuer is not silently approved. The contract still relies on
the server-held permit key and an accurate registry; no universal check can
make arbitrary adversarial FA2 contracts safe custody assets.

Until a token is approved, Honor (mode 1), Reciprocal (mode 0), and Group
(mode 2) permit requests all fail closed with `HORF_CUSTODY_UNTRUSTED`.
Approval is global for the exact contract and token ID, so any owner can
deposit that token after a fresh owner/eligibility check. Permit issuance
requires the approved creator, TzKT code hash, and full Micheline SHA-256 to
match the current Mainnet contract. A revoked approval blocks new permits;
an already signed one-use permit remains usable until the on-chain admin
bumps `oracle_epoch`. The verified Mainnet Stable is live, with no approved
tokens or listings at this handoff.

## API

- `GET /api/horf/stables?address=<optional tz wallet>` reads the configured contract's TzKT storage and bigmaps. It returns `status: "unconfigured"` and empty inventory before deployment; otherwise `status: "ready"`, on-chain listing IDs/remaining editions, credits, on-chain `adminAddress`, and `onChainBlacklisted` for the queried wallet. `permitReady` is true only when the configured server signing key matches the deployed oracle key. Reads use cursor pagination and TzKT's documented default 100-key page size. `custodyReady` means the inspection workflow is available; the exact token still needs `GET /api/horf/inspections/status` to say `approved`.
- `POST /api/horf/stables/permit` accepts `{ address, mode, tokenContract, tokenId, amount }` from an exactly verified wallet and returns `{ contractAddress, chainId, address, mode, tokenContract, tokenId, amount, nonce, signature, oracleEpoch, token }` only after active inspection approval and current Mainnet identity parity. Invalid input is 400, missing wallet proof or active blacklist is 403, absent Objkt token is 404, ineligible or unapproved token is 422, and unavailable configuration/source is 503.

### Inspection workflow

`POST /api/horf/stable-selections` saves an eligible token currently held by
the proven owner wallet, with its Objkt name/image. `GET` lists that wallet's
saved Personal Stable choices; this list is saved intent, not an assertion
that the wallet still owns every edition. `POST /api/horf/inspections` requires
a saved selection and fresh positive Mainnet ownership and eligibility. It
stores the dated evidence and queues the exact token for review. Public
`GET /api/horf/inspections/status?contract=&tokenId=` reports none, pending,
approved, rejected, or revoked.

WTF OS users with the additive `horf_marshal` role, and admins, may read
`GET /api/horf/inspections/pending` and `/api/horf/inspections/:id`, then
`POST /api/horf/inspections/:id/decision` with approve/reject and a reason.
The server reloads canonical roles on every decision, so role revocation is
immediate. It records reviewer user ID and an optional separately proven
wallet. Admins assign the role through the existing WTF OS user-role API and
may revoke a token approval through
`POST /api/horf/admin/inspection-approvals/:contract/:tokenId/revoke` with a
reason. Revocation response warns about issued permits and `oracle_epoch`.

## Public Horf wallet access and moderation

Direct-link visitors can prove a Tezos Mainnet wallet with a one-use,
origin-bound `horf` signature challenge. `POST /api/horf/wallet/challenge`
returns `{nonce,message,expiresAt,action,origin}`; `POST
/api/horf/wallet/verify` consumes the nonce and records the wallet in an
HttpOnly server session. Both require the session CSRF header. Guest writes
use a local CSRF guard because the shared global guard skips anonymous
requests. `GET /api/horf/wallet/session?address=` reports whether the exact
wallet is verified in this session or linked to the signed-in WTF OS account.
Signed-in proof recognizes an existing account-linked wallet; linking a new
wallet to a WTF OS account remains the existing `/api/wallets` flow with its
portfolio sync and audit events. A wallet already linked to another account
returns 409 when proven inside a different signed-in account. The
verified-wallet registry is an audit
record populated by Horf proofs and canonical wallet-link inserts, never
authorization by itself. Guest and account sessions share posse
and gift notes for the same wallet.

Season, HORSE, Stable snapshot, token eligibility, trader status, and
`/api/horf/wallet/tokens` are public reads. Posse and gift inbox reads and
writes require exact wallet scope; gift confirmation also verifies the
Mainnet FA2 transfer in TzKT. Guest proof failures return 403 so an unrelated
WTF OS session is not invalidated.

WTF OS admins can list, add, and clear Horf wallet blacklists, recording the
reason, optional http(s) evidence, admin actor, and time. Public trader status
and leaderboard annotations show active restrictions without removing past
trade counts. An active blacklist blocks private Horf features and new
Stable permits. It cannot reverse Tezos transfers or revoke on-chain Stable
credits. After a Stable is originated, an admin wallet transaction is also
needed to enforce a ban against direct contract calls; database moderation
alone cannot stop those calls.

The read source is [TzKT's contract storage, bigmap, and event API](https://api.tzkt.io/). The server checks chain ID before serving chain-derived state. `horse_claimed` events are cursor-paged by contract, tag, and half-open season timestamp window and normalized into depositor-to-claimant transfers for the Horf season ledger. Deposits and cancellations are excluded from trading totals.

## Configuration

The production environment uses `TEZOS_NETWORK=mainnet`,
`HORF_STABLES_CONTRACT_ADDRESS=KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m`, and
`HORF_STABLES_ORACLE_SECRET_KEY=<private key whose public key is stored in the
contract>`. The browser takes the configured KT1 from the read API. No
oracle private key is checked into the repository. Horf
uses an explicit Mainnet index, `HORF_MAINNET_TZKT_URL` when configured and
`https://api.tzkt.io/v1` otherwise, independent of the generic WTF OS
`TZKT_API_URL` that may target Shadownet locally. Contract identity checks
use `HORF_MAINNET_RPC_URL` when configured; otherwise they use generic
`TEZOS_RPC_URL` only when `TEZOS_NETWORK=mainnet`, or the project Mainnet
primary `https://tezos-mainnet.octez.io/` and fallback
`https://tcinfra.net/rpc/tezos/mainnet`. The RPC chain ID is checked.

The artifact, on-chain origination, exact deployed code, admin, and oracle key
have been verified. Local contract tests and actor-backed app tests cover
deposit, claim, moderation, and indexing paths. No live user horse has been
deposited or claimed yet; a first Mainnet deposit and claim remains the final
end-to-end wallet smoke. Permit requests remain closed until a token receives
active marshal approval.

## Minimal source probes

On 2026-11-03, one read-only Objkt GraphQL token lookup for the public Horse of July token `KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/23` returned its exact FA2 identity, metadata, `decimals: 0`, and tag counts. A TzKT `/head` read returned mainnet chain ID `NetXdQprcVkpaWU`. Two TzKT bigmap-key reads with `limit=2` confirmed cursor semantics: IDs `1,2`, then `offset.cr=2` returned `3,4`. After origination, TzKT showed epoch `0`, zero listings, the intended admin and oracle key, and an applied operation from wtf.tez. Each deployed Michelson section matched the built artifact. No user horse deposit or claim was attempted.
