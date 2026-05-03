# WTF Backup And Recovery

## Schedule

- Database: daily, compressed custom dump, Storage Box, optional Google Drive mirror.
- Media manifest: daily JSONL gzip export of DB object/cache metadata.
- App/config bundle: after major deploys or infrastructure changes.
- Storage health: every 30 minutes.
- Object Storage usage: every 24 hours.

Suggested retention:

- Daily DB backups: 7 days.
- Weekly DB backups: 4 weeks.
- Monthly DB backups: 3 months.
- Local manifest staging files: 30 days by default.
- App recovery bundle: after each major deploy.

## Backup Commands

```bash
sudo WTF_APP_DIR=/opt/platform/repos/wtf-app bash scripts/backup-database.sh
sudo WTF_APP_DIR=/opt/platform/repos/wtf-app bash scripts/backup-manifest.sh
sudo bash scripts/storage-health-check.sh
```

## Restore From Server Loss

1. Provision new Hetzner server.
2. Mount the 120 GB Volume at `/mnt/wtf-data`.
3. Install Docker, Caddy, Node build dependencies, and app source under `/opt/wtf-combo`.
4. Restore `/etc/wtf/wtf.env` and `/etc/wtf/secrets` from the sensitive config archive.
5. Restore Postgres:
   `pg_restore --clean --if-exists --no-owner -U wtf -d wtf postgres-wtf.dump`.
6. Ensure Object Storage bucket `wtftv` is reachable.
7. Restore app cache only if needed; cache can be rebuilt from Object Storage.
8. Start compose and verify health, upload, playback, and workers.

## Storage Box Notes

Storage Box is the recovery target, not a hot playback disk. Do not mount it as the app media path.

## Google Drive Notes

Google Drive is an offsite mirror for critical backups: DB dumps, manifests, config bundles. Full media duplication is not included unless separately planned.
