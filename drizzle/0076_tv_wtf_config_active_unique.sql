WITH ranked_active_configs AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY
        (channel_id IS NOT NULL) DESC,
        updated_at DESC NULLS LAST,
        id DESC
    ) AS rank
  FROM "tv_wtf_channel_config"
  WHERE "enabled" = true
)
UPDATE "tv_wtf_channel_config" AS config
SET
  "enabled" = false,
  "updated_at" = now()
FROM ranked_active_configs AS ranked
WHERE
  config."id" = ranked."id"
  AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "tv_wtf_channel_config_one_enabled_idx"
  ON "tv_wtf_channel_config" ("enabled")
  WHERE "enabled" = true;
