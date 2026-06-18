import assert from "node:assert/strict";
import test from "node:test";
import * as ts from "../../shared/pasta-protocol/index.ts";
import * as js from "../../public/creation-tools/spaghetti/js/pasta-foundation.js";

const tokenInputs = [
  { name: "Solo", artifactUri: "ipfs://a", mimeType: "image/png" },
  {
    name: "  Rich  ",
    description: "d",
    symbol: "WTF",
    decimals: 0,
    artifactUri: " ipfs://art ",
    displayUri: "ipfs://disp",
    thumbnailUri: "",
    mimeType: "image/gif",
    creators: ["tz1A", "tz1A", " tz1B "],
    minter: " tz1M ",
    tags: ["x", "x", " y "],
    attributes: [
      { name: "Color", value: "Red" },
      { name: "  ", value: "skip" },
      { name: "Num", value: 7 },
    ],
    royalties: { decimals: 4, shares: { tz1A: 500 } },
    relationship: { parent_contract: " KT1P ", related_contracts: ["KT1A", "KT1A"] },
    extra: { custom: "ns" },
  },
  { name: "NoMedia", isBooleanAmount: true },
];

const collectionInputs = [
  { name: "Coll", imageUri: "ipfs://cover", relationship: { collection_group: "grp" } },
  {
    name: "Coll2",
    description: "c",
    symbol: "S",
    version: "1.0",
    license: { name: "MIT" },
    authors: ["tz1A", "tz1A"],
    homepage: " https://x ",
    interfaces: ["TZIP-012", "TZIP-012"],
    extra: { foo: "bar" },
  },
];

const relationshipInputs = [
  undefined,
  {},
  { parent_contract: "   " },
  { parent_contract: " KT1P ", related_contracts: ["KT1A", " ", "KT1A", "KT1B"], ownership_chain: ["tz1W", "KT1P"] },
];

const collectionPackageInputs = [
  { targetApp: "spaghetti", title: " My Coll ", coverImageUri: "ipfs://c", items: [{ name: " A ", tags: ["x", "x"] }, { name: "B", tokenId: 2 }] },
  { targetApp: "gnocchi", title: "Empty", items: [], relationship: { parent_contract: "KT1P" } },
];

const singleTokenPackageInputs = [
  { targetApp: "spaghetti", token: { name: "Solo", artifactUri: "ipfs://s", mimeType: "image/png" } },
  { targetApp: "lasagna", token: { name: " Ref ", tokenId: 9 }, relationship: { franchise_contract: "KT1F" } },
];

const validationInputs = [
  null,
  { schemaVersion: "nope", kind: "collection", targetApp: "spaghetti", title: "T", items: [] },
  { schemaVersion: ts.CHEASE_PACKAGE_SCHEMA_VERSION, kind: "single_token", targetApp: "macaroni", token: { name: "x" } },
  { schemaVersion: ts.CHEASE_PACKAGE_SCHEMA_VERSION, kind: "collection", targetApp: "spaghetti", title: "T", items: [{ name: "" }, { name: "ok", tokenId: "nope" }] },
  { schemaVersion: ts.CHEASE_PACKAGE_SCHEMA_VERSION, kind: "weird", targetApp: "spaghetti" },
];

test("shared constants match between TS and JS", () => {
  assert.equal(js.CHEASE_PACKAGE_SCHEMA_VERSION, ts.CHEASE_PACKAGE_SCHEMA_VERSION);
  assert.equal(js.RELATIONSHIP_METADATA_KEY, ts.RELATIONSHIP_METADATA_KEY);
});

test("buildTokenMetadata parity", () => {
  for (const input of tokenInputs) {
    assert.deepEqual(js.buildTokenMetadata(input), ts.buildTokenMetadata(input), JSON.stringify(input));
  }
});

test("buildCollectionMetadata parity", () => {
  for (const input of collectionInputs) {
    assert.deepEqual(js.buildCollectionMetadata(input), ts.buildCollectionMetadata(input), JSON.stringify(input));
  }
});

test("sanitizeRelationshipMetadata parity", () => {
  for (const input of relationshipInputs) {
    assert.deepEqual(js.sanitizeRelationshipMetadata(input), ts.sanitizeRelationshipMetadata(input), JSON.stringify(input));
  }
});

test("buildCollectionPackage parity", () => {
  for (const input of collectionPackageInputs) {
    assert.deepEqual(js.buildCollectionPackage(input), ts.buildCollectionPackage(input), JSON.stringify(input));
  }
});

test("buildSingleTokenPackage parity", () => {
  for (const input of singleTokenPackageInputs) {
    assert.deepEqual(js.buildSingleTokenPackage(input), ts.buildSingleTokenPackage(input), JSON.stringify(input));
  }
});

test("validateCheasePackage parity", () => {
  for (const input of validationInputs) {
    assert.deepEqual(js.validateCheasePackage(input), ts.validateCheasePackage(input), JSON.stringify(input));
  }
  for (const input of [...collectionPackageInputs.map(js.buildCollectionPackage), ...singleTokenPackageInputs.map(js.buildSingleTokenPackage)]) {
    assert.deepEqual(js.validateCheasePackage(input), ts.validateCheasePackage(input));
  }
});

test("isPastaAppId parity", () => {
  for (const id of ["spaghetti", "colander", "macaroni", "", 42, null]) {
    assert.equal(js.isPastaAppId(id), ts.isPastaAppId(id), String(id));
  }
});

