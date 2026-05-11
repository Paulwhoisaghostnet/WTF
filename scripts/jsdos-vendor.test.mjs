import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOS_ASSETS, verifyAssetIntegrity } from "./jsdos-vendor.mjs";

test("js-dos vendor assets use immutable URLs and include sha256 checksums", () => {
  assert.ok(JSDOS_ASSETS.length > 0);
  for (const asset of JSDOS_ASSETS) {
    assert.match(asset.url, /^https:\/\/v8\.js-dos\.com\/8\./);
    assert.doesNotMatch(asset.url, /\/latest\//);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test("verifyAssetIntegrity fails closed on checksum mismatch", () => {
  assert.equal(
    verifyAssetIntegrity(
      Buffer.from("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    ),
    true
  );
  assert.throws(
    () => verifyAssetIntegrity(Buffer.from("abc"), "0".repeat(64)),
    /checksum mismatch/
  );
});

test("checked-in js-dos assets match their pinned integrity", () => {
  for (const asset of JSDOS_ASSETS) {
    const bytes = readFileSync(path.join("public/games/_vendor/js-dos", asset.rel));
    assert.equal(verifyAssetIntegrity(bytes, asset.sha256, asset.rel), true);
  }
});
