# Commission migration and recovery note

## Candidate database proof

The production-shaped local puppet database applies the commission migration chain through:

- `0119_commission_core_wayfinding.sql`
- `0120_casino_community_practice_games.sql`
- `0121_calendar_participation.sql`
- `0122_dm_message_reports.sql`
- `0123_media_mint_receipts.sql`

The actor-backed suite then exercises the registered apps and every new durable community table. The candidate proof passes 178/178.

## Recovery contract

No production migration was run in this pass. Before production promotion, the normal database backup must be captured and verified by the deployment owner.

Migrations 0120, 0121, 0122, and 0123 are additive. If the application binary must be rolled back, retain the new tables, indexes, and enum types; the prior application does not depend on them and dropping them would destroy community submissions, participation, reports, or receipts.

Migration 0119 intentionally updates authoritative app-registration rows and inserts missing FAQ rows. A rollback must restore the pre-migration registration rows from the verified backup rather than guessing earlier enablement or documentation values. Its FAQ inserts are keyed by exact question and can remain safely if the application binary is rolled back.

Migration 0122 also clamps impossible future DM read markers to the database clock. That correction is intentionally not reversed because restoring future markers could hide new unread messages.

If post-migration integrity fails, stop writes, preserve the failed database for diagnosis, restore the verified pre-migration backup, deploy the prior tested application commit, and confirm health plus role-specific `/api/apps/desktop` responses before reopening traffic.
