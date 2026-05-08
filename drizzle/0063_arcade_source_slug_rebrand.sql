-- Rebrand existing source-imported public Arcade slugs from legacy upstream
-- product-prefixed ids to WTF-owned Arcade ids. Score/session history remains
-- attached by game id, so only public identifiers and embedded runtime params move.
UPDATE console_games cg
SET
  slug = 'arcade-' || substring(cg.slug from 10),
  embed_path = replace(cg.embed_path, 'wtfGameSlug=hackcade-', 'wtfGameSlug=arcade-'),
  updated_at = NOW()
WHERE cg.storage_mode = 'hackcade_proxy'
  AND cg.slug LIKE 'hackcade-%'
  AND NOT EXISTS (
    SELECT 1
    FROM console_games existing
    WHERE existing.id <> cg.id
      AND existing.slug = 'arcade-' || substring(cg.slug from 10)
  );

UPDATE console_game_versions cgv
SET
  artifact_uri = replace(cgv.artifact_uri, 'wtfGameSlug=hackcade-', 'wtfGameSlug=arcade-')
FROM console_games cg
WHERE cg.id = cgv.game_id
  AND cg.storage_mode = 'hackcade_proxy'
  AND cgv.artifact_uri LIKE '%wtfGameSlug=hackcade-%';
