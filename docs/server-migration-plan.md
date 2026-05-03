# WTF Gameshow Server Migration Plan

## 0. Recovery Checkpoint

Already completed before repo refactor:

- Storage Box path: `wtf-server-backups/pre-migration/wtf-server-pre-migration-20260503T220525Z`
- Includes DB dump, globals, sensitive config archive, app source snapshot, uploads/cache/backups/log/Caddy volumes.
- Raw live `pgdata` was intentionally skipped; logical `postgres-wtf.dump` is the recoverable DB artifact.
- Unused `wtf-app_templeos_data` Docker volume was verified unmounted and removed after backup.

## 1. Identify Current Storage

Run:

```bash
ssh wtf 'df -hT / /var/lib/docker /mnt/wtf-data 2>/dev/null || true'
ssh wtf 'sudo du -xhd1 /var/lib/docker/volumes 2>/dev/null | sort -h'
ssh wtf 'cd /opt/platform/repos/wtf-app && docker compose ps'
ssh wtf 'docker volume ls'
```

Current known issue: compose used Docker named volumes for `pgdata`, `uploads`, `cache`, `backups`, and `app_logs`.

## 2. Confirm Volume Mount

```bash
ssh wtf 'findmnt /mnt/wtf-data && df -hT /mnt/wtf-data && grep -F /mnt/wtf-data /etc/fstab'
ssh wtf 'sudo install -d -m 750 -o root -g docker /mnt/wtf-data/{postgres,redis,tv-cache/users,tv-cache/channels,tv-cache/thumbs,tv-cache/transcoded,uploads-staging,tmp-processing,workers,backups-staging}'
```

Stop if `/mnt/wtf-data` is missing or not persistent in `/etc/fstab`.

## 3. Confirm Object Storage

After rotated credentials are installed in `/etc/wtf/wtf.env`:

```bash
ssh wtf 'sudo awk -F= "/^(S3_ENDPOINT|S3_REGION|S3_BUCKET|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY)=/ { print \$1 \"=\" (\$2 == \"\" ? \"missing_or_empty\" : \"set\") }" /etc/wtf/wtf.env'
ssh wtf 'cd /opt/platform/repos/wtf-app && docker compose --env-file /etc/wtf/wtf.env exec -T app npx tsx scripts/object-storage-usage-check.ts'
```

Expected config:

- `S3_ENDPOINT=https://nbg1.your-objectstorage.com`
- `S3_REGION=nbg1`
- `S3_BUCKET=wtftv`

## 4. Confirm Storage Box

```bash
ssh wtf 'printf "pwd\nbye\n" | sudo sftp -i /etc/wtf/secrets/storagebox_ed25519 -o BatchMode=yes -P 23 u587985@u587985.your-storagebox.de'
```

## 5. Confirm Google Drive

```bash
ssh wtf 'command -v rclone && rclone listremotes | grep -x "gdrive-wtf:"'
```

Only run write/read/delete tests once the remote is intentionally configured.

## 6. Move Database Safely

1. Stop app writers:
   `cd /opt/platform/repos/wtf-app && docker compose stop app`
2. Stop Postgres:
   `docker compose stop postgres`
3. Copy:
   `sudo rsync -aHAX --numeric-ids /var/lib/docker/volumes/wtf-app_pgdata/_data/ /mnt/wtf-data/postgres/`
4. Update compose/env to bind `/mnt/wtf-data/postgres:/var/lib/postgresql/data`.
5. Start Postgres and app:
   `docker compose --env-file /etc/wtf/wtf.env up -d postgres app`
6. Verify:
   `docker compose exec -T postgres pg_isready -U wtf -d wtf`

Keep the old Docker volume until app and backup verification pass.

## 7. Move Media and Caches

- Originals: migrate upload originals to Object Storage and backfill DB object keys.
- Hot cache: copy existing `wtf-app_cache` and `wtf-app_uploads` contents into `/mnt/wtf-data/tv-cache`.
- Temp/staging: do not preserve failed partial files unless needed for incident forensics.
- Do not delete old originals until a manifest and playback sample verify.

Dry-run and apply helper for legacy `disk://` and DB `fileData` rows:

```bash
cd /opt/platform/repos/wtf-app
docker compose --env-file /etc/wtf/wtf.env exec -T app npx tsx scripts/migrate-legacy-media.ts --limit=25
docker compose --env-file /etc/wtf/wtf.env exec -T app npx tsx scripts/migrate-legacy-media.ts --apply --limit=25
```

If the old uploads named volume is not mounted at `/app/uploads/media`, temporarily mount it read-only or set `LEGACY_UPLOADS_DIR` to the readable legacy upload path before applying.

## 8. Enable Timers

```bash
sudo WTF_APP_DIR=/opt/platform/repos/wtf-app bash scripts/install-systemd-timers.sh
systemctl list-timers 'wtf-*' --no-pager
```

## 9. Final Verification

```bash
curl -fsS https://wtfgameshow.app/api/health
curl -fsS https://wtfgameshow.app/api/health/disk
cd /opt/platform/repos/wtf-app
docker compose exec -T app npx tsx scripts/cache-evict.ts
docker compose exec -T app npx tsx scripts/tmp-clean.ts
docker compose exec -T app npx tsx scripts/object-storage-usage-check.ts
sudo bash scripts/storage-health-check.sh
```

## Rollback

1. Stop app and Postgres.
2. Restore previous compose file or named-volume compose.
3. Reattach old Docker volumes.
4. Restore DB from Storage Box `postgres-wtf.dump` if needed:
   `pg_restore --clean --if-exists --no-owner -U wtf -d wtf postgres-wtf.dump`.
5. Restart app and verify `/api/health`.
