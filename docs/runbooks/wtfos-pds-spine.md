# WTFOS PDS Spine

WTFOS uses a dedicated AT Protocol PDS for game/system identity. User canonical AT identities stay external; WTFOS stores game state, achievements, replay, telemetry, and system actor records in linked WTFOS repos under `app.wtfos.*`.

## Local/Production Service

The PDS service is defined in `docker-compose.yml` as `wtfos-pds` behind the `wtfos-pds` profile.

```sh
docker compose --profile wtfos-pds up -d wtfos-pds
```

Required DNS/host target:

- `pds.wtfgameshow.app` routes through Caddy to `wtfos-pds:3000`.
- The app should use `WTFOS_PDS_PUBLIC_URL=https://pds.wtfgameshow.app`.
- The app should use `WTFOS_PDS_INTERNAL_URL=http://wtfos-pds:3000` inside Docker.

## Required Secrets

Set these before enabling provisioning:

- `WTFOS_PDS_JWT_SECRET`
- `WTFOS_PDS_ADMIN_PASSWORD`
- `WTFOS_PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`
- `WTFOS_PDS_INVITE_CODE` unless `WTFOS_PDS_INVITE_REQUIRED=false`
- `WTFOS_PRIMARY_ATPROTO_DID`
- `WTFOS_PRIMARY_PDS_IDENTIFIER`
- `WTFOS_PRIMARY_PDS_PASSWORD` or `WTFOS_PRIMARY_PDS_ACCESS_JWT` plus `WTFOS_PRIMARY_PDS_REFRESH_JWT`

Keep `WTFOS_PDS_INVITE_REQUIRED=true` until public rollout policy, quotas, and abuse controls are ready.

## WTFOS App Contract

The app exposes:

- `GET /api/tz2at/pds/status`
- `GET /api/tz2at/pds-offering`
- `POST /api/tz2at/pds-offering/request`
- `GET /api/tz2at/outbox/status`
- `POST /api/tz2at/outbox/flush`

`POST /api/tz2at/pds-offering/request` refuses requests until the PDS is configured. With `WTFOS_PDS_PROVISIONING_ENABLED=false`, it records the canonical DID and requested WTFOS handle/repo target. With provisioning enabled and PDS health passing, it creates the WTFOS PDS account, stores encrypted repo session material, and writes the linkage record into the WTFOS repo.

The outbox endpoints are the first narrow publisher rail for WTFOS-owned `app.wtfos.*` repo records. Every newly ingested `challenge_system_events` row can enqueue an `app.wtfos.activity.event` for two targets:

- `primary_wtfos_repo`: the platform-wide WTF repo configured by `WTFOS_PRIMARY_ATPROTO_DID`.
- `user_wtfos_repo`: the user's linked WTF DID/repo when `wtfos_atproto_identities.status=active`.

The v1 tz2at app writes portable wallet-link proofs to the user's canonical repo only when the user separately approves `repo:xyz.tz2at.identity.walletLink`; the resulting SystemEvent then follows the same outbox path as in-app activity and blockchain activity.

Tezos wallet surveillance remains a WTFOS event source. Newly inserted `wallet_events` rows are normalized into `blockchain.tezos.*` SystemEvents so challenge, side quest, and reward automation can react to linked-wallet chain activity without depending on the user's canonical AT repo.

## Linkage Record

Provisioning creates or allocates a WTFOS-controlled DID/repo, then publishes:

```json
{
  "$type": "app.wtfos.identity.link",
  "canonicalDid": "did:plc:...",
  "wtfDid": "did:plc:...",
  "verified": true
}
```

After that, app/game/system records should write to the WTFOS DID repo or synthetic actor repos, not to the user's canonical social repo.
