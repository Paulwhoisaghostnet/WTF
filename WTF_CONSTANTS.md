# WTF Constants — durable reference

This file is the human-readable source of truth for every address, token
identifier, reserved dial, and key handle that WTF Gameshow depends on.
It mirrors [server/lib/constants.ts](server/lib/constants.ts) — changes
to either must be reflected in the other.

Never put any of these values into code as a literal. Read them from
[server/lib/constants.ts](server/lib/constants.ts) (server-side) or from
[shared/types.ts → WTF_TOKEN](shared/types.ts) (shared constants that
are safe in the browser bundle). Addresses and token IDs that appear
below live in environment variables on the server; we only commit the
public, on-chain addresses that do not change.

## FA2 token

- Contract: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Token id: `0`
- Decimals: `8`
- Symbol: `WTF`
- Human name: `WTF is a token?`

Source of record: [shared/types.ts → WTF_TOKEN](shared/types.ts).

## Wallets

These four wallets define who can sign what.

### `WTF_TREASURY_ADDRESS` (cold)

- Role: Holds the bulk of WTF supply. Fills the operator wallet when
  balances get low.
- Signed by: human, offline, Temple/Beacon. No server process ever
  holds a key for this wallet.
- Env: `WTF_TREASURY_ADDRESS` (required).
- WTF server behavior: read-only — balance queried for dashboards only.

### `WTF_OPERATOR_WALLET_ADDRESS` (hot, unified)

- Role: Single hot wallet that signs every server-initiated transfer
  across every asset the gameshow uses.
- Holds: WTF (FA2, token id 0), XTZ, and any future tokens added to
  `WTF_OPERATOR_ASSETS`.
- Signed by: `wtf-operator-signer` systemd service (see Phase 9). The
  WTF app never sees this key; it talks to the signer over a unix
  socket.
- Env: `WTF_OPERATOR_WALLET_ADDRESS` (required).

### `WTF_BOT_ACCOUNT_ADDRESS` (Discord/X attendance)

- Role: On-chain identity the Discord bot and X watcher use to attest
  attendance / CRP posts. Does not hold funds.
- Signed by: bot-runtime only. Separate key from the operator signer.
- Env: `WTF_BOT_ACCOUNT_ADDRESS` (optional, defaults to operator wallet
  address if unset — suppresses bot-scoped audit trail).

### `WTF_GAMESHOW_WALLET_ADDRESS` (legacy)

- Role: Historical holder for S1/S2 reward distributions. Being drained
  into treasury / operator wallet over time.
- Env: `WTF_GAMESHOW_WALLET_ADDRESS` (optional, read-only surfacing).

## Operator-signer asset allowlist

`WTF_OPERATOR_ASSETS` is the authoritative list of asset kinds the
signer may transfer on behalf of the operator wallet. Extending it
requires a code change (audit trail lives in git).

At v1:

```
[
  { kind: "fa2", contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", tokenId: 0 },
  { kind: "xtz" }
]
```

Any future FA2 rewards (e.g. partner tokens for side quests) require a
new entry here plus a matching `wtf-operator-signer` allowlist update.
The signer refuses unknown asset kinds.

## Reserved TV dials

Mirror of [server/lib/tv-boot-backfill.ts](server/lib/tv-boot-backfill.ts).
Assignment is permanent — once a user has a dial, it stays theirs even
if they delete the channel (see `tv_dial_counter` in the TV hardening
work).

| Dial | Owner               | Channel              |
| ---- | ------------------- | -------------------- |
| 1    | `opeculiar`         | Root channel         |
| 2    | `yoeshi`            | Yoeshi's channel     |
| 3    | `paulwhoisaghost`   | WTF TV               |
| 69   | `wtf-admin`         | WTF Platform         |

Dials 4–68 and 70+ are handed out by the monotonic `tv_dial_counter`
sequence in user creation order, skipping the reserved values.

## Excluded CRP handles

