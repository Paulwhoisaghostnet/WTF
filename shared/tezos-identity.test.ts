import assert from "node:assert/strict";
import test from "node:test";

import {
  bestTezosIdentityDisplay,
  extractTokenIdentityFields,
  shortTezosAddress,
} from "./tezos-identity";

const CREATOR = "tz1U7C2NVwbhdvG3fJixLLUWUyZHuXWNiF7V";

test("extractTokenIdentityFields keeps addresses out of creator display names", () => {
  const fields = extractTokenIdentityFields(
    {
      name: "Signal Garden",
      creators: [CREATOR],
      collection: { name: "Telemetry Flowers" },
      date: "2024-05-01T12:00:00Z",
    },
    null
  );

  assert.equal(fields.tokenName, "Signal Garden");
  assert.equal(fields.creatorName, null);
  assert.equal(fields.creatorAddress, CREATOR);
  assert.equal(fields.collectionName, "Telemetry Flowers");
  assert.equal(fields.mintedAtIso, "2024-05-01T12:00:00.000Z");
});

test("extractTokenIdentityFields accepts creator objects with aliases", () => {
  const fields = extractTokenIdentityFields({
    creators: [{ address: CREATOR, alias: "Melon" }],
    contractMetadata: { title: "Kitchen Sink Editions" },
  });

  assert.equal(fields.creatorName, "Melon");
  assert.equal(fields.creatorAddress, CREATOR);
  assert.equal(fields.collectionName, "Kitchen Sink Editions");
});

test("bestTezosIdentityDisplay prefers human identity fields over fallback addresses", () => {
  assert.equal(
    bestTezosIdentityDisplay({
      address: CREATOR,
      label: CREATOR,
      alias: "Melon",
      tezosDomain: "melon.tez",
    }),
    "melon.tez"
  );
  assert.equal(
    bestTezosIdentityDisplay({ address: CREATOR, label: CREATOR }),
    shortTezosAddress(CREATOR)
  );
  assert.equal(
    bestTezosIdentityDisplay({
      address: CREATOR,
      label: CREATOR,
      fallbackToShort: false,
    }),
    null
  );
});
