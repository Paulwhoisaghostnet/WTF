ALTER TABLE "studio_projects"
ADD COLUMN IF NOT EXISTS "workflow" jsonb
DEFAULT '{"phase":"concept","useCase":"artwork","targetNetwork":"shadownet","checklist":{},"references":{}}'::jsonb
NOT NULL;
