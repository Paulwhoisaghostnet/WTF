#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProtocolsHash } from "@taquito/local-forging";

import {
  findDeployArtifactPair,
  MAX_OPERATION_DATA_LENGTH,
  measureSignedOriginationOperationBytes,
} from "./check-smartpy-origination-size.mjs";
import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_PATH =
  "public/creation-tools/ravioli/contract/pasta-ravioli-deployment-certificate.json";
const SCHEMA = "pasta-ravioli-deployment-certificate@2";
const MINIMUM_HEADROOM_BYTES = 1_024;
const CERTIFIED_METADATA_URI_MAX_BYTES = 80;
const PROTOCOL = ProtocolsHash.PsUshuai9;
const CERTIFIED_METADATA_URI = `ipfs://bafy${"a".repeat(69)}`;

const DEFINITIONS = {
  router: {
    artifactPath: "public/creation-tools/ravioli/contract/pasta-bundle.contract.json",
    certificatePath: "contract/pasta-bundle.contract.json",
    sourcePath: "contracts/pasta-protocol/PastaPackRouterFA2.py",
    buildPath: "build/pasta-fa2/PastaPackRouterFA2",
  },
  blindController: {
    artifactPath:
      "public/creation-tools/ravioli/contract/pasta-blind-pack-controller.contract.json",
    certificatePath: "contract/pasta-blind-pack-controller.contract.json",
    sourcePath: "contracts/pasta-protocol/PastaBlindPackController.py",
    buildPath: "build/pasta-fa2/PastaBlindPackController",
  },
  gnocchiAdapter: {
    artifactPath:
      "public/creation-tools/ravioli/contract/pasta-gnocchi-pack-adapter.contract.json",
    certificatePath: "contract/pasta-gnocchi-pack-adapter.contract.json",
    sourcePath: "contracts/pasta-protocol/PastaGnocchiPackAdapter.py",
    buildPath: "build/pasta-fa2/PastaGnocchiPackAdapter",
  },
  rotiniAdapter: {
    artifactPath:
      "public/creation-tools/ravioli/contract/pasta-rotini-pack-adapter.contract.json",
    certificatePath: "contract/pasta-rotini-pack-adapter.contract.json",
    sourcePath: "contracts/pasta-protocol/PastaRotiniPackAdapter.py",
    buildPath: "build/pasta-fa2/PastaRotiniPackAdapter",
  },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compilerVersion() {
  const output = execFileSync(process.env.SMARTPY_BIN || "smartpy", ["--version"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.ok(output, "SmartPy did not report a compiler version");
  return output.replace(/^smartpy(?:-tezos)?\s+/i, "");
}

export function storageWithMetadataUri(storage, uri) {
  const bytes = Buffer.from(uri, "utf8");
  assert.equal(
    bytes.length,
    CERTIFIED_METADATA_URI_MAX_BYTES,
    `certified metadata URI must be exactly ${CERTIFIED_METADATA_URI_MAX_BYTES} bytes`,
  );
  const clone = structuredClone(storage);
  let replacements = 0;

  function visit(node) {
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (
      node.prim === "Elt" &&
      Array.isArray(node.args) &&
      node.args.length === 2 &&
      node.args[0]?.string === "" &&
      typeof node.args[1]?.bytes === "string"
    ) {
      node.args[1].bytes = bytes.toString("hex");
      replacements += 1;
    }
    for (const value of Object.values(node)) visit(value);
  }

  visit(clone);
  assert.equal(
    replacements,
    1,
    "compiled deployment storage must contain exactly one TZIP-16 metadata URI entry",
  );
  return clone;
}

async function certifiedArtifact(definition) {
  const pair = await findDeployArtifactPair(path.join(root, definition.buildPath));
  const [artifactBytes, sourceBytes, compiledCode, compiledStorage] = await Promise.all([
    readFile(path.join(root, definition.artifactPath)),
    readFile(path.join(root, definition.sourcePath)),
    readFile(pair.contractFile, "utf8").then(JSON.parse),
    readFile(pair.storageFile, "utf8").then(JSON.parse),
  ]);
  const artifactCode = JSON.parse(artifactBytes.toString("utf8"));
  assert.deepEqual(
    artifactCode,
    compiledCode,
    `${definition.artifactPath} is stale relative to its compiled SmartPy deployment scenario`,
  );
  const storage = storageWithMetadataUri(compiledStorage, CERTIFIED_METADATA_URI);
  const signedOriginationBytes = measureSignedOriginationOperationBytes({
    code: artifactCode,
    storage,
    protocol: PROTOCOL,
  });
  const headroomBytes = MAX_OPERATION_DATA_LENGTH - signedOriginationBytes;
  assert.ok(
    headroomBytes >= MINIMUM_HEADROOM_BYTES,
    `${definition.artifactPath} leaves ${headroomBytes} signed-operation bytes of headroom with an ${CERTIFIED_METADATA_URI_MAX_BYTES}-byte metadata URI; require ${MINIMUM_HEADROOM_BYTES}`,
  );
  return {
    path: definition.certificatePath,
    sha256: sha256(artifactBytes),
    canonicalMichelsonCodeSha256: hashMichelsonScriptCode(artifactCode),
    sourcePath: definition.sourcePath,
    sourceSha256: sha256(sourceBytes),
    signedOriginationBytes,
    headroomBytes,
  };
}

export async function generateRavioliDeploymentCertificate() {
  assert.equal(
    Buffer.byteLength(CERTIFIED_METADATA_URI, "utf8"),
    CERTIFIED_METADATA_URI_MAX_BYTES,
  );
  const [router, blindController, gnocchiAdapter, rotiniAdapter] = await Promise.all([
    certifiedArtifact(DEFINITIONS.router),
    certifiedArtifact(DEFINITIONS.blindController),
    certifiedArtifact(DEFINITIONS.gnocchiAdapter),
    certifiedArtifact(DEFINITIONS.rotiniAdapter),
  ]);
  return {
    schema: SCHEMA,
    compiler: {
      name: "SmartPy",
      version: compilerVersion(),
    },
    protocol: PROTOCOL,
    maxOperationDataLength: MAX_OPERATION_DATA_LENGTH,
    minimumHeadroomBytes: MINIMUM_HEADROOM_BYTES,
    certifiedMetadataUriMaxBytes: CERTIFIED_METADATA_URI_MAX_BYTES,
    artifacts: {
      router,
      blindController,
      gnocchiAdapter,
      rotiniAdapter,
    },
  };
}

async function main() {
  const certificate = await generateRavioliDeploymentCertificate();
  const output = path.join(root, OUTPUT_PATH);
  await writeFile(output, `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  console.log(`Ravioli deployment certificate written to ${OUTPUT_PATH}`);
  for (const [name, artifact] of Object.entries(certificate.artifacts)) {
    console.log(
      `${name}: ${artifact.signedOriginationBytes} signed bytes; ${artifact.headroomBytes} bytes headroom with ${CERTIFIED_METADATA_URI_MAX_BYTES}-byte metadata URI`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
