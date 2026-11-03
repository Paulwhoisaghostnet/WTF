/**
 * Generate a reviewed, non-signing Tezos Mainnet HORSE Market origination plan.
 * No operation is forged, signed, or injected. No secret is printed.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemorySigner } from "@taquito/signer";
import { ValidationResult, validateAddress, validatePublicKey } from "@taquito/utils";

const directory = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(directory, "artifacts");
const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const ADMIN = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const STABLES_ORACLE = "edpkvZL5ek6Njb9RWQVtnUMkV2HJQtNFsycFdrgDjTnshrsXmzEzVy";
const HORSE_CONTRACT = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const RPCS = [
  "https://tezos-mainnet.octez.io/",
  "https://tcinfra.net/rpc/tezos/mainnet",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readChecked(filename, expectedHash) {
  const bytes = readFileSync(path.join(artifacts, filename));
  assert.equal(sha256(bytes), expectedHash, `${filename} differs from the reviewed build manifest`);
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  assert.equal(process.env.TEZOS_NETWORK, "mainnet", "Set TEZOS_NETWORK=mainnet explicitly");
  assert.equal(validateAddress(ADMIN), ValidationResult.VALID);
  assert.equal(validateAddress(HORSE_CONTRACT), ValidationResult.VALID);
  assert.equal(validatePublicKey(STABLES_ORACLE), ValidationResult.VALID);
  const secret = process.env.HORF_STABLES_ORACLE_SECRET_KEY?.trim();
  if (secret) {
    const derived = await (await InMemorySigner.fromSecretKey(secret)).publicKey();
    assert.equal(derived, STABLES_ORACLE, "Stables service signer differs from reviewed Market oracle key");
  }

  const manifest = JSON.parse(readFileSync(path.join(artifacts, "build-manifest.json"), "utf8"));
  assert.equal(manifest.chain, "tezos-l1");
  assert.equal(manifest.network, "mainnet");
  assert.equal(manifest.chainId, MAINNET_CHAIN_ID);
  assert.equal(manifest.protocol, "tallinn");
  assert.equal(sha256(readFileSync(path.join(directory, "HorseMarket.py"))), manifest.sourceSha256);
  const code = readChecked("contract.json", manifest.contractJsonSha256);
  const storage = readChecked("storage.fixture.json", manifest.storageFixtureSha256);
  const storageType = code.find((section) => section.prim === "storage")?.args?.[0];
  assert.ok(storageType, "Compiled Michelson storage type missing");

  const found = { admin: 0, oracle_key: 0, horse_contract: 0 };
  function replace(type, value) {
    const annotation = type.annots?.find((item) =>
      item === "%admin" || item === "%oracle_key" || item === "%horse_contract");
    if (annotation === "%admin") {
      assert.equal(type.prim, "address");
      value.string = ADMIN;
      found.admin += 1;
    }
    if (annotation === "%oracle_key") {
      assert.equal(type.prim, "key");
      value.string = STABLES_ORACLE;
      found.oracle_key += 1;
    }
    if (annotation === "%horse_contract") {
      assert.equal(type.prim, "address");
      value.string = HORSE_CONTRACT;
      found.horse_contract += 1;
    }
    if (type.prim === "pair") {
      assert.equal(type.args.length, value.args?.length, "Compiled storage and fixture layout differ");
      type.args.forEach((child, index) => replace(child, value.args[index]));
    }
  }
  replace(storageType, storage);
  assert.deepEqual(found, { admin: 1, oracle_key: 1, horse_contract: 1 });

  const endpoints = process.env.TEZOS_RPC_URL ? [process.env.TEZOS_RPC_URL] : RPCS;
  let rpc = "";
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint.replace(/\/?$/, "/")}chains/main/chain_id`);
      assert.ok(response.ok, `HTTP ${response.status}`);
      assert.equal(await response.json(), MAINNET_CHAIN_ID, `${endpoint} is not Tezos Mainnet`);
      rpc = endpoint;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  assert.ok(rpc, `Configured Mainnet RPCs unavailable: ${String(lastError)}`);

  console.log(JSON.stringify({
    network: "tezos-mainnet",
    chainId: MAINNET_CHAIN_ID,
    rpc,
    contractJsonSha256: manifest.contractJsonSha256,
    contractTzSha256: manifest.contractTzSha256,
    sourceSha256: manifest.sourceSha256,
    storageFixtureSha256: manifest.storageFixtureSha256,
    admin: ADMIN,
    oraclePublicKey: STABLES_ORACLE,
    horseContract: HORSE_CONTRACT,
    horseTokenId: 0,
    source: "artifacts/contract.json",
    storage,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
