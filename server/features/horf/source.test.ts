import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHorfEventVariables,
  HORF_CLOSED_EVENT_QUERY,
  HORF_EVENT_QUERY,
  HORF_METADATA_UPDATE_QUERY,
  HORF_TAG_QUERY,
  isLastHorfEventPage,
} from "./source";

test("Objkt source queries use stable cursors, full metadata, and direct transfer filters", () => {
  const variables = buildHorfEventVariables(76425265, "2026-11-01T00:00:00Z");
  assert.equal(variables.after, 76425265);
  assert.equal(variables.since, "2026-11-01T00:00:00Z");
  assert.equal(variables.limit, 100); // Live archive query with nested metadata failed at 500 and passed at 100.
  assert.match(HORF_EVENT_QUERY, /id:\s*\{ _gt: \$after \}/);
  assert.match(HORF_EVENT_QUERY, /order_by:\s*\{ id: asc \}/);
  assert.match(HORF_EVENT_QUERY, /marketplace_event_type:\s*\{ _is_null: true \}/);
  assert.match(HORF_EVENT_QUERY, /reverted:\s*\{ _eq: false \}/);
  assert.match(HORF_EVENT_QUERY, /creator_address/);
  assert.match(HORF_EVENT_QUERY, /\bophash\b/);
  assert.match(HORF_EVENT_QUERY, /recipient_address/);
  assert.match(HORF_EVENT_QUERY, /thumbnail_uri/);
  assert.match(HORF_EVENT_QUERY, /tags:\s*\{ tag:\s*\{ name:\s*\{ _iregex: \$candidate \}/);
  assert.doesNotMatch(HORF_EVENT_QUERY, /token:\s*\{\s*_or:/);
  assert.doesNotMatch(HORF_EVENT_QUERY, /description:\s*\{ _iregex: \$candidate \}/);
  assert.match(HORF_CLOSED_EVENT_QUERY, /timestamp:\s*\{ _gte: \$since, _lt: \$until \}/);
  assert.equal(buildHorfEventVariables(1, "2023-07-01T00:00:00Z", "2023-08-01T00:00:00Z").until, "2023-08-01T00:00:00Z");
  assert.match(HORF_TAG_QUERY, /token_count:\s*\{ _gt: 5 \}/);
  assert.match(HORF_METADATA_UPDATE_QUERY, /last_metadata_update:\s*\{ _gt: \$since \}/);
  assert.match(HORF_METADATA_UPDATE_QUERY, /timestamp:\s*\{ _lte: \$since \}/);
  assert.match(HORF_METADATA_UPDATE_QUERY, /tags:\s*\{ tag:\s*\{ name:\s*\{ _iregex: \$candidate \}/);
  assert.equal(isLastHorfEventPage(new Array(100).fill({})), false);
  assert.equal(isLastHorfEventPage([]), true);
});
