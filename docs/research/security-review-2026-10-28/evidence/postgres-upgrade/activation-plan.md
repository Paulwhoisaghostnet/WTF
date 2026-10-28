# PostgreSQL 16.15 production activation

This plan belongs to WTF-BB-718. Production replacement is coordinated by the parent release task after mail preparation. No application tables, credentials, roles, volume paths, or PostgreSQL major version change.

The [vendor migration notes](https://www.postgresql.org/docs/release/16.15/) permit an in-place 16.x minor update. All three deployed clusters contain only `plpgsql`, with no logical slots/subscriptions or custom output plugins, no `pgcrypto`, `btree_gist`, or `ltree`, and no invalid indexes or custom tablespaces. Their conditional cleanup/reindex/plugin configuration steps therefore do not apply. The new default output plugin allowlist is verified on the isolated candidates.

Verified target images preserve each deployed Alpine release line:

- Main: `postgres:16.15-alpine3.24@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`.
- AT PLC and relay: `postgres:16.15-alpine3.23@sha256:2a96bfbbaa8ba661510e9076431ee49d551c118a586099cb733b1214c4e4ff00`.
- The inactive labeler declaration retains the repository's Alpine 3.24 line with the main target; no labeler is deployed by this change.

Preparation uses online physical `pg_basebackup` with SHA256 backup manifests and a spread checkpoint. `pg_verifybackup` verifies each protected backup. The backup itself is never booted: a separate copy starts on the actual old image, then the patched image, then the old image again for rollback proof. Candidates use `--network none`, expose no ports, and never mount a production data directory. Row counts, column catalog, and sequence state hashes are compared; patched `pg_amcheck` checks heap/index integrity on the isolated copy only. Original backups remain beneath `/mnt/wtf-data/backups/security-20261028-postgres/` with mode 0700 protection. No database contents or credentials are committed to this repository.

## Main host

1. Immediately before the coordinated main push, retain a fresh verified backup and confirm the exact old image remains available locally. The prepared rehearsal backup and source image ID are recorded in `rehearsal.json`.
2. Promote through the normal repository main deployment. `scripts/server-deploy.sh` already runs `docker compose up -d postgres`, waits for readiness, then applies existing application migrations and replaces the app. Do not independently replace the main database.
3. Require actual `SHOW server_version` and `psql --version` to return 16.15, the original `/mnt/wtf-data/postgres` mount to remain unchanged, normal deployment success, and public health/readiness reporting the promoted commit.

## AT host

1. Wait for the coordinated AT window; acquire `/tmp/wtf-app-deploy.lock`. Take fresh verified physical backups of PLC and relay and record their active consumers and current container/image IDs.
2. Preserve a protected backup of `/opt/platform/repos/wtf-app/docker-compose.yml`. The AT host retains its established legacy topology: do not replace it wholesale with the root repository compose file, which intentionally lacks a PLC service. Change only the `image` fields beneath `wtfos-plc-db` and `wtfos-relay-db` to the verified AT target. Preserve the override file, environment, data mounts, ports, and every other service. Validate the effective configuration with the existing project `.env` and `--profile wtfos-atproto`, printing selected image/mount fields only.
3. Pause only the two previously running consumers (`wtfos-plc` and `wtfos-atproto-relay`) for a clean observation window. Record stable pre-replacement catalog/table-count/sequence summaries. Run `docker compose --profile wtfos-atproto up -d --no-deps wtfos-plc-db wtfos-relay-db` in the existing project directory. Never use `down`, remove a volume, or initialize a new production cluster.
4. Verify server/client 16.15, unchanged data mounts, healthy databases, and matching stable data summaries. Start the same consumers, then require PLC and relay public health and the existing PDS health checks. Record final IDs, versions, and timestamps.

## Rollback

The rehearsal proves that the current 16.14 image can reopen the cleanly stopped 16.15 copy with matching data/catalog/sequence state. Retain the exact old images and backups. If activation fails, stop the affected consumer and new database cleanly, restore only the database image selection, and reopen the same existing production data directory on that exact old image. Verify database/consumer/public health before reopening traffic. This preserves post-backup writes and avoids restoring stale data by default.

If a separate data problem requires a backup restore, first preserve the failed current directory. Restore the verified backup to a different directory and explicitly account for any writes since the backup before switching production. Never overwrite the current data directory or silently discard those writes.
