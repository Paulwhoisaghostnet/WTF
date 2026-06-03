import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWtfLiveSearch,
  isWtfLiveTab,
  parseWtfLiveSearchParams,
  WTF_LIVE_TAB_IDS,
} from "./wtf-live-nav";

test("isWtfLiveTab accepts canonical WTF LIVE tabs only", () => {
  for (const tab of WTF_LIVE_TAB_IDS) {
    assert.equal(isWtfLiveTab(tab), true);
  }
  assert.equal(isWtfLiveTab("account"), false);
  assert.equal(isWtfLiveTab(""), false);
});

test("parseWtfLiveSearchParams defaults to overview without query", () => {
  assert.deepEqual(parseWtfLiveSearchParams(""), {
    tab: "overview",
    room: null,
    stage: null,
  });
});

test("parseWtfLiveSearchParams reads tab room and stage slugs", () => {
  assert.deepEqual(parseWtfLiveSearchParams("?tab=rooms&room=wtf-live&stage=ignored"), {
    tab: "rooms",
    room: "wtf-live",
    stage: "ignored",
  });
  assert.deepEqual(parseWtfLiveSearchParams("?tab=stages&stage=wtf-stage"), {
    tab: "stages",
    room: null,
    stage: "wtf-stage",
  });
});

test("buildWtfLiveSearch omits overview tab and encodes active lane slug", () => {
  assert.equal(buildWtfLiveSearch({ tab: "overview" }), "");
  assert.equal(buildWtfLiveSearch({ tab: "skywire" }), "?tab=skywire");
  assert.equal(buildWtfLiveSearch({ tab: "rooms", room: "tezos-wire" }), "?tab=rooms&room=tezos-wire");
  assert.equal(buildWtfLiveSearch({ tab: "stages", stage: "wtf-stage" }), "?tab=stages&stage=wtf-stage");
});
