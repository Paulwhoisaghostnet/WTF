import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObjktHolderIdentityQuery,
  normalizeObjktHolderIdentityRows,
} from "./tezos-identity";

const CREATOR = "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V";

test("buildObjktHolderIdentityQuery creates a bounded address lookup", () => {
  const payload = buildObjktHolderIdentityQuery([
    CREATOR,
    CREATOR,
    "not-an-address",
  ]);

  assert.match(payload.query, /ObjktHolderIdentities/);
  assert.match(payload.query, /holder/);
  assert.deepEqual(payload.variables.addresses, [CREATOR]);
});

test("normalizeObjktHolderIdentityRows dedupes holders and ignores address aliases", () => {
  assert.deepEqual(
    normalizeObjktHolderIdentityRows([
      { address: CREATOR, alias: "Melon" },
      { address: CREATOR, alias: "Duplicate" },
      { address: "not-an-address", alias: "Nope" },
      { address: "tz1Qw6XZ7KQ9QKQ9QKQ9QKQ9QKQ9QKQ9QKQ9", alias: CREATOR },
    ]),
    [
      {
        address: CREATOR,
        displayName: "Melon",
        label: null,
        alias: "Melon",
        tezosDomain: null,
        source: "objkt_holder",
        isFallback: false,
      },
    ]
  );
});
