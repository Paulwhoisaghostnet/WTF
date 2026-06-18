import assert from "node:assert/strict";
import test from "node:test";
import { validateCheasePackage } from "@shared/pasta-protocol";
import {
  collectionPackageFromSource,
  singleTokenPackageFromSource,
  tokenItemFromSource,
  type CheaseSourceItem,
} from "./build-package";

const item: CheaseSourceItem = {
  tokenId: 0,
  tokenName: "First",
  tokenDescription: "desc",
  mimeType: "image/png",
  mediaCid: "Qmcid",
  previewCid: null,
  tags: ["a", "b"],
  attributes: [{ name: "Color", value: "Red" }],
};

test("tokenItemFromSource maps cids to ipfs uris and preserves fields", () => {
  const mapped = tokenItemFromSource(item);
  assert.equal(mapped.name, "First");
  assert.equal(mapped.tokenId, 0);
  assert.equal(mapped.artifactUri, "ipfs://Qmcid");
  assert.equal(mapped.previewUri, undefined);
  assert.equal(mapped.mimeType, "image/png");
  assert.deepEqual(mapped.tags, ["a", "b"]);
  assert.deepEqual(mapped.attributes, [{ name: "Color", value: "Red" }]);
});

test("tokenItemFromSource keeps an already-ipfs uri as-is", () => {
  const mapped = tokenItemFromSource({ ...item, mediaCid: "ipfs://AlreadyUri" });
  assert.equal(mapped.artifactUri, "ipfs://AlreadyUri");
});

test("collectionPackageFromSource builds a valid collection package for Spaghetti", () => {
  const pkg = collectionPackageFromSource(
    "spaghetti",
    { title: "My Collection", description: "c", symbol: "WTF", coverCid: "QmCover" },
    [item, { tokenId: 1, tokenName: "Second", mediaCid: "Qm2" }],
    { parent_contract: "KT1Parent" }
  );
  assert.equal(pkg.kind, "collection");
  assert.equal(pkg.targetApp, "spaghetti");
  assert.equal(pkg.title, "My Collection");
  assert.equal(pkg.coverImageUri, "ipfs://QmCover");
  assert.equal(pkg.items.length, 2);
  assert.deepEqual(pkg.relationship, { parent_contract: "KT1Parent" });
  assert.deepEqual(validateCheasePackage(pkg), { ok: true, errors: [] });
});

test("singleTokenPackageFromSource builds a valid single-token package", () => {
  const pkg = singleTokenPackageFromSource("gnocchi", item);
  assert.equal(pkg.kind, "single_token");
  assert.equal(pkg.targetApp, "gnocchi");
  assert.equal(pkg.token.name, "First");
  assert.deepEqual(validateCheasePackage(pkg), { ok: true, errors: [] });
});
