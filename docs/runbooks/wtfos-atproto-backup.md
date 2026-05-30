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

## Split topology — dedicated AT data box (storage split)

The PDS fleet (master + 7 domain + `users` + `private` = 10 PDSes) and the self-hosted PLC now
run on a **dedicated, privately-networked data box** (private `10.0.0.3`, public `5.78.214.209`),
separate from the wtfOS app/AppView + canonical Postgres (main box, private `10.0.0.2`). The app
talks to the data box over the **private** `10.0.0.0/16` network only; the PDS/PLC ports are bound
to `10.0.0.3` and are **not** publicly reachable (host firewall + private-IP bind).

### Data box layout

- PDS/PLC data are **host bind mounts** (not Docker named volumes), under `/mnt/wtf-data/` on the
  data box: `pds` (master), `pds-social`, `pds-commerce`, `pds-media`, `pds-arcade`, `pds-tezos`,
  `pds-ops`, `pds-os`, `pds-users`, `pds-private`, and `plc-db` (PLC Postgres).
- Port map (private only): master `10.0.0.3:3000`, domains `3001-3007` (social, commerce, media,
  arcade, tezos, ops, os), `users` `3008`, `private` `3009`, PLC `3010`.
- Blob storage is **on-disk** inside each PDS volume (`PDS_BLOBSTORE_DISK_LOCATION=/pds/blocks`);
  there is no S3 blobstore for the PDS. App-level media bytes (the `app.wtfos.media.echo` S3 path)
  use the single app `S3_*` bucket on the main box when configured — one shared bucket, referenced
  by content-addressed echoes, never duplicated per box.

### Cold-storage backup (Hetzner Storage Box)

Run `scripts/wtfos-atproto-newbox-backup.sh` **on the data box**. It tars each `/mnt/wtf-data/<vol>`
and uploads to the Storage Box over SFTP/SCP (port 23), default target
`u587985.your-storagebox.de:/wtf-server-backups/atproto-databox/<timestamp>/` (override via
`WTFOS_STORAGEBOX_HOST` / `WTFOS_STORAGEBOX_USER` / `WTFOS_STORAGEBOX_DIR`; the alternate box
`u602495.your-storagebox.de` is also available). Schedule via cron, e.g.:

```cron
# 04:20 daily, on the data box
20 4 * * * /opt/platform/repos/wtf-app/scripts/wtfos-atproto-newbox-backup.sh >> /var/log/wtfos-databox-backup.log 2>&1
```

For a guaranteed-consistent snapshot, `docker compose stop` the PDS fleet on the data box before
the tar and restart after (the main-box app stays up; only AppView publishing pauses). Key
material (PLC rotation keys, `WTFOS_PRIVATE_PDS_ENC_KEY`) is **not** in these volumes — keep it in
the secrets manager + offline escrow as described above.

### Restore (data box)

1. Provision Docker + the `/mnt/wtf-data/<vol>` dirs on a replacement data box.
2. Restore each tarball into its `/mnt/wtf-data/<vol>` dir.
3. Restore the reused `WTFOS_PDS_*` infra secrets into the data box `.env`.
4. Bring up the fleet (`docker compose --profile wtfos-atproto up -d <pds...> wtfos-plc wtfos-plc-db`)
   bound to the private IP, then re-point the main-box `.env` `WTFOS_PDS_*_INTERNAL_URL` if the
   private IP changed and `docker compose up -d app`.
