/** Prepare a Mainnet V3 plan without signing or injecting an operation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const oldStable = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const chainId = "NetXdQprcVkpaWU";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function verifiedArtifact(name, expected) {
  const bytes = readFileSync(path.join(here, "artifacts", name));
  assert.equal(sha(bytes), expected, `${name} differs from the compiled manifest`);
  return JSON.parse(bytes.toString("utf8"));
}

function replaceStorageField(type, value, oracleKey, seen) {
  const annots = type?.annots || [];
  if (annots.includes("%admin")) {
    assert.equal(type.prim, "address");
    value.string = admin;
    seen.admin++;
  }
  if (annots.includes("%oracle_key")) {
    assert.equal(type.prim, "key");
    value.string = oracleKey;
    seen.oracle++;
  }
  if (type.prim === "pair") {
    assert.equal(type.args?.length, value.args?.length, "Storage fixture and code layout differ");
    type.args.forEach((child, index) => replaceStorageField(child, value.args[index], oracleKey, seen));
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  assert.equal(process.env.TEZOS_NETWORK, "mainnet", "Set TEZOS_NETWORK=mainnet explicitly");
  const defaults = ["https://tezos-mainnet.octez.io/", "https://tcinfra.net/rpc/tezos/mainnet"];
  const endpoints = process.env.TEZOS_RPC_URL ? [process.env.TEZOS_RPC_URL] : defaults;
  let rpc;
  for (const candidate of endpoints) {
    try {
      if (await getJson(new URL("chains/main/chain_id", candidate)) === chainId) { rpc = candidate; break; }
    } catch { /* Try the configured fallback. */ }
  }
  assert.ok(rpc, "No configured Tezos Mainnet RPC verified its chain ID");
  const oldStorage = await getJson(`https://api.tzkt.io/v1/contracts/${oldStable}/storage`);
  assert.equal(oldStorage.admin, admin, "Live V2 admin is not wtf.tez");
  assert.match(oldStorage.oracle_key, /^edpk[1-9A-HJ-NP-Za-km-z]+$/);
  const live = await getJson("https://wtfos.app/api/horf/stables");
  assert.equal(live.contractAddress, oldStable, "Live V2 contract changed; review the oracle source");
  assert.equal(live.permitReady, true, "Live HORF oracle signer is not ready");

  const manifest = JSON.parse(readFileSync(path.join(here, "artifacts/build-manifest.json"), "utf8"));
  assert.equal(manifest.network, "mainnet");
  assert.equal(manifest.protocol, "tallinn");
  const code = verifiedArtifact("contract.json", manifest.contractJsonSha256);
  const storage = verifiedArtifact("storage.fixture.json", manifest.storageFixtureSha256);
  const storageType = code.find((item) => item.prim === "storage")?.args?.[0];
  assert.ok(storageType, "Compiled Michelson storage type missing");
  const seen = { admin: 0, oracle: 0 };
  replaceStorageField(storageType, storage, oldStorage.oracle_key, seen);
  assert.deepEqual(seen, { admin: 1, oracle: 1 });
  const plan = {
    network: "tezos-mainnet", chainId, rpc, admin, oraclePublicKey: oldStorage.oracle_key,
    inheritedOracleFrom: oldStable, source: "artifacts/contract.json",
    contractJsonSha256: manifest.contractJsonSha256,
    storage,
  };
  mkdirSync(path.join(here, "plan"), { recursive: true });
  writeFileSync(path.join(here, "plan/origination.json"), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ network: plan.network, chainId, admin,
    oraclePublicKey: plan.oraclePublicKey, codeSha256: plan.contractJsonSha256,
    plan: "contracts/horf-rooms-v3/plan/origination.json" }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
