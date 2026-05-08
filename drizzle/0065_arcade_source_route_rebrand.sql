-- Move any remaining stored source-import runtime paths onto the WTF Arcade
-- source proxy route. Code keeps legacy compatibility readable, but catalog
-- DTOs should not keep emitting old Console source routes.

UPDATE console_games
SET
  embed_path = replace(
    replace(embed_path, '/api/console/hackcade/', '/api/arcade/source/'),
    'hackcadeSlug=',
    'sourceSlug='
  ),
  cover_uri = CASE
    WHEN cover_uri IS NULL THEN NULL
    ELSE replace(cover_uri, '/api/console/hackcade/', '/api/arcade/source/')
  END,
  updated_at = NOW()
WHERE storage_mode IN ('hackcade_proxy', 'arcade_source_proxy')
  AND (
    embed_path LIKE '/api/console/hackcade/%'
    OR embed_path LIKE '%hackcadeSlug=%'
    OR cover_uri LIKE '/api/console/hackcade/%'
  );

UPDATE console_game_versions cgv
SET artifact_uri = replace(
    replace(cgv.artifact_uri, '/api/console/hackcade/', '/api/arcade/source/'),
    'hackcadeSlug=',
    'sourceSlug='
  )
FROM console_games cg
WHERE cg.id = cgv.game_id
  AND cg.storage_mode IN ('hackcade_proxy', 'arcade_source_proxy')
  AND (
    cgv.artifact_uri LIKE '/api/console/hackcade/%'
    OR cgv.artifact_uri LIKE '%hackcadeSlug=%'
  );
