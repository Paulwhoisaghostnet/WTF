# wtfOS AT Protocol — Backup & Restore Runbook (S5.2)

Scope: the AT Protocol spine introduced under the `wtfos-atproto` Docker profile. Postgres
remains the **canonical** store for all wtfOS data; the AT repos are a **mirror** rebuildable
from Postgres via the backfill (`npm run atproto:backfill`). This runbook covers the data that
is *not* trivially rebuildable and must be backed up independently.

## What must be backed up

| Asset | Why it matters | Rebuildable from Postgres? |
| --- | --- | --- |
| **PDS data volumes** (`pds.wtfos.me`, the 7 domain PDSes, `users`, `private`) | Holds signed repo commits, account keys, blob refs. Account **signing keys** are NOT in Postgres. | No — keys are unique. |
| **PLC operation log / mirror** (`plc.wtfos.me`) | DID document history; losing it can strand `did:plc` identities. | No. |
| **Private PDS volume** (`private.wtfos.me`) | Encrypted DM/room envelopes. | No (canonical DM text is in Postgres, but envelopes/keys are not). |
| **Labeler (Ozone) store** | Moderation labels + audit. | Partially (audit mirror is in `challenge_automation_audit_logs`). |
| **Relay** (`relay.wtfos.me`: `relay-db` + `relay-persist`) | Firehose aggregation/subscription state + replay window. | Largely yes — re-crawls from PDSes; the persist dir only preserves the replay window. |
| **S3 object storage** | Media blobs referenced by `app.wtfos.media.echo`. | Already covered by existing object-storage backup. |
| AppView read model (`wtfos_appview_records`, `wtfos_appview_cursor`) | Denormalized index. | Yes — re-derive via `indexFromOutbox` + firehose re-crawl. |
| `wtfos_atproto_outbox`, `wtfos_atproto_identities` | Publish queue + identity map. | They live in Postgres; covered by the existing Supabase/Postgres backup. |

## Backup procedure

1. **Postgres** (canonical): unchanged — the existing `scripts/run-supabase-backup.ts`
   already captures `wtfos_atproto_*`, identities, board, DM, and audit tables.
2. **PDS + PLC + private + labeler volumes**: snapshot the Docker named volumes while the
   stack is quiesced or via the PDS's own export.
   ```bash
   # Per service, with the wtfos-atproto profile up:
   docker run --rm -v wtf_pds_master_data:/data -v "$PWD/backups":/backups alpine \
     tar czf /backups/pds_master_$(date +%F).tar.gz -C /data .
   # Repeat for each domain PDS, users, private, plc, ozone, and relay (relay-db +
   # relay-persist) volumes. The relay is largely rebuildable by re-crawling, but its persist
   # dir preserves the replay window.
   ```
3. **Key material (per-PDS secret separation — S5.2 hardening)**: each PDS now has its **own**
   JWT secret, admin password, and PLC rotation key — `WTFOS_PDS_<NAME>_JWT_SECRET`,
   `WTFOS_PDS_<NAME>_ADMIN_PASSWORD`, and
   `WTFOS_PDS_<NAME>_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX` for `<NAME>` in `MASTER`, `SOCIAL`,
   `COMMERCE`, `MEDIA`, `ARCADE`, `TEZOS`, `OPS`, `OS`, `USERS`, `PRIVATE` — plus the relay/PLC/
   labeler DB passwords, `WTFOS_RELAY_ADMIN_PASSWORD`, and `WTFOS_PRIVATE_PDS_ENC_KEY`. All of
   these must live in the secrets manager (NOT in volume backups alone). Losing the private
   encryption key makes DM envelopes unrecoverable; losing a PDS's PLC rotation key strands that
   PDS's `did:plc` identities.

   **Key escrow**: keep an offline, encrypted escrow copy of every PLC rotation key and the
   private-PDS enc key, held separately from both the live secrets manager and the volume backups
   (e.g. a sealed bundle under the Storage Box `wtf-server-backups/escrow/` path or an offline
   vault). WTF retains a non-removable PLC rotation key per the identity doctrine
   (`00-decisions.md` §4); escrow is what makes that recoverable after a secrets-manager loss.
   Record the key custodians and the last rotation date alongside the escrow bundle.
4. Store backups off-host with the same retention/rotation as the Postgres backups.

## Restore procedure

1. Restore Postgres first (canonical).
2. Restore PDS/PLC/private/labeler volumes into fresh containers.
3. Restore secrets (admin passwords, rotation key, private enc key).
4. Bring up the `wtfos-atproto` profile; verify `/.well-known/atproto-did`, a sample repo
   `com.atproto.repo.getRecord`, and the labeler health.
5. Re-derive the AppView: run the indexer (`indexFromOutbox` then firehose) — no separate
   restore needed.
6. If repos drifted from Postgres, reconcile with `npm run atproto:backfill` (idempotent,
   deterministic rkeys — safe to re-run).

## Restore drill

Run the readiness checker before relying on the procedure:

```bash
npx tsx scripts/atproto-backup-drill.ts
```

It performs **no destructive actions** — it verifies that backup inputs (volumes/env/secrets)
are configured and that the canonical→mirror rebuild path is available, then prints a
pass/fail checklist. Schedule it alongside the existing backup-restore drill
(`scripts/run-backup-restore-drill.ts`).
