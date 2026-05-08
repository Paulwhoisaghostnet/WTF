# Cache Policy

The 120 GB Volume is hot working storage, not a junk drawer.

## Budgets

- Media hot cache default: 30 GiB.
- Reserved free space default: 15 GiB.
- TV cache budget: `TV_CACHE_MAX_TOTAL_BYTES`.
- Temp cleanup minimum age default: 6 hours.

## Eviction Rules

- Least-recently-used cache files are evicted first.
- Active channel media linked through `tv_channel_videos.media_item_id` is protected.
- Files with `cache_status='caching'` are protected.
- Eviction updates `user_media_library.cache_status='evicted'` and clears `hot_cache_path`.
- Object Storage originals are never deleted during eviction.
- Dry-run is default for `scripts/cache-evict.ts`.

Examples:

```bash
docker compose exec -T app npx tsx scripts/cache-evict.ts
docker compose exec -T app npx tsx scripts/cache-evict.ts --apply
docker compose exec -T app npx tsx scripts/cache-evict.ts --apply --include-tv
```

## Temp Cleanup

Only files inside configured temp roots are eligible:

- `/mnt/wtf-data/tmp-processing`
- `/mnt/wtf-data/uploads-staging`

Protected suffixes: `.lock`, `.pid`.

Examples:

```bash
docker compose exec -T app npx tsx scripts/tmp-clean.ts
docker compose exec -T app npx tsx scripts/tmp-clean.ts --apply
```

