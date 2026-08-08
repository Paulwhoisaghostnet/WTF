#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { TezosToolkit } from "@taquito/taquito";
import type { Signer } from "@taquito/core";
import { validateOperation, ValidationResult } from "@taquito/utils";

import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  createHttpGetReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
} from "./pasta-readonly-retry";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerSet,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
} from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

const RUN_ROOT_ENV = "PASTA_PROOF_RUN_DIR";
const CLEANUP_ROOT_ENV = "PASTA_RAVIOLI_EXPIRED_EVENT86_CLEANUP_ROOT";
const EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_EXPIRED_EVENT86_CLEANUP_EXECUTE";
const GLOBAL_EXECUTE_FLAG = "PASTA_SHADOWNET_E2E_EXECUTE";
const EVENT_86_RELATIVE_PATH = path.join(
  "ravioli",
  "artifacts",
  "journal",
  "events",
  "000086-counter_advance-creator.json",
);
const EVENT_86_SHA256 =
  "fa25e3744bd09305b968b17a264557d1c8009b7aa9fc6387379356361fda1f10";
const INTENT_SCHEMA =
  "pastaprotocol-ravioli-expired-event86-cleanup-intent@1";
const EVENT_SCHEMA =
  "pastaprotocol-ravioli-expired-event86-cleanup-event@1";
const RECEIPT_SCHEMA =
  "pastaprotocol-ravioli-expired-event86-cleanup@1";

export const RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY = Object.freeze({
  runId: "pasta-alpha-proof-20260724t053947z",
  journalId: "4805fc6016cc9129e74f6efb89316cb36bdefeb845633654a1c80e1ffb883df2",
  intentSha256: "190649f394f32f7462c53b7f4d1f0c6e1d8d62bf64484772cc2e7eb178bbaaa9",
  event85Sha256: "e567766c2d627c5e39c34174c23b32b0b9dc6eef8b48fd6df9e37ebb33f1551e",
  creator: "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM",
  collectorTwo: "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ",
  router: "KT1SQEXd1q5yWrwduDkC2SRoibnubP1Hq1Y5",
  controller: "KT1MkUob58kMpcftRonntJpiiQiexNEzps2c",
  gnocchiAdapter: "KT1SanxZmBUoQP4Td3JTLVnhoWV43zq9tUqN",
  gnocchi: "KT1DLiDDgvNFKeSdzvBsvBdQWZUhU5XYC5Qf",
  event86Sha256: EVENT_86_SHA256,
  codeSha256: Object.freeze({
    router:
      "203861ef17f41f1f4e1e1ef03a3eb69735b181edc682d6e5dfd3a8a95a3febf0",
    controller:
      "c6c9198870b11d3d3330b5cd290a8f71a072376ef3dbce77a97ce4533472fea8",
    gnocchiAdapter:
      "db5ef4ee05426f24528403e97cdf3486b0ec4bf369508b427f834a1c7e461001",
    gnocchi:
      "6a7a16c570ced1c6c3c884fe1c3e6b86cb50e31f187751951d0a6715d8d611bb",
  }),
});

export type RavioliExpiredCleanupActor = "creator" | "collector2";

export type RavioliExpiredCleanupStep = Readonly<{
  ordinal: number;
  id: string;
  actor: RavioliExpiredCleanupActor;
  contractAddress: string;
  entrypoint:
    | "refund_blind_claims"
    | "cancel_unrevealed_pack"
    | "withdraw_refund"
    | "recover_asset"
    | "recover_adapter";
  payload: unknown;
  reason: string;
}>;

/**
 * The exact terminal plan is derived from the immutable event-86 product state:
 * token 1 has two paid claims and two escrow-backed assets; token 2 has one
 * unsold wrapper and one allocated-mint reservation. Token 0 is neither blind
 * nor expired and is deliberately absent.
 */
export const RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN: readonly RavioliExpiredCleanupStep[] =
  Object.freeze([
    Object.freeze({
      ordinal: 1,
      id: "refund-token-1-claims",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "refund_blind_claims" as const,
      payload: Object.freeze({
        token_id: 1,
        holder: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo,
        amount: 2,
        expected_claim_id: 0,
      }),
      reason:
        "Credit both expired funded-pool claims atomically to their current holder and burn both wrappers.",
    }),
    Object.freeze({
      ordinal: 2,
      id: "cancel-token-1",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "cancel_unrevealed_pack" as const,
      payload: 1,
      reason:
        "Close the fully refunded unrevealed funded-pool pack after claims and escrow reach zero.",
    }),
    Object.freeze({
      ordinal: 3,
      id: "withdraw-token-1-refund",
      actor: "collector2" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.controller,
      entrypoint: "withdraw_refund" as const,
      payload: Object.freeze({
        destination: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo,
        amount: 2,
      }),
      reason:
        "Move the holder's complete two-mutez pull-payment credit out of the controller.",
    }),
    Object.freeze({
      ordinal: 4,
      id: "recover-token-1-asset-0",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "recover_asset" as const,
      payload: Object.freeze({
        token_id: 1,
        fa2: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.gnocchi,
        asset_token_id: 0,
        amount: 1,
      }),
      reason:
        "Return the cancelled funded-pool pack's unused token-0 inventory to the administrator.",
    }),
    Object.freeze({
      ordinal: 5,
      id: "recover-token-1-asset-1",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "recover_asset" as const,
      payload: Object.freeze({
        token_id: 1,
        fa2: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.gnocchi,
        asset_token_id: 1,
        amount: 1,
      }),
      reason:
        "Return the cancelled funded-pool pack's unused token-1 inventory to the administrator.",
    }),
    Object.freeze({
      ordinal: 6,
      id: "cancel-token-2",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "cancel_unrevealed_pack" as const,
      payload: 2,
      reason:
        "Burn the expired allocated pack's one unsold creator wrapper and close issuance.",
    }),
    Object.freeze({
      ordinal: 7,
      id: "recover-token-2-adapter",
      actor: "creator" as const,
      contractAddress: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.router,
      entrypoint: "recover_adapter" as const,
      payload: Object.freeze({
        token_id: 2,
        adapter: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.gnocchiAdapter,
        kind: 1,
        resource_id: 0,
        capacity: 1,
      }),
      reason:
        "Release the cancelled pack's exact Router allowance, adapter reservation, and Gnocchi reserved mint.",
    }),
  ]);

export type RavioliExpiredCleanupData = {
  router: {
    administrator: string;
    blindController: string;
    nextTokenId: number;
    token1: {
      mode: number;
      blind: boolean;
      finalized: boolean;
      cancelled: boolean;
      contentsPublished: boolean;
      revealDeadline: string;
      openDeadline: string;
      minted: number;
      totalSupply: number;
      holderBalance: number;
      saleActive: boolean;
      saleRemaining: number;
      asset0Allowance: number;
      asset1Allowance: number;
    };
    token2: {
      mode: number;
      blind: boolean;
      finalized: boolean;
      cancelled: boolean;
      contentsPublished: boolean;
      wrapperSaleEnd: string;
      revealDeadline: string;
      openDeadline: string;
      minted: number;
      totalSupply: number;
      creatorBalance: number;
      saleActive: boolean;
      saleRemaining: number;
      adapterAllowance: number;
    };
  };
  controller: {
    token1: {
      revealed: boolean;
      cancelled: boolean;
      outstanding: number;
      unclaimed: number;
      escrowedMutez: number;
      claimCount: number;
      claimSlots: Array<{ slot: number; claimId: number; paidMutez: number }>;
      holderCreditMutez: number;
    };
    token2: {
      revealed: boolean;
      cancelled: boolean;
      outstanding: number;
      unclaimed: number;
      escrowedMutez: number;
    };
  };
  gnocchiAssets: {
    routerToken0: number;
    creatorToken0: number;
    routerToken1: number;
    creatorToken1: number;
  };
  adapter: {
    administrator: string;
    routerAuthorized: boolean;
    resource0: {
      target: string;
      tokenId: number;
      amountPerOpen: number;
      active: boolean;
    };
    token2Reservation: number;
  };
  gnocchi: {
    administrator: string;
    adapterAuthorized: boolean;
    token2PolicyLocked: boolean;
    token2PolicyEnd: string;
    token2MaxSupply: number;
    token2TotalMinted: number;
    token2TotalSupply: number;
    token2AdapterReservation: number;
    token2TotalReserved: number;
  };
};