const curveInputs = [
  { base_price: 1000000, increment: 0 },
  { base_price: 1000000, increment: 250000, step_size: 5 },
  { base_price: 500000, increment: -50000, minimum_price: 100000 },
  { base_price: 1000000, increment: 1000000, maximum_price: 3000000, step_size: 2 },
  { base_price: 0, increment: 100000 },
];

const recipientTexts = [
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb, 2\ntz1burnburnburnburnburnburnburjAYjjX",
  "# comment\n\nKT1TxqZ8QtKvLu3V3JH7Gx58n7Co8pgtpQU,5\nnot-an-address, 3\ntz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb, 0",
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb\ttz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb, 9",
  "",
];

test("recipient list parsing parity", () => {
  for (const text of recipientTexts) {
    assert.deepEqual(js.parseRecipientList(text), ts.parseRecipientList(text), JSON.stringify(text));
    assert.deepEqual(js.parseRecipientList(text, 3), ts.parseRecipientList(text, 3), JSON.stringify(text));
  }
  for (const addr of ["tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", "KT1bad", "", "0x1234"]) {
    assert.equal(js.isTezosAddress(addr), ts.isTezosAddress(addr), addr);
  }
});

const refTexts = [
  "# show\nKT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, 0\nKT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, 7",
  "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, 0\nKT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, 0\ntz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb, 1\nKT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton, x",
  "",
];

test("exhibition reference parsing parity", () => {
  for (const text of refTexts) {
    assert.deepEqual(js.parseTokenReferences(text), ts.parseTokenReferences(text), JSON.stringify(text));
  }
});

test("exhibition metadata parity", () => {
  const input = {
    name: "Show One",
    description: "desc",
    statement: "a statement",
    curators: ["tz1aaa", "tz1aaa", "tz1bbb"],
    items: [
      { contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", token_id: 0 },
      { contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton", token_id: 7 },
    ],
    revision: 2,
  };
  assert.deepEqual(js.buildExhibitionMetadata(input), ts.buildExhibitionMetadata(input));
});

const genLayers = [
  { name: "Background", variants: [{ value: "Blue" }, { value: "Red", weight: 3 }, { value: "Gold", weight: 0.5 }] },
  { name: "Body", variants: [{ value: "Round" }, { value: "Square" }] },
  { name: "Eyes", variants: [{ value: "Open" }, { value: "Closed", weight: 2 }, { value: "Wink" }] },
];

test("generative engine parity", () => {
  for (const seed of ["alpha", "wtf-2026", 42, "x"]) {
    for (const opts of [{}, { unique: true }, { unique: true, maxAttempts: 8 }]) {
      assert.deepEqual(
        js.generateEditions(genLayers, 12, seed, opts),
        ts.generateEditions(genLayers, 12, seed, opts),
        JSON.stringify({ seed, opts })
      );
    }
  }
  assert.equal(js.maxCombinations(genLayers), ts.maxCombinations(genLayers));
  assert.equal(js.hashSeed("wtf-2026"), ts.hashSeed("wtf-2026"));
  const rngJs = js.mulberry32(js.hashSeed("seed"));
  const rngTs = ts.mulberry32(ts.hashSeed("seed"));
  for (let i = 0; i < 20; i++) assert.equal(rngJs(), rngTs());
});

const bundleInputs = [
  { name: " Pack ", members: [{ name: " A ", uri: "ipfs://a", tokenId: 3 }, { name: "", uri: "  " }, { tokenContract: "KT1X", tokenId: 2, quantity: 1 }] },
  { name: "Mystery", mystery: true, description: " hidden ", members: [], relationship: { parent_contract: " KT1P " } },
  { name: "", members: [{ quantity: -2, tokenId: 1.7 }] },
];

test("buildBundleManifest parity", () => {
  for (const input of bundleInputs) {
    assert.deepEqual(js.buildBundleManifest(input), ts.buildBundleManifest(input), JSON.stringify(input));
  }
  assert.equal(js.BUNDLE_MANIFEST_SCHEMA_VERSION, ts.BUNDLE_MANIFEST_SCHEMA_VERSION);
});

test("bonding-curve pricing parity", () => {
  for (const config of curveInputs) {
    for (const minted of [0, 1, 4, 5, 9, 10, 23]) {
      assert.equal(js.priceAtSupply(config, minted), ts.priceAtSupply(config, minted), JSON.stringify({ config, minted }));
      for (const amount of [1, 3, 0]) {
        assert.equal(
          js.costForBatch(config, minted, amount),
          ts.costForBatch(config, minted, amount),
          JSON.stringify({ config, minted, amount })
        );
      }
    }
    assert.deepEqual(js.validateBondingCurve(config), ts.validateBondingCurve(config), JSON.stringify(config));
  }
  const badConfigs = [
    null,
    { base_price: -1, increment: 0 },
    { base_price: 1.5, increment: 0 },
    { base_price: 1000, increment: 1.2 },
    { base_price: 1000, increment: 0, minimum_price: 5000, maximum_price: 1000 },
    { base_price: 1000, increment: 0, step_size: 0 },
  ];
  for (const config of badConfigs) {
    assert.deepEqual(js.validateBondingCurve(config), ts.validateBondingCurve(config), JSON.stringify(config));
  }
});
