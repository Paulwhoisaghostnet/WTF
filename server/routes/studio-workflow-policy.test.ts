import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("server/routes/studio.ts", "utf8");
const schemaSource = readFileSync("shared/schema-studio.ts", "utf8");
const migrationSource = readFileSync("drizzle/0115_studio_project_workflow.sql", "utf8");

test("Studio persists a shared creator lifecycle instead of browser-local project state", () => {
  assert.match(schemaSource, /workflow: jsonb\("workflow"\)/);
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS "workflow" jsonb/);
  assert.match(routeSource, /"\/api\/studio\/projects\/:id\/workflow"/);
  assert.match(routeSource, /studioRoleCanEditFiles\(resolved\.role\)/);
  assert.match(routeSource, /checklist: \{ \.\.\.current\.checklist/);
  assert.match(routeSource, /references: \{ \.\.\.current\.references/);
});

test("Studio workflow makes network and evidence boundaries explicit", () => {
  assert.match(routeSource, /STUDIO_PROJECT_NETWORKS/);
  assert.match(routeSource, /pinCid/);
  assert.match(routeSource, /contractAddress/);
  assert.match(routeSource, /liveRoomId/);
  assert.match(routeSource, /releaseUrl/);
  assert.match(routeSource, /studio\.workflow_updated/);
});
