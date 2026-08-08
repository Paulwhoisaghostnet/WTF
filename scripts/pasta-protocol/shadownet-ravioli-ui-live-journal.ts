import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";

import { packDataBytes } from "@taquito/michel-codec";
import { MichelsonMap } from "@taquito/taquito";
import { blake2b } from "blakejs";

import type {
  PastaUiLiveOperationDescriptor,
  PastaUiLivePreparedOperation,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

export const RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA = "pastaprotocol-ravioli-ui-live-journal-intent@2";
export const RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA =
  "pastaprotocol-ravioli-ui-live-journal-intent@3";
export const RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA = "pastaprotocol-ravioli-ui-live-journal-event@2";
export const RAVIOLI_UI_LIVE_JOURNAL_FINAL_SCHEMA = "pastaprotocol-ravioli-ui-live-journal-final@2";
export const RAVIOLI_UI_LIVE_PLAN_EXTENSION_SCHEMA = "pastaprotocol-ravioli-ui-live-plan-extension@1";

const HASH_RE = /^[0-9a-f]{64}$/;
const ADDRESS_RE = /^(?:tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const OPERATION_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const SAFE_NAME_RE = /^[^\\/\0\r\n]{1,255}$/;
const ACTORS = ["creator", "collector1", "collector2"] as const;
const REQUIRED_ARTIFACT_HASHES = [
  "deploymentCertificate",
  "blindController",
  "router",
  "rotiniTarget",
  "gnocchiAdapter",
  "rotiniAdapter",
] as const;
const MAX_PROJECTION_DEPTH = 64;
const MAX_PROJECTION_NODES = 50_000;
const MAX_COLLECTION_LENGTH = 2_048;
const MAX_PROJECTED_STRING_BYTES = 2_000_000;
const MAX_RECORD_BYTES = 2_500_000;
const MAX_PIN_BYTES = 5_000_000;
const PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
const SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
const SEALED_REVEAL_CIPHER = "AES-256-GCM";
const SEALED_REVEAL_KDF = "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";
const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const MODE_NAMES = Object.freeze([
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const);
const APPLIED_EVIDENCE_KEYS = Object.freeze([
  "contractAddress",
  "counter",
  "entrypoints",
  "explorerUrl",
  "level",
  "operationHash",
  "signerAddress",
  "status",
  "timestamp",
]);

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type ProjectionBudget = { nodes: number; stringBytes: number };

export type RavioliUiLiveJournalActor = typeof ACTORS[number];
export type RavioliUiLiveJournalTargetRole =
  | "blindController"
  | "router"
  | "gnocchi"
  | "gnocchiAdapter"
  | "rotini"
  | "rotiniAdapter";

export type RavioliUiLiveProofPartition =
  | "infrastructure"
  | "mode-0-deterministic-vault"
  | "mode-1-blind-funded-pool"
  | "mode-2-blind-allocated-mint"
  | "mode-3-blind-generative-mint"
  | "mode-4-hybrid-atomic-pack"
  | "withheld-reveal-refund";

export type RavioliUiLiveExpectedOperation = Readonly<{
  id: string;
  proofPartition: RavioliUiLiveProofPartition;
  globalOrdinal: number;
  actor: RavioliUiLiveJournalActor;
  operationSequence: number;
  action: "originate" | "call";
  targetRole: RavioliUiLiveJournalTargetRole;
  originRole?: "blindController" | "router" | "gnocchiAdapter" | "rotiniAdapter";
  entrypoint?: string;
  tokenId?: number;
  packMode?: number;
  tokenIds?: readonly number[];
  maxSupply?: number;
  primitiveKinds?: readonly ("escrow" | "allocated_mint" | "generative_mint")[];
  adapterRole?: "gnocchiAdapter" | "rotiniAdapter";
  adapterKind?: number;
  resourceId?: number;
  capacity?: number;
}>;

export type RavioliUiLiveRpcCounter = {
  rpcUrl: string;
  counter: number;
};

export type RavioliUiLiveActorIntent = {
  signerAddress: string;
  counters: {
    primary: RavioliUiLiveRpcCounter;
    fallback: RavioliUiLiveRpcCounter;
  };
};

export type CreateRavioliUiLiveJournalInput = {
  journalRoot: string;
  createdAt?: string;
  chainId?: string;
  actors: Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent>;
  dependencyAddresses: {
    gnocchi: string;
    rotini: string;
  };
  dependencyHashes: Record<string, string>;
  artifactHashes: Record<string, string>;
};

export type RavioliUiLiveAppliedInput = {
  actor: RavioliUiLiveJournalActor;
  operationSequence: number;
  operationHash: string;
  contractAddress?: string;
  entrypoints?: readonly string[];
  appliedAt?: string;
  evidence?: unknown;
};

export type RavioliUiLiveCounterAdvanceOperation = Readonly<{
  action: "originate" | "call";
  status: "applied";
  operationHash: string;
  counter: number;
  level: number;
  timestamp: string;
  signerAddress: string;
  contractAddress: string;
  entrypoints: readonly string[];
  explorerUrl: string;
}>;

export type RavioliUiLiveCounterAdvanceInput = Readonly<{
  recoveryId: string;
  semanticBoundary: number;
  recoveryContractAddress: string;
  advances: readonly Readonly<{
    actor: RavioliUiLiveJournalActor;
    operations: readonly RavioliUiLiveCounterAdvanceOperation[];
  }>[];
  recordedAt?: string;
}>;

export type RavioliUiLivePinInput = {
  actor: RavioliUiLiveJournalActor;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  pinnedAt?: string;
  metadata?: unknown;
  expectedSha256?: string;
  expectedByteLength?: number;
};

export type RavioliUiLivePinPreflightInput = {
  actor: RavioliUiLiveJournalActor;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  preparedAt?: string;
};

export type RavioliUiLiveJournalArtifact = {
  path: string;
  sha256: string;
  byteLength: number;
};

export type RavioliUiLiveJournalFinalization = {
  status: "FINALIZED";
  journalId: string;
  intentSha256: string;
  finalSha256: string;
  counts: {
    actors: Record<RavioliUiLiveJournalActor, number>;
    originations: number;
    calls: number;
    buys: number;
    opens: number;
    transfers: number;
    refunds: number;
    pins: number;
    events: number;
  };
  artifacts: RavioliUiLiveJournalArtifact[];
};

export type RavioliUiLiveJournalFinalizationPreview = {
  finalization: RavioliUiLiveJournalFinalization;
  finalBytes: Uint8Array;
};

export type RavioliUiLiveJournalRestartState = Readonly<{
  schema: "pastaprotocol-ravioli-ui-live-journal-restart-state@1";
  journalId: string;
  intentSha256: string;
  eventCount: number;
  pinCount: number;
  completedOperationCount: number;
  finalized: boolean;
  effectivePlan: boolean;
  actorAppliedCounts: Readonly<Record<RavioliUiLiveJournalActor, number>>;
  actorCounterOffsets: Readonly<Record<RavioliUiLiveJournalActor, number>>;
  targetBindings: Readonly<Partial<Record<RavioliUiLiveJournalTargetRole, string>>>;
  pendingOperation: null | Readonly<{
    phase: "PREPARED" | "SUBMITTED";
    expected: RavioliUiLiveExpectedOperation;
    preparedOperation: Readonly<Record<string, unknown>>;
    preparedRecordSha256: string;
    descriptorSha256: string;
    operationHash?: string;
    submittedRecordSha256?: string;
    contractAddress?: string;
  }>;
  pendingPublicRevealPreparation: null | Readonly<{
    actor: "creator";
    fileName: string;
    mimeType: "application/json";
    sha256: string;
    byteLength: number;
    preparedRecordSha256: string;
  }>;
  pendingPublicRevealBinding: null | Readonly<{
    tokenId: number;
    entrypoint: "create_pack" | "set_pack_contents";
    uri: string;
    pinSha256: string;
  }>;
}>;

type JournalIntent = {
  schema:
    | typeof RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA
    | typeof RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA;
  status: "IMMUTABLE";
  journalId: string;
  createdAt: string;
  network: { name: "shadownet"; chainId: string };
  actors: Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent>;
  dependencyAddresses: { gnocchi: string; rotini: string };
  dependencyHashes: Record<string, string>;
  artifactHashes: Record<string, string>;
  matrixSha256: string;
  matrix: readonly RavioliUiLiveExpectedOperation[];
};

type PendingOperation = {
  expected: RavioliUiLiveExpectedOperation;
  phase: "PREPARED" | "SUBMITTED";
  preparedOperation: JsonObject;
  preparedRecordSha256: string;
  descriptorSha256: string;
  operationHash?: string;
  submittedRecordSha256?: string;
  commitRecipe?: TrackedRecipe;
  blindRevealCommitment?: {
    tokenId: number;
    commitment: string;
    manifestUri: string;
  };
  publicRevealBindingSha256?: string;
};

type TrackedAction = {
  kind: "escrow" | "allocated" | "generative";
  fa2?: string;
  tokenId?: number;
  amount?: number;
  adapter?: string;
  resourceId?: number;
  payloadCommitment?: string | null;
};

type TrackedRecipe = {
  tokenId: number;
  serial: number;
  nonceCommitment: string;
  actions: TrackedAction[];
};

type PublicRevealSummary = {
  schema: typeof PUBLIC_REVEAL_SCHEMA;
  network: "shadownet";
  contract: string;
  tokenId: number;
  mode: typeof MODE_NAMES[number];
  manifestUri: string;
  maxSupply: number;
  itemCount: number;
  recipes: TrackedRecipe[];
};

type PendingPublicRevealPreparation = {
  actor: "creator";
  fileName: string;
  mimeType: "application/json";
  sha256: string;
  byteLength: number;
  summary: PublicRevealSummary;
  preparedRecordSha256: string;
};

type PendingPublicRevealBinding = {
  tokenId: number;
  entrypoint: "create_pack" | "set_pack_contents";
  uri: string;
  pinSha256: string;
};

type SealedRevealBinding = {
  schema: typeof SEALED_REVEAL_SCHEMA;
  contract: string;
  tokenId: number;
  manifestUri: string;
  uri: string;
  pinSha256: string;
};

type PinCheckpoint = {
  path: string;
  sha256: string;
  byteLength: number;
};

function freezeOperation(operation: RavioliUiLiveExpectedOperation): RavioliUiLiveExpectedOperation {
  if (operation.tokenIds) Object.freeze(operation.tokenIds);
  if (operation.primitiveKinds) Object.freeze(operation.primitiveKinds);
  return Object.freeze(operation);
}

function buildExpectedMatrix(): readonly RavioliUiLiveExpectedOperation[] {
  const operations: Omit<
    RavioliUiLiveExpectedOperation,
    "globalOrdinal" | "operationSequence"
  >[] = [];
  const push = (
    id: string,
    proofPartition: RavioliUiLiveProofPartition,
    actor: RavioliUiLiveJournalActor,
    action: "originate" | "call",
    targetRole: RavioliUiLiveJournalTargetRole,
    fields: Omit<
      RavioliUiLiveExpectedOperation,
      | "id"
      | "proofPartition"
      | "globalOrdinal"
      | "operationSequence"
      | "actor"
      | "action"
      | "targetRole"
    > = {},
  ): void => {
    if (operations.some((operation) => operation.id === id)) {
      throw new Error(`duplicate Ravioli semantic operation id: ${id}`);
    }
    operations.push({ id, proofPartition, actor, action, targetRole, ...fields });
  };
  const creatorCall = (
    id: string,
    proofPartition: RavioliUiLiveProofPartition,
    targetRole: RavioliUiLiveJournalTargetRole,
    entrypoint: string,
    fields: Omit<
      RavioliUiLiveExpectedOperation,
      | "id"
      | "proofPartition"
      | "globalOrdinal"
      | "operationSequence"
      | "actor"
      | "action"
      | "targetRole"
      | "entrypoint"
    > = {},
  ): void =>
    push(id, proofPartition, "creator", "call", targetRole, {
      entrypoint,
      ...fields,
    });
  const lifecycle = (
    proofPartition: RavioliUiLiveProofPartition,
    tokenId: number,
    packMode: number,
    recipes: readonly (readonly ("escrow" | "allocated_mint" | "generative_mint")[])[],
    blind: boolean,
  ): void => {
    creatorCall(`${proofPartition}:create-pack`, proofPartition, "router", "create_pack", {
      tokenId,
      packMode,
      maxSupply: recipes.length,
    });
    recipes.forEach((primitiveKinds, serial) =>
      creatorCall(
        `${proofPartition}:commit-recipe-${serial}`,
        proofPartition,
        "router",
        "commit_recipe",
        { tokenId, packMode, primitiveKinds },
      )
    );
    if (blind) {
      creatorCall(
        `${proofPartition}:finalize-blind-pack`,
        proofPartition,
        "router",
        "finalize_blind_pack",
        { tokenId, packMode, maxSupply: recipes.length },
      );
    } else {
      creatorCall(
        `${proofPartition}:finalize-pack`,
        proofPartition,
        "router",
        "finalize_pack",
        { tokenId, packMode },
      );
      creatorCall(`${proofPartition}:mint`, proofPartition, "router", "mint", {
        tokenId,
        packMode,
        maxSupply: recipes.length,
      });
      creatorCall(
        `${proofPartition}:set-sale`,
        proofPartition,
        "router",
        "set_sale",
        { tokenId, packMode, maxSupply: recipes.length },
      );
    }
  };

  push(
    "infrastructure:originate-blind-controller",
    "infrastructure",
    "creator",
    "originate",
    "blindController",
    { originRole: "blindController" },
  );
  push(
    "infrastructure:originate-router",
    "infrastructure",
    "creator",
    "originate",
    "router",
    { originRole: "router" },
  );
  creatorCall(
    "mode-0-deterministic-vault:authorize-escrow",
    "mode-0-deterministic-vault",
    "gnocchi",
    "update_operators",
    { tokenIds: [0] },
  );
  lifecycle("mode-0-deterministic-vault", 0, 0, [["escrow"]], false);

  creatorCall(
    "mode-1-blind-funded-pool:authorize-escrow",
    "mode-1-blind-funded-pool",
    "gnocchi",
    "update_operators",
    { tokenIds: [0, 1] },
  );
  lifecycle(
    "mode-1-blind-funded-pool",
    1,
    1,
    [["escrow"], ["escrow"]],
    true,
  );

  const collectorCall = (
    id: string,
    proofPartition: RavioliUiLiveProofPartition,
    actor: "collector1" | "collector2",
    targetRole: RavioliUiLiveJournalTargetRole,
    entrypoint: string,
    tokenId: number,
    primitiveKinds?: readonly (
      | "escrow"
      | "allocated_mint"
      | "generative_mint"
    )[],
  ): void =>
    push(id, proofPartition, actor, "call", targetRole, {
      entrypoint,
      tokenId,
      ...(primitiveKinds ? { primitiveKinds } : {}),
    });
  collectorCall(
    "mode-1-blind-funded-pool:collector1-buy",
    "mode-1-blind-funded-pool",
    "collector1",
    "router",
    "buy",
    1,
  );
  collectorCall(
    "mode-1-blind-funded-pool:collector2-buy",
    "mode-1-blind-funded-pool",
    "collector2",
    "router",
    "buy",
    1,
  );
  collectorCall(
    "mode-1-blind-funded-pool:collector1-transfer-to-collector2",
    "mode-1-blind-funded-pool",
    "collector1",
    "router",
    "transfer",
    1,
  );

  push(
    "mode-2-blind-allocated-mint:originate-gnocchi-adapter",
    "mode-2-blind-allocated-mint",
    "creator",
    "originate",
    "gnocchiAdapter",
    { originRole: "gnocchiAdapter" },
  );
  creatorCall(
    "mode-2-blind-allocated-mint:authorize-adapter",
    "mode-2-blind-allocated-mint",
    "gnocchi",
    "add_minter",
  );
  creatorCall(
    "mode-2-blind-allocated-mint:create-allocation",
    "mode-2-blind-allocated-mint",
    "gnocchiAdapter",
    "create_allocation",
  );
  creatorCall(
    "mode-2-blind-allocated-mint:authorize-router",
    "mode-2-blind-allocated-mint",
    "gnocchiAdapter",
    "add_router",
  );
  lifecycle(
    "mode-2-blind-allocated-mint",
    2,
    2,
    [["allocated_mint"]],
    true,
  );

  push(
    "mode-3-blind-generative-mint:originate-rotini-adapter",
    "mode-3-blind-generative-mint",
    "creator",
    "originate",
    "rotiniAdapter",
    { originRole: "rotiniAdapter" },
  );
  creatorCall(
    "mode-3-blind-generative-mint:authorize-adapter",
    "mode-3-blind-generative-mint",
    "rotini",
    "add_pack_minter",
  );
  creatorCall(
    "mode-3-blind-generative-mint:create-resource",
    "mode-3-blind-generative-mint",
    "rotiniAdapter",
    "create_resource",
  );
  creatorCall(
    "mode-3-blind-generative-mint:authorize-router",
    "mode-3-blind-generative-mint",
    "rotiniAdapter",
    "add_router",
  );
  lifecycle(
    "mode-3-blind-generative-mint",
    3,
    3,
    [["generative_mint", "generative_mint"]],
    true,
  );

  creatorCall(
    "mode-4-hybrid-atomic-pack:authorize-gnocchi-adapter",
    "mode-4-hybrid-atomic-pack",
    "gnocchi",
    "add_minter",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:create-allocation",
    "mode-4-hybrid-atomic-pack",
    "gnocchiAdapter",
    "create_allocation",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:authorize-gnocchi-router",
    "mode-4-hybrid-atomic-pack",
    "gnocchiAdapter",
    "add_router",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:authorize-rotini-adapter",
    "mode-4-hybrid-atomic-pack",
    "rotini",
    "add_pack_minter",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:create-resource",
    "mode-4-hybrid-atomic-pack",
    "rotiniAdapter",
    "create_resource",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:authorize-rotini-router",
    "mode-4-hybrid-atomic-pack",
    "rotiniAdapter",
    "add_router",
  );
  creatorCall(
    "mode-4-hybrid-atomic-pack:authorize-escrow",
    "mode-4-hybrid-atomic-pack",
    "gnocchi",
    "update_operators",
    { tokenIds: [1] },
  );
  lifecycle(
    "mode-4-hybrid-atomic-pack",
    4,
    4,
    [["escrow", "allocated_mint", "generative_mint"]],
    true,
  );

  collectorCall(
    "mode-0-deterministic-vault:collector1-buy",
    "mode-0-deterministic-vault",
    "collector1",
    "router",
    "buy",
    0,
  );
  collectorCall(
    "mode-0-deterministic-vault:collector1-open",
    "mode-0-deterministic-vault",
    "collector1",
    "router",
    "open_pack",
    0,
    ["escrow"],
  );

  creatorCall(
    "mode-1-blind-funded-pool:reveal-after-sellout",
    "mode-1-blind-funded-pool",
    "router",
    "set_pack_contents",
    { tokenId: 1, packMode: 1 },
  );
  collectorCall(
    "mode-1-blind-funded-pool:collector2-open-transferred-claim",
    "mode-1-blind-funded-pool",
    "collector2",
    "router",
    "open_pack",
    1,
    ["escrow"],
  );
  collectorCall(
    "mode-1-blind-funded-pool:collector2-transfer-to-collector1",
    "mode-1-blind-funded-pool",
    "collector2",
    "router",
    "transfer",
    1,
  );
  collectorCall(
    "mode-1-blind-funded-pool:collector1-open-returned-claim",
    "mode-1-blind-funded-pool",
    "collector1",
    "router",
    "open_pack",
    1,
    ["escrow"],
  );

  for (const [tokenId, partition, actor, primitives] of [
    [
      2,
      "mode-2-blind-allocated-mint",
      "collector1",
      ["allocated_mint"],
    ],
    [
      3,
      "mode-3-blind-generative-mint",
      "collector2",
      ["generative_mint", "generative_mint"],
    ],
    [
      4,
      "mode-4-hybrid-atomic-pack",
      "collector1",
      ["escrow", "allocated_mint", "generative_mint"],
    ],
  ] as const) {
    collectorCall(
      `${partition}:${actor}-buy`,
      partition,
      actor,
      "router",
      "buy",
      tokenId,
    );
    creatorCall(
      `${partition}:reveal`,
      partition,
      "router",
      "set_pack_contents",
      { tokenId, packMode: tokenId },
    );
    collectorCall(
      `${partition}:${actor}-open`,
      partition,
      actor,
      "router",
      "open_pack",
      tokenId,
      primitives,
    );
  }

  creatorCall(
    "withheld-reveal-refund:authorize-adapter",
    "withheld-reveal-refund",
    "gnocchi",
    "add_minter",
  );
  creatorCall(
    "withheld-reveal-refund:create-allocation",
    "withheld-reveal-refund",
    "gnocchiAdapter",
    "create_allocation",
  );
  creatorCall(
    "withheld-reveal-refund:authorize-router",
    "withheld-reveal-refund",
    "gnocchiAdapter",
    "add_router",
  );
  lifecycle(
    "withheld-reveal-refund",
    5,
    2,
    [["allocated_mint"], ["allocated_mint"]],
    true,
  );
  collectorCall(
    "withheld-reveal-refund:collector1-buy",
    "withheld-reveal-refund",
    "collector1",
    "router",
    "buy",
    5,
  );
  collectorCall(
    "withheld-reveal-refund:collector2-credit-holder-refund",
    "withheld-reveal-refund",
    "collector2",
    "router",
    "refund_blind_claims",
    5,
  );
  collectorCall(
    "withheld-reveal-refund:collector2-cancel-after-refunds",
    "withheld-reveal-refund",
    "collector2",
    "router",
    "cancel_unrevealed_pack",
    5,
  );
  collectorCall(
    "withheld-reveal-refund:collector1-withdraw-credit",
    "withheld-reveal-refund",
    "collector1",
    "blindController",
    "withdraw_refund",
    5,
  );

  const actorSequences: Record<RavioliUiLiveJournalActor, number> = { creator: 0, collector1: 0, collector2: 0 };
  const matrix = operations.map((operation, index) => freezeOperation({
    ...operation,
    globalOrdinal: index + 1,
    operationSequence: ++actorSequences[operation.actor],
  }));
  if (
    !matrix.some(
      (operation) =>
        operation.originRole === "blindController" &&
        operation.globalOrdinal <
          (matrix.find((candidate) => candidate.originRole === "router")
            ?.globalOrdinal || 0),
    )
  ) {
    throw new Error("Ravioli semantic plan must confirm the controller before router origination");
  }
  return Object.freeze(matrix);
}

export const RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX = buildExpectedMatrix();
export const RAVIOLI_UI_LIVE_BASE_EXPECTED_COUNTS = Object.freeze({
  actors: Object.freeze(
    Object.fromEntries(
      ACTORS.map((actor) => [
        actor,
        RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
          (operation) => operation.actor === actor,
        ).length,
      ]),
    ) as Record<RavioliUiLiveJournalActor, number>,
  ),
  originations: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.action === "originate",
  ).length,
  calls: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.action === "call",
  ).length,
  buys: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.entrypoint === "buy",
  ).length,
  opens: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.entrypoint === "open_pack",
  ).length,
  transfers: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.entrypoint === "transfer",
  ).length,
  refunds: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.entrypoint === "refund_blind_claims",
  ).length,
  total: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.length,
});

