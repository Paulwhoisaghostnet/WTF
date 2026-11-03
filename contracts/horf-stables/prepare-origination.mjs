/**
 * Print a non-signing Tezos mainnet origination plan. No operation is forged,
 * signed, or injected. The eligibility secret never appears in output.
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
const mainnetRpc = [
  "https://tezos-mainnet.octez.io/",
  "https://tcinfra.net/rpc/tezos/mainnet",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readArtifact(filename, digest) {
  const bytes = readFileSync(path.join(artifacts, filename));
  assert.equal(sha256(bytes), digest, `${filename} differs from the compiled build manifest`);
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  assert.equal(process.env.TEZOS_NETWORK, "mainnet", "Set TEZOS_NETWORK=mainnet explicitly");
  const admin = process.env.HORF_STABLES_ADMIN_ADDRESS || "";
  assert.equal(validateAddress(admin), ValidationResult.VALID, "HORF_STABLES_ADMIN_ADDRESS must be a Tezos address");
  const secret = process.env.HORF_STABLES_ORACLE_SECRET_KEY || "";
  assert.ok(secret, "HORF_STABLES_ORACLE_SECRET_KEY is required to prove signer parity");
  const oracleKey = await (await InMemorySigner.fromSecretKey(secret)).publicKey();
  assert.equal(validatePublicKey(oracleKey), ValidationResult.VALID, "Eligibility secret did not derive a valid Tezos public key");
  const expectedKey = process.env.HORF_STABLES_ORACLE_PUBLIC_KEY || "";
  assert.equal(validatePublicKey(expectedKey), ValidationResult.VALID, "Set HORF_STABLES_ORACLE_PUBLIC_KEY to the independently checked public key");
  assert.equal(oracleKey, expectedKey, "Service eligibility signer and intended storage oracle key differ");

  const endpoints = process.env.TEZOS_RPC_URL ? [process.env.TEZOS_RPC_URL] : mainnetRpc;
  let endpoint = "";
  let lastError;
  for (const candidate of endpoints) {
    try {
      const response = await fetch(`${candidate.replace(/\/?$/, "/")}chains/main/chain_id`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const chainId = await response.json();
      assert.equal(chainId, "NetXdQprcVkpaWU", `${candidate} is not Tezos mainnet`);
      endpoint = candidate;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!endpoint) throw new Error(`Configured Tezos mainnet RPCs are unavailable: ${String(lastError)}`);

  const manifest = JSON.parse(readFileSync(path.join(artifacts, "build-manifest.json"), "utf8"));
  assert.equal(manifest.network, "mainnet");
  assert.equal(manifest.protocol, "tallinn");
  const code = readArtifact("contract.json", manifest.contractJsonSha256);
  const storage = readArtifact("storage.fixture.json", manifest.storageFixtureSha256);
  const storageType = code.find((section) => section.prim === "storage")?.args?.[0];
  assert.ok(storageType, "Compiled Michelson storage type is missing");
  const found = { admin: 0, oracle_key: 0 };
  function replace(type, value) {
    const annotation = type.annots?.find((item) => item === "%admin" || item === "%oracle_key");
    if (annotation === "%admin") {
      assert.equal(type.prim, "address");
      value.string = admin;
      found.admin += 1;
    }
    if (annotation === "%oracle_key") {
      assert.equal(type.prim, "key");
      value.string = oracleKey;
      found.oracle_key += 1;
    }
    if (type.prim === "pair") {
      assert.equal(type.args.length, value.args?.length, "Compiled storage and fixture layout differ");
      type.args.forEach((child, index) => replace(child, value.args[index]));
    }
  }
  replace(storageType, storage);
  assert.deepEqual(found, { admin: 1, oracle_key: 1 }, "Admin or oracle storage field not found exactly once");
  console.log(JSON.stringify({
    network: "tezos-mainnet",
    chainId: "NetXdQprcVkpaWU",
    rpc: endpoint,
    contractJsonSha256: manifest.contractJsonSha256,
    admin,
    oraclePublicKey: oracleKey,
    source: "artifacts/contract.json",
    storage,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
