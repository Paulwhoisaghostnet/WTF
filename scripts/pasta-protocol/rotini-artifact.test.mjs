import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../public/creation-tools/rotini/js/rotini-artifact.js", import.meta.url), "utf8");
const context = vm.createContext({
  ArrayBuffer,
  Blob,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  crypto: globalThis.crypto,
});
context.globalThis = context;
vm.runInContext(source, context, { filename: "rotini-artifact.js" });
const artifacts = context.RotiniArtifacts;

function ascii(bytes) {
  return new TextDecoder().decode(bytes);
}

test("interactive ZIP contains a top-level runtime and no external dependencies", async () => {
  const built = await artifacts.buildInteractiveZip({
    name: "Offline proof",
    seed: "aabbcc",
    tokenId: 3,
    projectId: 1,
    width: 512,
    height: 512,
    traits: [{ layer: "Background", value: "Red" }],
    layers: [
      { name: "Background", mimeType: "image/png", data: Uint8Array.of(137, 80, 78, 71) },
      { name: "Foreground", mimeType: "image/gif", data: ascii(new TextEncoder().encode("GIF89a")) },
    ],
  });
  assert.equal(built.blob.type, "application/zip");
  assert.equal(built.validation.ok, true);
  assert.equal(built.validation.files[0].path, "index.html");
  assert.deepEqual(
    [...built.validation.files.map((file) => file.path)],
    ["index.html", "assets/layer-01.png", "assets/layer-02.gif", "rotini-manifest.json"],
  );
  const html = ascii(built.validation.files[0].data);
  assert.match(html, /<canvas id="art"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  const bytes = new Uint8Array(await built.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test("interactive package validator rejects external URLs, network APIs, and unsafe paths", () => {
  const result = artifacts.validateInteractiveFiles([
    { path: "index.html", data: '<script>fetch("https://example.com/code.js")</script>' },
    { path: "../escape.js", data: "" },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("external URL")));
  assert.ok(result.errors.some((error) => error.includes("network API")));
  assert.ok(result.errors.some((error) => error.includes("unsafe package path")));
});

test("GIF encoder produces a bounded animated GIF89a artifact", async () => {
  const red = { width: 2, height: 2, data: Uint8ClampedArray.from([
    255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
  ]) };
  const blue = { width: 2, height: 2, data: Uint8ClampedArray.from([
    0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
  ]) };
  const blob = artifacts.encodeGif([red, blue], { delayMs: 120 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type, "image/gif");
  assert.equal(ascii(bytes.slice(0, 6)), "GIF89a");
  assert.equal(bytes.at(-1), 0x3b);
  assert.equal(bytes.filter((byte) => byte === 0x2c).length >= 2, true);
  assert.equal(bytes.length < artifacts.MAX_ARTIFACT_BYTES, true);
});

test("trait selection is deterministic for an immutable reservation seed", () => {
  const manifest = {
    layers: [
      { name: "Background", variants: [{ value: "Red", weight: 1, artifactUri: "ipfs://red" }, { value: "Blue", weight: 1, artifactUri: "ipfs://blue" }] },
      { name: "Mark", variants: [{ value: "Circle", weight: 1, artifactUri: "ipfs://circle" }] },
    ],
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(artifacts.selectTraits(manifest, "0x1234"))),
    JSON.parse(JSON.stringify(artifacts.selectTraits(manifest, "0x1234"))),
  );
});

test("SHA-256 helper returns the exact 32-byte artifact digest", async () => {
  const digest = await artifacts.sha256(new Blob(["rotini"], { type: "text/plain" }));
  assert.equal(digest.bytes.length, 32);
  assert.equal(digest.hex.length, 64);
  assert.equal(digest.hex, "5e7e3cc0118a55eb2c01f7def2b471a446b815310320654fbba27e325c540c3f");
});
