#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { CODEC, getCodec, ProtocolsHash } from "@taquito/local-forging";

export const MAX_OPERATION_DATA_LENGTH = 32_768;
export const MIN_OPERATION_HEADROOM = 1_024;
const BRANCH_BYTES = 32;
const SIGNATURE_BYTES = 64;
const DEFAULT_PROTOCOL_CODEC = ProtocolsHash.PsUshuai9;

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

export function measureSignedOriginationOperationBytes({
  code,
  storage,
  protocol = DEFAULT_PROTOCOL_CODEC,
}) {
  assert.ok(Array.isArray(code), "compiled SmartPy contract must be a Micheline code array");
  assert.ok(storage && typeof storage === "object", "compiled SmartPy storage must be Micheline");
  const encodedContents = getCodec(CODEC.OP_ORIGINATION, protocol).encoder({
    kind: "origination",
    source: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    fee: "10000",
    counter: "99999999",
    gas_limit: "1040000",
    storage_limit: "60000",
    balance: "0",
    delegate: null,
    script: { code, storage },
  });
  return encodedContents.length / 2 + BRANCH_BYTES + SIGNATURE_BYTES;
}

export async function findDeployArtifactPair(buildDirectory) {
  const files = (await walk(buildDirectory)).filter((file) =>
    path.basename(path.dirname(file)).startsWith("deploy_"),
  );
  const contractFiles = files.filter((file) => file.endsWith("_contract.json")).sort();
  const pairs = contractFiles.flatMap((contractFile) => {
    const storageFile = contractFile.replace(/_contract\.json$/, "_storage.json");
    return files.includes(storageFile) ? [{ contractFile, storageFile }] : [];
  });
  assert.equal(
    pairs.length,
    1,
    `${buildDirectory} must contain exactly one deploy-template contract/storage artifact pair`,
  );
  return pairs[0];
}

export async function checkSmartPyOriginationSize(buildDirectory) {
  const pair = await findDeployArtifactPair(buildDirectory);
  const [code, storage] = await Promise.all([
    readFile(pair.contractFile, "utf8").then(JSON.parse),
    readFile(pair.storageFile, "utf8").then(JSON.parse),
  ]);
  const bytes = measureSignedOriginationOperationBytes({ code, storage });
  const headroom = MAX_OPERATION_DATA_LENGTH - bytes;
  assert.ok(
    headroom >= MIN_OPERATION_HEADROOM,
    `${path.basename(buildDirectory)} signed origination is ${bytes} bytes, leaving only ${headroom} bytes; require at least ${MIN_OPERATION_HEADROOM} below ${MAX_OPERATION_DATA_LENGTH}`,
  );
  return {
    contract: path.basename(buildDirectory),
    bytes,
    headroom,
    maxOperationDataLength: MAX_OPERATION_DATA_LENGTH,
    protocolCodec: DEFAULT_PROTOCOL_CODEC,
    contractFile: pair.contractFile,
    storageFile: pair.storageFile,
  };
}

async function main() {
  const buildDirectories = process.argv.slice(2).map((value) => path.resolve(value));
  assert.ok(
    buildDirectories.length > 0,
    "usage: node scripts/pasta-protocol/check-smartpy-origination-size.mjs <SmartPy build directory> [...]",
  );
  const results = [];
  for (const directory of buildDirectories) {
    results.push(await checkSmartPyOriginationSize(directory));
  }
  for (const result of results) {
    console.log(
      `${result.contract}: ${result.bytes} signed-origination bytes; ${result.headroom} bytes headroom below ${result.maxOperationDataLength}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
