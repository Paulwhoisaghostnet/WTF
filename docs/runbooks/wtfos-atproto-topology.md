# Runbook: wtfOS AT Protocol topology (`wtfos-atproto` profile)

The AT network (S1.3) lives entirely behind the `wtfos-atproto` Docker Compose profile, which is
**OFF by default**. The default production stack (`postgres` + `app` + `caddy`) is unaffected.

## Services (16 under the profile)

| Service | Host (default) | Notes |
| --- | --- | --- |
| `wtfos-pds` (master) | `WTFOS_PDS_HOSTNAME` → set `pds.wtfos.me` | also in `wtfos-pds` profile; canonical + tracking repos |
| `wtfos-pds-{social,commerce,media,arcade,tezos,ops,os}` | `<domain>.wtfos.me` | domain echo PDSes |
| `wtfos-pds-users` | `users.wtfos.me` | did:plc user repos |
| `wtfos-pds-private` | `private.wtfos.me` | `PDS_CRAWLERS=""` → never federated |
| `wtfos-relay-db` | — (127.0.0.1:5434) | Postgres for the relay |
| `wtfos-atproto-relay` | host :2470 | Indigo relay (`Dockerfile.relay`) |
| `wtfos-plc-db` / `wtfos-plc` | `plc.wtfos.me` | self-hosted PLC mirror — **image finalized in S2.2** |
| `wtfos-labeler-db` / `wtfos-labeler` | `mod.wtfos.me` | labeler — **image + config finalized in S2.8** |

## Bring up / down

```bash
# Set required secrets in .env first (see .env.example WTFOS_* block):
#   WTFOS_PDS_JWT_SECRET, WTFOS_PDS_ADMIN_PASSWORD,
#   WTFOS_PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX,
#   WTFOS_RELAY_DB_PASSWORD, WTFOS_RELAY_ADMIN_PASSWORD,
#   WTFOS_PLC_DB_PASSWORD, WTFOS_LABELER_DB_PASSWORD
docker compose --profile wtfos-atproto up -d        # start the AT network
docker compose --profile wtfos-atproto ps           # status
docker compose --profile wtfos-atproto down         # stop (volumes/bind dirs persist)
docker compose --profile wtfos-atproto build wtfos-atproto-relay   # build the Indigo relay
```

The default stack continues to run independently; starting/stopping the profile does not touch it.

## Storage

All AT state uses bind mounts under `/mnt/wtf-data` (overridable per `WTFOS_*_DATA_DIR`), matching
the existing `WTF_DATA_ROOT` convention. Back these up alongside the main data volume (S5.2).

## Validation without Docker

`docker compose config` is the real check. Where Docker is unavailable, the YAML (including the
`x-wtfos-pds-common-env` anchor merges and profile gating) is structurally validated by a parser; the
authoritative `docker compose --profile wtfos-atproto config` must pass on the host before go-live.

## Caddy vhosts (S1.4 — staged)

The AT vhosts live in `./Caddyfile.wtfos-atproto` (mounted into the caddy container, **inactive**).
Activate after DNS points here and the profile is up by uncommenting one line in `./Caddyfile`:

```
import Caddyfile.wtfos-atproto
```

The `*.wtfos.me` wildcard with on-demand TLS is intentionally **excluded** from the importable
section. Enable it only after S2.3 (handle ask-gate) by adding the global `on_demand_tls { ask
http://app:3000/internal/tls/allow }` block to the top of `./Caddyfile` and the `*.wtfos.me` site
block — exact snippet is at the bottom of `Caddyfile.wtfos-atproto`.

## Follow-ups (tracked in the plan)

- **S2.2**: finalize the PLC mirror image/build + rotation-key custody.
- **S2.3**: serve `/internal/tls/allow` (tls-gate) + enable the `*.wtfos.me` wildcard vhost.
- **S2.8**: finalize the labeler (Ozone) image + identity/appview config + audit.
