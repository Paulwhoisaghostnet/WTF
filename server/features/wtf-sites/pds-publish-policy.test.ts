import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const siteService = readFileSync("server/features/wtf-sites/service.ts", "utf8");
const outbox = readFileSync("server/features/tz2at/wtfos-outbox.ts", "utf8");
const backgroundJobs = readFileSync("server/lib/background-jobs.ts", "utf8");
const renderer = readFileSync("scripts/wtfos-user-site-renderer.ts", "utf8");
const caddyAtproto = readFileSync("Caddyfile.wtfos-atproto", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");

test("user-site publish writes PDS-renderable snapshot and primary index records", () => {
  assert.match(siteService, /const snapshotCollection = "app\.wtfos\.identity\.siteSnapshot"/);
  assert.match(siteService, /type:\s*snapshotCollection/);
  assert.match(siteService, /type:\s*"app\.wtfos\.identity\.siteIndex"/);
  assert.match(siteService, /payload:\s*\{\s*pages:\s*pageSnapshots/s);
  assert.match(siteService, /snapshotCollection,/);
  assert.match(siteService, /targetType:\s*"primary_wtfos_repo"/);
  assert.match(siteService, /const sourceRefType = "wtf_user_site_version"/);
});

test("site-version outbox rows can flush immediately and also drain in background", () => {
  assert.match(outbox, /export async function publishQueuedWtfosOutboxForSource/);
  assert.match(outbox, /export async function listWtfosOutboxForSource/);
  assert.match(outbox, /eq\(wtfosAtprotoOutbox\.sourceRefId,\s*input\.sourceRefId\)/);
  assert.match(backgroundJobs, /WTFOS_ATPROTO_OUTBOX_PUBLISHER_JOB_NAME/);
  assert.match(backgroundJobs, /publishQueuedWtfosOutbox\(\{[\s\S]*limit:\s*WTFOS_ATPROTO_OUTBOX_PUBLISHER_LIMIT[\s\S]*\}\)/);
  assert.match(backgroundJobs, /scope:\s*"wtfos-atproto-outbox"/);
});

test("the staged .me renderer serves user sites from PDS records, not app DB pages", () => {
  assert.match(renderer, /app\.wtfos\.identity\.siteIndex/);
  assert.match(renderer, /app\.wtfos\.identity\.siteSnapshot/);
  assert.match(renderer, /com\.atproto\.repo\.getRecord/);
  assert.doesNotMatch(renderer, /DATABASE_URL|wtfUserSites|resolvePublishedPage/);
  assert.match(compose, /wtfos-user-site-renderer:/);
  assert.match(compose, /scripts\/wtfos-user-site-renderer\.ts/);
  assert.match(caddyAtproto, /reverse_proxy wtfos-user-site-renderer:3009/);
});
