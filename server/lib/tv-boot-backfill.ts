import { pool } from "../db";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { pickPreferredWtfChannelConfig } from "./tv-wtf-config";
import {
  WTFOS_GUIDE_TV_CHANNEL_DESCRIPTION,
  WTFOS_GUIDE_TV_CHANNEL_SLUG,
  WTFOS_GUIDE_TV_CHANNEL_TITLE,
  WTFOS_GUIDE_TV_PLAYLIST_NAME,
  getWtfosGuideTvCatalog,
} from "./wtfos-guide-tv";

const scryptAsync = promisify(scrypt);

const ADMIN_USERNAME = "wtf-admin";
// Prior revisions baked a literal admin password into this file.  That
// is a hard-coded credential in source control, which the audit
// (#TV_MICROAPP_AUDIT_REPORT_2026-04-22) flagged as a P0.  We now
// source the initial password from `WTF_ADMIN_INITIAL_PASSWORD` (the
// operator's responsibility to set and rotate).  If the env var is
// missing we generate a cryptographically-random one-time password,
// print it to the server log exactly once, and require rotation on
// first login.  No default secret is ever committed.
function resolveInitialAdminPassword(): { password: string; source: "env" | "generated" } {
  const envValue = process.env.WTF_ADMIN_INITIAL_PASSWORD;
  if (typeof envValue === "string" && envValue.length >= 12) {
    return { password: envValue, source: "env" };
  }
  const generated = randomBytes(24).toString("base64url");
  return { password: generated, source: "generated" };
}
const PLATFORM_CHANNEL_SLUG = "wtf-platform";
const PLATFORM_CHANNEL_TITLE = "WTF Platform";
const PLATFORM_CHANNEL_DESCRIPTION =
  "Admin-owned platform channel featuring every video on WTF TV.";
const ROGER_RADIO_CHANNEL_SLUG = "roger-radio-live";
const ROGER_RADIO_CHANNEL_TITLE = "ROGERvision LIVE";
const ROGER_RADIO_CHANNEL_DESCRIPTION =
  "24/7 GLITCHCULT BOUTIQUE from Roger Radio on Odysee.";
const ROGER_RADIO_PAGE_URL = "https://odysee.com/@RogerRadio:f/LIVE:922";
const ROGER_RADIO_EMBED_URL =
  "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true";
const ROGER_RADIO_THUMBNAIL_URL =
  "https://thumbnails.odycdn.com/card/s:1280:720/quality:85/plain/https://thumbs.odycdn.com/ce810d3ed8fb6b33b10963e1d6165902.webp";
const PLATFORM_DIAL = 69;
const WTF_TV_DIAL = 3;
const YOESHI_DIAL = 2;
const OPECULIAR_DIAL = 1;
const OPECULIAR_USERNAME = "opeculiar";
const YOESHI_USERNAME = "yoeshi";
// paulwhoisaghost owns WTF TV.  When the admin hasn't explicitly pinned
// a channel via tv_wtf_channel_config.channel_id we fall back to this
// owner's canonical WTF TV channel (matched by slug, then by title).
const WTF_TV_OWNER_USERNAME = "paulwhoisaghost";
const WTF_TV_CANONICAL_SLUG = "paulwhoisaghost-wtf-tv";
const WTF_TV_CANONICAL_TITLE = "WTF TV";
const TV_BOOT_BACKFILL_LOCK = [0x575446, 0x5442]; // "WTF", "TB"

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * One-shot, idempotent backfill that runs on server boot *after* the
 * drizzle-kit `push` pass.  We prefer idempotent SQL over a Drizzle
 * migration here because the deploy pipeline is `push --force`, which
 * applies schema changes but cannot carry data.
 *
 * Each step below is guarded so re-running the function is cheap:
 *   - sort_order:                 only updates rows still at the default 0
 *   - media-item linkage:         only writes where media_item_id IS NULL
 *   - admin / platform channel:   created only when missing
 *   - dial numbers:               only assigned where NULL
 *   - channel-video metadata:     only fills NULL columns
 *   - platform channel playlist:  ON CONFLICT DO NOTHING
 *   - orphan cleanup:             WHERE target IS NULL clauses
 *
 * Safe to call on every boot — does nothing once rows are populated.
 */
