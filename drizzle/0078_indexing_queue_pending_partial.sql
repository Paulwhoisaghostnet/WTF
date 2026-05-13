-- Make the queue uniqueness rule match its name and worker semantics:
-- only one pending row per target/kind. Historical done/error/processing rows
-- must not collide with recovery or retry bookkeeping.
DROP INDEX IF EXISTS "uq_indexing_queue_target_pending";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_indexing_queue_target_pending"
  ON "indexing_queue" ("target", "target_kind")
  WHERE "status" = 'pending';