export type RavioliExpiredCleanupObservation = Readonly<{
  chainId: string;
  level: number;
  timestamp: string;
  data: RavioliExpiredCleanupData;
  dataSha256: string;
}>;

export type RavioliExpiredCleanupOperation = Readonly<{
  ordinal: number;
  id: string;
  hash: string;
  status: "applied";
  actor: RavioliExpiredCleanupActor;
  signerAddress: string;
  contractAddress: string;
  entrypoint: RavioliExpiredCleanupStep["entrypoint"];
  payload: unknown;
  counter: number;
  level: number;
  timestamp: string;
  explorerUrl: string;
}>;

export type RavioliExpiredCleanupClassification = Readonly<{
  completedPrefix: number;
  status: "PENDING" | "COMPLETE";
  nextStep: RavioliExpiredCleanupStep | null;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeNat(value: unknown, label: string): number {
  const result = Number(value);
  assert.ok(
    Number.isSafeInteger(result) && result >= 0,
    `${label} must be a non-negative safe integer`,
  );
  return result;
}

function timestamp(value: unknown, label: string): string {
  const parsed = Date.parse(String(value || ""));
  assert.ok(Number.isFinite(parsed), `${label} is not an RFC3339 timestamp`);
  return new Date(parsed).toISOString();
}

function exactInstant(actual: string, expected: string, label: string): void {
  assert.equal(Date.parse(actual), Date.parse(expected), `${label} drift`);
}

function cloneData(value: RavioliExpiredCleanupData): RavioliExpiredCleanupData {
  return JSON.parse(JSON.stringify(value)) as RavioliExpiredCleanupData;
}

export function ravioliExpiredCleanupDataSha256(
  value: RavioliExpiredCleanupData,
): string {
  return sha256(deterministicJsonBytes(value));
}

export function assertExactRavioliExpiredCleanupInitialState(
  data: RavioliExpiredCleanupData,
): void {
  const identity = RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY;
  assert.equal(data.router.administrator, identity.creator);
  assert.equal(data.router.blindController, identity.controller);
  assert.equal(data.router.nextTokenId, 3);
  assert.deepEqual(
    {
      mode: data.router.token1.mode,
      blind: data.router.token1.blind,
      finalized: data.router.token1.finalized,
      cancelled: data.router.token1.cancelled,
      contentsPublished: data.router.token1.contentsPublished,
      minted: data.router.token1.minted,
      totalSupply: data.router.token1.totalSupply,
      holderBalance: data.router.token1.holderBalance,
      saleActive: data.router.token1.saleActive,
      saleRemaining: data.router.token1.saleRemaining,
      asset0Allowance: data.router.token1.asset0Allowance,
      asset1Allowance: data.router.token1.asset1Allowance,
    },
    {
      mode: 1,
      blind: true,
      finalized: true,
      cancelled: false,
      contentsPublished: false,
      minted: 2,
      totalSupply: 2,
      holderBalance: 2,
      saleActive: true,
      saleRemaining: 0,
      asset0Allowance: 1,
      asset1Allowance: 1,
    },
    "expired event-86 token 1 state drift",
  );
  exactInstant(
    data.router.token1.revealDeadline,
    "2026-07-27T20:02:00.000Z",
    "token 1 reveal deadline",
  );
  exactInstant(
    data.router.token1.openDeadline,
    "2026-08-01T20:02:00.000Z",
    "token 1 open deadline",
  );
  assert.deepEqual(
    {
      mode: data.router.token2.mode,
      blind: data.router.token2.blind,
      finalized: data.router.token2.finalized,
      cancelled: data.router.token2.cancelled,
      contentsPublished: data.router.token2.contentsPublished,
      minted: data.router.token2.minted,
      totalSupply: data.router.token2.totalSupply,
      creatorBalance: data.router.token2.creatorBalance,
      saleActive: data.router.token2.saleActive,
      saleRemaining: data.router.token2.saleRemaining,
      adapterAllowance: data.router.token2.adapterAllowance,
    },
    {
      mode: 2,
      blind: true,
      finalized: true,
      cancelled: false,
      contentsPublished: false,
      minted: 1,
      totalSupply: 1,
      creatorBalance: 1,
      saleActive: true,
      saleRemaining: 1,
      adapterAllowance: 1,
    },
    "expired event-86 token 2 state drift",
  );
  exactInstant(
    data.router.token2.wrapperSaleEnd,
    "2026-07-31T18:40:00.000Z",
    "token 2 sale end",
  );
  exactInstant(
    data.router.token2.revealDeadline,
    "2026-07-31T19:10:00.000Z",
    "token 2 reveal deadline",
  );
  exactInstant(
    data.router.token2.openDeadline,
    "2026-07-31T20:40:00.000Z",
    "token 2 open deadline",
  );
  assert.deepEqual(
    data.controller.token1,
    {
      revealed: false,
      cancelled: false,
      outstanding: 2,
      unclaimed: 0,
      escrowedMutez: 2,
      claimCount: 2,
      claimSlots: [
        { slot: 0, claimId: 1, paidMutez: 1 },
        { slot: 1, claimId: 0, paidMutez: 1 },
      ],
      holderCreditMutez: 0,
    },
    "expired event-86 token 1 controller state drift",
  );
  assert.deepEqual(
    data.controller.token2,
    {
      revealed: false,
      cancelled: false,
      outstanding: 0,
      unclaimed: 1,
      escrowedMutez: 0,
    },
    "expired event-86 token 2 controller state drift",
  );
  assert.deepEqual(
    data.gnocchiAssets,
    {
      routerToken0: 2,
      creatorToken0: 0,
      routerToken1: 1,
      creatorToken1: 1,
    },
    "expired event-86 funded asset balances drift",
  );
  assert.deepEqual(
    data.adapter,
    {
      administrator: identity.creator,
      routerAuthorized: true,
      resource0: {
        target: identity.gnocchi,
        tokenId: 2,
        amountPerOpen: 1,
        active: true,
      },
      token2Reservation: 1,
    },
    "expired event-86 adapter state drift",
  );
  assert.deepEqual(
    {
      administrator: data.gnocchi.administrator,
      adapterAuthorized: data.gnocchi.adapterAuthorized,
      token2PolicyLocked: data.gnocchi.token2PolicyLocked,
      token2MaxSupply: data.gnocchi.token2MaxSupply,
      token2TotalMinted: data.gnocchi.token2TotalMinted,
      token2TotalSupply: data.gnocchi.token2TotalSupply,
      token2AdapterReservation: data.gnocchi.token2AdapterReservation,
      token2TotalReserved: data.gnocchi.token2TotalReserved,
    },
    {
      administrator: identity.creator,
      adapterAuthorized: true,
      token2PolicyLocked: true,
      token2MaxSupply: 4,
      token2TotalMinted: 3,
      token2TotalSupply: 3,
      token2AdapterReservation: 1,
      token2TotalReserved: 1,
    },
    "expired event-86 Gnocchi reservation state drift",
  );
  exactInstant(
    data.gnocchi.token2PolicyEnd,
    "2026-07-31T19:40:00.000Z",
    "Gnocchi token 2 policy end",
  );
}

export function expectedRavioliExpiredCleanupStateAfterPrefix(
  initial: RavioliExpiredCleanupData,
  completedPrefix: number,
): RavioliExpiredCleanupData {
  assert.ok(
    Number.isSafeInteger(completedPrefix)
      && completedPrefix >= 0
      && completedPrefix <= RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length,
    "cleanup prefix is invalid",
  );
  assertExactRavioliExpiredCleanupInitialState(initial);
  const expected = cloneData(initial);
  if (completedPrefix >= 1) {
    expected.router.token1.minted = 0;
    expected.router.token1.totalSupply = 0;
    expected.router.token1.holderBalance = 0;
    expected.controller.token1.outstanding = 0;
    expected.controller.token1.escrowedMutez = 0;
    expected.controller.token1.claimCount = 0;
    expected.controller.token1.claimSlots = [];
    expected.controller.token1.holderCreditMutez = 2;
  }
  if (completedPrefix >= 2) {
    expected.router.token1.finalized = false;
    expected.router.token1.cancelled = true;
    expected.router.token1.saleActive = false;
    expected.router.token1.saleRemaining = 0;
    expected.controller.token1.cancelled = true;
    expected.controller.token1.unclaimed = 0;
  }
  if (completedPrefix >= 3) {
    expected.controller.token1.holderCreditMutez = 0;
  }
  if (completedPrefix >= 4) {
    expected.router.token1.asset0Allowance = 0;
    expected.gnocchiAssets.routerToken0 -= 1;
    expected.gnocchiAssets.creatorToken0 += 1;
  }
  if (completedPrefix >= 5) {
    expected.router.token1.asset1Allowance = 0;
    expected.gnocchiAssets.routerToken1 -= 1;
    expected.gnocchiAssets.creatorToken1 += 1;
  }
  if (completedPrefix >= 6) {
    expected.router.token2.finalized = false;
    expected.router.token2.cancelled = true;
    expected.router.token2.minted = 0;
    expected.router.token2.totalSupply = 0;
    expected.router.token2.creatorBalance = 0;
    expected.router.token2.saleActive = false;
    expected.router.token2.saleRemaining = 0;
    expected.controller.token2.cancelled = true;
    expected.controller.token2.unclaimed = 0;
  }
  if (completedPrefix >= 7) {
    expected.router.token2.adapterAllowance = 0;
    expected.adapter.token2Reservation = 0;
    expected.gnocchi.token2AdapterReservation = 0;
    expected.gnocchi.token2TotalReserved = 0;
  }
  return expected;
}

export function classifyRavioliExpiredCleanupState(
  initial: RavioliExpiredCleanupData,
  current: RavioliExpiredCleanupData,
): RavioliExpiredCleanupClassification {
  assertExactRavioliExpiredCleanupInitialState(initial);
  for (
    let prefix = 0;
    prefix <= RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length;
    prefix += 1
  ) {
    if (
      ravioliExpiredCleanupDataSha256(current)
      === ravioliExpiredCleanupDataSha256(
        expectedRavioliExpiredCleanupStateAfterPrefix(initial, prefix),
      )
    ) {
      return Object.freeze({
        completedPrefix: prefix,
        status:
          prefix === RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length
            ? "COMPLETE"
            : "PENDING",
        nextStep: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[prefix] || null,
      });
    }
  }
  throw new Error(
    `live cleanup state is not an exact plan prefix: ${ravioliExpiredCleanupDataSha256(current)}`,
  );
}

function normalizePayload(
  step: RavioliExpiredCleanupStep,
  payload: unknown,
): unknown {
  if (step.entrypoint === "cancel_unrevealed_pack") {
    return safeNat(payload, `${step.id} token id`);
  }
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload));
  const value = payload as JsonObject;
  if (step.entrypoint === "refund_blind_claims") {
    return {
      token_id: safeNat(value.token_id, `${step.id} token id`),
      holder: String(value.holder || ""),
      amount: safeNat(value.amount, `${step.id} amount`),
      expected_claim_id: safeNat(
        value.expected_claim_id,
        `${step.id} expected claim id`,
      ),
    };
  }
  if (step.entrypoint === "withdraw_refund") {
    return {
      destination: String(value.destination || ""),
      amount: safeNat(value.amount, `${step.id} amount`),
    };
  }
  if (step.entrypoint === "recover_asset") {
    return {
      token_id: safeNat(value.token_id, `${step.id} token id`),
      fa2: String(value.fa2 || ""),
      asset_token_id: safeNat(
        value.asset_token_id,
        `${step.id} asset token id`,
      ),
      amount: safeNat(value.amount, `${step.id} amount`),
    };
  }
  return {
    token_id: safeNat(value.token_id, `${step.id} token id`),
    adapter: String(value.adapter || ""),
    kind: safeNat(value.kind, `${step.id} adapter kind`),
    resource_id: safeNat(value.resource_id, `${step.id} resource id`),
    capacity: safeNat(value.capacity, `${step.id} capacity`),
  };
}

