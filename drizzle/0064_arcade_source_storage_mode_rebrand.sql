-- Rebrand source-import storage and audit labels under WTF Arcade ownership.
-- Legacy values remain readable in code as compatibility/provenance evidence.

UPDATE console_games
SET storage_mode = 'arcade_source_proxy',
    sdk_version = CASE
      WHEN sdk_version = 'hackcade-compat-v1' THEN 'arcade-source-compat-v1'
      ELSE sdk_version
    END,
    updated_at = NOW()
WHERE storage_mode = 'hackcade_proxy';

UPDATE console_game_versions cgv
SET sdk_version = CASE
      WHEN cgv.sdk_version = 'hackcade-compat-v1' THEN 'arcade-source-compat-v1'
      ELSE cgv.sdk_version
    END
WHERE cgv.sdk_version = 'hackcade-compat-v1'
   OR EXISTS (
     SELECT 1
     FROM console_games cg
     WHERE cg.id = cgv.game_id
       AND cg.storage_mode = 'arcade_source_proxy'
   );

UPDATE console_audit_events
SET action = CASE
  WHEN action = 'hackcade_import' THEN 'arcade_source_import'
  WHEN action = 'hackcade_update' THEN 'arcade_source_update'
  ELSE action
END
WHERE action IN ('hackcade_import', 'hackcade_update');