The CRP nomination watcher (Phase 5) counts @-mentions in a linked
user's own timeline. The following handles are excluded from the
reward multiplier so posters don't get credit for tagging the
committee itself:

- `TezosCommons`
- The poster's own handle

Configurable at runtime via `WTF_CRP_EXCLUDED_HANDLES` (comma-separated,
case-insensitive, `@` optional). The defaults above are always appended
unless `WTF_CRP_EXCLUDED_HANDLES_REPLACE=1`.

## Operator signer (Phase 9)

`wtf-operator-signer` is a separate systemd process that holds the hot
operator wallet key. The WTF app connects to it over a Unix domain
socket. Configuration is split between the two processes:

| Env var                                | Process          | Purpose                                                           |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `WTF_OPERATOR_SIGNER_SOCKET`           | WTF + signer     | Shared socket path (default `/run/wtf/operator-signer.sock`).     |
| `WTF_OPERATOR_SIGNER_AUTH_TOKEN`       | WTF + signer     | Shared bearer token; every request carries it.                    |
| `WTF_OPERATOR_SIGNER_SECRET`           | signer only      | `edsk…` private key for the operator wallet.                      |
| `WTF_OPERATOR_SIGNER_RPC`              | signer only      | Tezos RPC URL the signer broadcasts to.                           |
| `WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST`| signer only     | Comma-separated KT1 contracts the signer is allowed to call.     |
| `WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ`    | signer only      | Hard cap on XTZ per signed op (mutez).                            |
| `WTF_OPERATOR_SIGNER_MAX_RECIPIENTS`   | signer only      | Max FA2 recipients per batched `transfer`.                        |
| `WTF_OPERATOR_SIGNER_ALLOW_CUSTOM`     | signer only      | `1` to enable the `custom` intent; `0` by default.                |
| `WTF_OPERATOR_SIGNER_AUDIT_LOG`        | signer only      | Append-only JSON log path. Defaults to `/var/log/wtf/operator-signer.log`. |
| `WTF_OPERATOR_LOW_XTZ_MUTEZ`           | WTF only         | Low-balance threshold for XTZ (mutez). Optional.                  |
| `WTF_OPERATOR_LOW_FA2_<contract>_<id>` | WTF only         | Low-balance threshold for a specific FA2 asset. Optional.         |

The signer refuses requests for contracts not in
`WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST`, recipient counts above
`WTF_OPERATOR_SIGNER_MAX_RECIPIENTS`, and XTZ transfers above
`WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ`. All of those refusals return a
structured `code` that the Control Board maps to operator-visible errors.

## Bot webhook HMAC

`WTF_BOT_WEBHOOK_SECRET` is the shared secret used to sign requests from
the WTF Gameshow Discord bot (`building/wtf-gameshow-bot`) to the server.
Every signed request carries:

- `x-wtf-timestamp: <unix-millis>`
- `x-wtf-signature: sha256=<hex of HMAC_SHA256(secret, ts + "." + body)>`

Requests older than 5 minutes are rejected. The same scheme is used by
any future host-local service (e.g. the operator signer). Rotate by
updating both the WTF `.env` and the matching service `.env` and
restarting each — the 5-minute skew gives room for a rolling restart.

## Reserved usernames

- `wtf-admin` — platform admin account that owns dial 69.
- `wtf-bot` — reserved for the Discord bot's WTF account.

Neither can be registered by end-users (checked at `POST /api/auth/register`).

## Key roles (role order)

Defined in [shared/types.ts → ROLE_ORDER](shared/types.ts). Lower index
= more privilege.

1. `admin`
2. `host`
3. `cohost`
4. `resident_wizard`
5. `contestant`
6. `witness`

Only `admin`, `host`, and `cohost` can access the Control Board.
Elimination confirmations and round advancement are `cohost+`. Creating
new seasons and rounds is `manage_seasons` (defaults to `cohost+`).
Running the gameshow (lock cohort, eliminate, advance, operate the
signer) is `manage_gameshow` (defaults to `cohost+`, configurable).
