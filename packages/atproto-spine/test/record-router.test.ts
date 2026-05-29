import { test } from "node:test";
import assert from "node:assert/strict";
import { routeRecordToDomains, primaryDomainFor, groupWritesByDomain } from "../src/record-router";
import type { SpineRoutingRule } from "../src/types";

const rules: SpineRoutingRule[] = [
  { typePrefix: "app.wtfos.social.", domain: "social" },
  { typePrefix: "app.wtfos.social.board.", domain: "social-board" },
  { typePrefix: "app.wtfos.media.", domain: "media" },
];

test("longest-prefix wins as the primary domain", () => {
  assert.equal(primaryDomainFor("app.wtfos.social.board.post", rules), "social-board");
  assert.equal(primaryDomainFor("app.wtfos.social.profile", rules), "social");
  assert.equal(primaryDomainFor("app.wtfos.media.echo", rules), "media");
});

test("a type can match multiple overlapping rules, deduped, most-specific first", () => {
  assert.deepEqual(routeRecordToDomains("app.wtfos.social.board.post", rules), ["social-board", "social"]);
});

test("no match returns empty / undefined", () => {
  assert.deepEqual(routeRecordToDomains("app.wtfos.arcade.score", rules), []);
  assert.equal(primaryDomainFor("app.wtfos.arcade.score", rules), undefined);
});

test("groupWritesByDomain fans a write out to every matched domain", () => {
  const groups = groupWritesByDomain(
    [
      { collection: "app.wtfos.social.board.post", rkey: "a", record: {} },
      { collection: "app.wtfos.media.echo", rkey: "b", record: {} },
    ],
    rules,
  );
  assert.deepEqual([...groups.get("social-board")!.map((w) => w.rkey)], ["a"]);
  assert.deepEqual([...groups.get("social")!.map((w) => w.rkey)], ["a"]);
  assert.deepEqual([...groups.get("media")!.map((w) => w.rkey)], ["b"]);
});
