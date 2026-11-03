# coLILseum prepaid-credit open-seat duel escrow

This is a new versioned Mainnet XTZ duel escrow. It does not change either
previously deployed duel contract or an existing room's pinned contract. A
prepaid credit is an XTZ balance measured in mutez inside this escrow, not an
on-chain token. One displayed credit equals 1 XTZ and fractional balances are
possible. There is deliberately no credit withdrawal or transfer entrypoint.

`deposit_credit` adds XTZ backing to the sender's balance. `accept_prepaid`
lets an authorized, linked challenger claim an open seat using that balance;
it takes no additional XTZ. Hosts always create an offer with their entry and
the 0.5 XTZ house fee. Direct challenger deposits through `accept_offer` still
work. Outright winners receive XTZ in the settlement transaction. Pre-start
withdrawal/cancellation, technical void, and an exact tie restore a prepaid
challenger's own entry as credit. The `total_credit` storage field tracks the
remaining nonwithdrawable credit liability; room stakes are tracked by `held`.

The active Mainnet contract/script is pinned in the durable game volume as
`prepaid-credit.binding`. App startup and the guarded deployment path refuse
to disable or rotate that binding until a compatible migration exists. This
protects credit even when there are no active rooms; a direct on-chain top-up
could occur during a deployment otherwise.

`artifacts/build-manifest.json` identifies the SmartPy source, tests, compiled
Michelson, and canonical typed script hash. `preflight-shadownet.json` and
`preflight-mainnet.json` pin the network, source wallet, treasury, and artifact.
`originate-*.ts` defaults to read-only preflight and accepts `--execute` only
for an explicitly coordinated, journaled origination. The Shadownet deployment
and lifecycle journal prove a credit top-up, prepaid seat, cancellation, win
paid in XTZ, and technical void restoring credit. The lifecycle is synthetic;
it tests custody mechanics, not the authoritative game result.

The Mainnet deployment is `KT1Nk9Sxz7P2Q2eb45AgJiMp3jnbrYT3J4Fm`, with
the same typed script hash as Shadownet. `mainnet-deployment.json` and
`proof/mainnet-2026-11-03/` contain the finalized origination, six-operation
custody lifecycle, and primary-RPC timeout reconciliation. The lifecycle
proves an on-chain prepaid guest seat, automatic 0.02 XTZ winner payment, and
0.5 XTZ treasury payment; it uses a synthetic match result, not a claim about
a player match. Final contract and credit balances returned to their initial
zero values.

The Mainnet origination defaults to the configured primary RPC. After a
primary injection failure has been reconciled against the source counter,
chain, and mempool, an operator can use `--fallback` with a new journal
directory. The fallback config names only the authorized Mainnet fallback;
the original attempt's journal remains untouched. The lifecycle runner can
resume an uncertain prepared `create_offer` only with explicit
`--fallback --resume-reconciled --execute`: it checks the source counter,
mempool, and room absence before saving a one-use retry intent. Another
uncertain send still blocks an automatic resend.

The live Mainnet app selects this contract in prepaid mode. The binding on the
mounted game volume is readable by the unprivileged app, and the signer
allowlist retains the older Mainnet Duel contract for rooms already pinned to
it. The guarded deployment process may create the binding as root; newly
created files are assigned to the volume owner so the app can read them.

The app exposes authenticated credit balance and top-up quote endpoints under
`/api/wtfiap/open-duel/prepaid-credit`, and exact finalized operation status
under `/prepaid-credit/operations/:hash` and `/rooms/:code/operations/:hash`.
Unknown/unfinalized hashes remain pending. A submitted failed wallet action is
shown as failed only when the exact actor, contract, entrypoint, amount, and
encoded room parameters match the finalized chain operation.
