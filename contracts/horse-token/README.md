# HORSE on Tezos Mainnet

HORSE was originated by the `wtf.tez` wallet on Tezos Mainnet on 3 November
2026 at [`KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM`](https://tzkt.io/KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM).
The applied origination is
[`ooxwCZcJ72zsKbj8eZdqbGwxXhLyvi6Utk5QNxEWF8B8NtZ1SHa`](https://tzkt.io/ooxwCZcJ72zsKbj8eZdqbGwxXhLyvi6Utk5QNxEWF8B8NtZ1SHa).
Mainnet verification confirmed the creator and admin as
`tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`, exact live Micheline code equality
with $WTF, token ID `0`, eight decimals, a 1,000,000 HORSE supply, and that
entire initial balance in the `wtf.tez` wallet.

HORSE is a new FA2 token for recognition of WTF OS horse trading and community
support. The contract's Micheline **code is exactly the deployed $WTF code** at
[`KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`](https://tzkt.io/KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD).
The original 2024 origination code and the live RPC code compare equal. The
bundled code is in `wtf-code.json`; the read-only preflight checks it against
Mainnet again before preparing a wallet request. The source TzKT code hash is
`1454653741`.

The initial storage preserves $WTF's structure: token ID `0`, eight decimals,
mintable and pausable admin functions, and 1,000,000 initial tokens. It changes
the admin and initial allocation to the wallet currently resolved by
`wtf.tez`, `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`, and token metadata to
`HORSE`. The initial raw supply is `100000000000000`. The sender earns 10 HORSE
for each qualifying horse edition sent to another trader. The recipient earns
HORSE only when they send a qualifying horse of their own, including a return
horse. A horse claimed from a Stable counts as sent by its depositor when it
reaches the claimant; the deposit into escrow does not earn a separate award.
Rewards accrue in Horf's verified season ledger. Traders
claim from a separately funded HORSE vault with their own wallet transaction
and pay the Tezos fee. The vault will receive tokens from this initial supply;
it does not need the token contract's mint function. One hundred traders who
each send 200 qualifying horse editions would earn 200,000 HORSE in total.
The owner funded that initial reserve to the verified
[Claim Vault](https://tzkt.io/KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT)
in applied operation
[`ooVBLDgHC4E3gszbBHqHEtoBiFmKAjJ8sys4xTitnUDUdyVbJqq`](https://tzkt.io/ooVBLDgHC4E3gszbBHqHEtoBiFmKAjJ8sys4xTitnUDUdyVbJqq).

## Read-only Mainnet preparation

```sh
TEZOS_NETWORK=mainnet npx tsx contracts/horse-token/prepare.ts
```

The command checks Mainnet chain ID, live $WTF code equality, the wtf.tez
manager key and balance, storage/code typechecking, script size, and a
read-only Taquito origination estimate. It writes `plan/origination.json` and
`plan/preflight.json`. It holds no signing key and injects no transaction. It
uses the project's Mainnet RPC primary `https://tezos-mainnet.octez.io/` and
fallback `https://tcinfra.net/rpc/tezos/mainnet`, or an explicitly supplied
`TEZOS_RPC_URL`.

The preflight on 3 November 2026 estimated 1.417637 XTZ for fees and storage
burn on a 1,000,000 HORSE allocation. Kukai independently estimated the actual
wallet request at 1.412625 tez before signing. Both are estimates; the wallet
is the action-time source for the fee.

## Wallet handoff and verification

The one-time `originate.html` page can be served from the repo's local Vite
server. It rechecks the code/plan hashes and Mainnet before requesting an
operation from the connected `wtf.tez` wallet. The user performs the final
signature in Kukai. Do not call `wallet.originate` a submission until its
builder's `.send()` returns an operation hash. If the browser reports an
ambiguous result, inspect the wallet and TzKT before requesting another
origination.

After a confirmed operation, verify on Mainnet that the new KT1's creator and
storage admin are `tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt`, its code hash is
`1454653741`, token ID `0` has `HORSE` metadata with eight decimals and
1,000,000 supply, and the wtf.tez wallet holds that initial supply. Horf uses
the verified Mainnet contract address by default and accepts an explicit
`HORF_HORSE_CONTRACT_ADDRESS` override on the server. The browser gets this
verified address from its API.

HORSE itself is excluded from the horse-art transfer qualifier. Sending HORSE
records participation without creating a horse-art return obligation.