const RAVIOLI_POST_EVENT86_RECOVER_ADAPTER_OPERATION = freezeOperation({
  id: "withheld-reveal-refund:creator-recover-adapter",
  proofPartition: "withheld-reveal-refund",
  globalOrdinal: 67,
  actor: "creator",
  operationSequence: 49,
  action: "call",
  targetRole: "router",
  entrypoint: "recover_adapter",
  tokenId: 5,
  adapterRole: "gnocchiAdapter",
  adapterKind: 1,
  resourceId: 2,
  capacity: 2,
});

export const RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION = Object.freeze({
  schema: RAVIOLI_UI_LIVE_PLAN_EXTENSION_SCHEMA,
  extensionId: "ravioli-event86-withheld-gnocchi-capacity-recovery-v1",
  requiredEventIndex: 86,
  requiredPreviousRecordSha256:
    "fa25e3744bd09305b968b17a264557d1c8009b7aa9fc6387379356361fda1f10",
  semanticBoundary: 23,
  baseOperationCount: RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.length,
  operations: Object.freeze([RAVIOLI_POST_EVENT86_RECOVER_ADAPTER_OPERATION]),
});

export const RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX = Object.freeze([
  ...RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  ...RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.operations,
]);

function operationCounts(matrix: readonly RavioliUiLiveExpectedOperation[]) {
  return Object.freeze({
    actors: Object.freeze(
      Object.fromEntries(
        ACTORS.map((actor) => [
          actor,
          matrix.filter((operation) => operation.actor === actor).length,
        ]),
      ) as Record<RavioliUiLiveJournalActor, number>,
    ),
    originations: matrix.filter((operation) => operation.action === "originate").length,
    calls: matrix.filter((operation) => operation.action === "call").length,
    buys: matrix.filter((operation) => operation.entrypoint === "buy").length,
    opens: matrix.filter((operation) => operation.entrypoint === "open_pack").length,
    transfers: matrix.filter((operation) => operation.entrypoint === "transfer").length,
    refunds: matrix.filter((operation) => operation.entrypoint === "refund_blind_claims").length,
    total: matrix.length,
  });
}

export const RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS =
  operationCounts(RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX);

// New proof runs and the authenticated event-86 continuation use the corrected
// effective plan. The immutable intent itself remains the exact historical
// 66-operation matrix and is never rewritten.
export const RAVIOLI_UI_LIVE_EXPECTED_COUNTS =
  RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deterministicEqual(left: unknown, right: unknown): boolean {
  return Buffer.from(deterministicJsonBytes(left)).equals(Buffer.from(deterministicJsonBytes(right)));
}

export function ravioliUiLiveNonceCommitment(nonce: string): string {
  if (typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)) {
    throw new Error("Ravioli open_pack nonce must be exactly 32 lowercase hexadecimal bytes");
  }
  return Buffer.from(blake2b(Buffer.from(nonce, "hex"), undefined, 32)).toString("hex");
}

function requireIso(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

function requireActor(value: unknown): RavioliUiLiveJournalActor {
  if (!ACTORS.includes(value as RavioliUiLiveJournalActor)) throw new Error(`unknown Ravioli journal actor: ${String(value)}`);
  return value as RavioliUiLiveJournalActor;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return Number(value);
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireOperationHash(value: unknown): string {
  if (typeof value !== "string" || !OPERATION_RE.test(value)) throw new Error("Ravioli journal operation hash is invalid");
  return value;
}

function normalizedRpcUrl(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} URL is required`);
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} URL is unsafe`);
  }
  return parsed.toString().replace(/\/+$/, "");
}

function projectDeterministic(
  value: unknown,
  budget: ProjectionBudget = { nodes: 0, stringBytes: 0 },
): JsonValue {
  const ancestors = new Set<object>();
  const visit = (candidate: unknown, depth: number, label: string): JsonValue => {
    budget.nodes += 1;
    if (budget.nodes > MAX_PROJECTION_NODES) throw new Error("Ravioli journal projection exceeds its node limit");
    if (depth > MAX_PROJECTION_DEPTH) throw new Error("Ravioli journal projection exceeds its depth limit");
    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      budget.stringBytes += Buffer.byteLength(candidate);
      if (budget.stringBytes > MAX_PROJECTED_STRING_BYTES) throw new Error("Ravioli journal projection exceeds its string-byte limit");
      return candidate;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new Error(`${label} contains a non-finite number`);
      return Object.is(candidate, -0) ? 0 : candidate;
    }
    if (typeof candidate === "bigint") return { $bigint: candidate.toString() };
    if (candidate instanceof Uint8Array) {
      if (candidate.byteLength > MAX_PIN_BYTES) throw new Error(`${label} byte array is too large`);
      return { $bytesBase64: Buffer.from(candidate).toString("base64") };
    }
    if (!candidate || typeof candidate !== "object") throw new Error(`${label} contains an unsupported value`);
    if (ancestors.has(candidate)) throw new Error(`${label} contains a cycle`);
    ancestors.add(candidate);
    try {
      if (candidate instanceof MichelsonMap || candidate instanceof Map) {
        const entries = [...candidate.entries()];
        if (entries.length > MAX_COLLECTION_LENGTH) throw new Error(`${label} map is too large`);
        const projected = entries.map(([key, child], index) => [
          visit(key, depth + 1, `${label}.key[${index}]`),
          visit(child, depth + 1, `${label}.value[${index}]`),
        ] as [JsonValue, JsonValue]);
        projected.sort((left, right) => Buffer.compare(
          Buffer.from(deterministicJsonBytes(left[0])),
          Buffer.from(deterministicJsonBytes(right[0])),
        ));
        return { $map: projected };
      }
      if (Array.isArray(candidate)) {
        if (candidate.length > MAX_COLLECTION_LENGTH) throw new Error(`${label} array is too large`);
        return candidate.map((child, index) => visit(child, depth + 1, `${label}[${index}]`));
      }
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${label} contains an unsupported ${prototype?.constructor?.name || "object"}`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const symbols = Object.getOwnPropertySymbols(candidate);
      if (symbols.length) throw new Error(`${label} contains symbol keys`);
      const keys = Object.keys(descriptors);
      if (keys.length > MAX_COLLECTION_LENGTH) throw new Error(`${label} object is too large`);
      const output: JsonObject = Object.create(null);
      for (const key of keys.sort()) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`${label} contains a prohibited key`);
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor)) throw new Error(`${label}.${key} is an accessor`);
        output[key] = visit(descriptor.value, depth + 1, `${label}.${key}`);
      }
      return output;
    } finally {
      ancestors.delete(candidate);
    }
  };
  return visit(value, 0, "journal value");
}

function splitOwnDataField(
  value: unknown,
  field: string,
  label: string,
): { fieldValue: unknown; remainder: Record<string, unknown> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} contains an unsupported ${prototype?.constructor?.name || "object"}`);
  }
  if (Object.getOwnPropertySymbols(value).length) throw new Error(`${label} contains symbol keys`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_COLLECTION_LENGTH) throw new Error(`${label} object is too large`);
  const selected = descriptors[field];
  if (!selected || !("value" in selected)) throw new Error(`${label}.${field} is missing or an accessor`);
  const remainder: Record<string, unknown> = Object.create(null);
  for (const key of keys.sort()) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`${label} contains a prohibited key`);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) throw new Error(`${label}.${key} is an accessor`);
    if (key !== field) remainder[key] = descriptor.value;
  }
  return { fieldValue: selected.value, remainder };
}

function projectPreparedOriginationOperation(
  value: unknown,
  budget: ProjectionBudget = { nodes: 0, stringBytes: 0 },
): JsonObject {
  const split = splitOwnDataField(value, "descriptor", "Ravioli prepared origination operation");
  const operation = jsonRecord(
    projectDeterministic(split.remainder, budget),
    "Ravioli prepared origination operation envelope",
  );
  const descriptor = jsonRecord(
    projectDeterministic(split.fieldValue, budget),
    "Ravioli prepared origination descriptor",
  );
  if (descriptor.kind !== "originate") throw new Error("Ravioli origination descriptor drift");
  operation.descriptor = descriptor;
  return operation;
}

function isPreparedOriginationJournalEvent(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const operation = record.operation;
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) return false;
  const descriptor = (operation as Record<string, unknown>).descriptor;
  return (
    record.schema === RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA
    && record.phase === "PREPARED"
    && (operation as Record<string, unknown>).status === "PREPARED"
    && (operation as Record<string, unknown>).action === "originate"
    && Boolean(descriptor)
    && typeof descriptor === "object"
    && !Array.isArray(descriptor)
    && (descriptor as Record<string, unknown>).kind === "originate"
  );
}

function projectJournalJson(value: unknown): JsonObject {
  if (!isPreparedOriginationJournalEvent(value)) {
    return jsonRecord(projectDeterministic(value), "journal JSON");
  }
  const budget: ProjectionBudget = { nodes: 0, stringBytes: 0 };
  const eventSplit = splitOwnDataField(value, "operation", "Ravioli PREPARED origination event");
  const event = jsonRecord(
    projectDeterministic(eventSplit.remainder, budget),
    "Ravioli PREPARED origination event envelope",
  );
  requireExactKeys(event, [
    "actor",
    "descriptorSha256",
    "eventIndex",
    "globalOrdinal",
    "intentSha256",
    "journalId",
    "operationSequence",
    "phase",
    "previousRecordSha256",
    "schema",
    "timestampUtc",
  ], "Ravioli PREPARED origination event envelope");
  const operation = projectPreparedOriginationOperation(eventSplit.fieldValue, budget);
  requireExactKeys(operation, [
    "action",
    "chainId",
    "descriptor",
    "entrypoints",
    "operationSequence",
    "signerAddress",
    "status",
    "timestampUtc",
  ], "Ravioli PREPARED origination operation");
  requireExactKeys(
    jsonRecord(operation.descriptor, "Ravioli PREPARED origination descriptor"),
    ["code", "kind", "storage"],
    "Ravioli PREPARED origination descriptor",
  );
  event.operation = operation;
  return event;
}

export function ravioliUiLiveDescriptorSha256(descriptor: PastaUiLiveOperationDescriptor): string {
  return sha256(deterministicJsonBytes(projectDeterministic(descriptor)));
}

function jsonRecord(value: JsonValue, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must project to an object`);
  return value as JsonObject;
}

function projectedInteger(value: JsonValue | undefined, label: string): number {
  return requireInteger(value, label);
}

function primitiveKinds(value: JsonValue | undefined, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    const action = jsonRecord(entry, `${label}[${index}]`);
    const keys = Object.keys(action);
    if (keys.length !== 1) throw new Error(`${label}[${index}] must contain one primitive`);
    return keys[0];
  });
}

function requireExactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} fields drift`);
  }
}

function projectedString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function projectedKt1(value: JsonValue | undefined, label: string): string {
  const address = projectedString(value, label);
  if (!ADDRESS_RE.test(address) || !address.startsWith("KT1")) throw new Error(`${label} must be a KT1 address`);
  return address;
}

function projectedIpfsUri(value: JsonValue | undefined, label: string): string {
  const uri = projectedString(value, label);
  if (!/^ipfs:\/\/[A-Za-z0-9][A-Za-z0-9._~/-]{10,245}$/.test(uri) || uri.length > 256) {
    throw new Error(`${label} must be a bounded IPFS URI`);
  }
  return uri;
}

function payloadCommitment(value: JsonValue | undefined, label: string, allowNull: boolean): string | null {
  if (value === null && allowNull) return null;
  return requireHash(value, label);
}

function normalizePublicAction(value: JsonValue, label: string): TrackedAction {
  const action = jsonRecord(value, label);
  const kind = projectedString(action.kind, `${label}.kind`);
  if (kind === "escrow") {
    requireExactKeys(action, ["amount", "fa2", "kind", "tokenId"], label);
    return {
      kind,
      fa2: projectedKt1(action.fa2, `${label}.fa2`),
      tokenId: projectedInteger(action.tokenId, `${label}.tokenId`),
      amount: requireInteger(action.amount, `${label}.amount`, 1),
    };
  }
  if (kind === "allocated" || kind === "generative") {
    requireExactKeys(action, ["adapter", "kind", "payloadCommitment", "resourceId"], label);
    return {
      kind,
      adapter: projectedKt1(action.adapter, `${label}.adapter`),
      resourceId: projectedInteger(action.resourceId, `${label}.resourceId`),
      payloadCommitment: payloadCommitment(action.payloadCommitment, `${label}.payloadCommitment`, kind === "generative"),
    };
  }
  throw new Error(`${label} kind is unsupported`);
}

