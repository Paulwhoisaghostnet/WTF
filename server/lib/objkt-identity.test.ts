import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObjktXHolderQuery,
  normalizeObjktIdentityRows,
  normalizeXHandle,
  OBJKT_IDENTITY_SOURCE,
} from "./objkt-identity";

test("normalizeXHandle accepts handles and X profile URLs", () => {
  assert.equal(normalizeXHandle("@Melon_Dog"), "melon_dog");
  assert.equal(normalizeXHandle("https://x.com/melon_dog/status/123"), "melon_dog");
  assert.equal(normalizeXHandle("https://twitter.com/MELON_DOG"), "melon_dog");
  assert.equal(normalizeXHandle("bad handle"), null);
});

test("buildObjktXHolderQuery creates bounded holder twitter search", () => {
  const payload = buildObjktXHolderQuery("@melon_dog");
  assert.match(payload.query, /holder/);
  assert.match(payload.query, /limit: 25/);
  assert.equal(payload.variables.handle, "melon_dog");
  assert.equal(payload.variables.atHandle, "@melon_dog");
  assert.equal(payload.variables.xUrl, "%x.com/melon_dog%");
});

test("normalizeObjktIdentityRows returns deduped Tezos identity hints", () => {
  const rows = [
    {
      address: "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V",
      alias: "Melon",
      twitter: "https://x.com/melon_dog",
    },
    {
      address: "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V",
      name: "Duplicate",
      twitter: "@melon_dog",
    },
    { address: "not-an-address", alias: "Nope", twitter: "@melon_dog" },
  ];

  assert.deepEqual(normalizeObjktIdentityRows(rows, "melon_dog"), [
    {
      twitterHandle: "melon_dog",
      tezosAddress: "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V",
      alias: "Melon",
      tzDomain: null,
      source: OBJKT_IDENTITY_SOURCE,
      confidence: "profile_link",
      raw: {
        objktTwitter: "https://x.com/melon_dog",
        objktAlias: "Melon",
        objktName: null,
      },
    },
  ]);
});
