import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildEnvironmentInventory,
  listEnvironmentSourceFiles,
} from "./generate-environment-inventory.mjs";

test("environment inventory scans tracked and non-ignored untracked release inputs", async () => {
  const eligible = new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  );
  const sources = await listEnvironmentSourceFiles();

  assert.ok(sources.length > 0);
  for (const source of sources) {
    const relative = path.relative(process.cwd(), source).split(path.sep).join("/");
    assert.ok(eligible.has(relative), `ignored inventory source: ${relative}`);
  }

  const generatorSource = readFileSync("scripts/generate-environment-inventory.mjs", "utf8");
  assert.match(generatorSource, /"ls-files",\s*"--cached",\s*"--others",\s*"--exclude-standard"/);
});

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