function normalizeCommittedAction(value: JsonValue, label: string): TrackedAction {
  const wrapper = jsonRecord(value, label);
  const keys = Object.keys(wrapper);
  if (keys.length !== 1) throw new Error(`${label} must contain exactly one reservation primitive`);
  const primitive = keys[0];
  const action = jsonRecord(wrapper[primitive], `${label}.${primitive}`);
  if (primitive === "escrow") {
    requireExactKeys(action, ["amount", "fa2", "token_id"], `${label}.escrow`);
    return {
      kind: "escrow",
      fa2: projectedKt1(action.fa2, `${label}.escrow.fa2`),
      tokenId: projectedInteger(action.token_id, `${label}.escrow.token_id`),
      amount: requireInteger(action.amount, `${label}.escrow.amount`, 1),
    };
  }
  if (primitive === "allocated_mint" || primitive === "generative_mint") {
    requireExactKeys(action, ["adapter", "payload_commitment", "resource_id"], `${label}.${primitive}`);
    const kind = primitive === "allocated_mint" ? "allocated" : "generative";
    return {
      kind,
      adapter: projectedKt1(action.adapter, `${label}.${primitive}.adapter`),
      resourceId: projectedInteger(action.resource_id, `${label}.${primitive}.resource_id`),
      payloadCommitment: payloadCommitment(
        action.payload_commitment,
        `${label}.${primitive}.payload_commitment`,
        kind === "generative",
      ),
    };
  }
  throw new Error(`${label} reservation primitive is unsupported`);
}

function packProfile(tokenId: number): { mode: typeof MODE_NAMES[number]; maxSupply: number; itemCount: number; recipes: string[][] } {
  const commits = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
    (operation) => operation.entrypoint === "commit_recipe" && operation.tokenId === tokenId,
  );
  const creation = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.find(
    (operation) => operation.entrypoint === "create_pack" && operation.tokenId === tokenId,
  );
  const mode = creation?.packMode === undefined ? undefined : MODE_NAMES[creation.packMode];
  if (!mode || !creation?.maxSupply || commits.length !== creation.maxSupply) throw new Error(`Ravioli pack profile ${tokenId} is incomplete`);
  const recipes = commits.map((operation) => [...(operation.primitiveKinds || [])]);
  const itemCount = recipes[0]?.length || 0;
  if (!itemCount || recipes.some((recipe) => recipe.length !== itemCount)) throw new Error(`Ravioli pack profile ${tokenId} item count drift`);
  return { mode, maxSupply: creation.maxSupply, itemCount, recipes };
}

function committedRecipeFromOperation(expected: RavioliUiLiveExpectedOperation, operation: JsonObject, serial: number): TrackedRecipe {
  const descriptor = jsonRecord(operation.descriptor, "commit operation descriptor");
  const call = jsonRecord(descriptor.call, "commit operation call");
  const payload = jsonRecord(call.payload, "commit_recipe payload");
  if (projectedInteger(payload.token_id, "commit token id") !== expected.tokenId) throw new Error("Ravioli commit token drift");
  const reservations = payload.reservations;
  if (!Array.isArray(reservations)) throw new Error("commit_recipe reservations must be an array");
  const nonceCommitment = requireHash(payload.nonce_commitment, "commit_recipe nonce commitment");
  return {
    tokenId: expected.tokenId!,
    serial,
    nonceCommitment,
    actions: reservations.map((action, index) => normalizeCommittedAction(action, `commit_recipe.reservations[${index}]`)),
  };
}

const RAVIOLI_REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
} as const;

function revealCommitment(
  contentsUri: string,
  salt: string,
  offset: number,
): string {
  if (!/^ipfs:\/\/[^\s]{1,249}$/.test(contentsUri)) {
    throw new Error("Ravioli reveal commitment contents URI is invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(salt)) {
    throw new Error("Ravioli reveal commitment salt is invalid");
  }
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
    RAVIOLI_REVEAL_PACK_TYPE as any,
  ).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

function publicRevealFromExactBytes(bytes: Uint8Array, routerAddress: string): { summary: PublicRevealSummary; rawNonces: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new Error("Ravioli PUBLIC_REVEAL must be exact JSON bytes"); }
  const canonical = deterministicJsonBytes(parsed);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) throw new Error("Ravioli PUBLIC_REVEAL bytes must use canonical JSON encoding");
  const reveal = jsonRecord(projectDeterministic(parsed), "Ravioli PUBLIC_REVEAL");
  requireExactKeys(reveal, ["contract", "itemCount", "manifestUri", "maxSupply", "mode", "network", "openKit", "schema", "tokenId"], "Ravioli PUBLIC_REVEAL");
  if (reveal.schema !== PUBLIC_REVEAL_SCHEMA) throw new Error("Ravioli PUBLIC_REVEAL schema drift");
  if (reveal.network !== "shadownet") throw new Error("Ravioli PUBLIC_REVEAL network drift");
  if (reveal.contract !== routerAddress) throw new Error("Ravioli PUBLIC_REVEAL router drift");
  const tokenId = projectedInteger(reveal.tokenId, "Ravioli PUBLIC_REVEAL token id");
  const profile = packProfile(tokenId);
  if (reveal.mode !== profile.mode) throw new Error("Ravioli PUBLIC_REVEAL mode drift");
  if (projectedInteger(reveal.maxSupply, "Ravioli PUBLIC_REVEAL max supply") !== profile.maxSupply) throw new Error("Ravioli PUBLIC_REVEAL supply drift");
  if (projectedInteger(reveal.itemCount, "Ravioli PUBLIC_REVEAL item count") !== profile.itemCount) throw new Error("Ravioli PUBLIC_REVEAL item count drift");
  const manifestUri = projectedIpfsUri(reveal.manifestUri, "Ravioli PUBLIC_REVEAL manifest URI");

  const kit = jsonRecord(reveal.openKit, "Ravioli PUBLIC_REVEAL open kit");
  requireExactKeys(kit, ["blindSecurity", "contract", "editionPolicy", "manifestUri", "mode", "network", "recipes", "schema", "tokenId", "warning"], "Ravioli PUBLIC_REVEAL open kit");
  if (kit.schema !== OPEN_KIT_SCHEMA || kit.network !== "shadownet") throw new Error("Ravioli PUBLIC_REVEAL open-kit identity drift");
  if (kit.contract !== routerAddress || projectedInteger(kit.tokenId, "Ravioli open-kit token id") !== tokenId) throw new Error("Ravioli PUBLIC_REVEAL open-kit target drift");
  if (kit.mode !== profile.mode || kit.manifestUri !== manifestUri) throw new Error("Ravioli PUBLIC_REVEAL open-kit mode/manifest drift");
  if (typeof kit.warning !== "string" || !kit.warning.length || !kit.editionPolicy || typeof kit.editionPolicy !== "object") {
    throw new Error("Ravioli PUBLIC_REVEAL open-kit policy fields are malformed");
  }
  const expectedBlindSecurity = tokenId === 0 ? "public" : "commit-reveal-ui-hidden-chain-public";
  if (kit.blindSecurity !== expectedBlindSecurity) throw new Error("Ravioli PUBLIC_REVEAL blind policy drift");
  if (!Array.isArray(kit.recipes) || kit.recipes.length !== profile.maxSupply) throw new Error("Ravioli PUBLIC_REVEAL recipe count drift");

  const rawNonces: string[] = [];
  const seenNonces = new Set<string>();
  const recipes = kit.recipes.map((value, serial): TrackedRecipe => {
    const recipe = jsonRecord(value, `Ravioli PUBLIC_REVEAL recipe ${serial}`);
    requireExactKeys(recipe, ["actions", "nonce", "serial"], `Ravioli PUBLIC_REVEAL recipe ${serial}`);
    if (projectedInteger(recipe.serial, `Ravioli PUBLIC_REVEAL recipe ${serial} serial`) !== serial) throw new Error("Ravioli PUBLIC_REVEAL recipe serial drift");
    const nonce = projectedString(recipe.nonce, `Ravioli PUBLIC_REVEAL recipe ${serial} nonce`);
    if (!/^[0-9a-f]{64}$/.test(nonce) || seenNonces.has(nonce)) throw new Error("Ravioli PUBLIC_REVEAL recipe nonce is malformed or reused");
    seenNonces.add(nonce);
    rawNonces.push(nonce);
    if (!Array.isArray(recipe.actions) || recipe.actions.length !== profile.itemCount) throw new Error("Ravioli PUBLIC_REVEAL recipe action count drift");
    const actions = recipe.actions.map((action, index) => normalizePublicAction(action, `Ravioli PUBLIC_REVEAL recipe ${serial} action ${index}`));
    const kinds = actions.map((action) => action.kind === "allocated" ? "allocated_mint" : action.kind === "generative" ? "generative_mint" : "escrow");
    if (JSON.stringify(kinds) !== JSON.stringify(profile.recipes[serial])) throw new Error("Ravioli PUBLIC_REVEAL recipe action order drift");
    return { tokenId, serial, nonceCommitment: ravioliUiLiveNonceCommitment(nonce), actions };
  });
  return {
    summary: {
      schema: PUBLIC_REVEAL_SCHEMA,
      network: "shadownet",
      contract: routerAddress,
      tokenId,
      mode: profile.mode,
      manifestUri,
      maxSupply: profile.maxSupply,
      itemCount: profile.itemCount,
      recipes,
    },
    rawNonces,
  };
}

function sealedRevealFromExactBytes(
  bytes: Uint8Array,
  expectedRouterAddress?: string,
): Omit<SealedRevealBinding, "uri" | "pinSha256"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Ravioli sealed reveal must be exact JSON bytes");
  }
  if (!Buffer.from(bytes).equals(Buffer.from(deterministicJsonBytes(parsed)))) {
    throw new Error("Ravioli sealed reveal bytes must use canonical JSON encoding");
  }
  const envelope = jsonRecord(
    projectDeterministic(parsed),
    "Ravioli sealed reveal envelope",
  );
  requireExactKeys(
    envelope,
    ["aad", "cipher", "ciphertext", "iv", "keyDerivation", "schema"],
    "Ravioli sealed reveal envelope",
  );
  if (
    envelope.schema !== SEALED_REVEAL_SCHEMA
    || envelope.cipher !== SEALED_REVEAL_CIPHER
    || envelope.keyDerivation !== SEALED_REVEAL_KDF
  ) {
    throw new Error("Ravioli sealed reveal encryption policy drift");
  }
  const iv = projectedString(envelope.iv, "Ravioli sealed reveal IV");
  const ciphertext = projectedString(
    envelope.ciphertext,
    "Ravioli sealed reveal ciphertext",
  );
  if (
    !/^[A-Za-z0-9+/]{16}={0,2}$/.test(iv)
    || Buffer.from(iv, "base64").byteLength !== 12
  ) {
    throw new Error("Ravioli sealed reveal IV must be canonical 12-byte base64");
  }
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)
    || Buffer.from(ciphertext, "base64").byteLength < 17
  ) {
    throw new Error("Ravioli sealed reveal ciphertext is malformed");
  }
  const aad = jsonRecord(envelope.aad, "Ravioli sealed reveal AAD");
  requireExactKeys(
    aad,
    ["contract", "manifestUri", "network", "schema", "tokenId"],
    "Ravioli sealed reveal AAD",
  );
  if (aad.schema !== SEALED_REVEAL_SCHEMA || aad.network !== "shadownet") {
    throw new Error("Ravioli sealed reveal AAD identity drift");
  }
  const contract = projectedKt1(aad.contract, "Ravioli sealed reveal AAD contract");
  if (expectedRouterAddress && contract !== expectedRouterAddress) {
    throw new Error("Ravioli sealed reveal AAD router drift");
  }
  const tokenId = projectedInteger(aad.tokenId, "Ravioli sealed reveal AAD token id");
  if (tokenId < 1 || tokenId > 5) {
    throw new Error("Ravioli sealed reveal AAD token is outside the blind product range");
  }
  return {
    schema: SEALED_REVEAL_SCHEMA,
    contract,
    tokenId,
    manifestUri: projectedIpfsUri(
      aad.manifestUri,
      "Ravioli sealed reveal AAD manifest URI",
    ),
  };
}

function assertRevealMatchesCommits(summary: PublicRevealSummary, commits: readonly TrackedRecipe[], requireComplete: boolean): void {
  if (commits.length > summary.recipes.length || (requireComplete && commits.length !== summary.recipes.length)) {
    throw new Error("Ravioli PUBLIC_REVEAL does not cover every applied recipe commitment");
  }
  for (let serial = 0; serial < commits.length; serial += 1) {
    if (!deterministicEqual(commits[serial], summary.recipes[serial])) {
      throw new Error(`Ravioli PUBLIC_REVEAL recipe ${serial} differs from its applied commitment`);
    }
  }
}

function normalizePublicRevealSummary(value: unknown): PublicRevealSummary {
  const summary = jsonRecord(projectDeterministic(value), "persisted Ravioli PUBLIC_REVEAL summary");
  requireExactKeys(summary, ["contract", "itemCount", "manifestUri", "maxSupply", "mode", "network", "recipes", "schema", "tokenId"], "persisted Ravioli PUBLIC_REVEAL summary");
  if (summary.schema !== PUBLIC_REVEAL_SCHEMA || summary.network !== "shadownet") throw new Error("persisted Ravioli PUBLIC_REVEAL summary identity drift");
  const tokenId = projectedInteger(summary.tokenId, "persisted Ravioli PUBLIC_REVEAL token id");
  const profile = packProfile(tokenId);
  const contract = projectedKt1(summary.contract, "persisted Ravioli PUBLIC_REVEAL router");
  const manifestUri = projectedIpfsUri(summary.manifestUri, "persisted Ravioli PUBLIC_REVEAL manifest URI");
  if (summary.mode !== profile.mode || summary.maxSupply !== profile.maxSupply || summary.itemCount !== profile.itemCount) {
    throw new Error("persisted Ravioli PUBLIC_REVEAL profile drift");
  }
  if (!Array.isArray(summary.recipes) || summary.recipes.length !== profile.maxSupply) throw new Error("persisted Ravioli PUBLIC_REVEAL recipe count drift");
  const recipes = summary.recipes.map((value, serial): TrackedRecipe => {
    const recipe = jsonRecord(value, `persisted Ravioli PUBLIC_REVEAL recipe ${serial}`);
    requireExactKeys(recipe, ["actions", "nonceCommitment", "serial", "tokenId"], `persisted Ravioli PUBLIC_REVEAL recipe ${serial}`);
    if (recipe.tokenId !== tokenId || recipe.serial !== serial) throw new Error("persisted Ravioli PUBLIC_REVEAL recipe identity drift");
    const nonceCommitment = requireHash(recipe.nonceCommitment, `persisted Ravioli PUBLIC_REVEAL recipe ${serial} commitment`);
    if (!Array.isArray(recipe.actions) || recipe.actions.length !== profile.itemCount) throw new Error("persisted Ravioli PUBLIC_REVEAL action count drift");
    const actions = recipe.actions.map((action, index) => normalizePublicAction(action, `persisted Ravioli PUBLIC_REVEAL recipe ${serial} action ${index}`));
    return { tokenId, serial, nonceCommitment, actions };
  });
  return {
    schema: PUBLIC_REVEAL_SCHEMA,
    network: "shadownet",
    contract,
    tokenId,
    mode: profile.mode,
    manifestUri,
    maxSupply: profile.maxSupply,
    itemCount: profile.itemCount,
    recipes,
  };
}

function containsExplicitNonceField(bytes: Uint8Array): boolean {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { return false; }
  const visit = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== "object") return false;
    if (Array.isArray(candidate)) return candidate.some(visit);
    return Object.entries(candidate as Record<string, unknown>).some(([key, child]) => (
      key === "nonce" && typeof child === "string" && /^[0-9a-f]{64}$/.test(child)
    ) || visit(child));
  };
  return visit(value);
}

function decodeContentsUri(value: JsonValue | undefined, label: string): string {
  const encoded = projectedString(value, label);
  if (encoded.startsWith("ipfs://")) return encoded;
  if (!/^(?:[0-9a-f]{2})+$/i.test(encoded)) throw new Error(`${label} must be UTF-8 hex`);
  const decoded = Buffer.from(encoded, "hex").toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(Buffer.from(encoded, "hex"))) throw new Error(`${label} is not canonical UTF-8`);
  return decoded;
}