function expectedSigner(step: RavioliExpiredCleanupStep): string {
  return step.actor === "creator"
    ? RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator
    : RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo;
}

export function selectExactRavioliExpiredCleanupOperation(
  rows: unknown,
  step: RavioliExpiredCleanupStep,
): RavioliExpiredCleanupOperation | null {
  assert.ok(Array.isArray(rows), `${step.id} TzKT rows must be an array`);
  const exact = (rows as JsonObject[]).filter((row) => {
    if (
      row?.sender?.address !== expectedSigner(step)
      || row?.target?.address !== step.contractAddress
      || row?.parameter?.entrypoint !== step.entrypoint
      || row?.nonce != null
    ) {
      return false;
    }
    try {
      assert.deepEqual(
        normalizePayload(step, row.parameter.value),
        normalizePayload(step, step.payload),
      );
      return true;
    } catch {
      return false;
    }
  });
  const rejected = exact.filter((row: JsonObject) => row.status !== "applied");
  assert.equal(
    rejected.length,
    0,
    `${step.id} has an exact non-applied TzKT operation and cannot be retried automatically`,
  );
  assert.ok(
    exact.length <= 1,
    `${step.id} has duplicate exact applied TzKT operations`,
  );
  if (exact.length === 0) return null;
  const row = exact[0] as JsonObject;
  const hash = String(row.hash || "");
  assert.equal(validateOperation(hash), ValidationResult.VALID, `${step.id} operation hash is invalid`);
  assert.equal(safeNat(row.amount, `${step.id} transferred amount`), 0);
  const counter = safeNat(row.counter, `${step.id} counter`);
  const level = safeNat(row.level, `${step.id} level`);
  assert.ok(counter > 0 && level > 0, `${step.id} operation identity is incomplete`);
  return Object.freeze({
    ordinal: step.ordinal,
    id: step.id,
    hash,
    status: "applied",
    actor: step.actor,
    signerAddress: expectedSigner(step),
    contractAddress: step.contractAddress,
    entrypoint: step.entrypoint,
    payload: normalizePayload(step, row.parameter.value),
    counter,
    level,
    timestamp: timestamp(row.timestamp, `${step.id} operation timestamp`),
    explorerUrl: `https://shadownet.tzkt.io/${hash}`,
  });
}

export function reconcileRavioliExpiredCleanupOperations(
  rowsByOrdinal: ReadonlyMap<number, unknown>,
): readonly RavioliExpiredCleanupOperation[] {
  const operations = RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.map((step) =>
    selectExactRavioliExpiredCleanupOperation(
      rowsByOrdinal.get(step.ordinal) || [],
      step,
    )
  );
  const firstMissing = operations.findIndex((operation) => operation === null);
  const prefix = firstMissing === -1 ? operations.length : firstMissing;
  assert.ok(
    operations.slice(prefix).every((operation) => operation === null),
    "cleanup TzKT operations do not form an exact applied prefix",
  );
  const applied = operations.slice(0, prefix) as RavioliExpiredCleanupOperation[];
  assert.equal(
    new Set(applied.map((operation) => operation.hash)).size,
    applied.length,
    "cleanup TzKT operation hashes must be unique",
  );
  return Object.freeze(applied);
}

export function assertRavioliExpiredCleanupRestartBoundary(input: {
  preparedOrdinals: ReadonlySet<number>;
  operations: readonly RavioliExpiredCleanupOperation[];
  statePrefix: number;
}): void {
  assert.equal(
    input.operations.length,
    input.statePrefix,
    "cleanup chain state and exact TzKT operation prefix disagree",
  );
  input.operations.forEach((operation, index) => {
    assert.equal(operation.ordinal, index + 1, "cleanup operations are not an exact ordinal prefix");
    assert.ok(
      input.preparedOrdinals.has(operation.ordinal),
      `applied cleanup operation ${operation.ordinal} lacks its prior PREPARED authorization`,
    );
  });
  for (const ordinal of input.preparedOrdinals) {
    assert.ok(
      Number.isSafeInteger(ordinal) && ordinal >= 1,
      "cleanup PREPARED ordinal is invalid",
    );
    assert.ok(
      ordinal <= input.operations.length + 1,
      `cleanup journal prepared operation ${ordinal} beyond the next exact prefix step`,
    );
  }
}

