import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const harnesses = [
  { app: "spaghetti", file: "scripts/pasta-protocol/shadownet-spaghetti-e2e.ts" },
  { app: "gnocchi", file: "scripts/pasta-protocol/shadownet-gnocchi-e2e.ts" },
  { app: "penne", file: "scripts/pasta-protocol/shadownet-penne-e2e.ts" },
  { app: "lasagna", file: "scripts/pasta-protocol/shadownet-lasagna-e2e.ts" },
];

for (const harness of harnesses) {
  test(`${harness.app} pins and verifies durable IPFS evidence before origination`, () => {
    const source = readFileSync(harness.file, "utf8");
    assert.match(source, /pinIpfsProofBytes/);
    assert.match(source, /pinIpfsProofJson/);
    assert.match(source, /resolveIpfsProofConfig/);
    assert.doesNotMatch(source, /\bdataJsonUri\b|\bparseDataJsonUri\b|["'`]data:/);

    const main = source.slice(source.indexOf("async function main"));
    const configIndex = main.indexOf("const ipfs = resolveIpfsProofConfig()");
    const pinIndex = main.indexOf("await buildMetadata(");
    const originationIndex = main.indexOf(".contract.originate(");
    assert.ok(configIndex >= 0, `${harness.app} must resolve Kubo configuration in main`);
    assert.ok(pinIndex > configIndex, `${harness.app} must pin only after resolving Kubo configuration`);
    assert.ok(originationIndex > pinIndex, `${harness.app} must finish pins before origination`);

    assert.match(source, /CID \\`\$\{pin\.cid\}\\`/);
    assert.match(source, /\$\{pin\.uri\}/);
    assert.match(source, /\$\{pin\.publicGatewayUrl\}/);
    assert.match(source, /SHA-256 \\`\$\{pin\.sha256\}\\`/);
    assert.match(source, /assert\.(?:deepEqual|equal)\([^;]*\.uri/s);
  });
}

test("Gnocchi pins three artifacts and metadata for every token in its one-contract policy proof", () => {
  const source = readFileSync("scripts/pasta-protocol/shadownet-gnocchi-e2e.ts", "utf8");
  for (const fileName of [
    "gnocchi-timed-oe.txt",
    "gnocchi-forever-oe.txt",
    "gnocchi-limited-edition.txt",
    "gnocchi-collection.json",
  ]) {
    assert.match(source, new RegExp(fileName.replaceAll(".", "\\.")));
  }
  assert.match(source, /fileName: `gnocchi-token-\$\{index\}\.json`/);
  assert.match(source, /tokenUris: tokenPins\.map\(\(pin\) => pin\.uri\)/);
  assert.match(source, /assert\.deepEqual\(indexedTokenUris, metadata\.pins\.tokens\.map/);
});

test("Lasagna remains a registry and reports all durable revision/reference evidence", () => {
  const source = readFileSync("scripts/pasta-protocol/shadownet-lasagna-e2e.ts", "utf8");
  assert.doesNotMatch(source, /methodsObject\.(?:create_token|mint|open_mint)\b/);
  assert.match(source, /exhibition registry; it did not mint or claim to mint an FA2 artwork token/);
  assert.match(source, /lasagna-collection\.json/);
  assert.match(source, /lasagna-revision-0\.json/);
  assert.match(source, /lasagna-revision-1\.json/);
  assert.match(source, /referenceArtifacts: items\.map/);
  assert.match(source, /metadata\.pins\.artifacts\.map/);
});