function assertProjectedPayload(expected: RavioliUiLiveExpectedOperation, payload: JsonValue): void {
  if (!expected.entrypoint) return;
  if (expected.entrypoint === "update_operators") {
    if (!Array.isArray(payload)) throw new Error("update_operators payload must be an array");
    const tokens = payload.map((entry, index) => {
      const update = jsonRecord(entry, `update_operators[${index}]`);
      const add = jsonRecord(update.add_operator, `update_operators[${index}].add_operator`);
      return projectedInteger(add.token_id, "operator token id");
    });
    if (JSON.stringify(tokens) !== JSON.stringify(expected.tokenIds)) throw new Error("Ravioli operator token order drift");
    return;
  }
  if (expected.entrypoint === "create_pack") {
    const config = jsonRecord(jsonRecord(payload, "create_pack payload").config, "create_pack config");
    if (projectedInteger(config.mode, "pack mode") !== expected.packMode) throw new Error("Ravioli create_pack mode drift");
    if (projectedInteger(config.max_supply, "pack max supply") !== expected.maxSupply) throw new Error("Ravioli create_pack supply drift");
    if (config.open_deadline === undefined || config.reveal_commitment === undefined) {
      throw new Error("Ravioli create_pack must bind the v3 open deadline and reveal commitment fields");
    }
    return;
  }
  if (expected.entrypoint === "commit_recipe") {
    const record = jsonRecord(payload, "commit_recipe payload");
    if (projectedInteger(record.token_id, "commit token id") !== expected.tokenId) throw new Error("Ravioli commit token drift");
    if (JSON.stringify(primitiveKinds(record.reservations, "commit reservations")) !== JSON.stringify(expected.primitiveKinds)) {
      throw new Error("Ravioli commit primitive order drift");
    }
    return;
  }
  if (expected.entrypoint === "finalize_pack") {
    if (projectedInteger(payload, "finalize token id") !== expected.tokenId) throw new Error("Ravioli finalize token drift");
    return;
  }
  if (["mint", "set_sale", "finalize_blind_pack", "set_pack_contents", "buy", "open_pack", "refund_blind_claims"].includes(expected.entrypoint)) {
    const record = jsonRecord(payload, `${expected.entrypoint} payload`);
    if (projectedInteger(record.token_id, `${expected.entrypoint} token id`) !== expected.tokenId) {
      throw new Error(`Ravioli ${expected.entrypoint} token drift`);
    }
    if (expected.entrypoint === "mint" && projectedInteger(record.amount, "mint amount") !== expected.maxSupply) {
      throw new Error("Ravioli mint amount drift");
    }
    if (expected.entrypoint === "set_sale") {
      const sale = jsonRecord(record.sale, "sale payload");
      if (projectedInteger(sale.remaining, "sale remaining") !== expected.maxSupply) throw new Error("Ravioli sale supply drift");
    }
    if (expected.entrypoint === "finalize_blind_pack") {
      const sale = jsonRecord(record.sale, "atomic blind sale payload");
      if (sale.active !== true || projectedInteger(sale.remaining, "atomic blind sale remaining") !== expected.maxSupply) {
        throw new Error("Ravioli atomic blind sale supply drift");
      }
      if (typeof sale.end !== "string" || !Number.isFinite(Date.parse(sale.end))) {
        throw new Error("Ravioli atomic blind sale requires a finite end");
      }
    }
    if (expected.entrypoint === "buy" && projectedInteger(record.amount, "buy amount") !== 1) {
      throw new Error("Ravioli buy amount drift");
    }
    if (expected.entrypoint === "open_pack") {
      if (JSON.stringify(primitiveKinds(record.actions, "open actions")) !== JSON.stringify(expected.primitiveKinds)) {
        throw new Error("Ravioli open primitive order drift");
      }
      const nonce = record.nonce;
      const raw = typeof nonce === "string" && /^[0-9a-f]{64}$/.test(nonce);
      const commitment = nonce && typeof nonce === "object" && !Array.isArray(nonce)
        ? nonce as JsonObject
        : null;
      if (!raw && !(commitment?.algorithm === "blake2b-256" && commitment.redacted === true && typeof commitment.commitment === "string" && HASH_RE.test(commitment.commitment))) {
        throw new Error("Ravioli open nonce is neither raw input nor a persisted commitment");
      }
    }
    if (expected.entrypoint === "refund_blind_claims") {
      if (
        projectedInteger(record.amount, "refund amount") !== 1
        || projectedInteger(record.expected_claim_id, "refund expected claim") < 0
        || typeof record.holder !== "string"
        || !ADDRESS_RE.test(record.holder)
      ) {
        throw new Error("Ravioli permissionless refund payload drift");
      }
    }
    return;
  }
  if (expected.entrypoint === "cancel_unrevealed_pack") {
    if (projectedInteger(payload, "cancel unrevealed token id") !== expected.tokenId) {
      throw new Error("Ravioli cancel_unrevealed_pack token drift");
    }
    return;
  }
  if (expected.entrypoint === "transfer") {
    if (!Array.isArray(payload) || payload.length !== 1) throw new Error("Ravioli transfer payload must contain one source");
    const source = jsonRecord(payload[0], "Ravioli transfer source");
    if (typeof source.from_ !== "string" || !ADDRESS_RE.test(source.from_) || !Array.isArray(source.txs) || source.txs.length !== 1) {
      throw new Error("Ravioli transfer source drift");
    }
    const transfer = jsonRecord(source.txs[0], "Ravioli transfer");
    if (
      projectedInteger(transfer.token_id, "Ravioli transfer token id") !== expected.tokenId
      || projectedInteger(transfer.amount, "Ravioli transfer amount") !== 1
      || typeof transfer.to_ !== "string"
      || !ADDRESS_RE.test(transfer.to_)
      || transfer.to_ === source.from_
    ) {
      throw new Error("Ravioli transfer payload drift");
    }
    return;
  }
  if (expected.entrypoint === "withdraw_refund") {
    const record = jsonRecord(payload, "withdraw_refund payload");
    if (
      typeof record.destination !== "string"
      || !ADDRESS_RE.test(record.destination)
      || projectedInteger(record.amount, "withdraw_refund amount") < 1
    ) {
      throw new Error("Ravioli refund withdrawal payload drift");
    }
    return;
  }
  if (expected.entrypoint === "recover_adapter") {
    const record = jsonRecord(payload, "recover_adapter payload");
    requireExactKeys(
      record,
      ["adapter", "capacity", "kind", "resource_id", "token_id"],
      "recover_adapter payload",
    );
    if (
      projectedInteger(record.token_id, "recover_adapter token id") !== expected.tokenId
      || projectedInteger(record.kind, "recover_adapter kind") !== expected.adapterKind
      || projectedInteger(record.resource_id, "recover_adapter resource id") !== expected.resourceId
      || projectedInteger(record.capacity, "recover_adapter capacity") !== expected.capacity
    ) {
      throw new Error("Ravioli recover_adapter payload drift");
    }
    projectedKt1(record.adapter, "recover_adapter adapter");
    return;
  }
  if (expected.entrypoint === "create_allocation") {
    const record = jsonRecord(payload, "allocation payload");
    if (projectedInteger(record.amount_per_open, "allocation amount") !== 1 || record.active !== true) {
      throw new Error("Ravioli allocation policy drift");
    }
    return;
  }
  if (expected.entrypoint === "create_resource") {
    if (jsonRecord(payload, "resource payload").active !== true) throw new Error("Ravioli resource must be active");
    return;
  }
  if (expected.entrypoint === "create_project") {
    const record = jsonRecord(payload, "Rotini project payload");
    if (
      record.active !== true
      || projectedInteger(record.max_supply, "Rotini project supply") < 3
      || projectedInteger(record.price, "Rotini project price") !== 0
      || typeof record.treasury !== "string"
      || !ADDRESS_RE.test(record.treasury)
    ) {
      throw new Error("Ravioli fresh Rotini project policy drift");
    }
  }
}

function sanitizePreparedOperation(
  expected: RavioliUiLiveExpectedOperation,
  operation: PastaUiLivePreparedOperation | PastaUiLiveSubmittedOperation | JsonObject,
): { operation: JsonObject; descriptorSha256: string; rawNonce?: string } {
  const projected = expected.action === "originate"
    ? projectPreparedOriginationOperation(operation)
    : jsonRecord(projectDeterministic(operation), "prepared operation");
  if (projected.action === "batch") throw new Error("Ravioli journal rejects batch signer operations");
  if (projected.action !== expected.action) throw new Error("Ravioli journal action order drift");
  if (projected.operationSequence !== expected.operationSequence) throw new Error("Ravioli journal operation sequence drift");
  if (projected.status !== "PREPARED" && projected.status !== "SUBMITTED") throw new Error("Ravioli journal operation phase is invalid");
  const descriptor = jsonRecord(projected.descriptor, "operation descriptor");
  let rawNonce: string | undefined;
  if (expected.action === "originate") {
    if (descriptor.kind !== "originate" || projected.entrypoints && JSON.stringify(projected.entrypoints) !== "[]") {
      throw new Error("Ravioli origination descriptor drift");
    }
  } else {
    if (descriptor.kind !== "call") throw new Error("Ravioli call descriptor drift");
    const call = jsonRecord(descriptor.call, "call descriptor");
    if (call.entrypoint !== expected.entrypoint) throw new Error("Ravioli entrypoint order drift");
    if (JSON.stringify(projected.entrypoints) !== JSON.stringify([expected.entrypoint])) throw new Error("Ravioli entrypoint summary drift");
    assertProjectedPayload(expected, call.payload);
    if (expected.entrypoint === "open_pack") {
      const payload = jsonRecord(call.payload, "open_pack payload");
      if (typeof payload.nonce === "string") {
        rawNonce = payload.nonce;
        payload.nonce = {
          algorithm: "blake2b-256",
          commitment: ravioliUiLiveNonceCommitment(rawNonce),
          redacted: true,
        };
      }
    }
  }
  const descriptorSha256 = ravioliUiLiveDescriptorSha256(descriptor as unknown as PastaUiLiveOperationDescriptor);
  const bytes = deterministicJsonBytes(projected);
  if (bytes.byteLength > MAX_RECORD_BYTES) throw new Error("Ravioli journal operation record is too large");
  if (rawNonce && Buffer.from(bytes).includes(Buffer.from(rawNonce, "utf8"))) throw new Error("raw Ravioli nonce survived journal redaction");
  return { operation: projected, descriptorSha256, ...(rawNonce ? { rawNonce } : {}) };
}

function validateHashRecord(value: unknown, label: string, required: readonly string[] = []): Record<string, string> {
  const projected = jsonRecord(projectDeterministic(value), label);
  const output: Record<string, string> = {};
  for (const [key, digest] of Object.entries(projected)) {
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(key)) throw new Error(`${label} key is invalid`);
    output[key] = requireHash(digest, `${label}.${key}`);
  }
  if (!Object.keys(output).length) throw new Error(`${label} cannot be empty`);
  for (const key of required) if (!output[key]) throw new Error(`${label} is missing ${key}`);
  return output;
}

function validateActorIntents(value: unknown): Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent> {
  const actors = requireRecord(value, "journal actors");
  if (JSON.stringify(Object.keys(actors).sort()) !== JSON.stringify([...ACTORS].sort())) throw new Error("journal actors must be creator, collector1, and collector2");
  const output = {} as Record<RavioliUiLiveJournalActor, RavioliUiLiveActorIntent>;
  const signers = new Set<string>();
  for (const actor of ACTORS) {
    const input = requireRecord(actors[actor], `${actor} intent`);
    if (typeof input.signerAddress !== "string" || !ADDRESS_RE.test(input.signerAddress)) throw new Error(`${actor} signer address is invalid`);
    if (signers.has(input.signerAddress)) throw new Error("Ravioli journal actors must use distinct signers");
    signers.add(input.signerAddress);
    const counters = requireRecord(input.counters, `${actor} counters`);
    const primary = requireRecord(counters.primary, `${actor} primary counter`);
    const fallback = requireRecord(counters.fallback, `${actor} fallback counter`);
    const primaryUrl = normalizedRpcUrl(primary.rpcUrl, `${actor} primary RPC`);
    const fallbackUrl = normalizedRpcUrl(fallback.rpcUrl, `${actor} fallback RPC`);
    if (primaryUrl === fallbackUrl) throw new Error(`${actor} dual-RPC counters require distinct endpoints`);
    const primaryCounter = requireInteger(primary.counter, `${actor} primary counter`);
    const fallbackCounter = requireInteger(fallback.counter, `${actor} fallback counter`);
    if (primaryCounter !== fallbackCounter) throw new Error(`${actor} dual-RPC counters disagree`);
    output[actor] = {
      signerAddress: input.signerAddress,
      counters: {
        primary: { rpcUrl: primaryUrl, counter: primaryCounter },
        fallback: { rpcUrl: fallbackUrl, counter: fallbackCounter },
      },
    };
  }
  return output;
}

function validateDependencyAddresses(value: unknown): { gnocchi: string; rotini: string } {
  const addresses = requireRecord(value, "dependency addresses");
  if (JSON.stringify(Object.keys(addresses).sort()) !== JSON.stringify(["gnocchi", "rotini"])) {
    throw new Error("Ravioli journal dependency addresses must contain exactly gnocchi and rotini");
  }
  const gnocchi = addresses.gnocchi;
  const rotini = addresses.rotini;
  if (typeof gnocchi !== "string" || !ADDRESS_RE.test(gnocchi) || !gnocchi.startsWith("KT1")) throw new Error("Ravioli journal Gnocchi address is invalid");
  if (typeof rotini !== "string" || !ADDRESS_RE.test(rotini) || !rotini.startsWith("KT1")) throw new Error("Ravioli journal Rotini address is invalid");
  if (gnocchi === rotini) throw new Error("Ravioli journal dependency contracts must be distinct");
  return { gnocchi, rotini };
}

function intentCore(
  input: CreateRavioliUiLiveJournalInput,
  matrix: readonly RavioliUiLiveExpectedOperation[] =
    RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX,
): Omit<JournalIntent, "journalId"> {
  const chainId = input.chainId ?? SHADOWNET_CHAIN_ID;
  if (chainId !== SHADOWNET_CHAIN_ID) throw new Error("Ravioli UI-live journal is Shadownet-only");
  const isLegacyBase = deterministicEqual(
    matrix,
    RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  );
  const isEffective = deterministicEqual(
    matrix,
    RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX,
  );
  if (!isLegacyBase && !isEffective) {
    throw new Error("Ravioli journal intent matrix is unsupported");
  }
  const matrixSha256 = sha256(deterministicJsonBytes(matrix));
  return {
    schema: isLegacyBase
      ? RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA
      : RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA,
    status: "IMMUTABLE",
    createdAt: requireIso(input.createdAt ?? new Date().toISOString(), "journal creation time"),
    network: { name: "shadownet", chainId },
    actors: validateActorIntents(input.actors),
    dependencyAddresses: validateDependencyAddresses(input.dependencyAddresses),
    dependencyHashes: validateHashRecord(input.dependencyHashes, "dependency hashes"),
    artifactHashes: validateHashRecord(input.artifactHashes, "artifact hashes", REQUIRED_ARTIFACT_HASHES),
    matrixSha256,
    matrix,
  };
}

function validateIntent(value: unknown): JournalIntent {
  const intent = requireRecord(value, "journal intent") as unknown as JournalIntent;
  if (
    ![
      RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
      RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA,
    ].includes(intent.schema)
    || intent.status !== "IMMUTABLE"
  ) throw new Error("Ravioli journal intent schema/status drift");
  const matrix = intent.schema === RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA
    ? RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX
    : RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX;
  const core = intentCore({
    journalRoot: ".",
    createdAt: intent.createdAt,
    chainId: intent.network?.chainId,
    actors: intent.actors,
    dependencyAddresses: intent.dependencyAddresses,
    dependencyHashes: intent.dependencyHashes,
    artifactHashes: intent.artifactHashes,
  }, matrix);
  if (!deterministicEqual(intent.matrix, matrix)) throw new Error("Ravioli journal fixed matrix drift");
  if (intent.matrixSha256 !== core.matrixSha256) throw new Error("Ravioli journal matrix hash drift");
  const expectedId = sha256(deterministicJsonBytes(core));
  if (intent.journalId !== expectedId) throw new Error("Ravioli journal id drift");
  return { ...core, journalId: expectedId };
}

async function durableExclusiveWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }

  // POSIX requires syncing the containing directory to make the new directory
  // entry durable. Node cannot portably open directory handles on Windows, so
  // Windows retains the strongest primitive Node exposes here: file fsync.
  if (process.platform !== "win32") {
    const directoryHandle = await open(path.dirname(filePath), "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}

async function durableCreateJournalDirectories(journalRoot: string): Promise<void> {
  // The proof root's parent already belongs to the accepted run. Creating the
  // journal itself non-recursively is deliberate: an existing lane must fail
  // closed instead of being silently reused. On POSIX, sync every directory
  // whose child entry changed so a power loss cannot preserve intent.json
  // while losing one of its ancestor entries.
  await mkdir(journalRoot);
  if (process.platform !== "win32") {
    const parentHandle = await open(path.dirname(journalRoot), "r");
    try {
      await parentHandle.sync();
    } finally {
      await parentHandle.close();
    }
  }

  await mkdir(path.join(journalRoot, "events"));
  await mkdir(path.join(journalRoot, "pins"));
  if (process.platform !== "win32") {
    const rootHandle = await open(journalRoot, "r");
    try {
      await rootHandle.sync();
    } finally {
      await rootHandle.close();
    }
  }
}

async function canonicalJsonFile(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; sha256: string }> {
  const bytes = await readFile(filePath);
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`journal JSON is invalid: ${filePath}`); }
  const canonical = deterministicJsonBytes(value);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) throw new Error(`journal JSON is not canonical: ${filePath}`);
  return { value: projectJournalJson(value), bytes, sha256: sha256(bytes) };
}

async function artifactInventory(root: string): Promise<RavioliUiLiveJournalArtifact[]> {
  const output: RavioliUiLiveJournalArtifact[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`journal contains a symbolic link: ${absolute}`);
      if (info.isDirectory()) await walk(absolute);
      else if (info.isFile()) {
        const bytes = await readFile(absolute);
        output.push({ path: path.relative(root, absolute).split(path.sep).join("/"), sha256: sha256(bytes), byteLength: bytes.byteLength });
      } else throw new Error(`journal contains a non-file artifact: ${absolute}`);
    }
  };
  await walk(root);
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function expectedCounts(matrix = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX) {
  return {
    actors: {
      creator: matrix.filter((operation) => operation.actor === "creator").length,
      collector1: matrix.filter((operation) => operation.actor === "collector1").length,
      collector2: matrix.filter((operation) => operation.actor === "collector2").length,
    },
    originations: matrix.filter((operation) => operation.action === "originate").length,
    calls: matrix.filter((operation) => operation.action === "call").length,
    buys: matrix.filter((operation) => operation.entrypoint === "buy").length,
    opens: matrix.filter((operation) => operation.entrypoint === "open_pack").length,
    transfers: matrix.filter((operation) => operation.entrypoint === "transfer").length,
    refunds: matrix.filter((operation) => operation.entrypoint === "refund_blind_claims").length,
    total: matrix.length,
  };
}

function postEvent86PlanExtensionPayload(intent: JournalIntent): JsonObject {
  const extension = jsonRecord(projectJournalJson({
    schema: RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.schema,
    extensionId: RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.extensionId,
    baseIntentSha256: sha256(deterministicJsonBytes(intent)),
    baseMatrixSha256: intent.matrixSha256,
    baseOperationCount:
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.baseOperationCount,
    semanticBoundary:
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.semanticBoundary,
    operations: RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.operations,
  }), "Ravioli plan extension");
  return jsonRecord(projectJournalJson({
    extension,
    extensionSha256: sha256(deterministicJsonBytes(extension)),
    effectiveMatrixSha256: sha256(
      deterministicJsonBytes(RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX),
    ),
    effectiveOperationCount: RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX.length,
  }), "Ravioli plan extension payload");
}

