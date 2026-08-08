#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// @ts-expect-error The strict package validator is intentionally maintained as an ESM JavaScript module.
import { validateAppManifest } from "./assemble-proof-package.mjs";
import { deterministicJsonBytes } from "./shadownet-proof-kit";

export const CARRY_FORWARD_SCHEMA = "pastaprotocol-completed-app-carry-forward@1";
export const CARRY_FORWARD_ARTIFACT_ID = "completed-app-carry-forward-provenance";
export const CARRY_FORWARD_ARTIFACT_PATH = "artifacts/completed-app-carry-forward-provenance.json";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

type AppManifest = Record<string, any>;

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

function requireSafeId(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!SAFE_ID.test(normalized)) throw new Error(`${label} must be a safe proof identifier`);
  return normalized;
}

export function buildCarryForwardDocuments(input: {
  app: string;
  sourceManifest: AppManifest;
  sourceManifestBytes: Uint8Array;
  targetRunId: string;
}): {
  provenance: AppManifest;
  provenanceBytes: Uint8Array;
  updatedManifest: AppManifest;
  updatedManifestBytes: Buffer;
} {
  const app = requireSafeId(input.app, "app");
  const sourceRunId = requireSafeId(input.sourceManifest?.runId, "source manifest runId");
  const targetRunId = requireSafeId(input.targetRunId, "target runId");
  if (input.sourceManifest?.schema !== "pastaprotocol-app-proof@1" || input.sourceManifest?.app !== app) {
    throw new Error(`source manifest must be a pastaprotocol-app-proof@1 document for ${app}`);
  }
  if (sourceRunId === targetRunId) {
    throw new Error("carry-forward requires distinct source and target run IDs");
  }
  if (!Array.isArray(input.sourceManifest.artifacts) || !Array.isArray(input.sourceManifest.capabilities)) {
    throw new Error("source manifest is missing artifacts or capabilities");
  }
  if (input.sourceManifest.artifacts.some((artifact: any) => artifact?.id === CARRY_FORWARD_ARTIFACT_ID)) {
    throw new Error("source manifest is already a carried-forward proof");
  }
  const owner = input.sourceManifest.capabilities[0];
  if (!owner?.evidence || !Array.isArray(owner.evidence.artifacts)) {
    throw new Error("source manifest has no capability that can own carry-forward provenance");
  }

  const provenance = {
    schema: CARRY_FORWARD_SCHEMA,
    app,
    source: {
      runId: sourceRunId,
      capturedAt: input.sourceManifest.capturedAt,
      manifestSha256: sha256(input.sourceManifestBytes),
    },
    target: { runId: targetRunId },
    preservedEvidence: {
      contracts: (input.sourceManifest.contracts || []).map((entry: any) => entry.address),
      operations: (input.sourceManifest.operations || []).map((entry: any) => entry.hash),
      tokens: (input.sourceManifest.tokens || []).map((entry: any) => ({
        id: entry.id,
        contractAddress: entry.contractAddress,
        tokenId: entry.tokenId,
      })),
      screenshots: (input.sourceManifest.screenshots || []).map((entry: any) => entry.stage),
      artifactsSha256: sha256(deterministicJsonBytes(input.sourceManifest.artifacts)),
    },
    execution: {
      signerMaterialLoaded: false,
      chainWrites: 0,
      ipfsWrites: 0,
      purpose: "Aggregate an already strict-validated Shadownet app proof without repeating irreversible evidence operations.",
    },
  };
  const provenanceBytes = deterministicJsonBytes(provenance);
  const provenanceRecord = {
    id: CARRY_FORWARD_ARTIFACT_ID,
    kind: "completed-app-carry-forward-provenance",
    path: CARRY_FORWARD_ARTIFACT_PATH,
    sha256: sha256(provenanceBytes),
  };
  const updatedManifest = structuredClone(input.sourceManifest);
  updatedManifest.runId = targetRunId;
  updatedManifest.sourceRunId = sourceRunId;
  updatedManifest.artifacts.push(provenanceRecord);
  updatedManifest.capabilities[0].evidence.artifacts.push(CARRY_FORWARD_ARTIFACT_ID);
  const updatedManifestBytes = Buffer.from(`${JSON.stringify(updatedManifest, null, 2)}\n`, "utf8");
  return { provenance, provenanceBytes, updatedManifest, updatedManifestBytes };
}

export async function carryForwardCompletedAppProof(input: {
  sourceRunRoot: string;
  targetRunRoot: string;
  app: string;
  targetRunId: string;
}): Promise<Record<string, unknown>> {
  const app = requireSafeId(input.app, "app");
  const sourceRunRoot = path.resolve(input.sourceRunRoot);
  const targetRunRoot = path.resolve(input.targetRunRoot);
  const sourceAppRoot = path.join(sourceRunRoot, app);
  const targetAppRoot = path.join(targetRunRoot, app);
  assert.notEqual(sourceAppRoot, targetAppRoot, "source and target app roots must differ");
  const targetRootStat = await stat(targetRunRoot);
  if (!targetRootStat.isDirectory()) throw new Error(`target proof root is not a directory: ${targetRunRoot}`);
  try {
    await stat(targetAppRoot);
    throw new Error(`refusing to overwrite existing target proof: ${targetAppRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const sourceValidation = await validateAppManifest(sourceRunRoot, app);
  const sourceManifestPath = path.join(sourceAppRoot, "manifest.json");
  const sourceManifestBytes = await readFile(sourceManifestPath);
  const sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
  const documents = buildCarryForwardDocuments({
    app,
    sourceManifest,
    sourceManifestBytes,
    targetRunId: input.targetRunId,
  });

  try {
    await cp(sourceAppRoot, targetAppRoot, { recursive: true, errorOnExist: true, force: false });
    await writeFile(path.join(targetAppRoot, CARRY_FORWARD_ARTIFACT_PATH), documents.provenanceBytes);
    await writeFile(path.join(targetAppRoot, "manifest.json"), documents.updatedManifestBytes);
    const targetValidation = await validateAppManifest(targetRunRoot, app);
    return {
      app,
      sourceRunId: sourceValidation.runId,
      targetRunId: targetValidation.runId,
      sourceManifestSha256: documents.provenance.source.manifestSha256,
      targetManifestSha256: targetValidation.manifestSha256,
      contracts: targetValidation.contracts.length,
      operations: targetValidation.operations.length,
      tokens: targetValidation.tokens.length,
      screenshots: targetValidation.screenshots.length,
      artifacts: targetValidation.artifacts.length,
      validation: "PASSED",
    };
  } catch (error) {
    await rm(targetAppRoot, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const [sourceRunRoot, targetRunRoot, app, targetRunId] = process.argv.slice(2);
  if (!sourceRunRoot || !targetRunRoot || !app || !targetRunId) {
    throw new Error("usage: carry-forward-completed-app-proof <source-run-root> <target-run-root> <app> <target-run-id>");
  }
  const result = await carryForwardCompletedAppProof({ sourceRunRoot, targetRunRoot, app, targetRunId });
  console.log(JSON.stringify(result, null, 2));
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  main().catch((error) => {
    console.error(`[pasta-proof-carry-forward] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