function rowValue(
  rows: JsonObject[],
  predicate: (key: unknown) => boolean,
  label: string,
): unknown {
  const matches = rows.filter((row) => row?.active !== false && predicate(row?.key));
  assert.ok(matches.length <= 1, `${label} has duplicate active big-map rows`);
  return matches[0]?.value;
}

function recordKey(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export async function readRavioliExpiredCleanupJson(
  url: string,
  fetchImpl?: ReadOnlyFetch,
): Promise<any> {
  const reader = createHttpGetReader({
    label: `Ravioli cleanup GET ${sha256(Buffer.from(url, "utf8"))}`,
    url,
    headers: { "user-agent": "wtfos-pasta-ravioli-event86-cleanup" },
    ...(fetchImpl ? { fetchImpl } : {}),
    parse: async (response) => response.json(),
  });
  return readWithBoundedRetry({ primary: reader });
}

async function fetchJson(url: string): Promise<any> {
  return readRavioliExpiredCleanupJson(url);
}

async function readBigMap(id: unknown, label: string): Promise<JsonObject[]> {
  const bigMapId = safeNat(id, `${label} big-map id`);
  const rows = await fetchJson(
    `${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${bigMapId}/keys?active=true&limit=10000`,
  );
  assert.ok(Array.isArray(rows), `${label} big-map response is not an array`);
  return rows as JsonObject[];
}

async function readLiveCleanupData(): Promise<RavioliExpiredCleanupData> {
  const identity = RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY;
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [routerStorage, controllerStorage, adapterStorage, gnocchiStorage] =
    await Promise.all([
      fetchJson(`${base}/contracts/${identity.router}/storage`),
      fetchJson(`${base}/contracts/${identity.controller}/storage`),
      fetchJson(`${base}/contracts/${identity.gnocchiAdapter}/storage`),
      fetchJson(`${base}/contracts/${identity.gnocchi}/storage`),
    ]);
  const [
    routerPacks,
    routerSales,
    routerLedger,
    routerMinted,
    routerSupply,
    assetAllowances,
    adapterAllowances,
    controllerPacks,
    claimSlots,
    claimCounts,
    refundCredits,
    adapterRouters,
    allocations,
    reservations,
    gnocchiLedger,
    gnocchiMinters,
    gnocchiSales,
    gnocchiPolicyLocked,
    gnocchiMinted,
    gnocchiSupply,
    gnocchiReservedMints,
    gnocchiReserved,
  ] = await Promise.all([
    readBigMap(routerStorage.packs, "router packs"),
    readBigMap(routerStorage.sales, "router sales"),
    readBigMap(routerStorage.ledger, "router ledger"),
    readBigMap(routerStorage.minted, "router minted"),
    readBigMap(routerStorage.total_supply, "router supply"),
    readBigMap(routerStorage.asset_allowances, "router asset allowances"),
    readBigMap(routerStorage.adapter_allowances, "router adapter allowances"),
    readBigMap(controllerStorage.packs, "controller packs"),
    readBigMap(controllerStorage.claim_slots, "controller claim slots"),
    readBigMap(controllerStorage.claim_counts, "controller claim counts"),
    readBigMap(controllerStorage.refund_credits, "controller refund credits"),
    readBigMap(adapterStorage.routers, "adapter routers"),
    readBigMap(adapterStorage.allocations, "adapter allocations"),
    readBigMap(adapterStorage.reservations, "adapter reservations"),
    readBigMap(gnocchiStorage.ledger, "Gnocchi ledger"),
    readBigMap(gnocchiStorage.minters, "Gnocchi minters"),
    readBigMap(gnocchiStorage.sales, "Gnocchi sales"),
    readBigMap(gnocchiStorage.policy_locked, "Gnocchi locked policies"),
    readBigMap(gnocchiStorage.total_minted, "Gnocchi minted"),
    readBigMap(gnocchiStorage.total_supply, "Gnocchi supply"),
    readBigMap(gnocchiStorage.reserved_mints, "Gnocchi owner reservations"),
    readBigMap(gnocchiStorage.total_reserved, "Gnocchi reservations"),
  ]);

  const natKey = (wanted: number) => (key: unknown) => safeNat(key, "nat big-map key") === wanted;
  const ledger = (rows: JsonObject[], owner: string, tokenId: number) =>
    safeNat(
      rowValue(rows, (key) => {
        const record = recordKey(key);
        return record?.owner === owner && safeNat(record.token_id, "ledger token id") === tokenId;
      }, `${owner} token ${tokenId} ledger`) ?? 0,
      `${owner} token ${tokenId} balance`,
    );
  const routerPack = (tokenId: number) => {
    const value = rowValue(routerPacks, natKey(tokenId), `router pack ${tokenId}`) as JsonObject;
    assert.ok(value, `router pack ${tokenId} is missing`);
    return value;
  };
  const routerSale = (tokenId: number) => {
    const value = rowValue(routerSales, natKey(tokenId), `router sale ${tokenId}`) as JsonObject;
    assert.ok(value, `router sale ${tokenId} is missing`);
    return value;
  };
  const controllerPack = (tokenId: number) => {
    const value = rowValue(controllerPacks, (key) => {
      const record = recordKey(key);
      return Boolean(record)
        && record!.pack_contract === identity.router
        && safeNat(record!.pack_token_id, "controller pack token id") === tokenId;
    }, `controller pack ${tokenId}`) as JsonObject;
    assert.ok(value, `controller pack ${tokenId} is missing`);
    return value;
  };
  const allowance = (assetTokenId: number) => safeNat(
    rowValue(assetAllowances, (key) => {
      const record = recordKey(key);
      return Boolean(record)
        && record!.fa2 === identity.gnocchi
        && safeNat(record!.pack_token_id, "asset allowance pack token") === 1
        && safeNat(record!.asset_token_id, "asset allowance token") === assetTokenId;
    }, `token 1 asset ${assetTokenId} allowance`) ?? 0,
    `token 1 asset ${assetTokenId} allowance`,
  );
  const token1 = routerPack(1);
  const token2 = routerPack(2);
  const sale1 = routerSale(1);
  const sale2 = routerSale(2);
  const controller1 = controllerPack(1);
  const controller2 = controllerPack(2);
  const claimSlotValues = claimSlots
    .filter((row) => {
      const key = recordKey(row.key);
      return Boolean(key)
        && key!.pack_contract === identity.router
        && safeNat(key!.pack_token_id, "claim pack token") === 1
        && key!.owner === identity.collectorTwo;
    })
    .map((row) => {
      const key = recordKey(row.key)!;
      const value = row.value as JsonObject;
      return {
        slot: safeNat(key.slot, "claim slot"),
        claimId: safeNat(value.claim_id, "claim id"),
        paidMutez: safeNat(value.paid, "claim paid amount"),
      };
    })
    .sort((left, right) => left.slot - right.slot);
  const allocation0 = rowValue(allocations, natKey(0), "adapter allocation 0") as JsonObject;
  assert.ok(allocation0, "adapter allocation 0 is missing");
  const gnocchiSale2 = rowValue(gnocchiSales, natKey(2), "Gnocchi sale 2") as JsonObject;
  assert.ok(gnocchiSale2, "Gnocchi sale 2 is missing");

  return {
    router: {
      administrator: String(routerStorage.administrator || ""),
      blindController: String(routerStorage.blind_controller || ""),
      nextTokenId: safeNat(routerStorage.next_token_id, "router next token id"),
      token1: {
        mode: safeNat(token1.mode, "router token 1 mode"),
        blind: Boolean(token1.blind),
        finalized: Boolean(token1.finalized),
        cancelled: Boolean(token1.cancelled),
        contentsPublished: token1.contents_uri != null,
        revealDeadline: timestamp(token1.reveal_deadline, "router token 1 reveal deadline"),
        openDeadline: timestamp(token1.open_deadline, "router token 1 open deadline"),
        minted: safeNat(rowValue(routerMinted, natKey(1), "router token 1 minted") ?? 0, "router token 1 minted"),
        totalSupply: safeNat(rowValue(routerSupply, natKey(1), "router token 1 supply") ?? 0, "router token 1 supply"),
        holderBalance: ledger(routerLedger, identity.collectorTwo, 1),
        saleActive: Boolean(sale1.active),
        saleRemaining: safeNat(sale1.remaining, "router token 1 sale remaining"),
        asset0Allowance: allowance(0),
        asset1Allowance: allowance(1),
      },
      token2: {
        mode: safeNat(token2.mode, "router token 2 mode"),
        blind: Boolean(token2.blind),
        finalized: Boolean(token2.finalized),
        cancelled: Boolean(token2.cancelled),
        contentsPublished: token2.contents_uri != null,
        wrapperSaleEnd: timestamp(token2.wrapper_sale_end, "router token 2 sale end"),
        revealDeadline: timestamp(token2.reveal_deadline, "router token 2 reveal deadline"),
        openDeadline: timestamp(token2.open_deadline, "router token 2 open deadline"),
        minted: safeNat(rowValue(routerMinted, natKey(2), "router token 2 minted") ?? 0, "router token 2 minted"),
        totalSupply: safeNat(rowValue(routerSupply, natKey(2), "router token 2 supply") ?? 0, "router token 2 supply"),
        creatorBalance: ledger(routerLedger, identity.creator, 2),
        saleActive: Boolean(sale2.active),
        saleRemaining: safeNat(sale2.remaining, "router token 2 sale remaining"),
        adapterAllowance: safeNat(
          rowValue(adapterAllowances, (key) => {
            const record = recordKey(key);
            return Boolean(record)
              && record!.adapter === identity.gnocchiAdapter
              && safeNat(record!.pack_token_id, "adapter allowance pack token") === 2
              && safeNat(record!.kind, "adapter allowance kind") === 1
              && safeNat(record!.resource_id, "adapter allowance resource") === 0;
          }, "token 2 adapter allowance") ?? 0,
          "token 2 adapter allowance",
        ),
      },
    },
    controller: {
      token1: {
        revealed: Boolean(controller1.revealed),
        cancelled: Boolean(controller1.cancelled),
        outstanding: safeNat(controller1.outstanding, "controller token 1 outstanding"),
        unclaimed: safeNat(controller1.unclaimed, "controller token 1 unclaimed"),
        escrowedMutez: safeNat(controller1.escrowed, "controller token 1 escrow"),
        claimCount: safeNat(
          rowValue(claimCounts, (key) => {
            const record = recordKey(key);
            return Boolean(record)
              && record!.pack_contract === identity.router
              && safeNat(record!.pack_token_id, "claim-count pack token") === 1
              && record!.owner === identity.collectorTwo;
          }, "token 1 collector claim count") ?? 0,
          "token 1 collector claim count",
        ),
        claimSlots: claimSlotValues,
        holderCreditMutez: safeNat(
          rowValue(refundCredits, (key) => key === identity.collectorTwo, "collector refund credit") ?? 0,
          "collector refund credit",
        ),
      },
      token2: {
        revealed: Boolean(controller2.revealed),
        cancelled: Boolean(controller2.cancelled),
        outstanding: safeNat(controller2.outstanding, "controller token 2 outstanding"),
        unclaimed: safeNat(controller2.unclaimed, "controller token 2 unclaimed"),
        escrowedMutez: safeNat(controller2.escrowed, "controller token 2 escrow"),
      },
    },
    gnocchiAssets: {
      routerToken0: ledger(gnocchiLedger, identity.router, 0),
      creatorToken0: ledger(gnocchiLedger, identity.creator, 0),
      routerToken1: ledger(gnocchiLedger, identity.router, 1),
      creatorToken1: ledger(gnocchiLedger, identity.creator, 1),
    },
    adapter: {
      administrator: String(adapterStorage.administrator || ""),
      routerAuthorized: rowValue(
        adapterRouters,
        (key) => key === identity.router,
        "adapter router authorization",
      ) !== undefined,
      resource0: {
        target: String(allocation0.target || ""),
        tokenId: safeNat(allocation0.token_id, "allocation target token"),
        amountPerOpen: safeNat(allocation0.amount_per_open, "allocation amount per open"),
        active: Boolean(allocation0.active),
      },
      token2Reservation: safeNat(
        rowValue(reservations, (key) => {
          const record = recordKey(key);
          return Boolean(record)
            && record!.pack_contract === identity.router
            && safeNat(record!.pack_token_id, "adapter reservation pack token") === 2
            && safeNat(record!.resource_id, "adapter reservation resource") === 0;
        }, "token 2 adapter reservation") ?? 0,
        "token 2 adapter reservation",
      ),
    },
    gnocchi: {
      administrator: String(gnocchiStorage.administrator || ""),
      adapterAuthorized: rowValue(
        gnocchiMinters,
        (key) => key === identity.gnocchiAdapter,
        "Gnocchi adapter minter",
      ) !== undefined,
      token2PolicyLocked: Boolean(
        rowValue(gnocchiPolicyLocked, natKey(2), "Gnocchi token 2 policy lock"),
      ),
      token2PolicyEnd: timestamp(gnocchiSale2.end, "Gnocchi token 2 policy end"),
      token2MaxSupply: safeNat(gnocchiSale2.max_supply, "Gnocchi token 2 max supply"),
      token2TotalMinted: safeNat(rowValue(gnocchiMinted, natKey(2), "Gnocchi token 2 minted") ?? 0, "Gnocchi token 2 minted"),
      token2TotalSupply: safeNat(rowValue(gnocchiSupply, natKey(2), "Gnocchi token 2 supply") ?? 0, "Gnocchi token 2 supply"),
      token2AdapterReservation: safeNat(
        rowValue(gnocchiReservedMints, (key) => {
          const record = recordKey(key);
          return Boolean(record)
            && record!.owner === identity.gnocchiAdapter
            && safeNat(record!.token_id, "Gnocchi reservation token") === 2;
        }, "Gnocchi adapter token 2 reservation") ?? 0,
        "Gnocchi adapter token 2 reservation",
      ),
      token2TotalReserved: safeNat(rowValue(gnocchiReserved, natKey(2), "Gnocchi token 2 reserved") ?? 0, "Gnocchi token 2 reserved"),
    },
  };
}

async function readRpcIdentity(rpcUrl: string): Promise<JsonObject> {
  const base = normalizeBase(rpcUrl);
  const identity = RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY;
  const [chainId, header, router, controller, adapter, gnocchi] = await Promise.all([
    fetchJson(`${base}/chains/main/chain_id`),
    fetchJson(`${base}/chains/main/blocks/head/header`),
    fetchJson(`${base}/chains/main/blocks/head/context/contracts/${identity.router}/script`),
    fetchJson(`${base}/chains/main/blocks/head/context/contracts/${identity.controller}/script`),
    fetchJson(`${base}/chains/main/blocks/head/context/contracts/${identity.gnocchiAdapter}/script`),
    fetchJson(`${base}/chains/main/blocks/head/context/contracts/${identity.gnocchi}/script`),
  ]);
  assert.equal(chainId, SHADOWNET_CHAIN_ID, `${base} is not Shadownet`);
  const codeSha256 = {
    router: hashMichelsonScriptCode(router.code),
    controller: hashMichelsonScriptCode(controller.code),
    gnocchiAdapter: hashMichelsonScriptCode(adapter.code),
    gnocchi: hashMichelsonScriptCode(gnocchi.code),
  };
  assert.deepEqual(
    codeSha256,
    identity.codeSha256,
    `${base} cleanup contract code identity drift`,
  );
  return {
    rpcUrl: base,
    chainId,
    level: safeNat(header.level, `${base} head level`),
    timestamp: timestamp(header.timestamp, `${base} head timestamp`),
    codeSha256,
  };
}

export async function readRavioliExpiredCleanupObservation(): Promise<RavioliExpiredCleanupObservation> {
  const [primary, fallback, head, data] = await Promise.all([
    readRpcIdentity(SHADOWNET_RPC_PRIMARY),
    readRpcIdentity(SHADOWNET_RPC_FALLBACK),
    fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/head`),
    readLiveCleanupData(),
  ]);
  assert.equal(primary.chainId, fallback.chainId);
  assert.deepEqual(primary.codeSha256, fallback.codeSha256);
  assert.equal(String(head.chain || "").toLowerCase(), "shadownet");
  const level = safeNat(head.level, "TzKT head level");
  assert.ok(level <= primary.level && level <= fallback.level, "TzKT head is ahead of configured RPC heads");
  return Object.freeze({
    chainId: SHADOWNET_CHAIN_ID,
    level,
    timestamp: timestamp(head.timestamp, "TzKT head timestamp"),
    data,
    dataSha256: ravioliExpiredCleanupDataSha256(data),
  });
}

async function validateSourceBoundary(runRoot: string): Promise<JsonObject> {
  assert.equal(
    path.basename(path.resolve(runRoot)),
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.runId,
    "cleanup requires the exact event-86 proof run",
  );
  const eventPath = path.join(runRoot, EVENT_86_RELATIVE_PATH);
  const bytes = await readFile(eventPath);
  assert.equal(sha256(bytes), EVENT_86_SHA256, "cleanup source event-86 digest drift");
  const event = JSON.parse(bytes.toString("utf8")) as JsonObject;
  assert.deepEqual(
    Buffer.from(bytes),
    Buffer.from(deterministicJsonBytes(event)),
    "cleanup source event 86 is not canonical JSON",
  );
  assert.equal(event.schema, "pastaprotocol-ravioli-ui-live-journal-event@2");
  assert.equal(event.phase, "COUNTER_ADVANCE");
  assert.equal(event.actor, "creator");
  assert.equal(event.eventIndex, 86);
  assert.equal(event.semanticBoundary, 23);
  assert.equal(event.nextGlobalOrdinal, 24);
  assert.equal(event.journalId, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.journalId);
  assert.equal(event.intentSha256, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.intentSha256);
  assert.equal(event.previousRecordSha256, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.event85Sha256);
  assert.equal(event.timestampUtc, "2026-07-24T20:16:00.000Z");
  return {
    runId: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.runId,
    relativePath: EVENT_86_RELATIVE_PATH.split(path.sep).join("/"),
    sha256: EVENT_86_SHA256,
    eventIndex: 86,
    semanticOperationCount: 23,
  };
}

async function readOperationRowsForStep(
  step: RavioliExpiredCleanupStep,
  baselineLevel: number,
): Promise<JsonObject[]> {
  const query = new URLSearchParams({
    sender: expectedSigner(step),
    target: step.contractAddress,
    entrypoint: step.entrypoint,
    "level.ge": String(baselineLevel),
    "sort.asc": "id",
    limit: "10000",
  });
  const rows = await fetchJson(
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?${query}`,
  );
  assert.ok(Array.isArray(rows), `${step.id} TzKT history is not an array`);
  return rows as JsonObject[];
}

async function readOperationPrefix(
  baselineLevel: number,
): Promise<readonly RavioliExpiredCleanupOperation[]> {
  const rowSets = await Promise.all(
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.map((step) =>
      readOperationRowsForStep(step, baselineLevel)
    ),
  );
  return reconcileRavioliExpiredCleanupOperations(
    new Map(rowSets.map((rows, index) => [index + 1, rows])),
  );
}

function cleanupRootFor(runRoot: string, environment: NodeJS.ProcessEnv): string {
  const configured = environment[CLEANUP_ROOT_ENV]?.trim();
  const cleanupRoot = configured
    ? path.resolve(configured)
    : path.resolve(
      path.dirname(runRoot),
      "supporting-evidence",
      RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.runId,
      "ravioli-expired-event86-cleanup",
    );
  const forbidden = path.resolve(runRoot, "ravioli", "artifacts", "journal");
  assert.equal(
    cleanupRoot === forbidden || cleanupRoot.startsWith(`${forbidden}${path.sep}`),
    false,
    "cleanup journal must be separate from original Ravioli events 1-86",
  );
  return cleanupRoot;
}

async function readOptionalJson(filePath: string): Promise<JsonObject | undefined> {
  try {
    const bytes = await readFile(filePath);
    const value = JSON.parse(bytes.toString("utf8")) as JsonObject;
    assert.deepEqual(
      Buffer.from(bytes),
      Buffer.from(deterministicJsonBytes(value)),
      `${filePath} is not canonical JSON`,
    );
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(deterministicJsonBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validateIntent(intent: JsonObject, sourceBoundary: JsonObject): void {
  assert.equal(intent.schema, INTENT_SCHEMA);
  assert.equal(intent.status, "AUTHORIZED-NOT-YET-COMPLETE");
  assert.equal(intent.network?.name, "shadownet");
  assert.equal(intent.network?.chainId, SHADOWNET_CHAIN_ID);
  assert.deepEqual(intent.sourceBoundary, sourceBoundary);
  assert.deepEqual(intent.identity, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY);
  assert.deepEqual(intent.plan, RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN);
  assertExactRavioliExpiredCleanupInitialState(intent.initialState);
  assert.equal(
    intent.initialStateSha256,
    ravioliExpiredCleanupDataSha256(intent.initialState),
  );
  safeNat(intent.baselineLevel, "cleanup intent baseline level");
  timestamp(intent.createdAt, "cleanup intent creation time");
}

async function preparedOrdinals(cleanupRoot: string): Promise<Set<number>> {
  const operationsRoot = path.join(cleanupRoot, "operations");
  try {
    const names = await readdir(operationsRoot);
    const ordinals = new Set<number>();
    for (const name of names) {
      if (!name.endsWith("-prepared.json")) continue;
      const value = await readOptionalJson(path.join(operationsRoot, name));
      assert.ok(value, `${name} disappeared during cleanup journal validation`);
      const event = value as JsonObject;
      assert.equal(event.schema, EVENT_SCHEMA);
      assert.equal(event.phase, "PREPARED");
      const ordinal = safeNat(event.ordinal, `${name} ordinal`);
      const step = RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[ordinal - 1];
      assert.ok(step, `${name} names an unknown cleanup operation`);
      assert.equal(event.id, step!.id);
      assert.deepEqual(event.step, step);
      ordinals.add(ordinal);
    }
    return ordinals;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}

async function validateAppliedJournal(
  cleanupRoot: string,
  operations: readonly RavioliExpiredCleanupOperation[],
): Promise<void> {
  const prepared = await preparedOrdinals(cleanupRoot);
  assertRavioliExpiredCleanupRestartBoundary({
    preparedOrdinals: prepared,
    operations,
    statePrefix: operations.length,
  });
  for (const operation of operations) {
    const filePath = path.join(
      cleanupRoot,
      "operations",
      `${String(operation.ordinal).padStart(3, "0")}-${operation.id}-applied.json`,
    );
    const value = await readOptionalJson(filePath);
    if (!value) continue;
    assert.equal(value.schema, EVENT_SCHEMA);
    assert.equal(value.phase, "APPLIED");
    assert.equal(value.ordinal, operation.ordinal);
    assert.deepEqual(value.operation, operation);
  }
}

export function assertRavioliExpiredCleanupExecutionAllowed(
  environment: Record<string, string | undefined>,
): void {
  assert.equal(
    environment[GLOBAL_EXECUTE_FLAG],
    "1",
    `${GLOBAL_EXECUTE_FLAG}=1 is required for cleanup execution`,
  );
  assert.equal(
    environment[EXECUTE_FLAG],
    "1",
    `${EXECUTE_FLAG}=1 is required for cleanup execution`,
  );
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "expired event-86 cleanup only permits Shadownet",
  );
  const runRoot = environment[RUN_ROOT_ENV]?.trim();
  assert.ok(runRoot, `${RUN_ROOT_ENV} must name the exact proof run`);
  assert.equal(
    path.basename(path.resolve(runRoot)),
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.runId,
    "cleanup requires the exact event-86 proof run",
  );
}

async function actorLaneClear(rpcUrl: string, actor: string): Promise<void> {
  const base = normalizeBase(rpcUrl);
  const value = await fetchJson(`${base}/chains/main/mempool/pending_operations`);
  const activeBuckets = ["applied", "validated", "branch_delayed", "unprocessed"];
  const active = activeBuckets
    .flatMap((bucket) => Array.isArray(value?.[bucket]) ? value[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) =>
      (Array.isArray(operation?.contents) ? operation.contents : [])
        .some((content: JsonObject) => content?.source === actor)
    );
  assert.equal(active.length, 0, `${base} has an active operation for ${actor}`);
}

async function estimateStep(
  tezos: TezosToolkit,
  step: RavioliExpiredCleanupStep,
): Promise<JsonObject> {
  const contract = await tezos.contract.at(step.contractAddress);
  const method = (contract.methodsObject as JsonObject)[step.entrypoint];
  assert.equal(typeof method, "function", `${step.id} entrypoint is unavailable`);
  const transfer = method(step.payload).toTransferParams({ amount: 0, mutez: true });
  const estimate = await tezos.estimate.transfer(transfer);
  return {
    gasLimit: safeNat(estimate.gasLimit, `${step.id} estimated gas`),
    storageLimit: safeNat(estimate.storageLimit, `${step.id} estimated storage`),
    suggestedFeeMutez: safeNat(estimate.suggestedFeeMutez, `${step.id} suggested fee`),
    minimalFeeMutez: safeNat(estimate.minimalFeeMutez, `${step.id} minimal fee`),
    burnFeeMutez: safeNat(estimate.burnFeeMutez, `${step.id} burn fee`),
  };
}

async function simulateStepReadonly(
  step: RavioliExpiredCleanupStep | null,
): Promise<JsonObject | null> {
  if (!step) return null;
  const tezos = new TezosToolkit(SHADOWNET_RPC_PRIMARY);
  const actor = expectedSigner(step);
  const managerKey = await tezos.rpc.getManagerKey(actor);
  const publicKey = typeof managerKey === "string" ? managerKey : managerKey?.key;
  assert.ok(publicKey, `${step.id} actor manager key is unavailable`);
  const readOnlySigner: Signer = {
    publicKeyHash: async () => actor,
    publicKey: async () => publicKey,
    secretKey: async () => undefined,
    sign: async () => {
      throw new Error("read-only cleanup simulation attempted to sign");
    },
  };
  tezos.setSignerProvider(readOnlySigner);
  return {
    actor,
    step: step.id,
    estimate: await estimateStep(tezos, step),
    signed: false,
    injected: false,
  };
}

async function sendStep(
  tezos: TezosToolkit,
  step: RavioliExpiredCleanupStep,
): Promise<string> {
  const contract = await tezos.contract.at(step.contractAddress);
  const method = (contract.methodsObject as JsonObject)[step.entrypoint];
  assert.equal(typeof method, "function", `${step.id} entrypoint is unavailable`);
  const operation = await method(step.payload).send({ amount: 0, mutez: true });
  assert.equal(validateOperation(operation.hash), ValidationResult.VALID);
  await operation.confirmation(1);
  return operation.hash;
}

async function pollStepOperation(
  step: RavioliExpiredCleanupStep,
  expectedHash: string,
  baselineLevel: number,
): Promise<RavioliExpiredCleanupOperation> {
  const query = new URLSearchParams({
    sender: expectedSigner(step),
    target: step.contractAddress,
    entrypoint: step.entrypoint,
    "level.ge": String(baselineLevel),
    "sort.asc": "id",
    limit: "10000",
  });
  const url = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?${query}`;
  const rows = await pollJson(
    `Ravioli expired cleanup ${step.id}`,
    url,
    (value) => Array.isArray(value) && value.some((row: JsonObject) => row?.hash === expectedHash),
  );
  const selected = selectExactRavioliExpiredCleanupOperation(rows, step);
  assert.ok(selected, `${step.id} exact operation did not reconcile`);
  const operation = selected as RavioliExpiredCleanupOperation;
  assert.equal(operation.hash, expectedHash, `${step.id} operation hash drift`);
  return operation;
}

async function readStatePrefix(
  initial: RavioliExpiredCleanupData,
  expectedPrefix: number,
): Promise<RavioliExpiredCleanupObservation> {
  // TzKT exposes a transaction only after applying its complete internal
  // operation tree and associated big-map diff. Once pollStepOperation sees
  // that root hash, a single state snapshot is the same indexed boundary.
  const observation = await readRavioliExpiredCleanupObservation();
  assert.equal(
    classifyRavioliExpiredCleanupState(initial, observation.data).completedPrefix,
    expectedPrefix,
    `cleanup indexed state did not reach exact prefix ${expectedPrefix}`,
  );
  return observation;
}

async function ensureAppliedRecord(
  cleanupRoot: string,
  operation: RavioliExpiredCleanupOperation,
  postState: RavioliExpiredCleanupObservation,
): Promise<void> {
  const filePath = path.join(
    cleanupRoot,
    "operations",
    `${String(operation.ordinal).padStart(3, "0")}-${operation.id}-applied.json`,
  );
  const existing = await readOptionalJson(filePath);
  const value = {
    schema: EVENT_SCHEMA,
    phase: "APPLIED",
    ordinal: operation.ordinal,
    id: operation.id,
    operation,
    postState,
  };
  if (existing) {
    assert.deepEqual(existing, value, `${operation.id} APPLIED journal drift`);
    return;
  }
  await writeExclusiveJson(filePath, value);
}

async function reconcileMissingAppliedRecord(
  cleanupRoot: string,
  operations: readonly RavioliExpiredCleanupOperation[],
  observation: RavioliExpiredCleanupObservation,
): Promise<void> {
  for (const operation of operations) {
    const filePath = path.join(
      cleanupRoot,
      "operations",
      `${String(operation.ordinal).padStart(3, "0")}-${operation.id}-applied.json`,
    );
    if (await readOptionalJson(filePath)) continue;
    assert.equal(
      operation.ordinal,
      operations.length,
      "only the terminal applied operation may need crash-window reconciliation",
    );
    await ensureAppliedRecord(cleanupRoot, operation, observation);
  }
}

function buildCleanupReceipt(input: {
  sourceBoundary: JsonObject;
  intent: JsonObject;
  observation: RavioliExpiredCleanupObservation;
  operations: readonly RavioliExpiredCleanupOperation[];
}): JsonObject {
  assert.equal(
    input.operations.length,
    RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length,
    "cleanup receipt requires the complete exact operation plan",
  );
  assert.equal(
    classifyRavioliExpiredCleanupState(
      input.intent.initialState,
      input.observation.data,
    ).status,
    "COMPLETE",
  );
  return {
    schema: RECEIPT_SCHEMA,
    classification: "CHAIN-LIVE-CLEANUP",
    status: "PASSED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    sourceBoundary: input.sourceBoundary,
    identity: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY,
    initialState: input.intent.initialState,
    initialStateSha256: input.intent.initialStateSha256,
    completedAt: input.operations[input.operations.length - 1]!.timestamp,
    terminalState: {
      data: input.observation.data,
      dataSha256: input.observation.dataSha256,
    },
    operations: input.operations,
    counts: {
      operations: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN.length,
      refundedClaims: 2,
      cancelledPacks: 2,
      recoveredAssets: 2,
      releasedAdapterCapacity: 1,
      remainingRefundCreditMutez: 0,
      remainingToken2Reservation: 0,
    },
  };
}

async function writeOrValidateReceipt(
  cleanupRoot: string,
  receipt: JsonObject,
): Promise<string> {
  const receiptPath = path.join(cleanupRoot, "receipt.json");
  const existingReceipt = await readOptionalJson(receiptPath);
  if (existingReceipt) {
    assert.deepEqual(existingReceipt, receipt, "cleanup receipt drift");
  } else {
    await writeExclusiveJson(receiptPath, receipt);
  }
  return receiptPath;
}

export async function runRavioliExpiredEvent86CleanupPreflight(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<JsonObject> {
  assert.equal(
    (environment.TEZOS_NETWORK || "shadownet").toLowerCase(),
    "shadownet",
    "expired event-86 cleanup only permits Shadownet",
  );
  const configuredRunRoot = environment[RUN_ROOT_ENV]?.trim();
  assert.ok(configuredRunRoot, `${RUN_ROOT_ENV} must name the exact proof run`);
  const runRoot = path.resolve(configuredRunRoot);
  const sourceBoundary = await validateSourceBoundary(runRoot);
  const cleanupRoot = cleanupRootFor(runRoot, environment);
  const intentPath = path.join(cleanupRoot, "intent.json");
  const intent = await readOptionalJson(intentPath);
  const observation = await readRavioliExpiredCleanupObservation();
  const now = Date.parse(observation.timestamp);
  assert.ok(
    now >= Date.parse("2026-08-01T20:02:00.000Z"),
    "cleanup is unavailable before every affected pack deadline",
  );

  if (!intent) {
    assertExactRavioliExpiredCleanupInitialState(observation.data);
    const existing = await readOperationPrefix(0);
    assert.equal(
      existing.length,
      0,
      "cleanup-shaped operations already exist without an authorized cleanup intent",
    );
    return {
      schema: "pastaprotocol-ravioli-expired-event86-cleanup-preflight@1",
      classification: "READ-ONLY-PREFLIGHT",
      status: "PENDING",
      sourceBoundary,
      cleanupRoot,
      observation,
      completedPrefix: 0,
      nextStep: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[0],
      nextStepSimulation: await simulateStepReadonly(
        RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN[0],
      ),
      plan: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN,
      signerConfigurationLoaded: false,
      writesPerformed: 0,
    };
  }

  validateIntent(intent, sourceBoundary);
  const operations = await readOperationPrefix(
    safeNat(intent.baselineLevel, "cleanup baseline level"),
  );
  await validateAppliedJournal(cleanupRoot, operations);
  const state = classifyRavioliExpiredCleanupState(intent.initialState, observation.data);
  assert.equal(
    state.completedPrefix,
    operations.length,
    "cleanup chain state and exact TzKT operation prefix disagree",
  );
  return {
    schema: "pastaprotocol-ravioli-expired-event86-cleanup-preflight@1",
    classification: "READ-ONLY-PREFLIGHT",
    status: state.status,
    sourceBoundary,
    cleanupRoot,
    observation,
    completedPrefix: state.completedPrefix,
    nextStep: state.nextStep,
    nextStepSimulation: await simulateStepReadonly(state.nextStep),
    operations,
    plan: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN,
    signerConfigurationLoaded: false,
    writesPerformed: 0,
  };
}

export async function runRavioliExpiredEvent86Cleanup(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<JsonObject> {
  assertRavioliExpiredCleanupExecutionAllowed(environment);
  const preflight = await runRavioliExpiredEvent86CleanupPreflight(environment);
  const runRoot = path.resolve(String(environment[RUN_ROOT_ENV]));
  const cleanupRoot = cleanupRootFor(runRoot, environment);
  const sourceBoundary = preflight.sourceBoundary as JsonObject;
  const intentPath = path.join(cleanupRoot, "intent.json");
  let intent = await readOptionalJson(intentPath);
  if (!intent) {
    await mkdir(path.join(cleanupRoot, "operations"), { recursive: true, mode: 0o700 });
    intent = {
      schema: INTENT_SCHEMA,
      status: "AUTHORIZED-NOT-YET-COMPLETE",
      network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
      sourceBoundary,
      identity: RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY,
      createdAt: (preflight.observation as JsonObject).timestamp,
      baselineLevel: (preflight.observation as JsonObject).level,
      initialState: (preflight.observation as JsonObject).data,
      initialStateSha256: (preflight.observation as JsonObject).dataSha256,
      plan: RAVIOLI_EXPIRED_EVENT86_CLEANUP_PLAN,
    };
    await writeExclusiveJson(intentPath, intent);
  }
  validateIntent(intent, sourceBoundary);

  let operations = await readOperationPrefix(
    safeNat(intent.baselineLevel, "cleanup baseline level"),
  );
  await validateAppliedJournal(cleanupRoot, operations);
  let observation = await readRavioliExpiredCleanupObservation();
  let classification = classifyRavioliExpiredCleanupState(
    intent.initialState,
    observation.data,
  );
  assert.equal(classification.completedPrefix, operations.length);
  await reconcileMissingAppliedRecord(cleanupRoot, operations, observation);

  if (classification.status === "COMPLETE") {
    const receipt = buildCleanupReceipt({
      sourceBoundary,
      intent,
      observation,
      operations,
    });
    const receiptPath = await writeOrValidateReceipt(cleanupRoot, receipt);
    return { ...receipt, receiptPath };
  }

  // Only after the complete read-only source/state/history preflight has passed
  // may the exact keyring identities be loaded.
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-ravioli-event86-cleanup.sock",
    authToken: "local-pasta-ravioli-event86-cleanup",
    auditLog: "/tmp/wtf-pasta-ravioli-event86-cleanup-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.equal(signerSet.creator.address, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.creator);
  assert.equal(signerSet.collectorTwo.address, RAVIOLI_EXPIRED_EVENT86_CLEANUP_IDENTITY.collectorTwo);
  const creatorTezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  const collectorTwoTezos = buildToolkit(signerSet.collectorTwoSigner, rpc.rpcUrl);
  await Promise.all([
    assertShadownet(creatorTezos, "Ravioli expired cleanup creator"),
    assertShadownet(collectorTwoTezos, "Ravioli expired cleanup collector two"),
  ]);

  while (classification.nextStep) {
    const step = classification.nextStep;
    const actor = expectedSigner(step);
    await Promise.all([
      actorLaneClear(SHADOWNET_RPC_PRIMARY, actor),
      actorLaneClear(SHADOWNET_RPC_FALLBACK, actor),
    ]);
    const tezos = step.actor === "creator" ? creatorTezos : collectorTwoTezos;
    const estimate = await estimateStep(tezos, step);
    const preparedPath = path.join(
      cleanupRoot,
      "operations",
      `${String(step.ordinal).padStart(3, "0")}-${step.id}-prepared.json`,
    );
    const preparedValue = {
      schema: EVENT_SCHEMA,
      phase: "PREPARED",
      ordinal: step.ordinal,
      id: step.id,
      step,
      preStateSha256: observation.dataSha256,
      estimate,
    };
    const existingPrepared = await readOptionalJson(preparedPath);
    if (existingPrepared) {
      assert.equal(existingPrepared.schema, EVENT_SCHEMA);
      assert.equal(existingPrepared.phase, "PREPARED");
      assert.equal(existingPrepared.ordinal, step.ordinal);
      assert.equal(existingPrepared.id, step.id);
      assert.deepEqual(existingPrepared.step, step);
      assert.equal(existingPrepared.preStateSha256, observation.dataSha256);
    } else {
      await writeExclusiveJson(preparedPath, preparedValue);
    }

    // Re-read exact history after durable PREPARED authorization. If a prior
    // process injected this operation before it could journal APPLIED, adopt
    // only that one exact TzKT identity; never submit it again.
    operations = await readOperationPrefix(
      safeNat(intent.baselineLevel, "cleanup baseline level"),
    );
    let applied = operations[step.ordinal - 1];
    if (!applied) {
      const hash = await sendStep(tezos, step);
      applied = await pollStepOperation(
        step,
        hash,
        safeNat(intent.baselineLevel, "cleanup baseline level"),
      );
    }
    observation = await readStatePrefix(intent.initialState, step.ordinal);
    await ensureAppliedRecord(cleanupRoot, applied, observation);
    operations = await readOperationPrefix(
      safeNat(intent.baselineLevel, "cleanup baseline level"),
    );
    assert.equal(operations.length, step.ordinal, `${step.id} TzKT prefix did not advance exactly once`);
    classification = classifyRavioliExpiredCleanupState(
      intent.initialState,
      observation.data,
    );
    assert.equal(classification.completedPrefix, operations.length);
  }

  const receipt = buildCleanupReceipt({
    sourceBoundary,
    intent,
    observation,
    operations,
  });
  const receiptPath = await writeOrValidateReceipt(cleanupRoot, receipt);
  return { ...receipt, receiptPath };
}

async function main(): Promise<void> {
  try {
    const result = process.env[EXECUTE_FLAG] === "1"
      ? await runRavioliExpiredEvent86Cleanup(process.env)
      : await runRavioliExpiredEvent86CleanupPreflight(process.env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
