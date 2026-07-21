import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ParameterSchema } from "@taquito/michelson-encoder";
import { MichelsonMap } from "@taquito/taquito";

const source = await readFile(new URL("./shadownet-macaroni-e2e.ts", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(
    new URL("../../public/creation-tools/macaroni/contract/macaroni-v2.template.json", import.meta.url),
    "utf8",
  ),
);
const contractArtifact = JSON.parse(
  await readFile(
    new URL("../../public/creation-tools/macaroni/contract/macaroni-v2.contract.json", import.meta.url),
    "utf8",
  ),
);

test("Macaroni proof targets the current V2 artifact", () => {
  assert.equal(manifest.templateVersion, "macaroni-editions-v2");
  assert.equal(
    manifest.compiledContract,
    "public/creation-tools/macaroni/contract/macaroni-v2.contract.json",
  );
  assert.match(source, /macaroni-v2\.contract\.json/);
  assert.match(source, /manifest\.templateVersion, "macaroni-editions-v2"/);
  for (const entrypoint of ["add_tokens_v2", "set_stages", "mint", "reveal"]) {
    assert.match(source, new RegExp(`annotations\\.has\\(entrypoint\\)`));
    assert.ok(manifest.entrypoints.includes(entrypoint));
  }
});

test("Macaroni proof is explicitly enabled and fails closed outside Shadownet", () => {
  assert.match(source, /PASTA_SHADOWNET_E2E_EXECUTE/);
  assert.match(source, /explicit execute flag is required/);
  assert.match(source, /configuredNetwork !== "shadownet"/);
  assert.match(source, /probeRpcChainId\(\)/);
  assert.match(source, /assertShadownet\(creatorTezos, "before Macaroni V2 origination"\)/);
  assert.match(source, /assertShadownet\(collectorTezos, "before Macaroni collector mint"\)/);
  assert.match(source, /assertShadownet\(collectorTezos, "before Macaroni collector reveal"\)/);
});

test("Macaroni proof checks estimates and both signer balances before any pin or send", () => {
  const estimate = source.indexOf("creatorTezos.estimate.originate");
  const fundingGate = source.indexOf("pre-write funding gate passed");
  const pin = source.indexOf("pinProofAssets(provider");
  const originate = source.indexOf("creatorTezos.contract.originate");
  assert.ok(estimate > 0);
  assert.ok(fundingGate > estimate);
  assert.ok(pin > fundingGate);
  assert.ok(originate > pin);
  assert.match(source, /estimatedOriginationMutez \+ CREATOR_OPERATION_RESERVE_MUTEZ/);
  assert.match(source, /MINT_PRICE_MUTEZ \+ COLLECTOR_OPERATION_RESERVE_MUTEZ/);
  assert.match(source, /creator wallet is too underfunded for the RPC to estimate Macaroni origination/);
  assert.match(source, /tez\\\.subtraction_underflow/);
  assert.match(source, /no IPFS pin or chain write occurred/);
});

test("Macaroni proof requires real durable IPFS artifacts and verifies their bytes", () => {
  assert.match(source, /PASTA_SHADOWNET_IPFS_API_URL/);
  assert.match(source, /PASTA_SHADOWNET_PINATA_JWT/);
  assert.match(source, /fake CIDs and temporary HTTP files are rejected/);
  assert.match(source, /\/api\/v0\/add\?pin=true&cid-version=1/);
  assert.match(source, /pinFileToIPFS/);
  assert.match(source, /gateway bytes differ from pinned bytes/);
  assert.match(source, /ipfs:\/\/\$\{cid\}/);
  assert.doesNotMatch(source, /QmMacaroniV2(?:Contract|Placeholder)MetadataTemplate/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:jwt|Authorization)/i);
});

test("Macaroni proof exercises mint, exact wallet-limit rejection, and collector reveal", () => {
  assert.match(source, /\.add_tokens_v2\(/);
  assert.match(source, /quantity: 2/);
  assert.match(source, /max_per_wallet: 1/);
  assert.match(source, /\.mint\(1\)/);
  assert.match(source, /negative mint did not fail at WALLET_LIMIT/);
  assert.match(source, /collectorContract\.methodsObject\.reveal\(1\)/);
});

test("Macaroni proof lifecycle payloads encode against the current Michelson parameter", () => {
  const parameter = contractArtifact.find((node) => node.prim === "parameter")?.args?.[0];
  assert.ok(parameter);
  const schema = new ParameterSchema(parameter);
  const info = new MichelsonMap();
  info.set("", Buffer.from("data:application/json;base64,e30=", "utf8").toString("hex"));
  const stages = new MichelsonMap();
  stages.set(0, {
    start: new Date(Date.now() - 60_000).toISOString(),
    price: 1_000,
    use_allowlist: false,
    max_per_wallet: 1,
  });
  for (const [entrypoint, value] of [
    ["add_tokens_v2", [{ token_id: 0, token_info: info, quantity: 2 }]],
    ["set_stages", stages],
    ["mint", 1],
    ["reveal", 1],
  ]) {
    assert.ok(schema.EncodeObject({ [entrypoint]: value }), `${entrypoint} should encode`);
  }
});

test("Macaroni proof verifies TzKT contract, token, ownership, reveal, and metadata state", () => {
  assert.match(source, /\/contracts\/\$\{encodeURIComponent\(originated\.address\)\}/);
  assert.match(source, /\/tokens\?contract=\$\{encodeURIComponent\(originated\.address\)\}&tokenId=0/);
  assert.match(source, /\/tokens\/balances\?account=/);
  assert.match(source, /Number\(json\?\.revealed\) === 1/);
  assert.match(source, /Number\(json\?\.reveal_cursor\) === 1/);
  assert.match(source, /hexToUtf8\(String\(entry\?\.value\?\.token_info/);
  assert.match(source, /applied operation evidence/);
  assert.match(source, /operation\?\.hash === hash && operation\?\.parameter\?\.entrypoint === entrypoint/);
  assert.match(source, /shadownet-macaroni-e2e-report\.md/);
});