export class RavioliUiLiveJournal {
  private eventIndex = 0;
  private pinSequence = 0;
  private completedOperations = 0;
  private readonly actorAppliedCounts: Record<RavioliUiLiveJournalActor, number> = { creator: 0, collector1: 0, collector2: 0 };
  private readonly operationHashes = new Set<string>();
  private readonly externalOperationHashes = new Set<string>();
  private readonly counterOffsets: Record<RavioliUiLiveJournalActor, number> = {
    creator: 0,
    collector1: 0,
    collector2: 0,
  };
  private readonly targetBindings = new Map<RavioliUiLiveJournalTargetRole, string>();
  private readonly rawNonces = new Set<string>();
  private readonly committedRecipes = new Map<number, TrackedRecipe[]>();
  private readonly blindRevealCommitments = new Map<
    number,
    { commitment: string; manifestUri: string }
  >();
  private readonly publicReveals = new Map<number, PublicRevealSummary>();
  private readonly publicRevealPins = new Map<string, PublicRevealSummary>();
  private readonly sealedReveals = new Map<number, SealedRevealBinding>();
  private readonly sealedRevealPins = new Map<string, SealedRevealBinding>();
  private readonly pinCheckpoints = new Map<string, PinCheckpoint>();
  private pendingPublicRevealPreparation: PendingPublicRevealPreparation | null = null;
  private pendingPublicRevealBinding: PendingPublicRevealBinding | null = null;
  private pending: PendingOperation | null = null;
  private counterAdvanceRecorded = false;
  private planExtensionActive = false;
  private planExtensionRecordSha256 = "";
  private readonly nativeEffectivePlan: boolean;
  private chainHeadSha256: string;
  private finalized = false;
  private finalSha256 = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly journalRoot: string,
    readonly intent: JournalIntent,
    readonly intentSha256: string,
  ) {
    this.chainHeadSha256 = intentSha256;
    this.nativeEffectivePlan =
      intent.schema === RAVIOLI_UI_LIVE_JOURNAL_EFFECTIVE_INTENT_SCHEMA;
    this.targetBindings.set("gnocchi", intent.dependencyAddresses.gnocchi);
    this.targetBindings.set("rotini", intent.dependencyAddresses.rotini);
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private ensureWritable(): void {
    if (this.finalized) throw new Error("Ravioli journal is already finalized");
  }

  private expectedNext(): RavioliUiLiveExpectedOperation {
    const expected = this.effectiveOperationMatrix()[this.completedOperations];
    if (!expected) throw new Error("Ravioli journal has no remaining signer operations");
    return expected;
  }

  private effectiveOperationMatrix(): readonly RavioliUiLiveExpectedOperation[] {
    return this.nativeEffectivePlan || this.planExtensionActive
      ? RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX
      : RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX;
  }

  private assertActorOperation(actor: RavioliUiLiveJournalActor, operation: { operationSequence: number; signerAddress: string; chainId: string }): RavioliUiLiveExpectedOperation {
    const expected = this.expectedNext();
    if (expected.actor !== actor) throw new Error(`Ravioli journal expected ${expected.actor} at global operation ${expected.globalOrdinal}`);
    if (operation.operationSequence !== expected.operationSequence) throw new Error(`Ravioli journal expected ${actor} operation sequence ${expected.operationSequence}`);
    if (operation.signerAddress !== this.intent.actors[actor].signerAddress) throw new Error(`Ravioli journal ${actor} signer drift`);
    if (operation.chainId !== this.intent.network.chainId) throw new Error("Ravioli journal chain id drift");
    return expected;
  }

  private bindTarget(role: RavioliUiLiveJournalTargetRole, address: unknown): void {
    if (typeof address !== "string" || !ADDRESS_RE.test(address) || !address.startsWith("KT1")) throw new Error(`Ravioli ${role} target address is invalid`);
    const existing = this.targetBindings.get(role);
    if (existing && existing !== address) throw new Error(`Ravioli ${role} target binding drift`);
    this.targetBindings.set(role, address);
  }

  private targetAddress(expected: RavioliUiLiveExpectedOperation): string {
    const target = this.targetBindings.get(expected.targetRole);
    if (!target) throw new Error(`Ravioli ${expected.targetRole} target is not bound before APPLIED evidence`);
    return target;
  }

  private assertBoundPayloadReferences(
    expected: RavioliUiLiveExpectedOperation,
    operation: JsonObject,
  ): void {
    if (!expected.adapterRole) return;
    const adapter = this.targetBindings.get(expected.adapterRole);
    if (!adapter) {
      throw new Error(
        `Ravioli ${expected.entrypoint} requires its ${expected.adapterRole} binding`,
      );
    }
    const descriptor = jsonRecord(
      operation.descriptor,
      "Ravioli bound payload descriptor",
    );
    const call = jsonRecord(
      descriptor.call,
      "Ravioli bound payload call",
    );
    const payload = jsonRecord(
      call.payload,
      "Ravioli bound payload",
    );
    if (payload.adapter !== adapter) {
      throw new Error(
        `Ravioli ${expected.entrypoint} adapter differs from its authenticated ${expected.adapterRole}`,
      );
    }
  }

  private assertOriginationDependencyBinding(
    expected: RavioliUiLiveExpectedOperation,
    operation: JsonObject,
  ): void {
    if (expected.originRole !== "router") return;
    const controller = this.targetBindings.get("blindController");
    if (!controller) {
      throw new Error("Ravioli router origination requires an APPLIED controller binding");
    }
    const descriptor = jsonRecord(operation.descriptor, "Ravioli router origination descriptor");
    const storage = jsonRecord(
      descriptor.storage,
      "Ravioli router origination storage",
    );
    if (storage.blind_controller !== controller) {
      throw new Error("Ravioli router origination is not immutably bound to the confirmed controller");
    }
    if ("opened_by" in storage) {
      throw new Error("Ravioli router origination storage contains superseded opened_by state");
    }
  }

  private recipesFor(tokenId: number): TrackedRecipe[] {
    const existing = this.committedRecipes.get(tokenId);
    if (existing) return existing;
    const created: TrackedRecipe[] = [];
    this.committedRecipes.set(tokenId, created);
    return created;
  }

  private expectedRevealBinding(summary: PublicRevealSummary): PendingPublicRevealBinding["entrypoint"] {
    const expected = this.expectedNext();
    const entrypoint = summary.tokenId === 0 ? "create_pack" : "set_pack_contents";
    if (expected.actor !== "creator" || expected.targetRole !== "router" || expected.entrypoint !== entrypoint || expected.tokenId !== summary.tokenId) {
      throw new Error(`Ravioli PUBLIC_REVEAL for token ${summary.tokenId} is not immediately before ${entrypoint}`);
    }
    return entrypoint;
  }

  private assertRevealAtCurrentState(summary: PublicRevealSummary): "create_pack" | "set_pack_contents" {
    const router = this.targetBindings.get("router");
    if (!router || summary.contract !== router) throw new Error("Ravioli PUBLIC_REVEAL router is not the originated journal router");
    if (summary.tokenId !== 0) {
      throw new Error(
        "blind Ravioli products forbid plaintext PUBLIC_REVEAL pins; reuse the authenticated pre-sale sealed envelope",
      );
    }
    const entrypoint = this.expectedRevealBinding(summary);
    assertRevealMatchesCommits(summary, this.recipesFor(summary.tokenId), entrypoint === "set_pack_contents");
    if (this.publicReveals.has(summary.tokenId)) throw new Error(`Ravioli PUBLIC_REVEAL token ${summary.tokenId} was already disclosed`);
    return entrypoint;
  }

  private assertSealedRevealAtCurrentState(tokenId: number): void {
    if (tokenId === 0) {
      throw new Error(
        "deterministic Ravioli token 0 must use its plaintext PUBLIC_REVEAL, not a sealed envelope",
      );
    }
    const expected = this.expectedNext();
    if (
      expected.actor !== "creator"
      || expected.targetRole !== "router"
      || expected.entrypoint !== "create_pack"
      || expected.tokenId !== tokenId
      || expected.packMode === 0
    ) {
      throw new Error(
        `Ravioli sealed reveal token ${tokenId} must be pinned immediately before its blind create_pack and before sale`,
      );
    }
    if (
      this.blindRevealCommitments.has(tokenId)
      || this.committedRecipes.has(tokenId)
    ) {
      throw new Error(
        `Ravioli sealed reveal token ${tokenId} was not bound before its first on-chain commitment`,
      );
    }
  }

  private bindPendingPublicReveal(operation: JsonObject, expected: RavioliUiLiveExpectedOperation): string | undefined {
    if (expected.entrypoint === "set_pack_contents") {
      if (this.pendingPublicRevealBinding) {
        throw new Error(
          "blind Ravioli set_pack_contents must reuse its pre-sale sealed reveal, not pin plaintext",
        );
      }
      const sealed = this.sealedReveals.get(expected.tokenId!);
      if (!sealed) {
        throw new Error(
          `Ravioli set_pack_contents token ${expected.tokenId} requires its earlier sealed reveal pin`,
        );
      }
      const descriptor = jsonRecord(
        operation.descriptor,
        "sealed reveal binding descriptor",
      );
      const call = jsonRecord(descriptor.call, "sealed reveal binding call");
      const payload = jsonRecord(call.payload, "sealed reveal binding payload");
      const contentsUri = decodeContentsUri(
        payload.contents_uri,
        "Ravioli sealed reveal contents URI",
      );
      if (contentsUri !== sealed.uri) {
        throw new Error(
          "Ravioli blind reveal URI differs from its pre-sale sealed envelope",
        );
      }
      const committed = this.blindRevealCommitments.get(expected.tokenId!);
      if (!committed || committed.manifestUri !== sealed.manifestUri) {
        throw new Error(
          "Ravioli sealed reveal AAD differs from the immutable pack manifest",
        );
      }
      const salt = projectedString(
        payload.salt,
        "Ravioli sealed reveal salt",
      ).toLowerCase();
      const offset = projectedInteger(
        payload.offset,
        "Ravioli sealed reveal offset",
      );
      if (
        revealCommitment(contentsUri, salt, offset)
          !== committed.commitment
      ) {
        throw new Error(
          "Ravioli sealed reveal does not satisfy the immutable reveal commitment",
        );
      }
      return sealed.pinSha256;
    }
    const binding = this.pendingPublicRevealBinding;
    const requiresPublicReveal =
      expected.entrypoint === "create_pack" && expected.tokenId === 0;
    if (!binding) {
      if (requiresPublicReveal) throw new Error(`Ravioli ${expected.entrypoint} requires an immediately preceding PUBLIC_REVEAL pin`);
      return undefined;
    }
    if (expected.actor !== "creator" || expected.targetRole !== "router" || expected.entrypoint !== binding.entrypoint || expected.tokenId !== binding.tokenId) {
      throw new Error(`Ravioli PUBLIC_REVEAL must bind to the immediate ${binding.entrypoint}`);
    }
    const descriptor = jsonRecord(operation.descriptor, "public reveal binding descriptor");
    const call = jsonRecord(descriptor.call, "public reveal binding call");
    const payload = jsonRecord(call.payload, "public reveal binding payload");
    const encodedUri = binding.entrypoint === "create_pack"
      ? jsonRecord(payload.config, "public reveal create_pack config").contents_uri
      : payload.contents_uri;
    if (decodeContentsUri(encodedUri, "Ravioli PUBLIC_REVEAL contents URI") !== binding.uri) {
      throw new Error(`Ravioli PUBLIC_REVEAL URI is not bound to the immediate ${binding.entrypoint}`);
    }
    return binding.pinSha256;
  }

  private prepareCommittedRecipe(expected: RavioliUiLiveExpectedOperation, operation: JsonObject): TrackedRecipe | undefined {
    if (expected.entrypoint !== "commit_recipe") return undefined;
    const recipes = this.recipesFor(expected.tokenId!);
    const recipe = committedRecipeFromOperation(expected, operation, recipes.length);
    const reveal = this.publicReveals.get(expected.tokenId!);
    if (reveal && !deterministicEqual(recipe, reveal.recipes[recipe.serial])) {
      throw new Error(`Ravioli commit_recipe ${recipe.serial} differs from its PUBLIC_REVEAL`);
    }
    return recipe;
  }

  private prepareBlindRevealCommitment(
    expected: RavioliUiLiveExpectedOperation,
    operation: JsonObject,
  ): PendingOperation["blindRevealCommitment"] {
    if (
      expected.entrypoint !== "create_pack"
      || expected.packMode === 0
      || expected.tokenId === undefined
    ) {
      return undefined;
    }
    const descriptor = jsonRecord(
      operation.descriptor,
      "blind create_pack descriptor",
    );
    const call = jsonRecord(descriptor.call, "blind create_pack call");
    const payload = jsonRecord(call.payload, "blind create_pack payload");
    const config = jsonRecord(payload.config, "blind create_pack config");
    return {
      tokenId: expected.tokenId,
      commitment: requireHash(
        config.reveal_commitment,
        "blind create_pack reveal commitment",
      ),
      manifestUri: decodeContentsUri(
        config.manifest_uri,
        "blind create_pack manifest URI",
      ),
    };
  }

  private completeAppliedSemantics(pending: PendingOperation): void {
    if (pending.commitRecipe) {
      const recipes = this.recipesFor(pending.commitRecipe.tokenId);
      if (pending.commitRecipe.serial !== recipes.length) throw new Error("Ravioli applied recipe serial drift");
      recipes.push(pending.commitRecipe);
    }
    if (pending.blindRevealCommitment) {
      const { tokenId, commitment, manifestUri } =
        pending.blindRevealCommitment;
      if (this.blindRevealCommitments.has(tokenId)) {
        throw new Error("Ravioli blind reveal commitment was already applied");
      }
      this.blindRevealCommitments.set(tokenId, {
        commitment,
        manifestUri,
      });
    }
    if (pending.publicRevealBindingSha256) {
      if (pending.expected.entrypoint === "set_pack_contents") {
        const sealed = this.sealedReveals.get(pending.expected.tokenId!);
        if (!sealed || sealed.pinSha256 !== pending.publicRevealBindingSha256) {
          throw new Error("Ravioli applied sealed-reveal binding drift");
        }
      } else {
        if (!this.pendingPublicRevealBinding || this.pendingPublicRevealBinding.pinSha256 !== pending.publicRevealBindingSha256) {
          throw new Error("Ravioli applied PUBLIC_REVEAL binding drift");
        }
        this.pendingPublicRevealBinding = null;
      }
    }
  }

  private validateAppliedEvidence(
    actor: RavioliUiLiveJournalActor,
    pending: PendingOperation,
    value: unknown,
  ): JsonObject {
    const evidence = jsonRecord(projectDeterministic(value), "Ravioli APPLIED evidence");
    if (JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(APPLIED_EVIDENCE_KEYS)) {
      throw new Error("Ravioli APPLIED evidence fields drift");
    }
    if (evidence.status !== "applied") throw new Error("Ravioli APPLIED evidence status drift");
    if (evidence.operationHash !== pending.operationHash) throw new Error("Ravioli APPLIED evidence operation hash drift");
    if (evidence.signerAddress !== this.intent.actors[actor].signerAddress) throw new Error("Ravioli APPLIED evidence signer drift");
    const expectedCounter = this.intent.actors[actor].counters.primary.counter
      + pending.expected.operationSequence
      + this.counterOffsets[actor];
    if (requireInteger(evidence.counter, "Ravioli APPLIED evidence counter", 1) !== expectedCounter) {
      throw new Error("Ravioli APPLIED evidence counter drift from immutable intent");
    }
    requireInteger(evidence.level, "Ravioli APPLIED evidence level", 1);
    requireIso(evidence.timestamp, "Ravioli APPLIED evidence timestamp");
    const expectedTarget = this.targetAddress(pending.expected);
    if (evidence.contractAddress !== expectedTarget) throw new Error("Ravioli APPLIED evidence target address drift");
    const expectedEntrypoints = pending.expected.entrypoint ? [pending.expected.entrypoint] : [];
    if (!Array.isArray(evidence.entrypoints) || !evidence.entrypoints.every((entry) => typeof entry === "string")) {
      throw new Error("Ravioli APPLIED evidence entrypoints must be strings");
    }
    if (JSON.stringify(evidence.entrypoints) !== JSON.stringify(expectedEntrypoints)) {
      throw new Error("Ravioli APPLIED evidence entrypoint drift");
    }
    if (evidence.explorerUrl !== `https://shadownet.tzkt.io/${pending.operationHash}`) {
      throw new Error("Ravioli APPLIED evidence explorer URL drift");
    }
    return evidence;
  }

  private normalizeCounterAdvance(input: RavioliUiLiveCounterAdvanceInput): JsonObject {
    if (this.counterAdvanceRecorded) throw new Error("Ravioli journal already contains a counter advance");
    if (this.pending || this.pendingPublicRevealPreparation || this.pendingPublicRevealBinding) {
      throw new Error("Ravioli counter advance cannot overlap pending journal state");
    }
    const recoveryId = requireHash(input.recoveryId, "Ravioli counter advance recovery id");
    const semanticBoundary = requireInteger(
      input.semanticBoundary,
      "Ravioli counter advance semantic boundary",
      1,
    );
    if (semanticBoundary !== this.completedOperations) {
      throw new Error("Ravioli counter advance semantic boundary drift");
    }
    const next = this.expectedNext();
    const recoveryContractAddress = input.recoveryContractAddress;
    if (
      typeof recoveryContractAddress !== "string"
      || !ADDRESS_RE.test(recoveryContractAddress)
      || !recoveryContractAddress.startsWith("KT1")
    ) {
      throw new Error("Ravioli counter advance recovery contract is invalid");
    }
    if ([...this.targetBindings.values()].includes(recoveryContractAddress)) {
      throw new Error("Ravioli counter advance recovery contract overlaps the Ravioli proof");
    }
    if (!Array.isArray(input.advances) || input.advances.length < 1 || input.advances.length > ACTORS.length) {
      throw new Error("Ravioli counter advance actor set is invalid");
    }
    const seenActors = new Set<RavioliUiLiveJournalActor>();
    const seenHashes = new Set<string>();
    let sawRecoveryOrigination = false;
    const advances = input.advances.map((advance, advanceIndex) => {
      const actor = requireActor(advance.actor);
      if (seenActors.has(actor)) throw new Error("Ravioli counter advance repeats an actor");
      seenActors.add(actor);
      if (actor !== ACTORS.filter((candidate) => input.advances.some((entry) => entry.actor === candidate))[advanceIndex]) {
        throw new Error("Ravioli counter advance actors are not in canonical order");
      }
      if (!Array.isArray(advance.operations) || advance.operations.length < 1) {
        throw new Error("Ravioli counter advance must contain applied operations");
      }
      const firstExpectedCounter = this.intent.actors[actor].counters.primary.counter
        + this.actorAppliedCounts[actor]
        + this.counterOffsets[actor]
        + 1;
      const operations = advance.operations.map((operation, operationIndex) => {
        const projected = jsonRecord(
          projectDeterministic(operation),
          "Ravioli counter advance operation",
        );
        const requiredKeys = [...APPLIED_EVIDENCE_KEYS, "action"].sort();
        if (JSON.stringify(Object.keys(projected).sort()) !== JSON.stringify(requiredKeys)) {
          throw new Error("Ravioli counter advance operation fields drift");
        }
        if (projected.action !== "originate" && projected.action !== "call") {
          throw new Error("Ravioli counter advance action is invalid");
        }
        if (projected.status !== "applied") {
          throw new Error("Ravioli counter advance operation is not applied");
        }
        const operationHash = requireOperationHash(projected.operationHash);
        if (
          this.operationHashes.has(operationHash)
          || this.externalOperationHashes.has(operationHash)
          || seenHashes.has(operationHash)
        ) {
          throw new Error("Ravioli counter advance operation hash is not independent");
        }
        seenHashes.add(operationHash);
        if (projected.signerAddress !== this.intent.actors[actor].signerAddress) {
          throw new Error("Ravioli counter advance signer drift");
        }
        const counter = requireInteger(
          projected.counter,
          "Ravioli counter advance operation counter",
          1,
        );
        if (counter !== firstExpectedCounter + operationIndex) {
          throw new Error("Ravioli counter advance operations are not counter-contiguous");
        }
        requireInteger(projected.level, "Ravioli counter advance operation level", 1);
        requireIso(projected.timestamp, "Ravioli counter advance operation timestamp");
        if (projected.contractAddress !== recoveryContractAddress) {
          throw new Error("Ravioli counter advance operation escaped its recovery contract");
        }
        if (projected.action === "originate") {
          if (sawRecoveryOrigination || actor !== "creator" || operationIndex !== 0 || advanceIndex !== 0) {
            throw new Error("Ravioli counter advance has an unexpected origination");
          }
          if (!Array.isArray(projected.entrypoints) || projected.entrypoints.length !== 0) {
            throw new Error("Ravioli counter advance origination has entrypoints");
          }
          sawRecoveryOrigination = true;
        } else if (
          !Array.isArray(projected.entrypoints)
          || projected.entrypoints.length !== 1
          || typeof projected.entrypoints[0] !== "string"
          || !projected.entrypoints[0]
        ) {
          throw new Error("Ravioli counter advance call must have exactly one entrypoint");
        }
        if (projected.explorerUrl !== `https://shadownet.tzkt.io/${operationHash}`) {
          throw new Error("Ravioli counter advance explorer URL drift");
        }
        return projected;
      });
      return {
        actor,
        advanceBy: operations.length,
        operations,
      };
    });
    if (!sawRecoveryOrigination) {
      throw new Error("Ravioli counter advance lacks its independent recovery origination");
    }
    return jsonRecord(projectJournalJson({
      recoveryId,
      semanticBoundary,
      nextGlobalOrdinal: next.globalOrdinal,
      recoveryContractAddress,
      advances,
    }), "Ravioli counter advance");
  }

  private applyCounterAdvance(normalized: JsonObject): void {
    const advances = normalized.advances;
    if (!Array.isArray(advances)) throw new Error("Ravioli counter advance actors are invalid");
    for (const value of advances) {
      const advance = jsonRecord(value, "Ravioli counter advance actor");
      const actor = requireActor(advance.actor);
      const operations = advance.operations;
      if (!Array.isArray(operations)) throw new Error("Ravioli counter advance operations are invalid");
      this.counterOffsets[actor] += operations.length;
      for (const operationValue of operations) {
        const operation = jsonRecord(operationValue, "Ravioli counter advance applied operation");
        this.externalOperationHashes.add(requireOperationHash(operation.operationHash));
      }
    }
    this.counterAdvanceRecorded = true;
  }

  private applyPostEvent86PlanExtension(
    payload: JsonObject,
    recordSha256: string,
  ): void {
    if (this.planExtensionActive) {
      throw new Error("Ravioli plan extension was already activated");
    }
    const expected = postEvent86PlanExtensionPayload(this.intent);
    if (!deterministicEqual(payload, expected)) {
      throw new Error("Ravioli persisted plan extension drift");
    }
    if (
      this.completedOperations
        !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.semanticBoundary
      || !this.counterAdvanceRecorded
    ) {
      throw new Error("Ravioli plan extension is outside its authenticated semantic boundary");
    }
    this.planExtensionActive = true;
    this.planExtensionRecordSha256 = requireHash(
      recordSha256,
      "Ravioli plan extension record hash",
    );
  }

  private assertNoKnownRawNonce(bytes: Uint8Array): void {
    for (const nonce of this.rawNonces) {
      if (Buffer.from(bytes).includes(Buffer.from(nonce, "utf8"))) throw new Error("Ravioli journal refuses to persist a raw open_pack nonce");
    }
    const text = Buffer.from(bytes).toString("utf8");
    const commitments = new Set([
      ...[...this.committedRecipes.values()].flat().map((recipe) => recipe.nonceCommitment),
      ...[...this.publicReveals.values()].flatMap((reveal) => reveal.recipes.map((recipe) => recipe.nonceCommitment)),
      ...(this.pendingPublicRevealPreparation?.summary.recipes.map((recipe) => recipe.nonceCommitment) || []),
    ]);
    for (const candidate of text.match(/[0-9a-f]{64}/g) || []) {
      if (commitments.has(ravioliUiLiveNonceCommitment(candidate))) {
        throw new Error("Ravioli journal refuses an ordinary pin containing a committed recipe nonce");
      }
    }
    if (containsExplicitNonceField(bytes)) throw new Error("Ravioli journal refuses an ordinary nonce-bearing pin");
  }

  private async appendEvent(phase: string, actor: RavioliUiLiveJournalActor, timestampUtc: string, fields: Record<string, unknown>): Promise<{ record: JsonObject; sha256: string; path: string }> {
    const eventIndex = this.eventIndex + 1;
    const record = projectJournalJson({
      schema: RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA,
      journalId: this.intent.journalId,
      intentSha256: this.intentSha256,
      eventIndex,
      previousRecordSha256: this.chainHeadSha256,
      timestampUtc: requireIso(timestampUtc, `${phase} timestamp`),
      phase,
      actor,
      ...fields,
    });
    const bytes = deterministicJsonBytes(record);
    if (bytes.byteLength > MAX_RECORD_BYTES) throw new Error("Ravioli journal event exceeds its byte limit");
    this.assertNoKnownRawNonce(bytes);
    const relative = `events/${String(eventIndex).padStart(6, "0")}-${phase.toLowerCase()}-${actor}.json`;
    await durableExclusiveWrite(path.join(this.journalRoot, relative), bytes);
    const digest = sha256(bytes);
    this.eventIndex = eventIndex;
    this.chainHeadSha256 = digest;
    return { record, sha256: digest, path: relative };
  }

  callbacks(actor: RavioliUiLiveJournalActor): {
    beforeOperationSubmit(operation: PastaUiLivePreparedOperation): Promise<void>;
    onOperationSubmitted(operation: PastaUiLiveSubmittedOperation): Promise<void>;
  } {
    requireActor(actor);
    return {
      beforeOperationSubmit: (operation) => this.beforeOperationSubmit(actor, operation),
      onOperationSubmitted: (operation) => this.onOperationSubmitted(actor, operation),
    };
  }

  beforePin(input: RavioliUiLivePinPreflightInput): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      const actor = requireActor(input.actor);
      if (typeof input.fileName !== "string" || !SAFE_NAME_RE.test(input.fileName)) throw new Error("Ravioli journal pin file name is unsafe");
      if (typeof input.mimeType !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mimeType)) throw new Error("Ravioli journal pin MIME type is invalid");
      const bytes = Uint8Array.from(input.bytes);
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_PIN_BYTES) throw new Error("Ravioli journal pin byte length is invalid");
      let schema = "";
      if (input.mimeType === "application/json") {
        try { schema = String(JSON.parse(Buffer.from(bytes).toString("utf8"))?.schema || ""); } catch { /* ordinary malformed JSON reaches the pinner's own rejection */ }
      }
      const publicRevealCandidate = schema === PUBLIC_REVEAL_SCHEMA || /^ravioli-public-reveal-[0-9]+\.json$/.test(input.fileName);
      if (!publicRevealCandidate) {
        if (this.pendingPublicRevealPreparation) throw new Error("Ravioli PUBLIC_REVEAL pin must complete before another pin");
        const sealedRevealCandidate =
          schema === SEALED_REVEAL_SCHEMA
          || /^ravioli-sealed-reveal-[0-9]+\.json$/.test(input.fileName);
        if (sealedRevealCandidate) {
          if (actor !== "creator") {
            throw new Error("Ravioli sealed reveal must be pinned by the creator");
          }
          if (input.mimeType !== "application/json") {
            throw new Error("Ravioli sealed reveal must use application/json");
          }
          const router = this.targetBindings.get("router");
          if (!router) {
            throw new Error("Ravioli sealed reveal requires the originated router binding");
          }
          const sealed = sealedRevealFromExactBytes(bytes, router);
          if (input.fileName !== `ravioli-sealed-reveal-${sealed.tokenId}.json`) {
            throw new Error("Ravioli sealed reveal file name does not match its token");
          }
          if (this.sealedReveals.has(sealed.tokenId)) {
            throw new Error(`Ravioli sealed reveal token ${sealed.tokenId} was already pinned`);
          }
          this.assertSealedRevealAtCurrentState(sealed.tokenId);
        }
        this.assertNoKnownRawNonce(bytes);
        return;
      }
      if (actor !== "creator") throw new Error("Ravioli PUBLIC_REVEAL must be pinned by the creator");
      if (input.mimeType !== "application/json") throw new Error("Ravioli PUBLIC_REVEAL must use application/json");
      const router = this.targetBindings.get("router");
      if (!router) throw new Error("Ravioli PUBLIC_REVEAL requires the originated router binding");
      const validated = publicRevealFromExactBytes(bytes, router);
      if (input.fileName !== `ravioli-public-reveal-${validated.summary.tokenId}.json`) {
        throw new Error("Ravioli PUBLIC_REVEAL file name does not match its token");
      }
      this.assertRevealAtCurrentState(validated.summary);
      const digest = sha256(bytes);
      const existing = this.pendingPublicRevealPreparation;
      if (existing) {
        if (existing.sha256 !== digest || existing.byteLength !== bytes.byteLength || existing.fileName !== input.fileName || !deterministicEqual(existing.summary, validated.summary)) {
          throw new Error("Ravioli PUBLIC_REVEAL retry differs from the durable pre-pin intent");
        }
        return;
      }
      if (this.pendingPublicRevealBinding) throw new Error("Ravioli PUBLIC_REVEAL must bind on chain before another reveal");
      const appended = await this.appendEvent("PUBLIC_REVEAL_PREPARED", actor, input.preparedAt ?? new Date().toISOString(), {
        disclosure: "PUBLIC_REVEAL",
        artifact: {
          fileName: input.fileName,
          mimeType: input.mimeType,
          sha256: digest,
          byteLength: bytes.byteLength,
        },
        publicReveal: validated.summary,
      });
      for (const nonce of validated.rawNonces) this.rawNonces.add(nonce);
      this.pendingPublicRevealPreparation = {
        actor: "creator",
        fileName: input.fileName,
        mimeType: "application/json",
        sha256: digest,
        byteLength: bytes.byteLength,
        summary: validated.summary,
        preparedRecordSha256: appended.sha256,
      };
    });
  }

  beforeOperationSubmit(actor: RavioliUiLiveJournalActor, input: PastaUiLivePreparedOperation): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      if (this.pending) throw new Error("Ravioli journal requires the pending operation to reconcile before another PREPARED event");
      actor = requireActor(actor);
      if (input.action === "batch" || input.descriptor.kind === "batch") throw new Error("Ravioli journal rejects batch signer operations");
      if (input.status !== "PREPARED") throw new Error("Ravioli beforeOperationSubmit requires PREPARED input");
      const expected = this.assertActorOperation(actor, input);
      const sanitized = sanitizePreparedOperation(expected, input);
      this.assertOriginationDependencyBinding(expected, sanitized.operation);
      this.assertBoundPayloadReferences(expected, sanitized.operation);
      if (this.pendingPublicRevealPreparation) throw new Error("Ravioli PUBLIC_REVEAL was validated but not checkpointed after pinning");
      const publicRevealBindingSha256 = this.bindPendingPublicReveal(sanitized.operation, expected);
      const commitRecipe = this.prepareCommittedRecipe(expected, sanitized.operation);
      const blindRevealCommitment =
        this.prepareBlindRevealCommitment(expected, sanitized.operation);
      if (sanitized.rawNonce) this.rawNonces.add(sanitized.rawNonce);
      if (expected.action === "call") {
        const descriptor = requireRecord(input.descriptor, "call descriptor");
        const call = requireRecord(descriptor.call, "call descriptor call");
        this.bindTarget(expected.targetRole, call.contractAddress);
      }
      const appended = await this.appendEvent("PREPARED", actor, input.timestampUtc, {
        globalOrdinal: expected.globalOrdinal,
        operationSequence: expected.operationSequence,
        descriptorSha256: sanitized.descriptorSha256,
        operation: sanitized.operation,
      });
      this.pending = {
        expected,
        phase: "PREPARED",
        preparedOperation: sanitized.operation,
        preparedRecordSha256: appended.sha256,
        descriptorSha256: sanitized.descriptorSha256,
        ...(commitRecipe ? { commitRecipe } : {}),
        ...(blindRevealCommitment ? { blindRevealCommitment } : {}),
        ...(publicRevealBindingSha256 ? { publicRevealBindingSha256 } : {}),
      };
    });
  }

  onOperationSubmitted(actor: RavioliUiLiveJournalActor, input: PastaUiLiveSubmittedOperation): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      actor = requireActor(actor);
      const pending = this.pending;
      if (!pending || pending.phase !== "PREPARED") throw new Error("Ravioli SUBMITTED event has no matching PREPARED event");
      if (input.status !== "SUBMITTED") throw new Error("Ravioli onOperationSubmitted requires SUBMITTED input");
      this.assertActorOperation(actor, input);
      const sanitized = sanitizePreparedOperation(pending.expected, input);
      if (sanitized.rawNonce) this.rawNonces.add(sanitized.rawNonce);
      if (sanitized.descriptorSha256 !== pending.descriptorSha256) throw new Error("Ravioli SUBMITTED descriptor differs from PREPARED intent");
      const operationHash = requireOperationHash(input.operationHash);
      if (this.operationHashes.has(operationHash)) throw new Error("Ravioli journal operation hash was already submitted");
      if (pending.expected.action === "originate") {
        if (!input.contractAddress) throw new Error("Ravioli origination SUBMITTED event requires its originated address");
        this.bindTarget(pending.expected.targetRole, input.contractAddress);
      }
      const appended = await this.appendEvent("SUBMITTED", actor, input.timestampUtc, {
        globalOrdinal: pending.expected.globalOrdinal,
        operationSequence: pending.expected.operationSequence,
        preparedRecordSha256: pending.preparedRecordSha256,
        descriptorSha256: pending.descriptorSha256,
        operationHash,
        ...(input.contractAddress ? { contractAddress: input.contractAddress } : {}),
      });
      this.operationHashes.add(operationHash);
      this.pending = {
        ...pending,
        phase: "SUBMITTED",
        operationHash,
        submittedRecordSha256: appended.sha256,
      };
    });
  }

  appendApplied(input: RavioliUiLiveAppliedInput): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      const actor = requireActor(input.actor);
      const pending = this.pending;
      if (!pending || pending.phase !== "SUBMITTED") throw new Error("Ravioli APPLIED event has no matching SUBMITTED event");
      if (pending.expected.actor !== actor || input.operationSequence !== pending.expected.operationSequence) throw new Error("Ravioli APPLIED actor/sequence drift");
      const operationHash = requireOperationHash(input.operationHash);
      if (operationHash !== pending.operationHash) throw new Error("Ravioli APPLIED hash differs from SUBMITTED hash");
      const expectedTarget = this.targetAddress(pending.expected);
      if (input.contractAddress !== expectedTarget) throw new Error("Ravioli APPLIED target address drift");
      if (JSON.stringify(input.entrypoints) !== JSON.stringify(pending.expected.entrypoint ? [pending.expected.entrypoint] : [])) {
        throw new Error("Ravioli APPLIED entrypoint drift");
      }
      const evidence = this.validateAppliedEvidence(actor, pending, input.evidence);
      const appended = await this.appendEvent("APPLIED", actor, input.appliedAt ?? new Date().toISOString(), {
        globalOrdinal: pending.expected.globalOrdinal,
        operationSequence: pending.expected.operationSequence,
        submittedRecordSha256: pending.submittedRecordSha256,
        descriptorSha256: pending.descriptorSha256,
        operationHash,
        evidence,
      });
      if (!HASH_RE.test(appended.sha256)) throw new Error("Ravioli APPLIED record hash failed");
      this.completeAppliedSemantics(pending);
      this.actorAppliedCounts[actor] += 1;
      this.completedOperations += 1;
      this.pending = null;
    });
  }

  appendCounterAdvance(input: RavioliUiLiveCounterAdvanceInput): Promise<void> {
    return this.serialized(async () => {
      this.ensureWritable();
      const normalized = this.normalizeCounterAdvance(input);
      const appended = await this.appendEvent(
        "COUNTER_ADVANCE",
        "creator",
        input.recordedAt ?? new Date().toISOString(),
        normalized,
      );
      if (!HASH_RE.test(appended.sha256)) {
        throw new Error("Ravioli COUNTER_ADVANCE record hash failed");
      }
      this.applyCounterAdvance(normalized);
    });
  }

  appendAuthenticatedPostEvent86PlanExtension(
    recordedAt = new Date().toISOString(),
  ): Promise<Readonly<{
    appended: boolean;
    eventIndex: number;
    recordSha256: string;
    path: string;
  }>> {
    return this.serialized(async () => {
      this.ensureWritable();
      if (this.nativeEffectivePlan) {
        throw new Error(
          "Ravioli native effective intent does not accept a historical plan extension",
        );
      }
      if (this.planExtensionActive) {
        return Object.freeze({
          appended: false,
          eventIndex: 87,
          recordSha256: this.planExtensionRecordSha256,
          path: "events/000087-plan_extension-creator.json",
        });
      }
      if (
        this.eventIndex
          !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.requiredEventIndex
        || this.chainHeadSha256
          !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION
            .requiredPreviousRecordSha256
        || this.completedOperations
          !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.semanticBoundary
        || this.pinSequence !== 15
        || this.operationHashes.size
          !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.semanticBoundary
        || !this.counterAdvanceRecorded
        || this.pending
        || this.pendingPublicRevealPreparation
        || this.pendingPublicRevealBinding
      ) {
        throw new Error(
          "Ravioli plan extension requires the exact authenticated event-86 boundary",
        );
      }
      const payload = postEvent86PlanExtensionPayload(this.intent);
      const appended = await this.appendEvent(
        "PLAN_EXTENSION",
        "creator",
        recordedAt,
        payload,
      );
      this.applyPostEvent86PlanExtension(payload, appended.sha256);
      return Object.freeze({
        appended: true,
        eventIndex: 87,
        recordSha256: appended.sha256,
        path: appended.path,
      });
    });
  }

  appendPin(input: RavioliUiLivePinInput): Promise<PinCheckpoint> {
    return this.serialized(async () => {
      this.ensureWritable();
      const actor = requireActor(input.actor);
      if (typeof input.fileName !== "string" || !SAFE_NAME_RE.test(input.fileName)) throw new Error("Ravioli journal pin file name is unsafe");
      if (typeof input.mimeType !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mimeType)) throw new Error("Ravioli journal pin MIME type is invalid");
      const bytes = Uint8Array.from(input.bytes);
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_PIN_BYTES) throw new Error("Ravioli journal pin byte length is invalid");
      const digest = sha256(bytes);
      const publicPreparation = this.pendingPublicRevealPreparation;
      const isPublicReveal = Boolean(publicPreparation && publicPreparation.sha256 === digest);
      let sealedReveal:
        | Omit<SealedRevealBinding, "uri" | "pinSha256">
        | undefined;
      if (!isPublicReveal) {
        let schema = "";
        if (input.mimeType === "application/json") {
          try { schema = String(JSON.parse(Buffer.from(bytes).toString("utf8"))?.schema || ""); } catch { /* handled as an ordinary pin */ }
        }
        if (schema === PUBLIC_REVEAL_SCHEMA || /^ravioli-public-reveal-[0-9]+\.json$/.test(input.fileName)) {
          throw new Error("Ravioli PUBLIC_REVEAL requires successful pre-pin validation");
        }
        if (publicPreparation) throw new Error("Ravioli pinned bytes differ from the prevalidated PUBLIC_REVEAL");
        const sealedRevealCandidate =
          schema === SEALED_REVEAL_SCHEMA
          || /^ravioli-sealed-reveal-[0-9]+\.json$/.test(input.fileName);
        if (sealedRevealCandidate) {
          if (actor !== "creator" || input.mimeType !== "application/json") {
            throw new Error("Ravioli sealed reveal pin identity drift");
          }
          const router = this.targetBindings.get("router");
          if (!router) {
            throw new Error("Ravioli sealed reveal requires the originated router binding");
          }
          sealedReveal = sealedRevealFromExactBytes(bytes, router);
          if (
            input.fileName
              !== `ravioli-sealed-reveal-${sealedReveal.tokenId}.json`
          ) {
            throw new Error("Ravioli sealed reveal file name does not match its token");
          }
          if (this.sealedReveals.has(sealedReveal.tokenId)) {
            throw new Error(`Ravioli sealed reveal token ${sealedReveal.tokenId} was already pinned`);
          }
          this.assertSealedRevealAtCurrentState(sealedReveal.tokenId);
        }
        this.assertNoKnownRawNonce(bytes);
      } else {
        if (actor !== publicPreparation!.actor || input.fileName !== publicPreparation!.fileName || input.mimeType !== publicPreparation!.mimeType || bytes.byteLength !== publicPreparation!.byteLength) {
          throw new Error("Ravioli PUBLIC_REVEAL pin identity differs from preflight");
        }
      }
      if (input.expectedSha256 && requireHash(input.expectedSha256, "pin expected hash") !== digest) throw new Error("Ravioli journal pin hash differs from exact bytes");
      if (input.expectedByteLength !== undefined && requireInteger(input.expectedByteLength, "pin expected byte length", 1) !== bytes.byteLength) throw new Error("Ravioli journal pin length differs from exact bytes");
      const pinSequence = this.pinSequence + 1;
      const relative = `pins/${String(pinSequence).padStart(6, "0")}.bin`;
      const checkpoint: PinCheckpoint = { path: relative, sha256: digest, byteLength: bytes.byteLength };
      const metadata = input.metadata === undefined ? null : projectDeterministic(input.metadata);
      let publicRevealFields: Record<string, unknown> = {};
      let publicRevealBinding: PendingPublicRevealBinding | null = null;
      if (isPublicReveal) {
        const metadataRecord = jsonRecord(metadata, "Ravioli PUBLIC_REVEAL pin metadata");
        const cid = projectedString(metadataRecord.cid, "Ravioli PUBLIC_REVEAL CID");
        const uri = projectedIpfsUri(metadataRecord.uri, "Ravioli PUBLIC_REVEAL proof URI");
        if (uri !== `ipfs://${cid}`) throw new Error("Ravioli PUBLIC_REVEAL proof URI does not match its CID");
        const entrypoint = this.expectedRevealBinding(publicPreparation!.summary);
        publicRevealFields = {
          disclosure: "PUBLIC_REVEAL",
          publicRevealPreparedRecordSha256: publicPreparation!.preparedRecordSha256,
          publicReveal: publicPreparation!.summary,
        };
        publicRevealBinding = {
          tokenId: publicPreparation!.summary.tokenId,
          entrypoint,
          uri,
          pinSha256: digest,
        };
      }
      let sealedRevealBinding: SealedRevealBinding | undefined;
      if (sealedReveal) {
        const metadataRecord = jsonRecord(
          metadata,
          "Ravioli sealed reveal pin metadata",
        );
        const cid = projectedString(
          metadataRecord.cid,
          "Ravioli sealed reveal CID",
        );
        const uri = projectedIpfsUri(
          metadataRecord.uri,
          "Ravioli sealed reveal URI",
        );
        if (uri !== `ipfs://${cid}`) {
          throw new Error("Ravioli sealed reveal URI does not match its CID");
        }
        sealedRevealBinding = {
          ...sealedReveal,
          uri,
          pinSha256: digest,
        };
      }
      await durableExclusiveWrite(path.join(this.journalRoot, relative), bytes);
      await this.appendEvent("PIN", actor, input.pinnedAt ?? new Date().toISOString(), {
        pinSequence,
        artifact: { ...checkpoint, fileName: input.fileName, mimeType: input.mimeType },
        metadata,
        ...publicRevealFields,
      });
      this.pinSequence = pinSequence;
      this.pinCheckpoints.set(relative, checkpoint);
      if (isPublicReveal) {
        this.publicReveals.set(publicPreparation!.summary.tokenId, publicPreparation!.summary);
        this.publicRevealPins.set(relative, publicPreparation!.summary);
        this.pendingPublicRevealBinding = publicRevealBinding;
        this.pendingPublicRevealPreparation = null;
      }
      if (sealedRevealBinding) {
        this.sealedReveals.set(
          sealedRevealBinding.tokenId,
          sealedRevealBinding,
        );
        this.sealedRevealPins.set(relative, sealedRevealBinding);
      }
      return checkpoint;
    });
  }

  private buildFinalization(completedAt: string): {
    finalRecord: JsonObject;
    finalBytes: Uint8Array;
    finalSha256: string;
    counts: RavioliUiLiveJournalFinalization["counts"];
  } {
    this.ensureWritable();
    if (this.pending) throw new Error("Ravioli journal cannot finalize with an incomplete operation");
    if (this.pendingPublicRevealPreparation || this.pendingPublicRevealBinding) throw new Error("Ravioli journal cannot finalize with an unbound PUBLIC_REVEAL");
    if (!this.nativeEffectivePlan && !this.planExtensionActive) {
      throw new Error(
        "Ravioli journal cannot finalize without its authenticated plan extension",
      );
    }
    const expected = expectedCounts(this.effectiveOperationMatrix());
    if (
      this.completedOperations !== RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS.total
      || !deterministicEqual(this.actorAppliedCounts, RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS.actors)
    ) {
      throw new Error("Ravioli journal cannot finalize before every semantic-plan operation is APPLIED");
    }
    if (
      !deterministicEqual(expected, RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS)
      || this.operationHashes.size !== RAVIOLI_UI_LIVE_EFFECTIVE_EXPECTED_COUNTS.total
    ) {
      throw new Error("Ravioli journal final operation totals drifted");
    }
    if (
      JSON.stringify([...this.publicReveals.keys()].sort((left, right) => left - right))
        !== JSON.stringify([0])
      || JSON.stringify([...this.sealedReveals.keys()].sort((left, right) => left - right))
        !== JSON.stringify([1, 2, 3, 4, 5])
    ) {
      throw new Error(
        "Ravioli journal cannot finalize without one public and five sealed reveal artifacts",
      );
    }
    const counts: RavioliUiLiveJournalFinalization["counts"] = {
      actors: { ...this.actorAppliedCounts },
      originations: expected.originations,
      calls: expected.calls,
      buys: expected.buys,
      opens: expected.opens,
      transfers: expected.transfers,
      refunds: expected.refunds,
      pins: this.pinSequence,
      events: this.eventIndex,
    };
    const finalRecord = jsonRecord(projectDeterministic({
      schema: RAVIOLI_UI_LIVE_JOURNAL_FINAL_SCHEMA,
      status: "FINALIZED",
      journalId: this.intent.journalId,
      intentSha256: this.intentSha256,
      previousRecordSha256: this.chainHeadSha256,
      completedAt: requireIso(completedAt, "journal completion time"),
      counts,
      plan: {
        mode: this.nativeEffectivePlan
          ? "native-effective-intent"
          : "authenticated-post-event86-extension",
        baseIntentSha256: this.intentSha256,
        baseMatrixSha256: this.intent.matrixSha256,
        planExtensionRecordSha256: this.nativeEffectivePlan
          ? null
          : this.planExtensionRecordSha256,
        effectiveMatrixSha256: sha256(
          deterministicJsonBytes(RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX),
        ),
      },
    }), "journal final record");
    const finalBytes = deterministicJsonBytes(finalRecord);
    this.assertNoKnownRawNonce(finalBytes);
    return { finalRecord, finalBytes, finalSha256: sha256(finalBytes), counts };
  }

  previewFinalization(completedAt = new Date().toISOString()): Promise<RavioliUiLiveJournalFinalizationPreview> {
    return this.serialized(async () => {
      const preview = this.buildFinalization(completedAt);
      const currentArtifacts = await artifactInventory(this.journalRoot);
      const expectedCurrentCount = 1 + this.eventIndex + this.pinSequence;
      if (currentArtifacts.length !== expectedCurrentCount || currentArtifacts.some((artifact) => artifact.path === "final.json")) {
        throw new Error("Ravioli pre-finalization artifact inventory drifted");
      }
      const artifacts = [...currentArtifacts, {
        path: "final.json",
        sha256: preview.finalSha256,
        byteLength: preview.finalBytes.byteLength,
      }].sort((left, right) => left.path.localeCompare(right.path));
      return {
        finalization: {
          status: "FINALIZED",
          journalId: this.intent.journalId,
          intentSha256: this.intentSha256,
          finalSha256: preview.finalSha256,
          counts: preview.counts,
          artifacts,
        },
        finalBytes: Uint8Array.from(preview.finalBytes),
      };
    });
  }

  finalize(completedAt = new Date().toISOString()): Promise<RavioliUiLiveJournalFinalization> {
    return this.serialized(async () => {
      const finalization = this.buildFinalization(completedAt);
      await durableExclusiveWrite(path.join(this.journalRoot, "final.json"), finalization.finalBytes);
      this.finalSha256 = finalization.finalSha256;
      this.finalized = true;
      const artifacts = await artifactInventory(this.journalRoot);
      const allowedCount = 2 + this.eventIndex + this.pinSequence;
      if (artifacts.length !== allowedCount) throw new Error("Ravioli final artifact inventory does not cover every journal file");
      return {
        status: "FINALIZED",
        journalId: this.intent.journalId,
        intentSha256: this.intentSha256,
        finalSha256: this.finalSha256,
        counts: finalization.counts,
        artifacts,
      };
    });
  }

  async inventory(): Promise<RavioliUiLiveJournalArtifact[]> {
    await this.queue;
    return artifactInventory(this.journalRoot);
  }

  async restartState(): Promise<RavioliUiLiveJournalRestartState> {
    await this.queue;
    const pending = this.pending;
    const pendingTarget = pending
      ? this.targetBindings.get(pending.expected.targetRole)
      : undefined;
    return Object.freeze({
      schema: "pastaprotocol-ravioli-ui-live-journal-restart-state@1" as const,
      journalId: this.intent.journalId,
      intentSha256: this.intentSha256,
      eventCount: this.eventIndex,
      pinCount: this.pinSequence,
      completedOperationCount: this.completedOperations,
      finalized: this.finalized,
      effectivePlan: this.hasEffectivePlan(),
      actorAppliedCounts: Object.freeze({ ...this.actorAppliedCounts }),
      actorCounterOffsets: Object.freeze({ ...this.counterOffsets }),
      targetBindings: Object.freeze(Object.fromEntries(this.targetBindings)),
      pendingOperation: pending
        ? Object.freeze({
            phase: pending.phase,
            expected: pending.expected,
            preparedOperation: Object.freeze(
              jsonRecord(
                projectDeterministic(pending.preparedOperation),
                "Ravioli restart prepared operation",
              ),
            ),
            preparedRecordSha256: pending.preparedRecordSha256,
            descriptorSha256: pending.descriptorSha256,
            ...(pending.operationHash
              ? { operationHash: pending.operationHash }
              : {}),
            ...(pending.submittedRecordSha256
              ? { submittedRecordSha256: pending.submittedRecordSha256 }
              : {}),
            ...(pendingTarget ? { contractAddress: pendingTarget } : {}),
          })
        : null,
      pendingPublicRevealPreparation: this.pendingPublicRevealPreparation
        ? Object.freeze({
            actor: this.pendingPublicRevealPreparation.actor,
            fileName: this.pendingPublicRevealPreparation.fileName,
            mimeType: this.pendingPublicRevealPreparation.mimeType,
            sha256: this.pendingPublicRevealPreparation.sha256,
            byteLength: this.pendingPublicRevealPreparation.byteLength,
            preparedRecordSha256:
              this.pendingPublicRevealPreparation.preparedRecordSha256,
          })
        : null,
      pendingPublicRevealBinding: this.pendingPublicRevealBinding
        ? Object.freeze({ ...this.pendingPublicRevealBinding })
        : null,
    });
  }

  isFinalized(): boolean { return this.finalized; }
  getCompletedOperationCount(): number { return this.completedOperations; }
  getEventCount(): number { return this.eventIndex; }
  getPinCount(): number { return this.pinSequence; }
  hasPlanExtension(): boolean { return this.planExtensionActive; }
  hasEffectivePlan(): boolean {
    return this.nativeEffectivePlan || this.planExtensionActive;
  }
  getPlanExtensionRecordSha256(): string { return this.planExtensionRecordSha256; }
  getCounterOffset(actor: RavioliUiLiveJournalActor): number {
    return this.counterOffsets[requireActor(actor)];
  }
  hasCounterAdvance(): boolean { return this.counterAdvanceRecorded; }

  private replayEvent(
    record: JsonObject,
    recordSha256: string,
    pinBytes?: Uint8Array,
  ): void {
    if (record.schema !== RAVIOLI_UI_LIVE_JOURNAL_EVENT_SCHEMA || record.journalId !== this.intent.journalId || record.intentSha256 !== this.intentSha256) {
      throw new Error("Ravioli journal event identity drift");
    }
    const eventIndex = requireInteger(record.eventIndex, "journal event index", 1);
    if (eventIndex !== this.eventIndex + 1) throw new Error("Ravioli journal event indices are not contiguous");
    if (record.previousRecordSha256 !== this.chainHeadSha256) throw new Error("Ravioli journal hash link is broken");
    requireIso(record.timestampUtc, "journal event time");
    const phase = record.phase;
    const actor = requireActor(record.actor);
    if (phase === "PREPARED") {
      if (this.pending) throw new Error("Ravioli journal contains overlapping PREPARED operations");
      if (this.pendingPublicRevealPreparation) throw new Error("Ravioli persisted operation precedes its PUBLIC_REVEAL pin checkpoint");
      const expected = this.expectedNext();
      if (actor !== expected.actor || record.globalOrdinal !== expected.globalOrdinal || record.operationSequence !== expected.operationSequence) throw new Error("Ravioli persisted PREPARED order drift");
      const sanitized = sanitizePreparedOperation(expected, jsonRecord(record.operation, "persisted operation"));
      this.assertOriginationDependencyBinding(expected, sanitized.operation);
      this.assertBoundPayloadReferences(expected, sanitized.operation);
      if (sanitized.rawNonce) throw new Error("Ravioli journal persisted a raw open_pack nonce");
      if (record.descriptorSha256 !== sanitized.descriptorSha256) throw new Error("Ravioli PREPARED descriptor hash drift");
      const descriptor = jsonRecord(sanitized.operation.descriptor, "persisted descriptor");
      if (expected.action === "call") this.bindTarget(expected.targetRole, jsonRecord(descriptor.call, "persisted call").contractAddress);
      const publicRevealBindingSha256 = this.bindPendingPublicReveal(sanitized.operation, expected);
      const commitRecipe = this.prepareCommittedRecipe(expected, sanitized.operation);
      const blindRevealCommitment =
        this.prepareBlindRevealCommitment(expected, sanitized.operation);
      this.pending = {
        expected,
        phase: "PREPARED",
        preparedOperation: sanitized.operation,
        preparedRecordSha256: recordSha256,
        descriptorSha256: sanitized.descriptorSha256,
        ...(commitRecipe ? { commitRecipe } : {}),
        ...(blindRevealCommitment ? { blindRevealCommitment } : {}),
        ...(publicRevealBindingSha256 ? { publicRevealBindingSha256 } : {}),
      };
    } else if (phase === "SUBMITTED") {
      const pending = this.pending;
      if (!pending || pending.phase !== "PREPARED") throw new Error("Ravioli persisted SUBMITTED event lacks PREPARED");
      if (actor !== pending.expected.actor || record.globalOrdinal !== pending.expected.globalOrdinal || record.operationSequence !== pending.expected.operationSequence) throw new Error("Ravioli persisted SUBMITTED order drift");
      if (record.preparedRecordSha256 !== pending.preparedRecordSha256 || record.descriptorSha256 !== pending.descriptorSha256) throw new Error("Ravioli SUBMITTED link drift");
      const operationHash = requireOperationHash(record.operationHash);
      if (this.operationHashes.has(operationHash)) throw new Error("Ravioli persisted duplicate operation hash");
      if (pending.expected.action === "originate") {
        if (!record.contractAddress) throw new Error("Ravioli persisted origination SUBMITTED event lacks its originated address");
        this.bindTarget(pending.expected.targetRole, record.contractAddress);
      }
      this.operationHashes.add(operationHash);
      this.pending = { ...pending, phase: "SUBMITTED", operationHash, submittedRecordSha256: recordSha256 };
    } else if (phase === "APPLIED") {
      const pending = this.pending;
      if (!pending || pending.phase !== "SUBMITTED") throw new Error("Ravioli persisted APPLIED event lacks SUBMITTED");
      if (actor !== pending.expected.actor || record.globalOrdinal !== pending.expected.globalOrdinal || record.operationSequence !== pending.expected.operationSequence) throw new Error("Ravioli persisted APPLIED order drift");
      if (record.submittedRecordSha256 !== pending.submittedRecordSha256 || record.descriptorSha256 !== pending.descriptorSha256 || record.operationHash !== pending.operationHash) throw new Error("Ravioli APPLIED link drift");
      this.validateAppliedEvidence(actor, pending, record.evidence);
      this.completeAppliedSemantics(pending);
      this.actorAppliedCounts[actor] += 1;
      this.completedOperations += 1;
      this.pending = null;
    } else if (phase === "COUNTER_ADVANCE") {
      if (actor !== "creator") throw new Error("Ravioli persisted COUNTER_ADVANCE actor drift");
      const normalized = this.normalizeCounterAdvance({
        recoveryId: String(record.recoveryId || ""),
        semanticBoundary: Number(record.semanticBoundary),
        recoveryContractAddress: String(record.recoveryContractAddress || ""),
        advances: Array.isArray(record.advances)
          ? record.advances.map((value) => {
              const advance = jsonRecord(value, "persisted Ravioli counter advance actor");
              return {
                actor: requireActor(advance.actor),
                operations: Array.isArray(advance.operations)
                  ? advance.operations as RavioliUiLiveCounterAdvanceOperation[]
                  : [],
              };
            })
          : [],
        recordedAt: String(record.timestampUtc || ""),
      });
      if (!deterministicEqual(normalized, {
        recoveryId: record.recoveryId,
        semanticBoundary: record.semanticBoundary,
        nextGlobalOrdinal: record.nextGlobalOrdinal,
        recoveryContractAddress: record.recoveryContractAddress,
        advances: record.advances,
      })) {
        throw new Error("Ravioli persisted COUNTER_ADVANCE payload drift");
      }
      this.applyCounterAdvance(normalized);
    } else if (phase === "PLAN_EXTENSION") {
      if (actor !== "creator") {
        throw new Error("Ravioli persisted PLAN_EXTENSION actor drift");
      }
      if (
        eventIndex !== 87
        || record.previousRecordSha256
          !== RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION
            .requiredPreviousRecordSha256
      ) {
        throw new Error("Ravioli persisted PLAN_EXTENSION boundary drift");
      }
      this.applyPostEvent86PlanExtension(
        jsonRecord(projectJournalJson({
          extension: record.extension,
          extensionSha256: record.extensionSha256,
          effectiveMatrixSha256: record.effectiveMatrixSha256,
          effectiveOperationCount: record.effectiveOperationCount,
        }), "persisted Ravioli plan extension payload"),
        recordSha256,
      );
    } else if (phase === "PUBLIC_REVEAL_PREPARED") {
      if (actor !== "creator" || record.disclosure !== "PUBLIC_REVEAL") throw new Error("Ravioli persisted PUBLIC_REVEAL preflight identity drift");
      if (this.pending || this.pendingPublicRevealPreparation || this.pendingPublicRevealBinding) throw new Error("Ravioli persisted PUBLIC_REVEAL overlaps pending state");
      const artifact = jsonRecord(record.artifact, "persisted PUBLIC_REVEAL preflight artifact");
      const summary = normalizePublicRevealSummary(record.publicReveal);
      this.assertRevealAtCurrentState(summary);
      const fileName = projectedString(artifact.fileName, "persisted PUBLIC_REVEAL file name");
      if (fileName !== `ravioli-public-reveal-${summary.tokenId}.json`) throw new Error("persisted PUBLIC_REVEAL file name drift");
      if (artifact.mimeType !== "application/json") throw new Error("persisted PUBLIC_REVEAL MIME drift");
      this.pendingPublicRevealPreparation = {
        actor: "creator",
        fileName,
        mimeType: "application/json",
        sha256: requireHash(artifact.sha256, "persisted PUBLIC_REVEAL hash"),
        byteLength: requireInteger(artifact.byteLength, "persisted PUBLIC_REVEAL byte length", 1),
        summary,
        preparedRecordSha256: recordSha256,
      };
    } else if (phase === "PIN") {
      const pinSequence = requireInteger(record.pinSequence, "pin sequence", 1);
      if (pinSequence !== this.pinSequence + 1) throw new Error("Ravioli pin checkpoint sequence drift");
      const artifact = jsonRecord(record.artifact, "pin artifact");
      const relative = String(artifact.path);
      if (relative !== `pins/${String(pinSequence).padStart(6, "0")}.bin`) throw new Error("Ravioli pin artifact path drift");
      const checkpoint = { path: relative, sha256: requireHash(artifact.sha256, "pin artifact hash"), byteLength: requireInteger(artifact.byteLength, "pin artifact length", 1) };
      if (record.disclosure === "PUBLIC_REVEAL") {
        const preparation = this.pendingPublicRevealPreparation;
        if (!preparation || actor !== "creator" || record.publicRevealPreparedRecordSha256 !== preparation.preparedRecordSha256) {
          throw new Error("Ravioli persisted PUBLIC_REVEAL pin lacks its pre-pin validation");
        }
        const summary = normalizePublicRevealSummary(record.publicReveal);
        if (!deterministicEqual(summary, preparation.summary) || checkpoint.sha256 !== preparation.sha256 || checkpoint.byteLength !== preparation.byteLength || artifact.fileName !== preparation.fileName || artifact.mimeType !== preparation.mimeType) {
          throw new Error("Ravioli persisted PUBLIC_REVEAL pin differs from preflight");
        }
        const metadata = jsonRecord(record.metadata, "persisted PUBLIC_REVEAL pin metadata");
        const cid = projectedString(metadata.cid, "persisted PUBLIC_REVEAL CID");
        const uri = projectedIpfsUri(metadata.uri, "persisted PUBLIC_REVEAL URI");
        if (uri !== `ipfs://${cid}`) throw new Error("persisted PUBLIC_REVEAL URI/CID drift");
        this.publicReveals.set(summary.tokenId, summary);
        this.publicRevealPins.set(relative, summary);
        this.pendingPublicRevealBinding = {
          tokenId: summary.tokenId,
          entrypoint: this.expectedRevealBinding(summary),
          uri,
          pinSha256: checkpoint.sha256,
        };
        this.pendingPublicRevealPreparation = null;
      } else {
        if (this.pendingPublicRevealPreparation) throw new Error("Ravioli persisted ordinary pin interrupts PUBLIC_REVEAL pinning");
        if (record.disclosure !== undefined || record.publicReveal !== undefined || record.publicRevealPreparedRecordSha256 !== undefined) {
          throw new Error("Ravioli persisted ordinary pin has disclosure fields");
        }
        const fileName = projectedString(
          artifact.fileName,
          "persisted ordinary pin file name",
        );
        let schema = "";
        if (pinBytes && artifact.mimeType === "application/json") {
          try {
            schema = String(
              JSON.parse(Buffer.from(pinBytes).toString("utf8"))?.schema || "",
            );
          } catch {
            // An ordinary non-envelope JSON pin is validated by its pinner.
          }
        }
        const sealedRevealCandidate =
          schema === SEALED_REVEAL_SCHEMA
          || /^ravioli-sealed-reveal-[0-9]+\.json$/.test(fileName);
        if (sealedRevealCandidate) {
          if (!pinBytes || actor !== "creator" || artifact.mimeType !== "application/json") {
            throw new Error("persisted Ravioli sealed reveal pin identity drift");
          }
          const router = this.targetBindings.get("router");
          if (!router) {
            throw new Error("persisted Ravioli sealed reveal lacks its router binding");
          }
          const sealed = sealedRevealFromExactBytes(pinBytes, router);
          if (fileName !== `ravioli-sealed-reveal-${sealed.tokenId}.json`) {
            throw new Error("persisted Ravioli sealed reveal file name drift");
          }
          if (this.sealedReveals.has(sealed.tokenId)) {
            throw new Error(`persisted Ravioli sealed reveal token ${sealed.tokenId} is duplicated`);
          }
          this.assertSealedRevealAtCurrentState(sealed.tokenId);
          const metadata = jsonRecord(
            record.metadata,
            "persisted Ravioli sealed reveal metadata",
          );
          const cid = projectedString(
            metadata.cid,
            "persisted Ravioli sealed reveal CID",
          );
          const uri = projectedIpfsUri(
            metadata.uri,
            "persisted Ravioli sealed reveal URI",
          );
          if (uri !== `ipfs://${cid}`) {
            throw new Error("persisted Ravioli sealed reveal URI/CID drift");
          }
          const binding = {
            ...sealed,
            uri,
            pinSha256: checkpoint.sha256,
          };
          this.sealedReveals.set(binding.tokenId, binding);
          this.sealedRevealPins.set(relative, binding);
        }
      }
      this.pinSequence = pinSequence;
      this.pinCheckpoints.set(relative, checkpoint);
    } else throw new Error(`unknown Ravioli journal phase: ${String(phase)}`);
    this.eventIndex = eventIndex;
    this.chainHeadSha256 = recordSha256;
  }

  async replayExisting(): Promise<void> {
    const eventDirectory = path.join(this.journalRoot, "events");
    for (const name of (await readdir(eventDirectory)).sort()) {
      if (!/^\d{6}-(?:prepared|submitted|applied|pin|public_reveal_prepared|counter_advance|plan_extension)-(?:creator|collector1|collector2)\.json$/.test(name)) throw new Error(`unexpected Ravioli journal event file: ${name}`);
      const file = await canonicalJsonFile(path.join(eventDirectory, name));
      if (!name.startsWith(String(this.eventIndex + 1).padStart(6, "0"))) throw new Error("Ravioli journal event filename order drift");
      let pinBytes: Uint8Array | undefined;
      if (file.value.phase === "PIN") {
        const pinSequence = requireInteger(
          file.value.pinSequence,
          "replayed pin sequence",
          1,
        );
        const artifact = jsonRecord(
          file.value.artifact,
          "replayed pin artifact",
        );
        const expectedPath =
          `pins/${String(pinSequence).padStart(6, "0")}.bin`;
        if (artifact.path !== expectedPath) {
          throw new Error("replayed Ravioli pin path drift");
        }
        pinBytes = Uint8Array.from(
          await readFile(path.join(this.journalRoot, expectedPath)),
        );
        if (
          pinBytes.byteLength
            !== requireInteger(artifact.byteLength, "replayed pin length", 1)
          || sha256(pinBytes)
            !== requireHash(artifact.sha256, "replayed pin hash")
        ) {
          throw new Error("replayed Ravioli pin bytes drift");
        }
      }
      this.replayEvent(file.value, file.sha256, pinBytes);
    }
    const pinNames = (await readdir(path.join(this.journalRoot, "pins"))).sort();
    if (pinNames.length !== this.pinCheckpoints.size) throw new Error("Ravioli journal has an uncheckpointed or missing pin artifact");
    for (const name of pinNames) {
      const relative = `pins/${name}`;
      const checkpoint = this.pinCheckpoints.get(relative);
      if (!checkpoint) throw new Error(`Ravioli journal pin lacks a checkpoint: ${name}`);
      const bytes = await readFile(path.join(this.journalRoot, relative));
      if (bytes.byteLength !== checkpoint.byteLength || sha256(bytes) !== checkpoint.sha256) throw new Error(`Ravioli journal pin bytes drifted: ${name}`);
      const publicReveal = this.publicRevealPins.get(relative);
      if (publicReveal) {
        const validated = publicRevealFromExactBytes(bytes, publicReveal.contract);
        if (!deterministicEqual(validated.summary, publicReveal)) throw new Error(`Ravioli PUBLIC_REVEAL bytes differ from their checkpoint: ${name}`);
        const lastCommit = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter(
          (operation) => operation.entrypoint === "commit_recipe" && operation.tokenId === publicReveal.tokenId,
        ).at(-1);
        assertRevealMatchesCommits(
          publicReveal,
          this.recipesFor(publicReveal.tokenId),
          Boolean(lastCommit && this.completedOperations >= lastCommit.globalOrdinal),
        );
        for (const nonce of validated.rawNonces) this.rawNonces.add(nonce);
      } else if (this.sealedRevealPins.has(relative)) {
        const expected = this.sealedRevealPins.get(relative)!;
        const validated = sealedRevealFromExactBytes(bytes, expected.contract);
        if (
          !deterministicEqual(validated, {
            schema: expected.schema,
            contract: expected.contract,
            tokenId: expected.tokenId,
            manifestUri: expected.manifestUri,
          })
        ) {
          throw new Error(
            `Ravioli sealed reveal bytes differ from their checkpoint: ${name}`,
          );
        }
      } else {
        this.assertNoKnownRawNonce(bytes);
      }
    }
    const rootNames = (await readdir(this.journalRoot)).sort();
    for (const name of rootNames) if (!["events", "final.json", "intent.json", "pins"].includes(name)) throw new Error(`unexpected Ravioli journal root artifact: ${name}`);
    if (rootNames.includes("final.json")) {
      const final = await canonicalJsonFile(path.join(this.journalRoot, "final.json"));
      const value = final.value;
      if (value.schema !== RAVIOLI_UI_LIVE_JOURNAL_FINAL_SCHEMA || value.status !== "FINALIZED" || value.journalId !== this.intent.journalId || value.intentSha256 !== this.intentSha256) throw new Error("Ravioli final record identity drift");
      if (value.previousRecordSha256 !== this.chainHeadSha256) throw new Error("Ravioli final record hash link drift");
      const counts = jsonRecord(value.counts, "final counts");
      const expected = expectedCounts(this.effectiveOperationMatrix());
      if (
        this.pending
        || this.completedOperations !== expected.total
        || !deterministicEqual(counts.actors, expected.actors)
        || counts.originations !== expected.originations
        || counts.calls !== expected.calls
        || counts.buys !== expected.buys
        || counts.opens !== expected.opens
        || counts.transfers !== expected.transfers
        || counts.refunds !== expected.refunds
        || counts.pins !== this.pinSequence
        || counts.events !== this.eventIndex
      ) {
        throw new Error("Ravioli final record count drift");
      }
      const plan = jsonRecord(value.plan, "Ravioli final plan provenance");
      if (
        (!this.nativeEffectivePlan && !this.planExtensionActive)
        || plan.mode !== (this.nativeEffectivePlan
          ? "native-effective-intent"
          : "authenticated-post-event86-extension")
        || plan.baseIntentSha256 !== this.intentSha256
        || plan.baseMatrixSha256 !== this.intent.matrixSha256
        || plan.planExtensionRecordSha256 !== (this.nativeEffectivePlan
          ? null
          : this.planExtensionRecordSha256)
        || plan.effectiveMatrixSha256 !== sha256(
          deterministicJsonBytes(RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX),
        )
      ) {
        throw new Error("Ravioli final plan provenance drift");
      }
      if (
        JSON.stringify([...this.publicReveals.keys()].sort((left, right) => left - right))
          !== JSON.stringify([0])
        || JSON.stringify([...this.sealedReveals.keys()].sort((left, right) => left - right))
          !== JSON.stringify([1, 2, 3, 4, 5])
      ) {
        throw new Error(
          "Ravioli final record lacks its public/sealed reveal inventory",
        );
      }
      this.finalized = true;
      this.finalSha256 = final.sha256;
    }
    const inventory = await artifactInventory(this.journalRoot);
    const expectedFiles = 1 + this.eventIndex + this.pinSequence + (this.finalized ? 1 : 0);
    if (inventory.length !== expectedFiles) throw new Error("Ravioli journal inventory does not cover every file");
  }
}

export async function createRavioliUiLiveJournal(input: CreateRavioliUiLiveJournalInput): Promise<RavioliUiLiveJournal> {
  const journalRoot = path.resolve(input.journalRoot);
  const core = intentCore(input);
  const journalId = sha256(deterministicJsonBytes(core));
  const intent: JournalIntent = { ...core, journalId };
  const bytes = deterministicJsonBytes(intent);
  await durableCreateJournalDirectories(journalRoot);
  await durableExclusiveWrite(path.join(journalRoot, "intent.json"), bytes);
  return new RavioliUiLiveJournal(journalRoot, intent, sha256(bytes));
}

export async function openRavioliUiLiveJournal(journalRoot: string): Promise<RavioliUiLiveJournal> {
  const resolved = path.resolve(journalRoot);
  const file = await canonicalJsonFile(path.join(resolved, "intent.json"));
  const intent = validateIntent(file.value);
  const journal = new RavioliUiLiveJournal(resolved, intent, file.sha256);
  await journal.replayExisting();
  return journal;
}
