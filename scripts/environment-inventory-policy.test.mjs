import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEnvironmentInventory } from "./generate-environment-inventory.mjs";

test("generated environment inventory exposes the required governance fields", async () => {
  const generated = await buildEnvironmentInventory();
  assert.match(generated, /\| Variable \| Owner \| Scope \| Default \| Secret \| Validation \| Lifecycle \| References \|/);
  assert.match(generated, /`DATABASE_URL`/);
  assert.match(generated, /`VITE_[A-Z0-9_]+`/);
  assert.match(generated, /secret value intentionally omitted/);
  assert.doesNotMatch(generated, /\| `SESSION_SECRET` \|[^\n]*changeme/i);
  assert.match(generated, /\| `DATABASE_URL` \|[^\n]*\| none \(secret value intentionally omitted\) \| yes \|/);
  assert.doesNotMatch(generated, /\| `CORS_ALLOWED_ORIGINS` \|[^\n]*TRUST_PROXY=/);
});

test("checked-in environment inventory equals the deterministic generator", async () => {
  const generated = await buildEnvironmentInventory();
  assert.equal(readFileSync("docs/reference/environment-variables.md", "utf8"), generated);
});