export async function runTvBootBackfill(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      TV_BOOT_BACKFILL_LOCK
    );
    lockAcquired = Boolean(lock.rows[0]?.locked);
    if (!lockAcquired) {
      console.log("[tv-backfill] skipped; another instance owns the boot backfill lock");
      return;
    }

    const results: Record<string, number> = {};

    // 0) Defensive DDL — keeps boot working on environments where
    //    drizzle-kit push hasn't been run yet.  Every statement is
    //    idempotent (`IF NOT EXISTS`), so applying twice is a no-op.
    //    Mirrors drizzle/0022_tv_hardening.sql.
    const tvHardeningDdl = [
      `ALTER TABLE tv_channels
         ADD COLUMN IF NOT EXISTS dial_number integer`,
      `ALTER TABLE tv_channels
         ADD COLUMN IF NOT EXISTS videos_per_bumper integer NOT NULL DEFAULT 4`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'tv_channels_videos_per_bumper_range'
         ) THEN
           ALTER TABLE tv_channels
             ADD CONSTRAINT tv_channels_videos_per_bumper_range
             CHECK (videos_per_bumper BETWEEN 0 AND 20);
         END IF;
       END$$`,
      `CREATE UNIQUE INDEX IF NOT EXISTS tv_channel_dial_number_unique_idx
         ON tv_channels (dial_number)
         WHERE dial_number IS NOT NULL`,
      `ALTER TABLE tv_channel_videos
         ADD COLUMN IF NOT EXISTS media_item_id integer`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conname = 'tv_channel_videos_media_item_id_fkey'
         ) THEN
           ALTER TABLE tv_channel_videos
             ADD CONSTRAINT tv_channel_videos_media_item_id_fkey
             FOREIGN KEY (media_item_id) REFERENCES user_media_library(id)
             ON DELETE CASCADE;
         END IF;
       END$$`,
      `CREATE INDEX IF NOT EXISTS tv_channel_videos_media_item_idx
         ON tv_channel_videos (media_item_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS tv_channel_videos_channel_media_unique_idx
         ON tv_channel_videos (channel_id, media_item_id)
         WHERE media_item_id IS NOT NULL`,
    ];
    for (const sql of tvHardeningDdl) {
      try {
        await client.query(sql);
      } catch (err) {
        console.warn("[tv-boot] ddl warning:", (err as Error)?.message || err);
      }
    }

    // 1) tv_channels.sort_order = id for any row still at 0.
    const channelsRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE tv_channels
            SET sort_order = id
          WHERE sort_order = 0
       RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`
    );
    results["tv_channels.sort_order"] = Number(channelsRes.rows[0]?.count || 0);

    // 2) tv_channel_videos — extract MTV-style display fields from the
    //    JSON blob we already have.  Populates creator_name /
    //    creator_address / collection_name / minted_at from the token's
    //    jsonb metadata when they're still NULL.
    const videosRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE tv_channel_videos AS v
            SET creator_name = COALESCE(
                  v.creator_name,
                  NULLIF(
                    CASE
                      WHEN jsonb_typeof(v.metadata -> 'creators') = 'array'
                           AND jsonb_array_length(v.metadata -> 'creators') > 0
                      THEN v.metadata -> 'creators' ->> 0
                      WHEN jsonb_typeof(v.metadata -> 'authors') = 'array'
                           AND jsonb_array_length(v.metadata -> 'authors') > 0
                      THEN v.metadata -> 'authors' ->> 0
                      ELSE NULL
                    END,
                    ''
                  )
                ),
                creator_address = COALESCE(
                  v.creator_address,
                  NULLIF(
                    CASE
                      WHEN jsonb_typeof(v.metadata -> 'creators') = 'array'
                           AND jsonb_array_length(v.metadata -> 'creators') > 0
                           AND (v.metadata -> 'creators' ->> 0) ~ '^(tz1|tz2|tz3|KT1)'
                      THEN v.metadata -> 'creators' ->> 0
                      ELSE NULL
                    END,
                    ''
                  )
                ),
                collection_name = COALESCE(
                  v.collection_name,
                  NULLIF(
                    COALESCE(
                      v.metadata ->> 'collectionName',
                      v.metadata -> 'collection' ->> 'name',
                      v.metadata -> 'contract'   ->> 'name'
                    ),
                    ''
                  )
                ),
                minted_at = COALESCE(
                  v.minted_at,
                  CASE
                    WHEN v.metadata ->> 'date' ~ '^\\d{4}-\\d{2}-\\d{2}'
                    THEN (v.metadata ->> 'date')::timestamp
                    ELSE NULL
                  END
                )
          WHERE v.creator_name     IS NULL
             OR v.creator_address  IS NULL
             OR v.collection_name  IS NULL
             OR v.minted_at        IS NULL
       RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`
    );
    results["tv_channel_videos.metadata"] = Number(videosRes.rows[0]?.count || 0);

    // 3) Media linkage backfill — if a channel-video's sourceUri
    //    matches a user_media_library row for the same channel owner,
    //    wire the FK.  This retrofits the ON DELETE CASCADE guard to
    //    rows created before the migration.
    // Postgres rejects `JOIN tv_channels ch ON ch.id = cv.channel_id`
    // inside the UPDATE...FROM clause because `cv` is the UPDATE target,
    // not part of the FROM list.  Using the implicit comma-join form and
    // moving the channel/owner correlation into the WHERE clause keeps
    // the same semantics while letting PG resolve the FROM-clause.
    const linkRes = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE tv_channel_videos cv
            SET media_item_id = uml.id,
                updated_at = NOW()
           FROM user_media_library uml, tv_channels ch
          WHERE ch.id = cv.channel_id
            AND cv.media_item_id IS NULL
            AND uml.owner_user_id = ch.owner_user_id
            AND (
                 uml.source_url   = cv.source_uri
              OR uml.playback_url = cv.source_uri
              OR (uml.token_contract IS NOT NULL
                  AND uml.token_id  IS NOT NULL
                  AND cv.token_contract = uml.token_contract
                  AND cv.token_id       = uml.token_id)
            )
       RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`
    );
    results["tv_channel_videos.media_link"] = Number(linkRes.rows[0]?.count || 0);

    // 4) Admin account — if no user with role='admin' exists, create
    //    one so dial 69 has a home.  The password is the one the
    //    product owner specified and is expected to be rotated on
    //    first login.  Scrypt hashing matches the auth layer's format
    //    (hex.salt, 64-byte derived key).
    const adminRes = await client.query<{ id: number; username: string }>(
      `SELECT id, username FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
    );
    let adminUserId: number;
    if (adminRes.rows.length > 0) {
      adminUserId = adminRes.rows[0]!.id;
      results["admin.existing"] = 1;
    } else {
      const { password: initialPassword, source } = resolveInitialAdminPassword();
      const hashed = await hashPassword(initialPassword);
      const created = await client.query<{ id: number }>(
        `INSERT INTO users (username, password_hash, role, display_name, created_at, updated_at)
         VALUES ($1, $2, 'admin', 'WTF Admin', NOW(), NOW())
         ON CONFLICT (username) DO UPDATE
            SET role = EXCLUDED.role,
                updated_at = NOW()
         RETURNING id`,
        [ADMIN_USERNAME, hashed]
      );
      adminUserId = created.rows[0]!.id;
      results["admin.created"] = 1;
      if (source === "generated") {
        console.warn(
          `[tv-backfill] seeded admin user '${ADMIN_USERNAME}' (id=${adminUserId}) with a generated one-time password — ROTATE NOW:\n` +
            `    username: ${ADMIN_USERNAME}\n` +
            `    password: ${initialPassword}\n` +
            `  Set WTF_ADMIN_INITIAL_PASSWORD in your env before the next boot to choose the initial password yourself.`
        );
      } else {
        console.log(
          `[tv-backfill] seeded admin user '${ADMIN_USERNAME}' (id=${adminUserId}) using WTF_ADMIN_INITIAL_PASSWORD; rotate it on first login`
        );
      }
    }

    // 5) Platform channel on dial 69 — created under the admin if
    //    it doesn't already exist, then pinned to dial 69.  Owner is
    //    the admin user resolved above.
    let platformChannelId: number;
    const existingPlatform = await client.query<{ id: number }>(
      `SELECT id FROM tv_channels
        WHERE owner_user_id = $1 AND slug = $2
        ORDER BY id ASC LIMIT 1`,
      [adminUserId, PLATFORM_CHANNEL_SLUG]
    );
    if (existingPlatform.rows.length > 0) {
      platformChannelId = existingPlatform.rows[0]!.id;
      results["platform_channel.existing"] = 1;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_channels
           (owner_user_id, slug, title, description,
            is_public, is_active, sort_order, dial_number,
            videos_per_bumper, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, 0, NULL, 4, NOW(), NOW())
         RETURNING id`,
        [adminUserId, PLATFORM_CHANNEL_SLUG, PLATFORM_CHANNEL_TITLE, PLATFORM_CHANNEL_DESCRIPTION]
      );
      platformChannelId = created.rows[0]!.id;
      results["platform_channel.created"] = 1;
    }

    // Ensure an active playlist exists for the platform channel.
    const platformPlaylistRes = await client.query<{ id: number }>(
      `SELECT id FROM tv_playlists
        WHERE channel_id = $1 AND is_active = TRUE
        ORDER BY id ASC LIMIT 1`,
      [platformChannelId]
    );
    let platformPlaylistId: number;
    if (platformPlaylistRes.rows.length > 0) {
      platformPlaylistId = platformPlaylistRes.rows[0]!.id;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_playlists
           (channel_id, name, is_active, transition_seconds, created_at, updated_at)
         VALUES ($1, 'All WTF Media', TRUE, 1, NOW(), NOW())
         RETURNING id`,
        [platformChannelId]
      );
      platformPlaylistId = created.rows[0]!.id;
      results["platform_playlist.created"] = 1;
    }

    // Sync every ready library item across every user into the platform
    // channel's pool and playlist.  Idempotent via the unique partial
    // index on (channel_id, media_item_id) and the existing unique on
    // (playlist_id, video_id).  Newly-uploaded media joins on the next
    // boot; for live reflection a future follow-up can add a per-upload
    // hook, but even an hourly boot-cadence keeps the dial-69 pool
    // meaningfully fresh.
    const syncVideos = await client.query<{ count: string }>(
      `WITH ins AS (
         INSERT INTO tv_channel_videos
           (channel_id, token_contract, token_id, source_uri, mime_type,
            title, thumbnail_uri, metadata, media_item_id,
            creator_name, creator_address, collection_name, minted_at,
            created_at, updated_at)
         SELECT $1,
                COALESCE(uml.token_contract, 'media:' || uml.id::text),
                COALESCE(uml.token_id, uml.id::text),
                COALESCE(uml.playback_url, uml.source_url),
                uml.mime_type,
                uml.title,
                uml.poster_url,
                uml.metadata,
                uml.id,
                u.display_name,
                NULL,
                NULL,
                NULL,
                NOW(), NOW()
           FROM user_media_library uml
           JOIN users u ON u.id = uml.owner_user_id
          WHERE uml.status = 'ready'
            AND (uml.mime_type LIKE 'video/%' OR uml.mime_type = 'image/gif')
            AND NOT EXISTS (
              SELECT 1 FROM tv_channel_videos cv
               WHERE cv.channel_id = $1
                 AND cv.media_item_id = uml.id
            )
         RETURNING id, media_item_id
       )
       SELECT count(*)::text AS count FROM ins`,
      [platformChannelId]
    );
    results["platform_channel.videos_added"] = Number(syncVideos.rows[0]?.count || 0);

    const syncItems = await client.query<{ count: string }>(
      `WITH ins AS (
         INSERT INTO tv_playlist_items
           (playlist_id, video_id, media_item_id, sort_order,
            duration_seconds, created_at, updated_at)
         SELECT $1,
                cv.id,
                cv.media_item_id,
                COALESCE(cv.id, 0),
                COALESCE(uml.duration_seconds, 30),
                NOW(), NOW()
           FROM tv_channel_videos cv
           LEFT JOIN user_media_library uml ON uml.id = cv.media_item_id
          WHERE cv.channel_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM tv_playlist_items pi
               WHERE pi.playlist_id = $1
                 AND pi.video_id    = cv.id
            )
         ON CONFLICT (playlist_id, video_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::text AS count FROM ins`,
      [platformPlaylistId, platformChannelId]
    );
    results["platform_playlist.items_added"] = Number(syncItems.rows[0]?.count || 0);

    // 6) Roger Radio live Odysee channel. This is a platform-owned,
    //    public external embed channel, not a cached media file. The
    //    player marks text/html rows as safe if they resolve to the
    //    allowlisted Odysee embed URL.
    let rogerChannelId: number;
    const existingRoger = await client.query<{ id: number }>(
      `SELECT id FROM tv_channels
        WHERE slug = $1
        ORDER BY id ASC LIMIT 1`,
      [ROGER_RADIO_CHANNEL_SLUG]
    );
    if (existingRoger.rows.length > 0) {
      rogerChannelId = existingRoger.rows[0]!.id;
      await client.query(
        `UPDATE tv_channels
            SET owner_user_id = $1,
                title = $2,
                description = $3,
                is_public = TRUE,
                is_active = TRUE,
                videos_per_bumper = 0,
                updated_at = NOW()
          WHERE id = $4`,
        [
          adminUserId,
          ROGER_RADIO_CHANNEL_TITLE,
          ROGER_RADIO_CHANNEL_DESCRIPTION,
          rogerChannelId,
        ]
      );
      results["roger_channel.existing"] = 1;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_channels
           (owner_user_id, slug, title, description,
            is_public, is_active, sort_order, dial_number,
            videos_per_bumper, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, 0, NULL, 0, NOW(), NOW())
         RETURNING id`,
        [
          adminUserId,
          ROGER_RADIO_CHANNEL_SLUG,
          ROGER_RADIO_CHANNEL_TITLE,
          ROGER_RADIO_CHANNEL_DESCRIPTION,
        ]
      );
      rogerChannelId = created.rows[0]!.id;
      results["roger_channel.created"] = 1;
    }

    const rogerPlaylistRes = await client.query<{ id: number }>(
      `SELECT id FROM tv_playlists
        WHERE channel_id = $1 AND is_active = TRUE
        ORDER BY id ASC LIMIT 1`,
      [rogerChannelId]
    );
    let rogerPlaylistId: number;
    if (rogerPlaylistRes.rows.length > 0) {
      rogerPlaylistId = rogerPlaylistRes.rows[0]!.id;
      results["roger_playlist.existing"] = 1;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_playlists
           (channel_id, name, is_active, transition_seconds, created_at, updated_at)
         VALUES ($1, 'LIVE Odysee Feed', TRUE, 1, NOW(), NOW())
         RETURNING id`,
        [rogerChannelId]
      );
      rogerPlaylistId = created.rows[0]!.id;
      results["roger_playlist.created"] = 1;
    }

    const rogerVideo = await client.query<{ id: number }>(
      `INSERT INTO tv_channel_videos
         (channel_id, token_contract, token_id, source_uri, mime_type,
          title, thumbnail_uri, metadata,
          creator_name, creator_address, collection_name, minted_at,
          created_at, updated_at)
       VALUES (
          $1,
          'external:odysee',
          'roger-radio-live',
          $2::text,
          'text/html',
          $3::text,
          $4::text,
          jsonb_build_object(
            'provider', 'Odysee',
            'authorName', 'ROGERradio',
            'authorUrl', 'https://odysee.com/@RogerRadio:f',
            'pageUrl', $5::text,
            'embedUrl', $2::text
          ),
          'ROGERradio',
          NULL,
          'Odysee',
          NULL,
          NOW(),
          NOW()
        )
       ON CONFLICT (channel_id, token_contract, token_id)
       DO UPDATE SET
          source_uri = EXCLUDED.source_uri,
          mime_type = EXCLUDED.mime_type,
          title = EXCLUDED.title,
          thumbnail_uri = EXCLUDED.thumbnail_uri,
          metadata = EXCLUDED.metadata,
          creator_name = EXCLUDED.creator_name,
          collection_name = EXCLUDED.collection_name,
          updated_at = NOW()
       RETURNING id`,
      [
        rogerChannelId,
        ROGER_RADIO_EMBED_URL,
        ROGER_RADIO_CHANNEL_TITLE,
        ROGER_RADIO_THUMBNAIL_URL,
        ROGER_RADIO_PAGE_URL,
      ]
    );
    const rogerVideoId = rogerVideo.rows[0]!.id;
    results["roger_video.synced"] = 1;

    await client.query(
      `INSERT INTO tv_playlist_items
         (playlist_id, video_id, media_item_id, sort_order,
          duration_seconds, created_at, updated_at)
       VALUES ($1, $2, NULL, 0, 86400, NOW(), NOW())
       ON CONFLICT (playlist_id, video_id)
       DO UPDATE SET
          sort_order = EXCLUDED.sort_order,
          duration_seconds = EXCLUDED.duration_seconds,
          updated_at = NOW()`,
      [rogerPlaylistId, rogerVideoId]
    );
    results["roger_playlist.item_synced"] = 1;

    // 7) Official wtfOS learning channel. This platform-managed channel
    //    intentionally contains only the promo catalog and the FAQ
    //    tutorial catalog. Bumpers and schedules stay disabled so no
    //    unrelated TV media can enter the broadcast queue.
    const guideCatalog = getWtfosGuideTvCatalog();
    if (guideCatalog.length === 0) {
      throw new Error("wtfOS Guide TV catalog cannot be empty");
    }

    let guideChannelId: number;
    const existingGuideChannel = await client.query<{ id: number }>(
      `SELECT id FROM tv_channels WHERE slug = $1 ORDER BY id ASC LIMIT 1`,
      [WTFOS_GUIDE_TV_CHANNEL_SLUG]
    );
    if (existingGuideChannel.rows.length > 0) {
      guideChannelId = existingGuideChannel.rows[0]!.id;
      await client.query(
        `UPDATE tv_channels
            SET owner_user_id = $1,
                title = $2,
                description = $3,
                is_public = TRUE,
                is_active = TRUE,
                videos_per_bumper = 0,
                updated_at = NOW()
          WHERE id = $4`,
        [
          adminUserId,
          WTFOS_GUIDE_TV_CHANNEL_TITLE,
          WTFOS_GUIDE_TV_CHANNEL_DESCRIPTION,
          guideChannelId,
        ]
      );
      results["guide_channel.existing"] = 1;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_channels
           (owner_user_id, slug, title, description,
            is_public, is_active, sort_order, dial_number,
            videos_per_bumper, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, 0, NULL, 0, NOW(), NOW())
         RETURNING id`,
        [
          adminUserId,
          WTFOS_GUIDE_TV_CHANNEL_SLUG,
          WTFOS_GUIDE_TV_CHANNEL_TITLE,
          WTFOS_GUIDE_TV_CHANNEL_DESCRIPTION,
        ]
      );
      guideChannelId = created.rows[0]!.id;
      await client.query(
        `UPDATE tv_channels SET sort_order = id WHERE id = $1`,
        [guideChannelId]
      );
      results["guide_channel.created"] = 1;
    }

    await client.query(
      `UPDATE tv_playlists
          SET is_active = FALSE,
              updated_at = NOW()
        WHERE channel_id = $1 AND is_active = TRUE`,
      [guideChannelId]
    );
    const existingGuidePlaylist = await client.query<{ id: number }>(
      `SELECT id FROM tv_playlists
        WHERE channel_id = $1 AND name = $2
        ORDER BY id ASC LIMIT 1`,
      [guideChannelId, WTFOS_GUIDE_TV_PLAYLIST_NAME]
    );
    let guidePlaylistId: number;
    if (existingGuidePlaylist.rows.length > 0) {
      guidePlaylistId = existingGuidePlaylist.rows[0]!.id;
      await client.query(
        `UPDATE tv_playlists
            SET is_active = TRUE,
                transition_seconds = 1,
                updated_at = NOW()
          WHERE id = $1`,
        [guidePlaylistId]
      );
      results["guide_playlist.existing"] = 1;
    } else {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tv_playlists
           (channel_id, name, is_active, transition_seconds, created_at, updated_at)
         VALUES ($1, $2, TRUE, 1, NOW(), NOW())
         RETURNING id`,
        [guideChannelId, WTFOS_GUIDE_TV_PLAYLIST_NAME]
      );
      guidePlaylistId = created.rows[0]!.id;
      results["guide_playlist.created"] = 1;
    }

    await client.query(`DELETE FROM tv_schedule_entries WHERE channel_id = $1`, [guideChannelId]);
    await client.query(
      `DELETE FROM tv_playlists WHERE channel_id = $1 AND id <> $2`,
      [guideChannelId, guidePlaylistId]
    );

    const guideVideoIds: number[] = [];
    for (const entry of guideCatalog) {
      const synced = await client.query<{ id: number }>(
        `INSERT INTO tv_channel_videos
           (channel_id, token_contract, token_id, source_uri, mime_type,
            title, thumbnail_uri, metadata,
            creator_name, collection_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'video/mp4', $5, $6, $7::jsonb,
                 'wtfOS', 'wtfOS Guide TV', NOW(), NOW())
         ON CONFLICT (channel_id, token_contract, token_id)
         DO UPDATE SET
            source_uri = EXCLUDED.source_uri,
            mime_type = EXCLUDED.mime_type,
            title = EXCLUDED.title,
            thumbnail_uri = EXCLUDED.thumbnail_uri,
            metadata = EXCLUDED.metadata,
            creator_name = EXCLUDED.creator_name,
            collection_name = EXCLUDED.collection_name,
            updated_at = NOW()
         RETURNING id`,
        [
          guideChannelId,
          entry.tokenContract,
          entry.slug,
          entry.sourceUri,
          entry.title,
          entry.posterUri,
          JSON.stringify({
            managedChannel: WTFOS_GUIDE_TV_CHANNEL_SLUG,
            contentKind: entry.kind,
            summary: entry.summary,
            accountName: entry.accountName,
          }),
        ]
      );
      const videoId = synced.rows[0]!.id;
      guideVideoIds.push(videoId);
      await client.query(
        `INSERT INTO tv_playlist_items
           (playlist_id, video_id, media_item_id, sort_order,
            duration_seconds, created_at, updated_at)
         VALUES ($1, $2, NULL, $3, $4, NOW(), NOW())
         ON CONFLICT (playlist_id, video_id)
         DO UPDATE SET
            sort_order = EXCLUDED.sort_order,
            duration_seconds = EXCLUDED.duration_seconds,
            updated_at = NOW()`,
        [guidePlaylistId, videoId, entry.sortOrder, entry.durationSeconds]
      );
    }

    await client.query(
      `DELETE FROM tv_playlist_items
        WHERE playlist_id = $1
          AND NOT (video_id = ANY($2::int[]))`,
      [guidePlaylistId, guideVideoIds]
    );
    await client.query(
      `DELETE FROM tv_channel_videos
        WHERE channel_id = $1
          AND NOT (id = ANY($2::int[]))`,
      [guideChannelId, guideVideoIds]
    );
    results["guide_channel.catalog_items"] = guideVideoIds.length;

    // 8) Dial-number pins.  Executed in this order so a re-claim is
    //    a no-op: we only update when dial_number IS NULL.
    const pinDial = async (dial: number, channelId: number) => {
      // First clear the dial from any other channel (except the
      // target) so the unique index stays honest if an admin reshuffled
      // dials manually outside the boot path.
      await client.query(
        `UPDATE tv_channels SET dial_number = NULL
          WHERE dial_number = $1 AND id <> $2`,
        [dial, channelId]
      );
      await client.query(
        `UPDATE tv_channels SET dial_number = $1, updated_at = NOW()
          WHERE id = $2 AND (dial_number IS DISTINCT FROM $1)`,
        [dial, channelId]
      );
    };

    // dial 1 → opeculiar
    const opRes = await client.query<{ id: number }>(
      `SELECT ch.id
         FROM tv_channels ch
         JOIN users u ON u.id = ch.owner_user_id
        WHERE LOWER(u.username) = LOWER($1)
        ORDER BY ch.id ASC
        LIMIT 1`,
      [OPECULIAR_USERNAME]
    );
    if (opRes.rows.length > 0) {
      await pinDial(OPECULIAR_DIAL, opRes.rows[0]!.id);
      results[`dial.${OPECULIAR_DIAL}`] = opRes.rows[0]!.id;
    }

    // dial 2 → yoeshi
    const yoRes = await client.query<{ id: number }>(
      `SELECT ch.id
         FROM tv_channels ch
         JOIN users u ON u.id = ch.owner_user_id
        WHERE LOWER(u.username) = LOWER($1)
        ORDER BY ch.id ASC
        LIMIT 1`,
      [YOESHI_USERNAME]
    );
    if (yoRes.rows.length > 0) {
      await pinDial(YOESHI_DIAL, yoRes.rows[0]!.id);
      results[`dial.${YOESHI_DIAL}`] = yoRes.rows[0]!.id;
    }

    // dial 3 → whatever WTF TV config says, with a sensible fallback
    //    to paulwhoisaghost's canonical WTF TV channel if the admin
    //    hasn't pinned one explicitly via tv_wtf_channel_config.
    let wtfChannelId: number | null = null;
    const wtfRes = await client.query<{
      id: number;
      channel_id: number | null;
      enabled: boolean;
      updated_at: string | null;
    }>(
      `SELECT id, channel_id, enabled, updated_at
         FROM tv_wtf_channel_config`
    );
    const preferredConfig = pickPreferredWtfChannelConfig(
      wtfRes.rows.map((row) => ({
        id: row.id,
        channelId: row.channel_id,
        enabled: row.enabled,
        updatedAt: row.updated_at,
      }))
    );
    if (preferredConfig?.channelId) {
      wtfChannelId = preferredConfig.channelId;
    } else {
      const fallback = await client.query<{ id: number }>(
        `SELECT ch.id
           FROM tv_channels ch
           JOIN users u ON u.id = ch.owner_user_id
          WHERE LOWER(u.username) = LOWER($1)
            AND (
                LOWER(ch.slug)  = LOWER($2)
             OR LOWER(ch.title) = LOWER($3)
            )
          ORDER BY (LOWER(ch.slug) = LOWER($2)) DESC,
                   (LOWER(ch.title) = LOWER($3)) DESC,
                   ch.id ASC
          LIMIT 1`,
        [WTF_TV_OWNER_USERNAME, WTF_TV_CANONICAL_SLUG, WTF_TV_CANONICAL_TITLE]
      );
      if (fallback.rows.length > 0) {
        wtfChannelId = fallback.rows[0]!.id;
        // Mirror the fallback into tv_wtf_channel_config so the game
        // show sync/feed layer also uses the same channel.  Creates a
        // disabled row if none exists — admin flips `enabled=true`
        // later from the admin UI.
        await client.query(
          `INSERT INTO tv_wtf_channel_config (channel_id, enabled, updated_at)
           SELECT $1, false, NOW()
            WHERE NOT EXISTS (SELECT 1 FROM tv_wtf_channel_config)`,
          [wtfChannelId]
        );
        await client.query(
          `UPDATE tv_wtf_channel_config
              SET channel_id = $1,
                  updated_at = NOW()
            WHERE channel_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM tv_wtf_channel_config WHERE channel_id IS NOT NULL
              )`,
          [wtfChannelId]
        );
      }
    }
    if (wtfChannelId) {
      await pinDial(WTF_TV_DIAL, wtfChannelId);
      results[`dial.${WTF_TV_DIAL}`] = wtfChannelId;
    }

    // dial 69 → admin platform channel
    await pinDial(PLATFORM_DIAL, platformChannelId);
    results[`dial.${PLATFORM_DIAL}`] = platformChannelId;

    // 9) Auto-assign dial numbers to brand-new channels only.  Dials
    //    are sticky: once a channel owns a slot it keeps it forever,
    //    and a deleted channel's dial is never recycled to anyone
    //    else.  A small monotonic counter (`tv_dial_counter`) records
    //    the highest auto-dial ever issued so future assignments
    //    always step past it, even if the corresponding channel was
    //    later deleted.
    const RESERVED_DIALS_LIST = [
      OPECULIAR_DIAL,
      YOESHI_DIAL,
      WTF_TV_DIAL,
      PLATFORM_DIAL,
    ];
    const reservedSet = new Set<number>(RESERVED_DIALS_LIST);

    // Counter table: single-row, only ever moves forward.  Initialize
    // it on first boot to MAX(currently-assigned auto-dial), so the
    // existing dial layout is preserved verbatim.
    await client.query(
      `CREATE TABLE IF NOT EXISTS tv_dial_counter (
         id          smallint PRIMARY KEY DEFAULT 1,
         next_dial   integer  NOT NULL,
         updated_at  timestamptz NOT NULL DEFAULT NOW(),
         CHECK (id = 1)
       )`
    );
    const seedRow = await client.query<{ max_auto: number | null }>(
      `SELECT MAX(dial_number) AS max_auto
         FROM tv_channels
        WHERE dial_number IS NOT NULL
          AND dial_number <> ALL ($1::int[])`,
      [RESERVED_DIALS_LIST]
    );
    const seedNext = Math.max(4, (seedRow.rows[0]?.max_auto ?? 3) + 1);
    await client.query(
      `INSERT INTO tv_dial_counter (id, next_dial, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE
          SET next_dial  = GREATEST(tv_dial_counter.next_dial, EXCLUDED.next_dial),
              updated_at = NOW()`,
      [seedNext]
    );

    const rest = await client.query<{ id: number }>(
      `SELECT id FROM tv_channels
        WHERE dial_number IS NULL
        ORDER BY created_at ASC, id ASC`
    );
    if (rest.rows.length > 0) {
      let assigned = 0;
      for (const row of rest.rows) {
        // Pull the next dial off the counter, advancing past any
        // reserved value (1/2/3/69) so we never collide with a
        // pinned slot.  Each assignment commits the new high-water
        // mark immediately so a crash mid-loop can't reuse a dial.
        let next: number;
        for (;;) {
          const counter = await client.query<{ next_dial: number }>(
            `UPDATE tv_dial_counter
                SET next_dial = next_dial + 1,
                    updated_at = NOW()
              WHERE id = 1
              RETURNING next_dial - 1 AS next_dial`
          );
          const candidate = counter.rows[0]!.next_dial;
          if (!reservedSet.has(candidate)) {
            next = candidate;
            break;
          }
        }
        await client.query(
          `UPDATE tv_channels
              SET dial_number = $1,
                  updated_at  = NOW()
            WHERE id = $2`,
          [next, row.id]
        );
        assigned++;
      }
      results["dial.auto_assigned"] = assigned;
    }

    // 10) Defensive orphan sweep.  Drops playlist items whose video
    //    pointer still references a channel-video that got orphaned
    //    before the FK cascade existed.  The migration runs the same
    //    sweep; we repeat here so a re-boot after manual surgery also
    //    self-heals.
    const sweep = await client.query<{ count: string }>(
      `WITH gone AS (
         DELETE FROM tv_playlist_items pi
          USING tv_channel_videos cv
          LEFT JOIN user_media_library uml
                 ON uml.id = cv.media_item_id
          WHERE pi.video_id = cv.id
            AND cv.media_item_id IS NOT NULL
            AND uml.id IS NULL
         RETURNING pi.id
       )
       SELECT count(*)::text AS count FROM gone`
    );
    results["orphan_playlist_items_pruned"] = Number(sweep.rows[0]?.count || 0);

    console.log("[tv-backfill]", results);
  } catch (err) {
    console.warn("[tv-backfill] non-fatal boot backfill error:", err);
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", TV_BOOT_BACKFILL_LOCK)
        .catch((err) => console.warn("[tv-backfill] failed to release boot lock:", err));
    }
    client.release();
  }
}
