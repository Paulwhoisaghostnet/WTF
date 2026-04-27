# WTF Repo Rework Stub (Post-Sync)

Date: 2026-04-27
Status: Synced and pushed. Items below are explicitly deferred rework.

## Deferred Rework Items

- [ ] Validate TempleOS infrastructure removal blast radius (routing/docs/artifact cleanup) after production sync.
- [ ] Confirm deployment workflow matrix still matches current Docker/Caddy topology.
- [ ] Review `drizzle/0029_collection_factory.sql` migration impact with live data snapshots.
- [ ] Follow up on server route changes in `server/routes/w.ts` and `server/routes/collection-factory.ts` with API contract snapshots.
- [ ] Triage untracked operational docs (`BUG_BOUNTY_BOARD.md`, `REPO_DOCTOR_HEARTBEAT_PLAN.md`, agent notes) into canonical docs locations.

## Database Follow-ups

- [ ] Run post-deploy integrity checks for collection factory tables/indexes in production.
- [ ] Backfill verification for `server/lib/gameshow-boot-backfill.ts` records.
- [ ] Confirm rollback SQL for latest migration set.

