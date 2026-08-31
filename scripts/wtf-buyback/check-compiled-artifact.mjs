#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  MAX_OPERATION_DATA_LENGTH,
  MIN_OPERATION_HEADROOM,
  measureSignedOriginationOperationBytes,
} from "../pasta-protocol/check-smartpy-origination-size.mjs";

const [contractPath, storagePath] = process.argv.slice(2);
assert.ok(contractPath && storagePath, "contract and storage artifact paths are required");

const [code, storage] = await Promise.all([
  readFile(contractPath, "utf8").then(JSON.parse),
  readFile(storagePath, "utf8").then(JSON.parse),
]);
const encoded = JSON.stringify(code);
for (const requiredName of ["swap", "allowlist_proof_valid", "pause", "withdraw_leftover_xtz"]) {
  assert.ok(encoded.includes(requiredName), `compiled artifact is missing ${requiredName}`);
}

const bytes = measureSignedOriginationOperationBytes({ code, storage });
const headroom = MAX_OPERATION_DATA_LENGTH - bytes;
assert.ok(
  headroom >= MIN_OPERATION_HEADROOM,
  `WtfBuybackV1 signed origination is ${bytes} bytes, leaving only ${headroom} bytes below ${MAX_OPERATION_DATA_LENGTH}`,
);
console.log(
  `WtfBuybackV1 artifact: ${bytes} signed-origination bytes; ${headroom} bytes protocol headroom`,
);
