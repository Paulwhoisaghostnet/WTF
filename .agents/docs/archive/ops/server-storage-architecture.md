# WTF Gameshow Server Storage Architecture

Pre-migration recovery checkpoint already created:

`Storage Box: wtf-server-backups/pre-migration/wtf-server-pre-migration-20260503T220525Z`

## Roles

- Native SSD, 80 GB: OS, packages, app source/releases, Docker runtime basics, rotated logs only.
- Hetzner Volume, 120 GB, mounted at `/mnt/wtf-data`: Postgres, hot caches, upload staging, temp processing, generated/transcoded media, backup staging.
- Hetzner Object Storage, bucket `wtftv`: durable originals and large media source-of-record.
- Hetzner Storage Box, 1 TB: server recovery backups, DB dumps, manifests, app-state/config bundles.
- Google Drive remote `gdrive-wtf:`: offsite mirror for critical DB/config/manifests when configured.

## Path Map

Native SSD:

- `/opt/wtf-combo` or current `/opt/platform/repos/wtf-app`: repo/deploy source.
- `/etc/wtf/wtf.env`: runtime env, no repo secrets.
- `/etc/wtf/secrets/`: root-only mounted secrets.
- `/var/log/wtf`: rotated app/system logs.

Volume:

- `/mnt/wtf-data/postgres`
- `/mnt/wtf-data/redis`
- `/mnt/wtf-data/tv-cache/users`
- `/mnt/wtf-data/tv-cache/channels`
- `/mnt/wtf-data/tv-cache/thumbs`
- `/mnt/wtf-data/tv-cache/transcoded`
- `/mnt/wtf-data/uploads-staging`
- `/mnt/wtf-data/tmp-processing`
- `/mnt/wtf-data/workers`
- `/mnt/wtf-data/backups-staging`

## Media Flow

1. User upload is validated for MIME, extension, size, and safe filename.
2. Bytes land in Volume staging, not on native SSD.
3. App computes SHA-256 and creates a DB media row.
4. If S3 env is configured, original uploads to Object Storage under an owner/media/date key.
5. A hot playback copy is written to the Volume cache.
6. DB stores object key, bucket, endpoint/region, checksum, file size, cache path, upload/cache status, and timestamps.
7. Playback serves `hot_cache_path` first.
8. If cache is missing but object key exists, app downloads from Object Storage to the Volume and updates cache status.
9. Eviction deletes only Volume cache files and updates DB state; it never deletes Object Storage originals.

## Operational Warnings

- Do not put production secrets in repo `.env` files.
- Do not use native SSD paths for growing media, caches, DB data, temp outputs, or old backups.
- Do not duplicate all Object Storage media into the 1 TB Storage Box without a separate capacity plan.
- Before public launch, run the migration plan and verify Object Storage, Storage Box, Google Drive, and timers.

