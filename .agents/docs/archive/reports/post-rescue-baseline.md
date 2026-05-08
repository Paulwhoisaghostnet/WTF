# Post-rescue Baseline

Generated: 2026-05-02T21:06:00Z

Remote host: `wtf`

## Executive Summary

Wave 1 freed the server from the disk-full failure state. Root disk moved from 100% used to 48% used, with 38 GiB free. Postgres is healthy, the app health check returns `status: ok`, and `system_event_logs` was reduced from roughly 10 GiB to roughly 1.1 GiB after trimming to the last 24 hours and running `VACUUM FULL`.

The real live database is now about 5.25 GiB. Most of that is chain/indexing data, not gameshow or app configuration. The largest non-database filesystem consumer is the TV cache at 11 GiB.

## Filesystem

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        75G   34G   38G  48% /

16K	/var/lib/docker/volumes/platform_caddy_config
16K	/var/lib/docker/volumes/wtf-app_caddy_config
108K	/var/lib/docker/volumes/platform_caddy_data
164K	/var/lib/docker/volumes/wtf-app_caddy_data
21M	/var/lib/docker/volumes/wtf-app_templeos_data
179M	/var/lib/docker/volumes/wtf-app_uploads
1.5G	/var/lib/docker/volumes/wtf-app_backups
6.2G	/var/lib/docker/volumes/wtf-app_pgdata
11G	/var/lib/docker/volumes/wtf-app_cache
19G	/var/lib/docker/volumes

1.5G	/app/backups
11G	/app/cache/tv
11G	/app/cache
11M	/app/uploads/studio
2.0M	/app/uploads/media
166M	/app/uploads/bumpers
179M	/app/uploads
76M	/app/logs
```

## Postgres Size

```text
5252 MB|5506874391
```

## Top 30 Tables

| table | rows | bytes | pretty |
|---|---:|---:|---:|
| `token_sales` | 0 | 1342357504 | 1280 MB |
| `wallet_events` | 0 | 1248149504 | 1190 MB |
| `system_event_logs` | 1037670 | 1186144256 | 1131 MB |
| `backfill_manifest` | 1 | 1071251456 | 1022 MB |
| `token_metadata` | 150321 | 209207296 | 200 MB |
| `token_mint_events` | 0 | 170057728 | 162 MB |
| `contract_metadata` | 0 | 73203712 | 70 MB |
| `wallet_holdings` | 24714 | 63356928 | 60 MB |
| `sync_runs` | 62 | 47161344 | 45 MB |
| `token_market_summary` | 1 | 38641664 | 37 MB |
| `token_listings` | 1 | 18194432 | 17 MB |
| `address_labels` | 0 | 13656064 | 13 MB |
| `users` | 0 | 2646016 | 2584 kB |
| `tv_bumpers` | 0 | 1892352 | 1848 kB |
| `wallet_sync_cursors` | 0 | 1163264 | 1136 kB |
| `tv_channel_videos` | 157 | 753664 | 736 kB |
| `xtz_usd_daily` | 0 | 753664 | 736 kB |
| `x_dm_events` | 0 | 540672 | 528 kB |
| `user_media_library` | 0 | 196608 | 192 kB |
| `x_timeline_posts` | 0 | 180224 | 176 kB |
| `tv_playlist_items` | 0 | 139264 | 136 kB |
| `session` | 0 | 139264 | 136 kB |
| `user_desktop_settings` | 0 | 122880 | 120 kB |
| `indexing_queue` | 0 | 114688 | 112 kB |
| `board_threads` | 0 | 114688 | 112 kB |
| `studio_files` | 0 | 114688 | 112 kB |
| `tv_channels` | 0 | 114688 | 112 kB |
| `dm_conversation_participants` | 0 | 106496 | 104 kB |
| `desktop_pet_events` | 0 | 106496 | 104 kB |
| `dm_messages` | 0 | 98304 | 96 kB |

## Domain Rollup

| domain | tables | rows | bytes | pretty |
|---|---:|---:|---:|---:|
| chain | 16 | 175038 | 4250181632 | 4053 MB |
| kernel | 18 | 1037757 | 1236942848 | 1180 MB |
| tv | 9 | 157 | 3284992 | 3208 kB |
| messaging | 8 | 0 | 1040384 | 1016 kB |
| gameshow | 23 | 0 | 696320 | 680 kB |
| studio | 10 | 0 | 557056 | 544 kB |
| boards | 6 | 0 | 376832 | 368 kB |
| marketplace | 8 | 0 | 376832 | 368 kB |
| dicksword | 6 | 0 | 270336 | 264 kB |
| xapi | 3 | 0 | 245760 | 240 kB |
| console | 3 | 0 | 139264 | 136 kB |
| content | 2 | 0 | 49152 | 48 kB |

## Backup Footprint

The local backup volume now contains 1.5 GiB after retaining the two newest valid dumps. The Supabase free-tier target is not a real dump store for the current database size; the rescue code switches it to manifest-only mode unless explicitly configured otherwise.

## Key Inputs For Long-term Plan

- The current live database size is 5.25 GiB, so splitting by app/module is an architectural control decision rather than an immediate storage emergency.
- The biggest database pressure is `chain` data, especially `token_sales`, `wallet_events`, and `backfill_manifest`.
- The biggest filesystem pressure outside Postgres is the TV cache at 11 GiB.
- `system_event_logs` is still about 1.1 GiB at the moment of measurement, but Wave 2.1's retention job should keep it bounded going forward.
- The short-term plan's remote backup status remains honest: local backups are valid; Supabase free tier is manifest-only until the long-term plan selects a remote target that can hold full dump bytes.
