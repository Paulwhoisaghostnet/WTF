import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./shadownet-chease-proof-e2e.ts", import.meta.url), "utf8");

test("CH-EASE proof is role-correct and never claims a contract or token", () => {
  assert.match(source, /role: "preparation"/);
  assert.match(source, /contracts: \[\]/);
  assert.match(source, /operations: \[\]/);
  assert.match(source, /tokens: \[\]/);
  assert.doesNotMatch(source, /contract\.originate|methodsObject\.(?:mint|create_token|open_mint)/);
});

test("CH-EASE proof drives the actual app through pin, export, and handoff", () => {
  assert.match(source, /creation-tools\/ch-ease\/index\.html/);
  assert.match(source, /#media-files/);
  assert.match(source, /#pin-media/);
  assert.match(source, /#download-json/);
  assert.match(source, /#download-archive/);
  assert.match(source, /#open-publisher/);
  assert.match(source, /Package handed to spaghetti/);
});

test("CH-EASE proof makes durable, independently verified evidence", () => {
  assert.match(source, /resolveIpfsProofConfig/);
  assert.match(source, /fetchPublicPin\(mediaGatewayUrl, PNG\)/);
  assert.match(source, /pinIpfsProofBytes/);
  assert.match(source, /retrievedSha256/);
  assert.match(source, /ipfsUri/);
  assert.match(source, /gatewayUrl/);
});

test("CH-EASE proof captures assembler-ready UI-LIVE stages and a non-secret manifest", () => {
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /capturePastaProofStage/g);
  assert.match(source, /manifestSidecarArtifact/);
  assert.match(source, /manifestScreenshot/);
  assert.match(source, /schema: PROOF_SCHEMA/);
  assert.doesNotMatch(source, /pinata-jwt[^\n]*(?:value|fill)\s*[:=(]/i);
});

test("CH-EASE proof is explicit, Shadownet-only, and uses a loopback Kubo proxy", () => {
  assert.match(source, /PASTA_SHADOWNET_E2E_EXECUTE/);
  assert.match(source, /assert\.notEqual\([^;]*mainnet/s);
  assert.match(source, /server\.listen\(0, "127\.0\.0\.1"\)/);
  assert.match(source, /\/ipfs-api\/api\/v0\/add/);
  assert.match(source, /probeRpcChainId/);
});
