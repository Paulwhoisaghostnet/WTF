import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = readFileSync("server/lib/backfill-manifest.ts", "utf8");
const dispatcher = readFileSync("server/lib/backfill-dispatcher.ts", "utf8");

test("backfill completion only transitions rows that are still in progress", () => {
  assert.match(manifest, /export async function complete\(id: number\): Promise<boolean>/);
  assert.match(manifest, /eq\(backfillManifest\.id, id\)/);
  assert.match(manifest, /eq\(backfillManifest\.status, "in_progress"\)/);
  assert.match(manifest, /return result\.length > 0/);
});

test("dispatcher preserves handler skip outcomes instead of overwriting them as completed", () => {
  assert.match(dispatcher, /await handler\(mine\)/);
  assert.match(dispatcher, /const completed = await complete\(mine\.id\)/);
  assert.match(dispatcher, /if \(completed\) ok \+= 1/);
  assert.match(dispatcher, /else skipped \+= 1/);
});
