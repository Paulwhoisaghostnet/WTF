#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { packDataBytes } from "@taquito/michel-codec";
import { MichelsonMap, OpKind, type TezosToolkit } from "@taquito/taquito";
import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";
import { blake2b } from "blakejs";
import { chromium, type Browser, type BrowserContext, type Download, type Page } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
  decodePastaUiLiveValue,
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  PASTA_UI_LIVE_RECEIPT_SCHEMA,
  PastaUiLiveBridgeError,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
  type PastaUiLiveFundingAuthorization,
  type PastaUiLiveAppliedOperationAssertion,
  type PastaUiLivePinProof,
  type PastaUiLivePublicReceipt,
  type PastaUiLivePreparedOperation,
  type PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
  type PastaProofPageMonitor,
  type RequiredDomEvidence,
} from "./pasta-proof-screenshot-kit";
import {
  assertMichelsonScriptCodeIdentity,
  hashMichelsonScriptCode,
} from "./pasta-michelson-script-identity";
import {
  PASTA_DATETIME_LOCAL_RESOLUTION_MS,
  PASTA_RFC3339_FOUR_DIGIT_CEILING_MS,
  pastaDeadlineBeforeCeiling,
  pastaRoundUpToDatetimeLocalMinute,
} from "./pasta-proof-deadline-policy";
import { createHttpGetReader, declareReadOnlyReader, readWithBoundedRetry } from "./pasta-readonly-retry";
import {
  assertShadownet,
  block,
  buildToolkit,
  deterministicJsonBytes,
  hexToUtf8,
  ipfsGatewayUrl,
  loadSignerSet,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  root,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsProofConfig,
  type PlatformWallet,
} from "./shadownet-proof-kit";
import {
  validateRavioliRecoveryReceipt,
  type AcceptedEvidenceHashes,
} from "./shadownet-ravioli-dependency-recovery";
import { ravioliPayloadCommitment } from "./shadownet-ravioli-e2e";
import {
  loadRavioliNativeRecoveryHandoff,
  RAVIOLI_NATIVE_RECOVERY_DIRECTORY,
  verifyRavioliNativeRecoveryLive,
  type RavioliNativeRecoveryLiveVerification,
  type RavioliNativeRecoveryHandoff,
} from "./shadownet-ravioli-native-recovery";
import {
  loadRavioliGnocchiLeDependency,
  RAVIOLI_GNOCCHI_LE_TOKEN_ID,
  type RavioliGnocchiLeDependencyReceipt,
} from "./shadownet-ravioli-gnocchi-le-dependency";
import {
  RAVIOLI_PREPACK_RECOVERY_DIRECTORY,
  validateRavioliPrepackRecoveryIntent,
  validateRavioliPrepackRecoveryPreflight,
  validateRavioliPrepackRecoveryProgress,
  validateRavioliPrepackRecoveryReceipt,
} from "./shadownet-ravioli-prepack-recovery";
import {
  createRavioliUiLiveJournal,
  openRavioliUiLiveJournal,
  ravioliUiLiveNonceCommitment,
  RAVIOLI_UI_LIVE_EXPECTED_COUNTS,
  RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX as RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  type RavioliUiLiveActorIntent,
  type RavioliUiLiveJournal,
  type RavioliUiLiveJournalActor,
  type RavioliUiLiveJournalFinalization,
  type RavioliUiLiveProofPartition,
} from "./shadownet-ravioli-ui-live-journal";
import {
  createRavioliMode0MutationReplayInterceptor,
  loadRavioliMode0MutationReplay,
  type RavioliMode0MutationReplay,
} from "./shadownet-ravioli-mode0-mutation-replay";
import {
  createRavioliControllerResumeInterceptor,
  loadRavioliControllerResume,
  type RavioliControllerResume,
} from "./shadownet-ravioli-controller-resume";
import {
  RAVIOLI_CURRENT_V2_MODE0_NONCE,
  RAVIOLI_CURRENT_V2_MODE0_NONCE_COMMITMENT,
  RAVIOLI_CURRENT_V2_RESUME_IDENTITY,
  type RavioliCurrentV2Resume,
} from "./shadownet-ravioli-current-v2-resume";
import {
  createRavioliCurrentV3RestartInterceptor,
  loadRavioliCurrentV3Restart,
  RAVIOLI_CURRENT_V3_RESTART_IDENTITY,
  ravioliCurrentV3RestartSnapshot,
  type RavioliCurrentV3Restart,
} from "./shadownet-ravioli-current-v3-restart";
import {
  createRavioliCurrentV4ResumeInterceptor,
  loadRavioliCurrentV4Resume,
  RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
  RAVIOLI_CURRENT_V4_RESUME_IDENTITY,
  ravioliCurrentV4ResumeSnapshot,
  type RavioliCurrentV4OperationTenContext,
  type RavioliCurrentV4Resume,
} from "./shadownet-ravioli-current-v4-resume";
import {
  loadRavioliCurrentV5Resume,
  RAVIOLI_CURRENT_V5_RESUME_IDENTITY,
  type RavioliCurrentV5Resume,
} from "./shadownet-ravioli-current-v5-resume";
import {
  RAVIOLI_CURRENT_V6_RESUME_IDENTITY,
  type RavioliCurrentV6Resume,
} from "./shadownet-ravioli-current-v6-resume";
import {
  loadRavioliCurrentV7Resume,
  RAVIOLI_CURRENT_V7_RESUME_IDENTITY,
  type RavioliCurrentV7Resume,
} from "./shadownet-ravioli-current-v7-resume";
import {
  FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH,
  loadFreshRavioliDependencies,
  recheckFreshRavioliDependencies,
  recheckRavioliDependenciesForCurrentV2Resume,
  recheckRavioliDependenciesForCurrentV3Restart,
  recheckRavioliDependenciesForCurrentV5Resume,
  recheckRavioliDependenciesForCurrentV6Resume,
  recheckRavioliDependenciesForMode0Replay,
  type FreshDependencyReadRequest,
  type FreshGnocchiLiveSnapshot,
  type FreshRavioliDependencies,
  type FreshRavioliDependencyLiveCheck,
  type FreshRotiniLiveSnapshot,
  type RavioliCurrentV3RestartRecovery,
  type RavioliCurrentV5ResumeRecovery,
  type RavioliCurrentV6ResumeRecovery,
  type RavioliMode0ReplayDependencyLiveCheck,
  type RavioliMode0ReplayRecovery,
} from "./shadownet-ravioli-fresh-dependencies";
import {
  captureRavioliPrivateRecovery,
  countRavioliPrivateRecoveryRecords,
  validateRavioliPrivateRecoveryOutputDirectory,
  type RavioliPrivateRecoveryCapture,
} from "./shadownet-ravioli-private-recovery";
import {
  verifyRavioliMode1PreOp10PrivateProof,
  type RavioliMode1PreOp10Proof,
} from "./shadownet-ravioli-blind-proof-verifier";
import {
  createRavioliCurrentResumeCoordinator,
  inspectRavioliCurrentResume,
  installRavioliPrivateRecoveryRestoration,
  reconcileRavioliCurrentResume,
  type RavioliCurrentResumeCoordinator,
  type RavioliCurrentResumeExpectedIdentity,
  type RavioliCurrentResumePlan,
  type RavioliPrivateRecoveryRestoration,
} from "./shadownet-ravioli-current-resume";
import {
  createRavioliCurrentResumeLiveVerifier,
  type RavioliCurrentResumeRoleArtifacts,
} from "./shadownet-ravioli-current-live-verifier";
import {
  assertRavioliCurrentEntropyReplayConsumed,
  installRavioliCurrentEntropyReplay,
  loadRavioliCurrentEntropyReplay,
} from "./shadownet-ravioli-current-entropy-replay";

const EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE";
const PREWRITE_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PREWRITE_RESUME_EXECUTE";
const CONTROLLER_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE";
const MODE0_MUTATION_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_MODE0_MUTATION_RESUME_EXECUTE";
const CURRENT_V2_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V2_RESUME_EXECUTE";
const CURRENT_V3_RESTART_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_RESTART_EXECUTE";
const CURRENT_V3_PREFLIGHT_ONLY_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_PREFLIGHT_ONLY";
const CURRENT_V4_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE";
const CURRENT_V4_PREFLIGHT_ONLY_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_PREFLIGHT_ONLY";
const CURRENT_V5_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V5_RESUME_EXECUTE";
const CURRENT_V6_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V6_RESUME_EXECUTE";
const CURRENT_V7_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE";
const CURRENT_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_RESUME_EXECUTE";
const CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG =
  "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V8_PLAN_EXTENSION_ACTIVATE";
const PACKAGE_RESUME_FLAG = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PACKAGE_RESUME_EXECUTE";
const OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
const PRIVATE_RECOVERY_OUTPUT_ENV = "PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR";
const RAVIOLI_PACKAGE_CHECKPOINT_RELATIVE_PATH = "artifacts/package-resume/checkpoint.json";
const RAVIOLI_PACKAGE_CHECKPOINT_SCHEMA = "pastaprotocol-ravioli-package-resume-checkpoint@1";
const STATIC_ROOT = path.join(root, "public");
const APP_PATH = "/creation-tools/ravioli/index.html";
const SITE_PATH = "/creation-tools/ravioli/site.html";
const SITE_SOURCE_PATH = path.join(STATIC_ROOT, "creation-tools", "ravioli", "js", "site.js");
const ARTIFACT_PATHS = {
  router: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-bundle.contract.json"),
  blindController: path.join(
    STATIC_ROOT,
    "creation-tools",
    "ravioli",
    "contract",
    "pasta-blind-pack-controller.contract.json",
  ),
  gnocchiAdapter: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-gnocchi-pack-adapter.contract.json"),
  rotiniAdapter: path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract", "pasta-rotini-pack-adapter.contract.json"),
  rotiniTarget: path.join(
    STATIC_ROOT,
    "creation-tools",
    "rotini",
    "contract",
    "pasta-generative-collection.contract.json",
  ),
} as const;
const RAVIOLI_DEPLOYMENT_CERTIFICATE_PATH = path.join(
  STATIC_ROOT,
  "creation-tools",
  "ravioli",
  "contract",
  "pasta-ravioli-deployment-certificate.json",
);
const RAVIOLI_FROZEN_DEPLOYMENT = Object.freeze({
  certificateSha256: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
  maxOperationDataLength: 32_768,
  minimumHeadroomBytes: 1_024,
  certifiedMetadataUriMaxBytes: 80,
  router: Object.freeze({
    artifactSha256: "999eab1ecb9179e24d20b04578fa89d3508b1abc34c3f03034eb4e6ba9bd3789",
    sourceSha256: "92730950800cfcc3363cd0c4b6c72045e91ed9852dc2a62b8224539c07921b94",
    canonicalMichelsonCodeSha256: "203861ef17f41f1f4e1e1ef03a3eb69735b181edc682d6e5dfd3a8a95a3febf0",
    sourcePath: path.join(root, "contracts", "pasta-protocol", "PastaPackRouterFA2.py"),
    signedOriginationBytes: 31_587,
    headroomBytes: 1_181,
  }),
  blindController: Object.freeze({
    artifactSha256: "e5fbc6b68db438955550ba51197f70d0f66c7ed2fb02d31ac71e7db00360ba53",
    sourceSha256: "69b35a799b187e81402af837130a3d734c469f729a27040329b8e0248db452c2",
    canonicalMichelsonCodeSha256: "c6c9198870b11d3d3330b5cd290a8f71a072376ef3dbce77a97ce4533472fea8",
    sourcePath: path.join(root, "contracts", "pasta-protocol", "PastaBlindPackController.py"),
    signedOriginationBytes: 15_204,
    headroomBytes: 17_564,
  }),
  gnocchiAdapter: Object.freeze({
    artifactSha256: "7aa2bfabe90843a62ac87239e3e97ec468fe2b7e0c01aa5a66aadf1424288b90",
    sourceSha256: "7230adb19f3d6e01bdaa45168f495aa39452d0515326895400c4bf61f08a1753",
    canonicalMichelsonCodeSha256: "db5ef4ee05426f24528403e97cdf3486b0ec4bf369508b427f834a1c7e461001",
    sourcePath: path.join(root, "contracts", "pasta-protocol", "PastaGnocchiPackAdapter.py"),
    signedOriginationBytes: 5_447,
    headroomBytes: 27_321,
  }),
  rotiniAdapter: Object.freeze({
    artifactSha256: "0c0c1067212bc4c3109b08669ff35b1c90f79342447105fc28bb9434d54ed8fb",
    sourceSha256: "6c8e4a5251ad24e15e6c7db0c303ce5eebee8c6457e9104d2944fb942a51982f",
    canonicalMichelsonCodeSha256: "0b33f7c9bab1decf258711adfa1cf34a0a507f91dfbc1e1cfe1443a16d1f9f55",
    sourcePath: path.join(root, "contracts", "pasta-protocol", "PastaRotiniPackAdapter.py"),
    signedOriginationBytes: 5_460,
    headroomBytes: 27_308,
  }),
  rotiniTarget: Object.freeze({
    artifactSha256: "09c62027ee8e4ee4772e12a906f3d67208cecd712529f4f65baf0cba9015b90a",
    scriptCodeSha256: "6971c69651659bd8c0ac7ec42ba9a140e36907da5206cc1fc1ef75f91af0b631",
  }),
  gnocchiTarget: Object.freeze({
    artifactSha256: "0c484c641c15a71c4bd4454b4bf40b6c1a9b016b42e0c5055faf19b4e5241998",
    scriptCodeSha256: "6a7a16c570ced1c6c3c884fe1c3e6b86cb50e31f187751951d0a6715d8d611bb",
  }),
});
const RAVIOLI_SHORT_EXPIRY_RED_FIXTURE = Object.freeze({
  gnocchiTarget: "KT19dHuzHkqzvC3CgobLoTLbars792TFm87j",
  gnocchiAdapter: "KT1DjJbTatDAvB73TW4uo58XdrN3fxb45w6Y",
  childLifetimeMs: 5 * 60_000,
  wrapperAfterChildMs: 60 * 60_000,
  revealAfterChildMs: 90 * 60_000,
  declaredAfterChildMs: 2 * 60 * 60_000,
  openAfterChildMs: 3 * 60 * 60_000,
});
const CREATOR_OPERATION_RESERVE_MUTEZ = 12_000_000;
const COLLECTOR_OPERATION_RESERVE_MUTEZ = 2_000_000;
const PAID_SALE_PRICE_MUTEZ = 1;
export const RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID = 1;
export const RAVIOLI_GNOCCHI_LIMITED_ALLOCATION_TOKEN_ID = RAVIOLI_GNOCCHI_LE_TOKEN_ID;
export const RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES = 1_500_000_000;
export const RAVIOLI_BUYER_READINESS_POLICY = Object.freeze({
  maxAttempts: 3,
  attemptTimeoutMs: 30_000,
  retryDelayMs: 750,
});
export const RAVIOLI_BUYER_READINESS_BOUND_MS =
  RAVIOLI_BUYER_READINESS_POLICY.maxAttempts * RAVIOLI_BUYER_READINESS_POLICY.attemptTimeoutMs
  + (RAVIOLI_BUYER_READINESS_POLICY.maxAttempts - 1)
    * RAVIOLI_BUYER_READINESS_POLICY.retryDelayMs;
export const RAVIOLI_SHADOWNET_BLOCK_DELAY_MS = 6_000;
export const RAVIOLI_PREBUY_MIN_REMAINING_MS = pastaRoundUpToDatetimeLocalMinute(
  RAVIOLI_BUYER_READINESS_BOUND_MS + RAVIOLI_SHADOWNET_BLOCK_DELAY_MS,
);

// These are the latest three distinct values a whole-minute `datetime-local`
// control can express without leaving the four-digit RFC3339/browser Date
// domain. A fully sold pack may still reveal immediately; these are safety
// ceilings, not a requirement to wait.
export const RAVIOLI_MAXIMUM_GREEN_SALE_END_ISO = pastaDeadlineBeforeCeiling(2);
export const RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_ISO = pastaDeadlineBeforeCeiling(1);
export const RAVIOLI_MAXIMUM_GREEN_OPEN_DEADLINE_ISO = pastaDeadlineBeforeCeiling(0);
const RAVIOLI_MAXIMUM_GREEN_SALE_END_MS = Date.parse(RAVIOLI_MAXIMUM_GREEN_SALE_END_ISO);
const RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_MS = Date.parse(
  RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_ISO,
);

export type RavioliRedDeadlineEvidence = Readonly<{
  maxOperationMs: number;
  maxPinGapMs: number;
  preBuyOperationCount: number;
  preBuyPinCount: number;
  buyerReadinessBoundMs: number;
  datetimeLocalTruncationBoundMs: number;
  shadownetBlockDelayMs: number;
}>;

export const RAVIOLI_EVENT86_RED_DEADLINE_EVIDENCE: RavioliRedDeadlineEvidence =
  Object.freeze({
    maxOperationMs: 25_995,
    maxPinGapMs: 36_597,
    preBuyOperationCount: 7,
    preBuyPinCount: 4,
    buyerReadinessBoundMs: RAVIOLI_BUYER_READINESS_BOUND_MS,
    // `datetime-local` truncates less than one minute; reserving the exclusive
    // bound keeps the calculated whole-minute value safe at every second.
    datetimeLocalTruncationBoundMs: PASTA_DATETIME_LOCAL_RESOLUTION_MS,
    shadownetBlockDelayMs: RAVIOLI_SHADOWNET_BLOCK_DELAY_MS,
  });

export function calculateRavioliRedDeadlineWindows(
  evidence: RavioliRedDeadlineEvidence = RAVIOLI_EVENT86_RED_DEADLINE_EVIDENCE,
): Readonly<{
  measuredSaleRunwayMs: number;
  saleWindowMs: number;
  revealWindowMs: number;
}> {
  for (const [label, value] of Object.entries(evidence)) {
    assert.ok(
      Number.isSafeInteger(value) && value > 0,
      `Ravioli red deadline ${label} must be a positive safe integer`,
    );
  }
  const measuredSaleRunwayMs =
    evidence.preBuyOperationCount * evidence.maxOperationMs
    + evidence.preBuyPinCount * evidence.maxPinGapMs
    + evidence.buyerReadinessBoundMs
    + evidence.datetimeLocalTruncationBoundMs
    + evidence.shadownetBlockDelayMs;
  assert.ok(
    Number.isSafeInteger(measuredSaleRunwayMs),
    "Ravioli red deadline evidence exceeds safe timestamp arithmetic",
  );
  const saleWindowMs = pastaRoundUpToDatetimeLocalMinute(measuredSaleRunwayMs);
  return Object.freeze({
    measuredSaleRunwayMs,
    saleWindowMs,
    revealWindowMs: saleWindowMs + PASTA_DATETIME_LOCAL_RESOLUTION_MS,
  });
}

const RAVIOLI_RED_DEADLINE_WINDOWS = calculateRavioliRedDeadlineWindows();
export const RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_SALE_WINDOW_MS =
  RAVIOLI_RED_DEADLINE_WINDOWS.saleWindowMs;
export const RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_REVEAL_WINDOW_MS =
  RAVIOLI_RED_DEADLINE_WINDOWS.revealWindowMs;

function ravioliGreenWindowMs(input: {
  env: Readonly<Record<string, string | undefined>>;
  name: string;
  defaultMs: number;
}): number {
  const raw = input.env[input.name];
  if (raw == null || raw.trim() === "") return input.defaultMs;
  assert.match(
    raw,
    /^[1-9]\d*$/,
    `${input.name} must be a whole number of hours`,
  );
  const hours = Number(raw);
  assert.ok(
    Number.isSafeInteger(hours * 60 * 60 * 1_000),
    `${input.name} exceeds safe timestamp arithmetic`,
  );
  return hours * 60 * 60 * 1_000;
}

export function resolveRavioliGreenDeadlinePolicy(
  env: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): Readonly<{
  saleWindowMs: number;
  revealAfterSaleMs: number;
  openAfterSaleMs: number;
}> {
  assert.ok(
    Number.isSafeInteger(nowMs) && nowMs >= 0 && nowMs < RAVIOLI_MAXIMUM_GREEN_SALE_END_MS,
    "Ravioli green deadline clock is outside the interoperable finite horizon",
  );
  const policy = {
    saleWindowMs: ravioliGreenWindowMs({
      env,
      name: "PASTA_SHADOWNET_RAVIOLI_GREEN_SALE_HOURS",
      defaultMs: RAVIOLI_MAXIMUM_GREEN_SALE_END_MS - nowMs,
    }),
    revealAfterSaleMs: ravioliGreenWindowMs({
      env,
      name: "PASTA_SHADOWNET_RAVIOLI_GREEN_REVEAL_AFTER_SALE_HOURS",
      defaultMs:
        RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_MS
        - RAVIOLI_MAXIMUM_GREEN_SALE_END_MS,
    }),
    openAfterSaleMs: ravioliGreenWindowMs({
      env,
      name: "PASTA_SHADOWNET_RAVIOLI_GREEN_OPEN_AFTER_SALE_HOURS",
      defaultMs:
        PASTA_RFC3339_FOUR_DIGIT_CEILING_MS
        - RAVIOLI_MAXIMUM_GREEN_SALE_END_MS,
    }),
  };
  assert.ok(
    policy.revealAfterSaleMs < policy.openAfterSaleMs,
    "Ravioli green open deadline must follow its reveal deadline",
  );
  assert.ok(
    nowMs + policy.saleWindowMs + policy.openAfterSaleMs
      <= PASTA_RFC3339_FOUR_DIGIT_CEILING_MS,
    "Ravioli green open deadline exceeds the interoperable finite horizon",
  );
  return Object.freeze(policy);
}

export function assertRavioliPreBuyWindow(input: {
  chainTimestamp: string;
  saleEnd: string;
  label: string;
  minimumRemainingMs?: number;
}): number {
  const chainTimestampMs = Date.parse(input.chainTimestamp);
  const saleEndMs = Date.parse(input.saleEnd);
  const minimumRemainingMs = input.minimumRemainingMs ?? RAVIOLI_PREBUY_MIN_REMAINING_MS;
  assert.ok(Number.isFinite(chainTimestampMs), `${input.label} chain timestamp is invalid`);
  assert.ok(Number.isFinite(saleEndMs), `${input.label} sale end is invalid`);
  assert.ok(
    Number.isSafeInteger(minimumRemainingMs) && minimumRemainingMs >= 1,
    `${input.label} minimum remaining time is invalid`,
  );
  const remainingMs = saleEndMs - chainTimestampMs;
  assert.ok(
    remainingMs >= minimumRemainingMs,
    `${input.label} has only ${Math.max(0, remainingMs)}ms before sale expiry; `
      + `${minimumRemainingMs}ms is required for bounded page reads and one safe purchase`,
  );
  return remainingMs;
}

export function assertRavioliSameInstantOrNull(
  actual: string | null | undefined,
  expected: string | null | undefined,
  message: string,
): void {
  if (actual == null || expected == null) {
    assert.equal(actual ?? null, expected ?? null, message);
    return;
  }
  const actualMs = Date.parse(actual);
  const expectedMs = Date.parse(expected);
  assert.ok(Number.isFinite(actualMs), `${message}: actual timestamp is invalid`);
  assert.ok(Number.isFinite(expectedMs), `${message}: expected timestamp is invalid`);
  assert.equal(actualMs, expectedMs, message);
}

export function ravioliChainWaitTimeoutMs(thresholdIso: string, nowMs = Date.now()): number {
  const thresholdMs = Date.parse(thresholdIso);
  assert.ok(Number.isFinite(thresholdMs), "Ravioli chain wait threshold is invalid");
  assert.ok(Number.isSafeInteger(nowMs) && nowMs >= 0, "Ravioli chain wait clock is invalid");
  const remainingMs = Math.max(0, thresholdMs - nowMs);
  return Math.min(4 * 60 * 60 * 1_000, Math.max(10 * 60 * 1_000, remainingMs + 10 * 60 * 1_000));
}
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const MODE_NAMES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const;

export const RAVIOLI_MODE_PROOF_PARTITIONS = Object.freeze([
  "mode-0-deterministic-vault",
  "mode-1-blind-funded-pool",
  "mode-2-blind-allocated-mint",
  "mode-3-blind-generative-mint",
  "mode-4-hybrid-atomic-pack",
] as const satisfies readonly RavioliUiLiveProofPartition[]);

export function ravioliProofPartitionWriteOperationHashes(
  receipts: readonly PastaUiLivePublicReceipt[],
): Readonly<Record<RavioliUiLiveProofPartition, readonly string[]>> {
  assert.equal(
    receipts.length,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli proof partitioning requires the complete derived semantic plan",
  );
  const partitions = {
    infrastructure: [],
    "mode-0-deterministic-vault": [],
    "mode-1-blind-funded-pool": [],
    "mode-2-blind-allocated-mint": [],
    "mode-3-blind-generative-mint": [],
    "mode-4-hybrid-atomic-pack": [],
    "withheld-reveal-refund": [],
  } satisfies Record<RavioliUiLiveProofPartition, string[]>;
  receipts.forEach((receipt, index) => {
    const expected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[index];
    assert.equal(receipt.action, expected.action, `Ravioli operation ${index + 1} action drift`);
    assert.deepEqual(
      receipt.entrypoints,
      expected.entrypoint ? [expected.entrypoint] : [],
      `Ravioli operation ${index + 1} entrypoint drift`,
    );
    assert.ok(receipt.operationHash, `Ravioli operation ${index + 1} lacks its hash`);
    partitions[expected.proofPartition].push(receipt.operationHash);
  });
  const all = Object.values(partitions).flat();
  assert.equal(new Set(all).size, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total, "Ravioli semantic proof partitions overlap");
  assert.deepEqual(
    [...all].sort(),
    receipts.map((receipt) => receipt.operationHash || "").sort(),
    "Ravioli semantic proof partitions do not cover the full operation plan",
  );
  return Object.freeze(
    Object.fromEntries(
      Object.entries(partitions).map(([partition, hashes]) => [partition, Object.freeze(hashes)]),
    ),
  ) as Readonly<Record<RavioliUiLiveProofPartition, readonly string[]>>;
}

export function ravioliModeWriteOperationHashes(
  receipts: readonly PastaUiLivePublicReceipt[],
): string[][] {
  const partitions = ravioliProofPartitionWriteOperationHashes(receipts);
  return RAVIOLI_MODE_PROOF_PARTITIONS.map((partition) => [...partitions[partition]]);
}

export const RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS = new Set([
  "add_minter",
  "add_pack_minter",
  "update_operators",
  "create_allocation",
  "create_resource",
  "add_router",
  "create_pack",
  "commit_recipe",
  "finalize_pack",
  "finalize_blind_pack",
  "mint",
  "set_sale",
  "set_pack_contents",
]);
export const RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS = new Set([
  "buy",
  "open_pack",
  "transfer",
  "refund_blind_claims",
  "cancel_unrevealed_pack",
  "withdraw_refund",
]);

type JsonObject = Record<string, any>;

export type RavioliChildEditionPolicy = {
  contract: string;
  tokenId: number;
  maxSupply: number | null;
  end: string | null;
};

export function resolveRavioliLimitedEditionConstraint(input: {
  childPolicies: readonly RavioliChildEditionPolicy[];
  wrapperSaleEnabled: boolean;
  wrapperSaleEnd: string | null;
  wrapperMaxSupply: number;
  nowMs?: number;
}): { requiresLimitedWrapper: boolean; earliestChildEnd: string | null; wrapperSaleEnd: string | null } {
  assert.ok(
    Number.isSafeInteger(input.wrapperMaxSupply) && input.wrapperMaxSupply > 0 && input.wrapperMaxSupply <= 64,
    "Ravioli wrapper must have a finite edition supply between 1 and 64",
  );
  const nowMs = input.nowMs ?? Date.now();
  assert.ok(Number.isFinite(nowMs), "Ravioli LE policy requires a valid current time");
  const limitedEnds = input.childPolicies.flatMap((policy) => {
    assert.equal(validateContractAddress(policy.contract), ValidationResult.VALID, "Ravioli child policy contract is invalid");
    assert.ok(Number.isSafeInteger(policy.tokenId) && policy.tokenId >= 0, "Ravioli child policy token id is invalid");
    if (policy.maxSupply == null || policy.end == null) return [];
    assert.ok(Number.isSafeInteger(policy.maxSupply) && policy.maxSupply > 0, "Ravioli LE child supply cap is invalid");
    const endMs = Date.parse(policy.end);
    assert.ok(Number.isFinite(endMs), "Ravioli LE child end is invalid");
    return [endMs];
  });
  if (limitedEnds.length === 0) {
    const wrapperSaleEnd = input.wrapperSaleEnd == null ? null : new Date(Date.parse(input.wrapperSaleEnd)).toISOString();
    if (input.wrapperSaleEnd != null) assert.ok(Number.isFinite(Date.parse(input.wrapperSaleEnd)), "Ravioli sale end is invalid");
    return { requiresLimitedWrapper: false, earliestChildEnd: null, wrapperSaleEnd };
  }

  const earliestChildEndMs = Math.min(...limitedEnds);
  assert.ok(earliestChildEndMs > nowMs, "LE child mint window has already expired");
  assert.equal(input.wrapperSaleEnabled, true, "LE child requires a direct Ravioli sale");
  assert.ok(input.wrapperSaleEnd, "LE child requires a finite Ravioli sale end");
  const wrapperSaleEndMs = Date.parse(input.wrapperSaleEnd);
  assert.ok(Number.isFinite(wrapperSaleEndMs), "Ravioli sale end is invalid");
  assert.ok(wrapperSaleEndMs > nowMs, "Ravioli LE sale end must be in the future");
  assert.ok(
    wrapperSaleEndMs < earliestChildEndMs,
    "Ravioli sale must end before its earliest LE child",
  );
  return {
    requiresLimitedWrapper: true,
    earliestChildEnd: new Date(earliestChildEndMs).toISOString(),
    wrapperSaleEnd: new Date(wrapperSaleEndMs).toISOString(),
  };
}

export function ravioliDeliveredTokenExplorerUrls(input: {
  gnocchiAddress: string;
  limitedAllocationTokenId: number;
  foreverAllocationTokenId: number;
  rotiniAddress: string;
  rotiniGeneratedTokenIds: readonly [number, number, number];
}): string[][] {
  assert.equal(validateContractAddress(input.gnocchiAddress), ValidationResult.VALID, "Ravioli Gnocchi dependency address is invalid");
  assert.equal(validateContractAddress(input.rotiniAddress), ValidationResult.VALID, "Ravioli Rotini dependency address is invalid");
  assert.deepEqual(
    input.rotiniGeneratedTokenIds,
    [input.rotiniGeneratedTokenIds[0], input.rotiniGeneratedTokenIds[0] + 1, input.rotiniGeneratedTokenIds[0] + 2],
    "Ravioli Rotini generated token ids must be consecutive",
  );
  assert.ok(
    input.rotiniGeneratedTokenIds.every((tokenId) => Number.isSafeInteger(tokenId) && tokenId >= 0),
    "Ravioli Rotini generated token ids are invalid",
  );
  assert.ok(Number.isSafeInteger(input.limitedAllocationTokenId) && input.limitedAllocationTokenId >= 0);
  assert.ok(Number.isSafeInteger(input.foreverAllocationTokenId) && input.foreverAllocationTokenId >= 0);
  const gnocchi = (tokenId: number) => `https://shadownet.tzkt.io/${input.gnocchiAddress}/tokens/${tokenId}`;
  const rotini = (tokenId: number) => `https://shadownet.tzkt.io/${input.rotiniAddress}/tokens/${tokenId}`;
  return [
    [gnocchi(0)],
    [gnocchi(0), gnocchi(1)],
    [gnocchi(input.limitedAllocationTokenId)],
    [rotini(input.rotiniGeneratedTokenIds[0]), rotini(input.rotiniGeneratedTokenIds[1])],
    [
      gnocchi(input.foreverAllocationTokenId),
      gnocchi(input.foreverAllocationTokenId),
      rotini(input.rotiniGeneratedTokenIds[2]),
    ],
  ];
}

export function buildRavioliRevealCapability(input: {
  screenshots: Array<{ stage: string; caption: string }>;
  blindRevealArtifacts: Array<{ id: string; gatewayUrl?: string }>;
  contracts: Array<{ address: string; explorerUrl: string }>;
  operations: Array<{ hash: string; entrypoint?: string }>;
  blindTokens: Array<{ id: string; explorerUrl: string }>;
  supportingArtifactIds: string[];
}): JsonObject {
  const revealStages = input.screenshots
    .filter((screenshot) =>
      screenshot.caption.includes(
        "Blind reveal keys published for pre-sale encrypted envelopes",
      )
    )
    .map((screenshot) => screenshot.stage);
  assert.equal(revealStages.length, 1, "Ravioli needs exactly one blind-manifest reveal screenshot");
  assert.equal(
    input.blindRevealArtifacts.length,
    4,
    "Ravioli reveal proof needs all four authenticated pre-sale envelopes",
  );
  assert.equal(input.blindTokens.length, 4, "Ravioli reveal proof needs wrapper tokens one through four");
  const revealOperations = input.operations.filter((operation) => operation.entrypoint === "set_pack_contents");
  assert.equal(revealOperations.length, 4, "Ravioli reveal proof needs four applied set_pack_contents operations");
  return {
    id: "blind-sealed-reveal-ui-live-proof",
    description:
      "Reuse each authenticated encrypted envelope pinned before sale, then publish only its reveal key material and offset on-chain for four blind products, including clean-page decryption and open-kit discovery before a second holder opens.",
    evidence: {
      screenshots: revealStages,
      artifacts: [
        ...input.blindRevealArtifacts.map((artifact) => artifact.id),
        ...input.supportingArtifactIds,
      ],
      contracts: input.contracts.map((contract) => contract.address),
      operations: revealOperations.map((operation) => operation.hash),
      tokens: input.blindTokens.map((token) => token.id),
      roleEvidence: [],
      urls: [
        ...input.contracts.map((contract) => contract.explorerUrl),
        ...input.blindTokens.map((token) => token.explorerUrl),
        ...input.blindRevealArtifacts.map((artifact) => artifact.gatewayUrl).filter(Boolean),
      ],
    },
  };
}

type PinRecord = {
  value?: unknown;
  bytes?: Uint8Array;
  proof: PastaUiLivePinProof;
};

export function ravioliPublicRevealPin(
  pins: readonly PinRecord[],
  routerAddress: string,
  tokenId: number,
  expectedKit?: PackKit,
): PinRecord {
  const matches = pins.filter((pin) => {
    const value = pin.value as JsonObject | undefined;
    return value?.schema === "pasta-ravioli-public-reveal@1" &&
      value.contract === routerAddress && Number(value.tokenId) === tokenId;
  });
  assert.equal(matches.length, 1, `Ravioli token ${tokenId} needs exactly one pinned public reveal`);
  const pin = matches[0];
  const reveal = pin.value as JsonObject;
  assert.equal(reveal.network, "shadownet");
  assert.ok(MODE_NAMES.includes(reveal.mode));
  assert.match(String(reveal.manifestUri), /^ipfs:\/\//);
  assert.ok(reveal.openKit && typeof reveal.openKit === "object");
  assert.equal(reveal.openKit.schema, "pasta-ravioli-open-kit@3");
  assert.equal(reveal.openKit.contract, routerAddress);
  assert.equal(Number(reveal.openKit.tokenId), tokenId);
  assert.equal(reveal.openKit.manifestUri, reveal.manifestUri);
  assert.equal(Number(reveal.maxSupply), reveal.openKit.recipes?.length);
  assert.equal(Number(reveal.itemCount), reveal.openKit.recipes?.[0]?.actions?.length || 0);
  if (expectedKit) {
    assert.equal(
      sha256(deterministicJsonBytes(reveal.openKit)),
      sha256(deterministicJsonBytes(expectedKit)),
      `Ravioli token ${tokenId} public reveal changed its captured open kit`,
    );
  }
  return pin;
}

export function ravioliContentsEvidencePin(
  pins: readonly PinRecord[],
  routerAddress: string,
  tokenId: number,
  expectedKit: PackKit,
): PinRecord {
  if (tokenId === 0) {
    return ravioliPublicRevealPin(
      pins,
      routerAddress,
      tokenId,
      expectedKit,
    );
  }
  const sealed = expectedKit.sealedReveal;
  assert.ok(sealed, `Ravioli blind token ${tokenId} requires its sealed reveal reference`);
  assert.equal(expectedKit.contract, routerAddress);
  assert.equal(expectedKit.tokenId, tokenId);
  const matches = pins.filter((pin) => {
    const value = pin.value as JsonObject | undefined;
    const aad = value?.aad as JsonObject | undefined;
    return value?.schema === "pasta-ravioli-sealed-reveal@1"
      && aad?.schema === "pasta-ravioli-sealed-reveal@1"
      && aad?.network === "shadownet"
      && aad?.contract === routerAddress
      && Number(aad?.tokenId) === tokenId
      && aad?.manifestUri === expectedKit.manifestUri
      && pin.proof.uri === sealed.contentsUri
      && pin.proof.sha256 === sealed.envelopeSha256;
  });
  assert.equal(
    matches.length,
    1,
    `Ravioli blind token ${tokenId} needs exactly one authenticated sealed reveal`,
  );
  const envelope = matches[0].value as JsonObject;
  assert.equal(envelope.cipher, "AES-256-GCM");
  assert.equal(
    envelope.keyDerivation,
    "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
  );
  assert.match(String(envelope.iv || ""), /^[A-Za-z0-9+/]{16}$/);
  assert.match(String(envelope.ciphertext || ""), /^[A-Za-z0-9+/]+={0,2}$/);
  return matches[0];
}
type ActorPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  monitor: PastaProofPageMonitor;
};
type HistoricalDependencyEvidence = {
  runId: string;
  recovery: {
    receipt: JsonObject;
    receiptSha256: string;
    receiptPath: string;
    acceptedEvidenceHashes: AcceptedEvidenceHashes;
  };
  nativeRecovery: {
    receipt: JsonObject;
    receiptSha256: string;
    receiptPath: string;
    handoff: RavioliNativeRecoveryHandoff;
    liveVerification: RavioliNativeRecoveryLiveVerification;
  };
  prepackRecovery: {
    preflight: JsonObject;
    preflightSha256: string;
    preflightPath: string;
    intent: JsonObject;
    intentSha256: string;
    intentPath: string;
    progress: JsonObject;
    progressSha256: string;
    progressPath: string;
    receipt: JsonObject;
    receiptSha256: string;
    receiptPath: string;
  };
  gnocchi: {
    address: string;
    allocationTokenId: number;
    limitedAllocationTokenId: number;
    tokenMetadataUris: string[];
    creatorBalances: Record<string, number>;
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
    limitedEdition: {
      receipt: RavioliGnocchiLeDependencyReceipt;
      receiptPath: string;
      receiptSha256: string;
    };
  };
  rotini: {
    address: string;
    projectId: number;
    nextTokenId: number;
    generatedTokenIds: [number, number];
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
  };
  tzkt: JsonObject;
};

type DependencyEvidence = {
  runId: string;
  fresh: FreshRavioliDependencies;
  liveCheck: FreshRavioliDependencyLiveCheck | RavioliMode0ReplayDependencyLiveCheck;
  gnocchi: {
    address: string;
    allocationTokenId: 1;
    limitedAllocationTokenId: 2;
    tokenMetadataUris: [string, string, string];
    creatorBalances: Record<string, number>;
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
    limitedEdition: {
      receipt: JsonObject;
      receiptPath: string;
      receiptSha256: string;
    };
  };
  rotini: {
    address: string;
    projectId: 0;
    nextTokenId: 3;
    generatedTokenIds: [number, number, number];
    manifestSha256: string;
    receiptSha256: string;
    manifestPath: string;
    receiptPath: string;
  };
  tzkt: JsonObject;
};
export type TzktBalanceRequirement = {
  owner: string;
  tokenId: number;
  balance: number;
};

type RavioliProofOperationRecord = {
  kind: string;
  hash: string;
  contractAddress?: string;
  entrypoint?: string;
  status: "applied";
  explorerUrl: string;
};

type RavioliOpenKitArtifact = {
  id: string;
  kind: "open-kit";
  path: string;
  sha256: string;
};
export type PackKit = {
  schema: string;
  network: string;
  contract: string;
  tokenId: number;
  mode: string;
  manifestUri: string;
  blindSecurity: string;
  warning: string;
  editionPolicy: {
    requiresLimitedWrapper: boolean;
    wrapperEditionClass: "fixed-supply" | "limited-edition";
    earliestChildEnd: string | null;
    wrapperSaleStart: string | null;
    wrapperSaleEnd: string | null;
    revealDeadline: string | null;
    openDeadline: string | null;
  };
  sealedReveal?: {
    schema: "pasta-ravioli-sealed-reveal-reference@1";
    contentsUri: string;
    salt: string;
    offset: number;
    envelopeSha256: string;
  };
  recipes: Array<{ serial: number; nonce: string; actions: JsonObject[] }>;
};
export type RavioliOpenKitDownloadCapture = {
  tokenId: number;
  mode: string;
  fileName: string;
  relativePath: string;
  sha256: string;
  bytes: Uint8Array;
  kit: PackKit;
};
type PackSnapshot = {
  mode: number;
  blind: boolean;
  item_count: number;
  max_supply: number;
  committed_recipes: number;
  finalized: boolean;
  cancelled: boolean;
  contents_uri: string | null;
  manifest_uri: string;
  child_expiry: string | null;
  wrapper_sale_end: string | null;
  reveal_deadline: string | null;
  open_deadline: string | null;
  reveal_commitment: string | null;
};
type SaleSnapshot = {
  active: boolean;
  seller: string;
  treasury: string;
  price: number;
  remaining: number;
  start: string | null;
  end: string | null;
};
type RavioliUiLiveResult = {
  routerAddress: string;
  blindControllerAddress: string;
  adapterAddresses: { gnocchi: string; rotini: string };
  manifestPath: string;
  receiptPath: string;
  operationHashes: string[];
  screenshots: CapturePastaProofStageResult[];
  memorySamples: RavioliUiLiveMemorySample[];
};

type RavioliCurrentV4PreflightResult = {
  classification: "RAVIOLI-CURRENT-V4-READ-ONLY-PREFLIGHT";
  verifiedAt: string;
  journalId: string;
  eventCount: 40;
  pinCount: 12;
  operationCount: 9;
  preRestartFileCount: 72;
  controllerAddress: string;
  routerAddress: string;
  creatorCounter: number;
  dependencyClassification: string;
  creatorBalanceMutez: number;
  estimatedRemainingOriginationMutez: number;
  live: JsonObject;
};

type RavioliCurrentV3PreflightResult = Omit<
  RavioliCurrentV4PreflightResult,
  "classification" | "eventCount" | "pinCount" | "preRestartFileCount"
> & {
  classification: "RAVIOLI-CURRENT-V3-READ-ONLY-PREFLIGHT";
  eventCount: 37;
  pinCount: 9;
  preRestartFileCount: number;
};

type RavioliProofPackageCoreInput = {
  runId: string;
  rpcUrl: string;
  startedAt: string;
  completedAt: string;
  dependencies: DependencyEvidence;
  actors: { creator: string; collectorOne: string; collectorTwo: string };
  funding: JsonObject;
  mirror: RavioliUiStateMirror;
  kits: PackKit[];
  withheldRefundKit: PackKit;
  publicRevealUris: string[];
  openKitCaptures: RavioliOpenKitDownloadCapture[];
  pins: PinRecord[];
  screenshots: CapturePastaProofStageResult[];
  receipts: PastaUiLivePublicReceipt[];
  writeReceipts: PastaUiLivePublicReceipt[];
  operationHashes: string[];
  indexed: JsonObject;
  negativeAssertions: string[];
  capacityChecks: JsonObject[];
  memorySamples: RavioliUiLiveMemorySample[];
  mode1PreOp10Proof?: RavioliMode1PreOp10Proof | null;
  currentV3RestartEvidence?: JsonObject | null;
  journalFinalization: RavioliUiLiveJournalFinalization;
  journalFinalBytes: Uint8Array;
  mutationRecoveryEvidence?: RavioliMode0MutationRecoveryEvidence | null;
};

type RavioliProofPackageIndexedInputs = {
  limitedCommitHash: string;
  generativeOpenHash: string;
  hybridOpenHash: string;
  wrapperPurchaseCheckpoints: JsonObject[];
  openDeliveryOutcomes: JsonObject[];
  withheldRefundOutcome: JsonObject;
};

type RavioliProofPackageCheckpointInput = Omit<
  RavioliProofPackageCoreInput,
  "indexed" | "journalFinalization" | "journalFinalBytes"
> & {
  indexedInputs: RavioliProofPackageIndexedInputs;
};

type RavioliProofPackageCheckpointEvidence = {
  relativePath: typeof RAVIOLI_PACKAGE_CHECKPOINT_RELATIVE_PATH;
  absolutePath: string;
  sha256: string;
  byteLength: number;
};

type RavioliProofPackageWriteInput = RavioliProofPackageCoreInput & {
  appRoot: string;
  runRoot: string;
  packageCheckpoint: RavioliProofPackageCheckpointEvidence;
};

type RavioliPackageResumeCheckpointEnvelope = {
  schema: typeof RAVIOLI_PACKAGE_CHECKPOINT_SCHEMA;
  status: "READY_TO_PACKAGE";
  scope: {
    runId: string;
    appPath: "ravioli";
  };
  payloadSha256: string;
  payload: JsonObject;
};

export type RavioliUiLiveMemorySample = {
  stage: string;
  sampledAtUtc: string;
  heapCeilingBytes: number;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
};

type RavioliMemoryUsage = Pick<
  NodeJS.MemoryUsage,
  "rss" | "heapTotal" | "heapUsed" | "external" | "arrayBuffers"
>;

export function sampleRavioliUiLiveMemory(
  stage: string,
  options: {
    usage?: RavioliMemoryUsage;
    sampledAtUtc?: string;
    heapCeilingBytes?: number;
  } = {},
): RavioliUiLiveMemorySample {
  assert.ok(stage.trim(), "Ravioli memory sample stage is required");
  const usage = options.usage || process.memoryUsage();
  const heapCeilingBytes = options.heapCeilingBytes ?? RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES;
  assert.ok(Number.isSafeInteger(heapCeilingBytes) && heapCeilingBytes > 0, "Ravioli heap ceiling must be a positive safe integer");
  assert.ok(
    usage.heapUsed <= heapCeilingBytes,
    `Ravioli UI-live heap ceiling exceeded at ${stage}: ${usage.heapUsed} > ${heapCeilingBytes} bytes`,
  );
  return {
    stage,
    sampledAtUtc: options.sampledAtUtc || new Date().toISOString(),
    heapCeilingBytes,
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function ravioliTokenInfoValue(
  value: unknown,
  key: string,
  label = "Ravioli token_info",
): unknown {
  if (
    value
    && typeof value === "object"
    && typeof (value as { get?: unknown }).get === "function"
  ) {
    const result = (value as { get(value: string): unknown }).get(key);
    assert.notEqual(result, undefined, `${label} is missing key ${JSON.stringify(key)}`);
    return result;
  }
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is not a map`);
  const source = value as JsonObject;
  const entries = Array.isArray(source.$map)
    ? source.$map
    : source.__pastaRecoveryType === "MichelsonMap" && Array.isArray(source.entries)
      ? source.entries
      : Object.entries(source);
  const matches = entries.filter((entry) =>
    Array.isArray(entry) && entry.length === 2 && entry[0] === key
  );
  assert.equal(matches.length, 1, `${label} needs exactly one key ${JSON.stringify(key)}`);
  return (matches[0] as unknown[])[1];
}

function ravioliCheckpointRecord(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

export function encodeRavioliPackageResumeCheckpoint(input: {
  scope: { runId: string; appPath: "ravioli" };
  payload: JsonObject;
}): Uint8Array {
  const scope = {
    runId: String(input.scope.runId || ""),
    appPath: input.scope.appPath,
  };
  assert.ok(scope.runId.length > 0 && !/[\\/\0\r\n]/.test(scope.runId), "Ravioli package checkpoint run scope is invalid");
  assert.equal(scope.appPath, "ravioli", "Ravioli package checkpoint app scope is invalid");
  const payloadBytes = deterministicJsonBytes(input.payload);
  return deterministicJsonBytes({
    schema: RAVIOLI_PACKAGE_CHECKPOINT_SCHEMA,
    status: "READY_TO_PACKAGE",
    scope,
    payloadSha256: sha256(payloadBytes),
    payload: input.payload,
  } satisfies RavioliPackageResumeCheckpointEnvelope);
}

export function decodeRavioliPackageResumeCheckpoint(bytes: Uint8Array): RavioliPackageResumeCheckpointEnvelope {
  const value = ravioliCheckpointRecord(JSON.parse(Buffer.from(bytes).toString("utf8")), "Ravioli package checkpoint");
  assert.deepEqual(
    Buffer.from(deterministicJsonBytes(value)),
    Buffer.from(bytes),
    "Ravioli package checkpoint is not canonical deterministic JSON",
  );
  assert.equal(value.schema, RAVIOLI_PACKAGE_CHECKPOINT_SCHEMA, "Ravioli package checkpoint schema drift");
  assert.equal(value.status, "READY_TO_PACKAGE", "Ravioli package checkpoint is not ready");
  const scope = ravioliCheckpointRecord(value.scope, "Ravioli package checkpoint scope");
  assert.ok(String(scope.runId || "").length > 0 && !/[\\/\0\r\n]/.test(scope.runId), "Ravioli package checkpoint run id drift");
  assert.equal(scope.appPath, "ravioli", "Ravioli package checkpoint app path drift");
  const payload = ravioliCheckpointRecord(value.payload, "Ravioli package checkpoint payload");
  assert.match(String(value.payloadSha256 || ""), /^[0-9a-f]{64}$/, "Ravioli package checkpoint payload digest is invalid");
  assert.equal(sha256(deterministicJsonBytes(payload)), value.payloadSha256, "Ravioli package checkpoint payload digest drift");
  return value as RavioliPackageResumeCheckpointEnvelope;
}

export async function checkpointRavioliBeforeTerminalVerification<Checkpoint, Terminal>(
  persistCheckpoint: () => Promise<Checkpoint>,
  terminalVerification: () => Promise<Terminal>,
): Promise<{ checkpoint: Checkpoint; terminal: Terminal }> {
  const checkpoint = await persistCheckpoint();
  const terminal = await terminalVerification();
  return { checkpoint, terminal };
}

function asSafeInteger(value: unknown, label: string): number {
  const converted = typeof value === "object" && value && "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  assert.ok(Number.isSafeInteger(converted), `${label} must be a safe integer`);
  return converted;
}

export function optionValue(value: unknown, label: string): unknown {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const hasUpperSome = Object.prototype.hasOwnProperty.call(record, "Some");
  const hasLowerSome = Object.prototype.hasOwnProperty.call(record, "some");
  const hasUpperNone = Object.prototype.hasOwnProperty.call(record, "None");
  const hasLowerNone = Object.prototype.hasOwnProperty.call(record, "none");
  const wrappedKeys = [hasUpperSome, hasLowerSome, hasUpperNone, hasLowerNone].filter(Boolean).length;
  if (wrappedKeys > 0) {
    assert.equal(wrappedKeys, 1, `${label} option wrapper is ambiguous`);
    assert.equal(Object.keys(record).length, 1, `${label} option wrapper has unexpected fields`);
    if (hasUpperNone || hasLowerNone) return null;
    const unwrapped = hasUpperSome ? record.Some : record.some;
    assert.notEqual(unwrapped, undefined, `${label} Some payload is missing`);
    return unwrapped;
  }
  if (record.prim === "None") {
    const args = record.args;
    assert.ok(args === undefined || (Array.isArray(args) && args.length === 0), `${label} Micheline None is malformed`);
    return null;
  }
  if (record.prim === "Some") {
    const args = record.args;
    assert.ok(Array.isArray(args) && args.length === 1, `${label} Micheline Some is malformed`);
    const child = args[0];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const childRecord = child as Record<string, unknown>;
      for (const field of ["int", "string", "bytes"] as const) {
        if (Object.prototype.hasOwnProperty.call(childRecord, field)) return childRecord[field];
      }
    }
    return child;
  }
  return value;
}

export function requiredOptionSafeInteger(value: unknown, label: string): number {
  const unwrapped = optionValue(value, label);
  assert.notEqual(unwrapped, null, `${label} must be Some/non-null`);
  assert.notEqual(unwrapped, undefined, `${label} must be Some/non-null`);
  return asSafeInteger(unwrapped, label);
}

function optionalSafeInteger(value: unknown, label: string): number | null {
  const unwrapped = optionValue(value, label);
  return unwrapped == null ? null : asSafeInteger(unwrapped, label);
}

function mapGet(map: unknown, key: unknown): unknown {
  assert.ok(map instanceof MichelsonMap, "expected MichelsonMap");
  return map.get(key);
}

function metadataUri(storage: JsonObject): string {
  const encoded = mapGet(storage.metadata, "");
  assert.equal(typeof encoded, "string");
  return hexToUtf8(String(encoded));
}

function metadataMap(uri: string): MichelsonMap<string, string> {
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", utf8ToHex(uri));
  return metadata;
}

function blindControllerStorage(uri: string) {
  return {
    metadata: metadataMap(uri),
    packs: new MichelsonMap(),
    claim_counts: new MichelsonMap(),
    claim_slots: new MichelsonMap(),
    consumed_serials: new MichelsonMap(),
    refund_credits: new MichelsonMap(),
  };
}

function routerStorage(administrator: string, uri: string, blindController: string) {
  return {
    administrator,
    pending_administrator: null,
    blind_controller: blindController,
    metadata: metadataMap(uri),
    ledger: new MichelsonMap(),
    operators: new MichelsonMap(),
    token_metadata: new MichelsonMap(),
    total_supply: new MichelsonMap(),
    packs: new MichelsonMap(),
    recipe_commitments: new MichelsonMap(),
    minted: new MichelsonMap(),
    opened: new MichelsonMap(),
    asset_allowances: new MichelsonMap(),
    adapter_allowances: new MichelsonMap(),
    sales: new MichelsonMap(),
    minters: new MichelsonMap(),
    next_token_id: 0,
  };
}

function adapterStorage(administrator: string, uri: string, kind: "gnocchi" | "rotini") {
  const base = {
    administrator,
    pending_administrator: null,
    metadata: metadataMap(uri),
    routers: new MichelsonMap(),
    reservations: new MichelsonMap(),
    next_resource_id: 0,
  };
  return kind === "gnocchi"
    ? { ...base, allocations: new MichelsonMap() }
    : { ...base, resources: new MichelsonMap() };
}

function primitive(action: JsonObject): string {
  const keys = Object.keys(action);
  assert.equal(keys.length, 1, "Ravioli action must have exactly one primitive");
  return keys[0];
}

const RAVIOLI_RECIPE_COMMITMENT_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    {
      prim: "list",
      args: [{
        prim: "or",
        args: [
          { prim: "pair", args: [{ prim: "address" }, { prim: "pair", args: [{ prim: "option", args: [{ prim: "bytes" }] }, { prim: "nat" }] }] },
          {
            prim: "or",
            args: [
              { prim: "pair", args: [{ prim: "nat" }, { prim: "pair", args: [{ prim: "address" }, { prim: "nat" }] }] },
              { prim: "pair", args: [{ prim: "address" }, { prim: "pair", args: [{ prim: "option", args: [{ prim: "bytes" }] }, { prim: "nat" }] }] },
            ],
          },
        ],
      }],
    },
  ],
} as const;

const RAVIOLI_REVEAL_COMMITMENT_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
} as const;

function commitmentOption(value: unknown): JsonObject {
  return value == null ? { prim: "None" } : { prim: "Some", args: [{ bytes: String(value).replace(/^0x/, "") }] };
}

function reservationMicheline(reservation: JsonObject): JsonObject {
  const kind = primitive(reservation);
  const value = reservation[kind] as JsonObject;
  if (kind === "allocated_mint") {
    return {
      prim: "Left",
      args: [{ prim: "Pair", args: [{ string: String(value.adapter) }, { prim: "Pair", args: [commitmentOption(value.payload_commitment), { int: String(value.resource_id) }] }] }],
    };
  }
  if (kind === "escrow") {
    return {
      prim: "Right",
      args: [{ prim: "Left", args: [{ prim: "Pair", args: [{ int: String(value.amount) }, { prim: "Pair", args: [{ string: String(value.fa2) }, { int: String(value.token_id) }] }] }] }],
    };
  }
  assert.equal(kind, "generative_mint", "unsupported Ravioli reservation primitive");
  return {
    prim: "Right",
    args: [{ prim: "Right", args: [{ prim: "Pair", args: [{ string: String(value.adapter) }, { prim: "Pair", args: [commitmentOption(value.payload_commitment), { int: String(value.resource_id) }] }] }] }],
  };
}

function committedRecipeHash(nonceCommitment: string, reservations: JsonObject[]): string {
  assert.match(nonceCommitment, /^[0-9a-f]{64}$/);
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [{ bytes: nonceCommitment }, reservations.map(reservationMicheline)],
    } as any,
    RAVIOLI_RECIPE_COMMITMENT_TYPE as any,
  ).bytes;
  return Buffer.from(blake2b(Buffer.from(packed, "hex"), undefined, 32)).toString("hex");
}

function ravioliRevealCommitment(contentsUri: string, salt: string, offset: number): string {
  assert.match(contentsUri, /^ipfs:\/\/[^\s]{1,249}$/);
  assert.match(salt, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(offset) && offset >= 0);
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [
        { bytes: Buffer.from(contentsUri, "utf8").toString("hex") },
        {
          prim: "Pair",
          args: [{ int: String(offset) }, { bytes: salt }],
        },
      ],
    } as any,
    RAVIOLI_REVEAL_COMMITMENT_TYPE as any,
  ).bytes;
  return Buffer.from(blake2b(Buffer.from(packed, "hex"), undefined, 32)).toString("hex");
}

function normalizePack(value: JsonObject): PackSnapshot {
  return {
    mode: asSafeInteger(value.mode, "pack mode"),
    blind: value.blind === true,
    item_count: asSafeInteger(value.item_count, "item count"),
    max_supply: asSafeInteger(value.max_supply, "max supply"),
    committed_recipes: asSafeInteger(value.committed_recipes, "committed recipes"),
    finalized: value.finalized === true,
    cancelled: value.cancelled === true,
    contents_uri: value.contents_uri == null ? null : String(value.contents_uri),
    manifest_uri: String(value.manifest_uri || ""),
    child_expiry: value.child_expiry == null ? null : String(value.child_expiry),
    wrapper_sale_end: value.wrapper_sale_end == null ? null : String(value.wrapper_sale_end),
    reveal_deadline: value.reveal_deadline == null ? null : String(value.reveal_deadline),
    open_deadline: value.open_deadline == null ? null : String(value.open_deadline),
    reveal_commitment: value.reveal_commitment == null ? null : String(value.reveal_commitment),
  };
}

export class RavioliUiStateMirror {
  administrator = "";
  routerAddress = "";
  blindControllerAddress = "";
  gnocchiAdapterAddress = "";
  rotiniAdapterAddress = "";
  readonly packs = new Map<number, PackSnapshot>();
  readonly tokenMetadata = new Map<number, unknown>();
  readonly totalSupply = new Map<number, number>();
  readonly minted = new Map<number, number>();
  readonly opened = new Map<number, number>();
  readonly sales = new Map<number, SaleSnapshot>();
  readonly recipeCommitments = new Map<string, string>();
  readonly assetAllowances = new Map<string, number>();
  readonly adapterAllowances = new Map<string, number>();
  readonly adapterReservations = new Map<string, number>();
  readonly ledger = new Map<string, number>();
  readonly refundCredits = new Map<string, number>();
  readonly blindClaims = new Map<string, number[]>();
  readonly blindNextClaimId = new Map<number, number>();
  readonly blindRevealOffsets = new Map<number, number>();
  readonly gnocchiAllocations = new Map<number, JsonObject>();
  readonly rotiniResources = new Map<number, JsonObject>();
  readonly kits = new Map<number, PackKit>();
  nextTokenId = 0;
  gnocchiNextResourceId = 0;
  rotiniNextResourceId = 0;

  setAdministrator(address: string): void {
    assert.equal(validateAddress(address), ValidationResult.VALID);
    if (this.administrator) {
      assert.equal(this.administrator, address, "Ravioli mirror administrator drift");
      return;
    }
    this.administrator = address;
  }

  bindOrigination(
    kind: "blindController" | "router" | "gnocchiAdapter" | "rotiniAdapter",
    address: string,
  ): void {
    assert.equal(validateContractAddress(address), ValidationResult.VALID);
    const field = kind === "blindController"
      ? "blindControllerAddress"
      : kind === "router"
        ? "routerAddress"
        : kind === "gnocchiAdapter"
          ? "gnocchiAdapterAddress"
          : "rotiniAdapterAddress";
    assert.equal(this[field], "", `${kind} may only originate once`);
    this[field] = address;
  }

  registerKit(kit: PackKit): void {
    assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
    assert.equal(kit.contract, this.routerAddress);
    assert.equal(kit.tokenId, this.kits.size);
    assert.equal(kit.recipes.length, proofPackSpec(kit.tokenId)?.editions);
    this.kits.set(kit.tokenId, structuredClone(kit));
  }

  private ledgerKey(owner: string, tokenId: number): string {
    return `${owner}:${tokenId}`;
  }

  private addBalance(owner: string, tokenId: number, amount: number): void {
    const key = this.ledgerKey(owner, tokenId);
    const next = (this.ledger.get(key) || 0) + amount;
    assert.ok(next >= 0, "wrapper balance cannot become negative");
    if (next === 0) this.ledger.delete(key);
    else this.ledger.set(key, next);
  }

  private claimKey(owner: string, tokenId: number): string {
    return `${owner}:${tokenId}`;
  }

  private assetAllowanceKey(
    packTokenId: number,
    fa2: string,
    assetTokenId: number,
  ): string {
    return `${packTokenId}:${fa2}:${assetTokenId}`;
  }

  private adapterAllowanceKey(
    packTokenId: number,
    adapter: string,
    kind: number,
    resourceId: number,
  ): string {
    return `${packTokenId}:${adapter}:${kind}:${resourceId}`;
  }

  private adapterReservationKey(
    adapter: string,
    packTokenId: number,
    resourceId: number,
  ): string {
    return `${adapter}:${packTokenId}:${resourceId}`;
  }

  private adjustTrackedCapacity(
    map: Map<string, number>,
    key: string,
    delta: number,
    label: string,
  ): void {
    const next = (map.get(key) || 0) + delta;
    assert.ok(next >= 0, `${label} cannot become negative`);
    if (next === 0) map.delete(key);
    else map.set(key, next);
  }

  private claimsFor(owner: string, tokenId: number): number[] {
    const key = this.claimKey(owner, tokenId);
    const claims = this.blindClaims.get(key);
    if (claims) return claims;
    const created: number[] = [];
    this.blindClaims.set(key, created);
    return created;
  }

  resolveBlindClaim(
    owner: string,
    tokenId: number,
  ): { expectedClaimId: number; serial: number } {
    const claims = this.blindClaims.get(this.claimKey(owner, tokenId)) || [];
    assert.ok(claims.length > 0, "Ravioli blind holder has no mirrored claim");
    const expectedClaimId = claims.at(-1)!;
    const offset = this.blindRevealOffsets.get(tokenId);
    const pack = this.packs.get(tokenId);
    assert.ok(offset !== undefined && pack, "Ravioli blind claim is not revealed");
    return {
      expectedClaimId,
      serial: (expectedClaimId + offset) % pack.max_supply,
    };
  }

  outstandingBlindClaimCount(tokenId: number): number {
    let count = 0;
    for (const [key, claims] of this.blindClaims) {
      if (key.endsWith(`:${tokenId}`)) count += claims.length;
    }
    return count;
  }

  applySuccessfulCall(contractAddress: string, entrypoint: string, payload: unknown, signer: string): void {
    const value = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as JsonObject
      : {};
    if (contractAddress === this.blindControllerAddress && entrypoint === "withdraw_refund") {
      const amount = asSafeInteger(value.amount, "refund withdrawal amount");
      const current = this.refundCredits.get(signer) || 0;
      assert.ok(current >= amount, "refund withdrawal exceeds mirrored credit");
      const remaining = current - amount;
      if (remaining === 0) this.refundCredits.delete(signer);
      else this.refundCredits.set(signer, remaining);
      return;
    }
    if (contractAddress === this.gnocchiAdapterAddress && entrypoint === "create_allocation") {
      this.gnocchiAllocations.set(this.gnocchiNextResourceId, structuredClone(value));
      this.gnocchiNextResourceId += 1;
      return;
    }
    if (
      contractAddress === this.routerAddress
      && entrypoint === "recover_adapter"
    ) {
      const tokenId = asSafeInteger(value.token_id, "recover adapter token id");
      const adapter = String(value.adapter);
      const kind = asSafeInteger(value.kind, "recover adapter kind");
      const resourceId = asSafeInteger(value.resource_id, "recover adapter resource id");
      const capacity = asSafeInteger(value.capacity, "recover adapter capacity");
      this.adjustTrackedCapacity(
        this.adapterAllowances,
        this.adapterAllowanceKey(tokenId, adapter, kind, resourceId),
        -capacity,
        "Ravioli adapter allowance",
      );
      this.adjustTrackedCapacity(
        this.adapterReservations,
        this.adapterReservationKey(adapter, tokenId, resourceId),
        -capacity,
        "Ravioli adapter reservation",
      );
      return;
    }
    if (contractAddress === this.rotiniAdapterAddress && entrypoint === "create_resource") {
      this.rotiniResources.set(this.rotiniNextResourceId, structuredClone(value));
      this.rotiniNextResourceId += 1;
      return;
    }
    if (contractAddress !== this.routerAddress) return;
    if (entrypoint === "create_pack") {
      const tokenId = this.nextTokenId++;
      this.packs.set(tokenId, normalizePack(value.config));
      this.tokenMetadata.set(tokenId, { token_id: tokenId, token_info: value.token_info });
      this.totalSupply.set(tokenId, 0);
      this.minted.set(tokenId, 0);
      this.opened.set(tokenId, 0);
      return;
    }
    if (entrypoint === "commit_recipe") {
      const tokenId = asSafeInteger(value.token_id, "commit token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      const serial = pack.committed_recipes;
      assert.ok(Array.isArray(value.reservations));
      this.recipeCommitments.set(
        `${tokenId}:${serial}`,
        committedRecipeHash(String(value.nonce_commitment), value.reservations as JsonObject[]),
      );
      for (const reservation of value.reservations as JsonObject[]) {
        const kind = primitive(reservation);
        const action = reservation[kind] as JsonObject;
        if (kind === "escrow") {
          const amount = asSafeInteger(action.amount, "escrow reservation amount");
          this.adjustTrackedCapacity(
            this.assetAllowances,
            this.assetAllowanceKey(
              tokenId,
              String(action.fa2),
              asSafeInteger(action.token_id, "escrow reservation token id"),
            ),
            amount,
            "Ravioli asset allowance",
          );
        } else {
          const adapter = String(action.adapter);
          const resourceId = asSafeInteger(
            action.resource_id,
            "adapter reservation resource id",
          );
          const adapterKind = kind === "allocated_mint" ? 1 : 2;
          this.adjustTrackedCapacity(
            this.adapterAllowances,
            this.adapterAllowanceKey(
              tokenId,
              adapter,
              adapterKind,
              resourceId,
            ),
            1,
            "Ravioli adapter allowance",
          );
          this.adjustTrackedCapacity(
            this.adapterReservations,
            this.adapterReservationKey(adapter, tokenId, resourceId),
            1,
            "Ravioli adapter reservation",
          );
        }
      }
      pack.committed_recipes += 1;
      return;
    }
    if (entrypoint === "finalize_pack") {
      const tokenId = asSafeInteger(payload, "finalize token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      pack.finalized = true;
      return;
    }
    if (entrypoint === "finalize_blind_pack") {
      const tokenId = asSafeInteger(value.token_id, "atomic blind token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack?.blind);
      pack.finalized = true;
      const amount = pack.max_supply;
      this.totalSupply.set(tokenId, amount);
      this.minted.set(tokenId, amount);
      this.addBalance(signer, tokenId, amount);
      const sale = value.sale as JsonObject;
      this.sales.set(tokenId, {
        active: sale.active === true,
        seller: String(sale.seller),
        treasury: String(sale.treasury),
        price: asSafeInteger(sale.price, "atomic blind sale price"),
        remaining: asSafeInteger(sale.remaining, "atomic blind sale remaining"),
        start: sale.start == null ? null : String(sale.start),
        end: sale.end == null ? null : String(sale.end),
      });
      return;
    }
    if (entrypoint === "mint") {
      const tokenId = asSafeInteger(value.token_id, "mint token id");
      const amount = asSafeInteger(value.amount, "mint amount");
      this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) + amount);
      this.minted.set(tokenId, (this.minted.get(tokenId) || 0) + amount);
      this.addBalance(String(value.to_), tokenId, amount);
      return;
    }
    if (entrypoint === "set_sale") {
      const tokenId = asSafeInteger(value.token_id, "sale token id");
      const sale = value.sale as JsonObject;
      this.sales.set(tokenId, {
        active: sale.active === true,
        seller: String(sale.seller),
        treasury: String(sale.treasury),
        price: asSafeInteger(sale.price, "sale price"),
        remaining: asSafeInteger(sale.remaining, "sale remaining"),
        start: sale.start == null ? null : String(sale.start),
        end: sale.end == null ? null : String(sale.end),
      });
      return;
    }
    if (entrypoint === "buy") {
      const tokenId = asSafeInteger(value.token_id, "buy token id");
      const amount = asSafeInteger(value.amount, "buy amount");
      const sale = this.sales.get(tokenId);
      assert.ok(sale && sale.remaining >= amount);
      sale.remaining -= amount;
      this.addBalance(sale.seller, tokenId, -amount);
      this.addBalance(signer, tokenId, amount);
      if (this.packs.get(tokenId)?.blind) {
        const nextClaimId = this.blindNextClaimId.get(tokenId) || 0;
        const claims = this.claimsFor(signer, tokenId);
        for (let index = 0; index < amount; index += 1) {
          claims.push(nextClaimId + index);
        }
        this.blindNextClaimId.set(tokenId, nextClaimId + amount);
      }
      return;
    }
    if (entrypoint === "transfer") {
      assert.ok(Array.isArray(payload) && payload.length === 1);
      const source = payload[0] as JsonObject;
      assert.ok(Array.isArray(source.txs) && source.txs.length === 1);
      const transfer = source.txs[0] as JsonObject;
      const tokenId = asSafeInteger(transfer.token_id, "transfer token id");
      const amount = asSafeInteger(transfer.amount, "transfer amount");
      assert.equal(amount, 1);
      this.addBalance(String(source.from_), tokenId, -amount);
      this.addBalance(String(transfer.to_), tokenId, amount);
      if (this.packs.get(tokenId)?.blind) {
        const sourceClaims = this.claimsFor(String(source.from_), tokenId);
        assert.ok(sourceClaims.length >= amount);
        const moved = sourceClaims.splice(sourceClaims.length - amount, amount);
        if (sourceClaims.length === 0) {
          this.blindClaims.delete(this.claimKey(String(source.from_), tokenId));
        }
        this.claimsFor(String(transfer.to_), tokenId).push(...moved);
      }
      return;
    }
    if (entrypoint === "refund_blind_claims") {
      const tokenId = asSafeInteger(value.token_id, "refund token id");
      const amount = asSafeInteger(value.amount, "refund amount");
      const holder = String(value.holder);
      const expectedClaimId = asSafeInteger(value.expected_claim_id, "refund claim id");
      const claims = this.claimsFor(holder, tokenId);
      assert.equal(claims.at(-1), expectedClaimId, "mirrored refund claim changed");
      claims.pop();
      if (claims.length === 0) this.blindClaims.delete(this.claimKey(holder, tokenId));
      this.addBalance(holder, tokenId, -amount);
      this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) - amount);
      this.minted.set(tokenId, (this.minted.get(tokenId) || 0) - amount);
      const price = this.sales.get(tokenId)?.price || 0;
      this.refundCredits.set(holder, (this.refundCredits.get(holder) || 0) + amount * price);
      return;
    }
    if (entrypoint === "cancel_unrevealed_pack") {
      const tokenId = asSafeInteger(payload, "cancel token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack?.blind);
      pack.cancelled = true;
      pack.finalized = false;
      const sale = this.sales.get(tokenId);
      if (sale) {
        const unsold = sale.remaining;
        if (unsold > 0) {
          this.addBalance(sale.seller, tokenId, -unsold);
          this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) - unsold);
          this.minted.set(tokenId, (this.minted.get(tokenId) || 0) - unsold);
        }
        sale.active = false;
        sale.remaining = 0;
      }
      return;
    }
    if (entrypoint === "open_pack") {
      const tokenId = asSafeInteger(value.token_id, "open token id");
      assert.ok(Array.isArray(value.actions), "Ravioli open actions are missing");
      for (const reservation of value.actions as JsonObject[]) {
        const kind = primitive(reservation);
        const action = reservation[kind] as JsonObject;
        if (kind === "escrow") {
          const amount = asSafeInteger(action.amount, "escrow opening amount");
          this.adjustTrackedCapacity(
            this.assetAllowances,
            this.assetAllowanceKey(
              tokenId,
              String(action.fa2),
              asSafeInteger(action.token_id, "escrow opening token id"),
            ),
            -amount,
            "Ravioli asset allowance",
          );
        } else {
          const adapter = String(action.adapter);
          const resourceId = asSafeInteger(
            action.resource_id,
            "adapter opening resource id",
          );
          const adapterKind = kind === "allocated_mint" ? 1 : 2;
          this.adjustTrackedCapacity(
            this.adapterAllowances,
            this.adapterAllowanceKey(
              tokenId,
              adapter,
              adapterKind,
              resourceId,
            ),
            -1,
            "Ravioli adapter allowance",
          );
          this.adjustTrackedCapacity(
            this.adapterReservations,
            this.adapterReservationKey(adapter, tokenId, resourceId),
            -1,
            "Ravioli adapter reservation",
          );
        }
      }
      if (this.packs.get(tokenId)?.blind) {
        const claim = this.resolveBlindClaim(signer, tokenId);
        assert.equal(
          asSafeInteger(value.expected_claim_id, "open claim id"),
          claim.expectedClaimId,
        );
        const claims = this.claimsFor(signer, tokenId);
        claims.pop();
        if (claims.length === 0) {
          this.blindClaims.delete(this.claimKey(signer, tokenId));
        }
      }
      this.addBalance(signer, tokenId, -1);
      this.totalSupply.set(tokenId, (this.totalSupply.get(tokenId) || 0) - 1);
      this.opened.set(tokenId, (this.opened.get(tokenId) || 0) + 1);
      return;
    }
    if (entrypoint === "set_pack_contents") {
      const tokenId = asSafeInteger(value.token_id, "contents token id");
      const pack = this.packs.get(tokenId);
      assert.ok(pack);
      pack.contents_uri = String(value.contents_uri);
      this.blindRevealOffsets.set(
        tokenId,
        asSafeInteger(value.offset, "contents reveal offset"),
      );
    }
  }

  project(storage: unknown): unknown {
    const source = storage as JsonObject;
    if (source && typeof source === "object" && "packs" in source) return this.projectRouter();
    if (source && typeof source === "object" && "allocations" in source) {
      const allocations = new MichelsonMap<string, unknown>();
      for (const [resourceId, allocation] of this.gnocchiAllocations) {
        allocations.set(String(resourceId), structuredClone(allocation));
      }
      const reservations = new MichelsonMap<
        { pack_contract: string; pack_token_id: number; resource_id: number },
        number
      >();
      for (const [key, amount] of this.adapterReservations) {
        const [adapter, tokenId, resourceId] = key.split(":");
        if (adapter !== this.gnocchiAdapterAddress) continue;
        reservations.set({
          pack_contract: this.routerAddress,
          pack_token_id: Number(tokenId),
          resource_id: Number(resourceId),
        }, amount);
      }
      return {
        administrator: typeof source.administrator === "string" ? source.administrator : "",
        next_resource_id: this.gnocchiNextResourceId,
        allocations,
        reservations,
        routers: new MichelsonMap(),
        metadata: new MichelsonMap(),
      };
    }
    if (source && typeof source === "object" && "resources" in source) {
      const resources = new MichelsonMap<string, unknown>();
      for (const [resourceId, resource] of this.rotiniResources) {
        resources.set(String(resourceId), structuredClone(resource));
      }
      const reservations = new MichelsonMap<
        { pack_contract: string; pack_token_id: number; resource_id: number },
        number
      >();
      for (const [key, amount] of this.adapterReservations) {
        const [adapter, tokenId, resourceId] = key.split(":");
        if (adapter !== this.rotiniAdapterAddress) continue;
        reservations.set({
          pack_contract: this.routerAddress,
          pack_token_id: Number(tokenId),
          resource_id: Number(resourceId),
        }, amount);
      }
      return {
        administrator: typeof source.administrator === "string" ? source.administrator : "",
        next_resource_id: this.rotiniNextResourceId,
        resources,
        reservations,
        routers: new MichelsonMap(),
        metadata: new MichelsonMap(),
      };
    }
    throw new TypeError("unsupported Ravioli storage shape; refusing to expose raw Taquito storage through the UI-live bridge");
  }

  projectRouter(): JsonObject {
    const packs = new MichelsonMap<string, unknown>();
    const tokenMetadata = new MichelsonMap<string, unknown>();
    const totalSupply = new MichelsonMap<string, number>();
    const minted = new MichelsonMap<string, number>();
    const opened = new MichelsonMap<string, number>();
    const sales = new MichelsonMap<string, SaleSnapshot>();
    const recipeCommitments = new MichelsonMap<string, string>();
    const assetAllowances = new MichelsonMap<
      { pack_token_id: number; fa2: string; asset_token_id: number },
      number
    >();
    const adapterAllowances = new MichelsonMap<
      { pack_token_id: number; adapter: string; kind: number; resource_id: number },
      number
    >();
    const ledger = new MichelsonMap<{ owner: string; token_id: number }, number>();
    for (const [tokenId, value] of this.packs) packs.set(String(tokenId), { ...value });
    for (const [tokenId, value] of this.tokenMetadata) tokenMetadata.set(String(tokenId), value);
    for (const [tokenId, value] of this.totalSupply) totalSupply.set(String(tokenId), value);
    for (const [tokenId, value] of this.minted) minted.set(String(tokenId), value);
    for (const [tokenId, value] of this.opened) opened.set(String(tokenId), value);
    for (const [tokenId, value] of this.sales) sales.set(String(tokenId), { ...value });
    for (const [key, value] of this.recipeCommitments) recipeCommitments.set(key, value);
    for (const [key, value] of this.assetAllowances) {
      const [packTokenId, fa2, assetTokenId] = key.split(":");
      assetAllowances.set({
        pack_token_id: Number(packTokenId),
        fa2,
        asset_token_id: Number(assetTokenId),
      }, value);
    }
    for (const [key, value] of this.adapterAllowances) {
      const [packTokenId, adapter, kind, resourceId] = key.split(":");
      adapterAllowances.set({
        pack_token_id: Number(packTokenId),
        adapter,
        kind: Number(kind),
        resource_id: Number(resourceId),
      }, value);
    }
    for (const [key, value] of this.ledger) {
      const separator = key.lastIndexOf(":");
      const owner = key.slice(0, separator);
      const tokenId = Number(key.slice(separator + 1));
      assert.equal(validateAddress(owner), ValidationResult.VALID, "Ravioli mirror ledger owner drift");
      assert.ok(separator > 0 && Number.isSafeInteger(tokenId) && tokenId >= 0, "Ravioli mirror ledger key drift");
      assert.ok(Number.isSafeInteger(value) && value > 0, "Ravioli mirror ledger balance drift");
      ledger.set({ owner, token_id: tokenId }, value);
    }
    return {
      administrator: this.administrator,
      blind_controller: this.blindControllerAddress,
      next_token_id: this.nextTokenId,
      ledger,
      packs,
      token_metadata: tokenMetadata,
      total_supply: totalSupply,
      minted,
      opened,
      sales,
      recipe_commitments: recipeCommitments,
      asset_allowances: assetAllowances,
      adapter_allowances: adapterAllowances,
    };
  }
}

async function boundedBigMapValue(map: unknown, key: number): Promise<unknown> {
  assert.ok(map && typeof map === "object" && "get" in map && typeof (map as { get?: unknown }).get === "function");
  const getter = (map as { get(value: string | number): Promise<unknown> | unknown }).get.bind(map);
  try {
    const direct = await getter(String(key));
    if (direct !== undefined) return direct;
  } catch {
    // Nat-key big maps differ between Taquito versions; the bounded numeric retry preserves the Michelson key domain.
  }
  return getter(key);
}

export async function projectRavioliUiLiveStorage(storage: unknown, mirror: RavioliUiStateMirror): Promise<unknown> {
  const source = storage as JsonObject;
  if (
    source && typeof source === "object" && !Array.isArray(source) &&
    "sales" in source && "next_token_id" in source && !("packs" in source)
  ) {
    const nextTokenId = asSafeInteger(source.next_token_id, "Gnocchi next token id");
    assert.ok(nextTokenId >= 0 && nextTokenId <= 64, "Gnocchi policy projection exceeds its bounded token limit");
    const sales = new MichelsonMap<string, unknown>();
    const policyLocked = new MichelsonMap<string, unknown>();
    const totalMinted = new MichelsonMap<string, unknown>();
    const totalReserved = new MichelsonMap<string, unknown>();
    for (let tokenId = 0; tokenId < nextTokenId; tokenId += 1) {
      const value = await boundedBigMapValue(source.sales, tokenId);
      if (value !== undefined) sales.set(String(tokenId), value);
      if (source.policy_locked) {
        const locked = await boundedBigMapValue(source.policy_locked, tokenId);
        if (locked !== undefined) policyLocked.set(String(tokenId), locked);
      }
      if (source.total_minted) {
        const minted = await boundedBigMapValue(source.total_minted, tokenId);
        if (minted !== undefined) totalMinted.set(String(tokenId), minted);
      }
      if (source.total_reserved) {
        const reserved = await boundedBigMapValue(source.total_reserved, tokenId);
        if (reserved !== undefined) totalReserved.set(String(tokenId), reserved);
      }
    }
    return {
      next_token_id: nextTokenId,
      sales,
      policy_locked: policyLocked,
      total_minted: totalMinted,
      total_reserved: totalReserved,
    };
  }
  if (
    source && typeof source === "object" && !Array.isArray(source) &&
    "projects" in source && "next_project_id" in source && !("packs" in source)
  ) {
    const nextProjectId = asSafeInteger(source.next_project_id, "Rotini next project id");
    assert.ok(nextProjectId >= 0 && nextProjectId <= 64, "Rotini policy projection exceeds its bounded project limit");
    const projects = new MichelsonMap<string, unknown>();
    for (let projectId = 0; projectId < nextProjectId; projectId += 1) {
      const value = await boundedBigMapValue(source.projects, projectId);
      if (value !== undefined) projects.set(String(projectId), value);
    }
    return { next_project_id: nextProjectId, projects };
  }
  return mirror.project(storage);
}

function safeRelativePath(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  const normalized = path.posix.normalize(value as string);
  assert.equal(normalized, value);
  assert.ok(normalized !== "." && normalized !== ".." && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized));
  return normalized;
}

async function readJsonFile(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; digest: string }> {
  const bytes = await readFile(filePath);
  const value = JSON.parse(bytes.toString("utf8"));
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return { value, bytes, digest: sha256(bytes) };
}

async function verifyManifestFiles(appRoot: string, manifest: JsonObject): Promise<void> {
  assert.ok(Array.isArray(manifest.artifacts));
  assert.ok(Array.isArray(manifest.screenshots));
  for (const [kind, entries] of [["artifact", manifest.artifacts], ["screenshot", manifest.screenshots]] as const) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index] as JsonObject;
      const relative = safeRelativePath(entry.path, `${kind} path ${index}`);
      const absolute = path.resolve(appRoot, ...relative.split("/"));
      assert.ok(absolute.startsWith(`${path.resolve(appRoot)}${path.sep}`));
      const bytes = await readFile(absolute);
      assert.equal(sha256(bytes), entry.sha256, `${kind} ${relative} digest mismatch`);
    }
  }
}

function assertAppliedManifest(manifest: JsonObject, app: "gnocchi" | "rotini", runId: string): void {
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, app);
  assert.equal(manifest.role, "token-publisher");
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.network?.name, "shadownet");
  assert.equal(manifest.network?.chainId, SHADOWNET_CHAIN_ID);
  assert.ok(Array.isArray(manifest.contracts) && manifest.contracts.length === 1);
  assert.equal(validateContractAddress(manifest.contracts[0].address), ValidationResult.VALID);
  assert.ok(Array.isArray(manifest.operations));
  assert.ok(manifest.operations.some((operation: JsonObject) => operation.kind === "origination"));
  for (const operation of manifest.operations) {
    assert.equal(operation.status, "applied");
    assert.equal(validateOperation(operation.hash), ValidationResult.VALID);
  }
}

function findBalance(entries: any[], owner: string, tokenId: number): number {
  const entry = entries.find((candidate) => candidate?.key?.owner === owner && Number(candidate?.key?.token_id) === tokenId);
  return entry ? Number(entry.value) : 0;
}

function findNat(entries: any[], tokenId: number): number {
  const entry = entries.find((candidate) => Number(candidate?.key) === tokenId);
  return entry ? Number(entry.value) : 0;
}

export function validateRavioliGnocchiDependencyRoles(input: {
  sales: JsonObject[];
  metadata: JsonObject[];
  policyLocked: JsonObject[];
  tokenMetadataUris: string[];
  limitedEdition: { tokenId: number; end: string; maxSupply: number; metadataUri: string };
  nowMs?: number;
}): { allocationTokenId: number; limitedAllocationTokenId: number } {
  const sale = (tokenId: number) => input.sales.find((entry) => Number(entry.key) === tokenId)?.value;
  const locked = (tokenId: number) => input.policyLocked.find((entry) => Number(entry.key) === tokenId)?.value;
  const timed = sale(0);
  assert.ok(timed, "Gnocchi timed OE sale is missing");
  assert.equal(timed.active, true, "Gnocchi timed OE must retain its configured active flag");
  assert.equal(timed.max_supply, null, "Gnocchi timed OE must remain uncapped");
  const timedStart = Date.parse(String(timed.start || ""));
  const timedEnd = Date.parse(String(timed.end || ""));
  assert.ok(Number.isFinite(timedStart) && Number.isFinite(timedEnd) && timedStart <= timedEnd, "Gnocchi timed OE window is invalid");

  const forever = sale(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID);
  assert.ok(forever, "Gnocchi forever OE sale is missing");
  assert.equal(forever.active, true, "Gnocchi allocation token must remain active");
  assert.equal(forever.start, null, "Gnocchi allocation token must remain a forever OE without a start gate");
  assert.equal(forever.end, null, "Gnocchi allocation token must remain a forever OE without an expiry");
  assert.equal(forever.max_supply, null, "Gnocchi allocation token must remain uncapped");

  const limited = sale(input.limitedEdition.tokenId);
  assert.ok(limited, "Gnocchi limited-edition allocation sale is missing");
  assert.equal(limited.active, true, "Gnocchi limited-edition allocation must remain active");
  assert.equal(Number(limited.max_supply), input.limitedEdition.maxSupply, "Gnocchi limited-edition cap drift");
  const limitedStart = Date.parse(String(limited.start || ""));
  const limitedEnd = Date.parse(String(limited.end || ""));
  const committedLimitedEnd = Date.parse(input.limitedEdition.end);
  assert.ok(Number.isFinite(committedLimitedEnd), "committed Gnocchi limited-edition expiry is invalid");
  assert.equal(limitedEnd, committedLimitedEnd, "Gnocchi limited-edition expiry drift");
  assert.ok(Number.isFinite(limitedStart) && Number.isFinite(limitedEnd) && limitedStart <= limitedEnd, "Gnocchi limited-edition window is invalid");
  assert.ok(limitedEnd > (input.nowMs ?? Date.now()), "Gnocchi limited-edition allocation has expired");

  for (const tokenId of [0, RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID, input.limitedEdition.tokenId]) {
    assert.equal(locked(tokenId), true, `Gnocchi token ${tokenId} issuance policy must remain locked`);
    const metadata = input.metadata.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.equal(hexToUtf8(String(metadata?.token_info?.[""])), input.tokenMetadataUris[tokenId]);
  }
  assert.equal(input.tokenMetadataUris[input.limitedEdition.tokenId], input.limitedEdition.metadataUri);
  return {
    allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
    limitedAllocationTokenId: input.limitedEdition.tokenId,
  };
}

export function validateRavioliNativeDependencyTransition(input: {
  handoff: RavioliNativeRecoveryHandoff;
  gnocchiAddress: string;
  rotiniAddress: string;
  creatorBalances: Record<string, number>;
  totalSupply: Record<string, number>;
  totalReserved: Record<string, number>;
  completedProject: JsonObject;
  freshProject: JsonObject;
  nextProjectId: number;
  nextTokenId: number;
}): { projectId: number; nextTokenId: number; generatedTokenIds: [number, number] } {
  const { handoff } = input;
  assert.equal(handoff.schema, "pastaprotocol-ravioli-native-recovery-handoff@1");
  assert.equal(handoff.gnocchi.contract, input.gnocchiAddress, "native recovery Gnocchi contract differs from the accepted dependency");
  assert.equal(handoff.rotini.contract, input.rotiniAddress, "native recovery Rotini contract differs from the accepted dependency");
  assert.equal(handoff.failedRouter.allWrapperSupplyBurned, true, "native recovery left wrapper supply outstanding");
  assert.equal(handoff.failedRouter.allSalesInactive, true, "native recovery left a failed-router sale active");
  assert.deepEqual(input.creatorBalances, handoff.gnocchi.creatorBalances, "post-recovery Gnocchi creator balances drift");
  assert.deepEqual(input.totalSupply, handoff.gnocchi.totalSupply, "post-recovery Gnocchi total supply drift");
  assert.deepEqual(input.totalReserved, handoff.gnocchi.totalReserved, "post-recovery Gnocchi reserved supply drift");

  assert.equal(input.completedProject?.active, true, "completed Rotini project must remain active");
  assert.equal(Number(input.completedProject?.minted), handoff.rotini.completedProjectMinted, "completed Rotini project mint count drift");
  assert.equal(Number(input.completedProject?.reserved), handoff.rotini.completedProjectReserved, "completed Rotini project reservation drift");
  assert.equal(input.freshProject?.active, true, "fresh Rotini project must be active");
  assert.equal(hexToUtf8(String(input.freshProject?.output_mode || "")), "png", "fresh Rotini project must remain PNG-compatible");
  assert.equal(Number(input.freshProject?.price), 0, "fresh Rotini project must remain free");
  assert.equal(
    requiredOptionSafeInteger(input.freshProject?.max_supply, "fresh Rotini project max supply"),
    handoff.rotini.freshProjectMaxSupply,
    "fresh Rotini project supply cap drift",
  );
  assert.equal(Number(input.freshProject?.minted), handoff.rotini.freshProjectMinted, "fresh Rotini project mint count drift");
  assert.equal(Number(input.freshProject?.reserved), handoff.rotini.freshProjectReserved, "fresh Rotini project reservation drift");
  assert.equal(input.nextProjectId, handoff.rotini.freshProjectId + 1, "Rotini next project id no longer follows the fresh recovery project");
  assert.equal(input.nextTokenId, handoff.rotini.nextTokenId, "Rotini next token id differs from the native recovery handoff");
  assert.deepEqual(
    handoff.rotini.freshRavioliGeneratedTokenIds,
    [input.nextTokenId, input.nextTokenId + 1],
    "native recovery handoff does not reserve the next two Rotini token ids for Ravioli",
  );
  const generatedTokenIds: [number, number] = [
    handoff.rotini.freshRavioliGeneratedTokenIds[0],
    handoff.rotini.freshRavioliGeneratedTokenIds[1],
  ];
  return {
    projectId: handoff.rotini.freshProjectId,
    nextTokenId: handoff.rotini.nextTokenId,
    generatedTokenIds,
  };
}

export function assertRavioliNativeRecoveryRecheckStable(
  initial: RavioliNativeRecoveryLiveVerification,
  final: RavioliNativeRecoveryLiveVerification,
): void {
  assert.equal(final.receiptSha256, initial.receiptSha256, "native recovery receipt changed before Ravioli writes");
  assert.deepEqual(final.handoff, initial.handoff, "native recovery handoff changed before Ravioli writes");
  assert.deepEqual(final.operations, initial.operations, "native recovery operation trees changed before Ravioli writes");
  assert.deepEqual(final.publicIpfs, initial.publicIpfs, "native recovery public IPFS bytes changed before Ravioli writes");
  assert.equal(
    final.lanes.primary.counter,
    initial.lanes.primary.counter,
    "native recovery creator counter changed before Ravioli writes",
  );
  assert.equal(
    final.lanes.fallback.counter,
    initial.lanes.fallback.counter,
    "native recovery fallback creator counter changed before Ravioli writes",
  );
  const { level: _initialLevel, ...initialState } = initial.terminalState;
  const { level: _finalLevel, ...finalState } = final.terminalState;
  assert.deepEqual(finalState, initialState, "native recovery terminal dependency state changed before Ravioli writes");
  assert.ok(final.terminalState.level >= initial.terminalState.level, "native recovery terminal verification level moved backwards");
  assert.ok(Date.parse(final.verifiedAt) >= Date.parse(initial.verifiedAt), "native recovery final verification timestamp moved backwards");
}

export function assertTzktFa2ContractRecord(record: unknown, address: string, creator?: string): void {
  const value = record as JsonObject;
  assert.equal(value?.address, address, "TzKT asset record address mismatch");
  assert.equal(value?.kind, "asset", `${address} is not classified by TzKT as an asset contract`);
  assert.ok(
    Array.isArray(value?.tzips) && value.tzips.some((tzip: unknown) => String(tzip).toLowerCase() === "fa2"),
    `${address} is not classified by TzKT as FA2`,
  );
  if (creator) assert.equal(value?.creator?.address, creator, `${address} was not originated by the same-run creator`);
}

export function assertTzktTokenRecords(records: unknown, address: string, tokenIds: readonly number[]): void {
  assert.ok(Array.isArray(records), `${address} TzKT token records must be an array`);
  for (const tokenId of tokenIds) {
    const token = records.find((candidate: JsonObject) =>
      candidate?.contract?.address === address && Number(candidate?.tokenId) === tokenId,
    );
    assert.ok(token, `${address} token ${tokenId} is not indexed by TzKT`);
    const totalSupply = Number(token.totalSupply);
    assert.ok(Number.isSafeInteger(totalSupply) && totalSupply >= 0, `${address} token ${tokenId} has no indexed supply`);
  }
}

export function assertTzktBalanceRecords(
  records: unknown,
  address: string,
  requirements: readonly TzktBalanceRequirement[],
): void {
  assert.ok(Array.isArray(records), `${address} TzKT balance records must be an array`);
  for (const requirement of requirements) {
    const balance: JsonObject | undefined = (records as JsonObject[]).find((candidate) =>
      candidate?.account?.address === requirement.owner &&
      candidate?.token?.contract?.address === address &&
      String(candidate?.token?.standard || "").toLowerCase() === "fa2" &&
      Number(candidate?.token?.tokenId) === requirement.tokenId,
    );
    assert.ok(balance, `${address} token ${requirement.tokenId} balance for ${requirement.owner} is not indexed by TzKT`);
    assert.equal(
      Number(balance.balance),
      requirement.balance,
      `${address} token ${requirement.tokenId} indexed balance drift for ${requirement.owner}`,
    );
  }
}

export function hasActiveRavioliOperator(
  records: unknown,
  expected: { owner: string; operator: string; tokenId: number },
): boolean {
  assert.ok(Array.isArray(records), "Gnocchi operator records must be an array");
  const matches = records.filter((entry: JsonObject) => (
    entry?.key?.owner === expected.owner
    && entry?.key?.operator === expected.operator
    && Number(entry?.key?.token_id) === expected.tokenId
  ));
  for (const match of matches) {
    assert.equal(typeof match.active, "boolean", "matching Gnocchi operator record lacks an active tombstone flag");
  }
  return matches.some((match: JsonObject) => match.active === true);
}

async function readIndexedFa2Evidence(input: {
  label: string;
  address: string;
  creator?: string;
  tokenIds: readonly number[];
  balances: readonly TzktBalanceRequirement[];
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const contract = await pollJson(
    `${input.label} TzKT FA2 classification`,
    `${base}/contracts/${input.address}`,
    (value) => value?.address === input.address && value?.kind === "asset" &&
      Array.isArray(value?.tzips) && value.tzips.some((tzip: unknown) => String(tzip).toLowerCase() === "fa2") &&
      (!input.creator || value?.creator?.address === input.creator),
  );
  assertTzktFa2ContractRecord(contract, input.address, input.creator);
  const tokens = await pollJson(
    `${input.label} TzKT token records`,
    `${base}/tokens?contract=${encodeURIComponent(input.address)}&limit=100`,
    (value) => Array.isArray(value) && input.tokenIds.every((tokenId) => value.some((token: JsonObject) =>
      token?.contract?.address === input.address && Number(token?.tokenId) === tokenId &&
      Number.isSafeInteger(Number(token?.totalSupply)) && Number(token?.totalSupply) >= 0,
    )),
  );
  assertTzktTokenRecords(tokens, input.address, input.tokenIds);
  const balances = await pollJson(
    `${input.label} TzKT balance records`,
    `${base}/tokens/balances?token.contract=${encodeURIComponent(input.address)}&limit=100`,
    (value) => Array.isArray(value) && input.balances.every((requirement) => value.some((balance: JsonObject) =>
      balance?.account?.address === requirement.owner &&
      balance?.token?.contract?.address === input.address &&
      String(balance?.token?.standard || "").toLowerCase() === "fa2" &&
      Number(balance?.token?.tokenId) === requirement.tokenId &&
      Number(balance?.balance) === requirement.balance,
    )),
  );
  assertTzktBalanceRecords(balances, input.address, input.balances);
  return { contract, tokens, balances };
}

async function readBigMap(id: unknown, label: string, limit = 100): Promise<any[]> {
  const bigMapId = Number(id);
  assert.ok(Number.isSafeInteger(bigMapId) && bigMapId > 0, `${label} must be an indexed big-map id`);
  const rows = await pollJson(
    label,
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${bigMapId}/keys?active=true&limit=${limit}`,
    (value) => Array.isArray(value) && value.every((entry) => entry?.active === true),
  );
  assert.ok(rows.every((entry: JsonObject) => entry?.active === true), `${label} returned historical or inactive keys`);
  return rows;
}

async function verifyRavioliMode0ReplayHttpBytes(input: {
  label: string;
  url: string;
  expectedSha256: string;
  expectedByteLength: number;
}): Promise<JsonObject> {
  const bytes = await readWithBoundedRetry({
    primary: createHttpGetReader({
      label: input.label,
      url: input.url,
      headers: { "cache-control": "no-cache", "user-agent": "wtfos-ravioli-mode0-recovery" },
      parse: async (response) => new Uint8Array(await response.arrayBuffer()),
    }),
  }, { maxAttempts: 4, deadlineMs: 60_000 });
  assert.equal(bytes.byteLength, input.expectedByteLength, `${input.label} byte length drift`);
  assert.equal(sha256(bytes), input.expectedSha256, `${input.label} SHA-256 drift`);
  return {
    url: input.url,
    byteLength: bytes.byteLength,
    sha256: input.expectedSha256,
    verifiedAt: new Date().toISOString(),
  };
}

export async function verifyRavioliMode0MutationReplayLive(input: {
  replay: RavioliMode0MutationReplay;
  tezos: TezosToolkit;
  creatorAddress: string;
  routerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  assert.equal(input.creatorAddress, input.replay.identity.creatorAddress, "mode-0 replay creator drift");
  const script = await input.tezos.rpc.getScript(input.replay.routerAddress);
  const scriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    script.code,
    input.routerArtifact,
    "mode-0 recovery router differs from the journal-bound Ravioli artifact",
  );
  assert.equal(
    scriptCodeSha256,
    hashMichelsonScriptCode(input.routerArtifact),
    "mode-0 recovery router canonical code hash drift",
  );

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const storage = await pollJson(
    "mode-0 recovery router empty storage",
    `${base}/contracts/${input.replay.routerAddress}/storage`,
    (value) => value?.administrator === input.creatorAddress && Number(value?.next_token_id) === 0,
  );
  assert.equal(storage.administrator, input.creatorAddress);
  assert.equal(storage.pending_administrator, null);
  assert.equal(Number(storage.next_token_id), 0);
  const mapNames = [
    "adapter_allowances",
    "asset_allowances",
    "ledger",
    "minted",
    "minters",
    "opened",
    "opened_by",
    "operators",
    "packs",
    "recipe_commitments",
    "sales",
    "token_metadata",
    "total_supply",
  ] as const;
  const mapEntries = await Promise.all(mapNames.map(async (name) => [
    name,
    await readBigMap(storage[name], `mode-0 recovery router ${name}`),
  ] as const));
  const maps = Object.fromEntries(mapEntries) as Record<typeof mapNames[number], JsonObject[]>;
  for (const name of mapNames) assert.deepEqual(maps[name], [], `mode-0 recovery router ${name} must be empty`);
  const metadata = await readBigMap(storage.metadata, "mode-0 recovery router metadata");
  assert.equal(metadata.length, 1, "mode-0 recovery router must expose only its contract metadata key");
  const metadataRow = metadata[0] as JsonObject;
  assert.equal(metadataRow.active, true);
  assert.equal(metadataRow.key, "");
  assert.equal(metadataRow.value, utf8ToHex(input.replay.activePins[1].proof.uri));
  assert.equal(Number(metadataRow.firstLevel), input.replay.identity.origination.level);
  assert.equal(Number(metadataRow.lastLevel), input.replay.identity.origination.level);
  assert.equal(Number(metadataRow.updates), 1);

  const operationEvidence: JsonObject[] = [];
  for (const operation of [
    {
      label: "router origination",
      endpoint: "originations",
      action: "originate" as const,
      identity: input.replay.identity.origination,
      contractAddress: input.replay.routerAddress,
      entrypoints: [] as string[],
    },
    {
      label: "Gnocchi operator approval",
      endpoint: "transactions",
      action: "call" as const,
      identity: input.replay.identity.operatorApproval,
      contractAddress: input.replay.identity.gnocchiAddress,
      entrypoints: ["update_operators"],
    },
  ]) {
    const url = `${base}/operations/${operation.endpoint}/${encodeURIComponent(operation.identity.operationHash)}`;
    const rows = await pollJson(`mode-0 recovery ${operation.label}`, url, (value) => {
      try {
        assertRavioliJournalTzktOperationApplied({
          rows: value,
          action: operation.action,
          operationHash: operation.identity.operationHash,
          signerAddress: input.creatorAddress,
          expectedCounter: operation.identity.counter,
          contractAddress: operation.contractAddress,
          entrypoints: operation.entrypoints,
        });
        return true;
      } catch {
        return false;
      }
    });
    operationEvidence.push(assertRavioliJournalTzktOperationApplied({
      rows,
      action: operation.action,
      operationHash: operation.identity.operationHash,
      signerAddress: input.creatorAddress,
      expectedCounter: operation.identity.counter,
      contractAddress: operation.contractAddress,
      entrypoints: operation.entrypoints,
    }));
  }

  const pinIdentities = [
    { identity: input.replay.identity.wrapperPin, bytes: input.replay.activePins[0].bytes },
    { identity: input.replay.identity.collectionPin, bytes: input.replay.activePins[1].bytes },
    {
      identity: input.replay.identity.staleManifestPin,
      bytes: await readFile(path.join(input.replay.journalRoot, "pins", "000003.bin")),
    },
    {
      identity: input.replay.identity.staleTokenPin,
      bytes: await readFile(path.join(input.replay.journalRoot, "pins", "000004.bin")),
    },
  ];
  const publicIpfs: JsonObject[] = [];
  for (const pin of pinIdentities) {
    assert.equal(pin.bytes.byteLength, pin.identity.byteLength, `${pin.identity.fileName} journal byte length drift`);
    assert.equal(sha256(pin.bytes), pin.identity.sha256, `${pin.identity.fileName} journal byte hash drift`);
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.identity.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.identity.cid)],
    ] as const) {
      publicIpfs.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `mode-0 recovery ${lane} IPFS ${pin.identity.fileName}`,
        url,
        expectedSha256: pin.identity.sha256,
        expectedByteLength: pin.identity.byteLength,
      }));
    }
  }
  return {
    classification: "RAVIOLI-MODE0-MUTATION-REPLAY-LIVE-CHECK",
    verifiedAt: new Date().toISOString(),
    routerAddress: input.replay.routerAddress,
    scriptCodeSha256,
    storage,
    metadata,
    operationEvidence,
    ipfs: publicIpfs,
  };
}

export async function verifyRavioliControllerResumeLive(input: {
  replay: RavioliControllerResume;
  tezos: TezosToolkit;
  creatorAddress: string;
  controllerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  assert.equal(input.creatorAddress, input.replay.identity.creatorAddress, "controller-resume creator drift");
  const script = await input.tezos.rpc.getScript(input.replay.controllerAddress);
  const scriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    script.code,
    input.controllerArtifact,
    "controller-resume contract differs from the exact journal-bound artifact",
  );
  assert.equal(
    scriptCodeSha256,
    hashMichelsonScriptCode(input.controllerArtifact),
    "controller-resume canonical code hash drift",
  );

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const operationRows = await pollJson(
    "Ravioli controller-resume exact origination",
    `${base}/operations/originations/${encodeURIComponent(input.replay.identity.origination.operationHash)}`,
    (value) => {
      try {
        assertRavioliJournalTzktOperationApplied({
          rows: value,
          action: "originate",
          operationHash: input.replay.identity.origination.operationHash,
          signerAddress: input.creatorAddress,
          expectedCounter: input.replay.identity.origination.counter,
          contractAddress: input.replay.controllerAddress,
          entrypoints: [],
        });
        return true;
      } catch {
        return false;
      }
    },
  );
  const operationEvidence = assertRavioliJournalTzktOperationApplied({
    rows: operationRows,
    action: "originate",
    operationHash: input.replay.identity.origination.operationHash,
    signerAddress: input.creatorAddress,
    expectedCounter: input.replay.identity.origination.counter,
    contractAddress: input.replay.controllerAddress,
    entrypoints: [],
  });
  assert.equal(operationEvidence.level, input.replay.identity.origination.level);
  assert.equal(operationEvidence.timestamp, input.replay.identity.origination.timestamp);

  const storage = await pollJson(
    "Ravioli controller-resume empty storage",
    `${base}/contracts/${input.replay.controllerAddress}/storage`,
    (value) => ["claim_counts", "claim_slots", "consumed_serials", "metadata", "packs", "refund_credits"]
      .every((name) => Number.isSafeInteger(Number(value?.[name])) && Number(value?.[name]) > 0),
  );
  const mapNames = [
    "claim_counts",
    "claim_slots",
    "consumed_serials",
    "packs",
    "refund_credits",
  ] as const;
  const mapEntries = await Promise.all(mapNames.map(async (name) => [
    name,
    await readBigMap(storage[name], `Ravioli controller-resume ${name}`),
  ] as const));
  const maps = Object.fromEntries(mapEntries) as Record<typeof mapNames[number], JsonObject[]>;
  for (const name of mapNames) {
    assert.deepEqual(maps[name], [], `Ravioli controller-resume ${name} must remain empty`);
  }
  const metadata = await readBigMap(storage.metadata, "Ravioli controller-resume metadata");
  assert.equal(metadata.length, 1, "Ravioli controller-resume metadata must contain exactly one row");
  assert.equal(metadata[0]?.active, true);
  assert.equal(metadata[0]?.key, "");
  assert.equal(metadata[0]?.value, utf8ToHex(input.replay.activePins[1].proof.uri));
  assert.equal(Number(metadata[0]?.firstLevel), input.replay.identity.origination.level);
  assert.equal(Number(metadata[0]?.lastLevel), input.replay.identity.origination.level);
  assert.equal(Number(metadata[0]?.updates), 1);

  const ipfsEvidence: JsonObject[] = [];
  for (const pin of input.replay.activePins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} journal byte length drift`);
    assert.equal(sha256(pin.bytes), pin.proof.sha256, `${pin.proof.fileName} journal byte hash drift`);
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      ipfsEvidence.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli controller-resume ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  return {
    classification: "RAVIOLI-CONTROLLER-ONLY-RESUME-LIVE-CHECK",
    verifiedAt: new Date().toISOString(),
    controllerAddress: input.replay.controllerAddress,
    scriptCodeSha256,
    operationEvidence,
    storage,
    maps,
    metadata,
    ipfs: ipfsEvidence,
  };
}

const RAVIOLI_CURRENT_V2_ROUTER_BIG_MAP_NAMES = [
  "adapter_allowances",
  "asset_allowances",
  "ledger",
  "metadata",
  "minted",
  "minters",
  "opened",
  "operators",
  "packs",
  "recipe_commitments",
  "sales",
  "token_metadata",
  "total_supply",
] as const;

export function assertRavioliCurrentV2RouterStorageShape(
  storage: JsonObject,
  expected: { creatorAddress: string; controllerAddress: string },
): void {
  assert.ok(storage && typeof storage === "object" && !Array.isArray(storage), "current-v2 router storage is invalid");
  assert.equal(storage.administrator, expected.creatorAddress, "current-v2 router administrator drift");
  assert.equal(storage.pending_administrator, null, "current-v2 router pending administrator drift");
  assert.equal(storage.blind_controller, expected.controllerAddress, "current-v2 router controller drift");
  assert.equal(Number(storage.next_token_id), 1, "current-v2 router next token id drift");
  assert.equal(
    Object.prototype.hasOwnProperty.call(storage, "opened_by"),
    false,
    "current-v2 router storage contains superseded opened_by state",
  );
  for (const name of RAVIOLI_CURRENT_V2_ROUTER_BIG_MAP_NAMES) {
    const id = Number(storage[name]);
    assert.ok(
      Number.isSafeInteger(id) && id > 0,
      `current-v2 router ${name} must be an indexed big-map id`,
    );
  }
}

export async function verifyRavioliCurrentV2ResumeLive(input: {
  replay: RavioliCurrentV2Resume | RavioliCurrentV3Restart;
  tezos: TezosToolkit;
  creatorAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  assert.equal(input.creatorAddress, input.replay.identity.creatorAddress, "current-v2 creator drift");
  const [controllerScript, routerScript] = await Promise.all([
    input.tezos.rpc.getScript(input.replay.controllerAddress),
    input.tezos.rpc.getScript(input.replay.routerAddress),
  ]);
  const controllerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    controllerScript.code,
    input.controllerArtifact,
    "current-v2 controller differs from the exact journal-bound artifact",
  );
  const routerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    routerScript.code,
    input.routerArtifact,
    "current-v2 router differs from the exact journal-bound artifact",
  );

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [controllerStorage, routerStorage] = await Promise.all([
    pollJson(
      "Ravioli current-v2 controller storage",
      `${base}/contracts/${input.replay.controllerAddress}/storage`,
      (value) => ["claim_counts", "claim_slots", "consumed_serials", "metadata", "packs", "refund_credits"]
        .every((name) => Number.isSafeInteger(Number(value?.[name])) && Number(value?.[name]) > 0),
    ),
    pollJson(
      "Ravioli current-v2 router storage",
      `${base}/contracts/${input.replay.routerAddress}/storage`,
      (value) => value?.administrator === input.creatorAddress
        && value?.pending_administrator === null
        && value?.blind_controller === input.replay.controllerAddress
        && Number(value?.next_token_id) === 1,
    ),
  ]);
  assert.equal(routerStorage.administrator, input.creatorAddress);
  assert.equal(routerStorage.pending_administrator, null);
  assert.equal(routerStorage.blind_controller, input.replay.controllerAddress);
  assert.equal(Number(routerStorage.next_token_id), 1);
  assertRavioliCurrentV2RouterStorageShape(routerStorage, {
    creatorAddress: input.creatorAddress,
    controllerAddress: input.replay.controllerAddress,
  });

  const controllerMapNames = [
    "claim_counts",
    "claim_slots",
    "consumed_serials",
    "metadata",
    "packs",
    "refund_credits",
  ] as const;
  const routerMapNames = RAVIOLI_CURRENT_V2_ROUTER_BIG_MAP_NAMES;
  const controllerMaps = Object.fromEntries(await Promise.all(controllerMapNames.map(async (name) => [
    name,
    await readBigMap(controllerStorage[name], `Ravioli current-v2 controller ${name}`),
  ] as const))) as Record<typeof controllerMapNames[number], JsonObject[]>;
  const routerMaps = Object.fromEntries(await Promise.all(routerMapNames.map(async (name) => [
    name,
    await readBigMap(routerStorage[name], `Ravioli current-v2 router ${name}`),
  ] as const))) as Record<typeof routerMapNames[number], JsonObject[]>;
  assert.equal(controllerMaps.metadata.length, 1, "current-v2 controller metadata cardinality drift");
  assert.equal(controllerMaps.metadata[0]?.key, "");
  assert.equal(controllerMaps.metadata[0]?.value, utf8ToHex(input.replay.activePins[1].proof.uri));
  for (const name of ["claim_counts", "claim_slots", "consumed_serials", "packs", "refund_credits"] as const) {
    assert.deepEqual(controllerMaps[name], [], `current-v2 controller ${name} must remain empty`);
  }
  assert.equal(routerMaps.metadata.length, 1, "current-v2 router metadata cardinality drift");
  assert.equal(routerMaps.metadata[0]?.key, "");
  assert.equal(routerMaps.metadata[0]?.value, utf8ToHex(input.replay.activePins[2].proof.uri));
  for (const name of ["packs", "recipe_commitments", "sales", "token_metadata", "total_supply"] as const) {
    assert.equal(routerMaps[name].length, 1, `current-v2 router ${name} must contain exactly token 0`);
  }
  const pack = routerMaps.packs[0];
  assert.equal(Number(pack.key), 0, "current-v2 router pack key drift");
  assert.deepEqual({
    mode: Number(pack.value?.mode),
    blind: pack.value?.blind,
    cancelled: pack.value?.cancelled,
    finalized: pack.value?.finalized,
    itemCount: Number(pack.value?.item_count),
    maxSupply: Number(pack.value?.max_supply),
    committedRecipes: Number(pack.value?.committed_recipes),
    contentsUri: pack.value?.contents_uri,
    manifestUri: pack.value?.manifest_uri,
  }, {
    mode: 0,
    blind: false,
    cancelled: false,
    finalized: true,
    itemCount: 1,
    maxSupply: 1,
    committedRecipes: 1,
    contentsUri: utf8ToHex(input.replay.activePins[4].proof.uri),
    manifestUri: utf8ToHex(input.replay.activePins[3].proof.uri),
  }, "current-v2 router pack 0 semantic drift");
  const sale = routerMaps.sales[0];
  assert.equal(Number(sale.key), 0, "current-v2 sale key drift");
  assert.deepEqual({
    active: sale.value?.active,
    end: sale.value?.end,
    price: Number(sale.value?.price),
    remaining: Number(sale.value?.remaining),
    seller: sale.value?.seller,
    start: sale.value?.start,
    treasury: sale.value?.treasury,
  }, {
    active: true,
    end: null,
    price: 0,
    remaining: 1,
    seller: input.creatorAddress,
    start: null,
    treasury: input.creatorAddress,
  }, "current-v2 router sale 0 drift");
  assert.equal(routerMaps.ledger.length, 1, "current-v2 router ledger cardinality drift");
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 0), 1, "current-v2 creator wrapper balance drift");
  assert.equal(routerMaps.minted.length, 1, "current-v2 minted cardinality drift");
  assert.equal(routerMaps.opened.length, 1, "current-v2 opened cardinality drift");
  assert.equal(findNat(routerMaps.minted, 0), 1, "current-v2 minted count drift");
  assert.equal(findNat(routerMaps.opened, 0), 0, "current-v2 opened count drift");
  assert.equal(findNat(routerMaps.total_supply, 0), 1, "current-v2 total supply drift");
  for (const name of ["adapter_allowances", "minters", "operators"] as const) {
    assert.deepEqual(routerMaps[name], [], `current-v2 router ${name} must remain empty`);
  }
  assert.equal(routerMaps.asset_allowances.length, 1, "current-v2 asset allowance cardinality drift");
  assert.deepEqual({
    packTokenId: Number(routerMaps.asset_allowances[0]?.key?.pack_token_id),
    fa2: routerMaps.asset_allowances[0]?.key?.fa2,
    assetTokenId: Number(routerMaps.asset_allowances[0]?.key?.asset_token_id),
    amount: Number(routerMaps.asset_allowances[0]?.value),
  }, {
    packTokenId: 0,
    fa2: input.replay.identity.gnocchiAddress,
    assetTokenId: 0,
    amount: 1,
  }, "current-v2 Gnocchi escrow allowance drift");
  assert.deepEqual({
    packTokenId: Number(routerMaps.recipe_commitments[0]?.key?.pack_token_id),
    serial: Number(routerMaps.recipe_commitments[0]?.key?.serial),
    commitment: routerMaps.recipe_commitments[0]?.value,
  }, {
    packTokenId: 0,
    serial: 0,
    commitment: "cf3dead1f889b8283ee591179b0de820c97f7a866f58577d9d8e701300a5af88",
  }, "current-v2 recipe commitment drift");
  const tokenMetadata = routerMaps.token_metadata[0];
  assert.equal(Number(tokenMetadata.key), 0, "current-v2 token metadata key drift");
  assert.equal(Number(tokenMetadata.value?.token_id), 0, "current-v2 token metadata token drift");
  assert.equal(
    tokenMetadata.value?.token_info?.[""],
    utf8ToHex(input.replay.activePins[5].proof.uri),
    "current-v2 token metadata URI drift",
  );

  const gnocchiStorage = await pollJson(
    "Ravioli current-v2 Gnocchi escrow/operator state",
    `${base}/contracts/${input.replay.identity.gnocchiAddress}/storage`,
    (value) => Number(value?.ledger) > 0 && Number(value?.operators) > 0,
  );
  const [gnocchiLedger, gnocchiOperators] = await Promise.all([
    readBigMap(gnocchiStorage.ledger, "Ravioli current-v2 Gnocchi ledger"),
    readBigMap(gnocchiStorage.operators, "Ravioli current-v2 Gnocchi operators"),
  ]);
  assert.equal(
    findBalance(gnocchiLedger, input.replay.routerAddress, 0),
    1,
    "current-v2 router Gnocchi token-0 escrow balance drift",
  );
  assert.equal(hasActiveRavioliOperator(gnocchiOperators, {
    owner: input.creatorAddress,
    operator: input.replay.routerAddress,
    tokenId: 0,
  }), true, "current-v2 Gnocchi operator authorization drift");

  const operationEvidence: JsonObject[] = [];
  for (const operation of input.replay.operations) {
    const endpoint = operation.identity.action === "originate" ? "originations" : "transactions";
    const url = `${base}/operations/${endpoint}/${encodeURIComponent(operation.identity.operationHash)}`;
    const rows = await pollJson(
      `Ravioli current-v2 operation ${operation.identity.globalOrdinal}`,
      url,
      (value) => {
        try {
          assertRavioliJournalTzktOperationApplied({
            rows: value,
            action: operation.identity.action,
            operationHash: operation.identity.operationHash,
            signerAddress: input.creatorAddress,
            expectedCounter: operation.identity.counter,
            contractAddress: operation.identity.contractAddress,
            entrypoints: operation.identity.entrypoints,
          });
          return true;
        } catch {
          return false;
        }
      },
    );
    const evidence = assertRavioliJournalTzktOperationApplied({
      rows,
      action: operation.identity.action,
      operationHash: operation.identity.operationHash,
      signerAddress: input.creatorAddress,
      expectedCounter: operation.identity.counter,
      contractAddress: operation.identity.contractAddress,
      entrypoints: operation.identity.entrypoints,
    });
    assert.equal(evidence.level, operation.identity.level, `current-v2 operation ${operation.identity.globalOrdinal} level drift`);
    assert.equal(
      evidence.timestamp,
      operation.identity.timestamp,
      `current-v2 operation ${operation.identity.globalOrdinal} timestamp drift`,
    );
    operationEvidence.push(evidence);
  }

  const ipfsEvidence: JsonObject[] = [];
  for (const pin of input.replay.activePins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} journal length drift`);
    assert.equal(sha256(pin.bytes), pin.proof.sha256, `${pin.proof.fileName} journal hash drift`);
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      ipfsEvidence.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli current-v2 ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  return {
    classification: "RAVIOLI-CURRENT-V2-RESUME-LIVE-CHECK",
    verifiedAt: new Date().toISOString(),
    controllerAddress: input.replay.controllerAddress,
    routerAddress: input.replay.routerAddress,
    controllerScriptCodeSha256,
    routerScriptCodeSha256,
    controllerStorage,
    routerStorage,
    controllerMaps,
    routerMaps,
    gnocchi: { storage: gnocchiStorage, ledger: gnocchiLedger, operators: gnocchiOperators },
    operationEvidence,
    ipfs: ipfsEvidence,
  };
}

export async function verifyRavioliCurrentV3RestartLive(input: {
  replay: RavioliCurrentV3Restart;
  tezos: TezosToolkit;
  creatorAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  const baseline = await verifyRavioliCurrentV2ResumeLive(input);
  const gnocchi = baseline.gnocchi as JsonObject;
  const operators = gnocchi.operators as JsonObject[];
  assert.equal(operators.length, 2, "current-v3 Gnocchi operator map must contain exactly token 0 and token 1");
  const operatorHistory = operators
    .map((row) => ({
      active: row.active,
      owner: row.key?.owner,
      operator: row.key?.operator,
      tokenId: Number(row.key?.token_id),
      firstLevel: Number(row.firstLevel),
      lastLevel: Number(row.lastLevel),
      updates: Number(row.updates),
    }))
    .sort((left, right) => left.tokenId - right.tokenId);
  assert.deepEqual(operatorHistory, [
    {
      active: true,
      owner: input.creatorAddress,
      operator: input.replay.routerAddress,
      tokenId: 0,
      firstLevel: input.replay.identity.operations[2].level,
      lastLevel: input.replay.identity.operations[8].level,
      updates: 2,
    },
    {
      active: true,
      owner: input.creatorAddress,
      operator: input.replay.routerAddress,
      tokenId: 1,
      firstLevel: input.replay.identity.operations[8].level,
      lastLevel: input.replay.identity.operations[8].level,
      updates: 1,
    },
  ], "current-v3 Gnocchi operator history drift");

  const routerStateText = JSON.stringify({
    storage: baseline.routerStorage,
    maps: baseline.routerMaps,
  });
  const supersededIpfs: JsonObject[] = [];
  for (const pin of input.replay.supersededPrecommitPins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} superseded journal length drift`);
    assert.equal(sha256(pin.bytes), pin.proof.sha256, `${pin.proof.fileName} superseded journal hash drift`);
    for (const forbidden of [pin.proof.uri, utf8ToHex(pin.proof.uri)]) {
      assert.equal(
        routerStateText.includes(forbidden),
        false,
        `current-v3 router state references superseded private precommit ${pin.proof.uri}`,
      );
    }
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      supersededIpfs.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli current-v3 superseded ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  return {
    ...baseline,
    classification: "RAVIOLI-CURRENT-V3-RESTART-LIVE-CHECK",
    operatorHistory,
    supersededPrivatePrecommit: {
      classification: "SUPERSEDED_PRIVATE_PRECOMMIT",
      onChainReferenced: false,
      pins: input.replay.supersededPrecommitPins.map((pin) => ({
        uri: pin.proof.uri,
        sha256: pin.proof.sha256,
        reason: pin.identity.supersededReason,
      })),
      ipfs: supersededIpfs,
    },
  };
}

export async function verifyRavioliCurrentV4ResumeLive(input: {
  replay: RavioliCurrentV4Resume;
  tezos: TezosToolkit;
  creatorAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  const baseline = await verifyRavioliCurrentV3RestartLive({
    ...input,
    replay: input.replay as unknown as RavioliCurrentV3Restart,
  });
  const routerStateText = JSON.stringify({
    storage: baseline.routerStorage,
    maps: baseline.routerMaps,
  });
  const ipfsEvidence: JsonObject[] = [];
  for (const pin of input.replay.cryptoInvalidPrecommitPins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} crypto-invalid length drift`);
    assert.equal(sha256(pin.bytes), pin.proof.sha256, `${pin.proof.fileName} crypto-invalid hash drift`);
    for (const forbidden of [pin.proof.uri, utf8ToHex(pin.proof.uri)]) {
      assert.equal(
        routerStateText.includes(forbidden),
        false,
        `current-v4 router state references crypto-invalid precommit ${pin.proof.uri}`,
      );
    }
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      ipfsEvidence.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli current-v4 crypto-invalid ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  assert.equal(input.replay.cryptoInvalidAudit.canonicalAadDecryptable, false);
  assert.equal(
    input.replay.cryptoInvalidAudit.pinnedEnvelopeSha256,
    input.replay.cryptoInvalidPrecommitPins[1]?.proof.sha256,
  );
  return {
    ...baseline,
    classification: "RAVIOLI-CURRENT-V4-RESUME-LIVE-CHECK",
    cryptoInvalidPrecommit: {
      ...input.replay.cryptoInvalidAudit,
      onChainReferenced: false,
      ipfs: ipfsEvidence,
    },
  };
}

export async function verifyRavioliCurrentV5ResumeLive(input: {
  resume: RavioliCurrentV5Resume;
  tezos: TezosToolkit;
  creatorAddress: string;
  collectorOneAddress: string;
  collectorTwoAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  const { resume } = input;
  assert.equal(input.creatorAddress, resume.identity.creatorAddress, "current-v5 creator drift");
  assert.equal(input.collectorOneAddress, resume.identity.collectorOneAddress, "current-v5 collector-one drift");
  assert.equal(input.collectorTwoAddress, resume.identity.collectorTwoAddress, "current-v5 collector-two drift");
  const [controllerScript, routerScript] = await Promise.all([
    input.tezos.rpc.getScript(resume.controllerAddress),
    input.tezos.rpc.getScript(resume.routerAddress),
  ]);
  const controllerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    controllerScript.code,
    input.controllerArtifact,
    "current-v5 controller differs from the exact journal-bound artifact",
  );
  const routerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    routerScript.code,
    input.routerArtifact,
    "current-v5 router differs from the exact journal-bound artifact",
  );

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [controllerStorage, routerStorage] = await Promise.all([
    pollJson(
      "Ravioli current-v5 controller storage",
      `${base}/contracts/${resume.controllerAddress}/storage`,
      (value) => Number(value?.claim_counts) > 0 && Number(value?.claim_slots) > 0 && Number(value?.packs) > 0,
    ),
    pollJson(
      "Ravioli current-v5 router storage",
      `${base}/contracts/${resume.routerAddress}/storage`,
      (value) => value?.administrator === input.creatorAddress
        && value?.blind_controller === resume.controllerAddress
        && Number(value?.next_token_id) === 2,
    ),
  ]);
  assert.equal(routerStorage.pending_administrator, null);
  const routerMapNames = ["ledger", "packs", "sales", "total_supply", "opened", "minted"] as const;
  const controllerMapNames = ["claim_counts", "claim_slots", "packs", "consumed_serials", "refund_credits"] as const;
  const routerMaps = Object.fromEntries(await Promise.all(routerMapNames.map(async (name) => [
    name,
    await readBigMap(routerStorage[name], `Ravioli current-v5 router ${name}`),
  ] as const))) as Record<typeof routerMapNames[number], JsonObject[]>;
  const controllerMaps = Object.fromEntries(await Promise.all(controllerMapNames.map(async (name) => [
    name,
    await readBigMap(controllerStorage[name], `Ravioli current-v5 controller ${name}`),
  ] as const))) as Record<typeof controllerMapNames[number], JsonObject[]>;
  assert.equal(routerMaps.packs.length, 2, "current-v5 router pack cardinality drift");
  assert.equal(routerMaps.sales.length, 2, "current-v5 router sale cardinality drift");
  assert.equal(findNat(routerMaps.total_supply, 0), 1, "current-v5 token-0 supply drift");
  assert.equal(findNat(routerMaps.total_supply, 1), 3, "current-v5 token-1 supply drift");
  assert.equal(findNat(routerMaps.opened, 0), 0, "current-v5 token-0 opened count drift");
  assert.equal(findNat(routerMaps.opened, 1), 0, "current-v5 token-1 opened count drift");
  assert.equal(findNat(routerMaps.minted, 0), 1, "current-v5 token-0 minted count drift");
  assert.equal(findNat(routerMaps.minted, 1), 3, "current-v5 token-1 minted count drift");
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 0), 1, "current-v5 creator token-0 balance drift");
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 1), 1, "current-v5 creator token-1 balance drift");
  assert.equal(findBalance(routerMaps.ledger, input.collectorOneAddress, 1), 1, "current-v5 collector-one token-1 balance drift");
  assert.equal(findBalance(routerMaps.ledger, input.collectorTwoAddress, 1), 1, "current-v5 collector-two token-1 balance drift");
  const tokenOneSale = routerMaps.sales.find((row) => Number(row.key) === 1)?.value as JsonObject;
  assert.equal(Number(tokenOneSale?.remaining), 1, "current-v5 token-1 remaining sale inventory drift");
  assert.equal(Number(tokenOneSale?.price), proofPackSpec(1)?.priceMutez, "current-v5 token-1 sale price drift");
  assert.equal(
    Date.parse(String(tokenOneSale?.end || "")),
    Date.parse(String((resume.openKits[1]?.value.editionPolicy as JsonObject)?.wrapperSaleEnd || "")),
    "current-v5 token-1 sale end differs from its retained open kit",
  );
  assert.equal(controllerMaps.packs.length, 1, "current-v5 controller pack cardinality drift");
  const blindPack = controllerMaps.packs[0]?.value as JsonObject;
  assert.equal(blindPack?.revealed, false, "current-v5 token-1 unexpectedly revealed");
  assert.equal(Number(blindPack?.outstanding), 2, "current-v5 outstanding blind claim count drift");
  assert.equal(Number(blindPack?.next_claim_id), 2, "current-v5 next blind claim id drift");
  assert.equal(controllerMaps.claim_counts.length, 2, "current-v5 claim owner cardinality drift");
  assert.equal(controllerMaps.claim_slots.length, 2, "current-v5 claim slot cardinality drift");
  assert.deepEqual(controllerMaps.consumed_serials, [], "current-v5 consumed serials must remain empty");
  assert.deepEqual(controllerMaps.refund_credits, [], "current-v5 refund credits must remain empty");

  const operationEvidence: JsonObject[] = [];
  for (const operation of resume.operations) {
    const endpoint = operation.identity.action === "originate" ? "originations" : "transactions";
    const rows = await pollJson(
      `Ravioli current-v5 operation ${operation.identity.globalOrdinal}`,
      `${base}/operations/${endpoint}/${encodeURIComponent(operation.identity.operationHash)}`,
      (value) => {
        try {
          assertRavioliJournalTzktOperationApplied({
            rows: value,
            action: operation.identity.action,
            operationHash: operation.identity.operationHash,
            signerAddress: operation.identity.signerAddress,
            expectedCounter: operation.identity.counter,
            contractAddress: operation.identity.contractAddress,
            entrypoints: operation.identity.entrypoints,
          });
          return true;
        } catch {
          return false;
        }
      },
    );
    const evidence = assertRavioliJournalTzktOperationApplied({
      rows,
      action: operation.identity.action,
      operationHash: operation.identity.operationHash,
      signerAddress: operation.identity.signerAddress,
      expectedCounter: operation.identity.counter,
      contractAddress: operation.identity.contractAddress,
      entrypoints: operation.identity.entrypoints,
    });
    assert.equal(evidence.level, operation.identity.level, `current-v5 operation ${operation.identity.globalOrdinal} level drift`);
    assert.equal(evidence.timestamp, operation.identity.timestamp, `current-v5 operation ${operation.identity.globalOrdinal} timestamp drift`);
    operationEvidence.push(evidence);
  }
  const ipfsEvidence: JsonObject[] = [];
  for (const pin of resume.activePins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} current-v5 journal length drift`);
    assert.equal(sha256(pin.bytes), pin.proof.sha256, `${pin.proof.fileName} current-v5 journal hash drift`);
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      ipfsEvidence.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli current-v5 ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  return {
    classification: "RAVIOLI-CURRENT-V5-RESUME-LIVE-CHECK",
    verifiedAt: new Date().toISOString(),
    controllerAddress: resume.controllerAddress,
    routerAddress: resume.routerAddress,
    controllerScriptCodeSha256,
    routerScriptCodeSha256,
    controllerStorage,
    routerStorage,
    controllerMaps,
    routerMaps,
    operationEvidence,
    ipfs: ipfsEvidence,
  };
}

export async function verifyRavioliCurrentV6ResumeLive(input: {
  resume: RavioliCurrentV6Resume;
  tezos: TezosToolkit;
  creatorAddress: string;
  collectorOneAddress: string;
  collectorTwoAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  gnocchiAdapterArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  const { resume } = input;
  assert.equal(input.creatorAddress, resume.identity.creatorAddress, "current-v6 creator drift");
  assert.equal(input.collectorOneAddress, resume.identity.collectorOneAddress, "current-v6 collector-one drift");
  assert.equal(input.collectorTwoAddress, resume.identity.collectorTwoAddress, "current-v6 collector-two drift");
  const [controllerScript, routerScript, gnocchiAdapterScript] = await Promise.all([
    input.tezos.rpc.getScript(resume.controllerAddress),
    input.tezos.rpc.getScript(resume.routerAddress),
    input.tezos.rpc.getScript(resume.gnocchiAdapterAddress),
  ]);
  const controllerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    controllerScript.code,
    input.controllerArtifact,
    "current-v6 controller differs from the exact journal-bound artifact",
  );
  const routerScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    routerScript.code,
    input.routerArtifact,
    "current-v6 router differs from the exact journal-bound artifact",
  );
  const gnocchiAdapterScriptCodeSha256 = assertMichelsonScriptCodeIdentity(
    gnocchiAdapterScript.code,
    input.gnocchiAdapterArtifact,
    "current-v6 Gnocchi adapter differs from the exact journal-bound artifact",
  );

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [controllerStorage, routerStorage, gnocchiAdapterStorage] = await Promise.all([
    pollJson(
      "Ravioli current-v6 controller storage",
      `${base}/contracts/${resume.controllerAddress}/storage`,
      (value) => Number(value?.claim_counts) > 0 && Number(value?.claim_slots) > 0 && Number(value?.packs) > 0,
    ),
    pollJson(
      "Ravioli current-v6 router storage",
      `${base}/contracts/${resume.routerAddress}/storage`,
      (value) => value?.administrator === input.creatorAddress
        && value?.blind_controller === resume.controllerAddress
        && Number(value?.next_token_id) === 3,
    ),
    pollJson(
      "Ravioli current-v6 Gnocchi adapter storage",
      `${base}/contracts/${resume.gnocchiAdapterAddress}/storage`,
      (value) => value?.administrator === input.creatorAddress
        && Number(value?.next_resource_id) === 1,
    ),
  ]);
  assert.equal(routerStorage.pending_administrator, null);
  const routerMapNames = ["ledger", "packs", "sales", "total_supply", "opened", "minted"] as const;
  const controllerMapNames = ["claim_counts", "claim_slots", "packs", "consumed_serials", "refund_credits"] as const;
  const adapterMapNames = ["allocations", "reservations", "routers"] as const;
  const routerMaps = Object.fromEntries(await Promise.all(routerMapNames.map(async (name) => [
    name,
    await readBigMap(routerStorage[name], `Ravioli current-v6 router ${name}`),
  ] as const))) as Record<typeof routerMapNames[number], JsonObject[]>;
  const controllerMaps = Object.fromEntries(await Promise.all(controllerMapNames.map(async (name) => [
    name,
    await readBigMap(controllerStorage[name], `Ravioli current-v6 controller ${name}`),
  ] as const))) as Record<typeof controllerMapNames[number], JsonObject[]>;
  const adapterMaps = Object.fromEntries(await Promise.all(adapterMapNames.map(async (name) => [
    name,
    await readBigMap(gnocchiAdapterStorage[name], `Ravioli current-v6 Gnocchi adapter ${name}`),
  ] as const))) as Record<typeof adapterMapNames[number], JsonObject[]>;

  assert.equal(routerMaps.packs.length, 3, "current-v6 router pack cardinality drift");
  assert.equal(routerMaps.sales.length, 3, "current-v6 router sale cardinality drift");
  assert.deepEqual([0, 1, 2].map((tokenId) => findNat(routerMaps.total_supply, tokenId)), [1, 2, 1]);
  assert.deepEqual([0, 1, 2].map((tokenId) => findNat(routerMaps.opened, tokenId)), [0, 0, 0]);
  assert.deepEqual([0, 1, 2].map((tokenId) => findNat(routerMaps.minted, tokenId)), [1, 2, 1]);
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 0), 1);
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 1), 0);
  assert.equal(findBalance(routerMaps.ledger, input.creatorAddress, 2), 1);
  assert.equal(findBalance(routerMaps.ledger, input.collectorOneAddress, 1), 0);
  assert.equal(findBalance(routerMaps.ledger, input.collectorTwoAddress, 1), 2);
  const sales = Object.fromEntries(routerMaps.sales.map((row) => [Number(row.key), row.value as JsonObject]));
  assert.deepEqual([0, 1, 2].map((tokenId) => Number(sales[tokenId]?.remaining)), [1, 0, 1]);
  assert.equal(Date.parse(String(sales[2]?.end || "")), Date.parse("2026-07-31T18:40:00.000Z"));

  assert.equal(controllerMaps.packs.length, 2, "current-v6 blind-controller pack cardinality drift");
  const controllerPacks = Object.fromEntries(controllerMaps.packs.map((row) => [
    Number((row.key as JsonObject).pack_token_id),
    row.value as JsonObject,
  ]));
  assert.equal(controllerPacks[1]?.revealed, false);
  assert.equal(Number(controllerPacks[1]?.outstanding), 2);
  assert.equal(Number(controllerPacks[1]?.unclaimed), 0);
  assert.equal(controllerPacks[2]?.revealed, false);
  assert.equal(Number(controllerPacks[2]?.outstanding), 0);
  assert.equal(Number(controllerPacks[2]?.unclaimed), 1);
  assert.equal(controllerMaps.claim_counts.length, 1);
  assert.equal(controllerMaps.claim_slots.length, 2);
  assert.deepEqual(controllerMaps.consumed_serials, []);
  assert.deepEqual(controllerMaps.refund_credits, []);

  assert.equal(adapterMaps.allocations.length, 1, "current-v6 Gnocchi allocation cardinality drift");
  assert.deepEqual(adapterMaps.allocations[0]?.value, {
    active: true,
    target: resume.identity.gnocchiAddress,
    token_id: "2",
    amount_per_open: "1",
  });
  assert.equal(adapterMaps.reservations.length, 1, "current-v6 Gnocchi reservation cardinality drift");
  assert.equal(Number(adapterMaps.reservations[0]?.value), 1);
  assert.deepEqual(adapterMaps.reservations[0]?.key, {
    resource_id: "0",
    pack_contract: resume.routerAddress,
    pack_token_id: "2",
  });
  assert.equal(adapterMaps.routers.length, 1, "current-v6 Gnocchi router authorization drift");
  assert.equal(adapterMaps.routers[0]?.key, resume.routerAddress);

  const operationEvidence: JsonObject[] = [];
  for (const operation of resume.operations) {
    const endpoint = operation.identity.action === "originate" ? "originations" : "transactions";
    const rows = await pollJson(
      `Ravioli current-v6 operation ${operation.identity.globalOrdinal}`,
      `${base}/operations/${endpoint}/${encodeURIComponent(operation.identity.operationHash)}`,
      (value) => {
        try {
          assertRavioliJournalTzktOperationApplied({
            rows: value,
            action: operation.identity.action,
            operationHash: operation.identity.operationHash,
            signerAddress: operation.identity.signerAddress,
            expectedCounter: operation.identity.counter,
            contractAddress: operation.identity.contractAddress,
            entrypoints: operation.identity.entrypoints,
          });
          return true;
        } catch {
          return false;
        }
      },
    );
    const evidence = assertRavioliJournalTzktOperationApplied({
      rows,
      action: operation.identity.action,
      operationHash: operation.identity.operationHash,
      signerAddress: operation.identity.signerAddress,
      expectedCounter: operation.identity.counter,
      contractAddress: operation.identity.contractAddress,
      entrypoints: operation.identity.entrypoints,
    });
    assert.equal(evidence.level, operation.identity.level);
    assert.equal(evidence.timestamp, operation.identity.timestamp);
    operationEvidence.push(evidence);
  }
  const ipfsEvidence: JsonObject[] = [];
  for (const pin of resume.activePins) {
    assert.equal(pin.bytes.byteLength, pin.proof.byteLength);
    assert.equal(sha256(pin.bytes), pin.proof.sha256);
    for (const [lane, url] of [
      ["local", ipfsGatewayUrl(input.ipfs.localGatewayUrl, pin.proof.cid)],
      ["public", ipfsGatewayUrl(input.ipfs.publicGatewayUrl, pin.proof.cid)],
    ] as const) {
      ipfsEvidence.push(await verifyRavioliMode0ReplayHttpBytes({
        label: `Ravioli current-v6 ${lane} IPFS ${pin.proof.fileName}`,
        url,
        expectedSha256: pin.proof.sha256,
        expectedByteLength: pin.proof.byteLength,
      }));
    }
  }
  return {
    classification: "RAVIOLI-CURRENT-V6-RESUME-LIVE-CHECK",
    verifiedAt: new Date().toISOString(),
    controllerAddress: resume.controllerAddress,
    routerAddress: resume.routerAddress,
    gnocchiAdapterAddress: resume.gnocchiAdapterAddress,
    controllerScriptCodeSha256,
    routerScriptCodeSha256,
    gnocchiAdapterScriptCodeSha256,
    controllerStorage,
    routerStorage,
    gnocchiAdapterStorage,
    controllerMaps,
    routerMaps,
    adapterMaps,
    operationEvidence,
    ipfs: ipfsEvidence,
  };
}

export async function verifyRavioliCurrentV7ResumeLive(input: {
  resume: RavioliCurrentV7Resume;
  tezos: TezosToolkit;
  creatorAddress: string;
  collectorOneAddress: string;
  collectorTwoAddress: string;
  controllerArtifact: unknown[];
  routerArtifact: unknown[];
  gnocchiAdapterArtifact: unknown[];
  ipfs: IpfsProofConfig;
}): Promise<JsonObject> {
  const verified = await verifyRavioliCurrentV6ResumeLive(input);
  return {
    ...verified,
    classification: "RAVIOLI-CURRENT-V7-RESUME-LIVE-CHECK",
    boundaryEventCount: input.resume.v7Identity.boundaryEventCount,
    boundaryFinalEventSha256: input.resume.v7Identity.boundaryFinalEventSha256,
    predecessorSemanticEventSha256:
      input.resume.v7Identity.predecessorSemanticEventSha256,
  };
}

export function stableRavioliMode0MutationLiveCheck(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stableRavioliMode0MutationLiveCheck(entry));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "verifiedAt") continue;
      output[key] = stableRavioliMode0MutationLiveCheck(entry);
    }
    return output;
  }
  return value;
}

export function dependencyOriginationReceipt(
  manifest: JsonObject,
  receipt: JsonObject,
  address: string,
  creator: string,
): PastaUiLivePublicReceipt & { operationHash: string } {
  const manifestOrigins = (manifest.operations as JsonObject[]).filter((operation) => operation.kind === "origination");
  assert.equal(manifestOrigins.length, 1, `${manifest.app} manifest must contain exactly one origination`);
  const manifestOrigin = manifestOrigins[0];
  assert.equal(manifestOrigin.contractAddress, address, `${manifest.app} manifest origination address drift`);
  assert.equal(validateOperation(manifestOrigin.hash), ValidationResult.VALID);
  const receipts = Array.isArray(receipt.receipts)
    ? receipt.receipts
    : Array.isArray(receipt.bridgeReceipts?.creator)
      ? receipt.bridgeReceipts.creator
      : [];
  const origins = receipts.filter((candidate: JsonObject) => candidate.action === "originate");
  assert.equal(origins.length, 1, `${manifest.app} UI-live receipt must contain exactly one origination`);
  const origin = origins[0] as PastaUiLivePublicReceipt & { operationHash: string };
  assert.equal(origin.contractAddress, address, `${manifest.app} UI-live origination address drift`);
  assert.equal(origin.signerAddress, creator, `${manifest.app} UI-live origination signer drift`);
  assert.equal(origin.operationHash, manifestOrigin.hash, `${manifest.app} origination hash differs between manifest and receipt`);
  assert.equal(validateOperation(origin.operationHash), ValidationResult.VALID);
  return origin;
}

function appliedOperationRows(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter((entry) => entry?.status === "applied");
  const record = value as JsonObject;
  return record?.status === "applied" ? [record] : [];
}

type RavioliJournalActorIntents = Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent>;

async function readRavioliJournalCounterLane(
  rpcUrl: string,
  actors: Record<RavioliUiLiveJournalActor, string>,
): Promise<Record<RavioliUiLiveJournalActor, { rpcUrl: string; counter: number }>> {
  const base = normalizeBase(rpcUrl);
  const actorEntries = Object.entries(actors) as Array<[RavioliUiLiveJournalActor, string]>;
  const [chainResponse, mempoolResponse, ...counterResponses] = await Promise.all([
    fetch(`${base}/chains/main/chain_id`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/mempool/pending_operations`, { signal: AbortSignal.timeout(30_000) }),
    ...actorEntries.map(([, address]) => fetch(
      `${base}/chains/main/blocks/head/context/contracts/${encodeURIComponent(address)}/counter`,
      { signal: AbortSignal.timeout(30_000) },
    )),
  ]);
  assert.ok(chainResponse.ok, `${base} journal chain-id read failed with HTTP ${chainResponse.status}`);
  assert.ok(mempoolResponse.ok, `${base} journal mempool read failed with HTTP ${mempoolResponse.status}`);
  assert.equal(JSON.parse(await chainResponse.text()), SHADOWNET_CHAIN_ID, `${base} journal chain id drift`);
  const mempool = JSON.parse(await mempoolResponse.text()) as JsonObject;
  const actorAddresses = new Set(Object.values(actors));
  const activeBuckets = ["applied", "validated", "branch_delayed", "unprocessed"];
  const active = activeBuckets.flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) => operation?.contents?.some(
      (content: JsonObject) => actorAddresses.has(String(content?.source || "")),
    ));
  assert.equal(active.length, 0, `${base} has an active Ravioli actor operation in its mempool`);
  const output = {} as Record<RavioliUiLiveJournalActor, { rpcUrl: string; counter: number }>;
  for (let index = 0; index < actorEntries.length; index += 1) {
    const response = counterResponses[index];
    assert.ok(response.ok, `${base} ${actorEntries[index][0]} counter read failed with HTTP ${response.status}`);
    const counter = Number(JSON.parse(await response.text()));
    assert.ok(Number.isSafeInteger(counter) && counter >= 0, `${base} ${actorEntries[index][0]} counter is invalid`);
    output[actorEntries[index][0]] = { rpcUrl: base, counter };
  }
  return output;
}

async function readRavioliJournalActorIntents(
  actors: Record<RavioliUiLiveJournalActor, string>,
): Promise<RavioliJournalActorIntents> {
  const [primary, fallback] = await Promise.all([
    readRavioliJournalCounterLane(SHADOWNET_RPC_PRIMARY, actors),
    readRavioliJournalCounterLane(SHADOWNET_RPC_FALLBACK, actors),
  ]);
  const intents = {} as RavioliJournalActorIntents;
  for (const actor of ["creator", "collector1", "collector2"] as const) {
    assert.equal(primary[actor].counter, fallback[actor].counter, `${actor} dual-RPC counters disagree before journal creation`);
    intents[actor] = {
      signerAddress: actors[actor],
      counters: { primary: primary[actor], fallback: fallback[actor] },
    };
  }
  return intents;
}

async function readRavioliJournalCurrentActorState(
  rpcUrl: string,
  signerAddress: string,
): Promise<{ counter: number; activeOperationCount: number }> {
  const base = normalizeBase(rpcUrl);
  const [counterResponse, mempoolResponse] = await Promise.all([
    fetch(`${base}/chains/main/blocks/head/context/contracts/${encodeURIComponent(signerAddress)}/counter`, {
      signal: AbortSignal.timeout(30_000),
    }),
    fetch(`${base}/chains/main/mempool/pending_operations`, { signal: AbortSignal.timeout(30_000) }),
  ]);
  assert.ok(counterResponse.ok, `${base} journal pre-submit counter read failed with HTTP ${counterResponse.status}`);
  assert.ok(mempoolResponse.ok, `${base} journal pre-submit mempool read failed with HTTP ${mempoolResponse.status}`);
  const counter = Number(JSON.parse(await counterResponse.text()));
  assert.ok(Number.isSafeInteger(counter) && counter >= 0, `${base} journal pre-submit counter is invalid`);
  const mempool = JSON.parse(await mempoolResponse.text()) as JsonObject;
  const activeBuckets = ["applied", "validated", "branch_delayed", "unprocessed"];
  const activeOperationCount = activeBuckets.flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) => operation?.contents?.some(
      (content: JsonObject) => content?.source === signerAddress,
    )).length;
  return { counter, activeOperationCount };
}

async function assertRavioliJournalCounterBeforeSubmit(
  intent: RavioliUiLiveActorIntent,
  operationSequence: number,
  counterOffset = 0,
): Promise<void> {
  assert.ok(Number.isSafeInteger(operationSequence) && operationSequence > 0, "journal operation sequence is invalid");
  assert.ok(Number.isSafeInteger(counterOffset) && counterOffset >= 0, "journal counter offset is invalid");
  const expectedCurrentCounter = intent.counters.primary.counter + operationSequence + counterOffset - 1;
  let lastPrimary: { counter: number; activeOperationCount: number } | null = null;
  let lastFallback: { counter: number; activeOperationCount: number } | null = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    [lastPrimary, lastFallback] = await Promise.all([
      readRavioliJournalCurrentActorState(intent.counters.primary.rpcUrl, intent.signerAddress),
      readRavioliJournalCurrentActorState(intent.counters.fallback.rpcUrl, intent.signerAddress),
    ]);
    assert.ok(lastPrimary.counter <= expectedCurrentCounter, "primary RPC journal counter advanced beyond immutable intent");
    assert.ok(lastFallback.counter <= expectedCurrentCounter, "fallback RPC journal counter advanced beyond immutable intent");
    if (
      lastPrimary.counter === expectedCurrentCounter &&
      lastFallback.counter === expectedCurrentCounter &&
      lastPrimary.activeOperationCount === 0 &&
      lastFallback.activeOperationCount === 0
    ) return;
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert.fail(
    `dual-RPC journal counter/mempool did not settle before submission: expected=${expectedCurrentCounter} ` +
    `primary=${JSON.stringify(lastPrimary)} fallback=${JSON.stringify(lastFallback)}`,
  );
}

export function assertRavioliJournalTzktOperationApplied(input: {
  rows: unknown;
  action: "originate" | "call";
  operationHash: string;
  signerAddress: string;
  expectedCounter: number;
  contractAddress?: string;
  entrypoints: readonly string[];
}): JsonObject {
  assert.equal(validateOperation(input.operationHash), ValidationResult.VALID, "journal operation hash is invalid");
  assert.equal(validateAddress(input.signerAddress), ValidationResult.VALID, "journal signer is invalid");
  assert.ok(Number.isSafeInteger(input.expectedCounter) && input.expectedCounter > 0, "journal expected counter is invalid");
  const candidates = appliedOperationRows(input.rows).filter((row) =>
    row?.hash === input.operationHash &&
    row?.sender?.address === input.signerAddress &&
    Number(row?.counter) === input.expectedCounter,
  );
  assert.equal(candidates.length, 1, "TzKT does not expose exactly one applied operation at the journal actor/counter");
  const operation = candidates[0];
  assert.ok(Number.isSafeInteger(Number(operation.level)) && Number(operation.level) > 0, "journal operation level is invalid");
  assert.ok(
    typeof operation.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T/.test(operation.timestamp) && Number.isFinite(Date.parse(operation.timestamp)),
    "journal operation timestamp is invalid",
  );
  if (input.action === "originate") {
    assert.deepEqual(input.entrypoints, [], "journal origination cannot have entrypoints");
    assert.equal(validateContractAddress(input.contractAddress || ""), ValidationResult.VALID, "journal originated address is invalid");
    assert.equal(operation?.originatedContract?.address, input.contractAddress, "journal originated address differs from TzKT");
  } else {
    assert.equal(input.entrypoints.length, 1, "journal call must have exactly one entrypoint");
    assert.equal(validateContractAddress(input.contractAddress || ""), ValidationResult.VALID, "journal call target is invalid");
    assert.equal(operation?.target?.address, input.contractAddress, "journal call target differs from TzKT");
    assert.equal(operation?.parameter?.entrypoint, input.entrypoints[0], "journal call entrypoint differs from TzKT");
  }
  return {
    status: "applied",
    operationHash: input.operationHash,
    counter: input.expectedCounter,
    level: Number(operation.level),
    timestamp: String(operation.timestamp || ""),
    signerAddress: input.signerAddress,
    contractAddress: input.contractAddress || "",
    entrypoints: [...input.entrypoints],
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
  };
}

async function verifyRavioliJournalOperationApplied(input: {
  assertion: PastaUiLiveAppliedOperationAssertion;
  actor: RavioliUiLiveJournalActor;
  operationSequence: number;
  counterOffset?: number;
  intent: RavioliUiLiveActorIntent;
}): Promise<JsonObject> {
  const action = input.assertion.action;
  if (action === "batch") throw new Error("Ravioli journal rejects applied batches");
  const endpoint = action === "originate" ? "originations" : "transactions";
  const expectedCounter = input.intent.counters.primary.counter
    + input.operationSequence
    + (input.counterOffset || 0);
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/${endpoint}/${encodeURIComponent(input.assertion.operationHash)}`;
  const rows = await pollJson(
    `Ravioli journal ${input.actor} operation ${input.operationSequence} applied`,
    url,
    (value) => {
      try {
        assertRavioliJournalTzktOperationApplied({
          rows: value,
          action,
          operationHash: input.assertion.operationHash,
          signerAddress: input.intent.signerAddress,
          expectedCounter,
          contractAddress: input.assertion.contractAddress,
          entrypoints: input.assertion.entrypoints,
        });
        return true;
      } catch {
        return false;
      }
    },
  );
  return assertRavioliJournalTzktOperationApplied({
    rows,
    action,
    operationHash: input.assertion.operationHash,
    signerAddress: input.intent.signerAddress,
    expectedCounter,
    contractAddress: input.assertion.contractAddress,
    entrypoints: input.assertion.entrypoints,
  });
}

function ravioliJournalSessionHooks(input: {
  journal: RavioliUiLiveJournal;
  actor: RavioliUiLiveJournalActor;
  intent: RavioliUiLiveActorIntent;
}): {
  beforeOperationSubmit(operation: PastaUiLivePreparedOperation): Promise<void>;
  onOperationSubmitted(operation: PastaUiLiveSubmittedOperation): Promise<void>;
  assertOperationApplied(assertion: PastaUiLiveAppliedOperationAssertion): Promise<void>;
} {
  const callbacks = input.journal.callbacks(input.actor);
  const sequenceByHash = new Map<string, number>();
  return {
    beforeOperationSubmit: async (operation) => {
      await assertRavioliJournalCounterBeforeSubmit(
        input.intent,
        operation.operationSequence,
        input.journal.getCounterOffset(input.actor),
      );
      await callbacks.beforeOperationSubmit(operation);
    },
    onOperationSubmitted: async (operation) => {
      await callbacks.onOperationSubmitted(operation);
      sequenceByHash.set(operation.operationHash, operation.operationSequence);
    },
    assertOperationApplied: async (assertion) => {
      const operationSequence = sequenceByHash.get(assertion.operationHash);
      assert.ok(operationSequence, `Ravioli journal has no SUBMITTED sequence for ${assertion.operationHash}`);
      const evidence = await verifyRavioliJournalOperationApplied({
        assertion,
        actor: input.actor,
        operationSequence,
        counterOffset: input.journal.getCounterOffset(input.actor),
        intent: input.intent,
      });
      await input.journal.appendApplied({
        actor: input.actor,
        operationSequence,
        operationHash: assertion.operationHash,
        contractAddress: assertion.contractAddress,
        entrypoints: assertion.entrypoints,
        evidence,
      });
      sequenceByHash.delete(assertion.operationHash);
    },
  };
}

async function verifySameRunOrigination(input: {
  label: string;
  address: string;
  creator: string;
  receipt: PastaUiLivePublicReceipt & { operationHash: string };
  startedAt: string;
  completedAt: string;
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const indexed = await pollJson(
    `${input.label} same-run origination`,
    `${base}/operations/originations/${encodeURIComponent(input.receipt.operationHash)}`,
    (value) => appliedOperationRows(value).some((operation) =>
      operation?.originatedContract?.address === input.address && operation?.sender?.address === input.creator,
    ),
  );
  const operation = appliedOperationRows(indexed).find((candidate) =>
    candidate?.originatedContract?.address === input.address && candidate?.sender?.address === input.creator,
  );
  assert.ok(operation, `${input.label} same-run origination is not indexed`);
  const startedAt = Date.parse(input.startedAt);
  const completedAt = Date.parse(input.completedAt);
  const indexedAt = Date.parse(String(operation.timestamp || ""));
  assert.ok(Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt);
  assert.ok(
    Number.isFinite(indexedAt) && indexedAt >= startedAt - 600_000 && indexedAt <= completedAt + 600_000,
    `${input.label} origination timestamp is outside the dependency run window`,
  );
  return {
    hash: input.receipt.operationHash,
    address: input.address,
    creator: input.creator,
    level: operation.level,
    timestamp: operation.timestamp,
    explorerUrl: `https://shadownet.tzkt.io/${input.receipt.operationHash}`,
  };
}

async function validateHistoricalRavioliDependencies(
  runRoot: string,
  runId: string,
  creatorAddress: string,
): Promise<HistoricalDependencyEvidence> {
  const gnocchiRoot = path.join(runRoot, "gnocchi");
  const rotiniRoot = path.join(runRoot, "rotini");
  const gnocchiManifestPath = path.join(gnocchiRoot, "manifest.json");
  const gnocchiReceiptPath = path.join(gnocchiRoot, "artifacts", "gnocchi-ui-live-run.json");
  const rotiniManifestPath = path.join(rotiniRoot, "manifest.json");
  const rotiniReceiptPath = path.join(rotiniRoot, "artifacts", "rotini-ui-live-run.json");
  const recoveryReceiptPath = path.join(
    runRoot,
    "ravioli-dependency-recovery",
    "artifacts",
    "gnocchi-inventory-recovery.json",
  );
  const nativeRecoveryReceiptPath = path.join(
    runRoot,
    RAVIOLI_NATIVE_RECOVERY_DIRECTORY,
    "artifacts",
    "ravioli-native-recovery.json",
  );
  const prepackRecoveryRoot = path.join(runRoot, RAVIOLI_PREPACK_RECOVERY_DIRECTORY);
  const prepackRecoveryPreflightPath = path.join(prepackRecoveryRoot, "recovery-preflight.json");
  const prepackRecoveryIntentPath = path.join(prepackRecoveryRoot, "recovery-intent.json");
  const prepackRecoveryProgressPath = path.join(prepackRecoveryRoot, "recovery-progress.json");
  const prepackRecoveryReceiptPath = path.join(
    prepackRecoveryRoot,
    "artifacts",
    "ravioli-prepack-recovery.json",
  );
  const [
    gnocchiManifestFile,
    gnocchiReceiptFile,
    rotiniManifestFile,
    rotiniReceiptFile,
    recoveryReceiptFile,
    nativeRecovery,
    nativeRecoveryLive,
    gnocchiLe,
    prepackRecoveryPreflightFile,
    prepackRecoveryIntentFile,
    prepackRecoveryProgressFile,
    prepackRecoveryReceiptFile,
  ] = await Promise.all([
    readJsonFile(gnocchiManifestPath),
    readJsonFile(gnocchiReceiptPath),
    readJsonFile(rotiniManifestPath),
    readJsonFile(rotiniReceiptPath),
    readJsonFile(recoveryReceiptPath),
    loadRavioliNativeRecoveryHandoff(runRoot),
    verifyRavioliNativeRecoveryLive(runRoot),
    loadRavioliGnocchiLeDependency(runRoot),
    readJsonFile(prepackRecoveryPreflightPath),
    readJsonFile(prepackRecoveryIntentPath),
    readJsonFile(prepackRecoveryProgressPath),
    readJsonFile(prepackRecoveryReceiptPath),
  ]);
  const gnocchiManifest = gnocchiManifestFile.value;
  const gnocchiReceipt = gnocchiReceiptFile.value;
  const rotiniManifest = rotiniManifestFile.value;
  const rotiniReceipt = rotiniReceiptFile.value;
  const prepackRecoveryPreflight = validateRavioliPrepackRecoveryPreflight(
    prepackRecoveryPreflightFile.value,
  );
  const prepackRecoveryIntent = validateRavioliPrepackRecoveryIntent(
    prepackRecoveryIntentFile.value,
    prepackRecoveryPreflight,
    prepackRecoveryPreflightFile.digest,
  );
  validateRavioliPrepackRecoveryReceipt(
    prepackRecoveryReceiptFile.value,
    prepackRecoveryPreflight,
    prepackRecoveryPreflightFile.digest,
    prepackRecoveryIntent,
    prepackRecoveryIntentFile.digest,
  );
  validateRavioliPrepackRecoveryProgress(
    prepackRecoveryProgressFile.value,
    prepackRecoveryPreflightFile.digest,
    prepackRecoveryIntentFile.digest,
    prepackRecoveryReceiptFile.value.operation,
  );
  assert.equal(
    prepackRecoveryReceiptFile.value.after?.gnocchi?.targetOperator?.active,
    false,
    "Ravioli pre-pack recovery receipt still exposes the orphan operator as active",
  );
  assert.equal(
    prepackRecoveryReceiptFile.value.after?.router?.nextTokenId,
    0,
    "Ravioli pre-pack recovery receipt does not preserve the empty orphan router",
  );
  assertAppliedManifest(gnocchiManifest, "gnocchi", runId);
  assertAppliedManifest(rotiniManifest, "rotini", runId);
  await Promise.all([
    verifyManifestFiles(gnocchiRoot, gnocchiManifest),
    verifyManifestFiles(rotiniRoot, rotiniManifest),
  ]);
  const historicalSnapshots = (gnocchiManifest.artifacts || []).filter(
    (artifact: JsonObject) => artifact.kind === "historical-indexer-snapshot",
  );
  assert.equal(historicalSnapshots.length, 1, "Gnocchi dependency must bind one historical indexer snapshot");
  const acceptedEvidenceHashes: AcceptedEvidenceHashes = {
    manifestSha256: gnocchiManifestFile.digest,
    receiptSha256: gnocchiReceiptFile.digest,
    historicalSnapshotSha256: String(historicalSnapshots[0].sha256 || ""),
  };
  validateRavioliRecoveryReceipt(recoveryReceiptFile.value, acceptedEvidenceHashes);

  assert.equal(gnocchiReceipt.schema, "pastaprotocol-gnocchi-ui-live-run@1");
  assert.equal(rotiniReceipt.schema, "pastaprotocol-rotini-ui-live-run@1");
  for (const receipt of [gnocchiReceipt, rotiniReceipt]) {
    assert.equal(receipt.classification, "UI-LIVE");
    if (typeof receipt.network === "string") {
      assert.equal(receipt.network, "shadownet");
      assert.equal(receipt.chainId, SHADOWNET_CHAIN_ID);
    } else {
      assert.equal(receipt.network?.name, "shadownet");
      assert.equal(receipt.network?.chainId, SHADOWNET_CHAIN_ID);
    }
    assert.equal(receipt.actors?.creator, creatorAddress, "dependency creator must be the current Node signer");
  }
  const gnocchiAddress = String(gnocchiManifest.contracts[0].address);
  const rotiniAddress = String(rotiniManifest.contracts[0].address);
  assert.equal(gnocchiReceipt.contract?.address, gnocchiAddress);
  assert.equal(rotiniReceipt.contract?.address, rotiniAddress);
  assert.equal(nativeRecovery.handoff.gnocchi.contract, gnocchiAddress, "native recovery Gnocchi dependency address drift");
  assert.equal(nativeRecovery.handoff.rotini.contract, rotiniAddress, "native recovery Rotini dependency address drift");
  assert.equal(nativeRecoveryLive.receiptSha256, nativeRecovery.receiptSha256, "native recovery live receipt digest drift");
  assert.deepEqual(nativeRecoveryLive.handoff, nativeRecovery.handoff, "native recovery live handoff drift");
  assert.equal(gnocchiLe.receipt.contract.address, gnocchiAddress, "Gnocchi LE supplement contract drift");
  assert.equal(gnocchiLe.receipt.contract.administrator, creatorAddress, "Gnocchi LE supplement administrator drift");
  assert.equal(gnocchiLe.receipt.token.tokenId, RAVIOLI_GNOCCHI_LIMITED_ALLOCATION_TOKEN_ID);
  const rotiniCollector = String(rotiniReceipt.actors?.collector || "");
  assert.ok(rotiniCollector.startsWith("tz1"), "Rotini dependency receipt must identify its independent collector");
  assert.notEqual(rotiniCollector, creatorAddress, "Rotini dependency collector must be independent from the creator");
  const gnocchiOrigin = dependencyOriginationReceipt(gnocchiManifest, gnocchiReceipt, gnocchiAddress, creatorAddress);
  const rotiniOrigin = dependencyOriginationReceipt(rotiniManifest, rotiniReceipt, rotiniAddress, creatorAddress);

  assert.ok(Array.isArray(gnocchiManifest.tokens));
  const gnocchiTokens = gnocchiManifest.tokens.slice().sort((left: JsonObject, right: JsonObject) => Number(left.tokenId) - Number(right.tokenId));
  assert.deepEqual(gnocchiTokens.map((token: JsonObject) => Number(token.tokenId)), [0, 1, 2]);
  assert.ok(gnocchiTokens.every((token: JsonObject) => token.contractAddress === gnocchiAddress && /^ipfs:\/\//.test(token.metadataUri)));
  const gnocchiMetadataUris = [
    ...gnocchiTokens.map((token: JsonObject) => String(token.metadataUri)),
    gnocchiLe.receipt.token.metadataUri,
  ];
  assert.equal(gnocchiMetadataUris.length, RAVIOLI_GNOCCHI_LIMITED_ALLOCATION_TOKEN_ID + 1);
  assert.ok(Array.isArray(rotiniReceipt.projects));
  const pngProject = rotiniReceipt.projects.find((project: JsonObject) => Number(project.projectId) === 0);
  assert.ok(pngProject, "Rotini receipt must expose PNG project zero");
  assert.equal(pngProject.outputMode, "png");
  assert.equal(pngProject.mimeType, "image/png");
  assert.equal(Number(pngProject.priceMutez ?? pngProject.price), 0, "Rotini pack dependency must be free");
  assert.equal(Number(pngProject.maxSupply ?? pngProject.max_supply), 3);
  assert.equal(Number(pngProject.minted), 1);
  assert.equal(Number(pngProject.reserved), 0);

  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [gnocchiStorageValue, rotiniStorageValue, gnocchiOrigination, rotiniOrigination] = await Promise.all([
    pollJson("same-run Gnocchi dependency storage", `${base}/contracts/${gnocchiAddress}/storage`, (value) =>
      Number(value?.ledger) > 0 && Number(value?.sales) > 0 && Number(value?.token_metadata) > 0 &&
      Number(value?.total_supply) > 0 && Number(value?.total_reserved) > 0 &&
      Number(value?.next_token_id) === RAVIOLI_GNOCCHI_LIMITED_ALLOCATION_TOKEN_ID + 1,
    ),
    pollJson("same-run Rotini dependency storage", `${base}/contracts/${rotiniAddress}/storage`, (value) => Number(value?.projects) > 0 && Number(value?.token_metadata) > 0 && Number(value?.ledger) > 0),
    verifySameRunOrigination({
      label: "Gnocchi dependency",
      address: gnocchiAddress,
      creator: creatorAddress,
      receipt: gnocchiOrigin,
      startedAt: String(gnocchiReceipt.startedAt),
      completedAt: String(gnocchiReceipt.completedAt),
    }),
    verifySameRunOrigination({
      label: "Rotini dependency",
      address: rotiniAddress,
      creator: creatorAddress,
      receipt: rotiniOrigin,
      startedAt: String(rotiniReceipt.startedAt),
      completedAt: String(rotiniReceipt.completedAt),
    }),
  ]);
  const [gnocchiLedger, gnocchiSales, gnocchiMetadata, gnocchiSupply, gnocchiReserved, gnocchiPolicyLocked, gnocchiOperators, rotiniProjects] = await Promise.all([
    readBigMap(gnocchiStorageValue.ledger, "same-run Gnocchi ledger"),
    readBigMap(gnocchiStorageValue.sales, "same-run Gnocchi sales"),
    readBigMap(gnocchiStorageValue.token_metadata, "same-run Gnocchi token metadata"),
    readBigMap(gnocchiStorageValue.total_supply, "same-run Gnocchi total supply"),
    readBigMap(gnocchiStorageValue.total_reserved, "same-run Gnocchi reserved supply"),
    readBigMap(gnocchiStorageValue.policy_locked, "same-run Gnocchi locked issuance policies"),
    readBigMap(gnocchiStorageValue.operators, "same-run Gnocchi active operators"),
    readBigMap(rotiniStorageValue.projects, "same-run Rotini projects"),
  ]);
  assert.equal(
    hasActiveRavioliOperator(gnocchiOperators, {
      owner: creatorAddress,
      operator: String(prepackRecoveryReceiptFile.value.before?.gnocchi?.targetOperator?.key?.operator || ""),
      tokenId: 0,
    }),
    false,
    "the quarantined Ravioli router still has an active Gnocchi token-0 authorization",
  );
  const creatorBalances = {
    "0": findBalance(gnocchiLedger, creatorAddress, 0),
    "1": findBalance(gnocchiLedger, creatorAddress, 1),
  };
  assert.equal(creatorBalances["0"], 2, "Gnocchi token zero must provide two creator escrow units");
  assert.equal(creatorBalances["1"], 2, "Gnocchi token one must provide two creator escrow units");
  const totalSupply = { "0": findNat(gnocchiSupply, 0), "1": findNat(gnocchiSupply, 1) };
  const totalReserved = { "0": findNat(gnocchiReserved, 0), "1": findNat(gnocchiReserved, 1) };
  const gnocchiRoles = validateRavioliGnocchiDependencyRoles({
    sales: gnocchiSales,
    metadata: gnocchiMetadata,
    policyLocked: gnocchiPolicyLocked,
    tokenMetadataUris: gnocchiMetadataUris,
    limitedEdition: {
      tokenId: gnocchiLe.receipt.token.tokenId,
      end: gnocchiLe.receipt.token.end,
      maxSupply: gnocchiLe.receipt.token.maxSupply,
      metadataUri: gnocchiLe.receipt.token.metadataUri,
    },
  });
  const completedProject = rotiniProjects.find((entry) => Number(entry.key) === nativeRecovery.handoff.rotini.completedProjectId)?.value;
  const freshProject = rotiniProjects.find((entry) => Number(entry.key) === nativeRecovery.handoff.rotini.freshProjectId)?.value;
  assert.ok(completedProject, "native recovery completed Rotini project is missing");
  assert.ok(freshProject, "native recovery fresh Rotini project is missing");
  const operativeRotini = validateRavioliNativeDependencyTransition({
    handoff: nativeRecovery.handoff,
    gnocchiAddress,
    rotiniAddress,
    creatorBalances,
    totalSupply,
    totalReserved,
    completedProject,
    freshProject,
    nextProjectId: Number(rotiniStorageValue.next_project_id),
    nextTokenId: Number(rotiniStorageValue.next_token_id),
  });
  const baselineRotiniTokenIds = Array.from({ length: operativeRotini.nextTokenId }, (_, tokenId) => tokenId);
  const [gnocchiFa2, rotiniFa2] = await Promise.all([
    readIndexedFa2Evidence({
      label: "same-run Gnocchi dependency",
      address: gnocchiAddress,
      creator: creatorAddress,
      // Token 3 is a zero-supply allocation definition here. TzKT creates its
      // token row only after Ravioli's atomic allocation open mints supply; the
      // final verifier below requires that row and its delivered balance.
      tokenIds: [0, 1, 2],
      balances: [
        { owner: creatorAddress, tokenId: 0, balance: 2 },
        { owner: creatorAddress, tokenId: 1, balance: 2 },
      ],
    }),
    readIndexedFa2Evidence({
      label: "same-run Rotini dependency",
      address: rotiniAddress,
      creator: creatorAddress,
      tokenIds: baselineRotiniTokenIds,
      balances: [
        ...[0, 1, 2].map((tokenId) => ({ owner: rotiniCollector, tokenId, balance: 1 })),
        ...[3, 4].map((tokenId) => ({ owner: creatorAddress, tokenId, balance: 1 })),
      ],
    }),
  ]);

  return {
    runId,
    recovery: {
      receipt: recoveryReceiptFile.value,
      receiptSha256: recoveryReceiptFile.digest,
      receiptPath: path.relative(runRoot, recoveryReceiptPath).split(path.sep).join("/"),
      acceptedEvidenceHashes,
    },
    nativeRecovery: {
      receipt: nativeRecovery.receipt,
      receiptSha256: nativeRecovery.receiptSha256,
      receiptPath: path.relative(runRoot, nativeRecoveryReceiptPath).split(path.sep).join("/"),
      handoff: nativeRecovery.handoff,
      liveVerification: nativeRecoveryLive,
    },
    prepackRecovery: {
      preflight: prepackRecoveryPreflight,
      preflightSha256: prepackRecoveryPreflightFile.digest,
      preflightPath: path.relative(runRoot, prepackRecoveryPreflightPath).split(path.sep).join("/"),
      intent: prepackRecoveryIntent,
      intentSha256: prepackRecoveryIntentFile.digest,
      intentPath: path.relative(runRoot, prepackRecoveryIntentPath).split(path.sep).join("/"),
      progress: prepackRecoveryProgressFile.value,
      progressSha256: prepackRecoveryProgressFile.digest,
      progressPath: path.relative(runRoot, prepackRecoveryProgressPath).split(path.sep).join("/"),
      receipt: prepackRecoveryReceiptFile.value,
      receiptSha256: prepackRecoveryReceiptFile.digest,
      receiptPath: path.relative(runRoot, prepackRecoveryReceiptPath).split(path.sep).join("/"),
    },
    gnocchi: {
      address: gnocchiAddress,
      allocationTokenId: gnocchiRoles.allocationTokenId,
      limitedAllocationTokenId: gnocchiRoles.limitedAllocationTokenId,
      tokenMetadataUris: gnocchiMetadataUris,
      creatorBalances,
      manifestSha256: gnocchiManifestFile.digest,
      receiptSha256: gnocchiReceiptFile.digest,
      manifestPath: path.relative(runRoot, gnocchiManifestPath).split(path.sep).join("/"),
      receiptPath: path.relative(runRoot, gnocchiReceiptPath).split(path.sep).join("/"),
      limitedEdition: {
        receipt: gnocchiLe.receipt,
        receiptSha256: gnocchiLe.receiptSha256,
        receiptPath: path.relative(runRoot, gnocchiLe.receiptPath).split(path.sep).join("/"),
      },
    },
    rotini: {
      address: rotiniAddress,
      projectId: operativeRotini.projectId,
      nextTokenId: operativeRotini.nextTokenId,
      generatedTokenIds: operativeRotini.generatedTokenIds,
      manifestSha256: rotiniManifestFile.digest,
      receiptSha256: rotiniReceiptFile.digest,
      manifestPath: path.relative(runRoot, rotiniManifestPath).split(path.sep).join("/"),
      receiptPath: path.relative(runRoot, rotiniReceiptPath).split(path.sep).join("/"),
    },
    tzkt: {
      validatedAt: new Date().toISOString(),
      gnocchi: {
        origination: gnocchiOrigination,
        fa2: gnocchiFa2,
        storage: gnocchiStorageValue,
        ledger: gnocchiLedger,
        sales: gnocchiSales,
        tokenMetadata: gnocchiMetadata,
        totalSupply: gnocchiSupply,
        totalReserved: gnocchiReserved,
        policyLocked: gnocchiPolicyLocked,
      },
      rotini: {
        origination: rotiniOrigination,
        fa2: rotiniFa2,
        storage: rotiniStorageValue,
        projects: rotiniProjects,
      },
    },
  };
}

async function assertFreshDependencyScript(input: {
  tezos: TezosToolkit;
  request: FreshDependencyReadRequest;
  artifactPath: string;
  label: string;
}): Promise<string> {
  const artifactBytes = await readFile(input.artifactPath);
  assert.equal(sha256(artifactBytes), input.request.expectedScriptSha256, `${input.label} compiled artifact bytes changed after evidence load`);
  const artifactCode = JSON.parse(artifactBytes.toString("utf8"));
  assert.ok(Array.isArray(artifactCode) && artifactCode.length > 0, `${input.label} compiled artifact is malformed`);
  const artifactCodeSha256 = hashMichelsonScriptCode(artifactCode);
  assert.equal(
    artifactCodeSha256,
    input.request.expectedScriptCodeSha256,
    `${input.label} compiled Michelson code changed after evidence load`,
  );
  const script = await input.tezos.rpc.getScript(input.request.contractAddress);
  const onChainCodeSha256 = assertMichelsonScriptCodeIdentity(
    script.code,
    artifactCode,
    `${input.label} on-chain script differs from the current compiled contract`,
  );
  assert.equal(
    onChainCodeSha256,
    input.request.expectedScriptCodeSha256,
    `${input.label} on-chain Michelson code identity differs from the fresh proof receipt`,
  );
  return artifactCodeSha256;
}

async function readFreshGnocchiDependency(input: {
  tezos: TezosToolkit;
  request: FreshDependencyReadRequest;
  evidence: FreshRavioliDependencies;
  recoveryRouterAddress?: string;
  includeRecoveryRouterTokenOne?: boolean;
}): Promise<{ snapshot: FreshGnocchiLiveSnapshot; rows: JsonObject }> {
  const scriptCodeSha256 = await assertFreshDependencyScript({
    tezos: input.tezos,
    request: input.request,
    artifactPath: input.evidence.gnocchi.scriptArtifactPath,
    label: "fresh Gnocchi dependency",
  });
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const storage = await pollJson(
    "fresh Gnocchi dependency storage",
    `${base}/contracts/${input.request.contractAddress}/storage`,
    (value) => Number(value?.next_token_id) === 3 && Number(value?.sales) > 0 && Number(value?.token_metadata) > 0,
  );
  const [ledger, operators, minters, reservedMints, sales, tokenMetadata, totalMinted, totalReserved, policyLocked] = await Promise.all([
    readBigMap(storage.ledger, "fresh Gnocchi ledger"),
    readBigMap(storage.operators, "fresh Gnocchi active operators"),
    readBigMap(storage.minters, "fresh Gnocchi authorized minters"),
    readBigMap(storage.reserved_mints, "fresh Gnocchi reserved mints"),
    readBigMap(storage.sales, "fresh Gnocchi sales"),
    readBigMap(storage.token_metadata, "fresh Gnocchi token metadata"),
    readBigMap(storage.total_minted, "fresh Gnocchi total minted"),
    readBigMap(storage.total_reserved, "fresh Gnocchi total reserved"),
    readBigMap(storage.policy_locked, "fresh Gnocchi policy locks"),
  ]);
  const sale = sales.find((entry) => Number(entry.key) === 2)?.value;
  assert.ok(sale, "fresh Gnocchi token 2 sale is missing");
  const metadataUris = Object.fromEntries([0, 1, 2].map((tokenId) => {
    const tokenInfo = tokenMetadata.find((entry) => Number(entry.key) === tokenId)?.value?.token_info;
    return [String(tokenId), hexToUtf8(String(tokenInfo?.[""] || ""))];
  })) as Record<"0" | "1" | "2", string>;
  const snapshot: FreshGnocchiLiveSnapshot = {
    chainId: await input.tezos.rpc.getChainId(),
    contractAddress: input.request.contractAddress,
    scriptSha256: input.request.expectedScriptSha256,
    scriptCodeSha256,
    administrator: String(storage.administrator || ""),
    nextTokenId: Number(storage.next_token_id),
    tokenMetadataUris: metadataUris,
    creatorEscrowBalances: {
      "0": findBalance(ledger, input.evidence.creator, 0),
      "1": findBalance(ledger, input.evidence.creator, 1),
    },
    ...(input.recoveryRouterAddress
      ? {
          recoveryRouterEscrowBalances: {
            "0": findBalance(ledger, input.recoveryRouterAddress, 0),
            ...(input.includeRecoveryRouterTokenOne
              ? { "1": findBalance(ledger, input.recoveryRouterAddress, 1) }
              : {}),
          },
        }
      : {}),
    token2: {
      active: sale.active === true,
      start: String(sale.start || ""),
      end: String(sale.end || ""),
      maxSupply: sale.max_supply == null ? null : Number(sale.max_supply),
      policyLocked: policyLocked.find((entry) => Number(entry.key) === 2)?.value === true,
      totalMinted: findNat(totalMinted, 2),
      totalReserved: findNat(totalReserved, 2),
    },
    activeOperators: operators,
    authorizedMinters: minters,
    reservedMints,
  };
  return {
    snapshot,
    rows: { storage, ledger, operators, minters, reservedMints, sales, tokenMetadata, totalMinted, totalReserved, policyLocked },
  };
}

async function readFreshRotiniDependency(input: {
  tezos: TezosToolkit;
  request: FreshDependencyReadRequest;
  evidence: FreshRavioliDependencies;
}): Promise<{ snapshot: FreshRotiniLiveSnapshot; rows: JsonObject }> {
  const scriptCodeSha256 = await assertFreshDependencyScript({
    tezos: input.tezos,
    request: input.request,
    artifactPath: input.evidence.rotini.scriptArtifactPath,
    label: "fresh Rotini dependency",
  });
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const storage = await pollJson(
    "fresh Rotini dependency storage",
    `${base}/contracts/${input.request.contractAddress}/storage`,
    (value) => Number(value?.next_project_id) === 3 && Number(value?.next_token_id) === 3 && Number(value?.projects) > 0,
  );
  const [operators, packMinters, reservations, packReserved, projects] = await Promise.all([
    readBigMap(storage.operators, "fresh Rotini active operators"),
    readBigMap(storage.pack_minters, "fresh Rotini authorized pack minters"),
    readBigMap(storage.reservations, "fresh Rotini open reservations"),
    readBigMap(storage.pack_reserved, "fresh Rotini pack reservations"),
    readBigMap(storage.projects, "fresh Rotini projects"),
  ]);
  const project = projects.find((entry) => Number(entry.key) === 0)?.value;
  assert.ok(project, "fresh Rotini project 0 is missing");
  const snapshot: FreshRotiniLiveSnapshot = {
    chainId: await input.tezos.rpc.getChainId(),
    contractAddress: input.request.contractAddress,
    scriptSha256: input.request.expectedScriptSha256,
    scriptCodeSha256,
    administrator: String(storage.administrator || ""),
    nextProjectId: Number(storage.next_project_id),
    nextTokenId: Number(storage.next_token_id),
    project0: {
      active: project.active === true,
      outputMode: hexToUtf8(String(project.output_mode || "")),
      priceMutez: Number(project.price),
      maxSupply: optionalSafeInteger(project.max_supply, "fresh Rotini project 0 max supply"),
      minted: Number(project.minted),
      reserved: Number(project.reserved),
    },
    activeOperators: operators,
    authorizedPackMinters: packMinters,
    openReservations: reservations,
    packReservations: packReserved,
  };
  return { snapshot, rows: { storage, operators, packMinters, reservations, packReserved, projects } };
}

export async function validateRavioliDependencies(
  runRoot: string,
  runId: string,
  creatorAddress: string,
  tezos: TezosToolkit,
  options: {
    mode0Replay?: RavioliMode0ReplayRecovery;
    currentV2Resume?: RavioliMode0ReplayRecovery;
    currentV3Restart?: RavioliCurrentV3RestartRecovery;
    currentV5Resume?: RavioliCurrentV5ResumeRecovery;
    currentV6Resume?: RavioliCurrentV6ResumeRecovery;
  } = {},
): Promise<DependencyEvidence> {
  const fresh = await loadFreshRavioliDependencies({ runRoot, expectedRunId: runId, expectedCreator: creatorAddress });
  let gnocchiRows: JsonObject | null = null;
  let rotiniRows: JsonObject | null = null;
  const readers = {
    readGnocchi: async (request) => {
      const result = await readFreshGnocchiDependency({
        tezos,
        request,
        evidence: fresh,
        recoveryRouterAddress:
          options.currentV6Resume?.routerAddress
          || options.currentV5Resume?.routerAddress
          || options.currentV3Restart?.routerAddress
          || options.currentV2Resume?.routerAddress,
        includeRecoveryRouterTokenOne: Boolean(
          options.currentV6Resume || options.currentV5Resume || options.currentV3Restart,
        ),
      });
      gnocchiRows = result.rows;
      return result.snapshot;
    },
    readRotini: async (request) => {
      const result = await readFreshRotiniDependency({ tezos, request, evidence: fresh });
      rotiniRows = result.rows;
      return result.snapshot;
    },
  };
  const liveCheck = options.currentV6Resume
    ? await recheckRavioliDependenciesForCurrentV6Resume(fresh, readers, options.currentV6Resume)
    : options.currentV5Resume
    ? await recheckRavioliDependenciesForCurrentV5Resume(fresh, readers, options.currentV5Resume)
    : options.currentV3Restart
    ? await recheckRavioliDependenciesForCurrentV3Restart(fresh, readers, options.currentV3Restart)
    : options.currentV2Resume
    ? await recheckRavioliDependenciesForCurrentV2Resume(fresh, readers, options.currentV2Resume)
    : options.mode0Replay
    ? await recheckRavioliDependenciesForMode0Replay(fresh, readers, options.mode0Replay)
    : await recheckFreshRavioliDependencies(fresh, readers);
  assert.ok(gnocchiRows && rotiniRows, "fresh Ravioli dependency readers did not retain their validated baseline rows");
  const token2 = fresh.gnocchi.tokens[2];
  const limitedPolicy = fresh.gnocchi.token2LimitedEdition;
  const childEndMs = Date.parse(limitedPolicy.end);
  assert.ok(Number.isFinite(childEndMs) && childEndMs > Date.now() + 60 * 60 * 1_000, "fresh Gnocchi LE window is too short for a bounded Ravioli proof");
  const wrapperSaleEnd = limitedPolicy.recommendedRavioliSaleEnd;
  assert.ok(
    Date.parse(wrapperSaleEnd) > Date.now() && Date.parse(wrapperSaleEnd) < childEndMs,
    "fresh Gnocchi recommended Ravioli sale window is not safely bounded by its LE child",
  );
  const relative = (absolutePath: string) => path.relative(runRoot, absolutePath).split(path.sep).join("/");
  const limitedReceipt: JsonObject = {
    schema: "pastaprotocol-ravioli-fresh-gnocchi-le@1",
    contract: {
      address: fresh.gnocchi.contractAddress,
      explorerUrl: `https://shadownet.tzkt.io/${fresh.gnocchi.contractAddress}`,
      scriptSha256: fresh.gnocchi.scriptSha256,
    },
    operation: {
      hash: fresh.gnocchi.originationOperationHash,
      explorerUrl: `https://shadownet.tzkt.io/${fresh.gnocchi.originationOperationHash}`,
    },
    token: {
      tokenId: 2,
      active: true,
      policyLocked: true,
      maxSupply: 4,
      start: limitedPolicy.start,
      end: limitedPolicy.end,
      recommendedRavioliSaleEnd: wrapperSaleEnd,
      metadataUri: token2.metadataUri,
      artifactUri: token2.artifactUri,
      explorerUrl: `https://shadownet.tzkt.io/${fresh.gnocchi.contractAddress}/tokens/2`,
      baselineMinted: limitedPolicy.totalMinted,
      baselineReserved: limitedPolicy.totalReserved,
    },
  };
  return {
    runId,
    fresh,
    liveCheck,
    gnocchi: {
      address: fresh.gnocchi.contractAddress,
      allocationTokenId: 1,
      limitedAllocationTokenId: 2,
      tokenMetadataUris: fresh.gnocchi.tokens.map((token) => token.metadataUri) as [string, string, string],
      creatorBalances: { ...liveCheck.gnocchi.creatorEscrowBalances },
      manifestSha256: fresh.gnocchi.manifestSha256,
      receiptSha256: fresh.gnocchi.receiptSha256,
      manifestPath: relative(fresh.gnocchi.manifestPath),
      receiptPath: relative(fresh.gnocchi.receiptPath),
      limitedEdition: { receipt: limitedReceipt, receiptPath: relative(fresh.gnocchi.receiptPath), receiptSha256: fresh.gnocchi.receiptSha256 },
    },
    rotini: {
      address: fresh.rotini.contractAddress,
      projectId: 0,
      nextTokenId: 3,
      generatedTokenIds: [3, 4, 5],
      manifestSha256: fresh.rotini.manifestSha256,
      receiptSha256: fresh.rotini.receiptSha256,
      manifestPath: relative(fresh.rotini.manifestPath),
      receiptPath: relative(fresh.rotini.receiptPath),
    },
    tzkt: {
      validatedAt: liveCheck.checkedAt,
      gnocchi: gnocchiRows,
      rotini: rotiniRows,
      freshEvidence: {
        schema: fresh.schema,
        gnocchiManifestSha256: fresh.gnocchi.manifestSha256,
        gnocchiReceiptSha256: fresh.gnocchi.receiptSha256,
        rotiniManifestSha256: fresh.rotini.manifestSha256,
        rotiniReceiptSha256: fresh.rotini.receiptSha256,
      },
    },
  };
}

export function assertRavioliUiLiveExecutionAllowed(environment: Record<string, string | undefined>): void {
  if (environment[MODE0_MUTATION_RESUME_FLAG] !== undefined) {
    block("LEGACY_RECOVERY_RETIRED", [
      "The July-22 mode-0 mutation boundary is quarantined evidence and cannot be executed.",
      "Use the newest distinctly named authenticated boundary recovery lane.",
    ]);
  }
  if (environment[CURRENT_V2_RESUME_FLAG] !== undefined) {
    block("CURRENT_V2_RECOVERY_RETIRED", [
      "The 31-event current-v2 lane crossed its mutation boundary and is immutable evidence only.",
      "Use the newest distinctly named authenticated boundary recovery lane; current-v2 may never be replayed.",
    ]);
  }
  if (environment[CURRENT_V3_RESTART_FLAG] !== undefined) {
    block("CURRENT_V3_RECOVERY_RETIRED", [
      "The 37-event current-v3 lane crossed its fresh-pin boundary and is immutable evidence only.",
      "Current-v3 may never be replayed; use a new proof-run root for any future live product.",
    ]);
  }
  if (environment[CURRENT_V3_PREFLIGHT_ONLY_FLAG] !== undefined) {
    block("CURRENT_V3_RECOVERY_RETIRED", [
      "The current-v3 preflight belongs to the immutable 37-event lane and is retired with it.",
      "Use a new proof-run root for any future live product.",
    ]);
  }
  if (
    environment[CURRENT_V4_RESUME_FLAG] !== undefined
    || environment[CURRENT_V4_PREFLIGHT_ONLY_FLAG] !== undefined
  ) {
    block("CURRENT_V4_RECOVERY_RETIRED", [
      "The current-v4 lane crossed its fresh-pin and operation-10 boundaries, then its immutable sale expired after operation 15.",
      "Its 61-event/15-pin/15-operation boundary is partial audit evidence only and may never be replayed.",
      "Use a new proof-run root and the ordinary fresh Ravioli UI-live command after the buyer-readiness fix passes every gate.",
    ]);
  }
  if (environment[CURRENT_V6_RESUME_FLAG] !== undefined) {
    block("CURRENT_V6_RECOVERY_RETIRED", [
      "The current-v6 lane durably recorded its independent signer counter advance as event 86, then stopped before semantic operation 24.",
      "Event 86 is immutable evidence only. Use only the exact current-v7 event-86 continuation.",
    ]);
  }
  if (environment[EXECUTE_FLAG] !== "1") {
    block("explicit Ravioli UI-live execute flag is required", [
      `\`${EXECUTE_FLAG}=1\` is required because this lane pins durable artifacts and signs real Shadownet wrapper operations.`,
    ]);
  }
  if ((environment.TEZOS_NETWORK || "shadownet").toLowerCase() !== "shadownet") {
    block("Ravioli UI-live runner only permits Shadownet", ["Set TEZOS_NETWORK=shadownet."]);
  }
  if (!environment[OUTPUT_ENV]?.trim()) {
    block("an explicit Pasta proof run directory is required", [`Set \`${OUTPUT_ENV}\` to the aggregate proof-run root.`]);
  }
  if (environment[PREWRITE_RESUME_FLAG] !== undefined && environment[PREWRITE_RESUME_FLAG] !== "1") {
    block("Ravioli pre-write resume flag is invalid", [`Set \`${PREWRITE_RESUME_FLAG}=1\` or remove it.`]);
  }
  if (environment[CONTROLLER_RESUME_FLAG] !== undefined && environment[CONTROLLER_RESUME_FLAG] !== "1") {
    block("Ravioli controller-resume flag is invalid", [`Set \`${CONTROLLER_RESUME_FLAG}=1\` or remove it.`]);
  }
  if (environment[CURRENT_V5_RESUME_FLAG] !== undefined && environment[CURRENT_V5_RESUME_FLAG] !== "1") {
    block("Ravioli current-v5 resume flag is invalid", [
      `Set \`${CURRENT_V5_RESUME_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_V7_RESUME_FLAG] !== undefined && environment[CURRENT_V7_RESUME_FLAG] !== "1") {
    block("Ravioli current-v7 resume flag is invalid", [
      `Set \`${CURRENT_V7_RESUME_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_RESUME_FLAG] !== undefined && environment[CURRENT_RESUME_FLAG] !== "1") {
    block("Ravioli current resume flag is invalid", [
      `Set \`${CURRENT_RESUME_FLAG}=1\` or remove it.`,
    ]);
  }
  if (
    environment[CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG] !== undefined
    && environment[CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG] !== "1"
  ) {
    block("Ravioli current-v8 plan-extension activation flag is invalid", [
      `Set \`${CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_V3_RESTART_FLAG] !== undefined && environment[CURRENT_V3_RESTART_FLAG] !== "1") {
    block("Ravioli current-v3 restart flag is invalid", [`Set \`${CURRENT_V3_RESTART_FLAG}=1\` or remove it.`]);
  }
  if (environment[CURRENT_V3_PREFLIGHT_ONLY_FLAG] !== undefined && environment[CURRENT_V3_PREFLIGHT_ONLY_FLAG] !== "1") {
    block("Ravioli current-v3 preflight-only flag is invalid", [
      `Set \`${CURRENT_V3_PREFLIGHT_ONLY_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_V3_PREFLIGHT_ONLY_FLAG] === "1" && environment[CURRENT_V3_RESTART_FLAG] !== "1") {
    block("Ravioli current-v3 preflight requires the authenticated restart lane", [
      `Set both \`${CURRENT_V3_RESTART_FLAG}=1\` and \`${CURRENT_V3_PREFLIGHT_ONLY_FLAG}=1\`.`,
    ]);
  }
  if (environment[CURRENT_V3_RESTART_FLAG] === "1" && !environment[PRIVATE_RECOVERY_OUTPUT_ENV]?.trim()) {
    block("Ravioli current-v3 restart requires private recovery storage", [
      `Set \`${PRIVATE_RECOVERY_OUTPUT_ENV}\` to an existing mode-0700 directory outside the public proof run root.`,
    ]);
  }
  if (environment[CURRENT_V3_RESTART_FLAG] === "1") {
    const publicRoot = path.resolve(environment[OUTPUT_ENV] || "");
    const privateRoot = environment[PRIVATE_RECOVERY_OUTPUT_ENV]!.trim();
    if (!path.isAbsolute(privateRoot) || path.normalize(privateRoot) !== privateRoot) {
      block("Ravioli private recovery path is invalid", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be an absolute normalized path.`,
      ]);
    }
    const pathsOverlap = (parent: string, candidate: string) => {
      const relative = path.relative(parent, candidate);
      return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    };
    if (pathsOverlap(publicRoot, privateRoot) || pathsOverlap(privateRoot, publicRoot)) {
      block("Ravioli private recovery path overlaps the public proof root", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be disjoint from \`${OUTPUT_ENV}\`.`,
      ]);
    }
  }
  if (environment[CURRENT_V4_RESUME_FLAG] !== undefined && environment[CURRENT_V4_RESUME_FLAG] !== "1") {
    block("Ravioli current-v4 resume flag is invalid", [
      `Set \`${CURRENT_V4_RESUME_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_V4_PREFLIGHT_ONLY_FLAG] !== undefined && environment[CURRENT_V4_PREFLIGHT_ONLY_FLAG] !== "1") {
    block("Ravioli current-v4 preflight-only flag is invalid", [
      `Set \`${CURRENT_V4_PREFLIGHT_ONLY_FLAG}=1\` or remove it.`,
    ]);
  }
  if (environment[CURRENT_V4_PREFLIGHT_ONLY_FLAG] === "1" && environment[CURRENT_V4_RESUME_FLAG] !== "1") {
    block("Ravioli current-v4 preflight requires the authenticated resume lane", [
      `Set both \`${CURRENT_V4_RESUME_FLAG}=1\` and \`${CURRENT_V4_PREFLIGHT_ONLY_FLAG}=1\`.`,
    ]);
  }
  if (environment[CURRENT_V4_RESUME_FLAG] === "1" && !environment[PRIVATE_RECOVERY_OUTPUT_ENV]?.trim()) {
    block("Ravioli current-v4 resume requires private recovery storage", [
      `Set \`${PRIVATE_RECOVERY_OUTPUT_ENV}\` to an existing mode-0700 directory outside the public proof run root.`,
    ]);
  }
  if (environment[CURRENT_V4_RESUME_FLAG] === "1") {
    const publicRoot = path.resolve(environment[OUTPUT_ENV] || "");
    const privateRoot = environment[PRIVATE_RECOVERY_OUTPUT_ENV]!.trim();
    if (!path.isAbsolute(privateRoot) || path.normalize(privateRoot) !== privateRoot) {
      block("Ravioli private recovery path is invalid", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be an absolute normalized path.`,
      ]);
    }
    const pathsOverlap = (parent: string, candidate: string) => {
      const relative = path.relative(parent, candidate);
      return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    };
    if (pathsOverlap(publicRoot, privateRoot) || pathsOverlap(privateRoot, publicRoot)) {
      block("Ravioli private recovery path overlaps the public proof root", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be disjoint from \`${OUTPUT_ENV}\`.`,
      ]);
    }
  }
  if (environment[PACKAGE_RESUME_FLAG] !== undefined && environment[PACKAGE_RESUME_FLAG] !== "1") {
    block("Ravioli package-resume flag is invalid", [`Set \`${PACKAGE_RESUME_FLAG}=1\` or remove it.`]);
  }
  if (environment[PACKAGE_RESUME_FLAG] !== "1" && !environment[PRIVATE_RECOVERY_OUTPUT_ENV]?.trim()) {
    block("Ravioli live execution requires private recovery storage", [
      `Set \`${PRIVATE_RECOVERY_OUTPUT_ENV}\` to an existing mode-0700 directory outside the public proof run root.`,
      "Fresh blind-product preimages are copied there before their first signer boundary and whenever a browser failure is handled.",
    ]);
  }
  if (environment[PACKAGE_RESUME_FLAG] !== "1") {
    const publicRoot = path.resolve(environment[OUTPUT_ENV] || "");
    const privateRoot = environment[PRIVATE_RECOVERY_OUTPUT_ENV]!.trim();
    if (!path.isAbsolute(privateRoot) || path.normalize(privateRoot) !== privateRoot) {
      block("Ravioli private recovery path is invalid", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be an absolute normalized path.`,
      ]);
    }
    const pathsOverlap = (parent: string, candidate: string) => {
      const relative = path.relative(parent, candidate);
      return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    };
    if (pathsOverlap(publicRoot, privateRoot) || pathsOverlap(privateRoot, publicRoot)) {
      block("Ravioli private recovery path overlaps the public proof root", [
        `\`${PRIVATE_RECOVERY_OUTPUT_ENV}\` must be disjoint from \`${OUTPUT_ENV}\`.`,
      ]);
    }
  }
  const selectedResumeModes = [
    environment[PREWRITE_RESUME_FLAG],
    environment[CONTROLLER_RESUME_FLAG],
    environment[CURRENT_V3_RESTART_FLAG],
    environment[CURRENT_V4_RESUME_FLAG],
    environment[CURRENT_V5_RESUME_FLAG],
    environment[CURRENT_V7_RESUME_FLAG],
    environment[CURRENT_RESUME_FLAG],
    environment[PACKAGE_RESUME_FLAG],
  ].filter((value) => value === "1").length;
  if (selectedResumeModes > 1) {
    block("Ravioli resume modes are mutually exclusive", ["Select exactly one recovery boundary."]);
  }
  if (
    environment[CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG] === "1"
    && environment[CURRENT_V7_RESUME_FLAG] !== "1"
  ) {
    block("Ravioli current-v8 activation requires the authenticated event-86 lane", [
      `Set both \`${CURRENT_V7_RESUME_FLAG}=1\` and \`${CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG}=1\`.`,
    ]);
  }
  if (
    environment[CURRENT_V7_RESUME_FLAG] === "1"
    && environment[CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG] !== "1"
  ) {
    block("Ravioli current-v7 continuation requires explicit corrected-plan activation", [
      `Set \`${CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG}=1\` only after the offline event-87 regressions pass.`,
      "Without that distinct approval, the immutable 66-operation event-86 plan remains read-only.",
    ]);
  }
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_ROTINI_ADAPTER_ADDRESS",
    "PASTA_SHADOWNET_RAVIOLI_SKIP_SETUP",
    "PASTA_SHADOWNET_RAVIOLI_RECIPE_START",
  ]) {
    if (environment[forbidden]?.trim()) block("Ravioli UI-live proof rejects legacy mutation resume", [`Remove \`${forbidden}\`; address injection and recipe-index skipping are refused.`]);
  }
}

async function requireRavioliDirectory(runRoot: string, resumeExisting: boolean): Promise<string> {
  const appRoot = path.join(path.resolve(runRoot), "ravioli");
  try {
    const info = await lstat(appRoot);
    if (resumeExisting) {
      if (!info.isDirectory() || info.isSymbolicLink()) {
        block("Ravioli pre-write resume lane is not a real directory", [`Refusing to follow or reuse \`${appRoot}\`.`]);
      }
      return appRoot;
    }
    block("Ravioli proof output directory already exists", [`Refusing to overwrite \`${appRoot}\`; use a fresh aggregate run root.`]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (resumeExisting) {
    block("Ravioli resume lane is missing", [`Expected the existing immutable lane at \`${appRoot}\`.`]);
  }
  return appRoot;
}

async function syncRavioliUiLiveDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableRavioliExclusiveWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncRavioliUiLiveDirectory(path.dirname(filePath));
}

function exactRavioliCheckpointBase64(value: unknown, label: string): Uint8Array {
  assert.equal(typeof value, "string", `${label} must be base64 text`);
  const bytes = Buffer.from(value, "base64");
  assert.equal(bytes.toString("base64"), value, `${label} is not canonical base64`);
  return Uint8Array.from(bytes);
}

function portableRavioliRunPath(runRoot: string, value: string, label: string): string {
  if (!path.isAbsolute(value)) return safeRelativePath(value, label);
  const relativePath = path.relative(path.resolve(runRoot), path.resolve(value)).split(path.sep).join("/");
  return safeRelativePath(relativePath, label);
}

export function assertPortableRavioliCheckpointValue(
  value: unknown,
  forbiddenRoots: readonly string[],
  currentPath = "payload",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableRavioliCheckpointValue(entry, forbiddenRoots, `${currentPath}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as JsonObject)) {
      assert.doesNotMatch(
        key,
        /session.?token|private.?key|secret|mnemonic|keyring|socket.?path|audit.?log/i,
        `Ravioli package checkpoint contains prohibited private field ${currentPath}.${key}`,
      );
      assertPortableRavioliCheckpointValue(entry, forbiddenRoots, `${currentPath}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  assert.ok(!value.includes("/Users/"), `Ravioli package checkpoint leaks a local user path at ${currentPath}`);
  for (const rootPath of forbiddenRoots) {
    assert.ok(!value.includes(path.resolve(rootPath)), `Ravioli package checkpoint leaks its local proof path at ${currentPath}`);
  }
}

function ravioliProofPackageCheckpointPayload(input: {
  runRoot: string;
  appRoot: string;
  checkpointInput: RavioliProofPackageCheckpointInput;
}): JsonObject {
  const dependencies = structuredClone(input.checkpointInput.dependencies) as DependencyEvidence;
  dependencies.fresh.runRoot = ".";
  dependencies.fresh.gnocchi.manifestPath = portableRavioliRunPath(
    input.runRoot,
    dependencies.fresh.gnocchi.manifestPath,
    "Ravioli checkpoint Gnocchi manifest path",
  );
  dependencies.fresh.gnocchi.receiptPath = portableRavioliRunPath(
    input.runRoot,
    dependencies.fresh.gnocchi.receiptPath,
    "Ravioli checkpoint Gnocchi receipt path",
  );
  dependencies.fresh.rotini.manifestPath = portableRavioliRunPath(
    input.runRoot,
    dependencies.fresh.rotini.manifestPath,
    "Ravioli checkpoint Rotini manifest path",
  );
  dependencies.fresh.rotini.receiptPath = portableRavioliRunPath(
    input.runRoot,
    dependencies.fresh.rotini.receiptPath,
    "Ravioli checkpoint Rotini receipt path",
  );
  const mutationRecoveryEvidence = input.checkpointInput.mutationRecoveryEvidence
    ? {
        ...input.checkpointInput.mutationRecoveryEvidence,
        sourcePath: portableRavioliRunPath(
          input.appRoot,
          input.checkpointInput.mutationRecoveryEvidence.sourceRoot,
          "Ravioli checkpoint mutation recovery path",
        ),
        sourceRoot: undefined,
      }
    : null;
  const payload = {
    runId: input.checkpointInput.runId,
    rpcUrl: input.checkpointInput.rpcUrl,
    startedAt: input.checkpointInput.startedAt,
    completedAt: input.checkpointInput.completedAt,
    dependencies,
    actors: input.checkpointInput.actors,
    funding: input.checkpointInput.funding,
    mirror: {
      routerAddress: input.checkpointInput.mirror.routerAddress,
      gnocchiAdapterAddress: input.checkpointInput.mirror.gnocchiAdapterAddress,
      rotiniAdapterAddress: input.checkpointInput.mirror.rotiniAdapterAddress,
    },
    kits: input.checkpointInput.kits,
    withheldRefundKit: input.checkpointInput.withheldRefundKit,
    publicRevealUris: input.checkpointInput.publicRevealUris,
    openKitCaptures: input.checkpointInput.openKitCaptures.map(({ bytes, ...capture }) => ({
      ...capture,
      bytesBase64: Buffer.from(bytes).toString("base64"),
    })),
    pins: input.checkpointInput.pins.map((pin) => {
      const { localGatewayUrl: _localGatewayUrl, ...portableProof } = pin.proof;
      return {
        ...(Object.prototype.hasOwnProperty.call(pin, "value") ? { value: pin.value } : {}),
        ...(pin.bytes ? { bytesBase64: Buffer.from(pin.bytes).toString("base64") } : {}),
        proof: portableProof,
      };
    }),
    screenshots: input.checkpointInput.screenshots.map((capture) => ({
      pngRelativePath: capture.pngRelativePath,
      sidecarRelativePath: capture.sidecarRelativePath,
      filenameStem: capture.filenameStem,
      sidecar: capture.sidecar,
      manifestScreenshot: capture.manifestScreenshot,
      manifestSidecarArtifact: capture.manifestSidecarArtifact,
    })),
    receipts: input.checkpointInput.receipts,
    writeReceipts: input.checkpointInput.writeReceipts,
    operationHashes: input.checkpointInput.operationHashes,
    indexedInputs: input.checkpointInput.indexedInputs,
    negativeAssertions: input.checkpointInput.negativeAssertions,
    capacityChecks: input.checkpointInput.capacityChecks,
    memorySamples: input.checkpointInput.memorySamples,
    mode1PreOp10Proof: input.checkpointInput.mode1PreOp10Proof || null,
    currentV3RestartEvidence: input.checkpointInput.currentV3RestartEvidence || null,
    mutationRecoveryEvidence,
  };
  assertPortableRavioliCheckpointValue(payload, [input.runRoot, input.appRoot]);
  return payload;
}

function ravioliProofPackageInputFromCheckpoint(input: {
  payloadValue: unknown;
  runRoot: string;
  appRoot: string;
  ipfs: IpfsProofConfig;
}): RavioliProofPackageCheckpointInput {
  const payloadValue = input.payloadValue;
  const payload = ravioliCheckpointRecord(payloadValue, "Ravioli package checkpoint payload");
  assertPortableRavioliCheckpointValue(payload, [input.runRoot, input.appRoot]);
  assert.ok(String(payload.runId || "").length > 0, "Ravioli package checkpoint run id is missing");
  assert.match(String(payload.startedAt || ""), /^\d{4}-\d{2}-\d{2}T/, "Ravioli package checkpoint start time is invalid");
  assert.match(String(payload.completedAt || ""), /^\d{4}-\d{2}-\d{2}T/, "Ravioli package checkpoint completion time is invalid");
  assert.ok(Number.isFinite(Date.parse(payload.startedAt)), "Ravioli package checkpoint start time is invalid");
  assert.ok(Number.isFinite(Date.parse(payload.completedAt)), "Ravioli package checkpoint completion time is invalid");
  assert.ok(Array.isArray(payload.kits) && payload.kits.length === 5, "Ravioli package checkpoint kit inventory drift");
  ravioliCheckpointRecord(payload.withheldRefundKit, "Ravioli package checkpoint withheld-refund kit");
  assert.ok(Array.isArray(payload.publicRevealUris) && payload.publicRevealUris.length === 6, "Ravioli package checkpoint reveal inventory drift");
  assert.ok(Array.isArray(payload.openKitCaptures) && payload.openKitCaptures.length === 5, "Ravioli package checkpoint capture inventory drift");
  assert.ok(
    Array.isArray(payload.pins) && payload.pins.length === 34,
    "Ravioli package checkpoint requires the exact 34-call pin inventory",
  );
  assert.ok(Array.isArray(payload.screenshots) && payload.screenshots.length > 0, "Ravioli package checkpoint screenshot inventory is empty");
  assert.ok(
    Array.isArray(payload.writeReceipts) && payload.writeReceipts.length === RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli package checkpoint must contain the complete derived semantic write plan",
  );
  assert.ok(
    Array.isArray(payload.operationHashes) && payload.operationHashes.length === RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli package checkpoint operation hash inventory drift",
  );
  assert.deepEqual(
    payload.operationHashes,
    payload.writeReceipts.map((receipt: JsonObject) => receipt.operationHash),
    "Ravioli package checkpoint write/hash order drift",
  );
  const mirrorValue = ravioliCheckpointRecord(payload.mirror, "Ravioli package checkpoint mirror");
  const mirror = new RavioliUiStateMirror();
  mirror.bindOrigination("router", String(mirrorValue.routerAddress || ""));
  mirror.bindOrigination("gnocchiAdapter", String(mirrorValue.gnocchiAdapterAddress || ""));
  mirror.bindOrigination("rotiniAdapter", String(mirrorValue.rotiniAdapterAddress || ""));

  const openKitCaptures = payload.openKitCaptures.map((captureValue: unknown, tokenId: number) => {
    const capture = ravioliCheckpointRecord(captureValue, `Ravioli package checkpoint open kit ${tokenId}`);
    const bytes = exactRavioliCheckpointBase64(capture.bytesBase64, `Ravioli package checkpoint open kit ${tokenId} bytes`);
    assert.equal(Number(capture.tokenId), tokenId, `Ravioli package checkpoint open kit ${tokenId} order drift`);
    assert.equal(sha256(bytes), capture.sha256, `Ravioli package checkpoint open kit ${tokenId} digest drift`);
    const relativePath = safeRelativePath(capture.relativePath, `Ravioli package checkpoint open kit ${tokenId} path`);
    return {
      tokenId,
      mode: String(capture.mode || ""),
      fileName: String(capture.fileName || ""),
      relativePath,
      sha256: String(capture.sha256 || ""),
      bytes,
      kit: ravioliCheckpointRecord(capture.kit, `Ravioli package checkpoint open kit ${tokenId} value`) as PackKit,
    };
  });
  const pins = payload.pins.map((pinValue: unknown, index: number) => {
    const pin = ravioliCheckpointRecord(pinValue, `Ravioli package checkpoint pin ${index + 1}`);
    const portableProof = ravioliCheckpointRecord(pin.proof, `Ravioli package checkpoint pin ${index + 1} proof`);
    assert.equal(portableProof.localGatewayUrl, undefined, `Ravioli package checkpoint pin ${index + 1} leaked a local gateway`);
    const proof = {
      ...portableProof,
      localGatewayUrl: ipfsGatewayUrl(input.ipfs.localGatewayUrl, String(portableProof.cid || "")),
    } as PastaUiLivePinProof;
    assert.match(String(proof.cid || ""), /^b[a-z2-7]+$/i, `Ravioli package checkpoint pin ${index + 1} CID is invalid`);
    assert.match(String(proof.sha256 || ""), /^[0-9a-f]{64}$/, `Ravioli package checkpoint pin ${index + 1} digest is invalid`);
    assert.equal(proof.uri, `ipfs://${proof.cid}`, `Ravioli package checkpoint pin ${index + 1} URI/CID drift`);
    assert.equal(proof.publicGatewayVerified, true, `Ravioli package checkpoint pin ${index + 1} lacks public verification`);
    const hasValue = Object.prototype.hasOwnProperty.call(pin, "value");
    const hasBytes = Object.prototype.hasOwnProperty.call(pin, "bytesBase64");
    assert.notEqual(hasValue, hasBytes, `Ravioli package checkpoint pin ${index + 1} must contain exactly one byte source`);
    const bytes = hasBytes
      ? exactRavioliCheckpointBase64(pin.bytesBase64, `Ravioli package checkpoint pin ${index + 1} bytes`)
      : deterministicJsonBytes(pin.value);
    assert.equal(bytes.byteLength, proof.byteLength, `Ravioli package checkpoint pin ${index + 1} byte length drift`);
    assert.equal(sha256(bytes), proof.sha256, `Ravioli package checkpoint pin ${index + 1} digest drift`);
    return {
      ...(hasValue ? { value: pin.value } : {}),
      ...(hasBytes ? { bytes } : {}),
      proof,
    } satisfies PinRecord;
  });
  const dependencies = ravioliCheckpointRecord(payload.dependencies, "Ravioli package checkpoint dependencies") as DependencyEvidence;
  assert.equal(dependencies.fresh.runRoot, ".", "Ravioli package checkpoint dependency root is not portable");
  dependencies.fresh.runRoot = path.resolve(input.runRoot);
  dependencies.fresh.gnocchi.manifestPath = path.resolve(
    input.runRoot,
    ...safeRelativePath(dependencies.fresh.gnocchi.manifestPath, "Ravioli checkpoint Gnocchi manifest path").split("/"),
  );
  dependencies.fresh.gnocchi.receiptPath = path.resolve(
    input.runRoot,
    ...safeRelativePath(dependencies.fresh.gnocchi.receiptPath, "Ravioli checkpoint Gnocchi receipt path").split("/"),
  );
  dependencies.fresh.rotini.manifestPath = path.resolve(
    input.runRoot,
    ...safeRelativePath(dependencies.fresh.rotini.manifestPath, "Ravioli checkpoint Rotini manifest path").split("/"),
  );
  dependencies.fresh.rotini.receiptPath = path.resolve(
    input.runRoot,
    ...safeRelativePath(dependencies.fresh.rotini.receiptPath, "Ravioli checkpoint Rotini receipt path").split("/"),
  );
  const screenshots = payload.screenshots.map((captureValue: unknown) => {
    const capture = ravioliCheckpointRecord(captureValue, "Ravioli package checkpoint screenshot");
    const pngRelativePath = safeRelativePath(capture.pngRelativePath, "Ravioli checkpoint screenshot path");
    const sidecarRelativePath = safeRelativePath(capture.sidecarRelativePath, "Ravioli checkpoint screenshot sidecar path");
    return {
      appDirectory: path.resolve(input.appRoot),
      pngPath: path.resolve(input.appRoot, ...pngRelativePath.split("/")),
      sidecarPath: path.resolve(input.appRoot, ...sidecarRelativePath.split("/")),
      pngRelativePath,
      sidecarRelativePath,
      filenameStem: String(capture.filenameStem || ""),
      sidecar: ravioliCheckpointRecord(capture.sidecar, "Ravioli checkpoint screenshot sidecar") as CapturePastaProofStageResult["sidecar"],
      manifestScreenshot: ravioliCheckpointRecord(capture.manifestScreenshot, "Ravioli checkpoint manifest screenshot") as CapturePastaProofStageResult["manifestScreenshot"],
      manifestSidecarArtifact: ravioliCheckpointRecord(capture.manifestSidecarArtifact, "Ravioli checkpoint manifest sidecar") as CapturePastaProofStageResult["manifestSidecarArtifact"],
    };
  });
  const indexedInputs = ravioliCheckpointRecord(payload.indexedInputs, "Ravioli package checkpoint indexed inputs") as RavioliProofPackageIndexedInputs;
  assert.ok(Array.isArray(indexedInputs.wrapperPurchaseCheckpoints) && indexedInputs.wrapperPurchaseCheckpoints.length === 6);
  assert.ok(Array.isArray(indexedInputs.openDeliveryOutcomes) && indexedInputs.openDeliveryOutcomes.length === 6);
  ravioliCheckpointRecord(indexedInputs.withheldRefundOutcome, "Ravioli package checkpoint withheld-refund outcome");
  const mutationRecoveryPortable = payload.mutationRecoveryEvidence == null
    ? null
    : ravioliCheckpointRecord(payload.mutationRecoveryEvidence, "Ravioli package checkpoint mutation recovery");
  const mutationRecoveryEvidence = mutationRecoveryPortable
    ? {
        ...mutationRecoveryPortable,
        sourceRoot: path.resolve(
          input.appRoot,
          ...safeRelativePath(mutationRecoveryPortable.sourcePath, "Ravioli checkpoint mutation recovery path").split("/"),
        ),
        sourcePath: undefined,
      } as RavioliMode0MutationRecoveryEvidence
    : null;
  const mode1PreOp10Proof = payload.mode1PreOp10Proof == null
    ? null
    : ravioliCheckpointRecord(
        payload.mode1PreOp10Proof,
        "Ravioli package checkpoint mode-1 pre-op10 proof",
      ) as RavioliMode1PreOp10Proof;
  if (mode1PreOp10Proof) {
    assert.equal(mode1PreOp10Proof.schema, "pastaprotocol-ravioli-mode1-pre-op10-private-proof@1");
    assert.equal(mode1PreOp10Proof.network, "shadownet");
    assert.equal(mode1PreOp10Proof.tokenId, 1);
    assert.match(mode1PreOp10Proof.revealCommitment, /^[0-9a-f]{64}$/);
  }
  const currentV3RestartEvidence = payload.currentV3RestartEvidence == null
    ? null
    : ravioliCheckpointRecord(
        payload.currentV3RestartEvidence,
        "Ravioli package checkpoint authenticated resume evidence",
      );
  if (currentV3RestartEvidence) {
    const isCurrentV5 = currentV3RestartEvidence.classification ===
      "RAVIOLI-CURRENT-V5-AUTHENTICATED-CONTINUATION";
    const isCurrentV6 = currentV3RestartEvidence.classification ===
      "RAVIOLI-CURRENT-V6-AUTHENTICATED-COUNTER-ADVANCE-CONTINUATION";
    const isCurrentV7 = currentV3RestartEvidence.classification ===
      "RAVIOLI-CURRENT-V7-AUTHENTICATED-EVENT86-CONTINUATION";
    const isCurrent = currentV3RestartEvidence.classification ===
      "RAVIOLI-CURRENT-AUTHENTICATED-RESUME";
    assert.ok(
      isCurrent
      || currentV3RestartEvidence.classification === "RAVIOLI-CURRENT-V3-AUTHENTICATED-RESTART"
      || currentV3RestartEvidence.classification === "RAVIOLI-CURRENT-V4-AUTHENTICATED-RESUME"
      || isCurrentV5
      || isCurrentV6
      || isCurrentV7,
      "Ravioli package checkpoint authenticated resume classification is invalid",
    );
    if (isCurrent) {
      const boundary = ravioliCheckpointRecord(
        currentV3RestartEvidence.boundary,
        "Ravioli package checkpoint current boundary",
      );
      const operationCount = Number(boundary.operationCount);
      assert.ok(
        operationCount === 9 || operationCount === 23,
        "Ravioli package checkpoint current boundary operation count is unsupported",
      );
      const authenticatedStateBoundary = operationCount === 23;
      const expected = authenticatedStateBoundary
        ? { eventCount: 85, pinCount: 15, operationCount: 23, nextGlobalOperation: 24, replaySteps: 0 }
        : { eventCount: 38, pinCount: 10, operationCount: 9, nextGlobalOperation: 10, replaySteps: 19 };
      assert.equal(currentV3RestartEvidence.zeroSideEffectReplaySteps, expected.replaySteps);
      assert.equal(boundary.eventCount, expected.eventCount);
      assert.equal(boundary.pinCount, expected.pinCount);
      assert.equal(boundary.operationCount, expected.operationCount);
      assert.equal(boundary.nextGlobalOperation, expected.nextGlobalOperation);
      assert.equal((currentV3RestartEvidence.activePins as unknown[]).length, expected.pinCount);
      assert.equal((currentV3RestartEvidence.supersededPrivatePrecommitPins as unknown[]).length, 0);
      assert.equal((currentV3RestartEvidence.recoveredOperations as unknown[]).length, expected.operationCount);
      assert.equal(currentV3RestartEvidence.recoveredSideEffectsReplayed, false);
      assert.equal(currentV3RestartEvidence.firstNewOperation, expected.nextGlobalOperation);
    } else {
      assert.equal(
        currentV3RestartEvidence.zeroSideEffectReplaySteps,
        isCurrentV5 || isCurrentV6 || isCurrentV7 ? 0 : 16,
      );
    }
    if (isCurrentV6 || isCurrentV7) {
      const boundary = ravioliCheckpointRecord(
        currentV3RestartEvidence.boundary,
        `Ravioli package checkpoint ${isCurrentV7 ? "current-v7" : "current-v6"} boundary`,
      );
      assert.equal(boundary.eventCountAfterRecovery, 86);
      assert.equal(boundary.pinCount, 15);
      assert.equal(boundary.operationCount, 23);
      assert.equal(boundary.preRestartFileCount, 128);
      if (isCurrentV7) {
        assert.equal(
          boundary.finalEventSha256,
          RAVIOLI_CURRENT_V7_RESUME_IDENTITY.boundaryFinalEventSha256,
        );
        assert.equal(
          boundary.finalSemanticEventSha256,
          RAVIOLI_CURRENT_V7_RESUME_IDENTITY.predecessorSemanticEventSha256,
        );
      }
      assert.equal((currentV3RestartEvidence.activePins as unknown[]).length, 15);
      assert.equal((currentV3RestartEvidence.supersededPrivatePrecommitPins as unknown[]).length, 0);
      assert.equal((currentV3RestartEvidence.recoveredOperations as unknown[]).length, 23);
      assert.equal(currentV3RestartEvidence.recoveredSideEffectsReplayed, false);
      const counterAdvance = ravioliCheckpointRecord(
        currentV3RestartEvidence.counterAdvance,
        "Ravioli package checkpoint current-v6 counter advance",
      );
      assert.equal(counterAdvance.creatorAdvance, 3);
      assert.equal(counterAdvance.collectorOneAdvance, 1);
      assert.equal(counterAdvance.collectorTwoAdvance, 0);
      assert.equal(counterAdvance.semanticOperationsReplayed, 0);
      assert.equal(counterAdvance.pinsReplayed, 0);
    }
    if (isCurrentV5) {
      const boundary = ravioliCheckpointRecord(
        currentV3RestartEvidence.boundary,
        "Ravioli package checkpoint current-v5 boundary",
      );
      assert.equal(boundary.eventCount, 59);
      assert.equal(boundary.pinCount, 10);
      assert.equal(boundary.operationCount, 16);
      assert.equal(boundary.preRestartFileCount, 91);
      assert.equal((currentV3RestartEvidence.activePins as unknown[]).length, 10);
      assert.equal((currentV3RestartEvidence.supersededPrivatePrecommitPins as unknown[]).length, 0);
      assert.equal((currentV3RestartEvidence.recoveredOperations as unknown[]).length, 16);
      assert.equal(currentV3RestartEvidence.recoveredSideEffectsReplayed, false);
    }
    if (currentV3RestartEvidence.classification === "RAVIOLI-CURRENT-V4-AUTHENTICATED-RESUME") {
      const boundary = ravioliCheckpointRecord(
        currentV3RestartEvidence.boundary,
        "Ravioli package checkpoint current-v4 boundary",
      );
      assert.equal(boundary.eventCount, 40);
      assert.equal(boundary.pinCount, 12);
      assert.equal(boundary.operationCount, 9);
      assert.equal(boundary.preRestartFileCount, 72);
      assert.equal((currentV3RestartEvidence.activePins as unknown[]).length, 7);
      assert.equal((currentV3RestartEvidence.supersededPrivatePrecommitPins as unknown[]).length, 2);
      assert.equal((currentV3RestartEvidence.cryptoInvalidPrecommitPins as unknown[]).length, 3);
      assert.ok(currentV3RestartEvidence.freshOperationTen);
    }
  }
  return {
    runId: String(payload.runId),
    rpcUrl: String(payload.rpcUrl),
    startedAt: String(payload.startedAt),
    completedAt: String(payload.completedAt),
    dependencies,
    actors: ravioliCheckpointRecord(payload.actors, "Ravioli package checkpoint actors") as RavioliProofPackageCoreInput["actors"],
    funding: ravioliCheckpointRecord(payload.funding, "Ravioli package checkpoint funding"),
    mirror,
    kits: payload.kits as PackKit[],
    withheldRefundKit: payload.withheldRefundKit as PackKit,
    publicRevealUris: payload.publicRevealUris as string[],
    openKitCaptures,
    pins,
    screenshots,
    receipts: payload.receipts as PastaUiLivePublicReceipt[],
    writeReceipts: payload.writeReceipts as PastaUiLivePublicReceipt[],
    operationHashes: payload.operationHashes as string[],
    indexedInputs,
    negativeAssertions: payload.negativeAssertions as string[],
    capacityChecks: payload.capacityChecks as JsonObject[],
    memorySamples: payload.memorySamples as RavioliUiLiveMemorySample[],
    mode1PreOp10Proof,
    currentV3RestartEvidence,
    mutationRecoveryEvidence,
  };
}

async function writeRavioliProofPackageCheckpoint(input: {
  appRoot: string;
  runRoot: string;
  checkpointInput: RavioliProofPackageCheckpointInput;
}): Promise<RavioliProofPackageCheckpointEvidence> {
  const relativePath = RAVIOLI_PACKAGE_CHECKPOINT_RELATIVE_PATH;
  const absolutePath = path.join(input.appRoot, ...relativePath.split("/"));
  const preparingPath = `${absolutePath}.preparing`;
  const bytes = encodeRavioliPackageResumeCheckpoint({
    scope: { runId: input.checkpointInput.runId, appPath: "ravioli" },
    payload: ravioliProofPackageCheckpointPayload(input),
  });
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  try {
    const existingInfo = await lstat(absolutePath);
    if (!existingInfo.isFile() || existingInfo.isSymbolicLink()) throw new Error("existing Ravioli package checkpoint is not a real file");
    const existing = await readFile(absolutePath);
    assert.deepEqual(existing, Buffer.from(bytes), "existing Ravioli package checkpoint differs from exact inputs");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await durableRavioliExclusiveWrite(preparingPath, bytes);
    } catch (preparingError) {
      if ((preparingError as NodeJS.ErrnoException).code !== "EEXIST") throw preparingError;
      const preparingInfo = await lstat(preparingPath);
      if (!preparingInfo.isFile() || preparingInfo.isSymbolicLink()) throw new Error("existing Ravioli preparing checkpoint is not a real file");
      assert.deepEqual(
        await readFile(preparingPath),
        Buffer.from(bytes),
        "existing Ravioli preparing checkpoint differs from exact inputs",
      );
    }
    try {
      await link(preparingPath, absolutePath);
    } catch (linkError) {
      if ((linkError as NodeJS.ErrnoException).code !== "EEXIST") throw linkError;
      const concurrentInfo = await lstat(absolutePath);
      if (!concurrentInfo.isFile() || concurrentInfo.isSymbolicLink()) throw new Error("concurrent Ravioli package checkpoint is not a real file");
      assert.deepEqual(
        await readFile(absolutePath),
        Buffer.from(bytes),
        "concurrent Ravioli package checkpoint differs from exact inputs",
      );
    }
    await syncRavioliUiLiveDirectory(path.dirname(absolutePath));
  }
  await unlink(preparingPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await syncRavioliUiLiveDirectory(path.dirname(absolutePath));
  return { relativePath, absolutePath, sha256: sha256(bytes), byteLength: bytes.byteLength };
}

async function loadRavioliProofPackageCheckpoint(input: {
  appRoot: string;
  runRoot: string;
  runId: string;
}): Promise<{
  evidence: RavioliProofPackageCheckpointEvidence;
  checkpointInput: RavioliProofPackageCheckpointInput;
}> {
  assert.equal(path.resolve(input.appRoot), path.join(path.resolve(input.runRoot), "ravioli"), "Ravioli package checkpoint app root drift");
  assert.equal(path.basename(path.resolve(input.runRoot)), input.runId, "Ravioli package checkpoint requested run id drift");
  for (const [label, directory] of [["run root", input.runRoot], ["app root", input.appRoot]] as const) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Ravioli package checkpoint ${label} is not a real directory`);
  }
  const relativePath = RAVIOLI_PACKAGE_CHECKPOINT_RELATIVE_PATH;
  const absolutePath = path.join(input.appRoot, ...relativePath.split("/"));
  const preparingPath = `${absolutePath}.preparing`;
  let checkpointDirectory = path.resolve(input.appRoot);
  for (const component of ["artifacts", "package-resume"]) {
    checkpointDirectory = path.join(checkpointDirectory, component);
    const checkpointDirectoryInfo = await lstat(checkpointDirectory);
    if (!checkpointDirectoryInfo.isDirectory() || checkpointDirectoryInfo.isSymbolicLink()) {
      throw new Error("Ravioli package checkpoint directory is not a real directory");
    }
  }
  let bytes: Uint8Array;
  try {
    const checkpointInfo = await lstat(absolutePath);
    if (!checkpointInfo.isFile() || checkpointInfo.isSymbolicLink()) throw new Error("Ravioli package checkpoint is not a real file");
    bytes = await readFile(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const preparingInfo = await lstat(preparingPath);
    if (!preparingInfo.isFile() || preparingInfo.isSymbolicLink()) throw new Error("Ravioli preparing checkpoint is not a real file");
    const preparingBytes = await readFile(preparingPath);
    const preparing = decodeRavioliPackageResumeCheckpoint(preparingBytes);
    assert.deepEqual(
      preparing.scope,
      { runId: input.runId, appPath: "ravioli" },
      "Ravioli preparing checkpoint scope drift",
    );
    await link(preparingPath, absolutePath);
    await syncRavioliUiLiveDirectory(path.dirname(absolutePath));
    bytes = preparingBytes;
  }
  const checkpoint = decodeRavioliPackageResumeCheckpoint(bytes);
  assert.deepEqual(
    checkpoint.scope,
    { runId: input.runId, appPath: "ravioli" },
    "Ravioli package checkpoint scope differs from the requested proof run",
  );
  if (await readFile(preparingPath).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) {
    const preparingInfo = await lstat(preparingPath);
    if (!preparingInfo.isFile() || preparingInfo.isSymbolicLink()) throw new Error("Ravioli preparing checkpoint is not a real file");
    assert.deepEqual(await readFile(preparingPath), Buffer.from(bytes), "Ravioli preparing checkpoint differs from the committed checkpoint");
    await unlink(preparingPath);
    await syncRavioliUiLiveDirectory(path.dirname(absolutePath));
  }
  return {
    evidence: { relativePath, absolutePath, sha256: sha256(bytes), byteLength: bytes.byteLength },
    checkpointInput: ravioliProofPackageInputFromCheckpoint({
      payloadValue: checkpoint.payload,
      runRoot: input.runRoot,
      appRoot: input.appRoot,
      ipfs: resolveIpfsProofConfig(),
    }),
  };
}

export async function claimFreshRavioliUiLiveOutputDirectory(
  appRoot: string,
): Promise<{ appRoot: string; artifactsRoot: string }> {
  const resolvedAppRoot = path.resolve(appRoot);
  const runRoot = path.dirname(resolvedAppRoot);
  const runRootInfo = await lstat(runRoot);
  if (!runRootInfo.isDirectory() || runRootInfo.isSymbolicLink()) {
    throw new Error(`Ravioli proof run root must be a real, non-symbolic-link directory: ${runRoot}`);
  }

  try {
    await mkdir(resolvedAppRoot, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Ravioli proof output directory already exists; refusing overwrite: ${resolvedAppRoot}`);
    }
    throw error;
  }
  await syncRavioliUiLiveDirectory(runRoot);

  const artifactsRoot = path.join(resolvedAppRoot, "artifacts");
  await mkdir(artifactsRoot, { mode: 0o700 });
  await syncRavioliUiLiveDirectory(resolvedAppRoot);

  const [appRootInfo, artifactsRootInfo] = await Promise.all([
    lstat(resolvedAppRoot),
    lstat(artifactsRoot),
  ]);
  if (!appRootInfo.isDirectory() || appRootInfo.isSymbolicLink()) {
    throw new Error(`Ravioli proof output claim is not a real directory: ${resolvedAppRoot}`);
  }
  if (!artifactsRootInfo.isDirectory() || artifactsRootInfo.isSymbolicLink()) {
    throw new Error(`Ravioli proof artifacts claim is not a real directory: ${artifactsRoot}`);
  }
  return { appRoot: resolvedAppRoot, artifactsRoot };
}

type RavioliPrewriteResumeExpectation = {
  actors: Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent>;
  dependencyAddresses: { gnocchi: string; rotini: string };
  dependencyHashes: Record<string, string>;
  artifactHashes: Record<string, string>;
};

export async function openExactRavioliUiLivePrewriteJournal(input: {
  journalRoot: string;
  expected: RavioliPrewriteResumeExpectation;
}): Promise<RavioliUiLiveJournal> {
  const journal = await openRavioliUiLiveJournal(input.journalRoot);
  if (journal.isFinalized()) throw new Error("Ravioli pre-write resume refuses a finalized journal");
  if (journal.getCompletedOperationCount() !== 0) {
    throw new Error("Ravioli pre-write resume requires zero completed signer operations");
  }
  assert.deepEqual(journal.intent.actors, input.expected.actors, "Ravioli pre-write resume signer/counter intent drift");
  assert.deepEqual(journal.intent.dependencyAddresses, input.expected.dependencyAddresses, "Ravioli pre-write resume dependency address drift");
  const { tzktBaseline, ...stableDependencyHashes } = journal.intent.dependencyHashes;
  assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "Ravioli pre-write resume TzKT baseline hash is invalid");
  assert.deepEqual(stableDependencyHashes, input.expected.dependencyHashes, "Ravioli pre-write resume dependency hash drift");
  assert.deepEqual(journal.intent.artifactHashes, input.expected.artifactHashes, "Ravioli pre-write resume contract artifact drift");
  const [events, pins] = await Promise.all([
    readdir(path.join(journal.journalRoot, "events")),
    readdir(path.join(journal.journalRoot, "pins")),
  ]);
  if (events.length !== 0 || pins.length !== 0) {
    throw new Error("Ravioli pre-write resume requires empty journal event and pin directories");
  }
  return journal;
}

const RAVIOLI_PREWRITE_SCREENSHOT_STEMS = [
  "001-compose-five-atomic-pack-modes-same-run-dependencies-entered",
  "002-compose-five-atomic-pack-modes-creator-connected-on-shadownet",
] as const;

const RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS = [
  ...RAVIOLI_PREWRITE_SCREENSHOT_STEMS,
  "003-limited-edition-expiry-deconfliction-le-wrapper-outliving-child-rejected-before-pins-or-writes",
] as const;

const RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS = [
  ...RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS,
  "004-compose-five-atomic-pack-modes-deterministic-vault-configured",
] as const;

const RAVIOLI_CONTROLLER_RESUME_SCREENSHOT_STEMS = RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS;

const RAVIOLI_CURRENT_RESUME_SCREENSHOT_STEMS = [
  ...RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS,
  "004-compose-five-atomic-pack-modes-deterministic-vault-configured",
  "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued",
  "006-compose-five-atomic-pack-modes-blind-funded-pool-configured",
] as const;

const RAVIOLI_CURRENT_RESUME_OP23_SCREENSHOT_STEMS = [
  ...RAVIOLI_CURRENT_RESUME_SCREENSHOT_STEMS,
  "007-compose-five-atomic-pack-modes-blind-funded-pool-funded-and-issued",
  "008-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool",
  "009-buy-and-atomically-open-five-pack-modes-collector-two-bought-blind-funded-pool",
  "010-blind-claim-preserving-wrapper-transfer-collector-one-transferred-an-unopened-blind-claim",
  "011-compose-five-atomic-pack-modes-blind-allocated-mint-configured",
] as const;

function boundedRavioliEvidenceId(value: string, maximumLength = 128): string {
  if (value.length <= maximumLength) return value;
  const digest = sha256(Buffer.from(value, "utf8")).slice(0, 16);
  return `${value.slice(0, maximumLength - digest.length - 1).replace(/-+$/g, "")}-${digest}`;
}

async function requireExactRavioliPrewriteDirectory(directory: string, expectedNames: readonly string[], label: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} is not a real directory`);
  assert.deepEqual((await readdir(directory)).sort(), [...expectedNames].sort(), `${label} contains unexpected entries`);
}

async function loadExactRavioliUiLiveScreenshotPairs(
  appRoot: string,
  stems: readonly string[],
  label: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const screenshotsRoot = path.join(resolved, "screenshots");

  const output: CapturePastaProofStageResult[] = [];
  for (const [index, stem] of stems.entries()) {
    const pngPath = path.join(screenshotsRoot, `${stem}.png`);
    const sidecarPath = path.join(artifactsRoot, `screenshot-${stem}.json`);
    const [pngInfo, sidecarInfo, sidecarBytes, sidecar] = await Promise.all([
      lstat(pngPath),
      lstat(sidecarPath),
      readFile(sidecarPath),
      verifyScreenshotSidecar(pngPath, sidecarPath),
    ]);
    if (!pngInfo.isFile() || pngInfo.isSymbolicLink() || !sidecarInfo.isFile() || sidecarInfo.isSymbolicLink()) {
      throw new Error(`${label} screenshot ${index + 1} is not a real evidence pair`);
    }
    assert.equal(sidecar.app, "ravioli");
    assert.equal(sidecar.classification, "UI-LIVE");
    assert.equal(sidecar.stageOrdinal, index + 1);
    const pngRelativePath = `screenshots/${stem}.png`;
    const sidecarRelativePath = `artifacts/screenshot-${stem}.json`;
    output.push({
      appDirectory: resolved,
      pngPath,
      sidecarPath,
      pngRelativePath,
      sidecarRelativePath,
      filenameStem: stem,
      sidecar,
      manifestScreenshot: {
        stage: boundedRavioliEvidenceId(stem),
        path: pngRelativePath,
        sha256: sidecar.sha256,
        caption: `${sidecar.app}: ${sidecar.capability} — ${sidecar.stageName}`,
      },
      manifestSidecarArtifact: {
        id: boundedRavioliEvidenceId(`screenshot-sidecar-${stem}`),
        kind: "screenshot-sidecar",
        path: sidecarRelativePath,
        sha256: sha256(sidecarBytes),
      },
    });
  }
  return output;
}

export async function loadExactRavioliUiLivePrewriteScreenshots(appRoot: string): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  await requireExactRavioliPrewriteDirectory(resolved, ["artifacts", "screenshots"], "Ravioli pre-write app lane");
  const screenshotNames = await readdir(path.join(resolved, "screenshots"));
  const retainedNegativeScreenshot = `${RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS[2]}.png`;
  const stems = screenshotNames.includes(retainedNegativeScreenshot)
    ? RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS
    : RAVIOLI_PREWRITE_SCREENSHOT_STEMS;
  const sidecarNames = stems.map((stem) => `screenshot-${stem}.json`);
  const pngNames = stems.map((stem) => `${stem}.png`);
  await requireExactRavioliPrewriteDirectory(artifactsRoot, ["journal", "pins", ...sidecarNames], "Ravioli pre-write artifacts lane");
  await requireExactRavioliPrewriteDirectory(path.join(artifactsRoot, "pins"), [], "Ravioli pre-write external pin lane");
  await requireExactRavioliPrewriteDirectory(path.join(resolved, "screenshots"), pngNames, "Ravioli pre-write screenshot lane");
  return loadExactRavioliUiLiveScreenshotPairs(resolved, stems, "Ravioli pre-write");
}

export async function loadExactRavioliUiLiveMode0MutationScreenshots(appRoot: string): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const sidecarNames = RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS.map((stem) => `screenshot-${stem}.json`);
  const pngNames = RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS.map((stem) => `${stem}.png`);
  await requireExactRavioliPrewriteDirectory(resolved, ["artifacts", "screenshots"], "Ravioli mode-0 mutation app lane");
  const artifactNames = await readdir(artifactsRoot);
  const recoveryDirectoryName = "mode0-mutation-recovery";
  const hasPreservedRecovery = artifactNames.includes(recoveryDirectoryName);
  await requireExactRavioliPrewriteDirectory(
    artifactsRoot,
    ["journal", "open-kits", "pins", ...sidecarNames, ...(hasPreservedRecovery ? [recoveryDirectoryName] : [])],
    "Ravioli mode-0 mutation artifacts lane",
  );
  if (hasPreservedRecovery) {
    const recoveryInfo = await lstat(path.join(artifactsRoot, recoveryDirectoryName));
    if (!recoveryInfo.isDirectory() || recoveryInfo.isSymbolicLink()) throw new Error("Ravioli mode-0 preserved recovery lane is not a real directory");
  }
  await requireExactRavioliPrewriteDirectory(path.join(artifactsRoot, "pins"), [], "Ravioli mode-0 mutation external pin lane");
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "open-kits"),
    ["open-kit-capture-progress.json", "ravioli-open-kit-0.json"],
    "Ravioli mode-0 mutation open-kit lane",
  );
  await requireExactRavioliPrewriteDirectory(path.join(resolved, "screenshots"), pngNames, "Ravioli mode-0 mutation screenshot lane");
  return loadExactRavioliUiLiveScreenshotPairs(resolved, RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS, "Ravioli mode-0 mutation");
}

export async function loadExactRavioliUiLiveControllerResumeScreenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const sidecarNames = RAVIOLI_CONTROLLER_RESUME_SCREENSHOT_STEMS.map(
    (stem) => `screenshot-${stem}.json`,
  );
  const pngNames = RAVIOLI_CONTROLLER_RESUME_SCREENSHOT_STEMS.map((stem) => `${stem}.png`);
  await requireExactRavioliPrewriteDirectory(
    resolved,
    ["artifacts", "screenshots"],
    "Ravioli controller-resume app lane",
  );
  await requireExactRavioliPrewriteDirectory(
    artifactsRoot,
    ["journal", "pins", ...sidecarNames],
    "Ravioli controller-resume artifacts lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "pins"),
    [],
    "Ravioli controller-resume external pin lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(resolved, "screenshots"),
    pngNames,
    "Ravioli controller-resume screenshot lane",
  );
  return loadExactRavioliUiLiveScreenshotPairs(
    resolved,
    RAVIOLI_CONTROLLER_RESUME_SCREENSHOT_STEMS,
    "Ravioli controller resume",
  );
}

export async function loadExactRavioliUiLiveCurrentResumeScreenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const screenshotsRoot = path.join(resolved, "screenshots");
  const pngNames = (await readdir(screenshotsRoot)).sort();
  assert.ok(
    pngNames.length >= RAVIOLI_CURRENT_RESUME_SCREENSHOT_STEMS.length,
    "Ravioli current resume is missing its authenticated screenshot prefix",
  );
  assert.ok(
    pngNames.every((name) => /^\d{3}-[^/]+\.png$/.test(name)),
    "Ravioli current resume screenshot lane contains a non-canonical PNG name",
  );
  const stems = pngNames.map((name, index) => {
    const ordinal = Number(name.slice(0, 3));
    assert.equal(
      ordinal,
      index + 1,
      "Ravioli current resume screenshot ordinals are not contiguous",
    );
    return name.slice(0, -4);
  });
  assert.deepEqual(
    stems.slice(0, RAVIOLI_CURRENT_RESUME_SCREENSHOT_STEMS.length),
    [...RAVIOLI_CURRENT_RESUME_SCREENSHOT_STEMS],
    "Ravioli current resume canonical screenshot prefix drifted",
  );
  const sidecarNames = stems.map((stem) => `screenshot-${stem}.json`);
  const openKitsRoot = path.join(artifactsRoot, "open-kits");
  const progressPath = path.join(openKitsRoot, "open-kit-capture-progress.json");
  const progressBytes = await readFile(progressPath);
  const progress = JSON.parse(progressBytes.toString("utf8")) as JsonObject;
  assert.deepEqual(
    progressBytes,
    Buffer.from(deterministicJsonBytes(progress)),
    "Ravioli current resume open-kit progress is not canonical JSON",
  );
  assert.equal(progress.schema, "pastaprotocol-ravioli-open-kit-capture-progress@1");
  assert.equal(progress.status, "PARTIAL");
  assert.ok(Array.isArray(progress.openKits) && progress.openKits.length >= 2);
  if (progress.openKits.length >= 3) {
    assert.ok(
      stems.length >= RAVIOLI_CURRENT_RESUME_OP23_SCREENSHOT_STEMS.length,
      "Ravioli operation-23 resume is missing its authenticated screenshot prefix",
    );
    assert.deepEqual(
      stems.slice(0, RAVIOLI_CURRENT_RESUME_OP23_SCREENSHOT_STEMS.length),
      [...RAVIOLI_CURRENT_RESUME_OP23_SCREENSHOT_STEMS],
      "Ravioli operation-23 canonical screenshot prefix drifted",
    );
  }
  const openKitNames = progress.openKits.map((entry, index) => {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry));
    const record = entry as JsonObject;
    const fileName = `ravioli-open-kit-${index}.json`;
    assert.equal(record.tokenId, index);
    assert.equal(record.mode, MODE_NAMES[index]);
    assert.equal(record.fileName, fileName);
    assert.equal(record.path, `artifacts/open-kits/${fileName}`);
    assert.equal(record.ipfsPinned, false);
    assert.match(String(record.sha256 || ""), /^[0-9a-f]{64}$/);
    return fileName;
  });
  await requireExactRavioliPrewriteDirectory(
    resolved,
    ["artifacts", "screenshots"],
    "Ravioli current resume app lane",
  );
  await requireExactRavioliPrewriteDirectory(
    artifactsRoot,
    ["journal", "open-kits", "pins", ...sidecarNames],
    "Ravioli current resume artifacts lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "pins"),
    [],
    "Ravioli current resume external pin lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "open-kits"),
    ["open-kit-capture-progress.json", ...openKitNames],
    "Ravioli current resume open-kit lane",
  );
  await requireExactRavioliPrewriteDirectory(
    screenshotsRoot,
    pngNames,
    "Ravioli current resume screenshot lane",
  );
  return loadExactRavioliUiLiveScreenshotPairs(
    resolved,
    stems,
    "Ravioli current resume",
  );
}

async function loadRavioliCurrentResumeOpenKitIdentity(appRoot: string): Promise<JsonObject> {
  const openKitsRoot = path.join(appRoot, "artifacts", "open-kits");
  const progressBytes = await readFile(path.join(openKitsRoot, "open-kit-capture-progress.json"));
  const progress = JSON.parse(progressBytes.toString("utf8")) as JsonObject;
  assert.deepEqual(
    progressBytes,
    Buffer.from(deterministicJsonBytes(progress)),
    "current resume open-kit progress is not canonical JSON",
  );
  assert.equal(progress.schema, "pastaprotocol-ravioli-open-kit-capture-progress@1");
  assert.equal(progress.status, "PARTIAL");
  assert.ok(Array.isArray(progress.openKits) && progress.openKits.length >= 1);
  const openKits = [];
  for (const [tokenId, entry] of progress.openKits.entries()) {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry));
    const record = entry as JsonObject;
    const fileName = `ravioli-open-kit-${tokenId}.json`;
    assert.equal(record.tokenId, tokenId);
    assert.equal(record.mode, MODE_NAMES[tokenId]);
    assert.equal(record.fileName, fileName);
    assert.equal(record.path, `artifacts/open-kits/${fileName}`);
    assert.equal(record.ipfsPinned, false);
    assert.match(String(record.sha256 || ""), /^[0-9a-f]{64}$/);
    const bytes = await readFile(path.join(openKitsRoot, fileName));
    assert.equal(sha256(bytes), record.sha256, `current resume open-kit ${tokenId} digest drifted`);
    openKits.push({
      tokenId,
      mode: record.mode,
      fileName,
      sha256: record.sha256,
      byteLength: bytes.byteLength,
    });
  }
  return {
    schema: "pastaprotocol-ravioli-current-resume-open-kit-identity@1",
    progressSha256: sha256(progressBytes),
    openKits,
  };
}

function ravioliPrivateRecoveryPublicIdentity(
  recovery: RavioliPrivateRecoveryRestoration | null,
): JsonObject | null {
  if (!recovery) return null;
  return {
    schema: "pastaprotocol-ravioli-private-recovery-public-identity@1",
    manifestSha256: recovery.manifestSha256,
    capturedAt: recovery.capturedAt,
    authenticatedSnapshotCount: recovery.authenticatedSnapshotCount,
    recordCount: recovery.records.length,
    records: recovery.records.map((record) => ({
      storageKeySha256: sha256(Buffer.from(record.storageKey, "utf8")),
      valueSha256: record.sha256,
      account: record.account,
      contract: record.contract,
      tokenId: record.tokenId,
      status: record.status,
      workflow: record.workflow,
      stage: record.stage,
      operationHashes: [...record.operationHashes],
    })),
  };
}

async function loadRavioliCurrentResumeRetainedCaptures(
  appRoot: string,
  routerAddress: string,
): Promise<RavioliOpenKitDownloadCapture[]> {
  const openKitsRoot = path.join(appRoot, "artifacts", "open-kits");
  const progressBytes = await readFile(path.join(openKitsRoot, "open-kit-capture-progress.json"));
  const progress = JSON.parse(progressBytes.toString("utf8")) as JsonObject;
  assert.deepEqual(
    progressBytes,
    Buffer.from(deterministicJsonBytes(progress)),
    "current resume retained open-kit progress is not canonical JSON",
  );
  assert.equal(progress.schema, "pastaprotocol-ravioli-open-kit-capture-progress@1");
  assert.equal(progress.status, "PARTIAL");
  assert.ok(Array.isArray(progress.openKits) && progress.openKits.length >= 1);
  const captures: RavioliOpenKitDownloadCapture[] = [];
  for (const [tokenId, entry] of progress.openKits.entries()) {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry));
    const record = entry as JsonObject;
    const fileName = `ravioli-open-kit-${tokenId}.json`;
    assert.equal(record.tokenId, tokenId);
    assert.equal(record.mode, MODE_NAMES[tokenId]);
    assert.equal(record.fileName, fileName);
    assert.equal(record.path, `artifacts/open-kits/${fileName}`);
    assert.equal(record.ipfsPinned, false);
    const bytes = await readFile(path.join(openKitsRoot, fileName));
    assert.equal(
      sha256(bytes),
      record.sha256,
      `current resume retained open-kit ${tokenId} bytes drifted`,
    );
    const text = bytes.toString("utf8");
    assert.ok(
      text.endsWith("\n"),
      `current resume retained open-kit ${tokenId} is not the exact Studio download`,
    );
    captures.push(validateRavioliOpenKitDownload({
      mode: tokenId,
      expectedTokenId: tokenId,
      routerAddress,
      suggestedFilename: fileName,
      inPageJson: text.slice(0, -1),
      downloadedBytes: bytes,
    }));
  }
  return captures;
}

export function parseRavioliCurrentV2OpenKitEvidence(
  openKitBytes: Uint8Array,
  publicRevealBytes: Uint8Array,
): { openKit: JsonObject; publicReveal: JsonObject } {
  const openKit = JSON.parse(Buffer.from(openKitBytes).toString("utf8")) as JsonObject;
  const publicReveal = JSON.parse(Buffer.from(publicRevealBytes).toString("utf8")) as JsonObject;
  assert.ok(openKit && typeof openKit === "object" && !Array.isArray(openKit), "Ravioli current-v2 open kit is invalid");
  assert.ok(
    publicReveal && typeof publicReveal === "object" && !Array.isArray(publicReveal),
    "Ravioli current-v2 public reveal is invalid",
  );
  assert.ok(
    publicReveal.openKit && typeof publicReveal.openKit === "object" && !Array.isArray(publicReveal.openKit),
    "Ravioli current-v2 public reveal is missing its open kit",
  );
  assert.equal(
    sha256(deterministicJsonBytes(openKit)),
    sha256(deterministicJsonBytes(publicReveal.openKit)),
    "Ravioli current-v2 open kit differs from pin 5 publicReveal.openKit",
  );
  return { openKit, publicReveal };
}

export async function loadExactRavioliUiLiveCurrentV2Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const screenshotsRoot = path.join(resolved, "screenshots");
  const stems = RAVIOLI_CURRENT_V2_RESUME_IDENTITY.screenshots.map((screenshot) => screenshot.stem);
  const sidecarNames = stems.map((stem) => `screenshot-${stem}.json`);
  const pngNames = stems.map((stem) => `${stem}.png`);
  await requireExactRavioliPrewriteDirectory(
    resolved,
    ["artifacts", "screenshots"],
    "Ravioli current-v2 app lane",
  );
  await requireExactRavioliPrewriteDirectory(
    artifactsRoot,
    ["journal", "open-kits", "pins", ...sidecarNames],
    "Ravioli current-v2 artifacts lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "pins"),
    [],
    "Ravioli current-v2 external pin lane",
  );
  await requireExactRavioliPrewriteDirectory(
    path.join(artifactsRoot, "open-kits"),
    ["open-kit-capture-progress.json", "ravioli-open-kit-0.json"],
    "Ravioli current-v2 open-kit lane",
  );
  await requireExactRavioliPrewriteDirectory(
    screenshotsRoot,
    pngNames,
    "Ravioli current-v2 screenshot lane",
  );
  for (const expected of RAVIOLI_CURRENT_V2_RESUME_IDENTITY.screenshots) {
    const [pngBytes, sidecarBytes] = await Promise.all([
      readFile(path.join(screenshotsRoot, `${expected.stem}.png`)),
      readFile(path.join(artifactsRoot, `screenshot-${expected.stem}.json`)),
    ]);
    assert.equal(sha256(pngBytes), expected.pngSha256, `Ravioli current-v2 ${expected.stem} PNG drift`);
    assert.equal(
      sha256(sidecarBytes),
      expected.sidecarSha256,
      `Ravioli current-v2 ${expected.stem} sidecar drift`,
    );
  }
  const openKitPath = path.join(artifactsRoot, "open-kits", "ravioli-open-kit-0.json");
  const progressPath = path.join(artifactsRoot, "open-kits", "open-kit-capture-progress.json");
  const [openKitInfo, progressInfo, openKitBytes, progressBytes, publicRevealBytes] = await Promise.all([
    lstat(openKitPath),
    lstat(progressPath),
    readFile(openKitPath),
    readFile(progressPath),
    readFile(path.join(artifactsRoot, "journal", "pins", "000005.bin")),
  ]);
  assert.ok(openKitInfo.isFile() && !openKitInfo.isSymbolicLink(), "Ravioli current-v2 open kit is not a real file");
  assert.ok(progressInfo.isFile() && !progressInfo.isSymbolicLink(), "Ravioli current-v2 open-kit progress is not a real file");
  assert.equal(
    sha256(openKitBytes),
    RAVIOLI_CURRENT_V2_RESUME_IDENTITY.openKitSha256,
    "Ravioli current-v2 open-kit drift",
  );
  assert.equal(
    sha256(progressBytes),
    RAVIOLI_CURRENT_V2_RESUME_IDENTITY.openKitProgressSha256,
    "Ravioli current-v2 open-kit progress drift",
  );
  const progress = JSON.parse(progressBytes.toString("utf8"));
  const { openKit, publicReveal } = parseRavioliCurrentV2OpenKitEvidence(openKitBytes, publicRevealBytes);
  assert.deepEqual(
    progressBytes,
    Buffer.from(deterministicJsonBytes(progress)),
    "Ravioli current-v2 open-kit progress bytes are not canonical",
  );
  assert.deepEqual(
    publicRevealBytes,
    Buffer.from(deterministicJsonBytes(publicReveal)),
    "Ravioli current-v2 public reveal bytes are not canonical",
  );
  assert.equal(
    openKit?.recipes?.[0]?.nonce,
    RAVIOLI_CURRENT_V2_MODE0_NONCE,
    "Ravioli current-v2 open-kit nonce drift",
  );
  return loadExactRavioliUiLiveScreenshotPairs(resolved, stems, "Ravioli current-v2");
}

export async function loadExactRavioliUiLiveCurrentV3Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const screenshotsRoot = path.join(resolved, "screenshots");
  const stems = RAVIOLI_CURRENT_V3_RESTART_IDENTITY.screenshots.map((screenshot) => screenshot.stem);
  for (const expected of RAVIOLI_CURRENT_V3_RESTART_IDENTITY.screenshots) {
    const [pngBytes, sidecarBytes] = await Promise.all([
      readFile(path.join(screenshotsRoot, `${expected.stem}.png`)),
      readFile(path.join(artifactsRoot, `screenshot-${expected.stem}.json`)),
    ]);
    assert.equal(sha256(pngBytes), expected.pngSha256, `Ravioli current-v3 ${expected.stem} PNG drift`);
    assert.equal(
      sha256(sidecarBytes),
      expected.sidecarSha256,
      `Ravioli current-v3 ${expected.stem} sidecar drift`,
    );
  }
  const [openKitBytes, progressBytes, publicRevealBytes] = await Promise.all([
    readFile(path.join(artifactsRoot, "open-kits", "ravioli-open-kit-0.json")),
    readFile(path.join(artifactsRoot, "open-kits", "open-kit-capture-progress.json")),
    readFile(path.join(artifactsRoot, "journal", "pins", "000005.bin")),
  ]);
  assert.equal(
    sha256(openKitBytes),
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.openKitSha256,
    "Ravioli current-v3 open-kit drift",
  );
  assert.equal(
    sha256(progressBytes),
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.openKitProgressSha256,
    "Ravioli current-v3 open-kit progress drift",
  );
  const progress = JSON.parse(progressBytes.toString("utf8"));
  const { openKit, publicReveal } = parseRavioliCurrentV2OpenKitEvidence(openKitBytes, publicRevealBytes);
  assert.deepEqual(
    progressBytes,
    Buffer.from(deterministicJsonBytes(progress)),
    "Ravioli current-v3 open-kit progress bytes are not canonical",
  );
  assert.deepEqual(
    publicRevealBytes,
    Buffer.from(deterministicJsonBytes(publicReveal)),
    "Ravioli current-v3 public reveal bytes are not canonical",
  );
  assert.equal(
    openKit?.recipes?.[0]?.nonce,
    RAVIOLI_CURRENT_V2_MODE0_NONCE,
    "Ravioli current-v3 mode-0 open-kit nonce drift",
  );
  return loadExactRavioliUiLiveScreenshotPairs(resolved, stems, "Ravioli current-v3");
}

export async function loadExactRavioliUiLiveCurrentV4Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  const resolved = path.resolve(appRoot);
  const artifactsRoot = path.join(resolved, "artifacts");
  const screenshotsRoot = path.join(resolved, "screenshots");
  const stems = RAVIOLI_CURRENT_V4_RESUME_IDENTITY.screenshots.map((screenshot) => screenshot.stem);
  for (const expected of RAVIOLI_CURRENT_V4_RESUME_IDENTITY.screenshots) {
    const [pngBytes, sidecarBytes] = await Promise.all([
      readFile(path.join(screenshotsRoot, `${expected.stem}.png`)),
      readFile(path.join(artifactsRoot, `screenshot-${expected.stem}.json`)),
    ]);
    assert.equal(sha256(pngBytes), expected.pngSha256, `Ravioli current-v4 ${expected.stem} PNG drift`);
    assert.equal(
      sha256(sidecarBytes),
      expected.sidecarSha256,
      `Ravioli current-v4 ${expected.stem} sidecar drift`,
    );
  }
  const [openKit0Bytes, openKit1Bytes, progressBytes] = await Promise.all([
    readFile(path.join(artifactsRoot, "open-kits", "ravioli-open-kit-0.json")),
    readFile(path.join(artifactsRoot, "open-kits", "ravioli-open-kit-1.json")),
    readFile(path.join(artifactsRoot, "open-kits", "open-kit-capture-progress.json")),
  ]);
  assert.equal(sha256(openKit0Bytes), RAVIOLI_CURRENT_V4_RESUME_IDENTITY.openKit0Sha256);
  assert.equal(sha256(openKit1Bytes), RAVIOLI_CURRENT_V4_RESUME_IDENTITY.openKit1Sha256);
  assert.equal(sha256(progressBytes), RAVIOLI_CURRENT_V4_RESUME_IDENTITY.openKitProgressSha256);
  return loadExactRavioliUiLiveScreenshotPairs(resolved, stems, "Ravioli current-v4");
}

export async function loadExactRavioliUiLiveCurrentV5Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  return loadExactRavioliUiLiveScreenshotPairs(
    path.resolve(appRoot),
    RAVIOLI_CURRENT_V5_RESUME_IDENTITY.screenshots.map((screenshot) => screenshot.stem),
    "Ravioli current-v5",
  );
}

export async function loadExactRavioliUiLiveCurrentV6Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  return loadExactRavioliUiLiveScreenshotPairs(
    path.resolve(appRoot),
    RAVIOLI_CURRENT_V6_RESUME_IDENTITY.screenshots.map((screenshot) => screenshot.stem),
    "Ravioli current-v6",
  );
}

export async function loadExactRavioliUiLiveCurrentV7Screenshots(
  appRoot: string,
): Promise<CapturePastaProofStageResult[]> {
  return loadExactRavioliUiLiveScreenshotPairs(
    path.resolve(appRoot),
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.screenshots.map((screenshot) => screenshot.stem),
    "Ravioli current-v7",
  );
}

async function loadRavioliCurrentV4RetainedMode0Capture(
  appRoot: string,
  routerAddress: string,
): Promise<RavioliOpenKitDownloadCapture> {
  const fileName = "ravioli-open-kit-0.json";
  const bytes = await readFile(path.join(appRoot, "artifacts", "open-kits", fileName));
  assert.equal(
    sha256(bytes),
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.openKit0Sha256,
    "current-v4 retained mode-0 open-kit bytes drift",
  );
  const text = bytes.toString("utf8");
  assert.ok(text.endsWith("\n"), "current-v4 retained mode-0 open kit is not the exact Studio download");
  return validateRavioliOpenKitDownload({
    mode: 0,
    routerAddress,
    suggestedFilename: fileName,
    inPageJson: text.slice(0, -1),
    downloadedBytes: bytes,
  });
}

type RavioliMode0MutationRecoveryEvidence = {
  sourceRoot: string;
  receipt: JsonObject;
  receiptSha256: string;
  files: Array<{ id: string; kind: string; fileName: string; sha256: string }>;
};

type RavioliMode0MutationRecoveryEvidenceInput = {
  appRoot: string;
  replay: RavioliMode0MutationReplay;
  initialLive: JsonObject;
  finalLive: JsonObject;
};

async function loadPreservedRavioliMode0MutationRecoveryEvidence(
  input: RavioliMode0MutationRecoveryEvidenceInput,
  sourceRoot: string,
): Promise<RavioliMode0MutationRecoveryEvidence> {
  const expectedNames = [
    "ravioli-mode0-mutation-recovery.json",
    "superseded-open-kit-capture-progress.json",
    "superseded-ravioli-open-kit-0.json",
    "superseded-ravioli-pack-manifest.json",
    "superseded-token.json",
  ];
  await requireExactRavioliPrewriteDirectory(sourceRoot, expectedNames, "Ravioli preserved mode-0 recovery evidence");
  const receiptBytes = await readFile(path.join(sourceRoot, "ravioli-mode0-mutation-recovery.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as JsonObject;
  assert.equal(receipt.schema, "pastaprotocol-ravioli-mode0-mutation-recovery@1");
  assert.equal(receipt.classification, "UI-LIVE-EXACT-MUTATION-REPLAY");
  assert.equal(receipt.status, "READY_TO_CONTINUE");
  assert.equal(receipt.sourceJournal?.journalId, input.replay.identity.journalId);
  assert.equal(receipt.sourceJournal?.intentSha256, input.replay.identity.intentSha256);
  assert.equal(Number(receipt.sourceJournal?.completedOperations), 2);
  assert.equal(receipt.routerAddress, input.replay.routerAddress);
  assert.deepEqual(receipt.activeReplayPins, input.replay.activePins.map((pin) => ({
    pinSequence: pin.pinSequence,
    fileName: pin.proof.fileName,
    uri: pin.proof.uri,
    sha256: pin.proof.sha256,
  })));
  assert.deepEqual(receipt.replayedOperations, input.replay.writeReceipts.map((entry) => ({
    action: entry.action,
    operationHash: entry.operationHash,
    contractAddress: entry.contractAddress,
    entrypoints: entry.entrypoints,
  })));
  assert.deepEqual(receipt.supersededPins, input.replay.stalePins);
  assert.deepEqual(stableRavioliMode0MutationLiveCheck(receipt.initialLiveCheck), stableRavioliMode0MutationLiveCheck(input.initialLive));
  assert.deepEqual(stableRavioliMode0MutationLiveCheck(receipt.finalLiveCheck), stableRavioliMode0MutationLiveCheck(input.finalLive));
  const preserved = receipt.preservedArtifacts as JsonObject[];
  assert.ok(Array.isArray(preserved) && preserved.length === 4, "Ravioli preserved recovery receipt must list four source artifacts");
  const files: RavioliMode0MutationRecoveryEvidence["files"] = [];
  for (const artifact of preserved) {
    assert.match(String(artifact.id), /^superseded-/);
    assert.match(String(artifact.kind), /^superseded-/);
    assert.ok(expectedNames.includes(String(artifact.fileName)) && artifact.fileName !== "ravioli-mode0-mutation-recovery.json");
    const bytes = await readFile(path.join(sourceRoot, artifact.fileName));
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.id} preserved recovery hash drift`);
    files.push({ id: artifact.id, kind: artifact.kind, fileName: artifact.fileName, sha256: artifact.sha256 });
  }
  assert.deepEqual(
    files.map((file) => file.fileName).sort(),
    expectedNames.filter((name) => name !== "ravioli-mode0-mutation-recovery.json").sort(),
    "Ravioli preserved recovery artifact inventory drift",
  );
  const receiptSha256 = sha256(receiptBytes);
  files.push({
    id: "ravioli-mode0-mutation-recovery-receipt",
    kind: "mutation-recovery-receipt",
    fileName: "ravioli-mode0-mutation-recovery.json",
    sha256: receiptSha256,
  });
  return { sourceRoot, receipt, receiptSha256, files };
}

export async function preserveRavioliMode0MutationRecoveryEvidence(
  input: RavioliMode0MutationRecoveryEvidenceInput,
): Promise<RavioliMode0MutationRecoveryEvidence> {
  const sourceRoot = path.join(input.appRoot, "artifacts", "mode0-mutation-recovery");
  try {
    await mkdir(sourceRoot, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return loadPreservedRavioliMode0MutationRecoveryEvidence(input, sourceRoot);
  }
  await syncRavioliUiLiveDirectory(path.join(input.appRoot, "artifacts"));
  const artifactRoot = sourceRoot;
  const sources = [
    {
      id: "superseded-mode0-open-kit",
      kind: "superseded-local-open-kit",
      fileName: "superseded-ravioli-open-kit-0.json",
      source: path.join(input.appRoot, "artifacts", "open-kits", "ravioli-open-kit-0.json"),
    },
    {
      id: "superseded-mode0-open-kit-progress",
      kind: "superseded-open-kit-capture-progress",
      fileName: "superseded-open-kit-capture-progress.json",
      source: path.join(input.appRoot, "artifacts", "open-kits", "open-kit-capture-progress.json"),
    },
    {
      id: "superseded-mode0-manifest-pin-bytes",
      kind: "superseded-journal-pin-bytes",
      fileName: "superseded-ravioli-pack-manifest.json",
      source: path.join(input.replay.journalRoot, "pins", "000003.bin"),
    },
    {
      id: "superseded-mode0-token-pin-bytes",
      kind: "superseded-journal-pin-bytes",
      fileName: "superseded-token.json",
      source: path.join(input.replay.journalRoot, "pins", "000004.bin"),
    },
  ] as const;
  const files: RavioliMode0MutationRecoveryEvidence["files"] = [];
  for (const source of sources) {
    const bytes = await readFile(source.source);
    const digest = sha256(bytes);
    await durableRavioliExclusiveWrite(path.join(artifactRoot, source.fileName), bytes);
    files.push({ id: source.id, kind: source.kind, fileName: source.fileName, sha256: digest });
  }
  const openKit = JSON.parse((await readFile(path.join(artifactRoot, "superseded-ravioli-open-kit-0.json"))).toString("utf8"));
  assert.equal(openKit.contract, input.replay.routerAddress);
  assert.equal(Number(openKit.tokenId), 0);
  assert.equal(openKit.mode, MODE_NAMES[0]);
  assert.equal(openKit.blindSecurity, "commit-reveal-ui-hidden-chain-public");
  const progress = JSON.parse((await readFile(path.join(artifactRoot, "superseded-open-kit-capture-progress.json"))).toString("utf8"));
  assert.equal(progress.status, "PARTIAL");
  assert.equal(progress.openKits?.length, 1);
  assert.equal(progress.openKits[0]?.sha256, files[0].sha256);
  const receipt: JsonObject = {
    schema: "pastaprotocol-ravioli-mode0-mutation-recovery@1",
    classification: "UI-LIVE-EXACT-MUTATION-REPLAY",
    status: "READY_TO_CONTINUE",
    createdAt: new Date().toISOString(),
    sourceJournal: {
      journalId: input.replay.identity.journalId,
      intentSha256: input.replay.identity.intentSha256,
      completedOperations: 2,
    },
    routerAddress: input.replay.routerAddress,
    activeReplayPins: input.replay.activePins.map((pin) => ({
      pinSequence: pin.pinSequence,
      fileName: pin.proof.fileName,
      uri: pin.proof.uri,
      sha256: pin.proof.sha256,
    })),
    replayedOperations: input.replay.writeReceipts.map((receipt) => ({
      action: receipt.action,
      operationHash: receipt.operationHash,
      contractAddress: receipt.contractAddress,
      entrypoints: receipt.entrypoints,
    })),
    supersededPins: input.replay.stalePins,
    // Freeze the four source artifacts into the signed receipt. The outer evidence
    // inventory adds the receipt file after its digest is known; retaining this
    // mutable array by reference would make the in-memory receipt disagree with
    // the exact bytes just written.
    preservedArtifacts: files.map((file) => ({ ...file })),
    initialLiveCheck: input.initialLive,
    finalLiveCheck: input.finalLive,
    safety: "Only the exact wrapper, collection metadata, router origination, and Gnocchi token-0 operator approval are replayed to the browser. Superseded mystery metadata remains immutable evidence and is excluded from active product pins.",
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptSha256 = sha256(receiptBytes);
  await durableRavioliExclusiveWrite(path.join(artifactRoot, "ravioli-mode0-mutation-recovery.json"), receiptBytes);
  files.push({
    id: "ravioli-mode0-mutation-recovery-receipt",
    kind: "mutation-recovery-receipt",
    fileName: "ravioli-mode0-mutation-recovery.json",
    sha256: receiptSha256,
  });
  return { sourceRoot, receipt, receiptSha256, files };
}

function assertNoDataUri(value: unknown, label: string): void {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /^data:/i, `${label} may not use inline data URIs`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoDataUri(child, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) assertNoDataUri(child, `${label}.${key}`);
  }
}

export const RAVIOLI_UI_LIVE_PACK_SPECS = [
  { mode: 0, blind: false, editions: 1, soldEditions: 1, itemCount: 1, priceMutez: 0, primitives: ["escrow"] },
  { mode: 1, blind: true, editions: 2, soldEditions: 2, itemCount: 1, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["escrow"] },
  { mode: 2, blind: true, editions: 1, soldEditions: 1, itemCount: 1, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["allocated_mint"] },
  { mode: 3, blind: true, editions: 1, soldEditions: 1, itemCount: 2, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["generative_mint", "generative_mint"] },
  { mode: 4, blind: true, editions: 1, soldEditions: 1, itemCount: 3, priceMutez: PAID_SALE_PRICE_MUTEZ, primitives: ["escrow", "allocated_mint", "generative_mint"] },
] as const;
const PACK_SPECS = RAVIOLI_UI_LIVE_PACK_SPECS;
export const RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC = Object.freeze({
  mode: 2,
  blind: true,
  editions: 2,
  soldEditions: 1,
  itemCount: 1,
  priceMutez: PAID_SALE_PRICE_MUTEZ,
  primitives: ["allocated_mint"] as const,
});
const WITHHELD_REFUND_PACK_SPEC = RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC;

function proofPackSpec(tokenId: number): (typeof PACK_SPECS)[number] | typeof WITHHELD_REFUND_PACK_SPEC | undefined {
  return PACK_SPECS[tokenId] || (tokenId === PACK_SPECS.length ? WITHHELD_REFUND_PACK_SPEC : undefined);
}

export function ravioliSaleNeedsDeadlineWait(input: {
  editions: number;
  soldEditions: number;
}): boolean {
  assert.ok(
    Number.isSafeInteger(input.editions) && input.editions > 0,
    "Ravioli proof edition count is invalid",
  );
  assert.ok(
    Number.isSafeInteger(input.soldEditions)
      && input.soldEditions >= 0
      && input.soldEditions <= input.editions,
    "Ravioli proof sold-edition count is invalid",
  );
  return input.soldEditions < input.editions;
}

function assertPayloadPolicy(actions: unknown[], tokenId: number, opening: boolean): void {
  const expected = proofPackSpec(tokenId);
  assert.ok(expected);
  assert.equal(actions.length, expected.itemCount);
  assert.deepEqual(actions.map((action) => primitive(action as JsonObject)), [...expected.primitives]);
  for (const action of actions as JsonObject[]) {
    const kind = primitive(action);
    const value = action[kind] as JsonObject;
    if (kind === "allocated_mint") {
      assert.equal(value.payload_commitment, ravioliPayloadCommitment(""), "allocated action must commit blake2b(empty payload)");
      if (opening) assert.equal(value.payload, "", "allocated open payload must remain empty");
    }
    if (kind === "generative_mint") {
      assert.equal(value.payload_commitment, null, "generated-at-open actions must use the explicit None commitment policy");
      if (opening) assert.match(String(value.payload || ""), /^[0-9a-f]+$/, "generative open must carry a packed payload");
    }
  }
}

export class RavioliUiLivePolicy {
  private pendingOriginationKind:
    | "blindController"
    | "router"
    | "gnocchiAdapter"
    | "rotiniAdapter"
    | null = null;

  constructor(
    private readonly input: {
      administrator: string;
      dependencies: Pick<DependencyEvidence, "gnocchi" | "rotini">;
      mirror: RavioliUiStateMirror;
      pins: PinRecord[];
      codeHashes: {
        deploymentCertificate: string;
        blindController: string;
        router: string;
        rotiniTarget: string;
        gnocchiAdapter: string;
        rotiniAdapter: string;
      };
    },
  ) {
    input.mirror.setAdministrator(input.administrator);
  }

  validatePin(input: { value?: unknown; fileName: string; mimeType: string }): void {
    if (input.mimeType !== "application/json" || !input.value || typeof input.value !== "object" || Array.isArray(input.value)) return;
    const value = input.value as JsonObject;
    if (input.fileName === "ravioli-pack-manifest.json") {
      const mode = String(value.mode || "");
      assert.ok(MODE_NAMES.includes(mode as typeof MODE_NAMES[number]), "Ravioli pack manifest mode is invalid");
      const deterministic = mode === MODE_NAMES[0];
      assert.equal(value.mystery, !deterministic, `Ravioli ${mode} manifest mystery policy drift`);
      assert.equal(
        value.blindSecurity,
        deterministic ? "public-recipe" : "commit-reveal-ui-hidden-chain-public",
        `Ravioli ${mode} manifest disclosure policy drift`,
      );
      return;
    }
    if (input.fileName === "token.json" && value.ravioli && typeof value.ravioli === "object" && !Array.isArray(value.ravioli)) {
      const ravioli = value.ravioli as JsonObject;
      const mode = String(ravioli.mode || "");
      assert.ok(MODE_NAMES.includes(mode as typeof MODE_NAMES[number]), "Ravioli token metadata mode is invalid");
      const deterministic = mode === MODE_NAMES[0];
      assert.equal(
        ravioli.blindSecurity,
        deterministic ? "public" : "authenticated-ciphertext-until-reveal",
        `Ravioli ${mode} token disclosure policy drift`,
      );
      assert.match(String(ravioli.manifestUri || ""), /^ipfs:\/\//, `Ravioli ${mode} token must publish its manifest URI`);
      if (deterministic) {
        assert.equal(ravioli.sealedContentsUri, undefined, "deterministic Ravioli token must not publish a sealed contents URI");
        assert.equal(ravioli.revealCommitment, undefined, "deterministic Ravioli token must not publish a reveal commitment");
      } else {
        assert.match(
          String(ravioli.sealedContentsUri || ""),
          /^ipfs:\/\//,
          `blind Ravioli ${mode} token must publish its authenticated ciphertext URI`,
        );
        assert.match(
          String(ravioli.revealCommitment || ""),
          /^[0-9a-f]{64}$/,
          `blind Ravioli ${mode} token must publish its reveal commitment`,
        );
      }
    }
  }

  validateOrigination({ code, storage }: { code: unknown; storage: unknown }): void {
    assert.ok(storage && typeof storage === "object" && !Array.isArray(storage));
    const value = storage as JsonObject;
    const uri = metadataUri(value);
    assert.match(uri, /^ipfs:\/\//);
    assert.doesNotMatch(uri, /^data:/i);
    const pin = this.input.pins.find((candidate) => candidate.proof.uri === uri);
    assert.ok(pin?.value && typeof pin.value === "object", "contract metadata URI must resolve to an exact current-run JSON pin");
    assertNoDataUri(pin.value, "contract metadata");
    const codeHash = hashJsonForBridge(code);
    let kind: "blindController" | "router" | "gnocchiAdapter" | "rotiniAdapter";
    if (codeHash === this.input.codeHashes.blindController) {
      kind = "blindController";
      assert.equal((pin.value as JsonObject).name, "Pasta Ravioli Blind Pack Controller");
      assert.equal(this.input.mirror.blindControllerAddress, "");
      assert.deepEqual(
        Object.keys(value).sort(),
        [
          "claim_counts",
          "claim_slots",
          "consumed_serials",
          "metadata",
          "packs",
          "refund_credits",
        ],
        "blind-controller storage contains stale or missing fields",
      );
    } else if (codeHash === this.input.codeHashes.router) {
      kind = "router";
      assert.equal(value.administrator, this.input.administrator);
      assert.equal(value.pending_administrator, null);
      assert.equal(
        value.blind_controller,
        this.input.mirror.blindControllerAddress,
        "router is not immutably bound to the immediately confirmed controller",
      );
      assert.equal((pin.value as JsonObject).name, "Ravioli UI-LIVE Atomic Packs");
      assert.equal(this.input.mirror.routerAddress, "");
    } else if (codeHash === this.input.codeHashes.gnocchiAdapter) {
      kind = "gnocchiAdapter";
      assert.equal(value.administrator, this.input.administrator);
      assert.equal(value.pending_administrator, null);
      assert.equal((pin.value as JsonObject).name, "Pasta Gnocchi Pack Adapter");
      assert.equal(this.input.mirror.gnocchiAdapterAddress, "");
    } else if (codeHash === this.input.codeHashes.rotiniAdapter) {
      kind = "rotiniAdapter";
      assert.equal(value.administrator, this.input.administrator);
      assert.equal(value.pending_administrator, null);
      assert.equal((pin.value as JsonObject).name, "Pasta Rotini Pack Adapter");
      assert.equal(this.input.mirror.rotiniAdapterAddress, "");
    } else {
      assert.fail("browser requested an unrecognized Ravioli contract artifact");
    }
    assert.equal(this.pendingOriginationKind, null, "only one origination may be pending");
    this.pendingOriginationKind = kind;
  }

  consumeOriginationKind():
    | "blindController"
    | "router"
    | "gnocchiAdapter"
    | "rotiniAdapter" {
    assert.ok(this.pendingOriginationKind);
    const kind = this.pendingOriginationKind;
    this.pendingOriginationKind = null;
    return kind;
  }

  validateCall({ contractAddress, entrypoint, payload }: { contractAddress: string; entrypoint: string; payload: unknown }): void {
    const { mirror, dependencies, administrator } = this.input;
    if (contractAddress === dependencies.gnocchi.address) {
      if (entrypoint === "add_minter") {
        assert.equal(payload, mirror.gnocchiAdapterAddress);
        return;
      }
      assert.equal(entrypoint, "update_operators");
      assert.ok(Array.isArray(payload) && payload.length >= 1);
      for (const update of payload as JsonObject[]) {
        const add = update.add_operator;
        assert.ok(add);
        assert.equal(add.owner, administrator);
        assert.equal(add.operator, mirror.routerAddress);
        assert.ok([0, 1].includes(Number(add.token_id)));
      }
      return;
    }
    if (contractAddress === dependencies.rotini.address) {
      assert.equal(entrypoint, "add_pack_minter");
      assert.equal(payload, mirror.rotiniAdapterAddress);
      return;
    }
    if (contractAddress === mirror.gnocchiAdapterAddress) {
      if (entrypoint === "add_router") {
        assert.equal(payload, mirror.routerAddress);
        return;
      }
      assert.equal(entrypoint, "create_allocation");
      const value = payload as JsonObject;
      assert.equal(value.target, dependencies.gnocchi.address);
      const expectedTokenId = mirror.gnocchiNextResourceId === 0
        ? dependencies.gnocchi.limitedAllocationTokenId
        : dependencies.gnocchi.allocationTokenId;
      assert.equal(Number(value.token_id), expectedTokenId);
      assert.equal(Number(value.amount_per_open), 1);
      assert.equal(value.active, true);
      return;
    }
    if (contractAddress === mirror.rotiniAdapterAddress) {
      if (entrypoint === "add_router") {
        assert.equal(payload, mirror.routerAddress);
        return;
      }
      assert.equal(entrypoint, "create_resource");
      const value = payload as JsonObject;
      assert.equal(value.target, dependencies.rotini.address);
      assert.equal(Number(value.project_id), dependencies.rotini.projectId);
      assert.equal(value.active, true);
      return;
    }
    assert.equal(contractAddress, mirror.routerAddress, "creator may only manage same-run dependency/helper/router contracts");
    if (entrypoint === "create_pack") {
      const value = payload as JsonObject;
      const spec = proofPackSpec(mirror.nextTokenId);
      assert.ok(spec, "unexpected pack outside the semantic proof plan");
      assert.equal(asSafeInteger(value.expected_token_id, "expected pack token id"), mirror.nextTokenId);
      const config = normalizePack(value.config);
      assert.equal(config.mode, spec.mode);
      assert.equal(config.blind, spec.blind);
      assert.equal(config.item_count, spec.itemCount);
      assert.equal(config.max_supply, spec.editions);
      assert.equal(config.committed_recipes, 0);
      assert.equal(config.finalized, false);
      assert.equal(config.cancelled, false);
      assertRavioliSameInstantOrNull(
        config.child_expiry,
        mirror.nextTokenId === 2 ? dependencies.gnocchi.limitedEdition.receipt.token.end : null,
        `Ravioli pack ${mirror.nextTokenId} child-expiry policy drift`,
      );
      if (spec.blind) {
        assert.equal(config.contents_uri, null, `blind Ravioli pack ${spec.mode} must not publish contents at creation`);
        assert.ok(config.reveal_deadline && Number.isFinite(Date.parse(config.reveal_deadline)));
        assert.ok(config.open_deadline && Number.isFinite(Date.parse(config.open_deadline)));
        assert.ok(Date.parse(config.reveal_deadline) < Date.parse(config.open_deadline));
        assert.match(String(config.reveal_commitment || ""), /^[0-9a-f]{64}$/);
        if (config.child_expiry) {
          assert.ok(
            config.wrapper_sale_end &&
              Number.isFinite(Date.parse(config.wrapper_sale_end)),
            "a Ravioli pack containing a timed Limited Edition child must commit its own finite LE sale end",
          );
          assert.ok(
            Date.parse(config.wrapper_sale_end) < Date.parse(config.reveal_deadline),
            "the Ravioli LE sale must end before its reveal deadline",
          );
          assert.ok(
            Date.parse(config.wrapper_sale_end) < Date.parse(config.child_expiry),
            "Ravioli wrapper sale must end strictly before its earliest LE child",
          );
          assert.ok(
            Date.parse(config.reveal_deadline) <= Date.parse(config.child_expiry),
            "Ravioli reveal deadline must not exceed its earliest LE child",
          );
        } else {
          assert.equal(
            config.wrapper_sale_end,
            null,
            "non-LE child packs must not forge an inherited child-expiry wrapper constraint",
          );
        }
      } else {
        assert.equal(config.wrapper_sale_end, null);
        assert.equal(config.reveal_deadline, null);
        assert.equal(config.open_deadline, null);
        assert.equal(config.reveal_commitment, null);
        const reveal = ravioliPublicRevealPin(this.input.pins, this.input.mirror.routerAddress, mirror.nextTokenId);
        assert.equal(decodedUri(config.contents_uri), reveal.proof.uri, "deterministic Ravioli pack must publish its portable open-kit reveal");
      }
      const manifestUri = decodedUri(config.manifest_uri);
      const manifestPin = this.input.pins.find((pin) => pin.proof.uri === manifestUri);
      assert.equal(manifestPin?.proof.fileName, "ravioli-pack-manifest.json", "Ravioli immutable manifest URI must bind the exact current-run manifest pin");
      assert.ok(value.token_info instanceof MichelsonMap);
      assert.match(hexToUtf8(String(value.token_info.get(""))), /^ipfs:\/\//);
      return;
    }
    if (entrypoint === "commit_recipe") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "commit token id");
      const spec = proofPackSpec(tokenId);
      assert.ok(spec);
      assert.match(String(value.nonce_commitment), /^[0-9a-f]{64}$/);
      assert.ok(Array.isArray(value.reservations));
      assertPayloadPolicy(value.reservations, tokenId, false);
      return;
    }
    if (entrypoint === "finalize_pack") {
      const tokenId = asSafeInteger(payload, "finalize token id");
      assert.equal(tokenId, 0, "blind Ravioli products must use atomic finalize_blind_pack");
      assert.equal(this.input.mirror.packs.get(tokenId)?.committed_recipes, proofPackSpec(tokenId)?.editions);
      return;
    }
    if (entrypoint === "finalize_blind_pack") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "atomic blind token id");
      const spec = proofPackSpec(tokenId);
      assert.ok(tokenId > 0 && spec?.blind, "only a configured blind pack may use atomic blind issuance");
      assert.equal(this.input.mirror.packs.get(tokenId)?.committed_recipes, spec.editions);
      const sale = value.sale as JsonObject;
      assert.equal(sale.active, true);
      assert.equal(sale.seller, administrator);
      assert.equal(sale.treasury, administrator);
      assert.equal(Number(sale.price), spec.priceMutez);
      assert.equal(Number(sale.remaining), spec.editions);
      assert.equal(sale.start, null);
      const pack = this.input.mirror.packs.get(tokenId);
      assert.ok(
        typeof sale.end === "string" && Number.isFinite(Date.parse(sale.end)),
        "every blind Ravioli primary sale must be finite",
      );
      assert.ok(
        pack?.reveal_deadline &&
          Date.parse(sale.end) < Date.parse(pack.reveal_deadline),
        "every blind Ravioli sale must end before reveal",
      );
      if (pack.child_expiry) {
        assert.equal(
          sale.end,
          pack.wrapper_sale_end,
          "a Ravioli wrapper containing a timed LE child must use its immutable LE sale end",
        );
      } else {
        assert.equal(
          pack.wrapper_sale_end,
          null,
          "a non-LE child pack must not forge an inherited child-expiry wrapper constraint",
        );
      }
      return;
    }
    if (entrypoint === "mint") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "mint token id");
      assert.equal(tokenId, 0, "blind wrapper supply must be issued atomically with its sale");
      assert.equal(value.to_, administrator);
      assert.equal(asSafeInteger(value.amount, "mint amount"), proofPackSpec(tokenId)?.editions);
      return;
    }
    if (entrypoint === "set_sale") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "sale token id");
      assert.equal(tokenId, 0, "blind wrapper sale must be issued atomically");
      const sale = value.sale as JsonObject;
      assert.equal(sale.active, true);
      assert.equal(sale.seller, administrator);
      assert.equal(sale.treasury, administrator);
      assert.equal(Number(sale.price), proofPackSpec(tokenId)?.priceMutez);
      assert.equal(Number(sale.remaining), proofPackSpec(tokenId)?.editions);
      assert.equal(sale.start, null);
      assert.equal(sale.end, null);
      return;
    }
    if (entrypoint === "set_pack_contents") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "contents token id");
      const kit = mirror.kits.get(tokenId);
      assert.ok(kit && tokenId > 0);
      const reveal = ravioliContentsEvidencePin(this.input.pins, mirror.routerAddress, tokenId, kit);
      assert.equal(hexToUtf8(String(value.contents_uri)), reveal.proof.uri);
      return;
    }
    if (entrypoint === "recover_adapter") {
      const value = payload as JsonObject;
      const tokenId = asSafeInteger(value.token_id, "adapter recovery token id");
      const adapter = String(value.adapter || "");
      const kind = asSafeInteger(value.kind, "adapter recovery kind");
      const resourceId = asSafeInteger(
        value.resource_id,
        "adapter recovery resource id",
      );
      const capacity = asSafeInteger(
        value.capacity,
        "adapter recovery capacity",
      );
      assert.equal(
        tokenId,
        PACK_SPECS.length,
        "only the cancelled withheld-reveal fixture may recover unused capacity",
      );
      assert.equal(
        mirror.packs.get(tokenId)?.cancelled,
        true,
        "Ravioli adapter capacity is recoverable only after cancellation",
      );
      assert.equal(adapter, mirror.gnocchiAdapterAddress);
      assert.equal(kind, 1);
      assert.equal(resourceId, 2);
      assert.equal(capacity, 2);
      assert.equal(
        mirror.adapterAllowances.get(
          `${tokenId}:${adapter}:${kind}:${resourceId}`,
        ),
        capacity,
        "Ravioli router adapter allowance changed before recovery",
      );
      assert.equal(
        mirror.adapterReservations.get(
          `${adapter}:${tokenId}:${resourceId}`,
        ),
        capacity,
        "Ravioli Gnocchi adapter reservation changed before recovery",
      );
      return;
    }
    assert.fail(`unexpected creator entrypoint ${entrypoint}`);
  }

  validateCollectorCall(signer: string, { contractAddress, entrypoint, payload }: { contractAddress: string; entrypoint: string; payload: unknown }): void {
    if (contractAddress === this.input.mirror.blindControllerAddress) {
      assert.equal(entrypoint, "withdraw_refund");
      const withdrawal = payload as JsonObject;
      assert.equal(validateAddress(String(withdrawal.destination || "")), ValidationResult.VALID);
      const amount = asSafeInteger(withdrawal.amount, "refund withdrawal amount");
      assert.ok(amount > 0);
      assert.equal(
        amount,
        this.input.mirror.refundCredits.get(signer),
        "refund withdrawal must pull the credited holder's complete mirrored balance",
      );
      return;
    }
    assert.equal(contractAddress, this.input.mirror.routerAddress);
    if (entrypoint === "transfer") {
      assert.ok(Array.isArray(payload) && payload.length === 1);
      const source = payload[0] as JsonObject;
      assert.equal(source.from_, signer);
      assert.ok(Array.isArray(source.txs) && source.txs.length === 1);
      const transfer = source.txs[0] as JsonObject;
      const tokenId = asSafeInteger(transfer.token_id, "transfer token id");
      assert.ok(proofPackSpec(tokenId)?.blind);
      assert.equal(asSafeInteger(transfer.amount, "transfer amount"), 1);
      assert.equal(validateAddress(String(transfer.to_ || "")), ValidationResult.VALID);
      assert.notEqual(transfer.to_, signer);
      return;
    }
    if (entrypoint === "cancel_unrevealed_pack") {
      const tokenId = asSafeInteger(payload, "cancel unrevealed token id");
      assert.equal(tokenId, PACK_SPECS.length, "only the withheld-reveal probe may be permissionlessly cancelled");
      const sale = this.input.mirror.sales.get(tokenId);
      assert.ok(sale, "withheld pack sale is missing");
      assert.equal(
        this.input.mirror.outstandingBlindClaimCount(tokenId),
        0,
        "withheld pack cannot close before every purchased claim is refunded",
      );
      assert.equal(
        this.input.mirror.totalSupply.get(tokenId),
        sale.remaining,
        "only unsold seller wrappers may remain at cancellation",
      );
      assert.equal(
        this.input.mirror.ledger.get(`${sale.seller}:${tokenId}`) || 0,
        sale.remaining,
        "seller must hold every unsold wrapper at cancellation",
      );
      return;
    }
    const value = payload as JsonObject;
    const tokenId = asSafeInteger(value.token_id, `${entrypoint} token id`);
    assert.ok(proofPackSpec(tokenId));
    if (entrypoint === "buy") {
      assert.equal(asSafeInteger(value.amount, "buy amount"), 1);
      return;
    }
    if (entrypoint === "refund_blind_claims") {
      assert.equal(asSafeInteger(value.amount, "refund amount"), 1);
      assert.equal(validateAddress(String(value.holder || "")), ValidationResult.VALID);
      assert.ok(asSafeInteger(value.expected_claim_id, "refund claim id") >= 0);
      return;
    }
    assert.equal(entrypoint, "open_pack");
    const kit = this.input.mirror.kits.get(tokenId);
    assert.ok(kit, "collector open requires the creator-issued v3 kit captured from the real UI");
    const blindClaim = this.input.mirror.packs.get(tokenId)?.blind
      ? this.input.mirror.resolveBlindClaim(signer, tokenId)
      : null;
    const serial = blindClaim?.serial
      ?? this.input.mirror.opened.get(tokenId)
      ?? 0;
    const recipe = kit.recipes[serial];
    assert.ok(recipe);
    assert.equal(
      value.expected_claim_id ?? null,
      blindClaim?.expectedClaimId ?? null,
      "Ravioli open claim id changed before submission",
    );
    assert.equal(value.nonce, recipe.nonce);
    assert.ok(Array.isArray(value.actions));
    assertPayloadPolicy(value.actions, tokenId, true);
    assert.ok((this.input.mirror.ledger.get(`${signer}:${tokenId}`) || 0) >= 1, "opening signer must hold a wrapper");
  }
}

export function createRavioliMirroredSessionHandler(input: {
  session: TaquitoPastaUiLiveSession;
  mirror: RavioliUiStateMirror;
  policy: RavioliUiLivePolicy;
  signerAddress: string;
}): (request: PastaUiLiveBridgeRequest) => Promise<unknown> {
  return async (request) => {
    if (request.action === "batch") {
      throw new PastaUiLiveBridgeError("Ravioli proof forbids batch submissions so each signer boundary is independently journaled", 403);
    }
    const decoded = decodePastaUiLiveValue(request.payload) as JsonObject;
    const response = await input.session.handle(request) as JsonObject;
    if (request.action === "originate") {
      const kind = input.policy.consumeOriginationKind();
      input.mirror.bindOrigination(kind, String(response.contractAddress));
    } else if (request.action === "call") {
      const call = decoded.call as JsonObject;
      input.mirror.applySuccessfulCall(String(call.contractAddress), String(call.entrypoint), call.payload, input.signerAddress);
    }
    return response;
  };
}

function fundingAuthorization(input: {
  balanceMutez: number;
  requiredBalanceMutez: number;
  estimatedOriginationMutez?: number;
  operationReserveMutez: number;
}): PastaUiLiveFundingAuthorization {
  return {
    balanceMutez: input.balanceMutez,
    requiredBalanceMutez: input.requiredBalanceMutez,
    estimatedOriginationMutez: input.estimatedOriginationMutez || 0,
    operationReserveMutez: input.operationReserveMutez,
  };
}

async function readArtifacts(): Promise<{
  blindController: unknown[];
  router: unknown[];
  rotiniTarget: unknown[];
  gnocchiAdapter: unknown[];
  rotiniAdapter: unknown[];
  deploymentCertificate: JsonObject;
  deploymentCertificateSha256: string;
}> {
  const [
    routerBytes,
    blindControllerBytes,
    gnocchiAdapterBytes,
    rotiniAdapterBytes,
    rotiniTargetBytes,
    certificateBytes,
    routerSourceBytes,
    controllerSourceBytes,
    gnocchiAdapterSourceBytes,
    rotiniAdapterSourceBytes,
  ] = await Promise.all([
    readFile(ARTIFACT_PATHS.router),
    readFile(ARTIFACT_PATHS.blindController),
    readFile(ARTIFACT_PATHS.gnocchiAdapter),
    readFile(ARTIFACT_PATHS.rotiniAdapter),
    readFile(ARTIFACT_PATHS.rotiniTarget),
    readFile(RAVIOLI_DEPLOYMENT_CERTIFICATE_PATH),
    readFile(RAVIOLI_FROZEN_DEPLOYMENT.router.sourcePath),
    readFile(RAVIOLI_FROZEN_DEPLOYMENT.blindController.sourcePath),
    readFile(RAVIOLI_FROZEN_DEPLOYMENT.gnocchiAdapter.sourcePath),
    readFile(RAVIOLI_FROZEN_DEPLOYMENT.rotiniAdapter.sourcePath),
  ]);
  assert.equal(
    sha256(certificateBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.certificateSha256,
    "Ravioli deployment certificate differs from the fully tested frozen release",
  );
  assert.equal(
    sha256(routerBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.router.artifactSha256,
    "Ravioli router artifact differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(blindControllerBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.blindController.artifactSha256,
    "Ravioli blind-controller artifact differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(gnocchiAdapterBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.gnocchiAdapter.artifactSha256,
    "Ravioli Gnocchi-adapter artifact differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(rotiniAdapterBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.rotiniAdapter.artifactSha256,
    "Ravioli Rotini-adapter artifact differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(rotiniTargetBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.rotiniTarget.artifactSha256,
    "Ravioli active Rotini dependency artifact differs from the current recipient-independent release",
  );
  assert.equal(
    sha256(routerSourceBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.router.sourceSha256,
    "Ravioli router source differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(controllerSourceBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.blindController.sourceSha256,
    "Ravioli blind-controller source differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(gnocchiAdapterSourceBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.gnocchiAdapter.sourceSha256,
    "Ravioli Gnocchi-adapter source differs from its frozen deployment certificate",
  );
  assert.equal(
    sha256(rotiniAdapterSourceBytes),
    RAVIOLI_FROZEN_DEPLOYMENT.rotiniAdapter.sourceSha256,
    "Ravioli Rotini-adapter source differs from its frozen deployment certificate",
  );
  const [
    router,
    blindController,
    gnocchiAdapter,
    rotiniAdapter,
    rotiniTarget,
    deploymentCertificate,
  ] = [
    routerBytes,
    blindControllerBytes,
    gnocchiAdapterBytes,
    rotiniAdapterBytes,
    rotiniTargetBytes,
    certificateBytes,
  ].map((bytes) => JSON.parse(bytes.toString("utf8")));
  [router, blindController, gnocchiAdapter, rotiniAdapter, rotiniTarget].forEach((entry) =>
    assert.ok(Array.isArray(entry))
  );
  assert.equal(deploymentCertificate.schema, "pasta-ravioli-deployment-certificate@2");
  assert.equal(
    deploymentCertificate.maxOperationDataLength,
    RAVIOLI_FROZEN_DEPLOYMENT.maxOperationDataLength,
  );
  assert.equal(
    deploymentCertificate.minimumHeadroomBytes,
    RAVIOLI_FROZEN_DEPLOYMENT.minimumHeadroomBytes,
  );
  assert.equal(
    deploymentCertificate.certifiedMetadataUriMaxBytes,
    RAVIOLI_FROZEN_DEPLOYMENT.certifiedMetadataUriMaxBytes,
  );
  for (const role of [
    "router",
    "blindController",
    "gnocchiAdapter",
    "rotiniAdapter",
  ] as const) {
    const certified = deploymentCertificate.artifacts?.[role] as JsonObject;
    const frozen = RAVIOLI_FROZEN_DEPLOYMENT[role];
    assert.equal(certified.sha256, frozen.artifactSha256);
    assert.equal(certified.sourceSha256, frozen.sourceSha256);
    assert.equal(
      certified.canonicalMichelsonCodeSha256,
      frozen.canonicalMichelsonCodeSha256,
    );
    assert.equal(certified.signedOriginationBytes, frozen.signedOriginationBytes);
    assert.equal(certified.headroomBytes, frozen.headroomBytes);
    assert.equal(
      Number(certified.signedOriginationBytes) + Number(certified.headroomBytes),
      RAVIOLI_FROZEN_DEPLOYMENT.maxOperationDataLength,
      `Ravioli ${role} certificate size arithmetic drift`,
    );
    assert.ok(
      Number(certified.headroomBytes) >=
        RAVIOLI_FROZEN_DEPLOYMENT.minimumHeadroomBytes,
      `Ravioli ${role} no longer has the certified minimum origination headroom`,
    );
  }
  for (const [role, artifact] of [
    ["router", router],
    ["blindController", blindController],
    ["gnocchiAdapter", gnocchiAdapter],
    ["rotiniAdapter", rotiniAdapter],
  ] as const) {
    assert.equal(
      hashMichelsonScriptCode(artifact),
      RAVIOLI_FROZEN_DEPLOYMENT[role].canonicalMichelsonCodeSha256,
      `Ravioli ${role} canonical Michelson identity differs from its frozen deployment certificate`,
    );
  }
  return {
    router,
    blindController,
    gnocchiAdapter,
    rotiniAdapter,
    rotiniTarget,
    deploymentCertificate,
    deploymentCertificateSha256: RAVIOLI_FROZEN_DEPLOYMENT.certificateSha256,
  };
}

async function openStudioPage(
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>,
  privateRecovery?: RavioliPrivateRecoveryRestoration,
): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  if (privateRecovery) {
    await installRavioliPrivateRecoveryRestoration(page, privateRecovery);
  }
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${bridge.origin}${APP_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, bridge, "UI-LIVE");
  return { browser, context, page, monitor };
}

async function openBuyerPage(input: {
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  config: JsonObject;
}): Promise<ActorPage> {
  const browser = await chromium.launch({ headless: process.env.PASTA_UI_LIVE_HEADFUL !== "1" });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    (window as any).__pastaInitialLocalStorageKeys = Object.keys(localStorage);
  });
  const proxySource = buildPastaUiLiveProxyInstallerSource(input.bridge.origin, input.bridge.sessionToken, "UI-LIVE");
  const siteSource = await readFile(SITE_SOURCE_PATH, "utf8");
  await context.route("**/pasta.config.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: `window.PASTA_SITE_CONFIG = ${JSON.stringify(input.config)};\n` });
  });
  await context.route("**/js/site.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: `${proxySource}\n${siteSource}` });
  });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  try {
    await waitForRavioliBuyerPageReady({
      page,
      monitor,
      url: `${input.bridge.origin}${SITE_PATH}`,
    });
    await page.selectOption("#pinProvider", "node");
    await page.fill("#pinNode", process.env.PASTA_SHADOWNET_IPFS_API_URL || "http://127.0.0.1:5001");
    return { browser, context, page, monitor };
  } catch (error) {
    return rethrowAfterClosingRavioliBuyerPage({ browser, monitor, error });
  }
}

type RavioliBuyerReadinessSnapshot = {
  status: string;
  statusIsError: boolean;
  bridgeInstalled: boolean;
  fatalEvents: readonly { kind: string; message: string }[];
};

async function ravioliBuyerReadinessSnapshot(
  page: Page,
  monitor: PastaProofPageMonitor,
): Promise<RavioliBuyerReadinessSnapshot> {
  let browserState: Omit<RavioliBuyerReadinessSnapshot, "fatalEvents">;
  try {
    browserState = await page.evaluate(() => {
      const status = document.getElementById("status");
      return {
        status: status?.textContent?.trim() || "(status unavailable)",
        statusIsError: status?.dataset.error === "true",
        bridgeInstalled: Boolean((window as any).__pastaUiLiveBridge?.installed),
      };
    });
  } catch (error) {
    browserState = {
      status: `page state unavailable (${error instanceof Error ? error.message : String(error)})`,
      statusIsError: true,
      bridgeInstalled: false,
    };
  }
  return { ...browserState, fatalEvents: monitor.list() };
}

export async function waitForRavioliBuyerPageReady(input: {
  page: Page;
  monitor: PastaProofPageMonitor;
  url: string;
  policy?: {
    maxAttempts: number;
    attemptTimeoutMs: number;
    retryDelayMs: number;
  };
}): Promise<{ attempts: number }> {
  const policy = input.policy ?? RAVIOLI_BUYER_READINESS_POLICY;
  assert.ok(
    Number.isSafeInteger(policy.maxAttempts) && policy.maxAttempts >= 1 && policy.maxAttempts <= 5,
    "Ravioli buyer readiness attempts must be between one and five",
  );
  assert.ok(
    Number.isSafeInteger(policy.attemptTimeoutMs)
      && policy.attemptTimeoutMs >= 1
      && policy.attemptTimeoutMs <= 120_000,
    "Ravioli buyer readiness timeout must be between one millisecond and two minutes",
  );
  assert.ok(
    Number.isSafeInteger(policy.retryDelayMs)
      && policy.retryDelayMs >= 0
      && policy.retryDelayMs <= 30_000,
    "Ravioli buyer readiness delay must be between zero and thirty seconds",
  );
  const failures: Error[] = [];
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (attempt > 1) {
      // Retrying is safe only because this happens before wallet connection,
      // pin-provider use, or any signer-capable buyer action.
      input.monitor.reset();
      await input.page.waitForTimeout(policy.retryDelayMs);
    }
    try {
      await input.page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: policy.attemptTimeoutMs,
      });
      await input.page.waitForFunction(
        () => Boolean((window as any).__pastaUiLiveBridge?.installed),
        undefined,
        { timeout: policy.attemptTimeoutMs },
      );
      await input.page.locator("#status").waitFor({
        state: "visible",
        timeout: policy.attemptTimeoutMs,
      });
      await input.page.waitForFunction(() => {
        const status = document.getElementById("status");
        return status?.textContent?.includes("On-chain state loaded.")
          || status?.dataset.error === "true";
      }, undefined, { timeout: policy.attemptTimeoutMs });
      const snapshot = await ravioliBuyerReadinessSnapshot(input.page, input.monitor);
      if (
        snapshot.bridgeInstalled
        && !snapshot.statusIsError
        && snapshot.status.includes("On-chain state loaded.")
      ) {
        return { attempts: attempt };
      }
      throw new Error(
        `buyer page reported ${JSON.stringify(snapshot.status)}`
        + ` (bridge=${snapshot.bridgeInstalled}, browserEvents=${JSON.stringify(snapshot.fatalEvents)})`,
      );
    } catch (error) {
      const snapshot = await ravioliBuyerReadinessSnapshot(input.page, input.monitor);
      failures.push(new Error(
        `Ravioli buyer read-only readiness attempt ${attempt}/${policy.maxAttempts} failed: `
        + `${error instanceof Error ? error.message : String(error)}; `
        + `status=${JSON.stringify(snapshot.status)}; bridge=${snapshot.bridgeInstalled}; `
        + `browserEvents=${JSON.stringify(snapshot.fatalEvents)}`,
        { cause: error },
      ));
    }
  }
  throw new AggregateError(
    failures,
    `Ravioli buyer page did not become read-only ready after ${policy.maxAttempts} attempts`,
  );
}

export async function rethrowAfterClosingRavioliBuyerPage(input: {
  browser: { close(): Promise<void> };
  monitor: { dispose(): void };
  error: unknown;
}): Promise<never> {
  input.monitor.dispose();
  try {
    await input.browser.close();
  } catch (closeError) {
    throw new AggregateError(
      [input.error, closeError],
      "Ravioli buyer initialization failed and its private browser also failed to close",
    );
  }
  throw input.error;
}

async function closeActor(actor: ActorPage | null): Promise<void> {
  if (!actor) return;
  actor.monitor.dispose();
  await actor.browser.close();
}

async function waitForText(page: Page, selector: string, expected: string, timeout = 300_000): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    ({ selector: selected, expected: value }) => document.querySelector(selected)?.textContent?.includes(value),
    { selector, expected },
    { timeout },
  );
}

async function waitForLog(page: Page, expected: string, timeout = 300_000): Promise<void> {
  return waitForText(page, "#log", expected, timeout);
}

async function captureStage(input: {
  actor: ActorPage;
  outputRoot: string;
  ordinal: number;
  capability: string;
  stageName: string;
  focusSelector: string;
  evidence: RequiredDomEvidence[];
}): Promise<CapturePastaProofStageResult> {
  await input.actor.page.locator(input.focusSelector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({
    page: input.actor.page,
    monitor: input.actor.monitor,
    outputRoot: input.outputRoot,
    app: "ravioli",
    capability: input.capability,
    stageOrdinal: input.ordinal,
    stageName: input.stageName,
    classification: "UI-LIVE",
    requiredEvidence: input.evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

function recipeMatrix(
  mode: number,
  dependencies: DependencyEvidence,
  editions: number,
): JsonObject[][] {
  assert.ok(Number.isSafeInteger(editions) && editions > 0, "Ravioli recipe edition count is invalid");
  const escrow = (tokenId: number): JsonObject => ({
    kind: "escrow",
    fa2: dependencies.gnocchi.address,
    tokenId,
    amount: 1,
    name: `Same-run Gnocchi token ${tokenId}`,
    uri: dependencies.gnocchi.tokenMetadataUris[tokenId],
    mimeType: "application/json",
  });
  const allocated = (): JsonObject => ({ kind: "allocated", amount: 1, name: "Reserved Gnocchi mint" });
  const generative = (): JsonObject => ({ kind: "generative", amount: 1, name: "Generated-at-open Rotini iteration" });
  if (mode === 0) {
    assert.equal(editions, 1, "Ravioli deterministic proof must publish one edition");
    return [[escrow(0)]];
  }
  if (mode === 1) {
    return Array.from({ length: editions }, (_, serial) => [escrow(serial === 0 ? 0 : 1)]);
  }
  if (mode === 2) {
    return Array.from({ length: editions }, () => [allocated()]);
  }
  assert.equal(editions, 1, "Ravioli generative and hybrid proof products must publish one edition");
  if (mode === 3) return [[generative(), generative()]];
  return [[escrow(1), allocated(), generative()]];
}

async function configureStudioBase(page: Page, kuboApiUrl: string, dependencies: DependencyEvidence): Promise<void> {
  await page.selectOption("#network", "shadownet");
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", kuboApiUrl);
  await page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
  await page.fill("#collSymbol", "RVUI");
  await page.locator("#adapterSetup > summary").click();
  await page.check("#autoAdapters");
  await page.fill("#gTargetKt", dependencies.gnocchi.address);
  await page.fill("#gTokenId", String(dependencies.gnocchi.allocationTokenId));
  await page.fill("#rTargetKt", dependencies.rotini.address);
  await page.fill("#rProjectId", String(dependencies.rotini.projectId));
}

export async function installRavioliCurrentV2NonceOverride(
  page: Page,
  nonce = RAVIOLI_CURRENT_V2_MODE0_NONCE,
): Promise<void> {
  assert.match(nonce, /^[0-9a-f]{64}$/, "Ravioli current-v2 recovery nonce is invalid");
  const script = await page.addScriptTag({
    content: `(() => {
      const nonceHex = ${JSON.stringify(nonce)};
      if (window.__ravioliCurrentV2NonceOverride) {
        throw new Error("Ravioli current-v2 nonce override is already installed");
      }
      if (Object.prototype.hasOwnProperty.call(crypto, "getRandomValues")) {
        throw new Error("Ravioli current-v2 refuses to stack over an existing entropy override");
      }
      const original = crypto.getRandomValues.bind(crypto);
      const bytes = Uint8Array.from(nonceHex.match(/../g).map((part) => Number.parseInt(part, 16)));
      const state = { consumed: false, nonce: nonceHex, restored: false };
      window.__ravioliCurrentV2NonceOverride = state;
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value(array) {
          if (!state.consumed && array instanceof Uint8Array && array.byteLength === bytes.byteLength) {
            array.set(bytes);
            state.consumed = true;
            delete crypto.getRandomValues;
            state.restored = !Object.prototype.hasOwnProperty.call(crypto, "getRandomValues");
            return array;
          }
          return original(array);
        },
      });
    })();`,
  });
  await script.evaluate((element) => element.parentNode?.removeChild(element));
}

export async function assertRavioliCurrentV2NonceOverrideConsumed(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const scope = window as typeof window & {
      __ravioliCurrentV2NonceOverride?: {
        consumed: boolean;
        nonce: string;
        restored: boolean;
      };
    };
    const value = scope.__ravioliCurrentV2NonceOverride;
    return {
      consumed: value?.consumed === true,
      nonce: value?.nonce || "",
      restored: value?.restored === true,
      hasOwnOverride: Object.prototype.hasOwnProperty.call(crypto, "getRandomValues"),
    };
  });
  assert.deepEqual(state, {
    consumed: true,
    nonce: RAVIOLI_CURRENT_V2_MODE0_NONCE,
    restored: true,
    hasOwnOverride: false,
  }, "Ravioli current-v2 nonce override was not consumed and removed exactly once");
  await page.evaluate(() => {
    delete (window as typeof window & { __ravioliCurrentV2NonceOverride?: unknown })
      .__ravioliCurrentV2NonceOverride;
  });
}

async function connectStudio(page: Page, creatorAddress: string): Promise<void> {
  await page.click("#btnConnect");
  await waitForLog(page, `connected ${creatorAddress} on shadownet`);
}

export async function configureRavioliPackMode(page: Page, mode: number): Promise<void> {
  assert.ok(Number.isSafeInteger(mode) && mode >= 0 && mode < MODE_NAMES.length, "Ravioli pack mode is invalid");
  await page.selectOption("#bnMode", String(mode));
  await page.locator("#bnMystery").setChecked(mode > 0);
  assert.equal(await page.inputValue("#bnMode"), String(mode));
  assert.equal(await page.locator("#bnMystery").isChecked(), mode > 0, "Ravioli mystery control leaked across pack modes");
}

export type RavioliBlindDeadlines = {
  saleEnd: string;
  revealDeadline: string;
  openDeadline: string;
};

export type RavioliBlindDeadlinePolicyInput =
  | {
      kind: "non-limited";
      nowMs: number;
      saleWindowMs: number;
      revealAfterSaleMs: number;
      openAfterSaleMs: number;
    }
  | {
      kind: "limited-child";
      nowMs: number;
      wrapperMaxSupply: number;
      wrapperSaleEnd: string;
      childExpiry: string;
      minimumSaleRunwayMs?: number;
    }
  | {
      kind: "withheld-reveal-test-fixture";
      nowMs: number;
    };

export function buildRavioliBlindDeadlines(
  input: RavioliBlindDeadlinePolicyInput,
): RavioliBlindDeadlines {
  assert.ok(
    Number.isSafeInteger(input.nowMs) && input.nowMs >= 0,
    "Ravioli deadline policy requires a valid current time",
  );
  let saleEndMs: number;
  let revealDeadlineMs: number;
  let openDeadlineMs: number;
  if (input.kind === "limited-child") {
    assert.ok(
      Number.isSafeInteger(input.wrapperMaxSupply)
        && input.wrapperMaxSupply > 0
        && input.wrapperMaxSupply <= 64,
      "Ravioli LE child requires a finite wrapper supply between 1 and 64",
    );
    saleEndMs = Date.parse(input.wrapperSaleEnd);
    const childExpiryMs = Date.parse(input.childExpiry);
    assert.ok(Number.isFinite(saleEndMs), "Ravioli LE wrapper sale end is invalid");
    assert.ok(Number.isFinite(childExpiryMs), "Ravioli LE child expiry is invalid");
    assert.ok(saleEndMs > input.nowMs, "Ravioli LE wrapper sale must end in the future");
    const minimumSaleRunwayMs = input.minimumSaleRunwayMs ?? 0;
    assert.ok(
      Number.isSafeInteger(minimumSaleRunwayMs) && minimumSaleRunwayMs >= 0,
      "Ravioli LE minimum sale runway is invalid",
    );
    assert.ok(
      saleEndMs - input.nowMs >= minimumSaleRunwayMs,
      `Ravioli LE wrapper sale has only ${Math.max(0, saleEndMs - input.nowMs)}ms of green-run runway; `
        + `${minimumSaleRunwayMs}ms is required`,
    );
    assert.ok(
      saleEndMs < childExpiryMs,
      "Ravioli wrapper sale must end before its LE child expiry",
    );
    revealDeadlineMs = saleEndMs + Math.floor((childExpiryMs - saleEndMs) / 2);
    assert.ok(
      revealDeadlineMs > saleEndMs && revealDeadlineMs <= childExpiryMs,
      "Ravioli LE reveal deadline must follow its sale and not outlive its child",
    );
    openDeadlineMs = childExpiryMs + PASTA_DATETIME_LOCAL_RESOLUTION_MS;
  } else if (input.kind === "withheld-reveal-test-fixture") {
    // This deliberately short path belongs only to the token-5 negative fixture.
    // Sale/reveal timing is evidence-derived; its open deadline remains at the
    // maximum finite horizon so this tests withheld reveal rather than an
    // accidentally expired holder opening window.
    saleEndMs = input.nowMs + RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_SALE_WINDOW_MS;
    revealDeadlineMs = input.nowMs
      + RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_REVEAL_WINDOW_MS;
    openDeadlineMs = PASTA_RFC3339_FOUR_DIGIT_CEILING_MS;
  } else {
    assert.ok(
      Number.isSafeInteger(input.saleWindowMs) && input.saleWindowMs > 0,
      "Ravioli non-LE sale window is invalid",
    );
    assert.ok(
      Number.isSafeInteger(input.revealAfterSaleMs) && input.revealAfterSaleMs > 0,
      "Ravioli non-LE reveal window is invalid",
    );
    assert.ok(
      Number.isSafeInteger(input.openAfterSaleMs) && input.openAfterSaleMs > 0,
      "Ravioli non-LE open window is invalid",
    );
    saleEndMs = input.nowMs + input.saleWindowMs;
    revealDeadlineMs = saleEndMs + input.revealAfterSaleMs;
    openDeadlineMs = saleEndMs + input.openAfterSaleMs;
  }
  assert.ok(Number.isFinite(saleEndMs), "Ravioli sale deadline is invalid");
  assert.ok(Number.isFinite(revealDeadlineMs), "Ravioli reveal deadline is invalid");
  assert.ok(Number.isFinite(openDeadlineMs), "Ravioli open deadline is invalid");
  assert.ok(saleEndMs > input.nowMs, "Ravioli sale deadline must be in the future");
  assert.ok(
    saleEndMs < revealDeadlineMs,
    "Ravioli reveal deadline must follow its sale deadline",
  );
  assert.ok(
    revealDeadlineMs < openDeadlineMs,
    "Ravioli open deadline must follow its reveal deadline",
  );
  assert.ok(
    openDeadlineMs <= PASTA_RFC3339_FOUR_DIGIT_CEILING_MS,
    "Ravioli open deadline exceeds the interoperable finite horizon",
  );
  return Object.freeze({
    saleEnd: new Date(saleEndMs).toISOString(),
    revealDeadline: new Date(revealDeadlineMs).toISOString(),
    openDeadline: new Date(openDeadlineMs).toISOString(),
  });
}

function datetimeLocalUtc(iso: string): string {
  const millis = Date.parse(iso);
  assert.ok(Number.isFinite(millis), `invalid Ravioli deadline ${iso}`);
  return new Date(millis).toISOString().slice(0, 16);
}

export function defaultRavioliBlindDeadlines(
  tokenId: number,
  dependencies: DependencyEvidence,
  nowMs = Date.now(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): RavioliBlindDeadlines {
  const greenPolicy = resolveRavioliGreenDeadlinePolicy(env, nowMs);
  if (tokenId === 2) {
    return buildRavioliBlindDeadlines({
      kind: "limited-child",
      nowMs,
      wrapperMaxSupply: PACK_SPECS[tokenId].editions,
      wrapperSaleEnd:
        dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd,
      childExpiry: dependencies.gnocchi.limitedEdition.receipt.token.end,
      minimumSaleRunwayMs: RAVIOLI_PREBUY_MIN_REMAINING_MS,
    });
  }
  return buildRavioliBlindDeadlines({
    kind: "non-limited",
    nowMs,
    ...greenPolicy,
  });
}

async function configurePack(
  page: Page,
  mode: number,
  routerAddress: string,
  dependencies: DependencyEvidence,
  options: {
    tokenId?: number;
    deadlines?: RavioliBlindDeadlines;
    titleSuffix?: string;
  } = {},
): Promise<RavioliBlindDeadlines | null> {
  const tokenId = options.tokenId ?? mode;
  const spec = proofPackSpec(tokenId);
  assert.ok(spec && spec.mode === mode, `Ravioli token ${tokenId} does not match pack mode ${mode}`);
  const title = [
    "Known Vault",
    "Blind Funded Pool",
    "Reserved Allocation",
    "Generated At Open",
    "Hybrid Three Primitive Pack",
  ][mode] + (options.titleSuffix ? ` ${options.titleSuffix}` : "");
  await configureRavioliPackMode(page, mode);
  await page.fill("#bnEditions", String(spec.editions));
  await page.fill("#bnName", `Ravioli UI-LIVE ${title}`);
  await page.fill("#bnDesc", `Actual Shadownet UI proof for ${MODE_NAMES[mode]}.`);
  await page.fill("#bnTags", `ravioli, ${MODE_NAMES[mode]}, ui-live, shadownet`);
  if (await page.locator("#bnForSale").isDisabled()) {
    assert.equal(
      await page.locator("#bnForSale").isChecked(),
      true,
      "blind Ravioli mode must force its finite primary sale on",
    );
  } else {
    await page.check("#bnForSale");
  }
  await page.fill("#bnPrice", String(spec.priceMutez / 1_000_000));
  if (await page.locator("#bnSaleCount").isDisabled()) {
    assert.equal(
      await page.inputValue("#bnSaleCount"),
      String(spec.editions),
      "blind Ravioli mode must force sale quantity to its complete finite wrapper supply",
    );
  } else {
    await page.fill("#bnSaleCount", String(spec.editions));
  }
  await page.fill("#bnSaleStart", "");
  const deadlines = mode === 0
    ? null
    : options.deadlines || defaultRavioliBlindDeadlines(tokenId, dependencies);
  await page.fill("#bnSaleEnd", deadlines ? datetimeLocalUtc(deadlines.saleEnd) : "");
  for (const [selector, value] of [
    ["#bnRevealDeadline", deadlines ? datetimeLocalUtc(deadlines.revealDeadline) : ""],
    ["#bnOpenDeadline", deadlines ? datetimeLocalUtc(deadlines.openDeadline) : ""],
  ] as const) {
    if (await page.locator(selector).isDisabled()) {
      assert.equal(
        await page.inputValue(selector),
        value,
        `${selector} must remain empty outside blind Ravioli modes`,
      );
    } else {
      await page.fill(selector, value);
    }
  }
  if (tokenId === 2) await page.fill("#gTokenId", String(dependencies.gnocchi.limitedAllocationTokenId));
  if (tokenId === PACK_SPECS.length) {
    await page.fill("#gTokenId", String(dependencies.gnocchi.allocationTokenId));
  }
  if (mode === 4) await page.fill("#gTokenId", String(dependencies.gnocchi.allocationTokenId));
  if (!(await page.locator("#recipeJson").isVisible())) {
    await page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
  }
  await page.fill("#recipeJson", JSON.stringify(recipeMatrix(mode, dependencies, spec.editions)));
  await page.setInputFiles("#bnArtifact", {
    name: `ravioli-wrapper-${tokenId}.png`,
    mimeType: "image/png",
    buffer: Buffer.concat([PNG_BYTES, Buffer.from(`ravioli-ui-live-wrapper-${tokenId}`)]),
  });
  if (tokenId === 0) {
    await page.check('input[name="target"][value="new_collection"]');
  } else {
    await page.check('input[name="target"][value="existing_contract"]');
    await page.fill("#existingKt", routerAddress);
  }
  assert.equal(await page.inputValue("#bnMode"), String(mode));
  assert.equal(await page.inputValue("#bnEditions"), String(spec.editions));
  return deadlines;
}

function validateKit(
  kit: PackKit,
  mode: number,
  routerAddress: string,
  expectedTokenId = mode,
): void {
  const spec = proofPackSpec(expectedTokenId);
  assert.ok(spec && spec.mode === mode, `Ravioli open-kit ${expectedTokenId} mode/spec drift`);
  assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
  assert.equal(kit.network, "shadownet");
  assert.equal(kit.contract, routerAddress);
  assert.equal(kit.tokenId, expectedTokenId);
  assert.equal(kit.mode, MODE_NAMES[mode]);
  assert.ok(kit.warning.trim(), `Ravioli open-kit ${expectedTokenId} warning is missing`);
  assert.equal(
    kit.blindSecurity,
    mode === 0 ? "public" : "commit-reveal-ui-hidden-chain-public",
    `Ravioli open-kit ${expectedTokenId} disclosure policy drift`,
  );
  assert.match(kit.manifestUri, /^ipfs:\/\//);
  const limited = expectedTokenId === 2;
  assert.equal(kit.editionPolicy.requiresLimitedWrapper, limited);
  assert.equal(kit.editionPolicy.wrapperSaleStart, null);
  assert.equal(kit.editionPolicy.wrapperEditionClass, mode === 0 ? "fixed-supply" : "limited-edition");
  if (mode === 0) {
    assert.equal(kit.editionPolicy.earliestChildEnd, null);
    assert.equal(kit.editionPolicy.wrapperSaleEnd, null);
    assert.equal(kit.editionPolicy.revealDeadline, null);
    assert.equal(kit.editionPolicy.openDeadline, null);
    assert.equal(kit.sealedReveal, undefined);
  } else {
    assert.match(String(kit.editionPolicy.wrapperSaleEnd), /^\d{4}-\d{2}-\d{2}T/);
    assert.match(String(kit.editionPolicy.revealDeadline), /^\d{4}-\d{2}-\d{2}T/);
    assert.match(String(kit.editionPolicy.openDeadline), /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Date.parse(String(kit.editionPolicy.wrapperSaleEnd)) < Date.parse(String(kit.editionPolicy.revealDeadline)));
    assert.ok(Date.parse(String(kit.editionPolicy.revealDeadline)) < Date.parse(String(kit.editionPolicy.openDeadline)));
    assert.equal(kit.sealedReveal?.schema, "pasta-ravioli-sealed-reveal-reference@1");
    assert.match(String(kit.sealedReveal?.contentsUri), /^ipfs:\/\//);
    assert.match(String(kit.sealedReveal?.salt), /^[0-9a-f]{64}$/);
    assert.match(String(kit.sealedReveal?.envelopeSha256), /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(kit.sealedReveal?.offset) && Number(kit.sealedReveal?.offset) >= 0);
    assert.ok(Number(kit.sealedReveal?.offset) < spec.editions);
  }
  if (limited) {
    assert.match(String(kit.editionPolicy.earliestChildEnd), /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Date.parse(String(kit.editionPolicy.wrapperSaleEnd)) < Date.parse(String(kit.editionPolicy.earliestChildEnd)));
    assert.ok(Date.parse(String(kit.editionPolicy.revealDeadline)) <= Date.parse(String(kit.editionPolicy.earliestChildEnd)));
  } else {
    assert.equal(kit.editionPolicy.earliestChildEnd, null);
  }
  assert.equal(kit.recipes.length, spec.editions);
  kit.recipes.forEach((recipe, serial) => {
    assert.equal(recipe.serial, serial);
    assert.match(recipe.nonce, /^[0-9a-f]{64}$/);
    assert.equal(recipe.actions.length, spec.itemCount);
    const normalized = recipe.actions.map((action) => {
      if (action.kind === "escrow") return { escrow: {} };
      if (action.kind === "allocated") {
        assert.equal(action.payloadCommitment, ravioliPayloadCommitment(""));
        return { allocated_mint: {} };
      }
      assert.equal(action.kind, "generative");
      assert.equal(action.payloadCommitment, null);
      return { generative_mint: {} };
    });
    assert.deepEqual(normalized.map(primitive), [...spec.primitives]);
  });
}

export function validateRavioliOpenKitDownload(input: {
  mode: number;
  routerAddress: string;
  suggestedFilename: string;
  inPageJson: string;
  downloadedBytes: Uint8Array;
  expectedTokenId?: number;
}): RavioliOpenKitDownloadCapture {
  assert.ok(Number.isSafeInteger(input.mode) && input.mode >= 0 && input.mode < PACK_SPECS.length, "Ravioli open-kit mode is invalid");
  const tokenId = input.expectedTokenId ?? input.mode;
  const fileName = `ravioli-open-kit-${tokenId}.json`;
  assert.equal(input.suggestedFilename, fileName, "Ravioli open-kit download filename drift");
  const inPageKit = JSON.parse(input.inPageJson) as PackKit;
  validateKit(inPageKit, input.mode, input.routerAddress, tokenId);
  const expectedBytes = Buffer.from(`${input.inPageJson}\n`, "utf8");
  assert.deepEqual(
    Buffer.from(input.downloadedBytes),
    expectedBytes,
    "Ravioli open-kit download bytes differ from the real Studio field",
  );
  const downloadedKit = JSON.parse(Buffer.from(input.downloadedBytes).toString("utf8")) as PackKit;
  assert.equal(
    sha256(deterministicJsonBytes(downloadedKit)),
    sha256(deterministicJsonBytes(inPageKit)),
    "Ravioli open-kit downloaded content differs from the real Studio field",
  );
  validateKit(downloadedKit, input.mode, input.routerAddress, tokenId);
  return {
    tokenId,
    mode: MODE_NAMES[input.mode],
    fileName,
    relativePath: `artifacts/open-kits/${fileName}`,
    sha256: sha256(input.downloadedBytes),
    bytes: Uint8Array.from(input.downloadedBytes),
    kit: downloadedKit,
  };
}

async function persistRavioliOpenKitCapture(input: {
  appRoot: string;
  capture: RavioliOpenKitDownloadCapture;
  priorCaptures: RavioliOpenKitDownloadCapture[];
}): Promise<void> {
  const absolutePath = path.join(input.appRoot, input.capture.relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.capture.bytes);
  assert.equal(sha256(await readFile(absolutePath)), input.capture.sha256, "persisted Ravioli open-kit digest drift");
  const captures = [...input.priorCaptures, input.capture];
  await writeFile(
    path.join(input.appRoot, "artifacts", "open-kits", "open-kit-capture-progress.json"),
    deterministicJsonBytes({
      schema: "pastaprotocol-ravioli-open-kit-capture-progress@1",
      status: captures.length === PACK_SPECS.length ? "CAPTURED" : "PARTIAL",
      disclosurePolicy: "Keep each captured kit local and unpinned until the creator intentionally publishes its validated on-chain public reveal; token 1 is deliberately revealed between two holder openings to prove portable discovery.",
      openKits: captures.map(({ tokenId, mode, fileName, relativePath, sha256: digest }) => ({
        tokenId,
        mode,
        fileName,
        path: relativePath,
        sha256: digest,
        ipfsPinned: false,
      })),
    }),
  );
}

export async function clickRavioliPublishAndWaitForDownload(
  page: Page,
  timeoutMs = 300_000,
  onDownload?: (download: Download) => Promise<void>,
): Promise<Download> {
  const beforeLog = (await page.locator("#log").textContent().catch(() => "")) || "";
  const priorFailureCount = (beforeLog.match(/publish failed:/g) || []).length;
  const priorSuccessCount = (beforeLog.match(/is fully reserved and ready/g) || []).length;
  const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
  const resolutionPromise = page.waitForFunction(
    ({ failuresBefore, successesBefore }) => {
      const log = document.getElementById("log")?.textContent || "";
      return (log.match(/publish failed:/g) || []).length > failuresBefore ||
        (log.match(/is fully reserved and ready/g) || []).length > successesBefore;
    },
    { failuresBefore: priorFailureCount, successesBefore: priorSuccessCount },
    { timeout: timeoutMs },
  ).then(async () => {
    const log = (await page.locator("#log").textContent()) || "";
    if ((log.match(/publish failed:/g) || []).length > priorFailureCount) {
      const failure = log.slice(log.lastIndexOf("publish failed:")).slice(0, 2_000);
      return { ok: false as const, failure };
    }
    assert.ok(
      (log.match(/is fully reserved and ready/g) || []).length > priorSuccessCount,
      "Ravioli Studio publish resolved without a new success or failure record",
    );
    return { ok: true as const };
  });
  await page.click("#btnPublish");
  try {
    const first = await Promise.race([
      downloadPromise.then((download) => ({ kind: "download" as const, download })),
      resolutionPromise.then((resolution) => ({ kind: "resolution" as const, resolution })),
    ]);
    let download: Download;
    if (first.kind === "resolution") {
      if (!first.resolution.ok) throw new Error(`Ravioli Studio publish failed: ${first.resolution.failure}`);
      download = await downloadPromise;
      await onDownload?.(download);
    } else {
      download = first.download;
      await onDownload?.(download);
      const resolution = await resolutionPromise;
      if (!resolution.ok) throw new Error(`Ravioli Studio publish failed: ${resolution.failure}`);
    }
    return download;
  } catch (error) {
    const log = (await page.locator("#log").textContent().catch(() => "")) || "";
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Ravioli publish did not complete: ${detail}; studioLog=${JSON.stringify(log.slice(-2_000))}`, {
      cause: error,
    });
  } finally {
    void downloadPromise.catch(() => undefined);
    void resolutionPromise.catch(() => undefined);
  }
}

async function publishPack(input: {
  page: Page;
  mode: number;
  expectedTokenId?: number;
  mirror: RavioliUiStateMirror;
  appRoot: string;
  priorCaptures: RavioliOpenKitDownloadCapture[];
  recordInMainCaptureProgress?: boolean;
}): Promise<RavioliOpenKitDownloadCapture> {
  const expectedTokenId = input.expectedTokenId ?? input.mode;
  let capture: RavioliOpenKitDownloadCapture | null = null;
  await clickRavioliPublishAndWaitForDownload(input.page, 300_000, async (download) => {
    const downloadPath = await download.path();
    assert.ok(downloadPath, `Ravioli open-kit ${expectedTokenId} download has no local path`);
    const inPageJson = await input.page.inputValue("#openKit");
    capture = validateRavioliOpenKitDownload({
      mode: input.mode,
      expectedTokenId,
      routerAddress: input.mirror.routerAddress,
      suggestedFilename: download.suggestedFilename(),
      inPageJson,
      downloadedBytes: await readFile(downloadPath),
    });
    if (input.recordInMainCaptureProgress !== false) {
      await persistRavioliOpenKitCapture({
        appRoot: input.appRoot,
        capture,
        priorCaptures: input.priorCaptures,
      });
    } else {
      const absolutePath = path.join(input.appRoot, capture.relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, capture.bytes);
      assert.equal(sha256(await readFile(absolutePath)), capture.sha256);
    }
  });
  assert.ok(capture, `Ravioli open-kit ${expectedTokenId} download was not durably captured`);
  await waitForLog(input.page, `pack ${expectedTokenId} is fully reserved and ready`);
  await input.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
  input.mirror.registerKit(capture.kit);
  return capture;
}

async function revealBlindPack(input: {
  actor: ActorPage;
  mirror: RavioliUiStateMirror;
  pins: PinRecord[];
  kit: PackKit;
  tokenId: number;
}): Promise<string> {
  assert.ok(input.tokenId > 0, "only blind Ravioli packs use the post-publish reveal helper");
  const beforePins = input.pins.length;
  await input.actor.page.fill("#opKt", input.mirror.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.fill("#openKit", JSON.stringify(input.kit, null, 2));
  await input.actor.page.click("#btnReveal");
  await waitForText(
    input.actor.page,
    ".pp-notice",
    "Reveal key published",
  );
  await input.actor.page.waitForFunction(() => !document.getElementById("btnReveal")?.hasAttribute("disabled"));
  assert.equal(input.pins.length, beforePins, `Ravioli token ${input.tokenId} reveal must reuse its pre-sale sealed document`);
  const pin = ravioliContentsEvidencePin(input.pins, input.mirror.routerAddress, input.tokenId, input.kit);
  const shownUri = await input.actor.page.inputValue("#revealUri");
  assert.equal(shownUri, pin.proof.uri);
  assert.equal(decodedUri(input.mirror.packs.get(input.tokenId)?.contents_uri), pin.proof.uri);
  return pin.proof.uri;
}

async function connectBuyer(actor: ActorPage): Promise<void> {
  await actor.page.click("#connect");
  await waitForText(actor.page, "#status", "Wallet connected.");
}

async function readRavioliIndexedChildBalance(input: {
  contract: string;
  tokenId: number;
  owner: string;
  label: string;
  expected?: number;
}): Promise<number> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const rows = await pollJson(
    input.label,
    `${base}/tokens/balances?token.contract=${encodeURIComponent(input.contract)}&limit=10000`,
    (value) => {
      if (!Array.isArray(value)) return false;
      if (input.expected === undefined) return true;
      const row = value.find((candidate: JsonObject) =>
        candidate?.account?.address === input.owner && Number(candidate?.token?.tokenId) === input.tokenId
      );
      return Number(row?.balance || 0) === input.expected;
    },
  );
  const matches = (rows as JsonObject[]).filter((candidate) =>
    candidate?.account?.address === input.owner && Number(candidate?.token?.tokenId) === input.tokenId
  );
  assert.ok(matches.length <= 1, `${input.label} returned duplicate TzKT balances`);
  const balance = Number(matches[0]?.balance || 0);
  assert.ok(Number.isSafeInteger(balance) && balance >= 0, `${input.label} returned an invalid balance`);
  if (input.expected !== undefined) assert.equal(balance, input.expected, `${input.label} balance delta was not indexed`);
  return balance;
}

async function readRavioliGnocchiBalanceView(input: {
  tezos: TezosToolkit;
  contractAddress: string;
  owner: string;
  tokenId: number;
  viewCaller: string;
  label: string;
}): Promise<number> {
  const contract = await input.tezos.contract.at(input.contractAddress);
  const value = await contract.contractViews.get_balance({
    owner: input.owner,
    token_id: input.tokenId,
  }).executeView({ viewCaller: input.viewCaller });
  const balance = Number(String(value));
  assert.ok(
    Number.isSafeInteger(balance) && balance >= 0,
    `${input.label} returned an invalid on-chain balance`,
  );
  return balance;
}

function ravioliOperationCalls(rows: readonly JsonObject[], target: string, entrypoint: string): JsonObject[] {
  return rows.filter((operation) =>
    operation?.target?.address === target && operation?.parameter?.entrypoint === entrypoint
  );
}

function assertRavioliFa2TransferPayload(
  value: unknown,
  expected: { from: string; to: string; tokenId: number; amount: number },
): void {
  assert.ok(Array.isArray(value) && value.length === 1, "Ravioli child transfer must contain one FA2 batch");
  const batch = value[0] as JsonObject;
  assert.equal(batch.from_, expected.from);
  assert.ok(Array.isArray(batch.txs) && batch.txs.length === 1, "Ravioli child transfer must contain one FA2 tx");
  const tx = batch.txs[0] as JsonObject;
  assert.equal(tx.to_, expected.to);
  assert.equal(Number(tx.token_id), expected.tokenId);
  assert.equal(Number(tx.amount), expected.amount);
}

async function verifyRavioliOpenDeliveryOutcome(input: {
  operationHash: string;
  routerAddress: string;
  gnocchiAddress: string;
  gnocchiAdapterAddress: string;
  rotiniAddress: string;
  rotiniAdapterAddress: string;
  collector: string;
  tokenId: number;
  serial: number;
  deliveries: readonly {
    contract: string;
    tokenId: number;
    amount: number;
    kind: string;
    before: number;
  }[];
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const response = await pollJson(
    `Ravioli token ${input.tokenId} exact open tree`,
    `${base}/operations/transactions/${encodeURIComponent(input.operationHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const rows = appliedOperationRows(response);
  const rootCalls = rows.filter((operation) =>
    operation?.sender?.address === input.collector &&
    operation?.target?.address === input.routerAddress &&
    operation?.parameter?.entrypoint === "open_pack"
  );
  assert.equal(rootCalls.length, 1, `Ravioli token ${input.tokenId} needs one collector open_pack root`);
  const rootValue = rootCalls[0]?.parameter?.value as JsonObject;
  assert.equal(Number(rootValue?.token_id), input.tokenId);
  assert.ok(Array.isArray(rootValue?.actions), `Ravioli token ${input.tokenId} open_pack actions are missing`);

  const escrowTransfers = ravioliOperationCalls(rows, input.gnocchiAddress, "transfer");
  const gnocchiFulfills = ravioliOperationCalls(rows, input.gnocchiAdapterAddress, "fulfill");
  const gnocchiMints = ravioliOperationCalls(rows, input.gnocchiAddress, "mint_reserved");
  const rotiniFulfills = ravioliOperationCalls(rows, input.rotiniAdapterAddress, "fulfill");
  const rotiniMints = ravioliOperationCalls(rows, input.rotiniAddress, "mint_pack_iteration");
  const countsByMode = [
    { actions: 1, escrow: 1, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 0, rotiniMint: 0 },
    { actions: 1, escrow: 1, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 0, rotiniMint: 0 },
    { actions: 1, escrow: 0, gnocchiFulfill: 1, gnocchiMint: 1, rotiniFulfill: 0, rotiniMint: 0 },
    { actions: 2, escrow: 0, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 2, rotiniMint: 2 },
    { actions: 3, escrow: 1, gnocchiFulfill: 1, gnocchiMint: 1, rotiniFulfill: 1, rotiniMint: 1 },
  ][input.tokenId];
  assert.ok(countsByMode, `unsupported Ravioli delivery mode ${input.tokenId}`);
  assert.equal(rootValue.actions.length, countsByMode.actions);
  assert.equal(escrowTransfers.length, countsByMode.escrow);
  assert.equal(gnocchiFulfills.length, countsByMode.gnocchiFulfill);
  assert.equal(gnocchiMints.length, countsByMode.gnocchiMint);
  assert.equal(rotiniFulfills.length, countsByMode.rotiniFulfill);
  assert.equal(rotiniMints.length, countsByMode.rotiniMint);

  const escrowDelivery = input.deliveries.find((delivery) => /escrow/.test(delivery.kind));
  const escrowTokenId = escrowDelivery?.tokenId ?? 0;
  if (escrowTransfers[0]) {
    assert.ok(escrowDelivery, `Ravioli token ${input.tokenId} escrow transfer lacks a declared delivery`);
    assertRavioliFa2TransferPayload(escrowTransfers[0].parameter?.value, {
      from: input.routerAddress,
      to: input.collector,
      tokenId: escrowTokenId,
      amount: 1,
    });
  }
  if (gnocchiFulfills[0]) {
    const value = gnocchiFulfills[0].parameter?.value as JsonObject;
    assert.equal(value.recipient, input.collector);
    assert.equal(value.pack_contract, input.routerAddress);
    assert.equal(Number(value.pack_token_id), input.tokenId);
    assert.equal(Number(value.open_serial), input.serial);
    assert.equal(Number(value.action_index), input.tokenId === 4 ? 1 : 0);
    assert.equal(Number(value.resource_id), input.tokenId === 4 ? 1 : 0);
    assert.equal(String(value.payload || "").replace(/^0x/, ""), "");
  }
  if (gnocchiMints[0]) {
    const value = gnocchiMints[0].parameter?.value as JsonObject;
    assert.equal(value.to_, input.collector);
    assert.equal(Number(value.token_id), input.tokenId === 4 ? 1 : 2);
    assert.equal(Number(value.amount), 1);
  }
  const expectedRotiniIndexes = input.tokenId === 3 ? [0, 1] : input.tokenId === 4 ? [2] : [];
  assert.deepEqual(rotiniFulfills.map((operation) => Number(operation?.parameter?.value?.action_index)).sort(), expectedRotiniIndexes);
  assert.deepEqual(rotiniMints.map((operation) => Number(operation?.parameter?.value?.action_index)).sort(), expectedRotiniIndexes);
  for (const operation of [...rotiniFulfills, ...rotiniMints]) {
    const value = operation.parameter?.value as JsonObject;
    assert.equal(value.recipient, input.collector);
    assert.equal(value.pack_contract, input.routerAddress);
    assert.equal(Number(value.pack_token_id), input.tokenId);
    assert.equal(Number(value.open_serial), input.serial);
  }
  for (const operation of rotiniFulfills) {
    const value = operation.parameter?.value as JsonObject;
    assert.equal(Number(value.resource_id), input.tokenId === 4 ? 1 : 0);
    assert.match(String(value.payload || "").replace(/^0x/, ""), /^[0-9a-f]+$/i);
  }
  for (const operation of rotiniMints) {
    const value = operation.parameter?.value as JsonObject;
    assert.equal(Number(value.project_id), 0);
    for (const field of ["metadata_uri", "artifact_uri", "display_uri", "thumbnail_uri", "mime_type", "artifact_hash"]) {
      assert.match(String(value[field] || "").replace(/^0x/, ""), /^[0-9a-f]+$/i, `Rotini ${field} is missing from the exact open tree`);
    }
  }

  const balanceDeltas: JsonObject[] = [];
  for (const delivery of input.deliveries) {
    const expected = delivery.before + delivery.amount;
    const after = await readRavioliIndexedChildBalance({
      contract: delivery.contract,
      tokenId: delivery.tokenId,
      owner: input.collector,
      label: `post-open Ravioli ${input.tokenId} ${delivery.kind}`,
      expected,
    });
    balanceDeltas.push({ ...delivery, after, delta: after - delivery.before });
  }
  const selectedTree = rows.map((operation) => ({
    id: operation.id,
    level: operation.level,
    sender: operation.sender?.address,
    target: operation.target?.address,
    entrypoint: operation.parameter?.entrypoint || "default",
    value: operation.parameter?.value,
    status: operation.status,
  }));
  return {
    tokenId: input.tokenId,
    serial: input.serial,
    collector: input.collector,
    operationHash: input.operationHash,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
    operationTreeSha256: sha256(deterministicJsonBytes(selectedTree)),
    operationTree: selectedTree,
    exactCallCounts: countsByMode,
    balanceDeltas,
  };
}

async function clickBuyerCall(actor: ActorPage, selector: string, action: string): Promise<void> {
  const previousCallCount = await actor.page.evaluate(() => (
    ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length
  ));
  await actor.page.click(selector);
  await actor.page.waitForFunction((before) => {
    const status = document.getElementById("status");
    const calls = ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length;
    return calls > before || status?.dataset.error === "true";
  }, previousCallCount, { timeout: 300_000 });
  await actor.page.waitForFunction(() => {
    const status = document.getElementById("status");
    return status?.textContent?.includes("Confirmed on Tezos.") || status?.dataset.error === "true";
  }, undefined, { timeout: 300_000 });
  const status = (await actor.page.locator("#status").textContent()) || "";
  assert.match(status, /Confirmed on Tezos\./, `${action} failed in the buyer page: ${status}`);
}

async function verifyIndexedWrapperPurchase(input: {
  routerAddress: string;
  creator: string;
  collector: string;
  tokenId: number;
  operationHash: string;
  expectedPriceMutez: number;
  expectedIndexedBalance?: number;
  expectedOperationCounter?: number;
  balanceContext?: "immediate-post-purchase" | "terminal-after-recovered-transfer";
}): Promise<JsonObject> {
  const expectedIndexedBalance = input.expectedIndexedBalance ?? 1;
  const fa2 = await readIndexedFa2Evidence({
    label: `Ravioli wrapper ${input.tokenId} purchase`,
    address: input.routerAddress,
    creator: input.creator,
    tokenIds: [input.tokenId],
    balances: [{
      owner: input.collector,
      tokenId: input.tokenId,
      balance: expectedIndexedBalance,
    }],
  });
  const token = (fa2.tokens as JsonObject[]).find((candidate) => Number(candidate.tokenId) === input.tokenId);
  assert.ok(token && Number(token.totalSupply) >= 1, `Ravioli wrapper ${input.tokenId} indexed supply must remain live before opening`);
  const balance = (fa2.balances as JsonObject[]).find((candidate) =>
    candidate?.account?.address === input.collector && Number(candidate?.token?.tokenId) === input.tokenId,
  );
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const operationResponse = await pollJson(
    `Ravioli wrapper ${input.tokenId} indexed purchase operation`,
    `${base}/operations/transactions/${encodeURIComponent(input.operationHash)}`,
    (value) => appliedOperationRows(value).some((operation) =>
      operation?.hash === input.operationHash &&
      operation?.sender?.address === input.collector &&
      operation?.target?.address === input.routerAddress &&
      operation?.parameter?.entrypoint === "buy" &&
      (
        input.expectedOperationCounter === undefined
        || Number(operation?.counter) === input.expectedOperationCounter
      ),
    ),
  );
  const operation = appliedOperationRows(operationResponse).find((candidate) =>
    candidate?.hash === input.operationHash &&
    candidate?.sender?.address === input.collector &&
    candidate?.target?.address === input.routerAddress &&
    candidate?.parameter?.entrypoint === "buy" &&
    (
      input.expectedOperationCounter === undefined
      || Number(candidate?.counter) === input.expectedOperationCounter
    ),
  );
  assert.ok(operation);
  assert.equal(Number(operation.amount), input.expectedPriceMutez, `Ravioli wrapper ${input.tokenId} indexed payment drift`);
  return {
    tokenId: input.tokenId,
    collector: input.collector,
    balance: Number(balance?.balance),
    purchasedQuantity: 1,
    balanceContext: input.balanceContext || "immediate-post-purchase",
    totalSupplyBeforeOpen: Number(token.totalSupply),
    operationHash: input.operationHash,
    amountMutez: Number(operation.amount),
    operationLevel: operation.level,
    contract: fa2.contract,
    token,
    indexedBalance: balance,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
  };
}

async function buyWrapper(actor: ActorPage): Promise<void> {
  await clickBuyerCall(actor, "#submit", "wrapper purchase");
}

async function openStudioDetailsForControl(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  const details = control.locator("xpath=ancestor::details");
  if (await details.count() && !(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
  await control.waitFor({ state: "visible" });
}

type RavioliStudioTransferOutcome = {
  ok: boolean;
  notice: string;
  log: string;
  transferInfo: string;
};

function boundedRavioliStudioDiagnostic(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

export async function waitForRavioliStudioTransferOutcome(
  page: Page,
  timeout = 300_000,
): Promise<void> {
  const handle = await page.waitForFunction(() => {
    const notice = document.getElementById("ppNotice")?.textContent || "";
    const log = document.getElementById("log")?.textContent || "";
    const transferInfo = document.getElementById("transferInfo")?.textContent || "";
    if (notice.includes("Ravioli wrapper transfer confirmed with its exact claim state.")) {
      return { ok: true, notice, log, transferInfo };
    }
    if (notice.includes("Wrapper transfer failed:") || log.includes("wrapper transfer failed:")) {
      return { ok: false, notice, log, transferInfo };
    }
    return null;
  }, undefined, { timeout });
  let outcome: RavioliStudioTransferOutcome;
  try {
    outcome = await handle.jsonValue() as RavioliStudioTransferOutcome;
  } finally {
    await handle.dispose();
  }
  if (outcome.ok) return;
  throw new Error(
    "Ravioli wrapper transfer failed before confirmation: " +
    `notice=${JSON.stringify(boundedRavioliStudioDiagnostic(outcome.notice))}; ` +
    `log=${JSON.stringify(boundedRavioliStudioDiagnostic(outcome.log))}; ` +
    `transferInfo=${JSON.stringify(boundedRavioliStudioDiagnostic(outcome.transferInfo))}`,
  );
}

async function transferRavioliWrapperViaStudio(input: {
  actor: ActorPage;
  routerAddress: string;
  tokenId: number;
  recipient: string;
}): Promise<void> {
  await openStudioDetailsForControl(input.actor.page, "#btnTransferWrapper");
  await input.actor.page.fill("#opKt", input.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.fill("#transferRecipient", input.recipient);
  await input.actor.page.click("#btnTransferWrapper");
  await waitForRavioliStudioTransferOutcome(input.actor.page);
  await input.actor.page.waitForFunction(() => !document.getElementById("btnTransferWrapper")?.hasAttribute("disabled"));
}

async function creditExpiredRavioliRefundViaStudio(input: {
  actor: ActorPage;
  routerAddress: string;
  tokenId: number;
  holder: string;
}): Promise<void> {
  await openStudioDetailsForControl(input.actor.page, "#btnCreditRefund");
  await input.actor.page.fill("#opKt", input.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.fill("#refundHolder", input.holder);
  await input.actor.page.click("#btnCreditRefund");
  await waitForText(
    input.actor.page,
    "#ppNotice",
    "Expired claim burned and its refund credited to the current holder.",
  );
  await input.actor.page.waitForFunction(() => !document.getElementById("btnCreditRefund")?.hasAttribute("disabled"));
}

async function cancelUnrevealedRavioliPackViaStudio(input: {
  actor: ActorPage;
  routerAddress: string;
  tokenId: number;
}): Promise<void> {
  await openStudioDetailsForControl(input.actor.page, "#btnCancelUnrevealed");
  await input.actor.page.fill("#opKt", input.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.click("#btnCancelUnrevealed");
  await waitForText(
    input.actor.page,
    "#ppNotice",
    "Unrevealed Ravioli pack closed after complete refund settlement.",
  );
  await input.actor.page.waitForFunction(() => !document.getElementById("btnCancelUnrevealed")?.hasAttribute("disabled"));
}

async function withdrawRavioliRefundViaStudio(input: {
  actor: ActorPage;
  routerAddress: string;
  tokenId: number;
  destination: string;
}): Promise<void> {
  await openStudioDetailsForControl(input.actor.page, "#btnWithdrawRefund");
  await input.actor.page.fill("#opKt", input.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.fill("#refundDestination", input.destination);
  await input.actor.page.click("#btnWithdrawRefund");
  await waitForText(
    input.actor.page,
    "#ppNotice",
    "Refund credit withdrawn. A rejected destination would have preserved the credit.",
  );
  await input.actor.page.waitForFunction(() => !document.getElementById("btnWithdrawRefund")?.hasAttribute("disabled"));
}

async function recoverRavioliAdapterCapacityViaStudio(input: {
  actor: ActorPage;
  routerAddress: string;
  tokenId: number;
  adapterAddress: string;
  kind: number;
  resourceId: number;
  capacity: number;
}): Promise<void> {
  await openStudioDetailsForControl(input.actor.page, "#btnRecoverAdapter");
  await input.actor.page.fill("#opKt", input.routerAddress);
  await input.actor.page.fill("#opTokenId", String(input.tokenId));
  await input.actor.page.fill("#recoverAdapter", input.adapterAddress);
  await input.actor.page.fill("#recoverAdapterKind", String(input.kind));
  await input.actor.page.fill("#recoverResourceId", String(input.resourceId));
  await input.actor.page.fill("#recoverCapacity", String(input.capacity));
  await input.actor.page.click("#btnRecoverAdapter");
  await waitForText(
    input.actor.page,
    "#ppNotice",
    "Unused Ravioli child capacity released through the official adapter.",
  );
  await waitForText(
    input.actor.page,
    "#recoverAdapterInfo",
    `Released ${input.capacity} units; router allowance and adapter reservation now 0/0.`,
  );
  await input.actor.page.waitForFunction(
    () => !document.getElementById("btnRecoverAdapter")?.hasAttribute("disabled"),
  );
}

async function waitForRavioliChainTimestamp(input: {
  tezos: TezosToolkit;
  thresholdIso: string;
  label: string;
  timeoutMs?: number;
}): Promise<string> {
  const thresholdMs = Date.parse(input.thresholdIso);
  assert.ok(Number.isFinite(thresholdMs), `${input.label} threshold is invalid`);
  const deadline = Date.now() + (
    input.timeoutMs
    ?? ravioliChainWaitTimeoutMs(input.thresholdIso)
  );
  while (Date.now() < deadline) {
    const header = await input.tezos.rpc.getBlockHeader();
    const timestamp = String(header.timestamp || "");
    if (Date.parse(timestamp) >= thresholdMs) return timestamp;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`${input.label} did not reach ${input.thresholdIso} before the bounded timeout`);
}

async function assertRejectingRavioliRefundDestinationPreservesCredit(input: {
  tezos: TezosToolkit;
  controllerAddress: string;
  rejectingDestination: string;
  amount: number;
}): Promise<string> {
  assert.ok(
    Number.isSafeInteger(input.amount) && input.amount > 0,
    "Ravioli rejecting-destination probe requires a positive refund credit",
  );
  const controller = await input.tezos.contract.at(input.controllerAddress);
  const readCredit = async (): Promise<number> => {
    const storage = await controller.storage() as JsonObject;
    const credits = storage.refund_credits as {
      get(key: string): Promise<unknown>;
    };
    assert.ok(
      credits && typeof credits.get === "function",
      "Ravioli controller refund-credit map is unavailable",
    );
    return asSafeInteger(
      (await credits.get(await input.tezos.signer.publicKeyHash())) ?? 0,
      "Ravioli controller refund credit",
    );
  };
  const creditBefore = await readCredit();
  assert.equal(
    creditBefore,
    input.amount,
    "Ravioli rejecting-destination probe must cover the holder's exact credit",
  );
  let rejection = "";
  try {
    await input.tezos.estimate.transfer(controller.methodsObject.withdraw_refund({
      destination: input.rejectingDestination,
      amount: input.amount,
    }).toTransferParams());
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  assert.match(
    rejection,
    /(?:script rejected|transaction failed|michelson|entrypoint|default|FAILWITH)/i,
    "rejecting KT1 refund destination did not produce a narrow contract-call rejection",
  );
  assert.ok(
    rejection.includes(input.rejectingDestination),
    "rejecting-destination trace is not tied to the exact Ravioli router",
  );
  const creditAfter = await readCredit();
  assert.equal(
    creditAfter,
    creditBefore,
    "read-only rejecting-destination simulation changed the holder credit",
  );
  return `Pull-based refund withdrawal to the non-payable Ravioli router was rejected by Shadownet simulation before injection; exact holder credit remained ${creditAfter} mutez.`;
}

async function openWrapper(
  actor: ActorPage,
  expectedChainState = "fully reserved",
): Promise<void> {
  const secondaryVisible = await actor.page.locator("#secondarySubmit").isVisible();
  await clickBuyerCall(actor, secondaryVisible ? "#secondarySubmit" : "#submit", "atomic pack opening");
  await actor.page.waitForFunction(
    (expected) => document.getElementById("chainState")?.textContent?.trim() === expected,
    expectedChainState,
  );
}

export async function operationEstimateMutez(
  tezos: TezosToolkit,
  code: unknown[],
  storage: unknown,
): Promise<number> {
  const estimate = await readWithBoundedRetry({
    primary: declareReadOnlyReader("Ravioli origination fee simulation", async () =>
      tezos.estimate.originate({ code, storage } as never)
    ),
  });
  return Number(estimate.suggestedFeeMutez) + Number(estimate.burnFeeMutez) + 100_000;
}

const RAVIOLI_CONTROLLER_VIEW_NAMES = new Set([
  "get_pack_status",
  "get_claim_count",
  "get_last_claim",
  "get_claim_serial",
  "quote_refund",
  "get_refund_credit",
]);
const RAVIOLI_ROTINI_ADAPTER_VIEW_NAMES = new Set([
  "get_reserved",
  "get_render_context",
]);
const RAVIOLI_ESCROW_BALANCE_VIEW_NAMES = new Set(["get_balance"]);

function authorizeRavioliEscrowBalanceView(
  session: TaquitoPastaUiLiveSession,
  contractAddress: string,
): void {
  session.authorizeContractViews({
    contractAddress,
    viewNames: RAVIOLI_ESCROW_BALANCE_VIEW_NAMES,
    allowSessionSigner: true,
  });
}

function authorizeRavioliControllerViews(
  session: TaquitoPastaUiLiveSession,
  controllerAddress: string,
  routerAddress: string,
): void {
  session.authorizeContractViews({
    contractAddress: controllerAddress,
    viewNames: RAVIOLI_CONTROLLER_VIEW_NAMES,
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([routerAddress]),
  });
}

function authorizeRavioliCollectorReadSurface(
  session: TaquitoPastaUiLiveSession,
  input: {
    gnocchiAdapterAddress: string;
    rotiniAdapterAddress: string;
    gnocchiTargetAddress: string;
    rotiniTargetAddress: string;
  },
): void {
  for (const contractAddress of [
    input.gnocchiAdapterAddress,
    input.rotiniAdapterAddress,
    input.gnocchiTargetAddress,
    input.rotiniTargetAddress,
  ]) {
    session.authorizeReadOnlyContract({ contractAddress });
  }
  session.authorizeContractViews({
    contractAddress: input.rotiniAdapterAddress,
    viewNames: RAVIOLI_ROTINI_ADAPTER_VIEW_NAMES,
    allowSessionSigner: true,
  });
}

function operationReceipts(sessions: readonly TaquitoPastaUiLiveSession[]): PastaUiLivePublicReceipt[] {
  return sessions
    .flatMap((session) => session.getReceipts())
    .filter((receipt) => receipt.operationHash)
    .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
}

async function makeCollectorSession(input: {
  tezos: TezosToolkit;
  wallet: PlatformWallet;
  routerAddress: string;
  policy: RavioliUiLivePolicy;
  mirror: RavioliUiStateMirror;
  ipfs: IpfsProofConfig;
  pins: PinRecord[];
  balanceMutez: number;
  journal: RavioliUiLiveJournal;
  journalActor: "collector1" | "collector2";
  journalIntent: RavioliUiLiveActorIntent;
  initialOperationSequence?: number;
  initialReceiptSequence?: number;
}): Promise<{
  session: TaquitoPastaUiLiveSession;
  bridge: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
}> {
  const journalHooks = ravioliJournalSessionHooks({
    journal: input.journal,
    actor: input.journalActor,
    intent: input.journalIntent,
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos: input.tezos,
    signerAddress: input.wallet.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([input.routerAddress, input.mirror.blindControllerAddress]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(input.tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: input.ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: input.ipfs }),
    validateOrigination: () => { throw new PastaUiLiveBridgeError("collector origination is disabled", 403); },
    validateCall: (call) => input.policy.validateCollectorCall(input.wallet.address, call),
    projectStorage: (storage) => projectRavioliUiLiveStorage(storage, input.mirror),
    beforePin: ({ bytes, fileName, mimeType }) => input.journal.beforePin({
      actor: input.journalActor,
      fileName,
      mimeType,
      bytes,
    }),
    onPin: async ({ value, bytes, proof }) => {
      if (value !== undefined) assertNoDataUri(value, "collector pin");
      const exactBytes = bytes ? Uint8Array.from(bytes) : deterministicJsonBytes(value);
      await input.journal.appendPin({
        actor: input.journalActor,
        fileName: proof.fileName,
        mimeType: proof.mimeType,
        bytes: exactBytes,
        expectedSha256: proof.sha256,
        expectedByteLength: proof.byteLength,
        metadata: {
          cid: proof.cid,
          uri: proof.uri,
          publicGatewayUrl: proof.publicGatewayUrl,
        },
      });
      input.pins.push({ ...(value !== undefined ? { value } : {}), ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}), proof });
    },
    ...(input.initialOperationSequence === undefined
      ? {}
      : { initialOperationSequence: input.initialOperationSequence }),
    ...(input.initialReceiptSequence === undefined
      ? {}
      : { initialReceiptSequence: input.initialReceiptSequence }),
    ...journalHooks,
  });
  authorizeRavioliControllerViews(
    session,
    input.mirror.blindControllerAddress,
    input.routerAddress,
  );
  session.authorizeAfterFundingPreflight(fundingAuthorization({
    balanceMutez: input.balanceMutez,
    requiredBalanceMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
    operationReserveMutez: COLLECTOR_OPERATION_RESERVE_MUTEZ,
  }));
  const bridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({
      session,
      mirror: input.mirror,
      policy: input.policy,
      signerAddress: input.wallet.address,
    }),
  });
  return { session, bridge };
}

async function assertAllocatedPayloadSubstitutionRejected(
  tezos: TezosToolkit,
  routerAddress: string,
  kit: PackKit,
  expectedClaimId: number,
): Promise<string> {
  assert.ok(
    Number.isSafeInteger(expectedClaimId) && expectedClaimId >= 0,
    "allocated substitution probe requires the holder's exact claim id",
  );
  const contract = await tezos.contract.at(routerAddress);
  const recipe = kit.recipes[0];
  const action = recipe.actions[0];
  const wrong = {
    allocated_mint: {
      adapter: action.adapter,
      resource_id: action.resourceId,
      payload: "",
      payload_commitment: "00".repeat(32),
    },
  };
  await assert.rejects(
    () => tezos.estimate.transfer(contract.methodsObject.open_pack({
      token_id: 2,
      expected_claim_id: expectedClaimId,
      nonce: recipe.nonce,
      actions: [wrong],
    }).toTransferParams()),
    /BAD_PAYLOAD_COMMITMENT/,
  );
  return "Allocated payload substitution reached the revealed holder claim and was rejected only by BAD_PAYLOAD_COMMITMENT before injection.";
}

async function assertExpiredRavioliRevealRejected(input: {
  tezos: TezosToolkit;
  routerAddress: string;
  tokenId: number;
  kit: PackKit;
}): Promise<string> {
  assert.ok(input.kit.sealedReveal, "expired Ravioli reveal probe requires sealed reveal terms");
  const contract = await input.tezos.contract.at(input.routerAddress);
  let rejection = "";
  try {
    await input.tezos.estimate.transfer(contract.methodsObject.set_pack_contents({
      token_id: input.tokenId,
      contents_uri: utf8ToHex(input.kit.sealedReveal.contentsUri),
      salt: input.kit.sealedReveal.salt,
      offset: input.kit.sealedReveal.offset,
    }).toTransferParams());
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  assert.match(
    rejection,
    /REVEAL_DEADLINE_PASSED|reveal deadline/i,
    "expired Ravioli reveal unexpectedly passed read-only Shadownet simulation",
  );
  return "Expired creator reveal permission was rejected by Shadownet simulation before injection; holder refund and pack closure remained the only live path.";
}

async function assertLimitedEditionPackPolicyRejected(
  tezos: TezosToolkit,
  routerAddress: string,
  childEnd: string,
): Promise<string[]> {
  const contract = await tezos.contract.at(routerAddress);
  const storage = await contract.storage() as JsonObject;
  const expectedTokenId = asSafeInteger(storage.next_token_id, "negative-policy next token id");
  const tokenInfo = new MichelsonMap<string, string>();
  tokenInfo.set("", utf8ToHex("ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"));
  const baseConfig = {
    mode: 2,
    blind: true,
    item_count: 1,
    max_supply: 1,
    committed_recipes: 0,
    finalized: false,
    cancelled: false,
    contents_uri: null,
    manifest_uri: utf8ToHex("ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"),
    child_expiry: childEnd,
  };
  await assert.rejects(
    () => tezos.estimate.transfer(contract.methodsObject.create_pack({
      expected_token_id: expectedTokenId,
      token_info: tokenInfo,
      config: { ...baseConfig, wrapper_sale_end: null },
    }).toTransferParams()),
    /LE_WRAPPER_REQUIRES_END/,
  );
  const laterThanChild = new Date(Date.parse(childEnd) + 1_000).toISOString();
  await assert.rejects(
    () => tezos.estimate.transfer(contract.methodsObject.create_pack({
      expected_token_id: expectedTokenId,
      token_info: tokenInfo,
      config: { ...baseConfig, wrapper_sale_end: laterThanChild },
    }).toTransferParams()),
    /PACK_END_AFTER_CHILD/,
  );
  return [
    "LE wrapper config without an immutable sale expiry rejected by Shadownet simulation before injection (LE_WRAPPER_REQUIRES_END)",
    "LE wrapper config ending after its child rejected by Shadownet simulation before injection (PACK_END_AFTER_CHILD)",
  ];
}

export async function assertOfficialLimitedEditionDependencyMismatchRejected(input: {
  tezos: TezosToolkit;
  routerAddress: string;
}): Promise<string> {
  const targetAddress = RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.gnocchiTarget;
  const adapterAddress = RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.gnocchiAdapter;
  const [target, adapter, router, targetArtifactBytes, adapterArtifactBytes] = await Promise.all([
    input.tezos.contract.at(targetAddress),
    input.tezos.contract.at(adapterAddress),
    input.tezos.contract.at(input.routerAddress),
    readFile(FRESH_GNOCCHI_CONTRACT_ARTIFACT_PATH),
    readFile(ARTIFACT_PATHS.gnocchiAdapter),
  ]);
  const [targetScript, adapterScript, routerScript] = await Promise.all([
    input.tezos.rpc.getScript(targetAddress),
    input.tezos.rpc.getScript(adapterAddress),
    input.tezos.rpc.getScript(input.routerAddress),
  ]);
  const targetArtifact = JSON.parse(targetArtifactBytes.toString("utf8"));
  const adapterArtifact = JSON.parse(adapterArtifactBytes.toString("utf8"));
  const routerArtifact = JSON.parse((await readFile(ARTIFACT_PATHS.router)).toString("utf8"));
  assert.ok(Array.isArray(targetArtifact) && Array.isArray(adapterArtifact) && Array.isArray(routerArtifact));
  const targetCodeSha256 = assertMichelsonScriptCodeIdentity(
    targetScript.code,
    targetArtifact,
    "short-expiry red fixture Gnocchi target differs from the current packaged contract",
  );
  const adapterCodeSha256 = assertMichelsonScriptCodeIdentity(
    adapterScript.code,
    adapterArtifact,
    "short-expiry red fixture adapter differs from the current packaged contract",
  );
  const routerCodeSha256 = assertMichelsonScriptCodeIdentity(
    routerScript.code,
    routerArtifact,
    "short-expiry red fixture router differs from the current packaged contract",
  );
  assert.equal(targetCodeSha256, RAVIOLI_FROZEN_DEPLOYMENT.gnocchiTarget.scriptCodeSha256);
  assert.equal(adapterCodeSha256, RAVIOLI_FROZEN_DEPLOYMENT.gnocchiAdapter.canonicalMichelsonCodeSha256);
  assert.equal(routerCodeSha256, RAVIOLI_FROZEN_DEPLOYMENT.router.canonicalMichelsonCodeSha256);

  const readBoundary = async () => {
    const [targetStorage, adapterStorageValue, routerStorageValue] = await Promise.all([
      target.storage() as Promise<JsonObject>,
      adapter.storage() as Promise<JsonObject>,
      router.storage() as Promise<JsonObject>,
    ]);
    const administrator = String(routerStorageValue.administrator || "");
    assert.equal(String(targetStorage.administrator || ""), administrator);
    assert.equal(String(adapterStorageValue.administrator || ""), administrator);
    assert.equal(await input.tezos.signer.publicKeyHash(), administrator);
    const minter = await (targetStorage.minters as any).get(adapterAddress);
    const routerAuthorization = await (adapterStorageValue.routers as any).get(input.routerAddress);
    assert.notEqual(minter, undefined, "short-expiry fixture adapter is not an authorized Gnocchi minter");
    assert.equal(routerAuthorization, undefined, "short-expiry fixture unexpectedly retained the current router");
    return {
      administrator,
      targetTokenId: asSafeInteger(targetStorage.next_token_id, "short-expiry target next token id"),
      resourceId: asSafeInteger(adapterStorageValue.next_resource_id, "short-expiry adapter next resource id"),
      packTokenId: asSafeInteger(routerStorageValue.next_token_id, "short-expiry router next token id"),
      adapterMinterAuthorized: true,
      currentRouterAbsentFromFixtureAdapter: true,
    };
  };
  const before = await readBoundary();
  const head = await input.tezos.rpc.getBlockHeader();
  const headMs = Date.parse(String(head.timestamp || ""));
  assert.ok(Number.isFinite(headMs), "short-expiry red fixture head timestamp is invalid");
  const start = new Date(headMs - 60_000).toISOString();
  const actualChildEnd = new Date(
    headMs + RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.childLifetimeMs,
  ).toISOString();
  const dishonestWrapperEnd = new Date(
    Date.parse(actualChildEnd) + RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.wrapperAfterChildMs,
  ).toISOString();
  const dishonestRevealDeadline = new Date(
    Date.parse(actualChildEnd) + RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.revealAfterChildMs,
  ).toISOString();
  const dishonestDeclaredChildEnd = new Date(
    Date.parse(actualChildEnd) + RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.declaredAfterChildMs,
  ).toISOString();
  const dishonestOpenDeadline = new Date(
    Date.parse(actualChildEnd) + RAVIOLI_SHORT_EXPIRY_RED_FIXTURE.openAfterChildMs,
  ).toISOString();
  const childInfo = new MichelsonMap<string, string>();
  childInfo.set("", utf8ToHex("ipfs://bafkreibzia7uzggmd6w3vxfk4osdqy5nda3znywpkrtxzt5dpu7x6omdxa"));
  const packInfo = new MichelsonMap<string, string>();
  packInfo.set("", utf8ToHex("ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"));
  const batch = [
    target.methodsObject.create_open_edition({
      token_info: childInfo,
      sale: {
        active: true,
        start,
        end: actualChildEnd,
        base_price: 0,
        increment: 0,
        step_size: 1,
        min_price: null,
        max_price: null,
        max_supply: 1,
        treasury: before.administrator,
      },
      creator_reserve: 0,
      lock_policy: true,
    }).toTransferParams(),
    adapter.methodsObject.create_allocation({
      target: targetAddress,
      token_id: before.targetTokenId,
      amount_per_open: 1,
      active: true,
    }).toTransferParams(),
    adapter.methodsObject.add_router(input.routerAddress).toTransferParams(),
    router.methodsObject.create_pack({
      expected_token_id: before.packTokenId,
      token_info: packInfo,
      config: {
        mode: 2,
        blind: true,
        item_count: 1,
        max_supply: 1,
        committed_recipes: 0,
        finalized: false,
        cancelled: false,
        contents_uri: null,
        manifest_uri: utf8ToHex("ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"),
        child_expiry: dishonestDeclaredChildEnd,
        wrapper_sale_end: dishonestWrapperEnd,
        reveal_deadline: dishonestRevealDeadline,
        open_deadline: dishonestOpenDeadline,
        reveal_commitment: "00".repeat(32),
      },
    }).toTransferParams(),
    router.methodsObject.commit_recipe({
      token_id: before.packTokenId,
      nonce_commitment: "00".repeat(32),
      reservations: [{
        allocated_mint: {
          adapter: adapterAddress,
          resource_id: before.resourceId,
          payload_commitment: "00".repeat(32),
        },
      }],
    }).toTransferParams(),
  ].map((params) => ({
    ...params,
    kind: OpKind.TRANSACTION as OpKind.TRANSACTION,
  }));
  let rejection = "";
  try {
    await input.tezos.estimate.batch(batch);
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  assert.match(
    rejection,
    /DECLARED_CHILD_EXPIRY_AFTER_CHILD/,
    "short-expiry official dependency mismatch simulation returned the wrong rejection",
  );
  const after = await readBoundary();
  assert.deepEqual(after, before, "short-expiry estimate-only red fixture changed Shadownet state");
  const evidence = {
    classification: "SHADOWNET-ZERO-INJECTION-SHORT-EXPIRY-RED-PROOF",
    chainTimestamp: String(head.timestamp || ""),
    contracts: {
      router: input.routerAddress,
      adapter: adapterAddress,
      target: targetAddress,
    },
    canonicalCodeSha256: {
      router: routerCodeSha256,
      adapter: adapterCodeSha256,
      target: targetCodeSha256,
    },
    dynamicIds: {
      packTokenId: before.packTokenId,
      resourceId: before.resourceId,
      targetTokenId: before.targetTokenId,
    },
    deadlines: {
      actualChildEnd,
      dishonestWrapperEnd,
      dishonestRevealDeadline,
      dishonestDeclaredChildEnd,
      dishonestOpenDeadline,
    },
    simulatedEntrypoints: [
      "create_open_edition",
      "create_allocation",
      "add_router",
      "create_pack",
      "commit_recipe",
    ],
    rejection: "DECLARED_CHILD_EXPIRY_AFTER_CHILD",
    stateUnchanged: true,
  };
  return `Official Router → Gnocchi adapter → Gnocchi target short-expiry simulation rejected the dishonest child deadline with zero injection: ${JSON.stringify(evidence)}`;
}

async function assertLimitedEditionDirectMintRejected(
  tezos: TezosToolkit,
  routerAddress: string,
  administrator: string,
): Promise<string> {
  const contract = await tezos.contract.at(routerAddress);
  await assert.rejects(
    () => tezos.estimate.transfer(contract.methodsObject.mint({
      to_: administrator,
      token_id: 2,
      amount: 1,
    }).toTransferParams()),
    /BLIND_USE_ATOMIC_ISSUE/,
  );
  return "Separate blind LE wrapper mint rejected by Shadownet simulation because blind issuance and its finite sale must be atomic (BLIND_USE_ATOMIC_ISSUE)";
}

export type RavioliRotiniCapacityExpectation = Readonly<{
  contractAddress: string;
  projectId: number;
  maxSupply: number;
  minted: number;
  reserved: number;
  nextProjectId: number;
  nextTokenId: number;
  generatedTokenCount: number;
}>;

export type RavioliRotiniCapacityDependencyEvidence = Readonly<{
  fresh: Readonly<{
    rotini: Readonly<{
      contractAddress: string;
      nextTokenId: number;
      project0: Readonly<{
        projectId: number;
        maxSupply: number;
        minted: number;
      }>;
    }>;
  }>;
  liveCheck: Readonly<{
    rotini: Readonly<{
      contractAddress: string;
      nextProjectId: number;
      nextTokenId: number;
      project0: Readonly<{
        maxSupply: number | null;
        minted: number;
      }>;
    }>;
  }>;
  rotini: Readonly<{
    address: string;
    projectId: number;
    nextTokenId: number;
    generatedTokenIds: readonly number[];
  }>;
}>;

export function buildRavioliRotiniCapacityExpectation(
  dependencies: RavioliRotiniCapacityDependencyEvidence,
  expectedReserved: number,
): RavioliRotiniCapacityExpectation {
  const projectId = asSafeInteger(dependencies.rotini.projectId, "Ravioli Rotini project id");
  const maxSupply = asSafeInteger(
    dependencies.fresh.rotini.project0.maxSupply,
    "Ravioli Rotini evidence max supply",
  );
  const minted = asSafeInteger(
    dependencies.fresh.rotini.project0.minted,
    "Ravioli Rotini evidence minted",
  );
  const reserved = asSafeInteger(expectedReserved, "Ravioli Rotini expected reserved");
  const nextProjectId = asSafeInteger(
    dependencies.liveCheck.rotini.nextProjectId,
    "Ravioli Rotini authenticated next project id",
  );
  const nextTokenId = asSafeInteger(
    dependencies.liveCheck.rotini.nextTokenId,
    "Ravioli Rotini authenticated next token id",
  );
  const generatedTokenIds = dependencies.rotini.generatedTokenIds.map((tokenId, index) =>
    asSafeInteger(tokenId, `Ravioli Rotini generated token id ${index}`)
  );

  assert.equal(
    dependencies.fresh.rotini.contractAddress,
    dependencies.rotini.address,
    "Ravioli Rotini package contract differs from fresh dependency evidence",
  );
  assert.equal(
    dependencies.liveCheck.rotini.contractAddress,
    dependencies.rotini.address,
    "Ravioli Rotini authenticated contract differs from package evidence",
  );
  assert.equal(
    dependencies.fresh.rotini.project0.projectId,
    projectId,
    "Ravioli Rotini package project differs from fresh dependency evidence",
  );
  assert.ok(
    nextProjectId > projectId,
    "Ravioli Rotini authenticated next project id does not include the packaged project",
  );
  assert.equal(
    dependencies.fresh.rotini.nextTokenId,
    nextTokenId,
    "Ravioli Rotini authenticated next token id differs from fresh dependency evidence",
  );
  assert.equal(
    dependencies.rotini.nextTokenId,
    nextTokenId,
    "Ravioli Rotini package next token id differs from authenticated live state",
  );
  assert.notEqual(
    dependencies.liveCheck.rotini.project0.maxSupply,
    null,
    "Ravioli Rotini authenticated project unexpectedly became uncapped",
  );
  assert.equal(
    asSafeInteger(
      dependencies.liveCheck.rotini.project0.maxSupply,
      "Ravioli Rotini authenticated max supply",
    ),
    maxSupply,
    "Ravioli Rotini authenticated max supply differs from fresh dependency evidence",
  );
  assert.equal(
    asSafeInteger(
      dependencies.liveCheck.rotini.project0.minted,
      "Ravioli Rotini authenticated minted",
    ),
    minted,
    "Ravioli Rotini authenticated minted count differs from fresh dependency evidence",
  );
  assert.deepEqual(
    generatedTokenIds,
    generatedTokenIds.map((_, index) => nextTokenId + index),
    "Ravioli Rotini generated token ids do not continue from the authenticated next token id",
  );

  return {
    contractAddress: dependencies.rotini.address,
    projectId,
    maxSupply,
    minted,
    reserved,
    nextProjectId,
    nextTokenId,
    generatedTokenCount: generatedTokenIds.length,
  };
}

export function assertRavioliRotiniCapacitySnapshot(input: {
  project: unknown;
  storage: unknown;
  expected: RavioliRotiniCapacityExpectation;
}): JsonObject {
  const project = input.project as JsonObject | undefined;
  const storage = input.storage as JsonObject;
  const expected = input.expected;
  for (const [label, value] of Object.entries({
    projectId: expected.projectId,
    maxSupply: expected.maxSupply,
    minted: expected.minted,
    reserved: expected.reserved,
    nextProjectId: expected.nextProjectId,
    nextTokenId: expected.nextTokenId,
    generatedTokenCount: expected.generatedTokenCount,
  })) {
    assert.ok(Number.isSafeInteger(value) && value >= 0, `expected Ravioli Rotini ${label} must be a non-negative safe integer`);
  }
  assert.ok(
    expected.reserved <= expected.generatedTokenCount,
    "expected Ravioli Rotini reservations exceed the generated-token requirement",
  );
  assert.ok(project, "fresh Ravioli Rotini project disappeared immediately before reservation");
  assert.equal(project.active, true, "fresh Ravioli Rotini project became inactive before reservation");
  const maxSupply = requiredOptionSafeInteger(project.max_supply, "fresh Ravioli Rotini project max supply");
  const minted = asSafeInteger(project.minted, "fresh Ravioli Rotini project minted");
  const reserved = asSafeInteger(project.reserved, "fresh Ravioli Rotini project reserved");
  const nextProjectId = asSafeInteger(storage.next_project_id, "fresh Ravioli Rotini next project id");
  const nextTokenId = asSafeInteger(storage.next_token_id, "fresh Ravioli Rotini next token id");
  assert.equal(maxSupply, expected.maxSupply, "fresh Ravioli Rotini project max supply drift");
  assert.equal(minted, expected.minted, "fresh Ravioli Rotini project minted count drift");
  assert.equal(reserved, expected.reserved, "fresh Ravioli Rotini project reservation count drift");
  assert.equal(nextProjectId, expected.nextProjectId, "fresh Ravioli Rotini next project id drift");
  assert.equal(nextTokenId, expected.nextTokenId, "fresh Ravioli Rotini next token id drift");
  const stillNeeded = expected.generatedTokenCount - expected.reserved;
  const remaining = maxSupply - minted - reserved;
  assert.ok(remaining >= 0, "fresh Ravioli Rotini project capacity counters exceed its max supply");
  assert.ok(remaining >= stillNeeded, "fresh Ravioli Rotini project no longer has capacity for both pack products");
  return {
    contract: expected.contractAddress,
    projectId: expected.projectId,
    active: true,
    maxSupply,
    minted,
    reserved,
    nextProjectId,
    nextTokenId,
    remaining,
    stillNeeded,
  };
}

export async function preflightRavioliRotiniCapacity(
  tezos: TezosToolkit,
  expected: RavioliRotiniCapacityExpectation,
): Promise<JsonObject> {
  assert.equal(await tezos.rpc.getChainId(), SHADOWNET_CHAIN_ID, "Ravioli Rotini capacity preflight is not on Shadownet");
  const contract = await tezos.contract.at(expected.contractAddress);
  assert.equal(contract.address, expected.contractAddress, "Ravioli Rotini capacity preflight resolved the wrong contract");
  const storage = await contract.storage() as JsonObject;
  const project = await boundedBigMapValue(storage.projects, expected.projectId);
  return {
    checkedAt: new Date().toISOString(),
    chainId: SHADOWNET_CHAIN_ID,
    ...assertRavioliRotiniCapacitySnapshot({ project, storage, expected }),
  };
}

async function assertFreshRotiniCapacity(
  tezos: TezosToolkit,
  dependencies: DependencyEvidence,
  expectedReserved: number,
): Promise<JsonObject> {
  return preflightRavioliRotiniCapacity(
    tezos,
    buildRavioliRotiniCapacityExpectation(dependencies, expectedReserved),
  );
}

export function ravioliOutlivingLeProbeDatetimeLocal(childEnd: string): string {
  const childEndMs = Date.parse(childEnd);
  assert.ok(Number.isFinite(childEndMs), "Ravioli LE rejection probe child expiry is invalid");
  const probeEndMs = childEndMs + PASTA_DATETIME_LOCAL_RESOLUTION_MS;
  assert.ok(
    probeEndMs <= PASTA_RFC3339_FOUR_DIGIT_CEILING_MS,
    "Ravioli LE rejection probe exceeds the four-digit browser timestamp ceiling",
  );
  return new Date(probeEndMs).toISOString().slice(0, 16);
}

export function countRavioliChainWriteReceipts(receipts: readonly PastaUiLivePublicReceipt[]): number {
  const writeActions = new Set(["originate", "call", "batch"]);
  return receipts.filter((receipt) => writeActions.has(receipt.action)).length;
}

async function assertOutlivingLimitedEditionRejectedByStudio(input: {
  page: Page;
  dependencies: DependencyEvidence;
  mirror: RavioliUiStateMirror;
  pins: readonly PinRecord[];
  session: TaquitoPastaUiLiveSession;
}): Promise<string> {
  const writeReceiptCount = countRavioliChainWriteReceipts(input.session.getReceipts());
  const pinCount = input.pins.length;
  await configurePack(input.page, 2, "", input.dependencies);
  await input.page.check('input[name="target"][value="new_collection"]');
  await input.page.fill(
    "#bnSaleEnd",
    ravioliOutlivingLeProbeDatetimeLocal(input.dependencies.gnocchi.limitedEdition.receipt.token.end),
  );
  const beforeLog = (await input.page.locator("#log").textContent()) || "";
  const beforeFailureCount = (beforeLog.match(/publish failed:/g) || []).length;
  await input.page.click("#btnPublish");
  const expected = "Ravioli primary sale must end before its earliest LE child public mint expiry";
  try {
    await input.page.waitForFunction(
      ({ expectedText, priorFailures }) => {
        const log = document.getElementById("log")?.textContent || "";
        return log.includes(expectedText) || (log.match(/publish failed:/g) || []).length > priorFailures;
      },
      { expectedText: expected, priorFailures: beforeFailureCount },
      { timeout: 300_000 },
    );
  } catch (error) {
    const log = (await input.page.locator("#log").textContent().catch(() => "")) || "";
    throw new Error(`Ravioli LE pre-write rejection did not resolve; studioLog=${JSON.stringify(log.slice(-2_000))}`, { cause: error });
  }
  const observedLog = (await input.page.locator("#log").textContent()) || "";
  if (!observedLog.includes(expected)) {
    throw new Error(`Ravioli LE pre-write rejection differed from policy; studioLog=${JSON.stringify(observedLog.slice(-2_000))}`);
  }
  await input.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
  assert.equal(input.pins.length, pinCount, "outliving LE wrapper rejection occurred after a durable pin");
  assert.equal(
    countRavioliChainWriteReceipts(input.session.getReceipts()),
    writeReceiptCount,
    "outliving LE wrapper rejection occurred after a chain write",
  );
  assert.equal(input.mirror.routerAddress, "", "outliving LE wrapper rejection originated a router");
  assert.equal(input.mirror.gnocchiAdapterAddress, "", "outliving LE wrapper rejection originated an allocation helper");
  assert.equal(input.mirror.rotiniAdapterAddress, "", "outliving LE wrapper rejection originated a generative helper");
  return "Ravioli Studio rejected a wrapper ending after its LE child before every pin and chain write";
}

export function shouldCaptureRavioliFailureRecovery(input: {
  publishRecoveryRecordBaseline: number;
  publishRecoveryRecordCount: number;
  writeReceiptBaseline: number;
  writeReceiptCount: number;
}): boolean {
  for (const [label, value] of [
    ["record baseline", input.publishRecoveryRecordBaseline],
    ["record count", input.publishRecoveryRecordCount],
    ["write baseline", input.writeReceiptBaseline],
    ["write count", input.writeReceiptCount],
  ] as const) {
    assert.ok(
      Number.isSafeInteger(value) && value >= 0,
      `Ravioli failure recovery ${label} is invalid`,
    );
  }
  return input.publishRecoveryRecordCount > input.publishRecoveryRecordBaseline
    || input.writeReceiptCount > input.writeReceiptBaseline;
}

export async function runRavioliUiLive(): Promise<RavioliUiLiveResult | RavioliCurrentV4PreflightResult> {
  assertRavioliUiLiveExecutionAllowed(process.env);
  const runRoot = path.resolve(process.env[OUTPUT_ENV] || "");
  const runId = path.basename(runRoot);
  const prewriteResume = process.env[PREWRITE_RESUME_FLAG] === "1";
  const controllerResume = process.env[CONTROLLER_RESUME_FLAG] === "1";
  const mode0MutationResume = process.env[MODE0_MUTATION_RESUME_FLAG] === "1";
  const currentV3Restart = process.env[CURRENT_V3_RESTART_FLAG] === "1";
  const currentV3PreflightOnly = process.env[CURRENT_V3_PREFLIGHT_ONLY_FLAG] === "1";
  const currentV4Resume = process.env[CURRENT_V4_RESUME_FLAG] === "1";
  const currentV4PreflightOnly = process.env[CURRENT_V4_PREFLIGHT_ONLY_FLAG] === "1";
  const currentV5Resume = process.env[CURRENT_V5_RESUME_FLAG] === "1";
  const currentV7Resume = process.env[CURRENT_V7_RESUME_FLAG] === "1";
  const currentResume = process.env[CURRENT_RESUME_FLAG] === "1";
  const currentV8PlanExtensionActivate =
    process.env[CURRENT_V8_PLAN_EXTENSION_ACTIVATE_FLAG] === "1";
  const packageResume = process.env[PACKAGE_RESUME_FLAG] === "1";
  let privateRecoveryOutputDirectory = packageResume
    ? null
    : process.env[PRIVATE_RECOVERY_OUTPUT_ENV]!.trim();
  if (privateRecoveryOutputDirectory) {
    privateRecoveryOutputDirectory = await validateRavioliPrivateRecoveryOutputDirectory({
      privateOutputDirectory: privateRecoveryOutputDirectory,
      publicProofRunRoot: runRoot,
    });
  }
  const appRoot = await requireRavioliDirectory(
    runRoot,
    prewriteResume
      || controllerResume
      || mode0MutationResume
      || currentV3Restart
      || currentV4Resume
      || currentV5Resume
      || currentV7Resume
      || currentResume
      || packageResume,
  );
  if (packageResume) {
    const resumedProof = await resumeRavioliUiLiveProofPackage({ appRoot, runRoot, runId });
    process.stdout.write(`${JSON.stringify({
      status: "PASSED",
      classification: "UI-LIVE-PACKAGE-RESUME",
      routerAddress: resumedProof.routerAddress,
      adapterAddresses: resumedProof.adapterAddresses,
      operationHashes: resumedProof.operationHashes,
      receiptPath: resumedProof.receiptPath,
      manifestPath: resumedProof.manifestPath,
    }, null, 2)}\n`);
    return resumedProof;
  }
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-ui-live.sock",
    authToken: "local-pasta-shadownet-ravioli-ui-live",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-ui-live-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.notEqual(signerSet.creator.address, signerSet.collector.address);
  assert.notEqual(signerSet.creator.address, signerSet.collectorTwo.address);
  const creatorTezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  const collectorOneTezos = buildToolkit(signerSet.collectorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Ravioli creator startup"),
    assertShadownet(collectorOneTezos, "Ravioli collector one startup"),
    assertShadownet(collectorTwoTezos, "Ravioli collector two startup"),
  ]);

  const ipfs = resolveIpfsProofConfig();
  const journalRoot = path.join(appRoot, "artifacts", "journal");
  let controllerJournal: RavioliUiLiveJournal | null = null;
  let mutationJournal: RavioliUiLiveJournal | null = null;
  let currentV3Journal: RavioliUiLiveJournal | null = null;
  let currentV4Journal: RavioliUiLiveJournal | null = null;
  let currentV5Journal: RavioliUiLiveJournal | null = null;
  let currentV7Journal: RavioliUiLiveJournal | null = null;
  let currentResumeJournal: RavioliUiLiveJournal | null = null;
  let mutationReplay: RavioliMode0MutationReplay | null = null;
  if (controllerResume) {
    controllerJournal = await openRavioliUiLiveJournal(journalRoot);
  }
  if (mode0MutationResume) {
    mutationJournal = await openRavioliUiLiveJournal(journalRoot);
    mutationReplay = await loadRavioliMode0MutationReplay({ journal: mutationJournal, ipfs });
    assert.equal(mutationReplay.identity.creatorAddress, signerSet.creator.address, "mode-0 recovery signer differs from the journal");
  }
  if (currentV3Restart) {
    currentV3Journal = await openRavioliUiLiveJournal(journalRoot);
  }
  if (currentV4Resume) {
    currentV4Journal = await openRavioliUiLiveJournal(journalRoot);
  }
  if (currentV5Resume) {
    currentV5Journal = await openRavioliUiLiveJournal(journalRoot);
  }
  if (currentV7Resume) {
    currentV7Journal = await openRavioliUiLiveJournal(journalRoot);
  }
  if (currentResume) {
    currentResumeJournal = await openRavioliUiLiveJournal(journalRoot);
  }

  const currentResumeArtifacts = currentResume ? await readArtifacts() : null;
  const currentResumeFresh = currentResume
    ? await loadFreshRavioliDependencies({
        runRoot,
        expectedRunId: runId,
        expectedCreator: signerSet.creator.address,
      })
    : null;
  const currentResumeTzktBaseline = currentResumeJournal?.intent.dependencyHashes.tzktBaseline;
  if (currentResume) {
    assert.match(
      currentResumeTzktBaseline || "",
      /^[0-9a-f]{64}$/,
      "current resume journal TzKT baseline hash is invalid",
    );
  }
  const currentResumeExpectedIdentity: RavioliCurrentResumeExpectedIdentity | null =
    currentResumeArtifacts && currentResumeFresh
      ? {
          actors: {
            creator: signerSet.creator.address,
            collector1: signerSet.collector.address,
            collector2: signerSet.collectorTwo.address,
          },
          dependencyAddresses: {
            gnocchi: currentResumeFresh.gnocchi.contractAddress,
            rotini: currentResumeFresh.rotini.contractAddress,
          },
          dependencyHashes: {
            gnocchiManifest: currentResumeFresh.gnocchi.manifestSha256,
            gnocchiReceipt: currentResumeFresh.gnocchi.receiptSha256,
            gnocchiScript: currentResumeFresh.gnocchi.scriptSha256,
            gnocchiScriptCode: currentResumeFresh.gnocchi.scriptCodeSha256,
            rotiniManifest: currentResumeFresh.rotini.manifestSha256,
            rotiniReceipt: currentResumeFresh.rotini.receiptSha256,
            rotiniScript: currentResumeFresh.rotini.scriptSha256,
            rotiniScriptCode: currentResumeFresh.rotini.scriptCodeSha256,
            tzktBaseline: currentResumeTzktBaseline!,
          },
          artifactHashes: {
            deploymentCertificate: currentResumeArtifacts.deploymentCertificateSha256,
            blindController: hashJsonForBridge(currentResumeArtifacts.blindController),
            router: hashJsonForBridge(currentResumeArtifacts.router),
            rotiniTarget: hashJsonForBridge(currentResumeArtifacts.rotiniTarget),
            gnocchiAdapter: hashJsonForBridge(currentResumeArtifacts.gnocchiAdapter),
            rotiniAdapter: hashJsonForBridge(currentResumeArtifacts.rotiniAdapter),
          },
        }
      : null;
  let currentResumePlan: RavioliCurrentResumePlan | null = null;
  let currentResumeBoundaryEventCount = 0;
  let currentResumeAuthenticatedStatePriming = false;
  if (currentResumeJournal) {
    assert.ok(currentResumeExpectedIdentity, "current resume expected identity is unavailable");
    currentResumePlan = await inspectRavioliCurrentResume({
      journal: currentResumeJournal,
      expected: currentResumeExpectedIdentity,
      ipfs,
      privateRecoveryRoot: privateRecoveryOutputDirectory || undefined,
    });
    assert.equal(currentResumePlan.classification, "CURRENT_SAFE_PREFIX");
    assert.ok(
      currentResumePlan.completedOperationCount === 9
        || currentResumePlan.completedOperationCount === 23,
      "current resume supports only the authenticated operation-9 or operation-23 boundaries",
    );
    currentResumeAuthenticatedStatePriming = currentResumePlan.completedOperationCount === 23;
    const expectedNextGlobalOperation = currentResumeAuthenticatedStatePriming ? 24 : 10;
    assert.equal(
      currentResumePlan.nextOperation?.globalOrdinal,
      expectedNextGlobalOperation,
      `current resume must continue with global operation ${expectedNextGlobalOperation}`,
    );
    assert.equal(currentResumePlan.nextOperation?.actor, "creator");
    assert.equal(
      currentResumePlan.nextOperation?.action,
      currentResumeAuthenticatedStatePriming ? "originate" : "call",
    );
    assert.equal(
      currentResumePlan.nextOperation?.entrypoint,
      currentResumeAuthenticatedStatePriming ? undefined : "create_pack",
    );
    assert.equal(
      currentResumePlan.nextOperation?.originRole,
      currentResumeAuthenticatedStatePriming ? "rotiniAdapter" : undefined,
    );
    assert.equal(
      currentResumePlan.pins.length,
      currentResumeAuthenticatedStatePriming ? 15 : 10,
      "current resume pin boundary drifted",
    );
    currentResumeBoundaryEventCount = (await currentResumeJournal.restartState()).eventCount;
    assert.equal(
      currentResumeBoundaryEventCount,
      currentResumeAuthenticatedStatePriming ? 85 : 38,
      "current resume journal event boundary drifted",
    );
  }
  const currentResumeRecovery: Readonly<
    | { kind: "v3"; value: RavioliCurrentV3RestartRecovery }
    | { kind: "v6"; value: RavioliCurrentV6ResumeRecovery }
  > | null = currentResumePlan
    ? (() => {
        const routerAddress = currentResumePlan.targetBindings.router;
        const mode0 = currentResumePlan.operations.find((operation) => operation.expected.globalOrdinal === 3);
        const mode1 = currentResumePlan.operations.find((operation) => operation.expected.globalOrdinal === 9);
        assert.ok(routerAddress, "current resume journal does not bind its router");
        assert.ok(mode0 && mode1, "current resume journal does not bind both Gnocchi operator operations");
        const mode0AppliedLevel = Number(mode0.evidence.level);
        const mode1AppliedLevel = Number(mode1.evidence.level);
        assert.ok(Number.isSafeInteger(mode0AppliedLevel) && mode0AppliedLevel > 0);
        assert.ok(Number.isSafeInteger(mode1AppliedLevel) && mode1AppliedLevel > mode0AppliedLevel);
        if (!currentResumeAuthenticatedStatePriming) {
          return {
            kind: "v3" as const,
            value: { routerAddress, mode0AppliedLevel, mode1AppliedLevel },
          };
        }
        const gnocchiAdapterAddress = currentResumePlan.targetBindings.gnocchiAdapter;
        const minter = currentResumePlan.operations.find(
          (operation) => operation.expected.globalOrdinal === 18,
        );
        const reservedMint = currentResumePlan.operations.find(
          (operation) => operation.expected.globalOrdinal === 22,
        );
        assert.ok(gnocchiAdapterAddress, "operation-23 resume does not bind its Gnocchi adapter");
        assert.ok(minter && reservedMint, "operation-23 resume is missing its Gnocchi reservation operations");
        assert.equal(reservedMint.expected.entrypoint, "commit_recipe");
        const minterAppliedLevel = Number(minter.evidence.level);
        const reservedMintAppliedLevel = Number(reservedMint.evidence.level);
        assert.ok(Number.isSafeInteger(minterAppliedLevel) && minterAppliedLevel > mode1AppliedLevel);
        assert.ok(Number.isSafeInteger(reservedMintAppliedLevel) && reservedMintAppliedLevel >= minterAppliedLevel);
        return {
          kind: "v6" as const,
          value: {
            routerAddress,
            gnocchiAdapterAddress,
            mode0AppliedLevel,
            mode1AppliedLevel,
            minterAppliedLevel,
            reservedMintAppliedLevel,
          },
        };
      })()
    : null;
  let currentResumeInitialScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentResumeFinalScreenshots: CapturePastaProofStageResult[] | null = null;
  if (currentResumePlan) {
    currentResumeInitialScreenshots = await loadExactRavioliUiLiveCurrentResumeScreenshots(appRoot);
  }

  // This read-only gate precedes every new pin or signer operation. Ordinary runs require a
  // completely fresh dependency state; the mutation lane accepts only its exact journaled
  // token-0 operator and no other Gnocchi/Rotini mutation.
  const dependencies = await validateRavioliDependencies(
    runRoot,
    runId,
    signerSet.creator.address,
    creatorTezos,
    currentResumeRecovery?.kind === "v6" ? {
      currentV6Resume: currentResumeRecovery.value,
    } : currentResumeRecovery?.kind === "v3" ? {
      currentV3Restart: currentResumeRecovery.value,
    } : currentV7Resume ? {
      currentV6Resume: {
        routerAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.routerAddress,
        gnocchiAdapterAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.gnocchiAdapterAddress,
        mode0AppliedLevel: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.mode0OperatorAppliedLevel,
        mode1AppliedLevel: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.mode1OperatorAppliedLevel,
        minterAppliedLevel: 4_331_065,
        reservedMintAppliedLevel: 4_331_087,
      },
    } : currentV5Resume ? {
      currentV5Resume: {
        routerAddress: RAVIOLI_CURRENT_V5_RESUME_IDENTITY.routerAddress,
        mode0AppliedLevel: RAVIOLI_CURRENT_V5_RESUME_IDENTITY.mode0OperatorAppliedLevel,
        mode1AppliedLevel: RAVIOLI_CURRENT_V5_RESUME_IDENTITY.mode1OperatorAppliedLevel,
      },
    } : currentV4Resume ? {
      currentV3Restart: {
        routerAddress: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.routerAddress,
        mode0AppliedLevel: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.operations[2].level,
        mode1AppliedLevel: RAVIOLI_CURRENT_V4_RESUME_IDENTITY.operations[8].level,
      },
    } : currentV3Restart ? {
      currentV3Restart: {
        routerAddress: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.routerAddress,
        mode0AppliedLevel: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.operations[2].level,
        mode1AppliedLevel: RAVIOLI_CURRENT_V3_RESTART_IDENTITY.operations[8].level,
      },
    } : mutationReplay ? {
      mode0Replay: {
        routerAddress: mutationReplay.routerAddress,
        appliedLevel: mutationReplay.operatorApprovalLevel,
      },
    } : {},
  );
  assert.equal(
    dependencies.fresh.gnocchi.scriptCodeSha256,
    RAVIOLI_FROZEN_DEPLOYMENT.gnocchiTarget.scriptCodeSha256,
    "Ravioli requires the exact current Gnocchi dependency code",
  );
  assert.equal(
    dependencies.fresh.rotini.scriptCodeSha256,
    RAVIOLI_FROZEN_DEPLOYMENT.rotiniTarget.scriptCodeSha256,
    "Ravioli requires a fresh recipient-independent Rotini dependency; superseded Rotini proofs are evidence-only",
  );
  const artifacts = currentResumeArtifacts || await readArtifacts();
  const recoveryDependencyHashes = {
    gnocchiManifest: dependencies.gnocchi.manifestSha256,
    gnocchiReceipt: dependencies.gnocchi.receiptSha256,
    gnocchiScript: dependencies.fresh.gnocchi.scriptSha256,
    gnocchiScriptCode: dependencies.fresh.gnocchi.scriptCodeSha256,
    rotiniManifest: dependencies.rotini.manifestSha256,
    rotiniReceipt: dependencies.rotini.receiptSha256,
    rotiniScript: dependencies.fresh.rotini.scriptSha256,
    rotiniScriptCode: dependencies.fresh.rotini.scriptCodeSha256,
  };
  const recoveryArtifactHashes = {
    deploymentCertificate: artifacts.deploymentCertificateSha256,
    blindController: hashJsonForBridge(artifacts.blindController),
    router: hashJsonForBridge(artifacts.router),
    rotiniTarget: hashJsonForBridge(artifacts.rotiniTarget),
    gnocchiAdapter: hashJsonForBridge(artifacts.gnocchiAdapter),
    rotiniAdapter: hashJsonForBridge(artifacts.rotiniAdapter),
  };
  let currentResumeVerifier: ReturnType<typeof createRavioliCurrentResumeLiveVerifier> | null = null;
  if (currentResumePlan) {
    assert.ok(currentResumeJournal && currentResumeExpectedIdentity);
    const gnocchiArtifact = JSON.parse(
      (await readFile(dependencies.fresh.gnocchi.scriptArtifactPath)).toString("utf8"),
    );
    assert.ok(Array.isArray(gnocchiArtifact), "current resume Gnocchi artifact is not Michelson code");
    const roleArtifacts: RavioliCurrentResumeRoleArtifacts = {
      blindController: artifacts.blindController,
      router: artifacts.router,
      gnocchi: gnocchiArtifact,
      gnocchiAdapter: artifacts.gnocchiAdapter,
      rotini: artifacts.rotiniTarget,
      rotiniAdapter: artifacts.rotiniAdapter,
    };
    currentResumeVerifier = createRavioliCurrentResumeLiveVerifier({ ipfs, roleArtifacts });
    currentResumePlan = await reconcileRavioliCurrentResume({
      journal: currentResumeJournal,
      expected: currentResumeExpectedIdentity,
      ipfs,
      verifier: currentResumeVerifier,
      privateRecoveryRoot: privateRecoveryOutputDirectory || undefined,
    });
    assert.equal(
      currentResumePlan.completedOperationCount,
      currentResumeAuthenticatedStatePriming ? 23 : 9,
    );
    assert.equal(
      currentResumePlan.nextOperation?.globalOrdinal,
      currentResumeAuthenticatedStatePriming ? 24 : 10,
    );
  }
  const currentResumeOpenKitIdentity = currentResumePlan
    ? await loadRavioliCurrentResumeOpenKitIdentity(appRoot)
    : null;
  const currentResumePrivateRecoveryIdentity = currentResumePlan
    ? ravioliPrivateRecoveryPublicIdentity(currentResumePlan.privateRecovery)
    : null;
  const currentResumeBoundarySnapshot: JsonObject | null = currentResumePlan
    ? {
        journalId: currentResumePlan.journalId,
        intentSha256: currentResumePlan.intentSha256,
        completedOperationCount: currentResumePlan.completedOperationCount,
        nextOperation: currentResumePlan.nextOperation,
        actorSequences: currentResumePlan.actorSequences,
        targetBindings: currentResumePlan.targetBindings,
        retainedOpenKits: currentResumeOpenKitIdentity,
        privateRecovery: currentResumePrivateRecoveryIdentity,
        pins: currentResumePlan.pins.map((pin) => ({
          eventIndex: pin.eventIndex,
          pinSequence: pin.pinSequence,
          fingerprint: pin.fingerprint,
          cid: pin.proof.cid,
          sha256: pin.proof.sha256,
          byteLength: pin.proof.byteLength,
        })),
        operations: currentResumePlan.operations.map((operation) => ({
          eventIndex: operation.eventIndex,
          globalOrdinal: operation.expected.globalOrdinal,
          descriptorSha256: operation.descriptorSha256,
          operationHash: operation.operationHash,
          contractAddress: operation.contractAddress,
          evidence: operation.evidence,
        })),
      }
    : null;
  let currentV7Replay: RavioliCurrentV7Resume | null = null;
  let currentV7InitialLive: JsonObject | null = null;
  let currentV7FinalLive: JsonObject | null = null;
  let currentV7InitialActors: RavioliJournalActorIntents | null = null;
  let currentV7FinalActors: RavioliJournalActorIntents | null = null;
  let currentV7InitialScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentV7FinalScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentV8PlanExtensionEvidence: JsonObject | null = null;
  if (currentV7Journal) {
    assert.ok(privateRecoveryOutputDirectory, "current-v7 requires its private recovery root");
    currentV7Replay = await loadRavioliCurrentV7Resume({
      journal: currentV7Journal,
      privateRecoveryRoot: privateRecoveryOutputDirectory,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
      },
    });
    currentV7InitialScreenshots = await loadExactRavioliUiLiveCurrentV7Screenshots(appRoot);
    currentV7InitialActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        currentV7InitialActors.creator.counters[lane].counter,
        currentV7Journal.intent.actors.creator.counters[lane].counter + 23,
        `current-v7 creator ${lane} counter drift`,
      );
      assert.equal(
        currentV7InitialActors.collector1.counters[lane].counter,
        currentV7Journal.intent.actors.collector1.counters[lane].counter + 3,
        `current-v7 collector one ${lane} counter drift`,
      );
      assert.equal(
        currentV7InitialActors.collector2.counters[lane].counter,
        currentV7Journal.intent.actors.collector2.counters[lane].counter + 1,
        `current-v7 collector two ${lane} counter drift`,
      );
    }
    currentV7InitialLive = await verifyRavioliCurrentV7ResumeLive({
      resume: currentV7Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      collectorOneAddress: signerSet.collector.address,
      collectorTwoAddress: signerSet.collectorTwo.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      gnocchiAdapterArtifact: artifacts.gnocchiAdapter,
      ipfs,
    });
  }
  let currentV5Replay: RavioliCurrentV5Resume | null = null;
  let currentV5InitialLive: JsonObject | null = null;
  let currentV5FinalLive: JsonObject | null = null;
  let currentV5InitialActors: RavioliJournalActorIntents | null = null;
  let currentV5FinalActors: RavioliJournalActorIntents | null = null;
  let currentV5InitialScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentV5FinalScreenshots: CapturePastaProofStageResult[] | null = null;
  if (currentV5Journal) {
    currentV5Replay = await loadRavioliCurrentV5Resume({
      journal: currentV5Journal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
      },
    });
    currentV5InitialScreenshots = await loadExactRavioliUiLiveCurrentV5Screenshots(appRoot);
    currentV5InitialActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        currentV5InitialActors.creator.counters[lane].counter,
        currentV5Journal.intent.actors.creator.counters[lane].counter + 14,
        `current-v5 creator ${lane} counter drift`,
      );
      assert.equal(
        currentV5InitialActors.collector1.counters[lane].counter,
        currentV5Journal.intent.actors.collector1.counters[lane].counter + 1,
        `current-v5 collector one ${lane} counter drift`,
      );
      assert.equal(
        currentV5InitialActors.collector2.counters[lane].counter,
        currentV5Journal.intent.actors.collector2.counters[lane].counter + 1,
        `current-v5 collector two ${lane} counter drift`,
      );
    }
    currentV5InitialLive = await verifyRavioliCurrentV5ResumeLive({
      resume: currentV5Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      collectorOneAddress: signerSet.collector.address,
      collectorTwoAddress: signerSet.collectorTwo.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
  }
  let currentV3Replay: RavioliCurrentV3Restart | null = null;
  let currentV3InitialLive: JsonObject | null = null;
  let currentV3FinalLive: JsonObject | null = null;
  let currentV3InitialActors: RavioliJournalActorIntents | null = null;
  let currentV3FinalActors: RavioliJournalActorIntents | null = null;
  let currentV3InitialScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentV3FinalScreenshots: CapturePastaProofStageResult[] | null = null;
  if (currentV3Journal) {
    currentV3Replay = await loadRavioliCurrentV3Restart({
      journal: currentV3Journal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
        controllerArtifact: artifacts.blindController,
        routerArtifact: artifacts.router,
      },
    });
    currentV3InitialScreenshots = await loadExactRavioliUiLiveCurrentV3Screenshots(appRoot);
    currentV3InitialActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        currentV3InitialActors.creator.counters[lane].counter,
        currentV3Replay.identity.creatorBaseCounter + 9,
        `current-v3 creator ${lane} counter drift`,
      );
      assert.equal(
        currentV3InitialActors.collector1.counters[lane].counter,
        currentV3Replay.identity.collectorOneBaseCounter,
        `current-v3 collector one ${lane} counter drift`,
      );
      assert.equal(
        currentV3InitialActors.collector2.counters[lane].counter,
        currentV3Replay.identity.collectorTwoBaseCounter,
        `current-v3 collector two ${lane} counter drift`,
      );
    }
    currentV3InitialLive = await verifyRavioliCurrentV3RestartLive({
      replay: currentV3Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
  }
  let currentV4Replay: RavioliCurrentV4Resume | null = null;
  let currentV4InitialLive: JsonObject | null = null;
  let currentV4FinalLive: JsonObject | null = null;
  let currentV4InitialActors: RavioliJournalActorIntents | null = null;
  let currentV4FinalActors: RavioliJournalActorIntents | null = null;
  let currentV4InitialScreenshots: CapturePastaProofStageResult[] | null = null;
  let currentV4FinalScreenshots: CapturePastaProofStageResult[] | null = null;
  if (currentV4Journal) {
    currentV4Replay = await loadRavioliCurrentV4Resume({
      journal: currentV4Journal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
        controllerArtifact: artifacts.blindController,
        routerArtifact: artifacts.router,
      },
    });
    currentV4InitialScreenshots = await loadExactRavioliUiLiveCurrentV4Screenshots(appRoot);
    currentV4InitialActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        currentV4InitialActors.creator.counters[lane].counter,
        currentV4Replay.identity.creatorBaseCounter + 9,
        `current-v4 creator ${lane} counter drift`,
      );
      assert.equal(
        currentV4InitialActors.collector1.counters[lane].counter,
        currentV4Replay.identity.collectorOneBaseCounter,
        `current-v4 collector one ${lane} counter drift`,
      );
      assert.equal(
        currentV4InitialActors.collector2.counters[lane].counter,
        currentV4Replay.identity.collectorTwoBaseCounter,
        `current-v4 collector two ${lane} counter drift`,
      );
    }
    currentV4InitialLive = await verifyRavioliCurrentV4ResumeLive({
      replay: currentV4Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
  }
  let controllerReplay: RavioliControllerResume | null = null;
  let controllerInitialLive: JsonObject | null = null;
  let controllerFinalLive: JsonObject | null = null;
  if (controllerJournal) {
    const controllerDependencyHashes = {
      gnocchiManifest: dependencies.gnocchi.manifestSha256,
      gnocchiReceipt: dependencies.gnocchi.receiptSha256,
      gnocchiScript: dependencies.fresh.gnocchi.scriptSha256,
      gnocchiScriptCode: dependencies.fresh.gnocchi.scriptCodeSha256,
      rotiniManifest: dependencies.rotini.manifestSha256,
      rotiniReceipt: dependencies.rotini.receiptSha256,
      rotiniScript: dependencies.fresh.rotini.scriptSha256,
      rotiniScriptCode: dependencies.fresh.rotini.scriptCodeSha256,
    };
    const controllerArtifactHashes = {
      deploymentCertificate: artifacts.deploymentCertificateSha256,
      blindController: hashJsonForBridge(artifacts.blindController),
      router: hashJsonForBridge(artifacts.router),
      rotiniTarget: hashJsonForBridge(artifacts.rotiniTarget),
      gnocchiAdapter: hashJsonForBridge(artifacts.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(artifacts.rotiniAdapter),
    };
    controllerReplay = await loadRavioliControllerResume({
      journal: controllerJournal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: controllerDependencyHashes,
        artifactHashes: controllerArtifactHashes,
        controllerArtifact: artifacts.blindController,
        routerArtifact: artifacts.router,
      },
    });
    controllerInitialLive = await verifyRavioliControllerResumeLive({
      replay: controllerReplay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      ipfs,
    });
  }
  let mutationInitialLive: JsonObject | null = null;
  let mutationFinalLive: JsonObject | null = null;
  if (mutationReplay) {
    mutationInitialLive = await verifyRavioliMode0MutationReplayLive({
      replay: mutationReplay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      routerArtifact: artifacts.router,
      ipfs,
    });
  }
  const placeholderUri = "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const currentResumeRemainingOriginationArtifacts: Array<readonly [unknown[], unknown]> = [];
  if (currentResumePlan) {
    if (!currentResumePlan.targetBindings.gnocchiAdapter) {
      currentResumeRemainingOriginationArtifacts.push([
        artifacts.gnocchiAdapter,
        adapterStorage(signerSet.creator.address, placeholderUri, "gnocchi"),
      ]);
    }
    if (!currentResumePlan.targetBindings.rotiniAdapter) {
      currentResumeRemainingOriginationArtifacts.push([
        artifacts.rotiniAdapter,
        adapterStorage(signerSet.creator.address, placeholderUri, "rotini"),
      ]);
    }
  }
  const remainingOriginationArtifacts = currentV7Replay
    ? [
        [artifacts.rotiniAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "rotini")],
      ] as const
    : currentResumePlan
    ? currentResumeRemainingOriginationArtifacts
    : mutationReplay || currentV3Replay || currentV4Replay || currentV5Replay
    ? [
        [artifacts.gnocchiAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "gnocchi")],
        [artifacts.rotiniAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "rotini")],
      ] as const
    : controllerReplay
      ? [
          [
            artifacts.router,
            routerStorage(
              signerSet.creator.address,
              placeholderUri,
              controllerReplay.controllerAddress,
            ),
          ],
          [artifacts.gnocchiAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "gnocchi")],
          [artifacts.rotiniAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "rotini")],
        ] as const
    : [
        [artifacts.blindController, blindControllerStorage(placeholderUri)],
        [
          artifacts.router,
          routerStorage(
            signerSet.creator.address,
            placeholderUri,
            dependencies.gnocchi.address,
          ),
        ],
        [artifacts.gnocchiAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "gnocchi")],
        [artifacts.rotiniAdapter, adapterStorage(signerSet.creator.address, placeholderUri, "rotini")],
      ] as const;
  let estimatedOriginations = 0;
  for (const [code, storage] of remainingOriginationArtifacts) {
    estimatedOriginations += await operationEstimateMutez(creatorTezos, code, storage);
  }
  const creatorRequired = estimatedOriginations + CREATOR_OPERATION_RESERVE_MUTEZ;
  const [creatorBalanceValue, collectorOneBalanceValue, collectorTwoBalanceValue] = await Promise.all([
    creatorTezos.tz.getBalance(signerSet.creator.address),
    collectorOneTezos.tz.getBalance(signerSet.collector.address),
    collectorTwoTezos.tz.getBalance(signerSet.collectorTwo.address),
  ]);
  const creatorBalance = Number(creatorBalanceValue.toString());
  const collectorOneBalance = Number(collectorOneBalanceValue.toString());
  const collectorTwoBalance = Number(collectorTwoBalanceValue.toString());
  if (creatorBalance < creatorRequired) {
    block("Ravioli UI-live creator is underfunded before any pin or chain write", [
      `Creator ${signerSet.creator.address} has ${creatorBalance} mutez; ${creatorRequired} is required.`,
      "No Ravioli pin or chain write was attempted.",
    ]);
  }
  for (const [label, balance] of [["collector one", collectorOneBalance], ["collector two", collectorTwoBalance]] as const) {
    if (balance < COLLECTOR_OPERATION_RESERVE_MUTEZ) {
      block(`Ravioli UI-live ${label} is underfunded before any pin or chain write`, [
        `${balance} mutez is below the ${COLLECTOR_OPERATION_RESERVE_MUTEZ} mutez proof floor.`,
      ]);
    }
  }
  // Repeat the complete same-run dependency gate after estimates and balance reads while
  // output/pinning/write access remains untouched. Any competing reservation, authorization,
  // mint, script, policy, or inventory change suppresses the fresh Ravioli run.
  const finalDependencyReaders = {
    readGnocchi: async (request) => (await readFreshGnocchiDependency({
      tezos: creatorTezos,
      request,
      evidence: dependencies.fresh,
      recoveryRouterAddress: currentResumeRecovery?.value.routerAddress || currentV7Replay?.routerAddress || currentV5Replay?.routerAddress || currentV4Replay?.routerAddress || currentV3Replay?.routerAddress,
      includeRecoveryRouterTokenOne: Boolean(
        currentResumeRecovery || currentV7Replay || currentV5Replay || currentV4Replay || currentV3Replay,
      ),
    })).snapshot,
    readRotini: async (request) => (await readFreshRotiniDependency({ tezos: creatorTezos, request, evidence: dependencies.fresh })).snapshot,
  };
  const finalDependencyLive = currentResumeRecovery?.kind === "v6"
    ? await recheckRavioliDependenciesForCurrentV6Resume(
        dependencies.fresh,
        finalDependencyReaders,
        currentResumeRecovery.value,
      )
    : currentResumeRecovery?.kind === "v3"
    ? await recheckRavioliDependenciesForCurrentV3Restart(
        dependencies.fresh,
        finalDependencyReaders,
        currentResumeRecovery.value,
      )
    : currentV7Replay
    ? await recheckRavioliDependenciesForCurrentV6Resume(
        dependencies.fresh,
        finalDependencyReaders,
        {
          routerAddress: currentV7Replay.routerAddress,
          gnocchiAdapterAddress: currentV7Replay.gnocchiAdapterAddress,
          mode0AppliedLevel: currentV7Replay.identity.mode0OperatorAppliedLevel,
          mode1AppliedLevel: currentV7Replay.identity.mode1OperatorAppliedLevel,
          minterAppliedLevel: 4_331_065,
          reservedMintAppliedLevel: 4_331_087,
        },
      )
    : currentV5Replay
    ? await recheckRavioliDependenciesForCurrentV5Resume(
        dependencies.fresh,
        finalDependencyReaders,
        {
          routerAddress: currentV5Replay.routerAddress,
          mode0AppliedLevel: currentV5Replay.identity.mode0OperatorAppliedLevel,
          mode1AppliedLevel: currentV5Replay.identity.mode1OperatorAppliedLevel,
        },
      )
    : currentV4Replay
    ? await recheckRavioliDependenciesForCurrentV3Restart(
        dependencies.fresh,
        finalDependencyReaders,
        {
          routerAddress: currentV4Replay.routerAddress,
          mode0AppliedLevel: currentV4Replay.identity.operations[2].level,
          mode1AppliedLevel: currentV4Replay.identity.operations[8].level,
        },
      )
    : currentV3Replay
    ? await recheckRavioliDependenciesForCurrentV3Restart(
        dependencies.fresh,
        finalDependencyReaders,
        {
          routerAddress: currentV3Replay.routerAddress,
          mode0AppliedLevel: currentV3Replay.identity.operations[2].level,
          mode1AppliedLevel: currentV3Replay.identity.operations[8].level,
        },
      )
    : mutationReplay
    ? await recheckRavioliDependenciesForMode0Replay(
        dependencies.fresh,
        finalDependencyReaders,
        {
          routerAddress: mutationReplay.routerAddress,
          appliedLevel: mutationReplay.operatorApprovalLevel,
        },
      )
    : await recheckFreshRavioliDependencies(dependencies.fresh, finalDependencyReaders);
  assert.deepEqual(finalDependencyLive.gnocchi, dependencies.liveCheck.gnocchi, "Gnocchi dependency changed before Ravioli writes");
  assert.deepEqual(finalDependencyLive.rotini, dependencies.liveCheck.rotini, "Rotini dependency changed before Ravioli writes");
  dependencies.liveCheck = finalDependencyLive;
  if (mutationReplay) {
    mutationFinalLive = await verifyRavioliMode0MutationReplayLive({
      replay: mutationReplay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      routerArtifact: artifacts.router,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(mutationFinalLive),
      stableRavioliMode0MutationLiveCheck(mutationInitialLive),
      "mode-0 recovery router/pin/operation state changed before continuation",
    );
  }
  if (controllerReplay) {
    controllerFinalLive = await verifyRavioliControllerResumeLive({
      replay: controllerReplay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(controllerFinalLive),
      stableRavioliMode0MutationLiveCheck(controllerInitialLive),
      "controller-resume contract/pin/operation state changed before continuation",
    );
  }
  if (currentV7Replay) {
    assert.ok(privateRecoveryOutputDirectory, "current-v7 requires its private recovery root");
    const reopenedJournal = await openRavioliUiLiveJournal(journalRoot);
    const reloadedReplay = await loadRavioliCurrentV7Resume({
      journal: reopenedJournal,
      privateRecoveryRoot: privateRecoveryOutputDirectory,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
      },
    });
    assert.deepEqual(reloadedReplay.operations, currentV7Replay.operations, "current-v7 journal operations changed before continuation");
    assert.deepEqual(
      reloadedReplay.activePins.map((pin) => pin.proof),
      currentV7Replay.activePins.map((pin) => pin.proof),
      "current-v7 journal pins changed before continuation",
    );
    assert.equal(reloadedReplay.fileCount, currentV7Replay.fileCount, "current-v7 file boundary changed before continuation");
    currentV7Journal = reopenedJournal;
    currentV7Replay = reloadedReplay;
    currentV7FinalScreenshots = await loadExactRavioliUiLiveCurrentV7Screenshots(appRoot);
    assert.deepEqual(
      currentV7FinalScreenshots,
      currentV7InitialScreenshots,
      "current-v7 screenshot/open-kit bytes changed before continuation",
    );
    currentV7FinalActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    assert.deepEqual(
      currentV7FinalActors,
      currentV7InitialActors,
      "current-v7 dual-RPC counters or mempools changed before continuation",
    );
    currentV7FinalLive = await verifyRavioliCurrentV7ResumeLive({
      resume: currentV7Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      collectorOneAddress: signerSet.collector.address,
      collectorTwoAddress: signerSet.collectorTwo.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      gnocchiAdapterArtifact: artifacts.gnocchiAdapter,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(currentV7FinalLive),
      stableRavioliMode0MutationLiveCheck(currentV7InitialLive),
      "current-v7 chain/IPFS state changed before continuation",
    );
    assert.equal(
      currentV8PlanExtensionActivate,
      true,
      "current-v7 authenticated boundary cannot continue without explicit event-87 activation",
    );
    const planExtensionAlreadyActive =
      currentV7Replay.planExtensionBoundary !== null;
    const extension =
      await currentV7Journal!.appendAuthenticatedPostEvent86PlanExtension();
    assert.equal(
      extension.appended,
      !planExtensionAlreadyActive,
      "current-v7 plan-extension append/resume classification drift",
    );
    assert.equal(extension.eventIndex, 87);
    assert.equal(
      extension.path,
      "events/000087-plan_extension-creator.json",
    );
    if (currentV7Replay.planExtensionBoundary) {
      assert.equal(
        extension.recordSha256,
        currentV7Replay.planExtensionBoundary.recordSha256,
        "current-v7 resumed plan-extension hash drift",
      );
      assert.equal(
        extension.path,
        `events/${currentV7Replay.planExtensionBoundary.path}`,
        "current-v7 resumed plan-extension path drift",
      );
    }
    assert.equal(currentV7Journal!.hasPlanExtension(), true);
    assert.equal(currentV7Journal!.hasEffectivePlan(), true);
    currentV8PlanExtensionEvidence = {
      schema: "pastaprotocol-ravioli-ui-live-plan-extension@1",
      provenance: planExtensionAlreadyActive
        ? "authenticated-event87-restart"
        : "authenticated-post-event86-extension",
      immutableBaseOperationCount: 66,
      effectiveOperationCount: 67,
      boundaryEventIndex: 86,
      extensionEventIndex: extension.eventIndex,
      extensionRecordSha256: extension.recordSha256,
      extensionPath: extension.path,
      appendedInThisExecution: extension.appended,
    };
  }
  if (currentV5Replay) {
    const reopenedJournal = await openRavioliUiLiveJournal(journalRoot);
    const reloadedReplay = await loadRavioliCurrentV5Resume({
      journal: reopenedJournal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
      },
    });
    assert.deepEqual(reloadedReplay.operations, currentV5Replay.operations, "current-v5 journal operations changed before continuation");
    assert.deepEqual(
      reloadedReplay.activePins.map((pin) => pin.proof),
      currentV5Replay.activePins.map((pin) => pin.proof),
      "current-v5 journal pins changed before continuation",
    );
    assert.equal(reloadedReplay.fileCount, currentV5Replay.fileCount, "current-v5 file boundary changed before continuation");
    currentV5Journal = reopenedJournal;
    currentV5Replay = reloadedReplay;
    currentV5FinalScreenshots = await loadExactRavioliUiLiveCurrentV5Screenshots(appRoot);
    assert.deepEqual(
      currentV5FinalScreenshots,
      currentV5InitialScreenshots,
      "current-v5 screenshot/open-kit bytes changed before continuation",
    );
    currentV5FinalActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    assert.deepEqual(
      currentV5FinalActors,
      currentV5InitialActors,
      "current-v5 dual-RPC counters or mempools changed before continuation",
    );
    currentV5FinalLive = await verifyRavioliCurrentV5ResumeLive({
      resume: currentV5Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      collectorOneAddress: signerSet.collector.address,
      collectorTwoAddress: signerSet.collectorTwo.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(currentV5FinalLive),
      stableRavioliMode0MutationLiveCheck(currentV5InitialLive),
      "current-v5 chain/IPFS state changed before continuation",
    );
  }
  if (currentV3Replay) {
    const reopenedJournal = await openRavioliUiLiveJournal(journalRoot);
    const reloadedReplay = await loadRavioliCurrentV3Restart({
      journal: reopenedJournal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
        controllerArtifact: artifacts.blindController,
        routerArtifact: artifacts.router,
      },
    });
    assert.deepEqual(
      ravioliCurrentV3RestartSnapshot(reloadedReplay),
      ravioliCurrentV3RestartSnapshot(currentV3Replay),
      "current-v3 journal bytes changed before continuation",
    );
    currentV3Journal = reopenedJournal;
    currentV3Replay = reloadedReplay;
    currentV3FinalScreenshots = await loadExactRavioliUiLiveCurrentV3Screenshots(appRoot);
    assert.deepEqual(
      currentV3FinalScreenshots,
      currentV3InitialScreenshots,
      "current-v3 screenshot/open-kit bytes changed before continuation",
    );
    currentV3FinalActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    assert.deepEqual(
      currentV3FinalActors,
      currentV3InitialActors,
      "current-v3 dual-RPC counters or mempools changed before continuation",
    );
    currentV3FinalLive = await verifyRavioliCurrentV3RestartLive({
      replay: currentV3Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(currentV3FinalLive),
      stableRavioliMode0MutationLiveCheck(currentV3InitialLive),
      "current-v3 chain/IPFS state changed before continuation",
    );
  }
  if (currentV4Replay) {
    const reopenedJournal = await openRavioliUiLiveJournal(journalRoot);
    const reloadedReplay = await loadRavioliCurrentV4Resume({
      journal: reopenedJournal,
      ipfs,
      expected: {
        creatorAddress: signerSet.creator.address,
        collectorOneAddress: signerSet.collector.address,
        collectorTwoAddress: signerSet.collectorTwo.address,
        dependencyAddresses: {
          gnocchi: dependencies.gnocchi.address,
          rotini: dependencies.rotini.address,
        },
        dependencyHashes: recoveryDependencyHashes,
        artifactHashes: recoveryArtifactHashes,
        controllerArtifact: artifacts.blindController,
        routerArtifact: artifacts.router,
      },
    });
    assert.deepEqual(
      ravioliCurrentV4ResumeSnapshot(reloadedReplay),
      ravioliCurrentV4ResumeSnapshot(currentV4Replay),
      "current-v4 journal bytes changed before continuation",
    );
    currentV4Journal = reopenedJournal;
    currentV4Replay = reloadedReplay;
    currentV4FinalScreenshots = await loadExactRavioliUiLiveCurrentV4Screenshots(appRoot);
    assert.deepEqual(
      currentV4FinalScreenshots,
      currentV4InitialScreenshots,
      "current-v4 screenshot/open-kit bytes changed before continuation",
    );
    currentV4FinalActors = await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
    assert.deepEqual(
      currentV4FinalActors,
      currentV4InitialActors,
      "current-v4 dual-RPC counters or mempools changed before continuation",
    );
    currentV4FinalLive = await verifyRavioliCurrentV4ResumeLive({
      replay: currentV4Replay,
      tezos: creatorTezos,
      creatorAddress: signerSet.creator.address,
      controllerArtifact: artifacts.blindController,
      routerArtifact: artifacts.router,
      ipfs,
    });
    assert.deepEqual(
      stableRavioliMode0MutationLiveCheck(currentV4FinalLive),
      stableRavioliMode0MutationLiveCheck(currentV4InitialLive),
      "current-v4 chain/IPFS state changed before continuation",
    );
  }
  if (currentV4PreflightOnly) {
    assert.ok(
      currentV4Replay && currentV4FinalLive && currentV4FinalActors,
      "current-v4 read-only preflight requires the authenticated boundary-40 resume",
    );
    assert.equal(currentV4Replay.journalPins.length, 12);
    assert.equal(currentV4Replay.operations.length, 9);
    assert.equal(currentV4Replay.fileCount, 72);
    const result: RavioliCurrentV4PreflightResult = {
      classification: "RAVIOLI-CURRENT-V4-READ-ONLY-PREFLIGHT",
      verifiedAt: new Date().toISOString(),
      journalId: currentV4Replay.identity.journalId,
      eventCount: 40,
      pinCount: 12,
      operationCount: 9,
      preRestartFileCount: currentV4Replay.fileCount,
      controllerAddress: currentV4Replay.controllerAddress,
      routerAddress: currentV4Replay.routerAddress,
      creatorCounter: currentV4FinalActors.creator.counters.primary.counter,
      dependencyClassification: "RAVIOLI-CURRENT-V4-RESUME",
      creatorBalanceMutez: creatorBalance,
      estimatedRemainingOriginationMutez: estimatedOriginations,
      live: currentV4FinalLive,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (currentV3PreflightOnly) {
    assert.ok(
      currentV3Replay && currentV3FinalLive && currentV3FinalActors,
      "current-v3 read-only preflight requires the authenticated restart boundary",
    );
    assert.equal(currentV3Replay.journalPins.length, 9);
    assert.equal(currentV3Replay.operations.length, 9);
    const result: RavioliCurrentV3PreflightResult = {
      classification: "RAVIOLI-CURRENT-V3-READ-ONLY-PREFLIGHT",
      verifiedAt: new Date().toISOString(),
      journalId: currentV3Replay.identity.journalId,
      eventCount: 37,
      pinCount: 9,
      operationCount: 9,
      preRestartFileCount: currentV3Replay.preRestartFileCount,
      controllerAddress: currentV3Replay.controllerAddress,
      routerAddress: currentV3Replay.routerAddress,
      creatorCounter: currentV3FinalActors.creator.counters.primary.counter,
      dependencyClassification: String((dependencies.liveCheck as JsonObject).classification || ""),
      creatorBalanceMutez: creatorBalance,
      estimatedRemainingOriginationMutez: estimatedOriginations,
      live: currentV3FinalLive,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (currentResumePlan) {
    assert.ok(currentResumeJournal && currentResumeExpectedIdentity && currentResumeVerifier && currentResumeBoundarySnapshot);
    const revalidated = await reconcileRavioliCurrentResume({
      journal: currentResumeJournal,
      expected: currentResumeExpectedIdentity,
      ipfs,
      verifier: currentResumeVerifier,
      privateRecoveryRoot: privateRecoveryOutputDirectory || undefined,
    });
    const revalidatedSnapshot: JsonObject = {
      journalId: revalidated.journalId,
      intentSha256: revalidated.intentSha256,
      completedOperationCount: revalidated.completedOperationCount,
      nextOperation: revalidated.nextOperation,
      actorSequences: revalidated.actorSequences,
      targetBindings: revalidated.targetBindings,
      retainedOpenKits: await loadRavioliCurrentResumeOpenKitIdentity(appRoot),
      privateRecovery: ravioliPrivateRecoveryPublicIdentity(revalidated.privateRecovery),
      pins: revalidated.pins.map((pin) => ({
        eventIndex: pin.eventIndex,
        pinSequence: pin.pinSequence,
        fingerprint: pin.fingerprint,
        cid: pin.proof.cid,
        sha256: pin.proof.sha256,
        byteLength: pin.proof.byteLength,
      })),
      operations: revalidated.operations.map((operation) => ({
        eventIndex: operation.eventIndex,
        globalOrdinal: operation.expected.globalOrdinal,
        descriptorSha256: operation.descriptorSha256,
        operationHash: operation.operationHash,
        contractAddress: operation.contractAddress,
        evidence: operation.evidence,
      })),
    };
    assert.deepEqual(revalidatedSnapshot, currentResumeBoundarySnapshot, "current resume live boundary changed before continuation");
    currentResumePlan = revalidated;
    currentResumeFinalScreenshots = await loadExactRavioliUiLiveCurrentResumeScreenshots(appRoot);
    assert.deepEqual(
      currentResumeFinalScreenshots,
      currentResumeInitialScreenshots,
      "current resume screenshot/open-kit inventory changed before continuation",
    );
  }
  const currentEntropyReplay = currentResumePlan && !currentResumeAuthenticatedStatePriming
    ? await loadRavioliCurrentEntropyReplay({ appRoot, plan: currentResumePlan })
    : null;
  const codeHashes = {
    deploymentCertificate: artifacts.deploymentCertificateSha256,
    blindController: hashJsonForBridge(artifacts.blindController),
    router: hashJsonForBridge(artifacts.router),
    rotiniTarget: hashJsonForBridge(artifacts.rotiniTarget),
    gnocchiAdapter: hashJsonForBridge(artifacts.gnocchiAdapter),
    rotiniAdapter: hashJsonForBridge(artifacts.rotiniAdapter),
  };
  const journalActors = currentV7FinalActors || currentV5FinalActors || currentV4FinalActors || currentV3FinalActors || await readRavioliJournalActorIntents({
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    });
  const dependencyAddresses = {
    gnocchi: dependencies.gnocchi.address,
    rotini: dependencies.rotini.address,
  };
  const stableDependencyHashes = {
    gnocchiManifest: dependencies.gnocchi.manifestSha256,
    gnocchiReceipt: dependencies.gnocchi.receiptSha256,
    gnocchiScript: dependencies.fresh.gnocchi.scriptSha256,
    gnocchiScriptCode: dependencies.fresh.gnocchi.scriptCodeSha256,
    rotiniManifest: dependencies.rotini.manifestSha256,
    rotiniReceipt: dependencies.rotini.receiptSha256,
    rotiniScript: dependencies.fresh.rotini.scriptSha256,
    rotiniScriptCode: dependencies.fresh.rotini.scriptCodeSha256,
  };
  let journal: RavioliUiLiveJournal;
  let startedAt: string;
  let resumedScreenshots: CapturePastaProofStageResult[] = [];
  if (currentResume) {
    assert.ok(currentResumeJournal && currentResumePlan && currentResumeFinalScreenshots);
    journal = currentResumeJournal;
    assert.equal(journal.isFinalized(), false, "current resume refuses a finalized journal");
    assert.equal(
      journal.getCompletedOperationCount(),
      currentResumeAuthenticatedStatePriming ? 23 : 9,
      "current resume applied-operation boundary drifted",
    );
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "current resume dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "current resume TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "current resume dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "current resume contract artifact drift");
    for (const lane of ["primary", "fallback"] as const) {
      for (const actor of ["creator", "collector1", "collector2"] as const) {
        const expectedCounter = journal.intent.actors[actor].counters[lane].counter
          + currentResumePlan.actorSequences[actor].applied
          + currentResumePlan.actorSequences[actor].counterOffset;
        assert.equal(
          journalActors[actor].counters[lane].counter,
          expectedCounter,
          `current resume ${actor} ${lane} counter drift`,
        );
      }
    }
    resumedScreenshots = currentResumeFinalScreenshots;
    startedAt = journal.intent.createdAt;
  } else if (currentV7Resume) {
    assert.ok(currentV7Journal && currentV7Replay && currentV7FinalScreenshots);
    journal = currentV7Journal;
    assert.equal(journal.isFinalized(), false, "current-v7 resume refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 23, "current-v7 resume requires exactly twenty-three applied operations");
    assert.equal(journal.hasCounterAdvance(), true, "current-v7 resume requires its authenticated counter advance");
    assert.equal(journal.getCounterOffset("creator"), 3);
    assert.equal(journal.getCounterOffset("collector1"), 1);
    assert.equal(journal.getCounterOffset("collector2"), 0);
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "current-v7 dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "current-v7 TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "current-v7 dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "current-v7 contract artifact drift");
    resumedScreenshots = currentV7FinalScreenshots;
    startedAt = journal.intent.createdAt;
  } else if (currentV5Resume) {
    assert.ok(currentV5Journal && currentV5Replay && currentV5FinalScreenshots);
    journal = currentV5Journal;
    assert.equal(journal.isFinalized(), false, "current-v5 resume refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 16, "current-v5 resume requires exactly sixteen applied operations");
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "current-v5 dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "current-v5 TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "current-v5 dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "current-v5 contract artifact drift");
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        journalActors.creator.counters[lane].counter,
        journal.intent.actors.creator.counters[lane].counter + 14,
        `current-v5 creator ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector1.counters[lane].counter,
        journal.intent.actors.collector1.counters[lane].counter + 1,
        `current-v5 collector one ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector2.counters[lane].counter,
        journal.intent.actors.collector2.counters[lane].counter + 1,
        `current-v5 collector two ${lane} counter drift`,
      );
    }
    resumedScreenshots = currentV5FinalScreenshots;
    startedAt = journal.intent.createdAt;
  } else if (currentV4Resume) {
    assert.ok(currentV4Journal && currentV4Replay && currentV4FinalScreenshots);
    journal = currentV4Journal;
    assert.equal(journal.isFinalized(), false, "current-v4 resume refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 9, "current-v4 resume requires exactly nine applied operations");
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "current-v4 dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "current-v4 TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "current-v4 dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "current-v4 contract artifact drift");
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        journalActors.creator.counters[lane].counter,
        journal.intent.actors.creator.counters[lane].counter + 9,
        `current-v4 creator ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector1.counters[lane].counter,
        journal.intent.actors.collector1.counters[lane].counter,
        `current-v4 collector one ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector2.counters[lane].counter,
        journal.intent.actors.collector2.counters[lane].counter,
        `current-v4 collector two ${lane} counter drift`,
      );
    }
    resumedScreenshots = currentV4FinalScreenshots;
    startedAt = journal.intent.createdAt;
  } else if (currentV3Restart) {
    assert.ok(currentV3Journal && currentV3Replay && currentV3FinalScreenshots);
    journal = currentV3Journal;
    assert.equal(journal.isFinalized(), false, "current-v3 restart refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 9, "current-v3 restart requires exactly nine applied operations");
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "current-v3 dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "current-v3 TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "current-v3 dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "current-v3 contract artifact drift");
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        journalActors.creator.counters[lane].counter,
        journal.intent.actors.creator.counters[lane].counter + 9,
        `current-v3 creator ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector1.counters[lane].counter,
        journal.intent.actors.collector1.counters[lane].counter,
        `current-v3 collector one ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector2.counters[lane].counter,
        journal.intent.actors.collector2.counters[lane].counter,
        `current-v3 collector two ${lane} counter drift`,
      );
    }
    resumedScreenshots = currentV3FinalScreenshots;
    startedAt = journal.intent.createdAt;
  } else if (controllerResume) {
    assert.ok(controllerJournal && controllerReplay);
    journal = controllerJournal;
    assert.equal(journal.isFinalized(), false, "controller resume refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 1, "controller resume requires exactly one applied operation");
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "controller-resume dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "controller-resume TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "controller-resume dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "controller-resume contract artifact drift");
    assert.equal(journal.intent.actors.creator.signerAddress, signerSet.creator.address);
    assert.equal(journal.intent.actors.collector1.signerAddress, signerSet.collector.address);
    assert.equal(journal.intent.actors.collector2.signerAddress, signerSet.collectorTwo.address);
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        journalActors.creator.counters[lane].counter,
        journal.intent.actors.creator.counters[lane].counter + 1,
        `controller-resume creator ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector1.counters[lane].counter,
        journal.intent.actors.collector1.counters[lane].counter,
        `controller-resume collector one ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector2.counters[lane].counter,
        journal.intent.actors.collector2.counters[lane].counter,
        `controller-resume collector two ${lane} counter drift`,
      );
    }
    resumedScreenshots = await loadExactRavioliUiLiveControllerResumeScreenshots(appRoot);
    startedAt = journal.intent.createdAt;
  } else if (mode0MutationResume) {
    assert.ok(mutationJournal && mutationReplay);
    journal = mutationJournal;
    assert.equal(journal.isFinalized(), false, "mode-0 mutation recovery refuses a finalized journal");
    assert.equal(journal.getCompletedOperationCount(), 2, "mode-0 mutation recovery requires exactly two applied operations");
    assert.deepEqual(journal.intent.dependencyAddresses, dependencyAddresses, "mode-0 mutation dependency address drift");
    const { tzktBaseline, ...journalStableDependencyHashes } = journal.intent.dependencyHashes;
    assert.match(tzktBaseline || "", /^[0-9a-f]{64}$/, "mode-0 mutation TzKT baseline hash is invalid");
    assert.deepEqual(journalStableDependencyHashes, stableDependencyHashes, "mode-0 mutation dependency hash drift");
    assert.deepEqual(journal.intent.artifactHashes, codeHashes, "mode-0 mutation contract artifact drift");
    assert.equal(journal.intent.actors.creator.signerAddress, signerSet.creator.address);
    assert.equal(journal.intent.actors.collector1.signerAddress, signerSet.collector.address);
    assert.equal(journal.intent.actors.collector2.signerAddress, signerSet.collectorTwo.address);
    for (const lane of ["primary", "fallback"] as const) {
      assert.equal(
        journalActors.creator.counters[lane].counter,
        journal.intent.actors.creator.counters[lane].counter + 2,
        `mode-0 mutation creator ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector1.counters[lane].counter,
        journal.intent.actors.collector1.counters[lane].counter,
        `mode-0 mutation collector one ${lane} counter drift`,
      );
      assert.equal(
        journalActors.collector2.counters[lane].counter,
        journal.intent.actors.collector2.counters[lane].counter,
        `mode-0 mutation collector two ${lane} counter drift`,
      );
    }
    resumedScreenshots = await loadExactRavioliUiLiveMode0MutationScreenshots(appRoot);
    startedAt = journal.intent.createdAt;
  } else if (prewriteResume) {
    journal = await openExactRavioliUiLivePrewriteJournal({
      journalRoot,
      expected: {
        actors: journalActors,
        dependencyAddresses,
        dependencyHashes: stableDependencyHashes,
        artifactHashes: codeHashes,
      },
    });
    resumedScreenshots = await loadExactRavioliUiLivePrewriteScreenshots(appRoot);
    startedAt = journal.intent.createdAt;
  } else {
    await claimFreshRavioliUiLiveOutputDirectory(appRoot);
    startedAt = new Date().toISOString();
    journal = await createRavioliUiLiveJournal({
      journalRoot,
      createdAt: startedAt,
      chainId: SHADOWNET_CHAIN_ID,
      actors: journalActors,
      dependencyAddresses,
      dependencyHashes: {
        ...stableDependencyHashes,
        tzktBaseline: sha256(deterministicJsonBytes(dependencies.tzkt)),
      },
      artifactHashes: codeHashes,
    });
  }
  const mutationRecoveryEvidence = mutationReplay
    ? await preserveRavioliMode0MutationRecoveryEvidence({
        appRoot,
        replay: mutationReplay,
        initialLive: mutationInitialLive!,
        finalLive: mutationFinalLive!,
      })
    : null;
  const memorySamples: RavioliUiLiveMemorySample[] = [
    sampleRavioliUiLiveMemory("dependencies-and-configuration-validated"),
  ];
  await mkdir(path.join(appRoot, "artifacts", "pins"), { recursive: true });

  const pins: PinRecord[] = currentResumePlan
    ? currentResumePlan.pins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : { bytes: Uint8Array.from(pin.bytes) }),
        proof: pin.proof,
      }))
    : currentV7Replay
    ? currentV7Replay.activePins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : { bytes: Uint8Array.from(pin.bytes) }),
        proof: pin.proof,
      }))
    : currentV5Replay
    ? currentV5Replay.activePins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : { bytes: Uint8Array.from(pin.bytes) }),
        proof: pin.proof,
      }))
    : currentV4Replay
    ? currentV4Replay.activePins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : {}),
        ...(pin.identity.kind === "wrapper" ? { bytes: Uint8Array.from(pin.bytes) } : {}),
        proof: pin.proof,
      }))
    : currentV3Replay
    ? currentV3Replay.activePins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : {}),
        ...(pin.identity.kind === "wrapper" ? { bytes: Uint8Array.from(pin.bytes) } : {}),
        proof: pin.proof,
      }))
    : controllerReplay
    ? controllerReplay.activePins.map((pin) => ({
        ...(pin.value !== undefined ? { value: pin.value } : {}),
        ...(pin.kind === "wrapper" ? { bytes: Uint8Array.from(pin.bytes) } : {}),
        proof: pin.proof,
      }))
    : mutationReplay
      ? [
        { bytes: Uint8Array.from(mutationReplay.activePins[0].bytes), proof: mutationReplay.activePins[0].proof },
        { value: mutationReplay.activePins[1].value, proof: mutationReplay.activePins[1].proof },
      ]
    : [];
  const mirror = new RavioliUiStateMirror();
  if (currentResumePlan) {
    const controllerAddress = currentResumePlan.targetBindings.blindController;
    const routerAddress = currentResumePlan.targetBindings.router;
    assert.ok(controllerAddress && routerAddress, "current resume plan does not bind both Ravioli contracts");
    mirror.setAdministrator(signerSet.creator.address);
    mirror.bindOrigination("blindController", controllerAddress);
    mirror.bindOrigination("router", routerAddress);
    if (currentResumePlan.targetBindings.gnocchiAdapter) {
      mirror.bindOrigination("gnocchiAdapter", currentResumePlan.targetBindings.gnocchiAdapter);
    }
    if (currentResumePlan.targetBindings.rotiniAdapter) {
      mirror.bindOrigination("rotiniAdapter", currentResumePlan.targetBindings.rotiniAdapter);
    }
    const signerByActor = {
      creator: signerSet.creator.address,
      collector1: signerSet.collector.address,
      collector2: signerSet.collectorTwo.address,
    } as const;
    for (const operation of currentResumePlan.operations) {
      if (operation.descriptor.kind === "call") {
        mirror.applySuccessfulCall(
          operation.descriptor.call.contractAddress,
          operation.descriptor.call.entrypoint,
          operation.descriptor.call.payload,
          signerByActor[operation.actor],
        );
      }
    }
    const recoveredPackCount = currentResumePlan.operations.filter(
      (operation) => operation.descriptor.kind === "call"
        && operation.descriptor.call.entrypoint === "create_pack",
    ).length;
    assert.equal(
      mirror.nextTokenId,
      recoveredPackCount,
      "current resume mirror did not recover every applied pack creation",
    );
    assert.equal(mirror.totalSupply.get(0), 1);
    assert.equal(mirror.sales.get(0)?.remaining, 1);
    if (currentResumeAuthenticatedStatePriming) {
      assert.equal(recoveredPackCount, 3);
      assert.equal(mirror.totalSupply.get(1), 2);
      assert.equal(mirror.totalSupply.get(2), 1);
      assert.equal(mirror.sales.get(1)?.remaining, 0);
      assert.equal(mirror.sales.get(2)?.remaining, 1);
      assert.equal(mirror.ledger.get(`${signerSet.collectorTwo.address}:1`), 2);
      assert.equal(mirror.gnocchiNextResourceId, 1);
    }
  } else if (currentV7Replay) {
    mirror.setAdministrator(signerSet.creator.address);
    mirror.bindOrigination("blindController", currentV7Replay.controllerAddress);
    mirror.bindOrigination("router", currentV7Replay.routerAddress);
    for (const operation of currentV7Replay.operations.slice(2)) {
      if (operation.identity.globalOrdinal === 17) {
        assert.equal(operation.descriptor.kind, "originate");
        mirror.bindOrigination("gnocchiAdapter", currentV7Replay.gnocchiAdapterAddress);
        continue;
      }
      assert.equal(operation.descriptor.kind, "call", "current-v7 recovered mutation must be a call");
      if (operation.descriptor.kind === "call") {
        mirror.applySuccessfulCall(
          operation.descriptor.call.contractAddress,
          operation.descriptor.call.entrypoint,
          operation.descriptor.call.payload,
          operation.identity.signerAddress,
        );
      }
    }
    assert.equal(mirror.nextTokenId, 3, "current-v7 mirror did not recover three issued products");
    assert.equal(mirror.totalSupply.get(0), 1);
    assert.equal(mirror.totalSupply.get(1), 2);
    assert.equal(mirror.totalSupply.get(2), 1);
    assert.equal(mirror.sales.get(0)?.remaining, 1);
    assert.equal(mirror.sales.get(1)?.remaining, 0);
    assert.equal(mirror.sales.get(2)?.remaining, 1);
    assert.equal(mirror.ledger.get(`${signerSet.creator.address}:0`), 1);
    assert.equal(mirror.ledger.get(`${signerSet.creator.address}:2`), 1);
    assert.equal(mirror.ledger.get(`${signerSet.collectorTwo.address}:1`), 2);
  } else if (currentV5Replay) {
    mirror.setAdministrator(signerSet.creator.address);
    mirror.bindOrigination("blindController", currentV5Replay.controllerAddress);
    mirror.bindOrigination("router", currentV5Replay.routerAddress);
    for (const operation of currentV5Replay.operations.slice(2)) {
      assert.equal(operation.descriptor.kind, "call", "current-v5 recovered mutation must be a call");
      if (operation.descriptor.kind === "call") {
        mirror.applySuccessfulCall(
          operation.descriptor.call.contractAddress,
          operation.descriptor.call.entrypoint,
          operation.descriptor.call.payload,
          operation.identity.signerAddress,
        );
      }
    }
    assert.equal(mirror.nextTokenId, 2, "current-v5 mirror did not recover both issued products");
    assert.equal(mirror.totalSupply.get(1), 3, "current-v5 mirror token-1 supply drift");
    assert.equal(mirror.sales.get(1)?.remaining, 1, "current-v5 mirror token-1 sale inventory drift");
    assert.equal(mirror.ledger.get(`${signerSet.collector.address}:1`), 1);
    assert.equal(mirror.ledger.get(`${signerSet.collectorTwo.address}:1`), 1);
  } else if (currentV4Replay) {
    mirror.setAdministrator(signerSet.creator.address);
    mirror.bindOrigination("blindController", currentV4Replay.controllerAddress);
    mirror.bindOrigination("router", currentV4Replay.routerAddress);
    for (const operation of currentV4Replay.operations.slice(3, 8)) {
      assert.equal(operation.descriptor.kind, "call", "current-v4 recovered router mutation must be a call");
      if (
        operation.descriptor.kind === "call"
        && operation.descriptor.call.contractAddress === currentV4Replay.routerAddress
      ) {
        mirror.applySuccessfulCall(
          operation.descriptor.call.contractAddress,
          operation.descriptor.call.entrypoint,
          operation.descriptor.call.payload,
          signerSet.creator.address,
        );
      }
    }
  } else if (currentV3Replay) {
    mirror.setAdministrator(signerSet.creator.address);
    mirror.bindOrigination("blindController", currentV3Replay.controllerAddress);
    mirror.bindOrigination("router", currentV3Replay.routerAddress);
    for (const operation of currentV3Replay.operations.slice(3, 8)) {
      assert.equal(operation.descriptor.kind, "call", "current-v3 recovered router mutation must be a call");
      if (
        operation.descriptor.kind === "call"
        && operation.descriptor.call.contractAddress === currentV3Replay.routerAddress
      ) {
        mirror.applySuccessfulCall(
          operation.descriptor.call.contractAddress,
          operation.descriptor.call.entrypoint,
          operation.descriptor.call.payload,
          signerSet.creator.address,
        );
      }
    }
  }
  if (controllerReplay) mirror.bindOrigination("blindController", controllerReplay.controllerAddress);
  if (mutationReplay) mirror.bindOrigination("router", mutationReplay.routerAddress);
  const policy = new RavioliUiLivePolicy({
    administrator: signerSet.creator.address,
    dependencies,
    mirror,
    pins,
    codeHashes,
  });
  let creatorRecoveryPage: Page | null = null;
  let mode1PreOp10Proof: RavioliMode1PreOp10Proof | null = null;
  let mode2PreOp24Proof: JsonObject | null = null;
  const verifyCurrentResumeMode1PreOp10Proof = (
    operation: RavioliCurrentResumePlan["operations"][number],
    openKit: PackKit,
  ): RavioliMode1PreOp10Proof => {
    assert.ok(currentResumePlan, "current resume mode-1 proof has no authenticated plan");
    assert.equal(operation.expected.globalOrdinal, 10);
    assert.equal(operation.descriptor.kind, "call");
    if (operation.descriptor.kind !== "call") assert.fail("current resume operation 10 is not a call");
    const call = operation.descriptor.call;
    assert.equal(call.entrypoint, "create_pack");
    assert.equal(openKit.contract, currentResumePlan.targetBindings.router);
    assert.equal(openKit.tokenId, 1);
    assert.ok(openKit.sealedReveal, "current resume mode-1 open kit has no sealed reveal reference");
    const payload = call.payload as JsonObject;
    const tokenMetadataUri = decodedUri(ravioliTokenInfoValue(
      payload.token_info,
      "",
      "current resume operation-10 token_info",
    ));
    const pinned = (uri: string, fileName: string) => {
      const matches = pins.filter((pin) =>
        pin.proof.uri === uri && pin.proof.fileName === fileName
      );
      assert.equal(matches.length, 1, `current resume ${fileName} needs one exact authenticated pin`);
      const pin = matches[0]!;
      assert.notEqual(pin.value, undefined, `current resume ${fileName} has no authenticated JSON value`);
      const bytes = pin.bytes || deterministicJsonBytes(pin.value);
      assert.equal(sha256(bytes), pin.proof.sha256, `current resume ${fileName} bytes drifted`);
      return { value: pin.value, bytes, proof: pin.proof };
    };
    return verifyRavioliMode1PreOp10PrivateProof({
      expected: {
        network: "shadownet",
        contract: currentResumePlan.targetBindings.router!,
        tokenId: 1,
      },
      openKit,
      manifest: pinned(openKit.manifestUri, "ravioli-pack-manifest.json"),
      envelope: pinned(openKit.sealedReveal.contentsUri, "ravioli-sealed-reveal-1.json"),
      tokenMetadata: pinned(tokenMetadataUri, "token.json"),
      operationTen: operation.descriptor,
    });
  };
  const verifyCurrentResumeMode2PreOp24Proof = (
    capture: RavioliOpenKitDownloadCapture,
  ): JsonObject => {
    assert.ok(currentResumePlan, "current resume mode-2 proof has no authenticated plan");
    assert.equal(currentResumePlan.completedOperationCount, 23);
    const routerAddress = currentResumePlan.targetBindings.router;
    const adapterAddress = currentResumePlan.targetBindings.gnocchiAdapter;
    assert.ok(routerAddress && adapterAddress, "current resume mode-2 proof is missing router/adapter bindings");
    const kit = capture.kit;
    assert.equal(kit.contract, routerAddress);
    assert.equal(kit.tokenId, 2);
    assert.equal(kit.mode, MODE_NAMES[2]);
    assert.ok(kit.sealedReveal, "current resume mode-2 open kit has no sealed reveal reference");

    const call = (ordinal: number, contractAddress: string, entrypoint: string) => {
      const operation = currentResumePlan!.operations.find(
        (candidate) => candidate.expected.globalOrdinal === ordinal,
      );
      assert.ok(operation, `current resume mode-2 proof is missing operation ${ordinal}`);
      assert.equal(operation.descriptor.kind, "call");
      if (operation.descriptor.kind !== "call") {
        assert.fail(`current resume operation ${ordinal} is not a call`);
      }
      assert.equal(operation.descriptor.call.contractAddress, contractAddress);
      assert.equal(operation.descriptor.call.entrypoint, entrypoint);
      return operation;
    };

    const allocationOperation = call(19, adapterAddress, "create_allocation");
    const allocation = allocationOperation.descriptor.call.payload as JsonObject;
    assert.deepEqual(allocation, {
      active: true,
      amount_per_open: 1,
      target: dependencies.gnocchi.address,
      token_id: dependencies.gnocchi.limitedAllocationTokenId,
    });
    const routerBindingOperation = call(20, adapterAddress, "add_router");
    assert.equal(routerBindingOperation.descriptor.call.payload, routerAddress);

    const creationOperation = call(21, routerAddress, "create_pack");
    const creation = creationOperation.descriptor.call.payload as JsonObject;
    assert.equal(Number(creation.expected_token_id), 2);
    const creationConfig = normalizePack(creation.config as JsonObject);
    assert.equal(creationConfig.mode, 2);
    assert.equal(creationConfig.blind, true);
    assert.equal(creationConfig.item_count, 1);
    assert.equal(creationConfig.max_supply, 1);
    assert.equal(decodedUri(creationConfig.manifest_uri), kit.manifestUri);
    assertRavioliSameInstantOrNull(
      creationConfig.child_expiry,
      kit.editionPolicy.earliestChildEnd,
      "current resume mode-2 child expiry differs from its retained open kit",
    );
    assertRavioliSameInstantOrNull(
      creationConfig.wrapper_sale_end,
      kit.editionPolicy.wrapperSaleEnd,
      "current resume mode-2 sale end differs from its retained open kit",
    );
    assertRavioliSameInstantOrNull(
      creationConfig.reveal_deadline,
      kit.editionPolicy.revealDeadline,
      "current resume mode-2 reveal deadline differs from its retained open kit",
    );
    assertRavioliSameInstantOrNull(
      creationConfig.open_deadline,
      kit.editionPolicy.openDeadline,
      "current resume mode-2 open deadline differs from its retained open kit",
    );
    const revealCommitment = ravioliRevealCommitment(
      kit.sealedReveal.contentsUri,
      kit.sealedReveal.salt,
      kit.sealedReveal.offset,
    );
    assert.equal(creationConfig.reveal_commitment, revealCommitment);

    const tokenMetadataUri = decodedUri(ravioliTokenInfoValue(
      creation.token_info,
      "",
      "current resume mode-2 token_info",
    ));
    const metadataPins = pins.filter((pin) =>
      pin.proof.uri === tokenMetadataUri && pin.proof.fileName === "token.json"
    );
    assert.equal(metadataPins.length, 1, "current resume mode-2 needs one exact token metadata pin");
    const metadata = metadataPins[0]!.value as JsonObject;
    const ravioliMetadata = metadata.ravioli as JsonObject;
    assert.equal(ravioliMetadata.mode, kit.mode);
    assert.equal(ravioliMetadata.manifestUri, kit.manifestUri);
    assert.equal(ravioliMetadata.sealedContentsUri, kit.sealedReveal.contentsUri);
    assert.equal(ravioliMetadata.revealCommitment, revealCommitment);
    const manifestPins = pins.filter((pin) =>
      pin.proof.uri === kit.manifestUri && pin.proof.fileName === "ravioli-pack-manifest.json"
    );
    assert.equal(manifestPins.length, 1, "current resume mode-2 needs one exact manifest pin");
    const envelopePin = ravioliContentsEvidencePin(pins, routerAddress, 2, kit);

    const commitOperation = call(22, routerAddress, "commit_recipe");
    const commit = commitOperation.descriptor.call.payload as JsonObject;
    assert.equal(Number(commit.token_id), 2);
    const recipe = kit.recipes[0]!;
    const action = recipe.actions[0] as JsonObject;
    assert.equal(action.kind, "allocated");
    const reservations = [{
      allocated_mint: {
        adapter: action.adapter,
        payload_commitment: action.payloadCommitment,
        resource_id: action.resourceId,
      },
    }];
    assert.deepEqual(commit.reservations, reservations);
    const nonceCommitment = ravioliUiLiveNonceCommitment(recipe.nonce);
    assert.equal(commit.nonce_commitment, nonceCommitment);
    const recipeCommitment = committedRecipeHash(nonceCommitment, reservations);
    assert.equal(mirror.recipeCommitments.get("2:0"), recipeCommitment);

    const finalizeOperation = call(23, routerAddress, "finalize_blind_pack");
    const finalize = finalizeOperation.descriptor.call.payload as JsonObject;
    assert.equal(Number(finalize.token_id), 2);
    const sale = finalize.sale as JsonObject;
    assert.equal(sale.active, true);
    assert.equal(sale.seller, signerSet.creator.address);
    assert.equal(sale.treasury, signerSet.creator.address);
    assert.equal(Number(sale.price), proofPackSpec(2)!.priceMutez);
    assert.equal(Number(sale.remaining), proofPackSpec(2)!.editions);
    assert.equal(sale.start, null);
    assertRavioliSameInstantOrNull(
      String(sale.end),
      kit.editionPolicy.wrapperSaleEnd,
      "current resume mode-2 atomic sale end differs from its retained open kit",
    );

    const recoveryKey = `pasta.ravioli.publish-recovery.v1:shadownet:${routerAddress}:2`;
    const recoveryRecord = currentResumePlan.privateRecovery?.records.find(
      (record) => record.storageKey === recoveryKey,
    );
    assert.ok(recoveryRecord, "current resume mode-2 canonical private recovery record is missing");
    assert.equal(recoveryRecord.status, "COMPLETE");
    assert.equal(recoveryRecord.workflow, "publish");
    assert.equal(recoveryRecord.stage, "PACK_READY");
    assert.equal(recoveryRecord.contract, routerAddress);
    assert.equal(recoveryRecord.tokenId, 2);
    assert.ok(
      recoveryRecord.operationHashes.includes(finalizeOperation.operationHash),
      "current resume mode-2 private recovery omits operation 23",
    );
    assert.equal(sha256(Buffer.from(recoveryRecord.value, "utf8")), recoveryRecord.sha256);
    const privateRecord = JSON.parse(recoveryRecord.value) as JsonObject;
    assert.equal(privateRecord.status, "COMPLETE");
    const history = privateRecord.history;
    assert.ok(Array.isArray(history) && history.length > 0);
    const terminal = history.at(-1) as JsonObject;
    assert.equal(terminal.stage, "PACK_READY");
    assert.equal(terminal.status, "COMPLETE");
    assert.ok(
      history.some((entry) =>
        Boolean(entry)
        && typeof entry === "object"
        && !Array.isArray(entry)
        && (entry as JsonObject).operationHash === finalizeOperation.operationHash
      ),
      "current resume mode-2 private record does not bind operation 23",
    );
    assert.deepEqual(
      Buffer.from(deterministicJsonBytes(privateRecord.kit)),
      Buffer.from(deterministicJsonBytes(kit)),
      "current resume mode-2 private recovery kit differs from its retained Studio download",
    );

    return {
      schema: "pastaprotocol-ravioli-mode2-pre-op24-private-proof@1",
      status: "PASSED",
      tokenId: 2,
      openKitSha256: capture.sha256,
      privateRecoveryRecordSha256: recoveryRecord.sha256,
      manifestSha256: manifestPins[0]!.proof.sha256,
      tokenMetadataSha256: metadataPins[0]!.proof.sha256,
      sealedEnvelopeSha256: envelopePin.proof.sha256,
      revealCommitment,
      nonceCommitment,
      recipeCommitment,
      operations: [
        allocationOperation,
        routerBindingOperation,
        creationOperation,
        commitOperation,
        finalizeOperation,
      ].map((operation) => ({
        globalOrdinal: operation.expected.globalOrdinal,
        operationHash: operation.operationHash,
      })),
    };
  };
  let currentV4OperationTenContext: RavioliCurrentV4OperationTenContext | null = null;
  const privateRecoveryCaptures: RavioliPrivateRecoveryCapture[] = [];
  const capturedFreshBlindTokenIds = new Set<number>();
  const capturePrivateRecovery = async (label: string): Promise<RavioliPrivateRecoveryCapture> => {
    assert.ok(creatorRecoveryPage, `Ravioli ${label} private recovery capture has no live Studio page`);
    assert.ok(privateRecoveryOutputDirectory, `Ravioli ${label} private recovery directory is unavailable`);
    const capture = await captureRavioliPrivateRecovery({
      page: creatorRecoveryPage,
      privateOutputDirectory: privateRecoveryOutputDirectory,
      publicProofRunRoot: runRoot,
    });
    privateRecoveryCaptures.push(capture);
    process.stderr.write(`[ravioli-private-recovery] ${JSON.stringify({ label, ...capture })}\n`);
    return capture;
  };
  const captureFreshBlindPrecommit = async (operation: PastaUiLivePreparedOperation): Promise<void> => {
    if (packageResume || operation.descriptor.kind !== "call") return;
    const call = operation.descriptor.call;
    if (call.entrypoint !== "create_pack" || !call.payload || typeof call.payload !== "object") return;
    const payload = call.payload as JsonObject;
    const config = payload.config as JsonObject | undefined;
    const mode = Number(config?.mode);
    if (!Number.isSafeInteger(mode) || mode < 1) return;
    const tokenId = Number(payload.expected_token_id);
    assert.ok(Number.isSafeInteger(tokenId) && tokenId >= 0, "fresh blind Ravioli token id is invalid");
    if (capturedFreshBlindTokenIds.has(tokenId)) return;
    await capturePrivateRecovery(`fresh-pre-token-${tokenId}`);
    capturedFreshBlindTokenIds.add(tokenId);
  };
  const authenticateCurrentResumeOperationTen = async (
    operation: PastaUiLivePreparedOperation,
  ): Promise<void> => {
    if (!currentResumePlan || operation.descriptor.kind !== "call") return;
    const call = operation.descriptor.call;
    if (call.entrypoint !== "create_pack") return;
    const payload = call.payload as JsonObject;
    const config = payload?.config as JsonObject | undefined;
    if (Number(config?.mode) !== 1 || Number(payload?.expected_token_id) !== 1) return;
    assert.equal(mode1PreOp10Proof, null, "current resume operation 10 was authenticated more than once");
    assert.ok(creatorRecoveryPage, "current resume operation-10 verifier has no live Studio page");
    const openKit = JSON.parse(await creatorRecoveryPage.locator("#openKit").inputValue()) as PackKit;
    mode1PreOp10Proof = verifyCurrentResumeMode1PreOp10Proof(
      currentResumePlan.operations.find(
        (candidate) => candidate.expected.globalOrdinal === 10,
      )!,
      openKit,
    );
  };
  const creatorJournalHooks = ravioliJournalSessionHooks({
    journal,
    actor: "creator",
    intent: journal.intent.actors.creator,
  });
  let currentV7FirstSemanticOperationPending = Boolean(currentV7Replay);
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: creatorTezos,
    signerAddress: signerSet.creator.address,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([
      dependencies.gnocchi.address,
      dependencies.rotini.address,
      ...(currentResumePlan
        ? Object.values(currentResumePlan.targetBindings).filter((address): address is string => Boolean(address))
        : []),
      ...(currentV7Replay ? [
        currentV7Replay.controllerAddress,
        currentV7Replay.routerAddress,
        currentV7Replay.gnocchiAdapterAddress,
      ] : []),
      ...(currentV5Replay ? [currentV5Replay.controllerAddress, currentV5Replay.routerAddress] : []),
      ...(currentV4Replay ? [currentV4Replay.controllerAddress, currentV4Replay.routerAddress] : []),
      ...(currentV3Replay ? [currentV3Replay.controllerAddress, currentV3Replay.routerAddress] : []),
      ...(controllerReplay ? [controllerReplay.controllerAddress] : []),
      ...(mutationReplay ? [mutationReplay.routerAddress] : []),
    ]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(creatorTezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    pinBlob: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
    validateOrigination: (input) => policy.validateOrigination(input),
    validateCall: (input) => policy.validateCall(input),
    projectStorage: (storage) => projectRavioliUiLiveStorage(storage, mirror),
    beforePin: async ({ value, bytes, fileName, mimeType }) => {
      policy.validatePin({ value, fileName, mimeType });
      await journal.beforePin({
        actor: "creator",
        fileName,
        mimeType,
        bytes,
      });
    },
    onPin: async ({ value, bytes, proof }) => {
      if (value !== undefined) assertNoDataUri(value, "creator pin");
      const exactBytes = bytes ? Uint8Array.from(bytes) : deterministicJsonBytes(value);
      await journal.appendPin({
        actor: "creator",
        fileName: proof.fileName,
        mimeType: proof.mimeType,
        bytes: exactBytes,
        expectedSha256: proof.sha256,
        expectedByteLength: proof.byteLength,
        metadata: {
          cid: proof.cid,
          uri: proof.uri,
          publicGatewayUrl: proof.publicGatewayUrl,
        },
      });
      pins.push({ ...(value !== undefined ? { value } : {}), ...(bytes ? { bytes: Uint8Array.from(bytes) } : {}), proof });
    },
    ...(currentResumePlan
      ? {
          initialOperationSequence: currentResumePlan.actorSequences.creator.applied,
          initialReceiptSequence: currentResumePlan.actorSequences.creator.applied,
        }
      : currentV7Replay
      ? { initialOperationSequence: 20, initialReceiptSequence: 20 }
      : currentV5Replay
      ? { initialOperationSequence: 14, initialReceiptSequence: 14 }
      : currentV4Replay
      ? { initialOperationSequence: 9, initialReceiptSequence: 9 }
      : currentV3Replay
      ? { initialOperationSequence: 9, initialReceiptSequence: 9 }
      : controllerReplay
      ? { initialOperationSequence: 1, initialReceiptSequence: 1 }
      : mutationReplay
        ? { initialOperationSequence: 2, initialReceiptSequence: 2 }
        : {}),
    beforeOperationSubmit: async (operation) => {
      if (currentV7FirstSemanticOperationPending) {
        assert.equal(operation.operationSequence, 21, "current-v7 first new creator sequence is not 21");
        assert.equal(operation.action, "originate", "current-v7 first new operation is not the Rotini adapter origination");
        assert.equal(operation.descriptor.kind, "originate", "current-v7 first new descriptor is not an origination");
      }
      await authenticateCurrentResumeOperationTen(operation);
      await captureFreshBlindPrecommit(operation);
      await creatorJournalHooks.beforeOperationSubmit(operation);
      currentV7FirstSemanticOperationPending = false;
    },
    onOperationSubmitted: creatorJournalHooks.onOperationSubmitted,
    assertOperationApplied: creatorJournalHooks.assertOperationApplied,
  });
  authorizeRavioliEscrowBalanceView(creatorSession, dependencies.gnocchi.address);
  creatorSession.authorizeAfterFundingPreflight(fundingAuthorization({
    balanceMutez: creatorBalance,
    requiredBalanceMutez: creatorRequired,
    estimatedOriginationMutez: estimatedOriginations,
    operationReserveMutez: CREATOR_OPERATION_RESERVE_MUTEZ,
  }));
  const creatorDelegateHandler = createRavioliMirroredSessionHandler({
    session: creatorSession,
    mirror,
    policy,
    signerAddress: signerSet.creator.address,
  });
  const unavailableCurrentResumeCollectorDelegate = async () => {
    throw new PastaUiLiveBridgeError(
      "current Ravioli replay collector delegate is unavailable before creator continuation",
      409,
    );
  };
  const currentResumeCoordinator: RavioliCurrentResumeCoordinator | null = currentResumePlan
      ? createRavioliCurrentResumeCoordinator({
          plan: currentResumePlan,
          primingMode: currentResumeAuthenticatedStatePriming
            ? "authenticated-state"
            : "browser-exact",
          delegates: {
          creator: creatorDelegateHandler,
          collector1: unavailableCurrentResumeCollectorDelegate,
          collector2: unavailableCurrentResumeCollectorDelegate,
        },
      })
    : null;
  const mutationInterceptor = mutationReplay
    ? createRavioliMode0MutationReplayInterceptor({ replay: mutationReplay, delegate: creatorDelegateHandler })
    : null;
  const controllerInterceptor = controllerReplay
    ? createRavioliControllerResumeInterceptor({ replay: controllerReplay, delegate: creatorDelegateHandler })
    : null;
  const currentV3Interceptor = currentV3Replay
    ? createRavioliCurrentV3RestartInterceptor({
        replay: currentV3Replay,
        delegate: creatorDelegateHandler,
        beforeDelegateOperationTen: async (context) => {
          assert.ok(creatorRecoveryPage, "current-v3 pre-op10 verifier has no live Studio page");
          const openKitText = await creatorRecoveryPage.locator("#openKit").inputValue();
          const openKit = JSON.parse(openKitText);
          mode1PreOp10Proof = verifyRavioliMode1PreOp10PrivateProof({
            expected: {
              network: "shadownet",
              contract: currentV3Replay.routerAddress,
              tokenId: 1,
            },
            openKit,
            manifest: context.manifest,
            envelope: context.envelope,
            tokenMetadata: context.tokenMetadata,
            operationTen: context.operationTen,
          });
          await capturePrivateRecovery("pre-op10");
        },
      })
    : null;
  const currentV4Interceptor = currentV4Replay
    ? createRavioliCurrentV4ResumeInterceptor({
        resume: currentV4Replay,
        delegate: creatorDelegateHandler,
        loadFreshPrivatePrecommit: async () => {
          assert.ok(creatorRecoveryPage, "current-v4 private precommit verifier has no live Studio page");
          const openKitText = await creatorRecoveryPage.locator("#openKit").inputValue();
          const openKit = JSON.parse(openKitText);
          const [
            creatorTokenZero,
            creatorTokenOne,
            routerTokenZero,
            routerTokenOne,
          ] = await Promise.all([
            readRavioliGnocchiBalanceView({
              tezos: creatorTezos,
              contractAddress: dependencies.gnocchi.address,
              owner: signerSet.creator.address,
              tokenId: 0,
              viewCaller: signerSet.creator.address,
              label: "current-v4 creator token 0 inventory",
            }),
            readRavioliGnocchiBalanceView({
              tezos: creatorTezos,
              contractAddress: dependencies.gnocchi.address,
              owner: signerSet.creator.address,
              tokenId: 1,
              viewCaller: signerSet.creator.address,
              label: "current-v4 creator token 1 inventory",
            }),
            readRavioliGnocchiBalanceView({
              tezos: creatorTezos,
              contractAddress: dependencies.gnocchi.address,
              owner: currentV4Replay.routerAddress,
              tokenId: 0,
              viewCaller: signerSet.creator.address,
              label: "current-v4 router token 0 inventory",
            }),
            readRavioliGnocchiBalanceView({
              tezos: creatorTezos,
              contractAddress: dependencies.gnocchi.address,
              owner: currentV4Replay.routerAddress,
              tokenId: 1,
              viewCaller: signerSet.creator.address,
              label: "current-v4 router token 1 inventory",
            }),
          ]);
          const inventory = {
            owner: signerSet.creator.address,
            router: currentV4Replay.routerAddress,
            fa2: dependencies.gnocchi.address,
            creatorBalances: [
              { tokenId: 0, amount: creatorTokenZero },
              { tokenId: 1, amount: creatorTokenOne },
            ],
            routerEscrowBalances: [
              { tokenId: 0, amount: routerTokenZero },
              { tokenId: 1, amount: routerTokenOne },
            ],
            existingCommittedRequirements: RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY.existingCommittedRequirements,
          };
          assert.deepEqual(
            inventory,
            RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
            "current-v4 live cumulative inventory differs from the authenticated boundary",
          );
          return { openKit, inventory };
        },
        beforeDelegateOperationTen: async (context) => {
          mode1PreOp10Proof = context.privateProof;
          await capturePrivateRecovery("pre-op10");
        },
      })
    : null;
  const retainedCurrentResumeCaptures: RavioliOpenKitDownloadCapture[] =
    currentResumePlan && currentResumeAuthenticatedStatePriming
      ? await loadRavioliCurrentResumeRetainedCaptures(
          appRoot,
          currentResumePlan.targetBindings.router!,
        )
      : [];
  const retainedCurrentV5Captures: RavioliOpenKitDownloadCapture[] = currentV7Replay
    ? currentV7Replay.openKits.map((entry) => {
        const text = Buffer.from(entry.bytes).toString("utf8");
        assert.ok(text.endsWith("\n"), `current-v6 retained open kit ${entry.tokenId} is not the exact Studio download`);
        return validateRavioliOpenKitDownload({
          mode: entry.tokenId,
          expectedTokenId: entry.tokenId,
          routerAddress: currentV7Replay!.routerAddress,
          suggestedFilename: entry.fileName,
          inPageJson: text.slice(0, -1),
          downloadedBytes: entry.bytes,
        });
      })
    : currentV5Replay
    ? currentV5Replay.openKits.map((entry) => {
        const text = Buffer.from(entry.bytes).toString("utf8");
        assert.ok(text.endsWith("\n"), `current-v5 retained open kit ${entry.tokenId} is not the exact Studio download`);
        return validateRavioliOpenKitDownload({
          mode: entry.tokenId,
          expectedTokenId: entry.tokenId,
          routerAddress: currentV5Replay!.routerAddress,
          suggestedFilename: entry.fileName,
          inPageJson: text.slice(0, -1),
          downloadedBytes: entry.bytes,
        });
      })
    : [];
  for (const capture of retainedCurrentResumeCaptures) {
    mirror.registerKit(capture.kit);
  }
  if (retainedCurrentResumeCaptures.length) {
    assert.equal(
      retainedCurrentResumeCaptures.length,
      mirror.nextTokenId,
      "current resume retained open kits do not cover every applied pack",
    );
    const operationTen = currentResumePlan!.operations.find(
      (operation) => operation.expected.globalOrdinal === 10,
    );
    assert.ok(operationTen, "current resume is missing operation 10 for its private proof");
    mode1PreOp10Proof = verifyCurrentResumeMode1PreOp10Proof(
      operationTen,
      retainedCurrentResumeCaptures[1]!.kit,
    );
    if (currentResumeAuthenticatedStatePriming) {
      assert.equal(
        retainedCurrentResumeCaptures.length,
        3,
        "operation-23 continuation requires three authenticated retained open kits",
      );
      mode2PreOp24Proof = verifyCurrentResumeMode2PreOp24Proof(
        retainedCurrentResumeCaptures[2]!,
      );
    }
  }
  for (const capture of retainedCurrentV5Captures) {
    mirror.registerKit(capture.kit);
  }
  const retainedCurrentV4Mode0Capture = currentV4Replay
    ? await loadRavioliCurrentV4RetainedMode0Capture(appRoot, currentV4Replay.routerAddress)
    : null;
  if (retainedCurrentV4Mode0Capture) {
    assert.ok(currentV4Interceptor, "current-v4 retained mode-0 capture requires its authenticated interceptor");
    mirror.registerKit(retainedCurrentV4Mode0Capture.kit);
    currentV4Interceptor.primeAuthenticatedMode0Prefix();
    assert.equal(currentV4Interceptor.getCompletedReplayStepCount(), 14);
    assert.equal(currentV4Interceptor.getRemainingReplayStepCount(), 2);
  }
  const creatorBridge = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: currentResumeCoordinator?.handles.creator
      || currentV4Interceptor?.handle
      || currentV3Interceptor?.handle
      || controllerInterceptor?.handle
      || mutationInterceptor?.handle
      || creatorDelegateHandler,
  });

  const screenshots: CapturePastaProofStageResult[] = [...resumedScreenshots];
  const kits: PackKit[] = retainedCurrentResumeCaptures.length
    ? retainedCurrentResumeCaptures.map((capture) => capture.kit)
    : retainedCurrentV5Captures.length
    ? retainedCurrentV5Captures.map((capture) => capture.kit)
    : retainedCurrentV4Mode0Capture
    ? [retainedCurrentV4Mode0Capture.kit]
    : [];
  const publicRevealUris: string[] = retainedCurrentResumeCaptures.length
    ? [ravioliPublicRevealPin(
        pins,
        mirror.routerAddress,
        0,
        retainedCurrentResumeCaptures[0]!.kit,
      ).proof.uri]
    : retainedCurrentV5Captures.length
    ? [ravioliPublicRevealPin(
        pins,
        mirror.routerAddress,
        0,
        retainedCurrentV5Captures[0]!.kit,
      ).proof.uri]
    : retainedCurrentV4Mode0Capture
    ? [ravioliPublicRevealPin(
        pins,
        mirror.routerAddress,
        0,
        retainedCurrentV4Mode0Capture.kit,
      ).proof.uri]
    : [];
  const openKitCaptures: RavioliOpenKitDownloadCapture[] = retainedCurrentResumeCaptures.length
    ? [...retainedCurrentResumeCaptures]
    : retainedCurrentV5Captures.length
    ? [...retainedCurrentV5Captures]
    : retainedCurrentV4Mode0Capture
    ? [retainedCurrentV4Mode0Capture]
    : [];
  let ordinal = screenshots.length;
  let creatorActor: ActorPage | null = null;
  let collectorOne: Awaited<ReturnType<typeof makeCollectorSession>> | null = null;
  let collectorTwo: Awaited<ReturnType<typeof makeCollectorSession>> | null = null;
  let buyerActor: ActorPage | null = null;
  let collectorOneStudioActor: ActorPage | null = null;
  let collectorTwoStudioActor: ActorPage | null = null;
  let limitedCommitHash = "";
  let generativeOpenHash = "";
  let hybridOpenHash = "";
  let withheldRefundKit: PackKit | null = null;
  let withheldRefundPurchaseCheckpoint: JsonObject | null = null;
  let withheldRefundOutcome: JsonObject | null = null;
  if (currentResumePlan && currentResumeAuthenticatedStatePriming) {
    const retainedLimitedCommit = currentResumePlan.operations.find(
      (operation) => operation.expected.globalOrdinal === 22,
    );
    assert.equal(retainedLimitedCommit?.descriptor.kind, "call");
    if (retainedLimitedCommit?.descriptor.kind === "call") {
      assert.equal(retainedLimitedCommit.descriptor.call.entrypoint, "commit_recipe");
      limitedCommitHash = retainedLimitedCommit.operationHash;
    }
  } else if (currentV7Replay) {
    const retainedLimitedCommit = currentV7Replay.operations[21];
    assert.equal(retainedLimitedCommit?.identity.globalOrdinal, 22);
    assert.equal(retainedLimitedCommit?.identity.entrypoints[0], "commit_recipe");
    limitedCommitHash = retainedLimitedCommit.identity.operationHash;
  }
  const retainedPrewriteNegativeAssertion = (
    prewriteResume
    || controllerResume
    || currentV3Restart
    || currentV4Resume
    || currentV5Resume
    || currentV7Resume
    || currentResume
  ) && resumedScreenshots.some(
    (screenshot) => screenshot.filenameStem === RAVIOLI_PREWRITE_NEGATIVE_SCREENSHOT_STEMS[2],
  );
  const negativeAssertions: string[] = (
    mutationReplay
    || controllerReplay
    || currentV3Replay
    || currentV4Replay
    || currentV5Replay
    || currentV7Replay
    || currentResumePlan
    || retainedPrewriteNegativeAssertion
  )
    ? ["Ravioli Studio rejected a wrapper ending after its LE child before every pin and chain write (retained from exact UI-LIVE screenshot and journal prefix evidence)"]
    : [];
  const capacityChecks: JsonObject[] = [];
  const wrapperPurchaseCheckpoints: JsonObject[] = [];
  const openDeliveryOutcomes: JsonObject[] = [];
  const failureRecoveryBaseline = {
    publishRecoveryRecordCount: 0,
    creatorWriteReceiptCount: countRavioliChainWriteReceipts(creatorSession.getReceipts()),
    collectorOneWriteReceiptCount: 0,
    collectorTwoWriteReceiptCount: 0,
  };
  try {
    creatorActor = await openStudioPage(
      creatorBridge,
      currentResumePlan?.privateRecovery || undefined,
    );
    creatorRecoveryPage = creatorActor.page;
    failureRecoveryBaseline.publishRecoveryRecordCount =
      await countRavioliPrivateRecoveryRecords(creatorRecoveryPage);
    await configureStudioBase(creatorActor.page, ipfs.apiUrl, dependencies);
    if (currentResumePlan && currentResumeAuthenticatedStatePriming) {
      assert.ok(mirror.gnocchiAdapterAddress, "operation-23 resume has no recovered Gnocchi adapter");
      await creatorActor.page.fill("#gAdapterKt", mirror.gnocchiAdapterAddress);
      if (mirror.rotiniAdapterAddress) {
        await creatorActor.page.fill("#rAdapterKt", mirror.rotiniAdapterAddress);
      } else {
        assert.equal(
          await creatorActor.page.inputValue("#rAdapterKt"),
          "",
          "operation-23 resume must leave Rotini adapter empty until operation 24",
        );
      }
    }
    memorySamples.push(sampleRavioliUiLiveMemory("studio-configured"));
    if (!prewriteResume && !controllerResume && !mode0MutationResume && !currentV3Restart && !currentV4Resume && !currentV5Resume && !currentV7Resume && !currentResume) {
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "compose five atomic pack modes",
        stageName: "Same-run dependencies entered",
        focusSelector: "#adapterSetup",
        evidence: [{ selector: "h1", expectedText: "Ravioli" }, { selector: "#adapterSetup", expectedText: "Automatic allocation" }],
      }));
    }
    await connectStudio(creatorActor.page, signerSet.creator.address);
    if (!prewriteResume && !controllerResume && !mode0MutationResume && !currentV3Restart && !currentV4Resume && !currentV5Resume && !currentV7Resume && !currentResume) {
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "compose five atomic pack modes",
        stageName: "Creator connected on Shadownet",
        focusSelector: "#account",
        evidence: [{ selector: "#account", expectedText: signerSet.creator.address.slice(0, 7) }, { selector: "#log", expectedText: "on shadownet" }],
      }));
    }

    if (!mutationReplay && !retainedPrewriteNegativeAssertion) {
      negativeAssertions.push(await assertOutlivingLimitedEditionRejectedByStudio({
        page: creatorActor.page,
        dependencies,
        mirror,
        pins,
        session: creatorSession,
      }));
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "limited-edition expiry deconfliction",
        stageName: "LE wrapper outliving child rejected before pins or writes",
        focusSelector: "#log",
        evidence: [
          { selector: "#log", expectedText: "Ravioli primary sale must end before its earliest LE child public mint expiry" },
          { selector: "h1", expectedText: "Ravioli" },
        ],
      }));
    }

    const publishMainMode = async (mode: number): Promise<void> => {
      if (mode === 3 || mode === 4) {
        capacityChecks.push(await assertFreshRotiniCapacity(creatorTezos, dependencies, mode === 3 ? 0 : 2));
      }
      if (mode === 2) {
        negativeAssertions.push(...await assertLimitedEditionPackPolicyRejected(
          creatorTezos,
          mirror.routerAddress,
          dependencies.gnocchi.limitedEdition.receipt.token.end,
        ));
      }
      await configurePack(creatorActor.page, mode, mirror.routerAddress, dependencies);
      const hasRetainedConfigurationScreenshot = (
        mode === 0
        && (currentResumePlan || controllerReplay || currentV3Replay || currentV4Replay)
      ) || (mode === 1 && (currentResumePlan || currentV4Replay));
      if (!hasRetainedConfigurationScreenshot) {
        screenshots.push(await captureStage({
          actor: creatorActor,
          outputRoot: runRoot,
          ordinal: ++ordinal,
          capability: "compose five atomic pack modes",
          stageName: mode === 0 && mutationReplay
            ? "deterministic vault reconfigured with public disclosure after exact recovery"
            : mode === 1 && (currentV3Replay || currentV4Replay)
              ? "blind funded pool reconfigured after superseded private precommit"
              : `${MODE_NAMES[mode]} configured`,
          focusSelector: mode === 0 && mutationReplay ? "#bnMysteryNote" : "#bnMode",
          evidence: mode === 0 && mutationReplay
            ? [
                { selector: "h1", expectedText: "Ravioli" },
                { selector: "#bnMysteryNote", expectedText: "Deterministic vault" },
              ]
            : [{ selector: "h1", expectedText: "Ravioli" }, { selector: "#adapterSetup", expectedText: "typed helper adapters" }],
        }));
      }
      const publishReceiptCount = creatorSession.getReceipts().length;
      if (mode === 0 && currentV3Replay) {
        await installRavioliCurrentV2NonceOverride(creatorActor.page);
      }
      if (currentEntropyReplay && (mode === 0 || mode === 1)) {
        await installRavioliCurrentEntropyReplay(creatorActor.page, currentEntropyReplay, mode);
      }
      const openKitCapture = await publishPack({
        page: creatorActor.page,
        mode,
        mirror,
        appRoot,
        priorCaptures: openKitCaptures,
        ...(currentResumePlan && (mode === 0 || mode === 1)
          ? { recordInMainCaptureProgress: false }
          : {}),
      });
      openKitCaptures.push(openKitCapture);
      kits.push(openKitCapture.kit);
      if (mode === 0 && currentV3Replay) {
        await assertRavioliCurrentV2NonceOverrideConsumed(creatorActor.page);
        assert.equal(
          openKitCapture.kit.recipes[0]?.nonce,
          RAVIOLI_CURRENT_V2_MODE0_NONCE,
          "current-v3 replay open-kit nonce drift",
        );
      }
      if (currentEntropyReplay && (mode === 0 || mode === 1)) {
        await assertRavioliCurrentEntropyReplayConsumed(creatorActor.page, mode);
      }
      if (mode === 0 && mutationInterceptor) {
        assert.equal(mutationInterceptor.isComplete(), true, "mode-0 recovery did not consume its exact four-step prefix");
        assert.equal(mutationInterceptor.getRemainingStepCount(), 0);
      }
      if (mode === 0 && controllerInterceptor) {
        assert.equal(
          controllerInterceptor.isComplete(),
          true,
          "controller resume did not consume its exact four-step browser prefix",
        );
        assert.equal(controllerInterceptor.getRemainingStepCount(), 0);
        assert.equal(
          controllerInterceptor.didDelegateRouter(),
          true,
          "controller resume did not make the router its first new mutation",
        );
      }
      if (mode === 0 && currentV3Interceptor) {
        assert.equal(currentV3Interceptor.isReplayComplete(), false, "current-v3 replay consumed mode-1 history during mode 0");
        assert.equal(currentV3Interceptor.getCompletedReplayStepCount(), 14);
        assert.equal(currentV3Interceptor.getRemainingReplayStepCount(), 2);
        assert.equal(currentV3Interceptor.continuationStage(), "replay-prefix");
      }
      if (mode === 0 && currentV4Interceptor) {
        assert.equal(currentV4Interceptor.isReplayComplete(), false, "current-v4 replay consumed mode-1 history during mode 0");
        assert.equal(currentV4Interceptor.getCompletedReplayStepCount(), 14);
        assert.equal(currentV4Interceptor.getRemainingReplayStepCount(), 2);
        assert.equal(currentV4Interceptor.continuationStage(), "replay-prefix");
      }
      if (mode === 0 && currentResumeCoordinator) {
        assert.equal(currentResumeCoordinator.isReplayComplete(), false, "current resume consumed mode-1 history during mode 0");
        assert.equal(currentResumeCoordinator.getCompletedReplayStepCount(), 14);
        assert.equal(currentResumeCoordinator.getRemainingReplayStepCount(), 5);
        assert.equal(currentResumeCoordinator.continuationStarted(), false);
      }
      const publishReceipts = creatorSession.getReceipts().slice(publishReceiptCount);
      if (mode === 0) {
        const reveal = ravioliPublicRevealPin(pins, mirror.routerAddress, 0, openKitCapture.kit);
        publicRevealUris[0] = reveal.proof.uri;
        assert.equal(decodedUri(mirror.packs.get(0)?.contents_uri), reveal.proof.uri);
      }
      if (mode === 2) {
        const limitedCommitReceipt = publishReceipts.find((receipt) => receipt.entrypoints?.includes("commit_recipe"));
        assert.ok(limitedCommitReceipt?.operationHash, "Ravioli LE pack commit receipt is missing");
        limitedCommitHash = limitedCommitReceipt.operationHash;
        assertRavioliSameInstantOrNull(
          openKitCapture.kit.editionPolicy.earliestChildEnd,
          dependencies.gnocchi.limitedEdition.receipt.token.end,
          "Ravioli LE open kit child expiry differs from the proven Gnocchi dependency",
        );
        assertRavioliSameInstantOrNull(
          openKitCapture.kit.editionPolicy.wrapperSaleEnd,
          dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd,
          "Ravioli LE open kit sale end differs from its bounded proof policy",
        );
        negativeAssertions.push(await assertLimitedEditionDirectMintRejected(
          creatorTezos,
          mirror.routerAddress,
          signerSet.creator.address,
        ));
        negativeAssertions.push(await assertOfficialLimitedEditionDependencyMismatchRejected({
          tezos: creatorTezos,
          routerAddress: mirror.routerAddress,
        }));
      }
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${mode}-published`));
      if (!(mode === 0 && (currentV4Replay || currentResumePlan))) {
        screenshots.push(await captureStage({
          actor: creatorActor,
          outputRoot: runRoot,
          ordinal: ++ordinal,
          capability: "compose five atomic pack modes",
          stageName: `${MODE_NAMES[mode]} funded and issued`,
          focusSelector: "#log",
          evidence: [{ selector: "#log", expectedText: `pack ${mode} is fully reserved and ready` }],
        }));
      }
    };

    // The semantic journal deliberately interleaves mode-1 collectors before helper
    // origination. This proves that blind claim ownership survives real transfers rather
    // than being reconstructed from a post-hoc, creator-only publication batch.
    if (currentResumePlan && currentResumeAuthenticatedStatePriming) {
      assert.equal(kits.length, 3, "operation-23 continuation must retain all three issued open kits");
      assert.equal(openKitCaptures.length, 3, "operation-23 continuation must retain all three Studio downloads");
    } else if (currentV7Replay) {
      assert.equal(kits.length, 3, "current-v7 continuation must retain all three issued open kits");
      assert.equal(openKitCaptures.length, 3, "current-v7 continuation must retain all three Studio downloads");
    } else if (currentV5Replay) {
      assert.equal(kits.length, 2, "current-v5 continuation must retain both issued open kits");
      assert.equal(openKitCaptures.length, 2, "current-v5 continuation must retain both Studio downloads");
    } else if (currentV4Interceptor) {
      assert.ok(retainedCurrentV4Mode0Capture, "current-v4 retained mode-0 product is missing");
      assert.equal(currentV4Interceptor.isReplayComplete(), false);
      assert.equal(currentV4Interceptor.getCompletedReplayStepCount(), 14);
      assert.equal(currentV4Interceptor.getRemainingReplayStepCount(), 2);
      assert.equal(currentV4Interceptor.continuationStage(), "replay-prefix");
    } else {
      await publishMainMode(0);
    }
    assert.ok(mirror.routerAddress && mirror.blindControllerAddress);
    authorizeRavioliControllerViews(
      creatorSession,
      mirror.blindControllerAddress,
      mirror.routerAddress,
    );
    if (!currentResumeAuthenticatedStatePriming && !currentV5Replay && !currentV7Replay) {
      await publishMainMode(1);
    }
    if (currentV3Interceptor) {
      assert.equal(currentV3Interceptor.isReplayComplete(), true, "current-v3 recovery prefix did not replay");
      assert.equal(currentV3Interceptor.getRemainingReplayStepCount(), 0);
      assert.equal(currentV3Interceptor.continuationStage(), "continued");
      assert.ok(currentV3Interceptor.freshRestartContext(), "current-v3 fresh mode-1 context was not retained");
      assert.ok(mode1PreOp10Proof, "current-v3 independent private pre-op10 proof was not retained");
      assert.ok(privateRecoveryCaptures.length >= 1, "current-v3 private recovery was not durable before operation 10");
    }
    if (currentV4Interceptor) {
      assert.equal(currentV4Interceptor.isReplayComplete(), true, "current-v4 recovery prefix did not replay");
      assert.equal(currentV4Interceptor.getRemainingReplayStepCount(), 0);
      assert.equal(currentV4Interceptor.continuationStage(), "continued");
      const operationTenContext = currentV4Interceptor.operationTenContext();
      assert.ok(operationTenContext, "current-v4 fresh operation-10 context was not retained");
      currentV4OperationTenContext = operationTenContext;
      assert.ok(mode1PreOp10Proof, "current-v4 independent private pre-op10 proof was not retained");
      assert.ok(privateRecoveryCaptures.length >= 1, "current-v4 private recovery was not durable before operation 10");
    }
    if (currentResumeCoordinator) {
      assert.equal(currentResumeCoordinator.isReplayComplete(), true, "current resume prefix did not replay completely");
      assert.equal(currentResumeCoordinator.getRemainingReplayStepCount(), 0);
      assert.equal(
        currentResumeCoordinator.continuationStarted(),
        !currentResumeAuthenticatedStatePriming,
        currentResumeAuthenticatedStatePriming
          ? "operation-23 resume crossed its signer boundary before operation 24"
          : "current resume did not delegate global operation 10",
      );
      assert.ok(
        privateRecoveryCaptures.length >= 1
          || Boolean(currentResumePlan?.privateRecovery?.records.length),
        "current resume has no authenticated private recovery before continuation",
      );
    }
    assert.ok(mirror.routerAddress && mirror.blindControllerAddress);

    collectorOne = await makeCollectorSession({
      tezos: collectorOneTezos,
      wallet: signerSet.collector,
      routerAddress: mirror.routerAddress,
      policy,
      mirror,
      ipfs,
      pins,
      balanceMutez: collectorOneBalance,
      journal,
      journalActor: "collector1",
      journalIntent: journal.intent.actors.collector1,
      ...(currentResumePlan
        ? {
            initialOperationSequence: currentResumePlan.actorSequences.collector1.applied,
            initialReceiptSequence: currentResumePlan.actorSequences.collector1.applied,
          }
        : currentV7Replay
        ? { initialOperationSequence: 2, initialReceiptSequence: 2 }
        : currentV5Replay
          ? { initialOperationSequence: 1, initialReceiptSequence: 1 }
          : {}),
    });
    failureRecoveryBaseline.collectorOneWriteReceiptCount =
      countRavioliChainWriteReceipts(collectorOne.session.getReceipts());
    collectorTwo = await makeCollectorSession({
      tezos: collectorTwoTezos,
      wallet: signerSet.collectorTwo,
      routerAddress: mirror.routerAddress,
      policy,
      mirror,
      ipfs,
      pins,
      balanceMutez: collectorTwoBalance,
      journal,
      journalActor: "collector2",
      journalIntent: journal.intent.actors.collector2,
      ...(currentResumePlan
        ? {
            initialOperationSequence: currentResumePlan.actorSequences.collector2.applied,
            initialReceiptSequence: currentResumePlan.actorSequences.collector2.applied,
          }
        : (currentV7Replay || currentV5Replay)
          ? { initialOperationSequence: 1, initialReceiptSequence: 1 }
          : {}),
    });
    failureRecoveryBaseline.collectorTwoWriteReceiptCount =
      countRavioliChainWriteReceipts(collectorTwo.session.getReceipts());

    collectorOneStudioActor = await openStudioPage(collectorOne.bridge);
    await configureStudioBase(collectorOneStudioActor.page, ipfs.apiUrl, dependencies);
    await connectStudio(collectorOneStudioActor.page, signerSet.collector.address);
    collectorTwoStudioActor = await openStudioPage(collectorTwo.bridge);
    await configureStudioBase(collectorTwoStudioActor.page, ipfs.apiUrl, dependencies);
    await connectStudio(collectorTwoStudioActor.page, signerSet.collectorTwo.address);

    const openBuyerFor = async (input: {
      collector: NonNullable<typeof collectorOne>;
      tokenId: number;
      kit: PackKit;
      discoverPublicReveal?: boolean;
    }): Promise<ActorPage> => {
      buyerActor = await openBuyerPage({
        bridge: input.collector.bridge,
        config: {
          app: "ravioli",
          label: "Ravioli",
          title: `Ravioli UI-LIVE ${input.kit.mode}`,
          description: "Independent collector purchase and atomic opening on Shadownet.",
          network: "shadownet",
          contract: mirror.routerAddress,
          tokenId: input.tokenId,
          ...(!input.discoverPublicReveal ? { openKit: input.kit } : {}),
          ipfsGateway: `${ipfs.publicGatewayUrl}/`,
        },
      });
      if (input.discoverPublicReveal) {
        assert.deepEqual(
          await buyerActor.page.evaluate(() => (window as any).__pastaInitialLocalStorageKeys),
          [],
          "portable Ravioli proof browser must start without a cached open kit",
        );
        await waitForText(
          buyerActor.page,
          "#actionDetail",
          "Open kit loaded from the authenticated encrypted on-chain reveal",
          30_000,
        );
        const { sealedReveal: _privateReveal, ...publicKit } = input.kit;
        assert.deepEqual(JSON.parse(await buyerActor.page.inputValue("#openKit")), publicKit);
      }
      await connectBuyer(buyerActor);
      return buyerActor;
    };

    const buyPack = async (input: {
      collector: NonNullable<typeof collectorOne>;
      tezos: TezosToolkit;
      wallet: PlatformWallet;
      tokenId: number;
      kit: PackKit;
      label: string;
      retainPage?: boolean;
      mainProduct?: boolean;
    }): Promise<ActorPage | null> => {
      const assertRemainingSaleWindow = async (stage: string): Promise<void> => {
        const saleEnd = input.kit.editionPolicy.wrapperSaleEnd;
        if (!saleEnd) return;
        const header = await input.tezos.rpc.getBlockHeader();
        assertRavioliPreBuyWindow({
          chainTimestamp: String(header.timestamp || ""),
          saleEnd,
          label: `Ravioli token ${input.tokenId} ${stage}`,
        });
      };
      await assertRemainingSaleWindow("before buyer-page initialization");
      const actor = await openBuyerFor({
        collector: input.collector,
        tokenId: input.tokenId,
        kit: input.kit,
      });
      await assertRemainingSaleWindow("before purchase submission");
      const purchaseReceiptCount = input.collector.session.getReceipts().length;
      await buyWrapper(actor);
      const purchaseReceipts = input.collector.session.getReceipts().slice(purchaseReceiptCount);
      const buyReceipt = purchaseReceipts.find((receipt) => receipt.entrypoints?.includes("buy"));
      assert.ok(buyReceipt?.operationHash, `Ravioli wrapper ${input.tokenId} purchase receipt is missing`);
      const checkpoint = await verifyIndexedWrapperPurchase({
        routerAddress: mirror.routerAddress,
        creator: signerSet.creator.address,
        collector: input.wallet.address,
        tokenId: input.tokenId,
        operationHash: buyReceipt.operationHash,
        expectedPriceMutez: proofPackSpec(input.tokenId)!.priceMutez,
      });
      if (input.mainProduct !== false) wrapperPurchaseCheckpoints.push(checkpoint);
      else withheldRefundPurchaseCheckpoint = checkpoint;
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${input.tokenId}-${input.label.replaceAll(" ", "-")}-bought`));
      screenshots.push(await captureStage({
        actor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: input.mainProduct === false
          ? "withheld reveal refund and permissionless closure"
          : "buy and atomically open five pack modes",
        stageName: `${input.label} bought ${input.kit.mode}`,
        focusSelector: "#chainState",
        evidence: [{ selector: "#title", expectedText: input.kit.mode }, { selector: "#status", expectedText: "Confirmed on Tezos" }],
      }));
      if (input.retainPage) return actor;
      await closeActor(actor);
      buyerActor = null;
      return null;
    };

    const openHeldPack = async (input: {
      collector: NonNullable<typeof collectorOne>;
      wallet: PlatformWallet;
      tokenId: number;
      kit: PackKit;
      serial: number;
      label: string;
      postOpenChainState: string;
      deliveries: Array<{
        contract: string;
        tokenId: number;
        amount: number;
        kind: string;
      }>;
      actor?: ActorPage;
      discoverPublicReveal?: boolean;
    }): Promise<void> => {
      const actor = input.actor || await openBuyerFor({
        collector: input.collector,
        tokenId: input.tokenId,
        kit: input.kit,
        discoverPublicReveal: input.discoverPublicReveal,
      });
      if (input.actor) buyerActor = actor;
      const receiptCount = input.collector.session.getReceipts().length;
      const childBalancesBefore = await Promise.all(input.deliveries.map(async (delivery) => ({
        ...delivery,
        before: await readRavioliIndexedChildBalance({
          contract: delivery.contract,
          tokenId: delivery.tokenId,
          owner: input.wallet.address,
          label: `pre-open Ravioli ${input.tokenId} ${delivery.kind}`,
        }),
      })));
      await openWrapper(actor, input.postOpenChainState);
      const newReceipts = input.collector.session.getReceipts().slice(receiptCount);
      const openReceipt = newReceipts.find((receipt) => receipt.entrypoints?.includes("open_pack"));
      assert.ok(openReceipt?.operationHash, `Ravioli wrapper ${input.tokenId} open receipt is missing`);
      if (input.tokenId === 3) generativeOpenHash = openReceipt.operationHash;
      if (input.tokenId === 4) hybridOpenHash = openReceipt.operationHash;
      openDeliveryOutcomes.push(await verifyRavioliOpenDeliveryOutcome({
        operationHash: openReceipt.operationHash,
        routerAddress: mirror.routerAddress,
        gnocchiAddress: dependencies.gnocchi.address,
        gnocchiAdapterAddress: mirror.gnocchiAdapterAddress,
        rotiniAddress: dependencies.rotini.address,
        rotiniAdapterAddress: mirror.rotiniAdapterAddress,
        collector: input.wallet.address,
        tokenId: input.tokenId,
        serial: input.serial,
        deliveries: childBalancesBefore,
      }));
      memorySamples.push(sampleRavioliUiLiveMemory(`pack-${input.tokenId}-${input.label.replaceAll(" ", "-")}-opened`));
      screenshots.push(await captureStage({
        actor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "buy and atomically open five pack modes",
        stageName: `${input.label} opened ${input.kit.mode}`,
        focusSelector: "#deliveryResult",
        evidence: [
          { selector: "#deliveryResult", expectedText: "Confirmed atomic delivery" },
          { selector: "#deliverySummary", expectedText: `Wrapper ${input.tokenId}, serial ${input.serial}` },
          { selector: "#chainState", expectedText: input.postOpenChainState },
          { selector: "#status", expectedText: "Confirmed on Tezos" },
        ],
      }));
      await closeActor(actor);
      buyerActor = null;
    };

    if (currentResumePlan && currentResumeAuthenticatedStatePriming) {
      const recoveredPurchases = [
        {
          operation: currentResumePlan.operations.find(
            (operation) => operation.expected.globalOrdinal === 14,
          ),
          collector: signerSet.collector.address,
          terminalBalance: 0,
        },
        {
          operation: currentResumePlan.operations.find(
            (operation) => operation.expected.globalOrdinal === 15,
          ),
          collector: signerSet.collectorTwo.address,
          terminalBalance: 2,
        },
      ];
      for (const recovered of recoveredPurchases) {
        assert.equal(recovered.operation?.descriptor.kind, "call");
        if (recovered.operation?.descriptor.kind !== "call") {
          assert.fail("operation-23 resume purchase descriptor is not a call");
        }
        assert.equal(recovered.operation.descriptor.call.entrypoint, "buy");
        wrapperPurchaseCheckpoints.push(await verifyIndexedWrapperPurchase({
          routerAddress: mirror.routerAddress,
          creator: signerSet.creator.address,
          collector: recovered.collector,
          tokenId: 1,
          operationHash: recovered.operation.operationHash,
          expectedPriceMutez: proofPackSpec(1)!.priceMutez,
          expectedIndexedBalance: recovered.terminalBalance,
          expectedOperationCounter: Number(recovered.operation.evidence.counter),
          balanceContext: "terminal-after-recovered-transfer",
        }));
      }
    } else if (currentV7Replay) {
      const recoveredPurchases = [
        {
          operation: currentV7Replay.operations[13]!,
          collector: signerSet.collector.address,
          terminalBalance: 0,
        },
        {
          operation: currentV7Replay.operations[14]!,
          collector: signerSet.collectorTwo.address,
          terminalBalance: 2,
        },
      ];
      for (const recovered of recoveredPurchases) {
        assert.equal(recovered.operation.identity.entrypoints[0], "buy", "current-v7 recovered purchase entrypoint drift");
        wrapperPurchaseCheckpoints.push(await verifyIndexedWrapperPurchase({
          routerAddress: mirror.routerAddress,
          creator: signerSet.creator.address,
          collector: recovered.collector,
          tokenId: 1,
          operationHash: recovered.operation.identity.operationHash,
          expectedPriceMutez: proofPackSpec(1)!.priceMutez,
          expectedIndexedBalance: recovered.terminalBalance,
          expectedOperationCounter: recovered.operation.identity.counter,
          balanceContext: "terminal-after-recovered-transfer",
        }));
      }
    } else if (currentV5Replay) {
      const recoveredPurchases = [
        {
          operation: currentV5Replay.operations[14]!,
          collector: signerSet.collector.address,
        },
        {
          operation: currentV5Replay.operations[15]!,
          collector: signerSet.collectorTwo.address,
        },
      ];
      for (const recovered of recoveredPurchases) {
        assert.equal(recovered.operation.identity.entrypoints[0], "buy", "current-v5 recovered purchase entrypoint drift");
        wrapperPurchaseCheckpoints.push(await verifyIndexedWrapperPurchase({
          routerAddress: mirror.routerAddress,
          creator: signerSet.creator.address,
          collector: recovered.collector,
          tokenId: 1,
          operationHash: recovered.operation.identity.operationHash,
          expectedPriceMutez: proofPackSpec(1)!.priceMutez,
        }));
      }
    } else {
      await buyPack({
        collector: collectorOne,
        tezos: collectorOneTezos,
        wallet: signerSet.collector,
        tokenId: 1,
        kit: kits[1],
        label: "collector one",
      });
      await buyPack({
        collector: collectorTwo,
        tezos: collectorTwoTezos,
        wallet: signerSet.collectorTwo,
        tokenId: 1,
        kit: kits[1],
        label: "collector two",
      });
    }
    if (!currentResumeAuthenticatedStatePriming && !currentV7Replay) {
      await transferRavioliWrapperViaStudio({
        actor: collectorOneStudioActor,
        routerAddress: mirror.routerAddress,
        tokenId: 1,
        recipient: signerSet.collectorTwo.address,
      });
      screenshots.push(await captureStage({
        actor: collectorOneStudioActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "blind claim preserving wrapper transfer",
        stageName: "collector one transferred an unopened blind claim",
        focusSelector: "#transferInfo",
        evidence: [
          { selector: "#transferInfo", expectedText: "One wrapper and blind claim" },
          { selector: "#ppNotice", expectedText: "Ravioli wrapper transfer confirmed" },
        ],
      }));
    }

    if (currentResumePlan && currentResumeAuthenticatedStatePriming) {
      await creatorActor.page.fill("#opKt", mirror.routerAddress);
      await creatorActor.page.fill("#opTokenId", "2");
      await creatorActor.page.click("#btnLoadBundle");
      await waitForText(
        creatorActor.page,
        "#opInfo",
        "blind_allocated_mint · 1 item(s) per open · live wrapper supply 1 · opened 0/1 · fully reserved",
        30_000,
      );
      await waitForText(
        creatorActor.page,
        "#publishRecoveryInfo",
        "Recovery checkpoint complete",
        30_000,
      );
      screenshots.push(await captureStage({
        actor: creatorActor,
        outputRoot: runRoot,
        ordinal: ++ordinal,
        capability: "compose five atomic pack modes",
        stageName: "blind_allocated_mint recovered funded and issued from authenticated chain state",
        focusSelector: "#opInfo",
        evidence: [
          {
            selector: "#opInfo",
            expectedText: "blind_allocated_mint · 1 item(s) per open · live wrapper supply 1 · opened 0/1 · fully reserved",
          },
          {
            selector: "#publishRecoveryInfo",
            expectedText: "Recovery checkpoint complete",
          },
        ],
      }));
    }

    if ((currentResumePlan && currentResumeAuthenticatedStatePriming) || currentV7Replay) {
      negativeAssertions.push(...await assertLimitedEditionPackPolicyRejected(
        creatorTezos,
        mirror.routerAddress,
        dependencies.gnocchi.limitedEdition.receipt.token.end,
      ));
      negativeAssertions.push(await assertLimitedEditionDirectMintRejected(
        creatorTezos,
        mirror.routerAddress,
        signerSet.creator.address,
      ));
      negativeAssertions.push(await assertOfficialLimitedEditionDependencyMismatchRejected({
        tezos: creatorTezos,
        routerAddress: mirror.routerAddress,
      }));
    } else {
      await publishMainMode(2);
    }
    await publishMainMode(3);
    if (currentResumeCoordinator && currentResumeAuthenticatedStatePriming) {
      assert.equal(
        currentResumeCoordinator.continuationStarted(),
        true,
        "operation-23 resume did not delegate the Rotini-adapter operation-24 continuation",
      );
    }
    assert.equal(currentV7FirstSemanticOperationPending, false, "current-v7 did not cross its Rotini-adapter continuation boundary");
    await publishMainMode(4);
    assert.ok(mirror.gnocchiAdapterAddress && mirror.rotiniAdapterAddress);
    for (const collector of [collectorOne, collectorTwo]) {
      authorizeRavioliCollectorReadSurface(collector.session, {
        gnocchiAdapterAddress: mirror.gnocchiAdapterAddress,
        rotiniAdapterAddress: mirror.rotiniAdapterAddress,
        gnocchiTargetAddress: dependencies.gnocchi.address,
        rotiniTargetAddress: dependencies.rotini.address,
      });
    }
    assert.equal(pins.filter((pin) => pin.proof.fileName.includes("pack-adapter-contract")).length, 2);

    const tokenZeroBuyer = await buyPack({
      collector: collectorOne,
      tezos: collectorOneTezos,
      wallet: signerSet.collector,
      tokenId: 0,
      kit: kits[0],
      label: "collector one",
      retainPage: true,
    });
    assert.ok(tokenZeroBuyer);
    await openHeldPack({
      collector: collectorOne,
      wallet: signerSet.collector,
      tokenId: 0,
      kit: kits[0],
      serial: 0,
      label: "collector one",
      postOpenChainState: "0 wrappers live · fully reserved",
      deliveries: [{ contract: dependencies.gnocchi.address, tokenId: 0, amount: 1, kind: "escrow" }],
      actor: tokenZeroBuyer,
    });

    if (ravioliSaleNeedsDeadlineWait(PACK_SPECS[1])) {
      await waitForRavioliChainTimestamp({
        tezos: creatorTezos,
        thresholdIso: String(kits[1].editionPolicy.wrapperSaleEnd),
        label: "Ravioli partial-sale reveal gate",
      });
    }
    publicRevealUris[1] = await revealBlindPack({
      actor: creatorActor,
      mirror,
      pins,
      kit: kits[1],
      tokenId: 1,
    });
    const modeOneOffset = kits[1].sealedReveal?.offset;
    assert.ok(Number.isSafeInteger(modeOneOffset));
    const transferredClaimSerial = Number(modeOneOffset) % PACK_SPECS[1].editions;
    const returnedClaimSerial = (1 + Number(modeOneOffset)) % PACK_SPECS[1].editions;
    const transferredEscrow = kits[1].recipes[transferredClaimSerial].actions[0];
    const returnedEscrow = kits[1].recipes[returnedClaimSerial].actions[0];
    assert.equal(transferredEscrow.kind, "escrow");
    assert.equal(returnedEscrow.kind, "escrow");
    await openHeldPack({
      collector: collectorTwo,
      wallet: signerSet.collectorTwo,
      tokenId: 1,
      kit: kits[1],
      serial: transferredClaimSerial,
      label: "collector two transferred-claim holder",
      postOpenChainState: "1 wrappers live · fully reserved · transfers freeze at the open cutoff",
      deliveries: [{
        contract: String(transferredEscrow.fa2),
        tokenId: Number(transferredEscrow.tokenId),
        amount: Number(transferredEscrow.amount),
        kind: "escrow-transferred-claim",
      }],
      discoverPublicReveal: true,
    });
    await transferRavioliWrapperViaStudio({
      actor: collectorTwoStudioActor,
      routerAddress: mirror.routerAddress,
      tokenId: 1,
      recipient: signerSet.collector.address,
    });
    screenshots.push(await captureStage({
      actor: collectorTwoStudioActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "blind claim preserving wrapper transfer",
      stageName: "collector two returned the remaining unopened blind claim",
      focusSelector: "#transferInfo",
      evidence: [
        { selector: "#transferInfo", expectedText: "One wrapper and blind claim" },
        { selector: "#ppNotice", expectedText: "Ravioli wrapper transfer confirmed" },
      ],
    }));
    await openHeldPack({
      collector: collectorOne,
      wallet: signerSet.collector,
      tokenId: 1,
      kit: kits[1],
      serial: returnedClaimSerial,
      label: "collector one returned-claim holder",
      postOpenChainState: "0 wrappers live · fully reserved · transfers freeze at the open cutoff",
      deliveries: [{
        contract: String(returnedEscrow.fa2),
        tokenId: Number(returnedEscrow.tokenId),
        amount: Number(returnedEscrow.amount),
        kind: "escrow-returned-claim",
      }],
    });

    const remainingOpenings = [
      {
        tokenId: 2,
        collector: collectorOne,
        tezos: collectorOneTezos,
        wallet: signerSet.collector,
        label: "collector one",
        deliveries: [{
          contract: dependencies.gnocchi.address,
          tokenId: dependencies.gnocchi.limitedAllocationTokenId,
          amount: 1,
          kind: "allocated",
        }],
      },
      {
        tokenId: 3,
        collector: collectorTwo,
        tezos: collectorTwoTezos,
        wallet: signerSet.collectorTwo,
        label: "collector two",
        deliveries: [
          { contract: dependencies.rotini.address, tokenId: dependencies.rotini.generatedTokenIds[0], amount: 1, kind: "generative" },
          { contract: dependencies.rotini.address, tokenId: dependencies.rotini.generatedTokenIds[1], amount: 1, kind: "generative" },
        ],
      },
      {
        tokenId: 4,
        collector: collectorOne,
        tezos: collectorOneTezos,
        wallet: signerSet.collector,
        label: "collector one",
        deliveries: [
          { contract: dependencies.gnocchi.address, tokenId: 1, amount: 2, kind: "escrow-plus-allocated" },
          { contract: dependencies.rotini.address, tokenId: dependencies.rotini.generatedTokenIds[2], amount: 1, kind: "generative" },
        ],
      },
    ] as const;
    for (const opening of remainingOpenings) {
      await buyPack({
        collector: opening.collector,
        tezos: opening.tezos,
        wallet: opening.wallet,
        tokenId: opening.tokenId,
        kit: kits[opening.tokenId],
        label: opening.label,
      });
      publicRevealUris[opening.tokenId] = await revealBlindPack({
        actor: creatorActor,
        mirror,
        pins,
        kit: kits[opening.tokenId],
        tokenId: opening.tokenId,
      });
      if (opening.tokenId === 2) {
        const holderClaim = mirror.resolveBlindClaim(
          opening.wallet.address,
          opening.tokenId,
        );
        negativeAssertions.push(await assertAllocatedPayloadSubstitutionRejected(
          collectorOneTezos,
          mirror.routerAddress,
          kits[2],
          holderClaim.expectedClaimId,
        ));
      }
      await openHeldPack({
        collector: opening.collector,
        wallet: opening.wallet,
        tokenId: opening.tokenId,
        kit: kits[opening.tokenId],
        serial: 0,
        label: opening.label,
        postOpenChainState: "0 wrappers live · fully reserved · transfers freeze at the open cutoff",
        deliveries: opening.deliveries.map((delivery) => ({ ...delivery })),
      });
    }

    assert.equal(publicRevealUris.length, kits.length);
    assert.ok(publicRevealUris.every((uri) => uri?.startsWith("ipfs://")));
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability:
        "decrypt exact pre-sale authenticated envelopes after key publication",
      stageName:
        "Blind reveal keys published for pre-sale encrypted envelopes",
      focusSelector: "#revealUri",
      evidence: [{ selector: ".pp-notice", expectedText: "Reveal key published" }, { selector: "h2", index: 5, expectedText: "Open / reveal" }],
    }));

    const withheldNow = Date.now();
    const withheldDeadlines = buildRavioliBlindDeadlines({
      kind: "withheld-reveal-test-fixture",
      nowMs: withheldNow,
    });
    await configurePack(
      creatorActor.page,
      WITHHELD_REFUND_PACK_SPEC.mode,
      mirror.routerAddress,
      dependencies,
      {
        tokenId: PACK_SPECS.length,
        deadlines: withheldDeadlines,
        titleSuffix: "Withheld Reveal Refund Probe",
      },
    );
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "withheld reveal refund and permissionless closure",
      stageName: "withheld-reveal blind allocation configured",
      focusSelector: "#bnRevealDeadline",
      evidence: [
        { selector: "#bnMode", expectedText: "" },
        { selector: "#bnRevealDeadline" },
        { selector: "#bnOpenDeadline" },
      ],
    }));
    const withheldCapture = await publishPack({
      page: creatorActor.page,
      mode: WITHHELD_REFUND_PACK_SPEC.mode,
      expectedTokenId: PACK_SPECS.length,
      mirror,
      appRoot,
      priorCaptures: openKitCaptures,
      recordInMainCaptureProgress: false,
    });
    withheldRefundKit = withheldCapture.kit;
    assert.equal(withheldRefundKit.editionPolicy.requiresLimitedWrapper, false);
    assert.equal(withheldRefundKit.editionPolicy.earliestChildEnd, null);
    assert.ok(withheldRefundKit.sealedReveal);
    publicRevealUris[PACK_SPECS.length] =
      withheldRefundKit.sealedReveal.contentsUri;
    ravioliContentsEvidencePin(
      pins,
      mirror.routerAddress,
      PACK_SPECS.length,
      withheldRefundKit,
    );
    await buyPack({
      collector: collectorOne,
      tezos: collectorOneTezos,
      wallet: signerSet.collector,
      tokenId: PACK_SPECS.length,
      kit: withheldRefundKit,
      label: "collector one withheld-reveal probe",
      mainProduct: false,
    });
    await waitForRavioliChainTimestamp({
      tezos: collectorTwoTezos,
      thresholdIso: String(withheldRefundKit.editionPolicy.revealDeadline),
      label: "Ravioli withheld-reveal refund gate",
    });
    negativeAssertions.push(await assertExpiredRavioliRevealRejected({
      tezos: creatorTezos,
      routerAddress: mirror.routerAddress,
      tokenId: PACK_SPECS.length,
      kit: withheldRefundKit,
    }));
    await creditExpiredRavioliRefundViaStudio({
      actor: collectorTwoStudioActor,
      routerAddress: mirror.routerAddress,
      tokenId: PACK_SPECS.length,
      holder: signerSet.collector.address,
    });
    screenshots.push(await captureStage({
      actor: collectorTwoStudioActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "withheld reveal refund and permissionless closure",
      stageName: "collector two permissionlessly credited collector one refund",
      focusSelector: "#ppNotice",
      evidence: [
        { selector: "#ppNotice", expectedText: "Expired claim burned and its refund credited" },
        { selector: "#opTokenId" },
      ],
    }));
    negativeAssertions.push(await assertRejectingRavioliRefundDestinationPreservesCredit({
      tezos: collectorOneTezos,
      controllerAddress: mirror.blindControllerAddress,
      rejectingDestination: mirror.routerAddress,
      amount: mirror.refundCredits.get(signerSet.collector.address) || 0,
    }));
    await cancelUnrevealedRavioliPackViaStudio({
      actor: collectorTwoStudioActor,
      routerAddress: mirror.routerAddress,
      tokenId: PACK_SPECS.length,
    });
    screenshots.push(await captureStage({
      actor: collectorTwoStudioActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "withheld reveal refund and permissionless closure",
      stageName: "collector two closed fully refunded unrevealed pack",
      focusSelector: "#closureInfo",
      evidence: [
        { selector: "#closureInfo", expectedText: "zero wrappers, claims, inventory, and escrow" },
        { selector: "#ppNotice", expectedText: "Unrevealed Ravioli pack closed" },
      ],
    }));
    const refundCredit = mirror.refundCredits.get(signerSet.collector.address) || 0;
    assert.ok(refundCredit > 0);
    await withdrawRavioliRefundViaStudio({
      actor: collectorOneStudioActor,
      routerAddress: mirror.routerAddress,
      tokenId: PACK_SPECS.length,
      destination: signerSet.collector.address,
    });
    screenshots.push(await captureStage({
      actor: collectorOneStudioActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "withheld reveal refund and permissionless closure",
      stageName: "collector one withdrew preserved pull-based refund",
      focusSelector: "#ppNotice",
      evidence: [
        { selector: "#ppNotice", expectedText: "Refund credit withdrawn" },
        { selector: "#opTokenId" },
      ],
    }));
    await recoverRavioliAdapterCapacityViaStudio({
      actor: creatorActor,
      routerAddress: mirror.routerAddress,
      tokenId: PACK_SPECS.length,
      adapterAddress: mirror.gnocchiAdapterAddress,
      kind: 1,
      resourceId: 2,
      capacity: 2,
    });
    assert.equal(
      mirror.adapterAllowances.get(
        `${PACK_SPECS.length}:${mirror.gnocchiAdapterAddress}:1:2`,
      ) || 0,
      0,
      "withheld Ravioli router allowance remained after recovery",
    );
    assert.equal(
      mirror.adapterReservations.get(
        `${mirror.gnocchiAdapterAddress}:${PACK_SPECS.length}:2`,
      ) || 0,
      0,
      "withheld Ravioli adapter reservation remained after recovery",
    );
    screenshots.push(await captureStage({
      actor: creatorActor,
      outputRoot: runRoot,
      ordinal: ++ordinal,
      capability: "withheld reveal refund and permissionless closure",
      stageName: "creator released cancelled pack child capacity",
      focusSelector: "#recoverAdapterInfo",
      evidence: [
        {
          selector: "#recoverAdapterInfo",
          expectedText:
            "Released 2 units; router allowance and adapter reservation now 0/0.",
        },
        {
          selector: "#ppNotice",
          expectedText:
            "Unused Ravioli child capacity released through the official adapter.",
        },
      ],
    }));
    withheldRefundOutcome = {
      tokenId: PACK_SPECS.length,
      mode: WITHHELD_REFUND_PACK_SPEC.mode,
      controllerAddress: mirror.blindControllerAddress,
      kitSha256: withheldCapture.sha256,
      kitPath: withheldCapture.relativePath,
      saleEnd: withheldRefundKit.editionPolicy.wrapperSaleEnd,
      revealDeadline: withheldRefundKit.editionPolicy.revealDeadline,
      openDeadline: withheldRefundKit.editionPolicy.openDeadline,
      publicRevealPublished: false,
      sealedRevealUri: withheldRefundKit.sealedReveal.contentsUri,
      sealedRevealSha256: withheldRefundKit.sealedReveal.envelopeSha256,
      purchaseCheckpoint: withheldRefundPurchaseCheckpoint,
      permissionlessRefundCaller: signerSet.collectorTwo.address,
      creditedHolder: signerSet.collector.address,
      creditedAmountMutez: refundCredit,
      rejectingDestination: mirror.routerAddress,
      cancelled: mirror.packs.get(PACK_SPECS.length)?.cancelled,
      refundCreditAfterWithdrawal: mirror.refundCredits.get(signerSet.collector.address) || 0,
      recoveredAdapterCapacity: {
        adapter: mirror.gnocchiAdapterAddress,
        kind: 1,
        resourceId: 2,
        capacity: 2,
        routerAllowanceAfter: 0,
        adapterReservationAfter: 0,
      },
    };
  } catch (error) {
    if (privateRecoveryOutputDirectory && creatorRecoveryPage) {
      const publishRecoveryRecordCount = await countRavioliPrivateRecoveryRecords(
        creatorRecoveryPage,
      ).catch(() => failureRecoveryBaseline.publishRecoveryRecordCount);
      const writeReceiptBaseline = failureRecoveryBaseline.creatorWriteReceiptCount
        + failureRecoveryBaseline.collectorOneWriteReceiptCount
        + failureRecoveryBaseline.collectorTwoWriteReceiptCount;
      const writeReceiptCount = countRavioliChainWriteReceipts(creatorSession.getReceipts())
        + countRavioliChainWriteReceipts(collectorOne?.session.getReceipts() || [])
        + countRavioliChainWriteReceipts(collectorTwo?.session.getReceipts() || []);
      if (shouldCaptureRavioliFailureRecovery({
        publishRecoveryRecordBaseline: failureRecoveryBaseline.publishRecoveryRecordCount,
        publishRecoveryRecordCount,
        writeReceiptBaseline,
        writeReceiptCount,
      })) {
        try {
          await capturePrivateRecovery("failure-before-browser-close");
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            "Ravioli UI-live failed and its private recovery capture also failed",
          );
        }
      }
    }
    throw error;
  } finally {
    await closeActor(buyerActor);
    await closeActor(collectorOneStudioActor);
    await closeActor(collectorTwoStudioActor);
    await closeActor(creatorActor);
    creatorRecoveryPage = null;
    await Promise.all([creatorBridge.close(), collectorOne?.bridge.close(), collectorTwo?.bridge.close()]);
  }

  assert.ok(limitedCommitHash);
  assert.ok(generativeOpenHash);
  assert.ok(hybridOpenHash);
  assert.equal(mirror.opened.get(0), 1);
  assert.equal(mirror.opened.get(1), 2);
  assert.equal(mirror.opened.get(2), 1);
  assert.equal(mirror.opened.get(3), 1);
  assert.equal(mirror.opened.get(4), 1);
  assert.equal(mirror.opened.get(PACK_SPECS.length), 0);
  assert.equal(mirror.packs.get(PACK_SPECS.length)?.cancelled, true);
  assert.equal(mirror.refundCredits.get(signerSet.collector.address) || 0, 0);
  assert.ok(withheldRefundKit && withheldRefundPurchaseCheckpoint && withheldRefundOutcome);
  assert.ok([...mirror.totalSupply.values()].every((value) => value === 0));
  const sessions = [creatorSession, collectorOne!.session, collectorTwo!.session];
  const recoveredWriteReceipts = currentResumePlan
    ? [...currentResumePlan.writeReceipts]
    : currentV7Replay
    ? [...currentV7Replay.writeReceipts]
    : currentV5Replay
    ? [...currentV5Replay.writeReceipts]
    : currentV4Replay
    ? [...currentV4Replay.writeReceipts]
    : currentV3Replay
    ? [...currentV3Replay.writeReceipts]
    : controllerReplay
    ? [...controllerReplay.writeReceipts]
    : mutationReplay
      ? [...mutationReplay.writeReceipts]
      : [];
  const writeReceipts = [...recoveredWriteReceipts, ...operationReceipts(sessions)]
    .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
  const operationHashes = writeReceipts.map((receipt) => receipt.operationHash || "");
  assert.equal(new Set(operationHashes).size, operationHashes.length);
  assert.equal(
    writeReceipts.length,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli signer choreography must match the derived semantic plan",
  );
  assert.equal(writeReceipts.filter((receipt) => receipt.action === "originate").length, 4);
  assert.equal(writeReceipts.filter((receipt) => receipt.entrypoints?.includes("mint")).length, 1);
  assert.equal(
    writeReceipts.filter((receipt) => receipt.entrypoints?.includes("finalize_blind_pack")).length,
    5,
  );
  assert.equal(writeReceipts.filter((receipt) => receipt.entrypoints?.includes("open_pack")).length, 6);

  const completedAt = new Date().toISOString();
  memorySamples.push(sampleRavioliUiLiveMemory("terminal-package-input-checkpoint"));
  const currentV3RestartEvidence: JsonObject | null = currentResumePlan
    ? {
        classification: "RAVIOLI-CURRENT-AUTHENTICATED-RESUME",
        boundary: {
          journalId: currentResumePlan.journalId,
          intentSha256: currentResumePlan.intentSha256,
          eventCount: currentResumeBoundaryEventCount,
          pinCount: currentResumePlan.pins.length,
          operationCount: currentResumePlan.operations.length,
          nextGlobalOperation: currentResumePlan.nextOperation?.globalOrdinal,
          retainedOpenKits: currentResumeOpenKitIdentity,
        },
        activePins: currentResumePlan.pins.map((pin) => ({
          disposition: "ACTIVE_JOURNALED_PRODUCT_PIN",
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          onChainReferencedOrReusable: true,
        })),
        supersededPrivatePrecommitPins: [],
        recoveredOperations: currentResumePlan.operations.map((operation) => ({
          globalOrdinal: operation.expected.globalOrdinal,
          actor: operation.actor,
          action: operation.action,
          entrypoint: operation.expected.entrypoint || null,
          operationHash: operation.operationHash,
          contractAddress: operation.contractAddress,
          counter: operation.evidence.counter,
          level: operation.evidence.level,
          timestamp: operation.evidence.timestamp,
        })),
        zeroSideEffectReplaySteps: currentResumeAuthenticatedStatePriming
          ? 0
          : currentResumePlan.pins.length + currentResumePlan.operations.length,
        recoveredSideEffectsReplayed: false,
        firstNewOperation: currentResumePlan.nextOperation?.globalOrdinal,
        entropyReplay: currentEntropyReplay,
        freshMode1PreOp10Proof: mode1PreOp10Proof,
        privateRecovery: {
          capturedBeforeOperationTen: privateRecoveryCaptures.length >= 1
            || Boolean(currentResumePlan.privateRecovery?.records.length),
          externalPathsExcluded: true,
          captures: privateRecoveryCaptures.map(({ sha256: digest, count }) => ({ sha256: digest, count })),
          authenticatedPriorSnapshot: currentResumePrivateRecoveryIdentity,
          mode2PreOp24Proof,
        },
      }
    : currentV7Replay
    ? {
        classification:
          "RAVIOLI-CURRENT-V8-AUTHENTICATED-EVENT87-EFFECTIVE-CONTINUATION",
        boundary: {
          journalId: currentV7Replay.identity.journalId,
          intentSha256: currentV7Replay.identity.intentSha256,
          matrixSha256: currentV7Replay.identity.matrixSha256,
          finalSemanticEventSha256:
            currentV7Replay.v7Identity.predecessorSemanticEventSha256,
          finalEventSha256: currentV7Replay.v7Identity.boundaryFinalEventSha256,
          eventCountAfterRecovery: currentV7Replay.v7Identity.boundaryEventCount,
          pinCount: currentV7Replay.activePins.length,
          operationCount: currentV7Replay.operations.length,
          preRestartFileCount: currentV7Replay.fileCount,
        },
        planExtension: currentV8PlanExtensionEvidence,
        counterAdvance: {
          recoveryId: currentV7Replay.identity.recoveryId,
          independentContract: currentV7Replay.identity.recoveryContractAddress,
          creatorAdvance: 3,
          collectorOneAdvance: 1,
          collectorTwoAdvance: 0,
          operationHashes: currentV7Replay.identity.externalOperations.map((operation) => operation.operationHash),
          semanticOperationsReplayed: 0,
          pinsReplayed: 0,
        },
        activePins: currentV7Replay.activePins.map((pin) => ({
          disposition: "ACTIVE_JOURNALED_PRODUCT_PIN",
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          onChainReferencedOrReusable: true,
        })),
        supersededPrivatePrecommitPins: [],
        recoveredOperations: currentV7Replay.operations.map((operation) => operation.identity),
        zeroSideEffectReplaySteps: 0,
        recoveredSideEffectsReplayed: false,
        prewriteLiveChecks: {
          initial: currentV7InitialLive,
          final: currentV7FinalLive,
        },
        privateRecovery: {
          authenticatedBoundaryManifestSha256: currentV7Replay.identity.privateSnapshotManifestSha256,
          capturedBeforeEveryNewBlindProduct: privateRecoveryCaptures.length >= 3,
          externalPathsExcluded: true,
          captures: privateRecoveryCaptures.map(({ sha256: digest, count }) => ({ sha256: digest, count })),
        },
      }
    : currentV5Replay
    ? {
        classification: "RAVIOLI-CURRENT-V5-AUTHENTICATED-CONTINUATION",
        boundary: {
          journalId: currentV5Replay.identity.journalId,
          intentSha256: currentV5Replay.identity.intentSha256,
          matrixSha256: currentV5Replay.identity.matrixSha256,
          finalEventSha256: currentV5Replay.identity.finalEventSha256,
          eventCount: currentV5Replay.identity.eventCount,
          pinCount: currentV5Replay.activePins.length,
          operationCount: currentV5Replay.operations.length,
          preRestartFileCount: currentV5Replay.fileCount,
        },
        activePins: currentV5Replay.activePins.map((pin) => ({
          disposition: "ACTIVE_JOURNALED_PRODUCT_PIN",
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          onChainReferencedOrReusable: true,
        })),
        supersededPrivatePrecommitPins: [],
        recoveredOperations: currentV5Replay.operations.map((operation) => operation.identity),
        zeroSideEffectReplaySteps: 0,
        recoveredSideEffectsReplayed: false,
        prewriteLiveChecks: {
          initial: currentV5InitialLive,
          final: currentV5FinalLive,
        },
        privateRecovery: {
          capturedBeforeEveryNewBlindProduct: privateRecoveryCaptures.length >= 3,
          externalPathsExcluded: true,
          captures: privateRecoveryCaptures.map(({ sha256: digest, count }) => ({ sha256: digest, count })),
        },
      }
    : currentV4Replay
    ? {
        classification: "RAVIOLI-CURRENT-V4-AUTHENTICATED-RESUME",
        boundary: {
          journalId: currentV4Replay.identity.journalId,
          intentSha256: currentV4Replay.identity.intentSha256,
          matrixSha256: currentV4Replay.identity.matrixSha256,
          finalEventSha256: currentV4Replay.identity.finalEventSha256,
          eventCount: 40,
          pinCount: currentV4Replay.journalPins.length,
          operationCount: currentV4Replay.operations.length,
          preRestartFileCount: currentV4Replay.fileCount,
        },
        activePins: currentV4Replay.activePins.map((pin) => ({
          disposition: pin.identity.disposition,
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          onChainReferencedOrReusable: true,
        })),
        supersededPrivatePrecommitPins: currentV4Replay.supersededPrecommitPins.map((pin) => ({
          disposition: pin.identity.disposition,
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          reason: pin.identity.supersededReason,
          onChainReferenced: false,
          reused: false,
        })),
        cryptoInvalidPrecommitPins: currentV4Replay.cryptoInvalidPrecommitPins.map((pin) => ({
          disposition: pin.identity.disposition,
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          reason: pin.identity.supersededReason,
          onChainReferenced: false,
          reused: false,
        })),
        cryptoInvalidAudit: currentV4Replay.cryptoInvalidAudit,
        recoveredOperations: currentV4Replay.operations.map((operation) => operation.identity),
        zeroSideEffectReplaySteps: 16,
        recoveredSideEffectsReplayed: false,
        prewriteLiveChecks: {
          initial: currentV4InitialLive,
          final: currentV4FinalLive,
        },
        freshMode1PreOp10Proof: mode1PreOp10Proof,
        freshOperationTen: currentV4OperationTenContext
          ? {
              schema: currentV4OperationTenContext.schema,
              operationTenDescriptorSha256: currentV4OperationTenContext.operationTenDescriptorSha256,
              inventoryProof: currentV4OperationTenContext.inventoryProof,
              privateProof: currentV4OperationTenContext.privateProof,
            }
          : null,
        privateRecovery: {
          capturedBeforeOperationTen: privateRecoveryCaptures.length >= 1,
          externalPathsExcluded: true,
          captures: privateRecoveryCaptures.map(({ sha256: digest, count }) => ({ sha256: digest, count })),
        },
      }
    : currentV3Replay
    ? {
        classification: "RAVIOLI-CURRENT-V3-AUTHENTICATED-RESTART",
        boundary: {
          journalId: currentV3Replay.identity.journalId,
          intentSha256: currentV3Replay.identity.intentSha256,
          matrixSha256: currentV3Replay.identity.matrixSha256,
          finalEventSha256: currentV3Replay.identity.finalEventSha256,
          eventCount: 37,
          pinCount: currentV3Replay.journalPins.length,
          operationCount: currentV3Replay.operations.length,
          preRestartFileCount: currentV3Replay.preRestartFileCount,
        },
        activePins: currentV3Replay.activePins.map((pin) => ({
          disposition: pin.identity.disposition,
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          onChainReferencedOrReusable: true,
        })),
        supersededPrivatePrecommitPins: currentV3Replay.supersededPrecommitPins.map((pin) => ({
          disposition: pin.identity.disposition,
          uri: pin.proof.uri,
          sha256: pin.proof.sha256,
          reason: pin.identity.supersededReason,
          onChainReferenced: false,
          reused: false,
        })),
        recoveredOperations: currentV3Replay.operations.map((operation) => operation.identity),
        zeroSideEffectReplaySteps: 16,
        recoveredSideEffectsReplayed: false,
        prewriteLiveChecks: {
          initial: currentV3InitialLive,
          final: currentV3FinalLive,
        },
        freshMode1PreOp10Proof: mode1PreOp10Proof,
        privateRecovery: {
          capturedBeforeOperationTen: privateRecoveryCaptures.length >= 1,
          externalPathsExcluded: true,
          captures: privateRecoveryCaptures.map(({ sha256: digest, count }) => ({ sha256: digest, count })),
        },
      }
    : null;
  const proofPackageCheckpointInput: RavioliProofPackageCheckpointInput = {
    runId,
    rpcUrl: rpc.rpcUrl,
    startedAt,
    completedAt,
    dependencies,
    actors: {
      creator: signerSet.creator.address,
      collectorOne: signerSet.collector.address,
      collectorTwo: signerSet.collectorTwo.address,
    },
    funding: {
      creator: creatorSession.getFundingAuthorization(),
      collectorOne: collectorOne!.session.getFundingAuthorization(),
      collectorTwo: collectorTwo!.session.getFundingAuthorization(),
    },
    mirror,
    kits,
    withheldRefundKit,
    publicRevealUris,
    openKitCaptures,
    pins,
    screenshots,
    receipts: [...recoveredWriteReceipts, ...sessions.flatMap((session) => session.getReceipts())]
      .sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc)),
    writeReceipts,
    operationHashes,
    indexedInputs: {
      limitedCommitHash,
      generativeOpenHash,
      hybridOpenHash,
      wrapperPurchaseCheckpoints,
      openDeliveryOutcomes,
      withheldRefundOutcome,
    },
    negativeAssertions,
    capacityChecks,
    memorySamples,
    mode1PreOp10Proof,
    currentV3RestartEvidence,
    mutationRecoveryEvidence,
  };
  const { checkpoint: packageCheckpoint, terminal: { journalPreview, indexed } } =
    await checkpointRavioliBeforeTerminalVerification(
      () => writeRavioliProofPackageCheckpoint({
        appRoot,
        runRoot,
        checkpointInput: proofPackageCheckpointInput,
      }),
      async () => {
        const preview = await journal.previewFinalization(completedAt);
        const terminalIndexed = await verifyRavioliIndexedProof({
          dependencies,
          routerAddress: mirror.routerAddress,
          gnocchiAdapterAddress: mirror.gnocchiAdapterAddress,
          rotiniAdapterAddress: mirror.rotiniAdapterAddress,
          creator: signerSet.creator.address,
          collectorOne: signerSet.collector.address,
          collectorTwo: signerSet.collectorTwo.address,
          kits,
          withheldRefundKit,
          publicRevealUris,
          pins,
          limitedCommitHash,
          generativeOpenHash,
          hybridOpenHash,
          wrapperPurchaseCheckpoints,
          openDeliveryOutcomes,
          withheldRefundOutcome,
          receipts: writeReceipts,
        });
        terminalIndexed.verifiedAt = completedAt;
        return { journalPreview: preview, indexed: terminalIndexed };
      },
    );
  const { indexedInputs: _indexedInputs, ...proofPackageBase } = proofPackageCheckpointInput;
  const proofPackageCore: RavioliProofPackageCoreInput = {
    ...proofPackageBase,
    indexed,
    journalFinalization: journalPreview.finalization,
    journalFinalBytes: journalPreview.finalBytes,
  };
  const stagedProof = await writeRavioliProofPackage({
    appRoot,
    runRoot,
    ...proofPackageCore,
    packageCheckpoint,
  });
  await validateStagedRavioliProofPackage({
    proof: stagedProof,
    appRoot,
    checkpoint: packageCheckpoint,
    journalFinalization: journalPreview.finalization,
    journalFinalBytes: journalPreview.finalBytes,
  });
  const journalFinalization = await journal.finalize(completedAt);
  assert.deepEqual(journalFinalization, journalPreview.finalization, "committed Ravioli journal differs from its package preview");
  await publishStagedRavioliProof(stagedProof);
  await validatePublishedRavioliProofPackage(stagedProof);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    classification: "UI-LIVE",
    routerAddress: stagedProof.routerAddress,
    adapterAddresses: stagedProof.adapterAddresses,
    operationHashes: stagedProof.operationHashes,
    receiptPath: stagedProof.receiptPath,
    manifestPath: stagedProof.manifestPath,
  }, null, 2)}\n`);
  return stagedProof;
}

function pinUriList(pins: readonly PinRecord[], predicate: (pin: PinRecord) => boolean): string[] {
  return pins.filter(predicate).map((pin) => pin.proof.uri);
}

function decodedUri(value: unknown): string {
  const text = String(value || "");
  return text.startsWith("ipfs://") ? text : hexToUtf8(text);
}

async function assertContractMetadataUri(label: string, bigMap: unknown, expected: string): Promise<void> {
  const entries = await readBigMap(bigMap, `${label} contract metadata`, 20);
  const entry = entries.find((candidate) => String(candidate?.key ?? "") === "");
  assert.equal(decodedUri(entry?.value), expected, `${label} contract metadata URI drift`);
}

async function verifyEveryOperation(receipts: readonly PastaUiLivePublicReceipt[]): Promise<JsonObject[]> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const verified: JsonObject[] = [];
  for (const receipt of receipts) {
    assert.ok(receipt.operationHash);
    const family = receipt.action === "originate" ? "originations" : "transactions";
    const response = await pollJson(
      `TzKT ${family} ${receipt.operationHash}`,
      `${base}/operations/${family}/${encodeURIComponent(receipt.operationHash)}`,
      (value) => appliedOperationRows(value).some((entry) => {
        if (entry?.sender?.address !== receipt.signerAddress) return false;
        if (receipt.action === "originate") return entry?.originatedContract?.address === receipt.contractAddress;
        return entry?.target?.address === receipt.contractAddress &&
          receipt.entrypoints?.includes(String(entry?.parameter?.entrypoint || "default"));
      }),
    );
    const operations = appliedOperationRows(response);
    const matched = operations.find((entry) => {
      if (entry?.sender?.address !== receipt.signerAddress) return false;
      if (receipt.action === "originate") return entry?.originatedContract?.address === receipt.contractAddress;
      return entry?.target?.address === receipt.contractAddress &&
        receipt.entrypoints?.includes(String(entry?.parameter?.entrypoint || "default"));
    });
    assert.ok(matched, `${receipt.operationHash} lacks the exact signer/target/entrypoint operation`);
    verified.push({
      hash: receipt.operationHash,
      action: receipt.action,
      entrypoints: receipt.entrypoints || [],
      appliedCount: operations.length,
      signerAddress: receipt.signerAddress,
      contractAddress: receipt.contractAddress,
      level: matched.level,
      explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
    });
  }
  return verified;
}

async function readExactRavioliEvidenceFile(input: {
  filePath: string;
  expectedSha256: string;
  expectedByteLength?: number;
  label: string;
  rootPath?: string;
}): Promise<Uint8Array> {
  if (input.rootPath) {
    const rootPath = path.resolve(input.rootPath);
    const filePath = path.resolve(input.filePath);
    const relativePath = safeRelativePath(
      path.relative(rootPath, filePath).split(path.sep).join("/"),
      `${input.label} rooted path`,
    );
    let current = rootPath;
    const rootInfo = await lstat(rootPath);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error(`${input.label} root is not a real directory`);
    for (const component of relativePath.split("/")) {
      current = path.join(current, component);
      const componentInfo = await lstat(current);
      if (componentInfo.isSymbolicLink()) throw new Error(`${input.label} path traverses a symbolic link`);
    }
  }
  const info = await lstat(input.filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${input.label} is not a real file`);
  const bytes = await readFile(input.filePath);
  if (input.expectedByteLength !== undefined) {
    assert.equal(bytes.byteLength, input.expectedByteLength, `${input.label} byte length drift`);
  }
  assert.equal(sha256(bytes), input.expectedSha256, `${input.label} digest drift`);
  return bytes;
}

async function assertRavioliPackageLaneHasNoSymlinks(appRoot: string): Promise<void> {
  const resolvedRoot = path.resolve(appRoot);
  const pending = [resolvedRoot];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error(`Ravioli package lane contains a non-directory or symbolic-link directory: ${directory}`);
    }
    for (const name of await readdir(directory)) {
      const candidate = path.join(directory, name);
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) throw new Error(`Ravioli package lane contains a symbolic link: ${candidate}`);
      if (info.isDirectory()) pending.push(candidate);
    }
  }
}

async function verifyRavioliProofPackageCheckpointEvidence(input: {
  appRoot: string;
  runRoot: string;
  checkpointInput: RavioliProofPackageCheckpointInput;
}): Promise<JsonObject[]> {
  ravioliModeWriteOperationHashes(input.checkpointInput.writeReceipts);
  assert.deepEqual(
    input.checkpointInput.operationHashes,
    input.checkpointInput.writeReceipts.map((receipt) => receipt.operationHash),
    "Ravioli package-resume operation order drift",
  );
  assert.equal(
    new Set(input.checkpointInput.operationHashes).size,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli package-resume operation hashes are not unique",
  );

  for (const capture of input.checkpointInput.openKitCaptures) {
    const relativePath = safeRelativePath(capture.relativePath, `Ravioli open-kit ${capture.tokenId} checkpoint path`);
    const absolutePath = path.resolve(input.appRoot, ...relativePath.split("/"));
    assert.ok(absolutePath.startsWith(`${path.resolve(input.appRoot)}${path.sep}`), `Ravioli open-kit ${capture.tokenId} escapes the app root`);
    const bytes = await readExactRavioliEvidenceFile({
      filePath: absolutePath,
      expectedSha256: capture.sha256,
      expectedByteLength: capture.bytes.byteLength,
      label: `Ravioli open-kit ${capture.tokenId}`,
      rootPath: input.appRoot,
    });
    assert.deepEqual(bytes, Buffer.from(capture.bytes), `Ravioli open-kit ${capture.tokenId} differs from its checkpoint bytes`);
  }

  for (const capture of input.checkpointInput.screenshots) {
    const pngRelative = safeRelativePath(capture.pngRelativePath, `${capture.filenameStem} screenshot path`);
    const sidecarRelative = safeRelativePath(capture.sidecarRelativePath, `${capture.filenameStem} screenshot sidecar path`);
    const pngPath = path.resolve(input.appRoot, ...pngRelative.split("/"));
    const sidecarPath = path.resolve(input.appRoot, ...sidecarRelative.split("/"));
    assert.ok(pngPath.startsWith(`${path.resolve(input.appRoot)}${path.sep}`), `${capture.filenameStem} screenshot escapes the app root`);
    assert.ok(sidecarPath.startsWith(`${path.resolve(input.appRoot)}${path.sep}`), `${capture.filenameStem} sidecar escapes the app root`);
    const sidecar = await verifyScreenshotSidecar(pngPath, sidecarPath);
    assert.deepEqual(sidecar, capture.sidecar, `${capture.filenameStem} screenshot sidecar differs from its checkpoint`);
    await readExactRavioliEvidenceFile({
      filePath: pngPath,
      expectedSha256: capture.manifestScreenshot.sha256,
      label: `${capture.filenameStem} screenshot`,
      rootPath: input.appRoot,
    });
    await readExactRavioliEvidenceFile({
      filePath: sidecarPath,
      expectedSha256: capture.manifestSidecarArtifact.sha256,
      label: `${capture.filenameStem} screenshot sidecar`,
      rootPath: input.appRoot,
    });
  }

  for (const [label, filePath, expectedSha256] of [
    ["Gnocchi proof manifest", input.checkpointInput.dependencies.fresh.gnocchi.manifestPath, input.checkpointInput.dependencies.fresh.gnocchi.manifestSha256],
    ["Gnocchi proof receipt", input.checkpointInput.dependencies.fresh.gnocchi.receiptPath, input.checkpointInput.dependencies.fresh.gnocchi.receiptSha256],
    ["Rotini proof manifest", input.checkpointInput.dependencies.fresh.rotini.manifestPath, input.checkpointInput.dependencies.fresh.rotini.manifestSha256],
    ["Rotini proof receipt", input.checkpointInput.dependencies.fresh.rotini.receiptPath, input.checkpointInput.dependencies.fresh.rotini.receiptSha256],
  ] as const) {
    await readExactRavioliEvidenceFile({ filePath, expectedSha256, label, rootPath: input.runRoot });
  }
  const limitedReceiptRelative = safeRelativePath(
    input.checkpointInput.dependencies.gnocchi.limitedEdition.receiptPath,
    "Ravioli Gnocchi LE receipt path",
  );
  await readExactRavioliEvidenceFile({
    filePath: path.resolve(input.runRoot, ...limitedReceiptRelative.split("/")),
    expectedSha256: input.checkpointInput.dependencies.gnocchi.limitedEdition.receiptSha256,
    label: "Ravioli Gnocchi LE receipt",
    rootPath: input.runRoot,
  });

  if (input.checkpointInput.mutationRecoveryEvidence) {
    const sourceRoot = path.resolve(input.checkpointInput.mutationRecoveryEvidence.sourceRoot);
    assert.ok(
      sourceRoot.startsWith(`${path.resolve(input.appRoot)}${path.sep}`),
      "Ravioli mutation recovery evidence escapes the app root",
    );
    for (const file of input.checkpointInput.mutationRecoveryEvidence.files) {
      await readExactRavioliEvidenceFile({
        filePath: path.join(sourceRoot, file.fileName),
        expectedSha256: file.sha256,
        label: file.id,
        rootPath: input.appRoot,
      });
    }
  }

  const uniquePins = new Map<string, PinRecord>();
  for (const pin of input.checkpointInput.pins) {
    const bytes = pin.bytes ? Uint8Array.from(pin.bytes) : deterministicJsonBytes(pin.value);
    assert.equal(bytes.byteLength, pin.proof.byteLength, `${pin.proof.fileName} checkpoint pin byte length drift`);
    assert.equal(sha256(bytes), pin.proof.sha256, `${pin.proof.fileName} checkpoint pin digest drift`);
    const existing = uniquePins.get(pin.proof.uri);
    if (existing) {
      assert.equal(existing.proof.sha256, pin.proof.sha256, `${pin.proof.uri} checkpoint pin reuse drift`);
    } else {
      uniquePins.set(pin.proof.uri, pin);
    }
  }
  for (const pin of uniquePins.values()) {
    await verifyRavioliMode0ReplayHttpBytes({
      label: `Ravioli package resume local IPFS ${pin.proof.fileName}`,
      url: pin.proof.localGatewayUrl,
      expectedSha256: pin.proof.sha256,
      expectedByteLength: pin.proof.byteLength,
    });
    await verifyRavioliMode0ReplayHttpBytes({
      label: `Ravioli package resume public IPFS ${pin.proof.fileName}`,
      url: pin.proof.publicGatewayUrl,
      expectedSha256: pin.proof.sha256,
      expectedByteLength: pin.proof.byteLength,
    });
  }

  return verifyEveryOperation(input.checkpointInput.writeReceipts);
}

async function validateStagedRavioliProofPackage(input: {
  proof: RavioliUiLiveResult & { stagedManifestPath: string; stagedReceiptPath: string };
  appRoot: string;
  checkpoint: RavioliProofPackageCheckpointEvidence;
  journalFinalization: RavioliUiLiveJournalFinalization;
  journalFinalBytes: Uint8Array;
}): Promise<void> {
  const [manifestBytes, receiptBytes] = await Promise.all([
    readExactRavioliEvidenceFile({
      filePath: input.proof.stagedManifestPath,
      expectedSha256: sha256(await readFile(input.proof.stagedManifestPath)),
      label: "staged Ravioli manifest",
    }),
    readExactRavioliEvidenceFile({
      filePath: input.proof.stagedReceiptPath,
      expectedSha256: sha256(await readFile(input.proof.stagedReceiptPath)),
      label: "staged Ravioli receipt",
    }),
  ]);
  const manifest = ravioliCheckpointRecord(JSON.parse(Buffer.from(manifestBytes).toString("utf8")), "staged Ravioli manifest");
  const receipt = ravioliCheckpointRecord(JSON.parse(Buffer.from(receiptBytes).toString("utf8")), "staged Ravioli receipt");
  assert.deepEqual(Buffer.from(deterministicJsonBytes(manifest)), Buffer.from(manifestBytes), "staged Ravioli manifest is not canonical");
  assert.deepEqual(Buffer.from(deterministicJsonBytes(receipt)), Buffer.from(receiptBytes), "staged Ravioli receipt is not canonical");
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, "ravioli");
  assert.equal(receipt.schema, "pastaprotocol-ravioli-ui-live-run@1");
  assert.equal(manifest.proofPackageResume?.checkpointSha256, input.checkpoint.sha256);
  assert.equal(receipt.proofPackageResume?.checkpointSha256, input.checkpoint.sha256);
  assert.equal(manifest.durableJournal?.finalSha256, input.journalFinalization.finalSha256);
  assert.equal(receipt.durableJournal?.finalSha256, input.journalFinalization.finalSha256);
  assert.deepEqual(
    (manifest.operations as JsonObject[]).slice(2).map((operation) => operation.hash),
    input.proof.operationHashes,
    "staged Ravioli manifest operation order drift",
  );
  assert.equal(
    (manifest.operations as JsonObject[]).length,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total + 2,
    "staged Ravioli manifest operation graph drift",
  );

  for (const artifact of manifest.artifacts as JsonObject[]) {
    const relativePath = safeRelativePath(artifact.path, `${artifact.id} staged artifact path`);
    let bytes: Uint8Array;
    if (relativePath === "artifacts/journal/final.json") {
      bytes = Uint8Array.from(input.journalFinalBytes);
    } else if (relativePath === "artifacts/ravioli-ui-live-run.json") {
      bytes = Uint8Array.from(receiptBytes);
    } else {
      const absolutePath = path.resolve(input.appRoot, ...relativePath.split("/"));
      assert.ok(absolutePath.startsWith(`${path.resolve(input.appRoot)}${path.sep}`), `${artifact.id} staged artifact escapes app root`);
      bytes = await readFile(absolutePath);
    }
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.id} staged artifact digest drift`);
  }
}

async function validatePublishedRavioliProofPackage(
  proof: RavioliUiLiveResult & { stagedManifestPath: string; stagedReceiptPath: string },
): Promise<void> {
  const [manifestBytes, receiptBytes] = await Promise.all([
    readFile(proof.manifestPath),
    readFile(proof.receiptPath),
  ]);
  const manifest = ravioliCheckpointRecord(JSON.parse(manifestBytes.toString("utf8")), "published Ravioli manifest");
  const receipt = ravioliCheckpointRecord(JSON.parse(receiptBytes.toString("utf8")), "published Ravioli receipt");
  assert.deepEqual(Buffer.from(deterministicJsonBytes(manifest)), manifestBytes, "published Ravioli manifest is not canonical");
  assert.deepEqual(Buffer.from(deterministicJsonBytes(receipt)), receiptBytes, "published Ravioli receipt is not canonical");
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, "ravioli");
  assert.equal(receipt.schema, "pastaprotocol-ravioli-ui-live-run@1");
  const receiptArtifact = (manifest.artifacts as JsonObject[]).find((artifact) => artifact.id === "ui-live-run-receipt");
  assert.ok(receiptArtifact, "published Ravioli manifest lacks its run receipt");
  assert.equal(receiptArtifact.sha256, sha256(receiptBytes), "published Ravioli receipt digest differs from manifest");
  await Promise.all([proof.stagedReceiptPath, proof.stagedManifestPath].map(async (stagedPath) => {
    try {
      await lstat(stagedPath);
      assert.fail(`published Ravioli package retained staging file ${stagedPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }));
}

async function exactRavioliJournalFinalization(
  journal: RavioliUiLiveJournal,
  completedAt: string,
): Promise<{ finalization: RavioliUiLiveJournalFinalization; finalBytes: Uint8Array }> {
  if (!journal.isFinalized()) return journal.previewFinalization(completedAt);
  const finalPath = path.join(journal.journalRoot, "final.json");
  const finalBytes = await readFile(finalPath);
  const final = ravioliCheckpointRecord(JSON.parse(finalBytes.toString("utf8")), "finalized Ravioli journal");
  assert.deepEqual(Buffer.from(deterministicJsonBytes(final)), finalBytes, "finalized Ravioli journal is not canonical");
  assert.equal(final.status, "FINALIZED");
  assert.equal(final.journalId, journal.intent.journalId);
  assert.equal(final.intentSha256, journal.intentSha256);
  assert.equal(final.completedAt, completedAt, "finalized Ravioli journal completion time differs from checkpoint");
  assert.deepEqual(final.counts?.actors, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.actors);
  assert.equal(final.counts?.originations, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.originations);
  assert.equal(final.counts?.calls, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.calls);
  assert.equal(final.counts?.buys, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.buys);
  assert.equal(final.counts?.opens, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.opens);
  assert.equal(final.counts?.transfers, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.transfers);
  assert.equal(final.counts?.refunds, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.refunds);
  return {
    finalization: {
      status: "FINALIZED",
      journalId: journal.intent.journalId,
      intentSha256: journal.intentSha256,
      finalSha256: sha256(finalBytes),
      counts: final.counts as RavioliUiLiveJournalFinalization["counts"],
      artifacts: await journal.inventory(),
    },
    finalBytes: Uint8Array.from(finalBytes),
  };
}

async function resumeRavioliUiLiveProofPackage(input: {
  appRoot: string;
  runRoot: string;
  runId: string;
}): Promise<RavioliUiLiveResult> {
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID, "Ravioli package resume only permits Shadownet");
  const checkpoint = await loadRavioliProofPackageCheckpoint(input);
  await assertRavioliPackageLaneHasNoSymlinks(input.appRoot);
  const checkpointInput = checkpoint.checkpointInput;
  assert.equal(checkpointInput.runId, input.runId, "Ravioli package-resume run id drift");
  assert.equal(checkpointInput.dependencies.fresh.network.chainId, SHADOWNET_CHAIN_ID);
  const journal = await openRavioliUiLiveJournal(path.join(input.appRoot, "artifacts", "journal"));
  assert.equal(
    journal.getCompletedOperationCount(),
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli package resume requires the complete semantic plan to be APPLIED",
  );
  assert.deepEqual(journal.intent.dependencyAddresses, {
    gnocchi: checkpointInput.dependencies.gnocchi.address,
    rotini: checkpointInput.dependencies.rotini.address,
  }, "Ravioli package-resume dependency identity drift");
  assert.deepEqual(
    journal.intent.actors,
    {
      creator: { ...journal.intent.actors.creator, signerAddress: checkpointInput.actors.creator },
      collector1: { ...journal.intent.actors.collector1, signerAddress: checkpointInput.actors.collectorOne },
      collector2: { ...journal.intent.actors.collector2, signerAddress: checkpointInput.actors.collectorTwo },
    },
    "Ravioli package-resume actor identity drift",
  );
  const verifiedOperations = await verifyRavioliProofPackageCheckpointEvidence({
    appRoot: input.appRoot,
    runRoot: input.runRoot,
    checkpointInput,
  });
  const journalPreview = await exactRavioliJournalFinalization(journal, checkpointInput.completedAt);
  const indexed = await verifyRavioliIndexedProof({
    dependencies: checkpointInput.dependencies,
    routerAddress: checkpointInput.mirror.routerAddress,
    gnocchiAdapterAddress: checkpointInput.mirror.gnocchiAdapterAddress,
    rotiniAdapterAddress: checkpointInput.mirror.rotiniAdapterAddress,
    creator: checkpointInput.actors.creator,
    collectorOne: checkpointInput.actors.collectorOne,
    collectorTwo: checkpointInput.actors.collectorTwo,
    kits: checkpointInput.kits,
    withheldRefundKit: checkpointInput.withheldRefundKit,
    publicRevealUris: checkpointInput.publicRevealUris,
    pins: checkpointInput.pins,
    ...checkpointInput.indexedInputs,
    receipts: checkpointInput.writeReceipts,
    requireCurrentLimitedEditionWindow: false,
  });
  indexed.verifiedAt = checkpointInput.completedAt;
  assert.deepEqual(indexed.verifiedOperations, verifiedOperations, "Ravioli package-resume operation verification changed during terminal indexing");
  const { indexedInputs: _indexedInputs, ...proofPackageBase } = checkpointInput;
  const proofPackageCore: RavioliProofPackageCoreInput = {
    ...proofPackageBase,
    indexed,
    journalFinalization: journalPreview.finalization,
    journalFinalBytes: journalPreview.finalBytes,
  };
  const stagedProof = await writeRavioliProofPackage({
    appRoot: input.appRoot,
    runRoot: input.runRoot,
    ...proofPackageCore,
    packageCheckpoint: checkpoint.evidence,
  });
  await validateStagedRavioliProofPackage({
    proof: stagedProof,
    appRoot: input.appRoot,
    checkpoint: checkpoint.evidence,
    journalFinalization: journalPreview.finalization,
    journalFinalBytes: journalPreview.finalBytes,
  });
  if (!journal.isFinalized()) {
    const finalization = await journal.finalize(checkpointInput.completedAt);
    assert.deepEqual(finalization, journalPreview.finalization, "Ravioli package-resume finalization differs from exact preview");
  }
  await publishStagedRavioliProof(stagedProof);
  await validatePublishedRavioliProofPackage(stagedProof);
  return stagedProof;
}

async function verifyRavioliIndexedProof(input: {
  dependencies: DependencyEvidence;
  routerAddress: string;
  gnocchiAdapterAddress: string;
  rotiniAdapterAddress: string;
  creator: string;
  collectorOne: string;
  collectorTwo: string;
  kits: PackKit[];
  withheldRefundKit: PackKit;
  publicRevealUris: string[];
  pins: PinRecord[];
  limitedCommitHash: string;
  generativeOpenHash: string;
  hybridOpenHash: string;
  wrapperPurchaseCheckpoints: JsonObject[];
  openDeliveryOutcomes: JsonObject[];
  withheldRefundOutcome: JsonObject;
  receipts?: PastaUiLivePublicReceipt[];
  requireCurrentLimitedEditionWindow?: boolean;
}): Promise<JsonObject> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const generatedTokenIds = [...input.dependencies.rotini.generatedTokenIds] as [number, number, number];
  assert.deepEqual(generatedTokenIds, [3, 4, 5], "Ravioli fresh-run generated token ids drifted from the proven Rotini baseline");
  const terminalRotiniCapacityBaseline = buildRavioliRotiniCapacityExpectation(
    input.dependencies,
    0,
  );
  assert.deepEqual(
    input.openDeliveryOutcomes.map((outcome) => Number(outcome.tokenId)),
    [0, 1, 1, 2, 3, 4],
    "Ravioli must retain one exact indexed delivery outcome for every wrapper opening",
  );
  const finalRotiniNextTokenId =
    terminalRotiniCapacityBaseline.nextTokenId
    + terminalRotiniCapacityBaseline.generatedTokenCount;
  const wrapperMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "token.json");
  const wrapperMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-wrapper-"));
  const generatedMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName.startsWith("ravioli-generated-token-") && pin.proof.fileName.endsWith(".json"));
  const generatedMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-generated-"));
  const collectionUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "collection.json");
  const blindControllerMetadata = input.pins.find((pin) =>
    pin.proof.fileName === "pasta-ravioli-blind-controller-contract.json"
  )?.proof.uri;
  const gnocchiAdapterMetadata = input.pins.find((pin) => pin.proof.fileName === "pasta-gnocchi-pack-adapter-contract.json")?.proof.uri;
  const rotiniAdapterMetadata = input.pins.find((pin) => pin.proof.fileName === "pasta-rotini-pack-adapter-contract.json")?.proof.uri;
  assert.equal(wrapperMetadataUris.length, 6);
  assert.equal(wrapperMediaUris.length, 6);
  assert.equal(generatedMetadataUris.length, 3);
  assert.equal(generatedMediaUris.length, 3);
  assert.equal(
    collectionUris.length,
    1,
    "Ravioli must originate one collection and bind every wrapper to it",
  );
  assert.equal(input.publicRevealUris.length, 6);
  input.publicRevealUris.forEach((uri, tokenId) => {
    const kit = tokenId === PACK_SPECS.length
      ? input.withheldRefundKit
      : input.kits[tokenId];
    const pin = ravioliContentsEvidencePin(input.pins, input.routerAddress, tokenId, kit);
    assert.equal(pin.proof.uri, uri);
  });
  assert.ok(
    blindControllerMetadata
      && gnocchiAdapterMetadata
      && rotiniAdapterMetadata,
  );
  assert.equal(input.wrapperPurchaseCheckpoints.length, 6, "every Ravioli wrapper purchase needs a pre-open TzKT balance checkpoint");
  assert.deepEqual(input.wrapperPurchaseCheckpoints.map((checkpoint) => Number(checkpoint.tokenId)), [1, 1, 0, 2, 3, 4]);
  assert.ok(
    input.wrapperPurchaseCheckpoints.every((checkpoint) => Number(checkpoint.purchasedQuantity) === 1),
    "every Ravioli purchase checkpoint must bind one purchased wrapper",
  );
  const purchaseBalanceSnapshots = input.wrapperPurchaseCheckpoints.map(
    (checkpoint) => Number(checkpoint.balance),
  );
  assert.ok(
    JSON.stringify(purchaseBalanceSnapshots) === JSON.stringify([1, 1, 1, 1, 1, 1])
      || JSON.stringify(purchaseBalanceSnapshots) === JSON.stringify([0, 2, 1, 1, 1, 1]),
    "Ravioli purchase balance snapshots must be immediate 1/1 ownership or the exact recovered post-transfer 0/2 ownership",
  );
  assert.deepEqual(
    input.wrapperPurchaseCheckpoints.map((checkpoint) => Number(checkpoint.amountMutez)),
    [1, 1, 0, 1, 1, 1],
    "Ravioli must preserve one indexed free wrapper purchase alongside its paid sales",
  );
  assert.equal(Number(input.withheldRefundOutcome.tokenId), PACK_SPECS.length);
  assert.equal(input.withheldRefundOutcome.publicRevealPublished, false);
  assert.equal(
    input.withheldRefundOutcome.sealedRevealUri,
    input.withheldRefundKit.sealedReveal?.contentsUri,
  );
  assert.equal(
    input.withheldRefundOutcome.sealedRevealSha256,
    input.withheldRefundKit.sealedReveal?.envelopeSha256,
  );
  assert.equal(input.withheldRefundOutcome.cancelled, true);
  assert.equal(Number(input.withheldRefundOutcome.refundCreditAfterWithdrawal), 0);
  assert.equal(
    validateContractAddress(String(input.withheldRefundOutcome.controllerAddress || "")),
    ValidationResult.VALID,
    "withheld-refund controller address is invalid",
  );
  const atomicLeIssuanceIndex = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.findIndex(
    (operation) => operation.entrypoint === "finalize_blind_pack" && operation.tokenId === 2,
  );
  assert.ok(atomicLeIssuanceIndex >= 0, "Ravioli semantic plan is missing atomic blind LE issuance");
  const atomicLeIssuance = input.receipts?.[atomicLeIssuanceIndex];
  assert.deepEqual(
    atomicLeIssuance?.entrypoints,
    ["finalize_blind_pack"],
    "Ravioli indexed proof atomic blind LE receipt drift",
  );
  assert.ok(atomicLeIssuance?.operationHash, "Ravioli indexed proof is missing atomic blind LE issuance");
  const [
    routerStorageValue,
    controllerStorageValue,
    gnocchiAdapterStorageValue,
    rotiniAdapterStorageValue,
    gnocchiStorageValue,
    rotiniStorageValue,
  ] = await Promise.all([
    pollJson("Ravioli UI-live router storage", `${base}/contracts/${input.routerAddress}/storage`, (value) => Number(value?.next_token_id) === 6 && Number(value?.packs) > 0 && Number(value?.opened) > 0 && Number(value?.sales) > 0),
    pollJson("Ravioli blind-controller storage", `${base}/contracts/${input.withheldRefundOutcome.controllerAddress || ""}/storage`, (value) => Number(value?.packs) > 0 && Number(value?.claim_counts) > 0 && Number(value?.refund_credits) > 0),
    pollJson("Ravioli Gnocchi adapter storage", `${base}/contracts/${input.gnocchiAdapterAddress}/storage`, (value) => Number(value?.next_resource_id) === 3 && Number(value?.metadata) > 0),
    pollJson("Ravioli Rotini adapter storage", `${base}/contracts/${input.rotiniAdapterAddress}/storage`, (value) => Number(value?.next_resource_id) === 2 && Number(value?.metadata) > 0),
    pollJson("post-Ravioli Gnocchi storage", `${base}/contracts/${input.dependencies.gnocchi.address}/storage`, (value) => Number(value?.ledger) > 0 && Number(value?.sales) > 0 && Number(value?.token_metadata) > 0 && Number(value?.total_reserved) > 0 && Number(value?.total_minted) > 0),
    pollJson(
      "post-Ravioli Rotini storage",
      `${base}/contracts/${input.dependencies.rotini.address}/storage`,
      (value) =>
        Number(value?.next_project_id) === terminalRotiniCapacityBaseline.nextProjectId
        && Number(value?.next_token_id) === finalRotiniNextTokenId
        && Number(value?.token_artifact) > 0,
    ),
  ]);
  assert.equal(
    Number(rotiniStorageValue.next_project_id),
    terminalRotiniCapacityBaseline.nextProjectId,
    "post-Ravioli Rotini next project id drift",
  );
  assert.equal(
    Number(rotiniStorageValue.next_token_id),
    finalRotiniNextTokenId,
    "post-Ravioli Rotini next token id drift",
  );
  const [
    packs,
    routerSales,
    opened,
    supplies,
    routerMinted,
    wrapperMetadata,
    routerAssetAllowances,
    routerAdapterAllowances,
    controllerPacks,
    controllerClaimCounts,
    controllerRefundCredits,
    gnocchiAllocations,
    gnocchiAdapterReservations,
    rotiniResources,
    rotiniAdapterReservations,
    gnocchiLedger,
    gnocchiSales,
    gnocchiMetadata,
    gnocchiSupply,
    gnocchiMinted,
    gnocchiReserved,
    gnocchiPolicyLocked,
    rotiniProjects,
    rotiniLedger,
    rotiniMetadata,
    rotiniArtifacts,
    rotiniSeeds,
  ] = await Promise.all([
    readBigMap(routerStorageValue.packs, "Ravioli indexed pack configs"),
    readBigMap(routerStorageValue.sales, "Ravioli indexed wrapper sales"),
    readBigMap(routerStorageValue.opened, "Ravioli indexed open counters"),
    readBigMap(routerStorageValue.total_supply, "Ravioli indexed wrapper supplies"),
    readBigMap(routerStorageValue.minted, "Ravioli indexed lifetime wrapper issuance"),
    readBigMap(routerStorageValue.token_metadata, "Ravioli indexed wrapper metadata"),
    readBigMap(
      routerStorageValue.asset_allowances,
      "Ravioli indexed asset allowances",
    ),
    readBigMap(
      routerStorageValue.adapter_allowances,
      "Ravioli indexed adapter allowances",
    ),
    readBigMap(controllerStorageValue.packs, "Ravioli indexed blind-controller packs"),
    readBigMap(controllerStorageValue.claim_counts, "Ravioli indexed blind-controller claim counts"),
    readBigMap(controllerStorageValue.refund_credits, "Ravioli indexed blind-controller refund credits"),
    readBigMap(gnocchiAdapterStorageValue.allocations, "Ravioli indexed Gnocchi allocations"),
    readBigMap(gnocchiAdapterStorageValue.reservations, "Ravioli indexed Gnocchi adapter reservations"),
    readBigMap(rotiniAdapterStorageValue.resources, "Ravioli indexed Rotini resources"),
    readBigMap(rotiniAdapterStorageValue.reservations, "Ravioli indexed Rotini adapter reservations"),
    readBigMap(gnocchiStorageValue.ledger, "post-Ravioli Gnocchi balances"),
    readBigMap(gnocchiStorageValue.sales, "post-Ravioli Gnocchi sales"),
    readBigMap(gnocchiStorageValue.token_metadata, "post-Ravioli Gnocchi token metadata"),
    readBigMap(gnocchiStorageValue.total_supply, "post-Ravioli Gnocchi total supply"),
    readBigMap(gnocchiStorageValue.total_minted, "post-Ravioli Gnocchi total minted"),
    readBigMap(gnocchiStorageValue.total_reserved, "post-Ravioli Gnocchi reserved capacity"),
    readBigMap(gnocchiStorageValue.policy_locked, "post-Ravioli Gnocchi locked policies"),
    readBigMap(rotiniStorageValue.projects, "post-Ravioli Rotini projects"),
    readBigMap(rotiniStorageValue.ledger, "post-Ravioli Rotini generated owners"),
    readBigMap(rotiniStorageValue.token_metadata, "post-Ravioli Rotini token metadata"),
    readBigMap(rotiniStorageValue.token_artifact, "post-Ravioli Rotini token artifacts"),
    readBigMap(rotiniStorageValue.token_seed, "post-Ravioli Rotini token seeds"),
  ]);
  for (let tokenId = 0; tokenId < 5; tokenId += 1) {
    const pack = packs.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.ok(pack?.finalized === true && pack?.cancelled === false);
    assert.equal(Number(pack.mode), PACK_SPECS[tokenId].mode);
    assert.equal(Number(pack.max_supply), PACK_SPECS[tokenId].editions);
    assert.equal(Number(pack.item_count), PACK_SPECS[tokenId].itemCount);
    assert.equal(Number(pack.committed_recipes), PACK_SPECS[tokenId].editions);
    assertRavioliSameInstantOrNull(
      pack.child_expiry,
      tokenId === 2 ? input.dependencies.gnocchi.limitedEdition.receipt.token.end : null,
      `Ravioli wrapper ${tokenId} child-expiry policy drift`,
    );
    assertRavioliSameInstantOrNull(
      pack.wrapper_sale_end,
      input.kits[tokenId].editionPolicy.wrapperSaleEnd,
      `Ravioli wrapper ${tokenId} immutable sale-end policy drift`,
    );
    assertRavioliSameInstantOrNull(
      pack.reveal_deadline,
      input.kits[tokenId].editionPolicy.revealDeadline,
      `Ravioli wrapper ${tokenId} reveal-deadline policy drift`,
    );
    assertRavioliSameInstantOrNull(
      pack.open_deadline,
      input.kits[tokenId].editionPolicy.openDeadline,
      `Ravioli wrapper ${tokenId} open-deadline policy drift`,
    );
    assert.equal(decodedUri(pack.manifest_uri), input.kits[tokenId].manifestUri, `Ravioli wrapper ${tokenId} immutable manifest identity drift`);
    assert.equal(decodedUri(pack.contents_uri), input.publicRevealUris[tokenId]);
    assert.equal(
      Number(opened.find((entry) => Number(entry.key) === tokenId)?.value),
      PACK_SPECS[tokenId].soldEditions,
      `Ravioli wrapper ${tokenId} opened count differs from sold supply`,
    );
    assert.equal(Number(supplies.find((entry) => Number(entry.key) === tokenId)?.value), 0);
    const indexedMetadata = wrapperMetadata.find((entry) => Number(entry.key) === tokenId)?.value?.token_info?.[""];
    assert.equal(decodedUri(indexedMetadata), wrapperMetadataUris[tokenId]);
    const metadataPin = input.pins.find((pin) => pin.proof.uri === wrapperMetadataUris[tokenId]);
    assert.equal((metadataPin?.value as JsonObject)?.artifactUri, wrapperMediaUris[tokenId]);
    const sale = routerSales.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.ok(sale, `Ravioli wrapper ${tokenId} sale is missing`);
    assert.equal(sale.start, null);
    assertRavioliSameInstantOrNull(
      sale.end,
      input.kits[tokenId].editionPolicy.wrapperSaleEnd,
      `Ravioli wrapper ${tokenId} sale expiry drift`,
    );
    if (tokenId === 2) {
      assert.equal(
        findNat(routerMinted, tokenId),
        Number(pack.max_supply),
        "Ravioli LE wrapper must atomically issue its complete finite supply before listing",
      );
      assert.ok(Date.parse(String(sale.end)) <= Date.parse(input.dependencies.gnocchi.limitedEdition.receipt.token.end));
      if (input.requireCurrentLimitedEditionWindow !== false) {
        assert.ok(Date.parse(String(sale.end)) > Date.now(), "Ravioli LE wrapper sale expired during proof execution");
      }
    }
  }
  const withheldTokenId = PACK_SPECS.length;
  const withheldPack = packs.find((entry) => Number(entry.key) === withheldTokenId)?.value;
  assert.ok(withheldPack, "Ravioli withheld-reveal pack is missing");
  assert.equal(Number(withheldPack.mode), WITHHELD_REFUND_PACK_SPEC.mode);
  assert.equal(Number(withheldPack.max_supply), WITHHELD_REFUND_PACK_SPEC.editions);
  assert.equal(Number(withheldPack.committed_recipes), WITHHELD_REFUND_PACK_SPEC.editions);
  assert.equal(withheldPack.finalized, false);
  assert.equal(withheldPack.cancelled, true);
  assert.equal(withheldPack.contents_uri, null);
  assert.equal(withheldPack.child_expiry, null);
  assertRavioliSameInstantOrNull(
    withheldPack.wrapper_sale_end,
    input.withheldRefundOutcome.saleEnd,
    "withheld Ravioli sale expiry drift",
  );
  assertRavioliSameInstantOrNull(
    withheldPack.reveal_deadline,
    input.withheldRefundOutcome.revealDeadline,
    "withheld Ravioli reveal expiry drift",
  );
  assertRavioliSameInstantOrNull(
    withheldPack.open_deadline,
    input.withheldRefundOutcome.openDeadline,
    "withheld Ravioli open expiry drift",
  );
  assert.equal(Number(opened.find((entry) => Number(entry.key) === withheldTokenId)?.value), 0);
  assert.equal(Number(supplies.find((entry) => Number(entry.key) === withheldTokenId)?.value), 0);
  assert.equal(
    findNat(routerMinted, withheldTokenId),
    0,
    "refund plus cancellation must burn every withheld-fixture wrapper",
  );
  const withheldSale = routerSales.find((entry) => Number(entry.key) === withheldTokenId)?.value;
  assert.ok(withheldSale);
  assert.equal(withheldSale.active, false);
  assert.equal(Number(withheldSale.remaining), 0);
  const withheldControllerPack = controllerPacks.find((entry) =>
    entry?.key?.pack_contract === input.routerAddress
    && Number(entry?.key?.pack_token_id) === withheldTokenId
  )?.value;
  assert.ok(withheldControllerPack, "Ravioli withheld-reveal controller state is missing");
  assert.equal(withheldControllerPack.revealed, false);
  assert.equal(withheldControllerPack.cancelled, true);
  assert.equal(Number(withheldControllerPack.outstanding), 0);
  assert.equal(Number(withheldControllerPack.unclaimed), 0);
  assert.equal(Number(withheldControllerPack.escrowed), 0);
  assert.equal(
    controllerClaimCounts.some((entry) =>
      entry?.key?.pack_contract === input.routerAddress
      && Number(entry?.key?.pack_token_id) === withheldTokenId
      && entry?.key?.owner === input.collectorOne
    ),
    false,
    "refunded Ravioli holder retained an active blind claim count",
  );
  assert.equal(
    controllerRefundCredits.some((entry) => entry?.key === input.collectorOne),
    false,
    "withdrawn Ravioli refund retained an active controller credit",
  );
  const limitedTokenId = input.dependencies.gnocchi.limitedAllocationTokenId;
  const limitedSale = gnocchiSales.find((entry) => Number(entry.key) === limitedTokenId)?.value;
  assert.ok(limitedSale, "post-Ravioli Gnocchi LE child sale is missing");
  assert.equal(limitedSale.active, true);
  assert.equal(Number(limitedSale.max_supply), input.dependencies.gnocchi.limitedEdition.receipt.token.maxSupply);
  assertRavioliSameInstantOrNull(
    limitedSale.end,
    input.dependencies.gnocchi.limitedEdition.receipt.token.end,
    "post-Ravioli Gnocchi LE child expiry drift",
  );
  if (input.requireCurrentLimitedEditionWindow !== false) {
    assert.ok(Date.parse(String(limitedSale.end)) > Date.now(), "post-Ravioli Gnocchi LE child expired during proof execution");
  }
  assert.equal(
    gnocchiPolicyLocked.find((entry) => Number(entry.key) === limitedTokenId)?.value,
    true,
    "post-Ravioli Gnocchi LE child policy unlocked",
  );
  assert.equal(
    decodedUri(gnocchiMetadata.find((entry) => Number(entry.key) === limitedTokenId)?.value?.token_info?.[""]),
    input.dependencies.gnocchi.limitedEdition.receipt.token.metadataUri,
  );
  const expectedLimitedMinted = input.dependencies.fresh.gnocchi.token2LimitedEdition.totalMinted + 1;
  assert.equal(findNat(gnocchiSupply, limitedTokenId), expectedLimitedMinted, "Gnocchi LE child total supply must include the fresh baseline and one Ravioli delivery");
  assert.equal(findNat(gnocchiMinted, limitedTokenId), expectedLimitedMinted, "Gnocchi LE child total minted must include the fresh baseline and one Ravioli delivery");
  const firstAllocation = gnocchiAllocations.find((entry) => Number(entry.key) === 0)?.value;
  const secondAllocation = gnocchiAllocations.find((entry) => Number(entry.key) === 1)?.value;
  const thirdAllocation = gnocchiAllocations.find((entry) => Number(entry.key) === 2)?.value;
  assert.deepEqual(
    [firstAllocation?.target, Number(firstAllocation?.token_id), Number(firstAllocation?.amount_per_open), firstAllocation?.active],
    [input.dependencies.gnocchi.address, limitedTokenId, 1, true],
    "Ravioli Gnocchi LE allocation resource drift",
  );
  assert.deepEqual(
    [secondAllocation?.target, Number(secondAllocation?.token_id), Number(secondAllocation?.amount_per_open), secondAllocation?.active],
    [input.dependencies.gnocchi.address, input.dependencies.gnocchi.allocationTokenId, 1, true],
    "Ravioli Gnocchi forever-OE allocation resource drift",
  );
  assert.deepEqual(
    [thirdAllocation?.target, Number(thirdAllocation?.token_id), Number(thirdAllocation?.amount_per_open), thirdAllocation?.active],
    [input.dependencies.gnocchi.address, input.dependencies.gnocchi.allocationTokenId, 1, true],
    "Ravioli withheld-refund Gnocchi allocation resource drift",
  );
  for (const resourceId of [0, 1]) {
    const resource = rotiniResources.find((entry) => Number(entry.key) === resourceId)?.value;
    assert.deepEqual(
      [resource?.target, Number(resource?.project_id), resource?.active],
      [input.dependencies.rotini.address, input.dependencies.rotini.projectId, true],
      `Ravioli Rotini resource ${resourceId} drift`,
    );
  }
  assert.ok(
    routerAssetAllowances.length > 0
      && routerAssetAllowances.every((entry) => Number(entry.value) === 0),
    "Ravioli router retained a non-zero funded-asset allowance",
  );
  assert.ok(
    routerAdapterAllowances.length > 0
      && routerAdapterAllowances.every((entry) => Number(entry.value) === 0),
    "Ravioli router retained a non-zero child-adapter allowance",
  );
  const withheldAdapterAllowance = routerAdapterAllowances.find((entry) =>
    Number(entry?.key?.pack_token_id) === withheldTokenId
    && entry?.key?.adapter === input.gnocchiAdapterAddress
    && Number(entry?.key?.kind) === 1
    && Number(entry?.key?.resource_id) === 2
  );
  assert.ok(
    withheldAdapterAllowance,
    "Ravioli router lacks the exact recovered token-5 Gnocchi allowance key",
  );
  assert.equal(
    Number(withheldAdapterAllowance.value),
    0,
    "Ravioli token-5 Gnocchi allowance was not fully recovered",
  );
  assert.equal(
    gnocchiAdapterReservations.some((entry) =>
      entry?.key?.pack_contract === input.routerAddress
      && Number(entry?.key?.pack_token_id) === withheldTokenId
      && Number(entry?.key?.resource_id) === 2
    ),
    false,
    "Ravioli token-5 Gnocchi adapter reservation survived recovery",
  );
  assert.equal(gnocchiAdapterReservations.length, 0, "Ravioli Gnocchi helper retained fulfilled reservations");
  assert.equal(rotiniAdapterReservations.length, 0, "Ravioli Rotini helper retained fulfilled reservations");
  const baselineLedger = input.dependencies.tzkt.gnocchi.ledger as any[];
  const deliveredDelta = (owner: string, tokenId: number): number =>
    input.openDeliveryOutcomes.reduce((total, outcome) => {
      if (outcome.collector !== owner) return total;
      return total + (outcome.balanceDeltas as JsonObject[])
        .filter((delta) => delta.contract === input.dependencies.gnocchi.address && Number(delta.tokenId) === tokenId)
        .reduce((sum, delta) => sum + Number(delta.delta), 0);
    }, 0);
  assert.equal(findBalance(gnocchiLedger, input.creator, 0), 0);
  assert.equal(findBalance(gnocchiLedger, input.creator, 1), 0);
  for (const owner of [input.collectorOne, input.collectorTwo]) {
    for (const tokenId of [0, 1, limitedTokenId]) {
      assert.equal(
        findBalance(gnocchiLedger, owner, tokenId),
        findBalance(baselineLedger, owner, tokenId) + deliveredDelta(owner, tokenId),
        `post-Ravioli Gnocchi balance drift for ${owner} token ${tokenId}`,
      );
    }
  }
  assert.equal(Number(gnocchiReserved.find((entry) => Number(entry.key) === 0)?.value || 0), 0);
  assert.equal(findNat(gnocchiReserved, input.dependencies.gnocchi.allocationTokenId), 0);
  assert.equal(findNat(gnocchiReserved, limitedTokenId), 0);
  const project = rotiniProjects.find((entry) => Number(entry.key) === input.dependencies.rotini.projectId)?.value;
  assert.ok(project, "fresh same-run Rotini project disappeared after Ravioli execution");
  assert.equal(project.active, true);
  assert.equal(
    requiredOptionSafeInteger(project.max_supply, "post-Ravioli Rotini project max supply"),
    terminalRotiniCapacityBaseline.maxSupply,
  );
  assert.equal(
    Number(project.minted),
    terminalRotiniCapacityBaseline.minted + terminalRotiniCapacityBaseline.generatedTokenCount,
  );
  assert.equal(Number(project.reserved), 0);
  const generatedOwners = [input.collectorTwo, input.collectorTwo, input.collectorOne];
  const expectedActionIndexes = [0, 1, 2];
  for (let index = 0; index < generatedTokenIds.length; index += 1) {
    const tokenId: number = generatedTokenIds[index]!;
    assert.equal(findBalance(rotiniLedger, generatedOwners[index], tokenId), 1);
    const tokenInfo = rotiniMetadata.find((entry) => Number(entry.key) === tokenId)?.value?.token_info;
    assert.equal(decodedUri(tokenInfo?.[""]), generatedMetadataUris[index]);
    assert.equal(
      String(tokenInfo?.["pasta:packActionIndex"] || ""),
      packDataBytes({ int: String(expectedActionIndexes[index]) } as any, { prim: "nat" } as any).bytes,
      `Ravioli generated token ${tokenId} did not retain its router-derived action index`,
    );
    const metadataPin = input.pins.find((pin) => pin.proof.uri === generatedMetadataUris[index]);
    assert.equal((metadataPin?.value as JsonObject)?.artifactUri, generatedMediaUris[index]);
    const artifact = rotiniArtifacts.find((entry) => Number(entry.key) === tokenId)?.value;
    assert.equal(decodedUri(artifact?.artifact_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.display_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.thumbnail_uri), generatedMediaUris[index]);
    assert.equal(decodedUri(artifact?.mime_type), "image/png");
  }
  const generatedSeeds = generatedTokenIds.map((tokenId) =>
    String(rotiniSeeds.find((entry) => Number(entry.key) === tokenId)?.value || "")
  );
  assert.ok(generatedSeeds.every((seed) => seed.length > 0), "every Ravioli-generated Rotini token must retain its on-chain seed");
  assert.equal(new Set(generatedSeeds).size, generatedSeeds.length, "distinct Ravioli action indexes must produce distinct Rotini token seeds");
  await Promise.all([
    assertContractMetadataUri("Ravioli router", routerStorageValue.metadata, collectionUris[0]),
    assertContractMetadataUri(
      "Ravioli blind controller",
      controllerStorageValue.metadata,
      blindControllerMetadata,
    ),
    assertContractMetadataUri("Ravioli Gnocchi adapter", gnocchiAdapterStorageValue.metadata, gnocchiAdapterMetadata),
    assertContractMetadataUri("Ravioli Rotini adapter", rotiniAdapterStorageValue.metadata, rotiniAdapterMetadata),
  ]);
  const limitedCommitTree = await pollJson(
    "Ravioli LE allocation commit operation tree",
    `${base}/operations/transactions/${encodeURIComponent(input.limitedCommitHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const exactTreeCall = (tree: JsonObject[], target: string, entrypoint: string, label: string): JsonObject => {
    const matches = tree.filter((operation: JsonObject) =>
      operation?.target?.address === target && operation?.parameter?.entrypoint === entrypoint
    );
    assert.equal(matches.length, 1, `${label} needs exactly one applied call`);
    return matches[0];
  };
  const recoveryReceipts = (input.receipts || []).filter((receipt) =>
    receipt.entrypoints?.includes("recover_adapter")
  );
  assert.equal(
    recoveryReceipts.length,
    1,
    "Ravioli effective proof requires exactly one adapter-recovery operation",
  );
  const recoveryOperationHash = recoveryReceipts[0]!.operationHash;
  assert.ok(recoveryOperationHash);
  const recoveryTree = await pollJson(
    "Ravioli cancelled-pack adapter recovery operation tree",
    `${base}/operations/transactions/${encodeURIComponent(recoveryOperationHash)}`,
    (value) =>
      Array.isArray(value)
      && value.length > 0
      && value.every((operation) => operation?.status === "applied"),
  );
  const routerRecoveryCall = exactTreeCall(
    recoveryTree,
    input.routerAddress,
    "recover_adapter",
    "Ravioli router adapter recovery",
  );
  assert.deepEqual(
    {
      tokenId: Number(routerRecoveryCall?.parameter?.value?.token_id),
      adapter: routerRecoveryCall?.parameter?.value?.adapter,
      kind: Number(routerRecoveryCall?.parameter?.value?.kind),
      resourceId: Number(routerRecoveryCall?.parameter?.value?.resource_id),
      capacity: Number(routerRecoveryCall?.parameter?.value?.capacity),
    },
    {
      tokenId: withheldTokenId,
      adapter: input.gnocchiAdapterAddress,
      kind: 1,
      resourceId: 2,
      capacity: 2,
    },
    "Ravioli recovery operation payload drift",
  );
  const adapterReleaseCall = exactTreeCall(
    recoveryTree,
    input.gnocchiAdapterAddress,
    "release",
    "Ravioli Gnocchi adapter release",
  );
  assert.deepEqual(
    {
      packContract: adapterReleaseCall?.parameter?.value?.pack_contract,
      packTokenId: Number(
        adapterReleaseCall?.parameter?.value?.pack_token_id,
      ),
      kind: Number(adapterReleaseCall?.parameter?.value?.kind),
      resourceId: Number(adapterReleaseCall?.parameter?.value?.resource_id),
      capacity: Number(adapterReleaseCall?.parameter?.value?.capacity),
    },
    {
      packContract: input.routerAddress,
      packTokenId: withheldTokenId,
      kind: 1,
      resourceId: 2,
      capacity: 2,
    },
    "Ravioli adapter release internal payload drift",
  );
  const targetReleaseCall = exactTreeCall(
    recoveryTree,
    input.dependencies.gnocchi.address,
    "release_mint_capacity",
    "Ravioli Gnocchi target capacity release",
  );
  assert.deepEqual(
    {
      tokenId: Number(targetReleaseCall?.parameter?.value?.token_id),
      amount: Number(targetReleaseCall?.parameter?.value?.amount),
    },
    {
      tokenId: input.dependencies.gnocchi.allocationTokenId,
      amount: 2,
    },
    "Ravioli Gnocchi target release payload drift",
  );
  exactTreeCall(limitedCommitTree, input.routerAddress, "commit_recipe", "Ravioli LE router commit");
  const adapterReserveCall = exactTreeCall(limitedCommitTree, input.gnocchiAdapterAddress, "reserve", "Ravioli LE adapter reserve");
  const targetReserveCall = exactTreeCall(
    limitedCommitTree,
    input.dependencies.gnocchi.address,
    "reserve_mint_capacity",
    "Ravioli LE Gnocchi capacity reservation",
  );
  for (const [label, call] of [["adapter", adapterReserveCall], ["Gnocchi", targetReserveCall]] as const) {
    assertRavioliSameInstantOrNull(
      String(call?.parameter?.value?.declared_child_expiry || ""),
      input.dependencies.gnocchi.limitedEdition.receipt.token.end,
      `Ravioli LE ${label} reservation child expiry drift`,
    );
    assertRavioliSameInstantOrNull(
      String(call?.parameter?.value?.wrapper_sale_end || ""),
      input.dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd,
      `Ravioli LE ${label} reservation wrapper expiry drift`,
    );
  }
  const limitedFinalizeTree = await pollJson(
    "Ravioli atomic blind LE finalization operation tree",
    `${base}/operations/transactions/${encodeURIComponent(atomicLeIssuance.operationHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const finalizeLeCall = exactTreeCall(
    limitedFinalizeTree,
    input.routerAddress,
    "finalize_blind_pack",
    "Ravioli atomic blind LE issuance",
  );
  assert.equal(Number(finalizeLeCall?.parameter?.value?.token_id), 2, "Ravioli atomic blind LE issuance token id drift");
  assert.equal(Number(finalizeLeCall?.parameter?.value?.sale?.remaining), PACK_SPECS[2].editions, "Ravioli atomic blind LE sale did not list the full wrapper supply");
  assertRavioliSameInstantOrNull(
    String(finalizeLeCall?.parameter?.value?.sale?.end || ""),
    input.dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd,
    "Ravioli atomic blind LE finalization sale expiry drift",
  );
  const generativeTree = await pollJson(
    "Ravioli two-action generative operation tree",
    `${base}/operations/transactions/${encodeURIComponent(input.generativeOpenHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const actionIndexesFor = (tree: JsonObject[], target: string, entrypoint: string, label: string): number[] => {
    const matches = tree.filter((operation: JsonObject) =>
      operation?.target?.address === target && operation?.parameter?.entrypoint === entrypoint
    );
    assert.equal(matches.length, 2, `${label} needs exactly two internal calls`);
    return matches
      .map((operation: JsonObject) => Number(operation?.parameter?.value?.action_index))
      .sort((left: number, right: number) => left - right);
  };
  assert.deepEqual(
    actionIndexesFor(generativeTree, input.rotiniAdapterAddress, "fulfill", "two-action generative Rotini helper"),
    [0, 1],
    "two-action generative helper calls lost their ordered action indexes",
  );
  assert.deepEqual(
    actionIndexesFor(generativeTree, input.dependencies.rotini.address, "mint_pack_iteration", "two-action generative Rotini target"),
    [0, 1],
    "two-action generative target calls lost their ordered action indexes",
  );
  const hybridTree = await pollJson(
    "Ravioli hybrid operation tree",
    `${base}/operations/transactions/${encodeURIComponent(input.hybridOpenHash)}`,
    (value) => Array.isArray(value) && value.length > 0 && value.every((operation) => operation?.status === "applied"),
  );
  const hybridEntrypoints = [...new Set(hybridTree.map((operation: JsonObject) => String(operation?.parameter?.entrypoint || "default")))].sort();
  for (const expected of ["open_pack", "transfer", "fulfill", "mint_reserved", "mint_pack_iteration"]) {
    assert.ok(hybridEntrypoints.includes(expected), `hybrid operation tree lacks ${expected}`);
  }
  const hybridCall = (target: string, entrypoint: string): JsonObject => {
    const matches = hybridTree.filter((operation: JsonObject) =>
      operation?.target?.address === target && operation?.parameter?.entrypoint === entrypoint
    );
    assert.equal(matches.length, 1, `hybrid operation tree needs exactly one ${target}%${entrypoint} call`);
    return matches[0]?.parameter?.value as JsonObject;
  };
  assert.equal(Number(hybridCall(input.gnocchiAdapterAddress, "fulfill").action_index), 1, "hybrid Gnocchi child index drift");
  assert.equal(Number(hybridCall(input.rotiniAdapterAddress, "fulfill").action_index), 2, "hybrid Rotini helper child index drift");
  assert.equal(Number(hybridCall(input.dependencies.rotini.address, "mint_pack_iteration").action_index), 2, "hybrid Rotini mint child index drift");
  const [routerFa2, gnocchiFa2, rotiniFa2] = await Promise.all([
    readIndexedFa2Evidence({
      label: "final Ravioli router",
      address: input.routerAddress,
      creator: input.creator,
      tokenIds: [0, 1, 2, 3, 4, 5],
      balances: [
        ...[0, 1, 2, 3, 4, 5].map((tokenId) => ({ owner: input.creator, tokenId, balance: 0 })),
        { owner: input.collectorOne, tokenId: 0, balance: 0 },
        { owner: input.collectorOne, tokenId: 1, balance: 0 },
        { owner: input.collectorTwo, tokenId: 1, balance: 0 },
        { owner: input.collectorOne, tokenId: 2, balance: 0 },
        { owner: input.collectorTwo, tokenId: 3, balance: 0 },
        { owner: input.collectorOne, tokenId: 4, balance: 0 },
        { owner: input.collectorOne, tokenId: 5, balance: 0 },
      ],
    }),
    readIndexedFa2Evidence({
      label: "post-Ravioli Gnocchi delivery",
      address: input.dependencies.gnocchi.address,
      creator: input.creator,
      tokenIds: [0, 1, 2, limitedTokenId],
      balances: [
        { owner: input.creator, tokenId: 0, balance: 0 },
        { owner: input.creator, tokenId: 1, balance: 0 },
        { owner: input.collectorOne, tokenId: 0, balance: findBalance(gnocchiLedger, input.collectorOne, 0) },
        { owner: input.collectorOne, tokenId: 1, balance: findBalance(gnocchiLedger, input.collectorOne, 1) },
        { owner: input.collectorOne, tokenId: limitedTokenId, balance: findBalance(gnocchiLedger, input.collectorOne, limitedTokenId) },
        { owner: input.collectorTwo, tokenId: 0, balance: findBalance(gnocchiLedger, input.collectorTwo, 0) },
        { owner: input.collectorTwo, tokenId: 1, balance: findBalance(gnocchiLedger, input.collectorTwo, 1) },
      ],
    }),
    readIndexedFa2Evidence({
      label: "post-Ravioli Rotini generation",
      address: input.dependencies.rotini.address,
      creator: input.creator,
      tokenIds: [...Array.from({ length: input.dependencies.rotini.nextTokenId }, (_, tokenId) => tokenId), ...generatedTokenIds],
      balances: [
        ...generatedTokenIds.map((tokenId, index) => ({ owner: generatedOwners[index], tokenId, balance: 1 })),
      ],
    }),
  ]);
  const indexedWrapperTokens = (routerFa2.tokens as JsonObject[])
    .filter((token) => token?.contract?.address === input.routerAddress)
    .sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
  assert.deepEqual(indexedWrapperTokens.map((token) => Number(token.tokenId)), [0, 1, 2, 3, 4, 5]);
  assert.ok(indexedWrapperTokens.every((token) => Number(token.totalSupply) === 0), "TzKT wrapper supply must reflect every atomic burn");
  const verifiedOperations = input.receipts ? await verifyEveryOperation(input.receipts) : [];
  const withheldOperation = (id: string): PastaUiLivePublicReceipt => {
    const index = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.findIndex((operation) => operation.id === id);
    assert.ok(index >= 0 && input.receipts?.[index], `Ravioli withheld-refund operation ${id} is missing`);
    return input.receipts![index];
  };
  const withheldOperationIds = [
    "withheld-reveal-refund:collector1-buy",
    "withheld-reveal-refund:collector2-credit-holder-refund",
    "withheld-reveal-refund:collector2-cancel-after-refunds",
    "withheld-reveal-refund:collector1-withdraw-credit",
    "withheld-reveal-refund:creator-recover-adapter",
  ];
  const withheldOperationReceipts = withheldOperationIds.map(withheldOperation);
  const limitedPack = packs.find((entry) => Number(entry.key) === 2)?.value;
  return {
    verifiedAt: new Date().toISOString(),
    contracts: {
      router: routerStorageValue,
      blindController: controllerStorageValue,
      gnocchiAdapter: gnocchiAdapterStorageValue,
      rotiniAdapter: rotiniAdapterStorageValue,
    },
    indexedFa2: {
      router: routerFa2,
      gnocchi: gnocchiFa2,
      rotini: rotiniFa2,
    },
    wrapperTokenCount: indexedWrapperTokens.length,
    wrapperPurchaseCheckpoints: input.wrapperPurchaseCheckpoints,
    openDeliveryOutcomes: input.openDeliveryOutcomes,
    withheldRevealRefund: {
      ...input.withheldRefundOutcome,
      controllerAddress: input.withheldRefundOutcome.controllerAddress,
      routerPack: withheldPack,
      controllerPack: withheldControllerPack,
      activeClaimCounts: controllerClaimCounts.filter((entry) =>
        entry?.key?.pack_contract === input.routerAddress
        && Number(entry?.key?.pack_token_id) === withheldTokenId
      ),
      holderRefundCreditAfterWithdrawal: 0,
      recoveryOperationTree: {
        operationHash: recoveryOperationHash,
        explorerUrl: `https://shadownet.tzkt.io/${recoveryOperationHash}`,
        exactCalls: [
          {
            target: input.routerAddress,
            entrypoint: "recover_adapter",
            tokenId: withheldTokenId,
            adapter: input.gnocchiAdapterAddress,
            kind: 1,
            resourceId: 2,
            capacity: 2,
          },
          {
            target: input.gnocchiAdapterAddress,
            entrypoint: "release",
            packContract: input.routerAddress,
            packTokenId: withheldTokenId,
            kind: 1,
            resourceId: 2,
            capacity: 2,
          },
          {
            target: input.dependencies.gnocchi.address,
            entrypoint: "release_mint_capacity",
            tokenId: input.dependencies.gnocchi.allocationTokenId,
            amount: 2,
          },
        ],
      },
      operations: withheldOperationReceipts.map((receipt, index) => ({
        id: withheldOperationIds[index],
        operationHash: receipt.operationHash,
        explorerUrl: `https://shadownet.tzkt.io/${receipt.operationHash}`,
        entrypoint: receipt.entrypoints?.[0],
        signerAddress: receipt.signerAddress,
      })),
    },
    wrapperMetadataUris,
    wrapperMediaUris,
    packManifestUris: input.kits.map((kit) => kit.manifestUri),
    publicRevealUris: input.publicRevealUris,
    opened: Object.fromEntries(PACK_SPECS.map((spec, tokenId) => [String(tokenId), spec.soldEditions])),
    gnocchiDeliveryBalances: {
      creator: { token0: 0, token1: 0 },
      collectorOne: {
        token0: findBalance(gnocchiLedger, input.collectorOne, 0),
        token1: findBalance(gnocchiLedger, input.collectorOne, 1),
        limitedTokenId,
        limitedTokenBalance: findBalance(gnocchiLedger, input.collectorOne, limitedTokenId),
      },
      collectorTwo: { token0: findBalance(gnocchiLedger, input.collectorTwo, 0), token1: findBalance(gnocchiLedger, input.collectorTwo, 1) },
    },
    limitedEditionPolicy: {
      wrapperTokenId: 2,
      wrapperSaleEnd: input.dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd,
      wrapperSaleEndCommittedInPack: limitedPack?.wrapper_sale_end,
      wrapperLifetimeMinted: findNat(routerMinted, 2),
      wrapperMaxSupply: Number(limitedPack?.max_supply),
      wrapperFullyIssuedBeforeSale: findNat(routerMinted, 2) === Number(limitedPack?.max_supply),
      atomicIssuanceOperationHash: atomicLeIssuance.operationHash,
      atomicIssuanceExplorerUrl: `https://shadownet.tzkt.io/${atomicLeIssuance.operationHash}`,
      childContract: input.dependencies.gnocchi.address,
      childTokenId: limitedTokenId,
      childExpiry: input.dependencies.gnocchi.limitedEdition.receipt.token.end,
      childActive: limitedSale.active,
      childPolicyLocked: true,
      childMaxSupply: Number(limitedSale.max_supply),
      childMetadataUri: input.dependencies.gnocchi.limitedEdition.receipt.token.metadataUri,
      wrapperEndsBeforeChild: Date.parse(input.dependencies.gnocchi.limitedEdition.receipt.token.recommendedRavioliSaleEnd) < Date.parse(input.dependencies.gnocchi.limitedEdition.receipt.token.end),
      reservationOperationHash: input.limitedCommitHash,
      reservationOperationExplorerUrl: `https://shadownet.tzkt.io/${input.limitedCommitHash}`,
      reservationEntrypoints: ["commit_recipe", "reserve", "reserve_mint_capacity"],
    },
    adapterResources: {
      gnocchi: gnocchiAllocations,
      rotini: rotiniResources,
      gnocchiReservations: gnocchiAdapterReservations,
      rotiniReservations: rotiniAdapterReservations,
    },
    generatedTokenIds,
    generatedMetadataUris,
    generatedMediaUris,
    generatedSeeds,
    generativeOpenHash: input.generativeOpenHash,
    generativeActionIndexes: [0, 1],
    hybridOpenHash: input.hybridOpenHash,
    hybridEntrypoints,
    verifiedOperations,
  };
}

function safeArtifactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "artifact.bin";
}

function pinKind(pin: PinRecord): string {
  if (pin.bytes) return pin.proof.fileName.startsWith("ravioli-generated-") ? "generated-token-media" : "wrapper-media";
  if (pin.proof.fileName === "token.json") return "token-metadata";
  if (pin.proof.fileName === "ravioli-pack-manifest.json") return "pack-manifest";
  if (pin.proof.fileName.startsWith("ravioli-public-reveal-")) return "public-open-kit-reveal";
  if (pin.proof.fileName.startsWith("ravioli-sealed-reveal-")) {
    return "authenticated-encrypted-reveal-envelope";
  }
  if (pin.proof.fileName.startsWith("ravioli-generated-token-")) return "generated-token-metadata";
  if (pin.proof.fileName.includes("pack-adapter-contract")) return "contract-metadata";
  return "collection-metadata";
}

async function writePinArtifacts(appRoot: string, pins: readonly PinRecord[]) {
  const records: Array<JsonObject> = [];
  const byUri = new Map<string, JsonObject>();
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index];
    const bytes = pin.bytes ? Uint8Array.from(pin.bytes) : deterministicJsonBytes(pin.value);
    assert.equal(sha256(bytes), pin.proof.sha256);
    const existing = byUri.get(pin.proof.uri);
    if (existing) {
      assert.equal(existing.sha256, pin.proof.sha256, `reused CID ${pin.proof.uri} changed bytes`);
      continue;
    }
    const extension = pin.bytes ? path.extname(pin.proof.fileName).toLowerCase() || ".bin" : ".json";
    const stem = safeArtifactName(pin.proof.fileName.replace(/\.[^.]+$/, ""));
    const relativePath = `artifacts/pins/${String(index + 1).padStart(3, "0")}-${stem}${extension}`;
    await writeFile(path.join(appRoot, relativePath), bytes);
    const record = {
      id: `pin-${String(index + 1).padStart(3, "0")}-${stem}`,
      kind: pinKind(pin),
      path: relativePath,
      sha256: pin.proof.sha256,
      ipfsUri: pin.proof.uri,
      gatewayUrl: pin.proof.publicGatewayUrl,
      retrievedSha256: pin.proof.sha256,
    };
    records.push(record);
    byUri.set(pin.proof.uri, record);
  }
  return { records, byUri };
}

export async function copyRavioliLimitedEditionDependencyEvidence(input: {
  appRoot: string;
  runRoot: string;
  dependency: HistoricalDependencyEvidence["gnocchi"]["limitedEdition"];
}): Promise<JsonObject[]> {
  const runRoot = path.resolve(input.runRoot);
  const receiptRelative = safeRelativePath(input.dependency.receiptPath, "Gnocchi LE dependency receipt path");
  const receiptSource = path.resolve(runRoot, ...receiptRelative.split("/"));
  assert.ok(receiptSource.startsWith(`${runRoot}${path.sep}`), "Gnocchi LE dependency receipt escapes the proof root");
  const supplementRoot = path.dirname(path.dirname(receiptSource));
  const receiptBytes = await readFile(receiptSource);
  assert.equal(sha256(receiptBytes), input.dependency.receiptSha256, "Gnocchi LE dependency receipt changed after preflight");
  assert.deepEqual(JSON.parse(receiptBytes.toString("utf8")), input.dependency.receipt);

  const copied: JsonObject[] = [];
  const persist = async (sourcePath: string, relativePath: string, record: JsonObject): Promise<void> => {
    const bytes = await readFile(sourcePath);
    assert.equal(sha256(bytes), record.sha256, `${record.id} dependency bytes drift`);
    const destination = path.join(input.appRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    copied.push({ ...record, path: relativePath });
  };

  await persist(receiptSource, "artifacts/gnocchi-le-dependency/ravioli-gnocchi-le-dependency.json", {
    id: "gnocchi-le-dependency-receipt",
    kind: "limited-edition-dependency-receipt",
    sha256: input.dependency.receiptSha256,
  });
  for (const artifact of input.dependency.receipt.artifacts) {
    const sourceRelative = safeRelativePath(artifact.path, `${artifact.id} Gnocchi LE artifact path`);
    const sourcePath = path.resolve(supplementRoot, ...sourceRelative.split("/"));
    assert.ok(sourcePath.startsWith(`${supplementRoot}${path.sep}`), `${artifact.id} escapes the Gnocchi LE supplement`);
    await persist(sourcePath, `artifacts/gnocchi-le-dependency/${sourceRelative}`, {
      id: `gnocchi-le-${artifact.id}`,
      kind: `gnocchi-le-${artifact.kind}`,
      sha256: artifact.sha256,
      ...(artifact.ipfsUri ? { ipfsUri: artifact.ipfsUri } : {}),
      ...(artifact.gatewayUrl ? { gatewayUrl: artifact.gatewayUrl } : {}),
      ...(artifact.retrievedSha256 ? { retrievedSha256: artifact.retrievedSha256 } : {}),
    });
  }
  for (const screenshot of input.dependency.receipt.screenshots) {
    const sourceRelative = safeRelativePath(screenshot.path, `${screenshot.stage} Gnocchi LE screenshot path`);
    const sourcePath = path.resolve(supplementRoot, ...sourceRelative.split("/"));
    assert.ok(sourcePath.startsWith(`${supplementRoot}${path.sep}`), `${screenshot.stage} escapes the Gnocchi LE supplement`);
    await persist(sourcePath, `artifacts/gnocchi-le-dependency/${sourceRelative}`, {
      id: `gnocchi-le-screenshot-${screenshot.stage}`,
      kind: "gnocchi-le-dependency-screenshot",
      sha256: screenshot.sha256,
      caption: screenshot.caption,
    });
  }
  return copied;
}

export async function copyRavioliPrepackRecoveryEvidence(input: {
  appRoot: string;
  runRoot: string;
  recovery: HistoricalDependencyEvidence["prepackRecovery"];
}): Promise<JsonObject[]> {
  const runRoot = path.resolve(input.runRoot);
  const sources = [
    {
      id: "ravioli-prepack-recovery-preflight",
      kind: "prepack-recovery-preflight",
      fileName: "recovery-preflight.json",
      value: input.recovery.preflight,
      sha256: input.recovery.preflightSha256,
      sourcePath: input.recovery.preflightPath,
    },
    {
      id: "ravioli-prepack-recovery-intent",
      kind: "prepack-recovery-intent",
      fileName: "recovery-intent.json",
      value: input.recovery.intent,
      sha256: input.recovery.intentSha256,
      sourcePath: input.recovery.intentPath,
    },
    {
      id: "ravioli-prepack-recovery-progress",
      kind: "prepack-recovery-progress",
      fileName: "recovery-progress.json",
      value: input.recovery.progress,
      sha256: input.recovery.progressSha256,
      sourcePath: input.recovery.progressPath,
    },
    {
      id: "ravioli-prepack-recovery-receipt",
      kind: "prepack-recovery-receipt",
      fileName: "ravioli-prepack-recovery.json",
      value: input.recovery.receipt,
      sha256: input.recovery.receiptSha256,
      sourcePath: input.recovery.receiptPath,
    },
  ] as const;
  const copied: JsonObject[] = [];
  for (const source of sources) {
    const sourceRelative = safeRelativePath(source.sourcePath, `${source.id} source path`);
    const sourceAbsolute = path.resolve(runRoot, ...sourceRelative.split("/"));
    assert.ok(sourceAbsolute.startsWith(`${runRoot}${path.sep}`), `${source.id} escapes the aggregate proof root`);
    const bytes = await readFile(sourceAbsolute);
    assert.equal(sha256(bytes), source.sha256, `${source.id} changed after the final pre-write gate`);
    assert.deepEqual(JSON.parse(bytes.toString("utf8")), source.value, `${source.id} parsed value drift`);
    const relativePath = `artifacts/prepack-recovery/${source.fileName}`;
    const destination = path.join(input.appRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    copied.push({
      id: source.id,
      kind: source.kind,
      path: relativePath,
      sha256: source.sha256,
    });
  }
  return copied;
}

async function copyFreshRavioliDependencyEvidence(input: {
  appRoot: string;
  runRoot: string;
  dependencies: DependencyEvidence;
}): Promise<JsonObject[]> {
  const runRoot = path.resolve(input.runRoot);
  const records: JsonObject[] = [];
  const apps = [
    {
      app: "gnocchi",
      manifestPath: input.dependencies.fresh.gnocchi.manifestPath,
      manifestSha256: input.dependencies.fresh.gnocchi.manifestSha256,
      receiptPath: input.dependencies.fresh.gnocchi.receiptPath,
      receiptSha256: input.dependencies.fresh.gnocchi.receiptSha256,
      scriptSha256: input.dependencies.fresh.gnocchi.scriptSha256,
    },
    {
      app: "rotini",
      manifestPath: input.dependencies.fresh.rotini.manifestPath,
      manifestSha256: input.dependencies.fresh.rotini.manifestSha256,
      receiptPath: input.dependencies.fresh.rotini.receiptPath,
      receiptSha256: input.dependencies.fresh.rotini.receiptSha256,
      scriptSha256: input.dependencies.fresh.rotini.scriptSha256,
    },
  ] as const;
  const copy = async (sourcePath: string, expectedSha256: string, app: string, kind: string, fileName: string): Promise<void> => {
    const source = path.resolve(sourcePath);
    assert.ok(source.startsWith(`${runRoot}${path.sep}`), `${app} ${kind} source escapes the fresh aggregate proof root`);
    const bytes = await readFile(source);
    assert.equal(sha256(bytes), expectedSha256, `${app} ${kind} changed after the final fresh dependency gate`);
    const relativePath = `artifacts/fresh-dependencies/${app}/${fileName}`;
    const destination = path.join(input.appRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    records.push({
      id: `fresh-${app}-${kind}`,
      kind: `fresh-dependency-${kind}`,
      path: relativePath,
      sha256: expectedSha256,
    });
  };
  for (const app of apps) {
    await copy(app.manifestPath, app.manifestSha256, app.app, "manifest", "manifest.json");
    await copy(app.receiptPath, app.receiptSha256, app.app, "receipt", path.basename(app.receiptPath));
    const packagedScriptPath = path.join(runRoot, app.app, "artifacts", `${app.app}-current-contract-code.json`);
    await copy(packagedScriptPath, app.scriptSha256, app.app, "contract-code", `${app.app}-current-contract-code.json`);
  }
  assert.equal(records.length, 6, "Ravioli must package manifest, receipt, and exact contract code for both fresh dependencies");
  return records;
}

async function copyRavioliMode0MutationRecoveryEvidence(input: {
  appRoot: string;
  recovery: RavioliMode0MutationRecoveryEvidence;
}): Promise<JsonObject[]> {
  const output: JsonObject[] = [];
  const sourceArtifactRoot = input.recovery.sourceRoot;
  const destinationRoot = path.join(input.appRoot, "artifacts", "mode0-mutation-recovery");
  await mkdir(destinationRoot, { recursive: true });
  for (const file of input.recovery.files) {
    const bytes = await readFile(path.join(sourceArtifactRoot, file.fileName));
    assert.equal(sha256(bytes), file.sha256, `${file.id} recovery bytes changed after continuation`);
    const relativePath = `artifacts/mode0-mutation-recovery/${file.fileName}`;
    const destination = path.join(input.appRoot, relativePath);
    if (path.resolve(destination) !== path.resolve(path.join(sourceArtifactRoot, file.fileName))) {
      await writeFile(destination, bytes);
    }
    output.push({ id: file.id, kind: file.kind, path: relativePath, sha256: file.sha256 });
  }
  const receiptFile = output.find((artifact) => artifact.id === "ravioli-mode0-mutation-recovery-receipt");
  assert.equal(receiptFile?.sha256, input.recovery.receiptSha256);
  const receiptBytes = await readFile(path.join(input.appRoot, String(receiptFile?.path || "")));
  assert.deepEqual(JSON.parse(receiptBytes.toString("utf8")), input.recovery.receipt);
  return output;
}

function operationRecord(receipt: PastaUiLivePublicReceipt): RavioliProofOperationRecord {
  assert.ok(receipt.operationHash, "Ravioli write receipt is missing its operation hash");
  const operationHash = receipt.operationHash;
  const entrypoint = receipt.entrypoints?.[0];
  const kind = receipt.action === "originate"
    ? "origination"
    : entrypoint === "mint"
      ? "mint"
      : entrypoint === "open_pack"
        ? "open"
        : entrypoint === "create_pack"
          ? "create"
          : "manage";
  return {
    kind,
    hash: operationHash,
    contractAddress: receipt.contractAddress,
    ...(entrypoint ? { entrypoint } : {}),
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${operationHash}`,
  };
}

async function validateRavioliJournalArtifacts(
  appRoot: string,
  finalization: RavioliUiLiveJournalFinalization,
  virtualFinalBytes?: Uint8Array,
): Promise<JsonObject[]> {
  assert.equal(finalization.status, "FINALIZED", "Ravioli proof requires a finalized signer journal");
  assert.deepEqual(finalization.counts.actors, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.actors);
  assert.equal(finalization.counts.originations, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.originations);
  assert.equal(finalization.counts.calls, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.calls);
  assert.equal(finalization.counts.buys, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.buys);
  assert.equal(finalization.counts.opens, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.opens);
  assert.equal(finalization.counts.transfers, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.transfers);
  assert.equal(finalization.counts.refunds, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.refunds);
  const output: JsonObject[] = [];
  const ids = new Set<string>();
  for (const artifact of finalization.artifacts) {
    const journalRelative = safeRelativePath(artifact.path, "Ravioli journal artifact path");
    const relativePath = `artifacts/journal/${journalRelative}`;
    const absolutePath = path.resolve(appRoot, ...relativePath.split("/"));
    assert.ok(absolutePath.startsWith(`${path.resolve(appRoot)}${path.sep}`), "Ravioli journal artifact escapes the app root");
    let bytes: Uint8Array;
    try {
      bytes = await readFile(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || journalRelative !== "final.json" || !virtualFinalBytes) throw error;
      bytes = Uint8Array.from(virtualFinalBytes);
    }
    assert.equal(bytes.byteLength, artifact.byteLength, `${journalRelative} journal byte length drift`);
    assert.equal(sha256(bytes), artifact.sha256, `${journalRelative} journal digest drift`);
    const id = `ravioli-journal-${journalRelative.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`.slice(0, 128);
    assert.ok(id.length > 0 && !ids.has(id), `duplicate Ravioli journal artifact id ${id}`);
    ids.add(id);
    output.push({
      id,
      kind: journalRelative === "intent.json"
        ? "durable-journal-intent"
        : journalRelative === "final.json"
          ? "durable-journal-finalization"
          : journalRelative.startsWith("events/")
            ? "durable-journal-event"
            : "durable-journal-pin-bytes",
      path: relativePath,
      sha256: artifact.sha256,
    });
  }
  assert.equal(output.length, finalization.artifacts.length, "Ravioli journal inventory is incomplete");
  return output;
}

async function writeRavioliProofPackage(
  input: RavioliProofPackageWriteInput,
): Promise<RavioliUiLiveResult & { stagedManifestPath: string; stagedReceiptPath: string }> {
  assert.equal(input.packageCheckpoint.relativePath, RAVIOLI_PACKAGE_CHECKPOINT_RELATIVE_PATH);
  assert.equal(
    input.packageCheckpoint.absolutePath,
    path.join(input.appRoot, ...input.packageCheckpoint.relativePath.split("/")),
    "Ravioli package checkpoint path drift",
  );
  const packageCheckpointBytes = await readFile(input.packageCheckpoint.absolutePath);
  assert.equal(packageCheckpointBytes.byteLength, input.packageCheckpoint.byteLength, "Ravioli package checkpoint byte length drift");
  assert.equal(sha256(packageCheckpointBytes), input.packageCheckpoint.sha256, "Ravioli package checkpoint digest drift");
  const packageCheckpoint = decodeRavioliPackageResumeCheckpoint(packageCheckpointBytes);
  assert.deepEqual(packageCheckpoint.scope, { runId: input.runId, appPath: "ravioli" }, "Ravioli package checkpoint proof scope drift");
  const packageCheckpointArtifact = {
    id: "ravioli-package-resume-checkpoint",
    kind: "proof-package-resume-checkpoint",
    path: input.packageCheckpoint.relativePath,
    sha256: input.packageCheckpoint.sha256,
  };
  assert.equal(input.openKitCaptures.length, PACK_SPECS.length, "Ravioli proof requires all five real Studio open-kit downloads");
  assert.equal(input.publicRevealUris.length, PACK_SPECS.length + 1, "Ravioli proof requires one public and five sealed contents documents");
  const pinCallsByKind = {
    wrapperMedia: input.pins.filter((pin) =>
      Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-wrapper-")
    ).length,
    wrapperMetadata: input.pins.filter((pin) =>
      pin.proof.fileName === "token.json"
    ).length,
    packManifests: input.pins.filter((pin) =>
      pin.proof.fileName === "ravioli-pack-manifest.json"
    ).length,
    plaintextPublicReveal: input.pins.filter((pin) =>
      pin.proof.fileName === "ravioli-public-reveal-0.json"
    ).length,
    authenticatedSealedEnvelopes: input.pins.filter((pin) =>
      /^ravioli-sealed-reveal-[1-5]\.json$/.test(pin.proof.fileName)
    ).length,
    generatedMedia: input.pins.filter((pin) =>
      Boolean(pin.bytes)
      && pin.proof.fileName.startsWith("ravioli-generated-")
    ).length,
    generatedMetadata: input.pins.filter((pin) =>
      pin.proof.fileName.startsWith("ravioli-generated-token-")
      && pin.proof.fileName.endsWith(".json")
    ).length,
    contractMetadata: input.pins.filter((pin) =>
      [
        "pasta-ravioli-blind-controller-contract.json",
        "collection.json",
        "pasta-gnocchi-pack-adapter-contract.json",
        "pasta-rotini-pack-adapter-contract.json",
      ].includes(pin.proof.fileName)
    ).length,
  };
  assert.deepEqual(
    pinCallsByKind,
    {
      wrapperMedia: 6,
      wrapperMetadata: 6,
      packManifests: 6,
      plaintextPublicReveal: 1,
      authenticatedSealedEnvelopes: 5,
      generatedMedia: 3,
      generatedMetadata: 3,
      contractMetadata: 4,
    },
    "Ravioli exact pin-call inventory drift",
  );
  assert.equal(
    input.pins.length,
    34,
    "Ravioli proof must contain exactly 34 pin calls",
  );
  input.publicRevealUris.forEach((uri, tokenId) => {
    const kit = tokenId === PACK_SPECS.length
      ? input.withheldRefundKit
      : input.kits[tokenId];
    assert.equal(ravioliContentsEvidencePin(input.pins, input.mirror.routerAddress, tokenId, kit).proof.uri, uri);
  });
  const openKitArtifacts: RavioliOpenKitArtifact[] = [];
  for (let tokenId = 0; tokenId < input.openKitCaptures.length; tokenId += 1) {
    const capture = input.openKitCaptures[tokenId];
    assert.equal(capture.tokenId, tokenId, "Ravioli open-kit capture order drift");
    assert.deepEqual(capture.kit, input.kits[tokenId], `Ravioli open-kit ${tokenId} differs from the opened kit`);
    const bytes = await readFile(path.join(input.appRoot, capture.relativePath));
    const validated = validateRavioliOpenKitDownload({
      mode: tokenId,
      routerAddress: input.mirror.routerAddress,
      suggestedFilename: capture.fileName,
      inPageJson: JSON.stringify(input.kits[tokenId], null, 2),
      downloadedBytes: bytes,
    });
    assert.equal(validated.sha256, capture.sha256, `Ravioli open-kit ${tokenId} digest drift`);
    openKitArtifacts.push({
      id: `ravioli-open-kit-${tokenId}`,
      kind: "open-kit",
      path: capture.relativePath,
      sha256: capture.sha256,
    });
  }
  const openKitProgressRelativePath = "artifacts/open-kits/open-kit-capture-progress.json";
  const openKitProgressBytes = await readFile(path.join(input.appRoot, openKitProgressRelativePath));
  const openKitProgress = JSON.parse(openKitProgressBytes.toString("utf8")) as JsonObject;
  assert.equal(openKitProgress.status, "CAPTURED", "Ravioli open-kit progress is not terminal");
  assert.deepEqual(
    openKitProgress.openKits?.map((entry: JsonObject) => entry.sha256),
    openKitArtifacts.map((artifact) => artifact.sha256),
    "Ravioli open-kit progress hashes drift",
  );
  const openKitProgressArtifact = {
    id: "ravioli-open-kit-capture-progress",
    kind: "open-kit-capture-log",
    path: openKitProgressRelativePath,
    sha256: sha256(openKitProgressBytes),
  };
  const journalArtifacts = await validateRavioliJournalArtifacts(input.appRoot, input.journalFinalization, input.journalFinalBytes);
  const freshDependencyArtifacts = await copyFreshRavioliDependencyEvidence({
    appRoot: input.appRoot,
    runRoot: input.runRoot,
    dependencies: input.dependencies,
  });
  const gnocchiLimitedEditionArtifacts = await copyRavioliLimitedEditionDependencyEvidence({
    appRoot: input.appRoot,
    runRoot: input.runRoot,
    dependency: input.dependencies.gnocchi.limitedEdition as HistoricalDependencyEvidence["gnocchi"]["limitedEdition"],
  });
  const mutationRecoveryArtifacts = input.mutationRecoveryEvidence
    ? await copyRavioliMode0MutationRecoveryEvidence({
        appRoot: input.appRoot,
        recovery: input.mutationRecoveryEvidence,
      })
    : [];
  const pinArtifacts = await writePinArtifacts(input.appRoot, input.pins);
  const dependencySnapshot = {
    schema: "pastaprotocol-ravioli-dependencies@3",
    validatedBeforeRavioliWrites: true,
    revalidatedImmediatelyBeforeRavioliWrites: true,
    runId: input.runId,
    schemaIdentity: input.dependencies.fresh.schema,
    chainId: input.dependencies.fresh.network.chainId,
    creator: input.dependencies.fresh.creator,
    gnocchi: {
      contractAddress: input.dependencies.fresh.gnocchi.contractAddress,
      originationOperationHash: input.dependencies.fresh.gnocchi.originationOperationHash,
      scriptSha256: input.dependencies.fresh.gnocchi.scriptSha256,
      scriptCodeSha256: input.dependencies.fresh.gnocchi.scriptCodeSha256,
      manifestSha256: input.dependencies.fresh.gnocchi.manifestSha256,
      receiptSha256: input.dependencies.fresh.gnocchi.receiptSha256,
      token2LimitedEdition: input.dependencies.fresh.gnocchi.token2LimitedEdition,
    },
    rotini: {
      contractAddress: input.dependencies.fresh.rotini.contractAddress,
      originationOperationHash: input.dependencies.fresh.rotini.originationOperationHash,
      scriptSha256: input.dependencies.fresh.rotini.scriptSha256,
      scriptCodeSha256: input.dependencies.fresh.rotini.scriptCodeSha256,
      manifestSha256: input.dependencies.fresh.rotini.manifestSha256,
      receiptSha256: input.dependencies.fresh.rotini.receiptSha256,
      project0: input.dependencies.fresh.rotini.project0,
    },
    liveCheck: input.dependencies.liveCheck,
    packagedEvidenceArtifactIds: freshDependencyArtifacts.map((artifact) => artifact.id),
    tzktBaseline: input.dependencies.tzkt,
  };
  const dependencyBytes = deterministicJsonBytes(dependencySnapshot);
  const dependencyRelativePath = "artifacts/ravioli-ui-live-dependencies.json";
  await writeFile(path.join(input.appRoot, dependencyRelativePath), dependencyBytes);
  const dependencyArtifact = {
    id: "same-run-dependency-evidence",
    kind: "dependency-evidence",
    path: dependencyRelativePath,
    sha256: sha256(dependencyBytes),
  };
  const mode1PreOp10Artifact = input.mode1PreOp10Proof
    ? await (async () => {
        const bytes = deterministicJsonBytes(input.mode1PreOp10Proof);
        const relativePath = "artifacts/ravioli-mode1-pre-op10-private-proof.json";
        await writeFile(path.join(input.appRoot, relativePath), bytes);
        return {
          id: "ravioli-mode1-pre-op10-private-proof",
          kind: "authenticated-private-preimage-proof",
          path: relativePath,
          sha256: sha256(bytes),
        };
      })()
    : null;
  const isCurrentResumeEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-AUTHENTICATED-RESUME";
  const currentResumeBoundary = isCurrentResumeEvidence
    ? input.currentV3RestartEvidence?.boundary as JsonObject
    : null;
  const isCurrentOp23ResumeEvidence =
    isCurrentResumeEvidence && Number(currentResumeBoundary?.operationCount) === 23;
  const isCurrentV4ResumeEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-V4-AUTHENTICATED-RESUME";
  const isCurrentV5ResumeEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-V5-AUTHENTICATED-CONTINUATION";
  const isCurrentV6ResumeEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-V6-AUTHENTICATED-COUNTER-ADVANCE-CONTINUATION";
  const isCurrentV7ResumeEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-V7-AUTHENTICATED-EVENT86-CONTINUATION";
  const isCurrentV3RestartEvidence =
    input.currentV3RestartEvidence?.classification === "RAVIOLI-CURRENT-V3-AUTHENTICATED-RESTART";
  const currentV3RestartArtifact = input.currentV3RestartEvidence
    ? await (async () => {
        const bytes = deterministicJsonBytes(input.currentV3RestartEvidence);
        const relativePath = isCurrentResumeEvidence
          ? "artifacts/ravioli-current-authenticated-resume.json"
          : isCurrentV7ResumeEvidence
          ? "artifacts/ravioli-current-v7-authenticated-event86-continuation.json"
          : isCurrentV6ResumeEvidence
          ? "artifacts/ravioli-current-v6-authenticated-counter-advance-continuation.json"
          : isCurrentV5ResumeEvidence
          ? "artifacts/ravioli-current-v5-authenticated-continuation.json"
          : isCurrentV4ResumeEvidence
            ? "artifacts/ravioli-current-v4-authenticated-resume.json"
            : "artifacts/ravioli-current-v3-authenticated-restart.json";
        await writeFile(path.join(input.appRoot, relativePath), bytes);
        return {
          id: isCurrentResumeEvidence
            ? "ravioli-current-authenticated-resume"
            : isCurrentV7ResumeEvidence
            ? "ravioli-current-v7-authenticated-event86-continuation"
            : isCurrentV6ResumeEvidence
            ? "ravioli-current-v6-authenticated-counter-advance-continuation"
            : isCurrentV5ResumeEvidence
            ? "ravioli-current-v5-authenticated-continuation"
            : isCurrentV4ResumeEvidence
              ? "ravioli-current-v4-authenticated-resume"
              : "ravioli-current-v3-authenticated-restart",
          kind: isCurrentResumeEvidence
            ? "authenticated-current-resume-evidence"
            : isCurrentV7ResumeEvidence
            ? "authenticated-event-boundary-continuation-evidence"
            : isCurrentV6ResumeEvidence
            ? "authenticated-counter-advance-continuation-evidence"
            : isCurrentV5ResumeEvidence
            ? "authenticated-continuation-evidence"
            : isCurrentV4ResumeEvidence
              ? "authenticated-resume-evidence"
              : "authenticated-restart-evidence",
          path: relativePath,
          sha256: sha256(bytes),
        };
      })()
    : null;
  const indexedBytes = deterministicJsonBytes(input.indexed);
  const indexedRelativePath = "artifacts/ravioli-ui-live-tzkt-index.json";
  await writeFile(path.join(input.appRoot, indexedRelativePath), indexedBytes);
  const indexedArtifact = {
    id: "tzkt-index-evidence",
    kind: "tzkt-evidence",
    path: indexedRelativePath,
    sha256: sha256(indexedBytes),
  };
  const withheldRevealRefund = ravioliCheckpointRecord(
    input.indexed.withheldRevealRefund,
    "Ravioli indexed withheld-reveal refund evidence",
  );
  const withheldKitRelativePath = safeRelativePath(
    withheldRevealRefund.kitPath,
    "Ravioli withheld-reveal open-kit path",
  );
  const withheldKitBytes = await readFile(path.join(input.appRoot, ...withheldKitRelativePath.split("/")));
  assert.equal(
    sha256(withheldKitBytes),
    withheldRevealRefund.kitSha256,
    "Ravioli withheld-reveal open-kit digest drift",
  );
  const withheldKit = JSON.parse(withheldKitBytes.toString("utf8")) as PackKit;
  validateKit(
    withheldKit,
    WITHHELD_REFUND_PACK_SPEC.mode,
    input.mirror.routerAddress,
    PACK_SPECS.length,
  );
  const withheldKitArtifact = {
    id: "ravioli-withheld-reveal-open-kit",
    kind: "withheld-reveal-open-kit",
    path: withheldKitRelativePath,
    sha256: String(withheldRevealRefund.kitSha256),
  };
  const withheldEvidenceBytes = deterministicJsonBytes({
    schema: "pastaprotocol-ravioli-withheld-reveal-refund-proof@1",
    status: "PASSED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    ...withheldRevealRefund,
    privateKitArtifactId: withheldKitArtifact.id,
  });
  const withheldEvidenceRelativePath = "artifacts/ravioli-withheld-reveal-refund-evidence.json";
  await writeFile(path.join(input.appRoot, withheldEvidenceRelativePath), withheldEvidenceBytes);
  const withheldEvidenceArtifact = {
    id: "ravioli-withheld-reveal-refund-evidence",
    kind: "withheld-reveal-refund-evidence",
    path: withheldEvidenceRelativePath,
    sha256: sha256(withheldEvidenceBytes),
  };
  const limitedEditionPolicyEvidence = {
    schema: "pastaprotocol-ravioli-limited-edition-policy-evidence@1",
    capabilityId: "limited-edition-expiry-deconfliction-ui-live-proof",
    status: "PASSED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    wrapper: {
      contract: input.mirror.routerAddress,
      tokenId: 2,
      maxSupply: PACK_SPECS[2].editions,
      saleEnd: input.kits[2].editionPolicy.wrapperSaleEnd,
      childExpiryCommittedOnChain: input.kits[2].editionPolicy.earliestChildEnd,
      explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/2`,
    },
    child: {
      contract: input.dependencies.gnocchi.address,
      tokenId: input.dependencies.gnocchi.limitedAllocationTokenId,
      maxSupply: input.dependencies.gnocchi.limitedEdition.receipt.token.maxSupply,
      active: input.dependencies.gnocchi.limitedEdition.receipt.token.active,
      policyLocked: input.dependencies.gnocchi.limitedEdition.receipt.token.policyLocked,
      expiry: input.dependencies.gnocchi.limitedEdition.receipt.token.end,
      metadataUri: input.dependencies.gnocchi.limitedEdition.receipt.token.metadataUri,
      artifactUri: input.dependencies.gnocchi.limitedEdition.receipt.token.artifactUri,
      explorerUrl: input.dependencies.gnocchi.limitedEdition.receipt.token.explorerUrl,
      operationExplorerUrl: input.dependencies.gnocchi.limitedEdition.receipt.operation.explorerUrl,
      dependencyReceiptSha256: input.dependencies.gnocchi.limitedEdition.receiptSha256,
    },
    invariant: {
      wrapperIsFiniteSupply:
        Number(input.indexed.limitedEditionPolicy.wrapperMaxSupply) === PACK_SPECS[2].editions &&
        Number(input.indexed.limitedEditionPolicy.wrapperLifetimeMinted) === PACK_SPECS[2].editions &&
        input.indexed.limitedEditionPolicy.wrapperFullyIssuedBeforeSale === true,
      wrapperIsFiniteTime: input.kits[2].editionPolicy.wrapperSaleEnd != null,
      wrapperEndsBeforeChild: Date.parse(String(input.kits[2].editionPolicy.wrapperSaleEnd)) < Date.parse(input.dependencies.gnocchi.limitedEdition.receipt.token.end),
      childPolicyStoredInPack:
        Date.parse(String(input.kits[2].editionPolicy.earliestChildEnd))
          === Date.parse(input.dependencies.gnocchi.limitedEdition.receipt.token.end),
      wrapperDeadlineStoredInPack:
        Date.parse(String(input.indexed.limitedEditionPolicy.wrapperSaleEndCommittedInPack))
          === Date.parse(String(input.kits[2].editionPolicy.wrapperSaleEnd)),
      wrapperIssuedAtomicallyWithSale: validateOperation(String(input.indexed.limitedEditionPolicy.atomicIssuanceOperationHash || "")) === ValidationResult.VALID,
    },
    preWriteCapacityChecks: input.capacityChecks,
    rejectedInvalidPolicies: input.negativeAssertions.filter((entry) => /LE wrapper|outliv|PACK_END_AFTER_CHILD|LE_PACK_REQUIRES_END/i.test(entry)),
    indexedTerminalPolicy: input.indexed.limitedEditionPolicy,
  };
  assert.equal(limitedEditionPolicyEvidence.invariant.wrapperIsFiniteSupply, true);
  assert.equal(limitedEditionPolicyEvidence.invariant.wrapperIsFiniteTime, true);
  assert.equal(limitedEditionPolicyEvidence.invariant.wrapperEndsBeforeChild, true);
  assert.equal(limitedEditionPolicyEvidence.invariant.childPolicyStoredInPack, true);
  assert.equal(limitedEditionPolicyEvidence.invariant.wrapperDeadlineStoredInPack, true);
  assert.equal(limitedEditionPolicyEvidence.invariant.wrapperIssuedAtomicallyWithSale, true);
  assert.ok(limitedEditionPolicyEvidence.rejectedInvalidPolicies.length >= 3, "Ravioli LE proof needs Studio plus both contract rejection paths");
  const limitedEditionPolicyBytes = deterministicJsonBytes(limitedEditionPolicyEvidence);
  const limitedEditionPolicyRelativePath = "artifacts/ravioli-limited-edition-policy-evidence.json";
  await writeFile(path.join(input.appRoot, limitedEditionPolicyRelativePath), limitedEditionPolicyBytes);
  const limitedEditionPolicyArtifact = {
    id: "limited-edition-expiry-policy-evidence",
    kind: "limited-edition-policy-evidence",
    path: limitedEditionPolicyRelativePath,
    sha256: sha256(limitedEditionPolicyBytes),
  };
  const readExactDependencyJson = async (filePath: string, expectedSha256: string, label: string): Promise<JsonObject> => {
    const bytes = await readFile(filePath);
    assert.equal(sha256(bytes), expectedSha256, `${label} changed before Ravioli packaging`);
    return JSON.parse(bytes.toString("utf8")) as JsonObject;
  };
  const [gnocchiManifest, gnocchiReceipt, rotiniManifest, rotiniReceipt] = await Promise.all([
    readExactDependencyJson(input.dependencies.fresh.gnocchi.manifestPath, input.dependencies.fresh.gnocchi.manifestSha256, "Gnocchi manifest"),
    readExactDependencyJson(input.dependencies.fresh.gnocchi.receiptPath, input.dependencies.fresh.gnocchi.receiptSha256, "Gnocchi receipt"),
    readExactDependencyJson(input.dependencies.fresh.rotini.manifestPath, input.dependencies.fresh.rotini.manifestSha256, "Rotini manifest"),
    readExactDependencyJson(input.dependencies.fresh.rotini.receiptPath, input.dependencies.fresh.rotini.receiptSha256, "Rotini receipt"),
  ]);
  const dependencyOriginations = [
    dependencyOriginationReceipt(gnocchiManifest, gnocchiReceipt, input.dependencies.gnocchi.address, input.actors.creator),
    dependencyOriginationReceipt(rotiniManifest, rotiniReceipt, input.dependencies.rotini.address, input.actors.creator),
  ];
  const journalOperations = input.writeReceipts.map(operationRecord);
  const operations = [...dependencyOriginations.map(operationRecord), ...journalOperations];
  const modeOperationHashes = ravioliModeWriteOperationHashes(input.writeReceipts);
  const withheldOperationHashes =
    ravioliProofPartitionWriteOperationHashes(input.writeReceipts)["withheld-reveal-refund"];
  const journalOperationCount = Object.values(input.journalFinalization.counts.actors)
    .reduce((total, count) => total + count, 0);
  assert.equal(
    journalOperationCount,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    "Ravioli journal must cover the complete derived signer plan",
  );
  assert.equal(input.writeReceipts.length, journalOperationCount, "Ravioli journal/write-receipt coverage drift");
  assert.equal(journalOperations.length, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total, "Ravioli journal operation projection drift");
  assert.equal(
    operations.length,
    RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total + 2,
    "Ravioli manifest must include two dependency originations plus the complete semantic plan",
  );
  const journalOperationCoverage = {
    journalArtifactOperationCount: journalOperationCount,
    manifestOperationReferenceCount: operations.length,
    dependencyOriginationCount: dependencyOriginations.length,
    manifestOperationScope: [
      input.dependencies.gnocchi.address,
      input.dependencies.rotini.address,
      input.mirror.blindControllerAddress,
      input.mirror.routerAddress,
      input.mirror.gnocchiAdapterAddress,
      input.mirror.rotiniAdapterAddress,
    ],
    statement: `The durable Ravioli journal covers all ${RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total} composed writes. The self-contained manifest adds the independently proven, exact-current Gnocchi and Rotini originations, yielding ${RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total + 2} exact operation references across the six contracts invoked by the suite.`,
  };
  const receipt = {
    schema: "pastaprotocol-ravioli-ui-live-run@1",
    classification: "UI-LIVE",
    network: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: input.rpcUrl,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    actors: input.actors,
    funding: input.funding,
    dependencies: {
      statement: "Ravioli composed independently UI-proven Gnocchi and Rotini contracts originated earlier in this exact aggregate run. Their proof manifests, receipts, exact compiled artifact bytes, canonical Michelson code, live policies, inventory, reservations, and authorization baselines were verified before any Ravioli pin or write and rechecked immediately before the first write.",
      gnocchi: input.dependencies.gnocchi,
      rotini: input.dependencies.rotini,
      validationArtifactId: dependencyArtifact.id,
      evidenceArtifactIds: [...freshDependencyArtifacts, ...gnocchiLimitedEditionArtifacts].map((artifact) => artifact.id),
      dualScriptIdentity: {
        gnocchi: {
          artifactBytesSha256: input.dependencies.fresh.gnocchi.scriptSha256,
          canonicalMichelsonSha256: input.dependencies.fresh.gnocchi.scriptCodeSha256,
        },
        rotini: {
          artifactBytesSha256: input.dependencies.fresh.rotini.scriptSha256,
          canonicalMichelsonSha256: input.dependencies.fresh.rotini.scriptCodeSha256,
        },
      },
    },
    contracts: {
      blindController: {
        address: input.mirror.blindControllerAddress,
        explorerUrl:
          `https://shadownet.tzkt.io/${input.mirror.blindControllerAddress}`,
      },
      router: { address: input.mirror.routerAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}` },
      gnocchiAdapter: { address: input.mirror.gnocchiAdapterAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.gnocchiAdapterAddress}` },
      rotiniAdapter: { address: input.mirror.rotiniAdapterAddress, explorerUrl: `https://shadownet.tzkt.io/${input.mirror.rotiniAdapterAddress}` },
    },
    packs: input.kits.map((kit, tokenId) => ({
      tokenId,
      mode: MODE_NAMES[tokenId],
      wrapperExplorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/${tokenId}`,
      manifestUri: kit.manifestUri,
      contentsEvidenceUri: input.publicRevealUris[tokenId],
      recipeCount: kit.recipes.length,
      editionPolicy: kit.editionPolicy,
      payloadPolicy: tokenId === 2
        ? { allocated: "Some(blake2b(empty payload))" }
        : tokenId === 3
          ? { generative: "None (generated at open)" }
          : tokenId === 4
            ? {
                escrow: "not applicable",
                allocated: "Some(blake2b(empty payload))",
                generative: "None (generated at open)",
              }
            : { escrow: "not applicable" },
    })),
    withheldRevealRefund: {
      statement:
        "A sixth blind allocation product intentionally withheld its reveal. After the immutable reveal deadline, a different wallet permissionlessly credited the current holder, the fully settled pack was closed, a non-payable KT1 withdrawal was rejected in read-only simulation, the credited holder withdrew successfully, and the creator released the cancelled pack's unused child capacity.",
      evidenceArtifactId: withheldEvidenceArtifact.id,
      privateOpenKitArtifactId: withheldKitArtifact.id,
      indexed: withheldRevealRefund,
    },
    openKits: {
      disclosurePolicy:
        "The deterministic pack pins a plaintext public reveal at creation. Blind products pin authenticated encrypted envelopes before sale; set_pack_contents later publishes only the exact envelope URI, reveal salt/key material, and serial offset already committed on-chain.",
      ipfsPinned: true,
      pinCalls: {
        total: input.pins.length,
        byKind: pinCallsByKind,
      },
      contentsEvidenceUris: input.publicRevealUris,
      portableDiscovery:
        "Collector two opened token 1 from a fresh browser with no configured or cached kit after discovering and decrypting the exact pre-sale envelope named by the on-chain contents URI.",
      captureLogArtifactId: openKitProgressArtifact.id,
      artifacts: openKitArtifacts.map((artifact, tokenId) => ({
        tokenId,
        artifactId: artifact.id,
        path: artifact.path,
        sha256: artifact.sha256,
      })),
    },
    durableJournal: {
      status: input.journalFinalization.status,
      journalId: input.journalFinalization.journalId,
      intentSha256: input.journalFinalization.intentSha256,
      finalSha256: input.journalFinalization.finalSha256,
      counts: input.journalFinalization.counts,
      planProvenance:
        input.currentV3RestartEvidence?.classification
          ===
            "RAVIOLI-CURRENT-V8-AUTHENTICATED-EVENT87-EFFECTIVE-CONTINUATION"
          ? input.currentV3RestartEvidence.planExtension
          : {
              provenance: "native-effective-intent",
              immutableBaseOperationCount: 67,
              effectiveOperationCount: 67,
              extensionEventIndex: null,
            },
      artifactIds: journalArtifacts.map((artifact) => artifact.id),
      operationCoverage: journalOperationCoverage,
      safety: `All ${RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total} semantic-plan signer operations are fsync-checkpointed as PREPARED before submission, SUBMITTED after hash assignment, and APPLIED only after exact TzKT status/hash, signer, immutable counter, target, entrypoint, level, timestamp, and explorer-URL verification. Raw blind preimages remain excluded from journal events: token 0 uses one schema-validated plaintext public reveal, while tokens 1–5 bind authenticated encrypted envelopes pinned before sale to their later on-chain contents writes.`,
    },
    proofPackageResume: {
      checkpointArtifactId: packageCheckpointArtifact.id,
      checkpointPath: packageCheckpointArtifact.path,
      checkpointSha256: packageCheckpointArtifact.sha256,
      chainWriteBoundary: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
      policy: "Package resume is GET-only and may rebuild proof files, finalize the exact previewed journal, and publish the run receipt followed by manifest without submitting another Tezos operation or IPFS pin.",
    },
    mutationRecovery: input.mutationRecoveryEvidence ? {
      classification: "UI-LIVE-EXACT-MUTATION-REPLAY",
      receiptArtifactId: "ravioli-mode0-mutation-recovery-receipt",
      artifactIds: mutationRecoveryArtifacts.map((artifact) => artifact.id),
      supersededPinsExcludedFromProduct: true,
    } : null,
    authenticatedResume: input.currentV3RestartEvidence ? {
      classification: input.currentV3RestartEvidence.classification,
      evidenceArtifactId: currentV3RestartArtifact?.id,
      mode1PreOp10ProofArtifactId: mode1PreOp10Artifact?.id,
      zeroSideEffectReplaySteps:
        isCurrentResumeEvidence
          ? Number(input.currentV3RestartEvidence?.zeroSideEffectReplaySteps)
          : isCurrentV5ResumeEvidence || isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
            ? 0
            : 16,
      recoveredOperationCount:
        isCurrentResumeEvidence
          ? Number(currentResumeBoundary?.operationCount)
          : isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
            ? 23
            : isCurrentV5ResumeEvidence
              ? 16
              : 9,
      supersededPrivatePrecommitPinsExcludedFromProduct: true,
      cryptoInvalidPrecommitPinsExcludedFromProduct: isCurrentV4ResumeEvidence,
      privateRecoveryPathsExcludedFromPublicProof: true,
    } : null,
    currentV3Restart: isCurrentV3RestartEvidence ? {
      classification: "RAVIOLI-CURRENT-V3-AUTHENTICATED-RESTART",
      evidenceArtifactId: currentV3RestartArtifact?.id,
      mode1PreOp10ProofArtifactId: mode1PreOp10Artifact?.id,
      zeroSideEffectReplaySteps: 16,
      supersededPrivatePrecommitPinsExcludedFromProduct: true,
      privateRecoveryPathsExcludedFromPublicProof: true,
    } : null,
    mode1PreOp10Proof: input.mode1PreOp10Proof || null,
    negativeAssertions: input.negativeAssertions,
    preWriteCapacityChecks: input.capacityChecks,
    limitedEditionPolicyEvidenceArtifactId: limitedEditionPolicyArtifact.id,
    memory: {
      heapCeilingBytes: RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES,
      peakHeapUsedBytes: Math.max(...input.memorySamples.map((sample) => sample.heapUsedBytes)),
      samples: input.memorySamples,
    },
    receipts: input.receipts,
    pins: pinArtifacts.records,
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    screenshotSidecars: input.screenshots.map((capture) => capture.manifestSidecarArtifact),
    tzktEvidenceArtifactId: indexedArtifact.id,
  };
  const receiptBytes = deterministicJsonBytes(receipt);
  const receiptRelativePath = "artifacts/ravioli-ui-live-run.json";
  const receiptPath = path.join(input.appRoot, receiptRelativePath);
  const stagedReceiptPath = `${receiptPath}.awaiting-journal-finalization`;
  await writeFile(stagedReceiptPath, receiptBytes);
  const receiptArtifact = {
    id: "ui-live-run-receipt",
    kind: "run-receipt",
    path: receiptRelativePath,
    sha256: sha256(receiptBytes),
  };
  const indexedOpenOutcomes = input.indexed.openDeliveryOutcomes as JsonObject[];
  const indexedPurchaseCheckpoints = input.indexed.wrapperPurchaseCheckpoints as JsonObject[];
  const modeOutcomeArtifacts: JsonObject[] = [];
  for (const [tokenId, spec] of PACK_SPECS.entries()) {
    const opens = indexedOpenOutcomes.filter((outcome) => Number(outcome.tokenId) === tokenId);
    const purchases = indexedPurchaseCheckpoints.filter((checkpoint) => Number(checkpoint.tokenId) === tokenId);
    assert.equal(opens.length, spec.soldEditions, `${MODE_NAMES[tokenId]} exact sold/open-outcome count drift`);
    assert.equal(purchases.length, spec.soldEditions, `${MODE_NAMES[tokenId]} indexed sold-wrapper purchase count drift`);
    for (const outcome of opens) {
      assert.ok(modeOperationHashes[tokenId].includes(String(outcome.operationHash)), `${MODE_NAMES[tokenId]} open hash is outside its operation partition`);
      assert.ok((outcome.balanceDeltas as JsonObject[]).every((delta) => Number(delta.delta) === Number(delta.amount)), `${MODE_NAMES[tokenId]} child balance delta drift`);
      assert.match(String(outcome.operationTreeSha256), /^[0-9a-f]{64}$/);
    }
    const value = {
      schema: "pastaprotocol-ravioli-mode-outcome@1",
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      tokenId,
      mode: MODE_NAMES[tokenId],
      maxSupply: spec.editions,
      expectedEditionCount: spec.soldEditions,
      operationHashes: modeOperationHashes[tokenId],
      purchaseCheckpoints: purchases,
      openOutcomes: opens,
    };
    const bytes = deterministicJsonBytes(value);
    const relativePath = `artifacts/ravioli-mode-${tokenId}-outcome.json`;
    await writeFile(path.join(input.appRoot, relativePath), bytes);
    modeOutcomeArtifacts.push({
      id: `ravioli-mode-${tokenId}-outcome`,
      kind: "mode-outcome-evidence",
      path: relativePath,
      sha256: sha256(bytes),
    });
  }
  const sidecarArtifacts = input.screenshots.map((capture) => capture.manifestSidecarArtifact);
  const artifacts = [
    ...pinArtifacts.records,
    ...openKitArtifacts,
    openKitProgressArtifact,
    ...freshDependencyArtifacts,
    ...gnocchiLimitedEditionArtifacts,
    ...mutationRecoveryArtifacts,
    ...journalArtifacts,
    dependencyArtifact,
    ...(mode1PreOp10Artifact ? [mode1PreOp10Artifact] : []),
    ...(currentV3RestartArtifact ? [currentV3RestartArtifact] : []),
    indexedArtifact,
    withheldKitArtifact,
    withheldEvidenceArtifact,
    limitedEditionPolicyArtifact,
    ...modeOutcomeArtifacts,
    packageCheckpointArtifact,
    receiptArtifact,
    ...sidecarArtifacts,
  ];
  const wrapperMetadataUris = pinUriList(input.pins, (pin) => pin.proof.fileName === "token.json");
  const wrapperMediaUris = pinUriList(input.pins, (pin) => Boolean(pin.bytes) && pin.proof.fileName.startsWith("ravioli-wrapper-"));
  const tokens = [
    ...PACK_SPECS.map((_, tokenId) => ({
      id: `ravioli-wrapper-${tokenId}`,
      contractAddress: input.mirror.routerAddress,
      tokenId: String(tokenId),
      explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/${tokenId}`,
      metadataArtifactId: pinArtifacts.byUri.get(wrapperMetadataUris[tokenId])?.id,
      mediaArtifactId: pinArtifacts.byUri.get(wrapperMediaUris[tokenId])?.id,
      metadataUri: wrapperMetadataUris[tokenId],
      artifactUri: wrapperMediaUris[tokenId],
    })),
    {
      id: "ravioli-wrapper-5-withheld-reveal-refund",
      contractAddress: input.mirror.routerAddress,
      tokenId: "5",
      explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/5`,
      metadataArtifactId: pinArtifacts.byUri.get(wrapperMetadataUris[5])?.id,
      mediaArtifactId: pinArtifacts.byUri.get(wrapperMediaUris[5])?.id,
      metadataUri: wrapperMetadataUris[5],
      artifactUri: wrapperMediaUris[5],
    },
    ...input.dependencies.rotini.generatedTokenIds.map(
      (tokenId, generatedIndex) => {
        const metadataUri = (
          input.indexed.generatedMetadataUris as string[]
        )[generatedIndex];
        const artifactUri = (
          input.indexed.generatedMediaUris as string[]
        )[generatedIndex];
        assert.ok(
          metadataUri && artifactUri,
          `Ravioli generated product token ${tokenId} lacks pinned artifacts`,
        );
        return {
          id: `ravioli-generated-product-${tokenId}`,
          productRole: "generated-child-token",
          producedByWrapperTokenId: generatedIndex < 2 ? 3 : 4,
          actionIndex: generatedIndex < 2 ? generatedIndex : 2,
          contractAddress: input.dependencies.rotini.address,
          tokenId: String(tokenId),
          explorerUrl:
            `https://shadownet.tzkt.io/${input.dependencies.rotini.address}/tokens/${tokenId}`,
          metadataArtifactId: pinArtifacts.byUri.get(metadataUri)?.id,
          mediaArtifactId: pinArtifacts.byUri.get(artifactUri)?.id,
          metadataUri,
          artifactUri,
        };
      },
    ),
  ];
  const contracts = [
    { address: input.dependencies.gnocchi.address, kind: "gnocchi-dependency", explorerUrl: `https://shadownet.tzkt.io/${input.dependencies.gnocchi.address}` },
    { address: input.dependencies.rotini.address, kind: "rotini-dependency", explorerUrl: `https://shadownet.tzkt.io/${input.dependencies.rotini.address}` },
    { address: input.mirror.blindControllerAddress, kind: "blind-pack-controller", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.blindControllerAddress}` },
    { address: input.mirror.routerAddress, kind: "atomic-pack-router", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.routerAddress}` },
    { address: input.mirror.gnocchiAdapterAddress, kind: "allocation-helper", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.gnocchiAdapterAddress}` },
    { address: input.mirror.rotiniAdapterAddress, kind: "generative-helper", explorerUrl: `https://shadownet.tzkt.io/${input.mirror.rotiniAdapterAddress}` },
  ];
  const deliveredTokenUrls = ravioliDeliveredTokenExplorerUrls({
    gnocchiAddress: input.dependencies.gnocchi.address,
    limitedAllocationTokenId: input.dependencies.gnocchi.limitedAllocationTokenId,
    foreverAllocationTokenId: input.dependencies.gnocchi.allocationTokenId,
    rotiniAddress: input.dependencies.rotini.address,
    rotiniGeneratedTokenIds: input.dependencies.rotini.generatedTokenIds,
  });
  const setupStages = input.screenshots
    .filter((capture) => (
      capture.manifestScreenshot.caption.includes("Same-run dependencies entered") ||
      capture.manifestScreenshot.caption.includes("Creator connected on Shadownet")
    ))
    .map((capture) => capture.manifestScreenshot.stage);
  const modeCapabilities = PACK_SPECS.map((spec, tokenId) => {
    const displayMode = MODE_NAMES[tokenId].replaceAll("_", " ");
    const modeCaptures = input.screenshots
      .filter((capture) => {
        const caption = capture.manifestScreenshot.caption;
        const belongsToMode = caption.includes(MODE_NAMES[tokenId]) || caption.toLowerCase().includes(displayMode);
        const supersededMode0Configuration = Boolean(
          input.mutationRecoveryEvidence &&
          tokenId === 0 &&
          capture.filenameStem === RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS[3]
        );
        return belongsToMode && !supersededMode0Configuration;
      });
    const modeStages = modeCaptures.map((capture) => capture.manifestScreenshot.stage);
    assert.ok(modeStages.length >= 2, `${MODE_NAMES[tokenId]} needs configured/issued and collector screenshot evidence`);
    assert.ok(
      modeCaptures.some((capture) => /funded and issued/i.test(capture.manifestScreenshot.caption)),
      `${MODE_NAMES[tokenId]} needs an explicit funded-and-issued screenshot`,
    );
    assert.ok(
      modeCaptures.some((capture) => /\b(?:bought|opened)\b/i.test(capture.manifestScreenshot.caption)),
      `${MODE_NAMES[tokenId]} needs a collector buy/open screenshot`,
    );
    if (tokenId === 0 && input.mutationRecoveryEvidence) {
      assert.ok(
        modeStages.some((stage) => stage.includes("exact-recovery")),
        "deterministic vault proof must cite the corrected exact-recovery configuration",
      );
    }
    const stages = tokenId === 0 ? [...setupStages, ...modeStages] : modeStages;
    const metadataArtifact = pinArtifacts.byUri.get(wrapperMetadataUris[tokenId]);
    const mediaArtifact = pinArtifacts.byUri.get(wrapperMediaUris[tokenId]);
    const manifestArtifact = pinArtifacts.byUri.get(input.kits[tokenId].manifestUri);
    const revealArtifact = pinArtifacts.byUri.get(input.publicRevealUris[tokenId]);
    assert.ok(
      revealArtifact,
      `Ravioli contents-evidence artifact is missing for token ${tokenId}`,
    );
    const generatedIndexes = tokenId === 3 ? [0, 1] : tokenId === 4 ? [2] : [];
    const generatedArtifacts = generatedIndexes.flatMap((index) => {
      const metadata = pinArtifacts.byUri.get((input.indexed.generatedMetadataUris as string[])[index]);
      const media = pinArtifacts.byUri.get((input.indexed.generatedMediaUris as string[])[index]);
      assert.ok(metadata && media, `${MODE_NAMES[tokenId]} generated token ${index} pin evidence is missing`);
      return [metadata, media];
    });
    const generatedTokenEvidence = generatedIndexes.map((index) => {
      const generatedTokenId = input.dependencies.rotini.generatedTokenIds[index]!;
      const token = tokens.find(
        (candidate) =>
          candidate.id === `ravioli-generated-product-${generatedTokenId}`,
      );
      assert.ok(
        token,
        `${MODE_NAMES[tokenId]} generated token ${generatedTokenId} manifest record is missing`,
      );
      return token;
    });
    return {
      id: `${MODE_NAMES[tokenId]}-ui-live-proof`,
      description: tokenId === 4
        ? "Create, sell, and atomically open a mixed pack delivering escrowed existing FA2, reserved allocated mint, and collector-generated Rotini token in one operation tree."
        : `Create, sell, and atomically open the ${MODE_NAMES[tokenId]} wrapper product through Ravioli's real studio and buyer page.`,
      evidence: {
        screenshots: stages,
        artifacts: [metadataArtifact?.id, mediaArtifact?.id, manifestArtifact?.id, revealArtifact.id, ...generatedArtifacts.map((artifact) => artifact.id), modeOutcomeArtifacts[tokenId].id, openKitArtifacts[tokenId].id, openKitProgressArtifact.id, ...freshDependencyArtifacts.map((artifact) => artifact.id), dependencyArtifact.id, indexedArtifact.id, receiptArtifact.id].filter(Boolean),
        contracts: contracts.map((contract) => contract.address),
        operations: modeOperationHashes[tokenId],
        tokens: [
          tokens[tokenId].id,
          ...generatedTokenEvidence.map((token) => token.id),
        ],
        roleEvidence: [],
        urls: [
          ...contracts.map((contract) => contract.explorerUrl),
          tokens[tokenId].explorerUrl,
          metadataArtifact?.gatewayUrl,
          mediaArtifact?.gatewayUrl,
          manifestArtifact?.gatewayUrl,
          revealArtifact.gatewayUrl,
          ...generatedArtifacts.map((artifact) => artifact.gatewayUrl),
          `https://shadownet.tzkt.io/${input.dependencies.gnocchi.address}`,
          `https://shadownet.tzkt.io/${input.dependencies.rotini.address}`,
          ...deliveredTokenUrls[tokenId],
          ...modeOperationHashes[tokenId].map((hash) => `https://shadownet.tzkt.io/${hash}`),
        ].filter(Boolean),
      },
    };
  });
  const blindRevealArtifacts = input.publicRevealUris
    .slice(1, PACK_SPECS.length)
    .map((uri) => {
    const artifact = pinArtifacts.byUri.get(uri);
    assert.ok(
      artifact,
      `Ravioli blind encrypted reveal-envelope artifact is missing for ${uri}`,
    );
    return { id: String(artifact.id), gatewayUrl: String(artifact.gatewayUrl) };
  });
  const revealCapability = buildRavioliRevealCapability({
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    blindRevealArtifacts,
    contracts: contracts.filter((contract) => contract.address === input.mirror.routerAddress),
    operations,
    blindTokens: tokens.slice(1, PACK_SPECS.length),
    supportingArtifactIds: [
      ...openKitArtifacts.slice(1).map((artifact) => artifact.id),
      ...pinArtifacts.records.map((artifact) => artifact.id),
      ...sidecarArtifacts.map((artifact) => artifact.id),
      ...freshDependencyArtifacts.map((artifact) => artifact.id),
      indexedArtifact.id,
      receiptArtifact.id,
    ],
  });
  const limitedEditionStages = input.screenshots
    .filter((capture) => (
      capture.manifestScreenshot.caption.includes("LE wrapper outliving child rejected") ||
      capture.manifestScreenshot.caption.includes(MODE_NAMES[2])
    ))
    .map((capture) => capture.manifestScreenshot.stage);
  assert.ok(
    limitedEditionStages.some((stage) => input.screenshots.find((capture) => capture.manifestScreenshot.stage === stage)?.manifestScreenshot.caption.includes("rejected before pins or writes")),
    "Ravioli LE capability is missing its no-side-effect Studio rejection screenshot",
  );
  assert.ok(limitedEditionStages.length >= 3, "Ravioli LE capability needs rejection, issuance, and collector visual evidence");
  const limitedMetadataArtifact = pinArtifacts.byUri.get(wrapperMetadataUris[2]);
  const limitedMediaArtifact = pinArtifacts.byUri.get(wrapperMediaUris[2]);
  const limitedManifestArtifact = pinArtifacts.byUri.get(input.kits[2].manifestUri);
  const limitedRevealArtifact = pinArtifacts.byUri.get(input.publicRevealUris[2]);
  const limitedEditionCapability = {
    id: "limited-edition-expiry-deconfliction-ui-live-proof",
    description: "Reject a Ravioli sale that outlives a capped-and-timed child, then issue, sell, and atomically open a finite-supply Ravioli LE whose immutable end is no later than the proven Gnocchi child expiry.",
    evidence: {
      screenshots: limitedEditionStages,
      artifacts: [
        limitedEditionPolicyArtifact.id,
        ...freshDependencyArtifacts.filter((artifact) => String(artifact.id).startsWith("fresh-gnocchi-")).map((artifact) => artifact.id),
        ...gnocchiLimitedEditionArtifacts.map((artifact) => artifact.id),
        limitedMetadataArtifact?.id,
        limitedMediaArtifact?.id,
        limitedManifestArtifact?.id,
        limitedRevealArtifact?.id,
        openKitArtifacts[2].id,
        dependencyArtifact.id,
        indexedArtifact.id,
        receiptArtifact.id,
      ].filter(Boolean),
      contracts: [input.mirror.routerAddress],
      operations: operations.map((operation) => operation.hash),
      tokens: [tokens[2].id],
      roleEvidence: [],
      urls: [
        `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/2`,
        input.dependencies.gnocchi.limitedEdition.receipt.token.explorerUrl,
        input.dependencies.gnocchi.limitedEdition.receipt.contract.explorerUrl,
        input.dependencies.gnocchi.limitedEdition.receipt.operation.explorerUrl,
        limitedMetadataArtifact?.gatewayUrl,
        limitedMediaArtifact?.gatewayUrl,
        limitedManifestArtifact?.gatewayUrl,
        limitedRevealArtifact?.gatewayUrl,
      ].filter(Boolean),
    },
  };
  const withheldStages = input.screenshots
    .filter((capture) => /withheld|refund|fully refunded unrevealed|pull-based|released cancelled pack child capacity/i.test(
      capture.manifestScreenshot.caption,
    ))
    .map((capture) => capture.manifestScreenshot.stage);
  assert.ok(
    withheldStages.length >= 5,
    "Ravioli withheld-reveal recovery needs configure, refund, closure, withdrawal, and child-capacity recovery screenshots",
  );
  const withheldMetadataArtifact = pinArtifacts.byUri.get(wrapperMetadataUris[5]);
  const withheldMediaArtifact = pinArtifacts.byUri.get(wrapperMediaUris[5]);
  const withheldManifestArtifact = pinArtifacts.byUri.get(withheldKit.manifestUri);
  const withheldSealedArtifact = pinArtifacts.byUri.get(String(withheldKit.sealedReveal?.contentsUri || ""));
  assert.ok(
    withheldMetadataArtifact && withheldMediaArtifact && withheldManifestArtifact && withheldSealedArtifact,
    "Ravioli withheld-reveal product pin inventory is incomplete",
  );
  const withheldRefundCapability = {
    id: "withheld-reveal-refund-closure-ui-live-proof",
    description:
      "Create and sell a finite blind allocated-mint pack, intentionally withhold its reveal, let another wallet permissionlessly credit the current holder after the immutable deadline, close the fully refunded pack, prove a rejecting KT1 cannot destroy pull-based credit, let the holder withdraw, and release every unused child reservation through the official adapter.",
    evidence: {
      screenshots: withheldStages,
      artifacts: [
        withheldEvidenceArtifact.id,
        withheldKitArtifact.id,
        withheldMetadataArtifact.id,
        withheldMediaArtifact.id,
        withheldManifestArtifact.id,
        withheldSealedArtifact.id,
        indexedArtifact.id,
        receiptArtifact.id,
      ],
      contracts: [
        input.mirror.blindControllerAddress,
        input.mirror.routerAddress,
        input.mirror.gnocchiAdapterAddress,
        input.dependencies.gnocchi.address,
      ],
      operations: [...withheldOperationHashes],
      tokens: [tokens[5].id],
      roleEvidence: [],
      urls: [
        `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/5`,
        `https://shadownet.tzkt.io/${input.mirror.blindControllerAddress}`,
        withheldMetadataArtifact.gatewayUrl,
        withheldMediaArtifact.gatewayUrl,
        withheldManifestArtifact.gatewayUrl,
        withheldSealedArtifact.gatewayUrl,
        ...withheldOperationHashes.map((hash) => `https://shadownet.tzkt.io/${hash}`),
      ],
    },
  };
  const journalStages = input.screenshots
    .filter((capture) => (
      capture.manifestScreenshot.caption.includes("Creator connected on Shadownet") ||
      capture.manifestScreenshot.caption.includes(
        "Blind reveal keys published for pre-sale encrypted envelopes",
      )
    ))
    .map((capture) => capture.manifestScreenshot.stage);
  assert.ok(journalStages.length >= 2, "Ravioli durable journal capability needs start and terminal UI evidence");
  const journalCapability = {
    id: "durable-signer-journal-ui-live-proof",
    description: `Bind all ${RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total} composed signer operations to an immutable dual-RPC intent and fsync-backed, hash-linked PREPARED/SUBMITTED/APPLIED journal with exact pin-byte checkpoints and redacted nonce commitments. The manifest adds the two independently proven exact-current dependency originations for a self-contained ${RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total + 2}-operation graph.`,
    evidence: {
      screenshots: journalStages,
      artifacts: [...journalArtifacts.map((artifact) => artifact.id), packageCheckpointArtifact.id],
      contracts: contracts.map((contract) => contract.address),
      operations: input.writeReceipts.map((receipt) => receipt.operationHash),
      tokens: tokens.map((token) => token.id),
      roleEvidence: [],
      urls: [
        ...contracts.map((contract) => contract.explorerUrl),
        ...input.writeReceipts.map((receipt) => `https://shadownet.tzkt.io/${receipt.operationHash}`),
      ],
    },
  };
  const mutationRecoveryCapability = input.mutationRecoveryEvidence ? {
    id: "mode0-exact-mutation-recovery-ui-live-proof",
    description: "Resume the interrupted deterministic-vault product from its exact hash-chained prefix without repeating the router origination, Gnocchi approval, or reusable IPFS pins; quarantine the contaminated mystery metadata and complete the corrected public product.",
    evidence: {
      screenshots: input.screenshots
        .filter((capture) => (
          capture.filenameStem === RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS[3] ||
          /exact recovery|deterministic_vault funded and issued/i.test(capture.manifestScreenshot.caption)
        ))
        .map((capture) => capture.manifestScreenshot.stage),
      artifacts: mutationRecoveryArtifacts.map((artifact) => artifact.id),
      contracts: [input.mirror.routerAddress, input.dependencies.gnocchi.address],
      operations: input.writeReceipts.slice(0, 2).map((receipt) => receipt.operationHash),
      tokens: [tokens[0].id],
      roleEvidence: [],
      urls: [
        `https://shadownet.tzkt.io/${input.mirror.routerAddress}`,
        ...input.writeReceipts.slice(0, 2).map((receipt) => `https://shadownet.tzkt.io/${receipt.operationHash}`),
      ],
    },
  } : null;
  if (mutationRecoveryCapability) {
    assert.ok(mutationRecoveryCapability.evidence.screenshots.length >= 3, "mode-0 mutation recovery needs superseded, corrected, and issued-product screenshots");
    assert.ok(mutationRecoveryCapability.evidence.screenshots.includes(RAVIOLI_MODE0_MUTATION_SCREENSHOT_STEMS[3]), "mode-0 recovery capability must retain the superseded configuration screenshot only as quarantine evidence");
  }
  const currentV3RestartCapability = input.currentV3RestartEvidence ? {
    id: isCurrentResumeEvidence
      ? "current-authenticated-resume-ui-live-proof"
      : isCurrentV7ResumeEvidence
      ? "current-v7-authenticated-event86-continuation-ui-live-proof"
      : isCurrentV6ResumeEvidence
      ? "current-v6-authenticated-counter-advance-continuation-ui-live-proof"
      : isCurrentV5ResumeEvidence
      ? "current-v5-authenticated-continuation-ui-live-proof"
      : isCurrentV4ResumeEvidence
        ? "current-v4-authenticated-resume-ui-live-proof"
        : "current-v3-authenticated-restart-ui-live-proof",
    description: isCurrentResumeEvidence
      ? Number(currentResumeBoundary?.operationCount) === 23
        ? "Authenticate the exact 85-event, 15-pin, 23-operation current journal boundary; replay zero historical pins or Tezos writes; reconstruct three issued products, the transferred blind claims, the Gnocchi adapter, and its locked LE reservation; restore authenticated private recovery; and permit only operation 24, the Rotini adapter origination, as the first new signer mutation."
        : "Authenticate the exact 38-event, 10-pin, 9-operation current journal boundary; replay all 19 historical browser mutations without another IPFS pin or Tezos write; restore the exact retained blind-product entropy; durably capture private recovery; and permit only operation 10, the mode-1 create_pack call, as the first new signer action."
      : isCurrentV7ResumeEvidence
      ? "Authenticate the exact 86-event, 15-pin, 23-operation Ravioli boundary, including the durable counter-advance event and its private precommit snapshot; bind four independent Macaroni operations that advanced shared signer counters; replay zero pins and zero semantic writes; reconstruct three issued products plus the Gnocchi adapter and LE reservation; and continue with operation 24, the Rotini adapter origination."
      : isCurrentV6ResumeEvidence
      ? "Authenticate the exact 85-event, 15-pin, 23-operation Ravioli boundary and its private precommit snapshot; bind four independent Macaroni operations that advanced shared signer counters; replay zero pins and zero semantic writes; reconstruct three issued products plus the Gnocchi adapter and LE reservation; and continue with operation 24, the Rotini adapter origination."
      : isCurrentV5ResumeEvidence
      ? "Authenticate the exact 59-event, 10-pin, 16-operation, 91-file Ravioli boundary without replaying a browser response, IPFS pin, or Tezos write; reconstruct both issued products and their collector purchase checkpoints; and continue at operation 17 with the real blind-claim-preserving wrapper transfer."
      : isCurrentV4ResumeEvidence
        ? "Authenticate the exact 40-event, 12-pin, 9-operation, 72-file Ravioli boundary; replay 16 active browser responses without repeating a pin or Tezos operation; quarantine two private-precommit and three canonical-AAD-invalid pins; produce fresh canonical sealed artifacts; prove cumulative inventory; durably capture private recovery; and independently decrypt and commitment-check the replacement blind product before operation 10."
        : "Authenticate the exact 37-event, 9-pin, 9-operation, 61-file Ravioli boundary; replay 16 browser responses without repeating a pin or Tezos operation; exclude two unrecoverable private precommit pins from the product; durably capture fresh private recovery; independently decrypt and commitment-check the replacement blind product before operation 10.",
    evidence: {
      screenshots: input.screenshots
        .filter((capture) => /superseded private precommit|blind_funded_pool funded and issued|blind_allocated_mint recovered funded and issued|transferred an unopened blind claim/i.test(
          capture.manifestScreenshot.caption,
        ))
        .map((capture) => capture.manifestScreenshot.stage),
      artifacts: [
        currentV3RestartArtifact?.id,
        ...(!isCurrentV5ResumeEvidence && !isCurrentV6ResumeEvidence && !isCurrentV7ResumeEvidence
          ? [mode1PreOp10Artifact?.id]
          : []),
        ...journalArtifacts.map((artifact) => artifact.id),
      ].filter(Boolean),
      contracts: [
        input.mirror.blindControllerAddress,
        input.mirror.routerAddress,
        input.dependencies.gnocchi.address,
        ...(isCurrentOp23ResumeEvidence ? [input.mirror.gnocchiAdapterAddress] : []),
      ],
      operations: input.writeReceipts
        .slice(
          0,
          isCurrentOp23ResumeEvidence || isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
            ? 24
            : isCurrentV5ResumeEvidence
              ? 17
              : 10,
        )
        .map((receipt) => receipt.operationHash),
      tokens: isCurrentOp23ResumeEvidence || isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
        ? [tokens[0].id, tokens[1].id, tokens[2].id]
        : [tokens[0].id, tokens[1].id],
      roleEvidence: [],
      urls: [
        `https://shadownet.tzkt.io/${input.mirror.routerAddress}`,
        `https://shadownet.tzkt.io/${input.mirror.routerAddress}/tokens/1`,
        ...input.writeReceipts
          .slice(
            0,
            isCurrentOp23ResumeEvidence || isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
              ? 24
              : isCurrentV5ResumeEvidence
                ? 17
                : 10,
          )
          .map((receipt) => `https://shadownet.tzkt.io/${receipt.operationHash}`),
      ],
    },
  } : null;
  if (currentV3RestartCapability) {
    assert.ok(
      currentV3RestartCapability.evidence.screenshots.length >= 2,
      "authenticated resume needs fresh reconfiguration and issued-product screenshots",
    );
    assert.ok(currentV3RestartArtifact);
    if (!isCurrentV5ResumeEvidence && !isCurrentV6ResumeEvidence && !isCurrentV7ResumeEvidence) {
      assert.ok(mode1PreOp10Artifact);
    }
  }
  const capabilities = [
    ...modeCapabilities,
    revealCapability,
    limitedEditionCapability,
    withheldRefundCapability,
    journalCapability,
    ...(mutationRecoveryCapability ? [mutationRecoveryCapability] : []),
    ...(currentV3RestartCapability ? [currentV3RestartCapability] : []),
  ];
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "ravioli",
    role: "token-publisher",
    runId: input.runId,
    capturedAt: input.completedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    freshDependencies: {
      schema: input.dependencies.fresh.schema,
      runId: input.dependencies.fresh.runId,
      creator: input.dependencies.fresh.creator,
      gnocchiContract: input.dependencies.fresh.gnocchi.contractAddress,
      rotiniContract: input.dependencies.fresh.rotini.contractAddress,
      validationArtifactId: dependencyArtifact.id,
      evidenceArtifactIds: [...freshDependencyArtifacts, ...gnocchiLimitedEditionArtifacts].map((artifact) => artifact.id),
      validatedBeforeEveryRavioliWrite: true,
    },
    durableJournal: {
      journalId: input.journalFinalization.journalId,
      intentSha256: input.journalFinalization.intentSha256,
      finalSha256: input.journalFinalization.finalSha256,
      counts: input.journalFinalization.counts,
      artifactIds: journalArtifacts.map((artifact) => artifact.id),
      operationCoverage: journalOperationCoverage,
    },
    proofPackageResume: {
      checkpointArtifactId: packageCheckpointArtifact.id,
      checkpointSha256: packageCheckpointArtifact.sha256,
      exactJournalFinalSha256: input.journalFinalization.finalSha256,
      chainWriteBoundary: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total,
    },
    mutationRecovery: input.mutationRecoveryEvidence ? {
      classification: "UI-LIVE-EXACT-MUTATION-REPLAY",
      receiptArtifactId: "ravioli-mode0-mutation-recovery-receipt",
      artifactIds: mutationRecoveryArtifacts.map((artifact) => artifact.id),
      supersededPinsExcludedFromProduct: true,
    } : null,
    authenticatedResume: input.currentV3RestartEvidence ? {
      classification: input.currentV3RestartEvidence.classification,
      evidenceArtifactId: currentV3RestartArtifact?.id,
      mode1PreOp10ProofArtifactId: mode1PreOp10Artifact?.id,
      zeroSideEffectReplaySteps:
        isCurrentResumeEvidence
          ? Number(input.currentV3RestartEvidence?.zeroSideEffectReplaySteps)
          : isCurrentV5ResumeEvidence || isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
            ? 0
            : 16,
      recoveredOperationCount:
        isCurrentResumeEvidence
          ? Number(currentResumeBoundary?.operationCount)
          : isCurrentV6ResumeEvidence || isCurrentV7ResumeEvidence
            ? 23
            : isCurrentV5ResumeEvidence
              ? 16
              : 9,
      supersededPrivatePrecommitPinsExcludedFromProduct: true,
      cryptoInvalidPrecommitPinsExcludedFromProduct: isCurrentV4ResumeEvidence,
      privateRecoveryPathsExcludedFromPublicProof: true,
    } : null,
    currentV3Restart: isCurrentV3RestartEvidence ? {
      classification: "RAVIOLI-CURRENT-V3-AUTHENTICATED-RESTART",
      evidenceArtifactId: currentV3RestartArtifact?.id,
      mode1PreOp10ProofArtifactId: mode1PreOp10Artifact?.id,
      zeroSideEffectReplaySteps: 16,
      recoveredOperationCount: 9,
      supersededPrivatePrecommitPinsExcludedFromProduct: true,
      privateRecoveryPathsExcludedFromPublicProof: true,
    } : null,
    limitedEditionPolicy: {
      artifactId: limitedEditionPolicyArtifact.id,
      dependencyArtifactIds: [
        ...freshDependencyArtifacts.filter((artifact) => String(artifact.id).startsWith("fresh-gnocchi-")).map((artifact) => artifact.id),
        ...gnocchiLimitedEditionArtifacts.map((artifact) => artifact.id),
      ],
      wrapperTokenId: 2,
      childContract: input.dependencies.gnocchi.address,
      childTokenId: input.dependencies.gnocchi.limitedAllocationTokenId,
      wrapperSaleEnd: input.kits[2].editionPolicy.wrapperSaleEnd,
      childExpiry: input.dependencies.gnocchi.limitedEdition.receipt.token.end,
    },
    withheldRevealRefund: {
      tokenId: 5,
      controllerAddress: input.mirror.blindControllerAddress,
      evidenceArtifactId: withheldEvidenceArtifact.id,
      privateOpenKitArtifactId: withheldKitArtifact.id,
      operationHashes: [...withheldOperationHashes],
      publicRevealPublished: false,
      cancelled: true,
      refundCreditAfterWithdrawal: 0,
    },
    openKits: {
      disclosurePolicy: "Saved before commitment and disclosed only through the deterministic creation URI or validated one-time blind public-reveal writes.",
      ipfsPinned: true,
      publicRevealUris: input.publicRevealUris,
      cleanPageDiscoveryTokenId: 1,
      captureLogArtifactId: openKitProgressArtifact.id,
      artifactIds: openKitArtifacts.map((artifact) => artifact.id),
    },
    capabilities,
    screenshots: input.screenshots.map((capture) => capture.manifestScreenshot),
    artifacts,
    contracts,
    operations,
    tokens,
    roleEvidence: [],
  };
  const manifestPath = path.join(input.appRoot, "manifest.json");
  const stagedManifestPath = `${manifestPath}.awaiting-journal-finalization`;
  await writeFile(stagedManifestPath, deterministicJsonBytes(manifest));
  return {
    routerAddress: input.mirror.routerAddress,
    adapterAddresses: { gnocchi: input.mirror.gnocchiAdapterAddress, rotini: input.mirror.rotiniAdapterAddress },
    manifestPath,
    receiptPath,
    operationHashes: input.operationHashes,
    screenshots: input.screenshots,
    memorySamples: input.memorySamples,
    stagedManifestPath,
    stagedReceiptPath,
  };
}

export async function publishStagedRavioliFile(stagedPath: string, finalPath: string): Promise<void> {
  const stagedInfo = await lstat(stagedPath);
  if (!stagedInfo.isFile() || stagedInfo.isSymbolicLink()) throw new Error(`Ravioli staging path is not a real file: ${stagedPath}`);
  const bytes = await readFile(stagedPath);
  const stagedHandle = await open(stagedPath, "r");
  try {
    await stagedHandle.sync();
  } finally {
    await stagedHandle.close();
  }
  try {
    await link(stagedPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const finalInfo = await lstat(finalPath);
    if (!finalInfo.isFile() || finalInfo.isSymbolicLink()) throw new Error(`existing Ravioli publication is not a real file: ${finalPath}`);
    assert.deepEqual(await readFile(finalPath), Buffer.from(bytes), `existing Ravioli publication differs: ${finalPath}`);
  }
  await syncRavioliUiLiveDirectory(path.dirname(finalPath));
  await unlink(stagedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await syncRavioliUiLiveDirectory(path.dirname(finalPath));
}

async function publishStagedRavioliProof(
  proof: RavioliUiLiveResult & { stagedManifestPath: string; stagedReceiptPath: string },
): Promise<void> {
  // Publish the manifest last: aggregate tooling cannot mistake a partial package for complete.
  await publishStagedRavioliFile(proof.stagedReceiptPath, proof.receiptPath);
  await publishStagedRavioliFile(proof.stagedManifestPath, proof.manifestPath);
}

export function formatRavioliUiLiveError(error: unknown, depth = 0): string {
  if (depth > 8) return "Ravioli error nesting exceeded";
  if (error instanceof AggregateError) {
    const header = error.stack || error.message;
    return [
      header,
      ...Array.from(error.errors, (entry, index) =>
        `\n[aggregate cause ${index + 1}]\n${formatRavioliUiLiveError(entry, depth + 1)}`),
    ].join("");
  }
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

async function main(): Promise<void> {
  try {
    await runRavioliUiLive();
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n${error.lines.join("\n")}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${formatRavioliUiLiveError(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
