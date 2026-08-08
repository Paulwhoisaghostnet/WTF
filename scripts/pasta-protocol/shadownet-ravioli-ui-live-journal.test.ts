import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as ts from "typescript";

import { packDataBytes } from "@taquito/michel-codec";
import { MichelsonMap } from "@taquito/taquito";
import { blake2b } from "blakejs";

import type {
  PastaUiLiveBridgeRequest,
  PastaUiLivePreparedOperation,
  PastaUiLiveSubmittedOperation,
} from "./pasta-ui-live-bridge-kit";
import { PASTA_UI_LIVE_BRIDGE_SCHEMA } from "./pasta-ui-live-bridge-kit";
import {
  createRavioliUiLiveJournal,
  openRavioliUiLiveJournal,
  openRavioliUiLiveJournalAgainstPostEvent86Boundary,
  RAVIOLI_UI_LIVE_BASE_EXPECTED_COUNTS,
  RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX,
  RAVIOLI_UI_LIVE_EXPECTED_COUNTS,
  RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
  RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
  RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION,
  ravioliUiLiveNonceCommitment,
  type CreateRavioliUiLiveJournalInput,
  type RavioliUiLiveExpectedOperation,
  type RavioliUiLiveJournalActor,
} from "./shadownet-ravioli-ui-live-journal";
import {
  createRavioliCurrentResumeCoordinator,
  inspectRavioliCurrentResume,
  installRavioliPrivateRecoveryRestoration,
  loadRavioliPrivateRecoveryRestoration,
  reconcileRavioliCurrentResume,
  type RavioliCurrentResumeExpectedIdentity,
  type RavioliCurrentResumePlan,
} from "./shadownet-ravioli-current-resume";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";
import {
  claimFreshRavioliUiLiveOutputDirectory,
  openExactRavioliUiLivePrewriteJournal,
} from "./shadownet-ravioli-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR1 = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const COLLECTOR2 = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
const ROUTER = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const BLIND_CONTROLLER = "KT1LjmKGk4RugM2TUwjDp6KQQ2AXM5VqfvPu";
const GNOCCHI = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const GNOCCHI_ADAPTER = "KT1HstSyfcFwQD7dw3KcBLFCjvHFHY5ANjoC";
const ALTERNATE_GNOCCHI_ADAPTER = "KT1SanxZmBUoQP4Td3JTLVnhoWV43zq9tUqN";
const ROTINI = "KT1LUc15yfskvtWfKvYt9oFgXt24TnWx1P8T";
const ROTINI_ADAPTER = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
const HISTORICAL_CONTINUATION_ROTINI_ADAPTER = "KT1DjJbTatDAvB73TW4uo58XdrN3fxb45w6Y";
const MACARONI_RECOVERY = "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP";
const HASH = "a".repeat(64);
const RAW_NONCE = "0123456789abcdef".repeat(4);
const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";
const MODE_NAMES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const;

const ACTOR_ADDRESS: Record<RavioliUiLiveJournalActor, string> = {
  creator: CREATOR,
  collector1: COLLECTOR1,
  collector2: COLLECTOR2,
};

const ACTOR_INITIAL_COUNTER: Record<RavioliUiLiveJournalActor, number> = {
  creator: 100,
  collector1: 200,
  collector2: 300,
};

const TARGET_ADDRESS = {
  blindController: BLIND_CONTROLLER,
  router: ROUTER,
  gnocchi: GNOCCHI,
  gnocchiAdapter: GNOCCHI_ADAPTER,
  rotini: ROTINI,
  rotiniAdapter: ROTINI_ADAPTER,
} as const;

type FixtureBindings = {
  actorAddress: Record<RavioliUiLiveJournalActor, string>;
  actorInitialCounter: Record<RavioliUiLiveJournalActor, number>;
  targetAddress: Record<
    "blindController" | "router" | "gnocchi" | "gnocchiAdapter" | "rotini" | "rotiniAdapter",
    string
  >;
};

type BlindRevealPlan = Readonly<{
  tokenId: number;
  manifestUri: string;
  sealedUri: string;
  salt: string;
  offset: number;
  revealCommitment: string;
}>;

const DEFAULT_BINDINGS: FixtureBindings = {
  actorAddress: ACTOR_ADDRESS,
  actorInitialCounter: ACTOR_INITIAL_COUNTER,
  targetAddress: { ...TARGET_ADDRESS },
};

const EFFECTIVE_MATRIX = RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX;
const HISTORICAL_EVENT86_OPERATOR_FIXTURE_FLAG =
  "PASTA_RAVIOLI_EVENT86_OPERATOR_FIXTURE_TEST";
const HISTORICAL_EVENT86_JOURNAL = path.resolve(
  "artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260724t053947z/ravioli/artifacts/journal",
);
const HISTORICAL_OPEN_KITS = path.resolve(
  "artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260724t053947z/ravioli/artifacts/open-kits",
);

const REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
} as const;

function utf8Hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function revealCommitment(contentsUri: string, salt: string, offset: number): string {
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [
        { bytes: utf8Hex(contentsUri) },
        {
          prim: "Pair",
          args: [{ int: String(offset) }, { bytes: salt }],
        },
      ],
    } as any,
    REVEAL_PACK_TYPE as any,
  ).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

function manifestUri(tokenId: number): string {
  return `ipfs://${CID}/manifest-${tokenId}.json`;
}

function syntheticCid(label: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = Uint8Array.from([
    0x01,
    0x55,
    0x12,
    0x20,
    ...createHash("sha256").update(label).digest(),
  ]);
  let bits = 0;
  let accumulator = 0;
  let encoded = "b";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) encoded += alphabet[(accumulator << (5 - bits)) & 31];
  return encoded;
}

function blindRevealPlan(tokenId: number): BlindRevealPlan {
  const sealedUri = `ipfs://${syntheticCid(`sealed-${tokenId}`)}`;
  const salt = createHash("sha256").update(`ravioli-test-salt:${tokenId}`).digest("hex");
  const offset = tokenId % 2;
  return Object.freeze({
    tokenId,
    manifestUri: manifestUri(tokenId),
    sealedUri,
    salt,
    offset,
    revealCommitment: revealCommitment(sealedUri, salt, offset),
  });
}

function sealedRevealBytes(
  plan: BlindRevealPlan,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): Uint8Array {
  return deterministicJsonBytes({
    schema: "pasta-ravioli-sealed-reveal@1",
    cipher: "AES-256-GCM",
    keyDerivation: "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    iv: Buffer.alloc(12, plan.tokenId).toString("base64"),
    ciphertext: Buffer.alloc(32, plan.tokenId + 1).toString("base64"),
    aad: {
      schema: "pasta-ravioli-sealed-reveal@1",
      network: "shadownet",
      contract: bindings.targetAddress.router,
      tokenId: plan.tokenId,
      manifestUri: plan.manifestUri,
    },
  });
}

function inputFor(
  journalRoot: string,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): CreateRavioliUiLiveJournalInput {
  const actor = (signerAddress: string, counter: number) => ({
    signerAddress,
    counters: {
      primary: { rpcUrl: "https://tezos-shadownet.octez.io/", counter },
      fallback: { rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet", counter },
    },
  });
  return {
    journalRoot,
    createdAt: "2026-07-22T22:00:00.000Z",
    chainId: SHADOWNET_CHAIN_ID,
    actors: {
      creator: actor(
        bindings.actorAddress.creator,
        bindings.actorInitialCounter.creator,
      ),
      collector1: actor(
        bindings.actorAddress.collector1,
        bindings.actorInitialCounter.collector1,
      ),
      collector2: actor(
        bindings.actorAddress.collector2,
        bindings.actorInitialCounter.collector2,
      ),
    },
    dependencyAddresses: {
      gnocchi: bindings.targetAddress.gnocchi,
      rotini: bindings.targetAddress.rotini,
    },
    dependencyHashes: { gnocchiProof: HASH, rotiniProof: "b".repeat(64), tzktBaseline: "f".repeat(64) },
    artifactHashes: {
      deploymentCertificate: "9".repeat(64),
      blindController: "b".repeat(64),
      router: "c".repeat(64),
      rotiniTarget: "8".repeat(64),
      gnocchiAdapter: "d".repeat(64),
      rotiniAdapter: "e".repeat(64),
    },
  };
}

function resumeExpectedIdentity(
  input: CreateRavioliUiLiveJournalInput,
): RavioliCurrentResumeExpectedIdentity {
  return {
    actors: {
      creator: input.actors.creator.signerAddress,
      collector1: input.actors.collector1.signerAddress,
      collector2: input.actors.collector2.signerAddress,
    },
    dependencyAddresses: input.dependencyAddresses,
    dependencyHashes: input.dependencyHashes,
    artifactHashes: input.artifactHashes,
  };
}

const RESUME_IPFS = Object.freeze({
  localGatewayUrl: "http://127.0.0.1:18080/ipfs",
  publicGatewayUrl: "https://ipfs.io/ipfs",
});

async function reconcileFixtureResume(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  input: CreateRavioliUiLiveJournalInput,
): Promise<RavioliCurrentResumePlan> {
  const state = await journal.restartState();
  return reconcileRavioliCurrentResume({
    journal,
    expected: resumeExpectedIdentity(input),
    ipfs: RESUME_IPFS,
    verifier: {
      readActorCounter: async ({ actor }) => (
        input.actors[actor].counters.primary.counter
        + state.actorAppliedCounts[actor]
        + state.actorCounterOffsets[actor]
      ),
      verifyOperation: async (operation) => operation.evidence,
      verifyPin: async () => undefined,
      verifyTarget: async () => undefined,
    },
  });
}

function encodeBridgeValue(value: unknown): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) return value;
  if (Array.isArray(value)) return value.map(encodeBridgeValue);
  if (value && typeof value === "object" && typeof (value as any).entries === "function" && typeof (value as any).get === "function") {
    return {
      __pastaBridgeType: "map",
      entries: [...(value as Map<unknown, unknown>).entries()].map(([key, entry]) => [
        encodeBridgeValue(key),
        encodeBridgeValue(entry),
      ]),
    };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, encodeBridgeValue(entry)]),
  );
}

function resumeReplayRequest(
  step: RavioliCurrentResumePlan["pins"][number] | RavioliCurrentResumePlan["operations"][number],
  id: number,
): PastaUiLiveBridgeRequest {
  if (step.kind === "pin") {
    return {
      schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
      id: `resume-${id}`,
      action: step.action,
      payload: step.action === "pin_json"
        ? { fileName: step.proof.fileName, value: encodeBridgeValue(step.value) }
        : {
            dataBase64: Buffer.from(step.bytes).toString("base64"),
            fileName: step.proof.fileName,
            mimeType: step.proof.mimeType,
          },
    };
  }
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id: `resume-${id}`,
    action: step.action,
    payload: step.descriptor.kind === "originate"
      ? {
          code: encodeBridgeValue(step.descriptor.code),
          storage: encodeBridgeValue(step.descriptor.storage),
        }
      : {
          call: encodeBridgeValue(step.descriptor.call),
          sendOptions: encodeBridgeValue(step.descriptor.sendOptions),
        },
  };
}

function preparedBridgeRequest(
  operation: PastaUiLivePreparedOperation,
  id: string,
): PastaUiLiveBridgeRequest {
  return {
    schema: PASTA_UI_LIVE_BRIDGE_SCHEMA,
    id,
    action: operation.action,
    payload: operation.descriptor.kind === "originate"
      ? {
          code: encodeBridgeValue(operation.descriptor.code),
          storage: encodeBridgeValue(operation.descriptor.storage),
        }
      : operation.descriptor.kind === "call"
        ? {
            call: encodeBridgeValue(operation.descriptor.call),
            sendOptions: encodeBridgeValue(operation.descriptor.sendOptions),
          }
        : { calls: encodeBridgeValue(operation.descriptor.calls) },
  };
}

function primitivePayload(
  kinds: readonly string[],
  bindings: FixtureBindings = DEFAULT_BINDINGS,
) {
  return kinds.map((kind) => ({ [kind]: kind === "escrow"
    ? { fa2: bindings.targetAddress.gnocchi, token_id: 0, amount: 1 }
    : {
        adapter: kind === "allocated_mint"
          ? bindings.targetAddress.gnocchiAdapter
          : bindings.targetAddress.rotiniAdapter,
        resource_id: 0,
        payload_commitment: kind === "allocated_mint" ? "a".repeat(64) : null,
      } }));
}

function recipeSerial(expected: RavioliUiLiveExpectedOperation, entrypoint = expected.entrypoint): number {
  return RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter((operation) => (
    operation.globalOrdinal < expected.globalOrdinal
    && operation.entrypoint === entrypoint
    && operation.tokenId === expected.tokenId
  )).length;
}

function recipeNonce(tokenId: number, serial: number): string {
  if (tokenId === 0 && serial === 0) return RAW_NONCE;
  return createHash("sha256").update(`ravioli-test-nonce:${tokenId}:${serial}`).digest("hex");
}

function callPayload(
  expected: RavioliUiLiveExpectedOperation,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
  blindPlans: ReadonlyMap<number, BlindRevealPlan> = new Map(),
): unknown {
  const tokenId = expected.tokenId ?? 0;
  const plan = blindPlans.get(tokenId);
  switch (expected.entrypoint) {
    case "update_operators":
      return expected.tokenIds!.map((id) => ({
        add_operator: {
          owner: bindings.actorAddress.creator,
          operator: bindings.targetAddress.router,
          token_id: id,
        },
      }));
    case "create_pack":
      return {
        expected_token_id: tokenId,
        token_info: new Map([["", "697066733a2f2fproof"]]),
        config: {
          mode: expected.packMode,
          blind: expected.packMode !== 0,
          item_count: expected.primitiveKinds?.length || 1,
          max_supply: expected.maxSupply,
          committed_recipes: 0,
          finalized: false,
          cancelled: false,
          contents_uri: expected.packMode === 0 ? "697066733a2f2fproof" : null,
          manifest_uri: utf8Hex(plan?.manifestUri ?? manifestUri(tokenId)),
          child_expiry: expected.packMode === 2 ? "2026-07-29T21:11:00.000Z" : null,
          wrapper_sale_end: expected.packMode === 0 ? null : "2026-07-29T20:11:00.000Z",
          reveal_deadline: expected.packMode === 0 ? null : "2026-07-29T20:41:00.000Z",
          open_deadline: expected.packMode === 0 ? null : "2026-07-29T22:11:00.000Z",
          reveal_commitment: expected.packMode === 0
            ? null
            : plan?.revealCommitment ?? "f".repeat(64),
        },
      };
    case "commit_recipe":
      return {
        token_id: tokenId,
        nonce_commitment: ravioliUiLiveNonceCommitment(recipeNonce(tokenId, recipeSerial(expected))),
        reservations: primitivePayload(expected.primitiveKinds || [], bindings),
      };
    case "finalize_pack":
      return tokenId;
    case "mint":
      return {
        to_: bindings.actorAddress.creator,
        token_id: tokenId,
        amount: expected.maxSupply,
      };
    case "set_sale":
      return { token_id: tokenId, sale: { remaining: expected.maxSupply, active: true } };
    case "finalize_blind_pack":
      return {
        token_id: tokenId,
        sale: {
          active: true,
          seller: bindings.actorAddress.creator,
          treasury: bindings.actorAddress.creator,
          price: 1,
          remaining: expected.maxSupply,
          start: null,
          end: "2026-07-29T20:11:00.000Z",
        },
      };
    case "set_pack_contents":
      return {
        token_id: tokenId,
        contents_uri: utf8Hex(plan?.sealedUri ?? `ipfs://${CID}`),
        salt: plan?.salt ?? "1".repeat(64),
        offset: plan?.offset ?? 0,
      };
    case "buy":
      return { token_id: tokenId, amount: 1 };
    case "open_pack":
      return {
        token_id: tokenId,
        expected_claim_id: tokenId === 0 ? null : recipeSerial(expected, "open_pack"),
        nonce: recipeNonce(tokenId, recipeSerial(expected, "open_pack")),
        actions: primitivePayload(expected.primitiveKinds || [], bindings),
      };
    case "transfer":
      return [{
        from_: expected.actor === "collector1"
          ? bindings.actorAddress.collector1
          : bindings.actorAddress.collector2,
        txs: [{
          to_: expected.actor === "collector1"
            ? bindings.actorAddress.collector2
            : bindings.actorAddress.collector1,
          token_id: tokenId,
          amount: 1,
        }],
      }];
    case "refund_blind_claims":
      return {
        token_id: tokenId,
        holder: bindings.actorAddress.collector1,
        amount: 1,
        expected_claim_id: 0,
      };
    case "cancel_unrevealed_pack":
      return tokenId;
    case "withdraw_refund":
      return { destination: bindings.actorAddress.collector1, amount: 1 };
    case "create_allocation":
      return {
        target: bindings.targetAddress.gnocchi,
        token_id: expected.operationSequence === 17 ? 3 : 1,
        amount_per_open: 1,
        active: true,
      };
    case "create_resource":
      return {
        target: bindings.targetAddress.rotini,
        project_id: 3,
        active: true,
      };
    case "create_project":
      return {
        active: true,
        display_uri: "697066733a2f2fproof",
        generator_uri: "697066733a2f2fproof",
        max_per_wallet: null,
        max_supply: 3,
        name: "526176696f6c6920526f74696e69",
        output_mode: "706e67",
        price: 0,
        reservation_ttl: 3600,
        symbol: "524156",
        treasury: bindings.actorAddress.creator,
      };
    case "add_router":
      return bindings.targetAddress.router;
    case "add_minter":
      return bindings.targetAddress.gnocchiAdapter;
    case "add_pack_minter":
      return bindings.targetAddress.rotiniAdapter;
    case "recover_adapter":
      return {
        token_id: expected.tokenId,
        adapter: bindings.targetAddress.gnocchiAdapter,
        kind: expected.adapterKind,
        resource_id: expected.resourceId,
        capacity: expected.capacity,
      };
    default:
      throw new Error(`missing fixture for ${expected.entrypoint}`);
  }
}

function publicReveal(
  tokenId: number,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): Record<string, unknown> {
  const commits = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.filter((operation) => (
    operation.entrypoint === "commit_recipe" && operation.tokenId === tokenId
  ));
  const recipes = commits.map((operation, serial) => ({
    serial,
    nonce: recipeNonce(tokenId, serial),
    actions: (operation.primitiveKinds || []).map((kind) => {
      if (kind === "escrow") {
        return {
          kind: "escrow",
          fa2: bindings.targetAddress.gnocchi,
          tokenId: 0,
          amount: 1,
        };
      }
      if (kind === "allocated_mint") {
        return {
          kind: "allocated",
          adapter: bindings.targetAddress.gnocchiAdapter,
          resourceId: 0,
          payloadCommitment: "a".repeat(64),
        };
      }
      return {
        kind: "generative",
        adapter: bindings.targetAddress.rotiniAdapter,
        resourceId: 0,
        payloadCommitment: null,
      };
    }),
  }));
  const revealManifestUri = manifestUri(tokenId);
  const mode = MODE_NAMES[tokenId];
  const openKit = {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: bindings.targetAddress.router,
    tokenId,
    mode,
    manifestUri: revealManifestUri,
    blindSecurity: tokenId === 0 ? "public" : "commit-reveal-ui-hidden-chain-public",
    warning: "Public reveal fixture",
    editionPolicy: {
      requiresLimitedWrapper: tokenId === 2,
      earliestChildEnd: tokenId === 2 ? "2026-07-29T21:11:00.000Z" : null,
      wrapperSaleStart: null,
      wrapperSaleEnd: tokenId === 2 ? "2026-07-29T20:11:00.000Z" : null,
    },
    recipes,
  };
  return {
    schema: "pasta-ravioli-public-reveal@1",
    network: "shadownet",
    contract: bindings.targetAddress.router,
    tokenId,
    mode,
    manifestUri: revealManifestUri,
    maxSupply: recipes.length,
    itemCount: recipes[0].actions.length,
    openKit,
  };
}

function preparedOperation(
  expected: RavioliUiLiveExpectedOperation,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
  blindPlans: ReadonlyMap<number, BlindRevealPlan> = new Map(),
): PastaUiLivePreparedOperation {
  const common = {
    status: "PREPARED" as const,
    operationSequence: expected.operationSequence,
    timestampUtc: new Date(Date.parse("2026-07-22T22:00:00.000Z") + expected.globalOrdinal * 1_000).toISOString(),
    action: expected.action,
    chainId: SHADOWNET_CHAIN_ID,
    signerAddress: bindings.actorAddress[expected.actor],
    entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
  };
  if (expected.action === "originate") {
    return {
      ...common,
      descriptor: {
        kind: "originate",
        code: [{ prim: "parameter", args: [{ prim: expected.originRole }] }],
        storage: expected.originRole === "router"
          ? {
              administrator: bindings.actorAddress.creator,
              blind_controller: bindings.targetAddress.blindController,
              role: expected.originRole,
            }
          : {
              administrator: bindings.actorAddress.creator,
              role: expected.originRole,
            },
      },
    };
  }
  const contractAddress = bindings.targetAddress[expected.targetRole];
  return {
    ...common,
    contractAddress,
    descriptor: {
      kind: "call",
      call: {
        contractAddress,
        entrypoint: expected.entrypoint!,
        payload: callPayload(expected, bindings, blindPlans),
      },
      sendOptions: expected.entrypoint === "buy" ? { amount: tokenIdPrice(expected.tokenId!), mutez: true } : {},
    },
  };
}

function tokenIdPrice(tokenId: number): number { return tokenId === 0 ? 0 : 1; }

function operationHash(ordinal: number): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = ordinal;
  let suffix = "";
  do {
    suffix = alphabet[value % alphabet.length] + suffix;
    value = Math.floor(value / alphabet.length);
  } while (value > 0);
  return `o${"1".repeat(50 - suffix.length)}${suffix}`;
}

function submittedOperation(
  expected: RavioliUiLiveExpectedOperation,
  prepared: PastaUiLivePreparedOperation,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): PastaUiLiveSubmittedOperation {
  return {
    ...prepared,
    status: "SUBMITTED",
    timestampUtc: new Date(Date.parse(prepared.timestampUtc) + 100).toISOString(),
    operationHash: operationHash(expected.globalOrdinal),
    ...(expected.action === "originate"
      ? { contractAddress: bindings.targetAddress[expected.targetRole] }
      : {}),
  };
}

function appliedEvidence(
  expected: RavioliUiLiveExpectedOperation,
  submitted: PastaUiLiveSubmittedOperation,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
  counterOffset = 0,
): Record<string, unknown> {
  return {
    status: "applied",
    operationHash: submitted.operationHash,
    counter: bindings.actorInitialCounter[expected.actor]
      + expected.operationSequence
      + counterOffset,
    level: 4_300_000 + expected.globalOrdinal,
    timestamp: new Date(Date.parse(submitted.timestampUtc) + 50).toISOString(),
    signerAddress: bindings.actorAddress[expected.actor],
    contractAddress: bindings.targetAddress[expected.targetRole],
    entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
    explorerUrl: `https://shadownet.tzkt.io/${submitted.operationHash}`,
  };
}

function externalCounterOperation(input: {
  actor: RavioliUiLiveJournalActor;
  ordinal: number;
  counter: number;
  action?: "originate" | "call";
  entrypoint?: string;
}): Record<string, unknown> {
  const hash = operationHash(input.ordinal);
  const action = input.action ?? "call";
  return {
    action,
    status: "applied",
    operationHash: hash,
    counter: input.counter,
    level: 4_400_000 + input.ordinal,
    timestamp: new Date(Date.parse("2026-07-24T20:14:00.000Z") + input.ordinal * 1_000).toISOString(),
    signerAddress: ACTOR_ADDRESS[input.actor],
    contractAddress: MACARONI_RECOVERY,
    entrypoints: action === "originate" ? [] : [input.entrypoint ?? "mint"],
    explorerUrl: `https://shadownet.tzkt.io/${hash}`,
  };
}

async function allFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, name.name);
      if (name.isDirectory()) await walk(absolute);
      else output.push(absolute);
    }
  };
  await walk(root);
  return output.sort();
}

function setContentsUri(prepared: PastaUiLivePreparedOperation, entrypoint: "create_pack" | "set_pack_contents", uri: string): void {
  assert.equal(prepared.descriptor.kind, "call");
  if (prepared.descriptor.kind !== "call") return;
  const payload = prepared.descriptor.call.payload as any;
  if (entrypoint === "create_pack") payload.config.contents_uri = Buffer.from(uri, "utf8").toString("hex");
  else payload.contents_uri = Buffer.from(uri, "utf8").toString("hex");
}

async function appendOrdinaryPin(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  ordinal: number,
): Promise<void> {
  const fileName = `ravioli-fixture-artifact-${String(ordinal).padStart(2, "0")}.json`;
  const bytes = deterministicJsonBytes({
    schema: "pasta-ravioli-journal-fixture-artifact@1",
    ordinal,
    label: `artifact-${ordinal}`,
  });
  const cid = syntheticCid(`ordinary-${ordinal}`);
  await journal.beforePin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
  });
  await journal.appendPin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedByteLength: bytes.byteLength,
    metadata: {
      cid,
      uri: `ipfs://${cid}`,
      publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    },
  });
}

async function appendSealedRevealPin(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  plan: BlindRevealPlan,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): Promise<void> {
  const bytes = sealedRevealBytes(plan, bindings);
  const cid = plan.sealedUri.slice("ipfs://".length);
  const fileName = `ravioli-sealed-reveal-${plan.tokenId}.json`;
  await journal.beforePin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
  });
  await journal.appendPin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedByteLength: bytes.byteLength,
    metadata: {
      cid,
      uri: plan.sealedUri,
      publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    },
  });
}

async function appendPublicRevealPin(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  tokenId: number,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
): Promise<string> {
  const bytes = deterministicJsonBytes(publicReveal(tokenId, bindings));
  const cid = syntheticCid(`public-${tokenId}`);
  const uri = `ipfs://${cid}`;
  const fileName = `ravioli-public-reveal-${tokenId}.json`;
  await journal.beforePin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
  });
  await journal.appendPin({
    actor: "creator",
    fileName,
    mimeType: "application/json",
    bytes,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedByteLength: bytes.byteLength,
    metadata: {
      cid,
      uri,
      publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    },
  });
  return uri;
}

function alternateFreshBindings(): FixtureBindings {
  return {
    actorAddress: { ...ACTOR_ADDRESS },
    actorInitialCounter: { ...ACTOR_INITIAL_COUNTER },
    targetAddress: {
      ...TARGET_ADDRESS,
      gnocchiAdapter: ALTERNATE_GNOCCHI_ADAPTER,
    },
  };
}

async function historicalBindings(
  journalRoot: string,
): Promise<FixtureBindings> {
  const intent = JSON.parse(
    await readFile(path.join(journalRoot, "intent.json"), "utf8"),
  ) as any;
  const submittedAddresses = new Map<number, string>();
  for (const name of await readdir(path.join(journalRoot, "events"))) {
    const event = JSON.parse(
      await readFile(path.join(journalRoot, "events", name), "utf8"),
    ) as any;
    if (
      event.phase === "SUBMITTED"
      && Number.isInteger(event.globalOrdinal)
      && typeof event.contractAddress === "string"
    ) {
      submittedAddresses.set(event.globalOrdinal, event.contractAddress);
    }
  }
  assert.ok(submittedAddresses.get(1), "historical controller binding missing");
  assert.ok(submittedAddresses.get(2), "historical router binding missing");
  assert.ok(submittedAddresses.get(17), "historical Gnocchi adapter binding missing");
  return {
    actorAddress: {
      creator: intent.actors.creator.signerAddress,
      collector1: intent.actors.collector1.signerAddress,
      collector2: intent.actors.collector2.signerAddress,
    },
    actorInitialCounter: {
      creator: intent.actors.creator.counters.primary.counter,
      collector1: intent.actors.collector1.counters.primary.counter,
      collector2: intent.actors.collector2.counters.primary.counter,
    },
    targetAddress: {
      blindController: submittedAddresses.get(1)!,
      router: submittedAddresses.get(2)!,
      gnocchi: intent.dependencyAddresses.gnocchi,
      gnocchiAdapter: submittedAddresses.get(17)!,
      rotini: intent.dependencyAddresses.rotini,
      rotiniAdapter: HISTORICAL_CONTINUATION_ROTINI_ADAPTER,
    },
  };
}

async function historicalBlindPlans(): Promise<Map<number, BlindRevealPlan>> {
  const plans = new Map<number, BlindRevealPlan>();
  for (const tokenId of [1, 2]) {
    const kit = JSON.parse(
      await readFile(
        path.join(HISTORICAL_OPEN_KITS, `ravioli-open-kit-${tokenId}.json`),
        "utf8",
      ),
    ) as any;
    const sealed = kit.sealedReveal;
    assert.equal(sealed?.schema, "pasta-ravioli-sealed-reveal-reference@1");
    assert.equal(typeof sealed.contentsUri, "string");
    assert.match(sealed.salt, /^[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(sealed.offset), true);
    plans.set(tokenId, Object.freeze({
      tokenId,
      manifestUri: kit.manifestUri,
      sealedUri: sealed.contentsUri,
      salt: sealed.salt,
      offset: sealed.offset,
      revealCommitment: revealCommitment(
        sealed.contentsUri,
        sealed.salt,
        sealed.offset,
      ),
    }));
  }
  for (const tokenId of [3, 4, 5]) {
    plans.set(tokenId, blindRevealPlan(tokenId));
  }
  return plans;
}

async function applyExpected(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  expected: RavioliUiLiveExpectedOperation,
  mutate?: (prepared: PastaUiLivePreparedOperation) => void,
  bindings: FixtureBindings = DEFAULT_BINDINGS,
  blindPlans: ReadonlyMap<number, BlindRevealPlan> = new Map(),
): Promise<void> {
  const prepared = preparedOperation(expected, bindings, blindPlans);
  mutate?.(prepared);
  await journal.beforeOperationSubmit(expected.actor, prepared);
  const submitted = submittedOperation(expected, prepared, bindings);
  await journal.onOperationSubmitted(expected.actor, submitted);
  await journal.appendApplied({
    actor: expected.actor,
    operationSequence: expected.operationSequence,
    operationHash: submitted.operationHash,
    contractAddress: bindings.targetAddress[expected.targetRole],
    entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
    evidence: appliedEvidence(
      expected,
      submitted,
      bindings,
      journal.getCounterOffset(expected.actor),
    ),
  });
}

async function advanceUntil(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
  predicate: (expected: RavioliUiLiveExpectedOperation) => boolean,
): Promise<RavioliUiLiveExpectedOperation> {
  const plans = new Map<number, BlindRevealPlan>(
    [1, 2, 3, 4, 5].map((tokenId) => [tokenId, blindRevealPlan(tokenId)]),
  );
  for (const expected of RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX) {
    if (expected.globalOrdinal <= journal.getCompletedOperationCount()) continue;
    if (predicate(expected)) return expected;
    if (
      expected.entrypoint === "create_pack"
      && expected.tokenId !== undefined
      && expected.tokenId >= 1
    ) {
      await appendSealedRevealPin(journal, plans.get(expected.tokenId)!);
    }
    const revealTokenId =
      expected.entrypoint === "create_pack" && expected.tokenId === 0
        ? 0
        : undefined;
    if (revealTokenId === undefined) {
      await applyExpected(
        journal,
        expected,
        undefined,
        DEFAULT_BINDINGS,
        plans,
      );
      continue;
    }
    const bytes = deterministicJsonBytes(publicReveal(revealTokenId));
    await journal.beforePin({
      actor: "creator",
      fileName: `ravioli-public-reveal-${revealTokenId}.json`,
      mimeType: "application/json",
      bytes,
    });
    await journal.appendPin({
      actor: "creator",
      fileName: `ravioli-public-reveal-${revealTokenId}.json`,
      mimeType: "application/json",
      bytes,
      metadata: { cid: CID, uri: `ipfs://${CID}`, publicGatewayUrl: `https://ipfs.io/ipfs/${CID}` },
    });
    await applyExpected(journal, expected, (prepared) => setContentsUri(
      prepared,
      expected.entrypoint as "create_pack" | "set_pack_contents",
      `ipfs://${CID}`,
    ), DEFAULT_BINDINGS, plans);
  }
  throw new Error("fixture did not reach expected Ravioli operation");
}

async function createSyntheticLegacyJournal(
  journalRoot: string,
): Promise<Awaited<ReturnType<typeof createRavioliUiLiveJournal>>> {
  const created = await createRavioliUiLiveJournal(inputFor(journalRoot));
  const { journalId: _effectiveJournalId, ...effectiveCore } =
    created.intent as any;
  const matrix = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX;
  const legacyCore = {
    ...effectiveCore,
    schema: RAVIOLI_UI_LIVE_JOURNAL_INTENT_SCHEMA,
    matrix,
    matrixSha256: createHash("sha256")
      .update(deterministicJsonBytes(matrix))
      .digest("hex"),
  };
  const intent = {
    ...legacyCore,
    journalId: createHash("sha256")
      .update(deterministicJsonBytes(legacyCore))
      .digest("hex"),
  };
  await writeFile(
    path.join(journalRoot, "intent.json"),
    deterministicJsonBytes(intent),
  );
  return openRavioliUiLiveJournal(journalRoot);
}

async function advanceSyntheticLegacyJournalToEvent86(
  journal: Awaited<ReturnType<typeof createRavioliUiLiveJournal>>,
): Promise<void> {
  const plans = new Map<number, BlindRevealPlan>(
    [1, 2].map((tokenId) => [tokenId, blindRevealPlan(tokenId)]),
  );
  for (const ordinal of [1, 2, 3]) await appendOrdinaryPin(journal, ordinal);
  let publicRevealUri = "";
  for (const expected of RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX.slice(0, 23)) {
    if (expected.globalOrdinal === 4) {
      await appendOrdinaryPin(journal, 4);
      publicRevealUri = await appendPublicRevealPin(journal, 0);
      await appendOrdinaryPin(journal, 6);
    } else if (expected.globalOrdinal === 9) {
      await appendOrdinaryPin(journal, 7);
    } else if (expected.globalOrdinal === 10) {
      await appendOrdinaryPin(journal, 8);
      await appendOrdinaryPin(journal, 9);
      await appendSealedRevealPin(journal, plans.get(1)!);
    } else if (expected.globalOrdinal === 17) {
      await appendOrdinaryPin(journal, 11);
      await appendOrdinaryPin(journal, 12);
    } else if (expected.globalOrdinal === 21) {
      await appendOrdinaryPin(journal, 13);
      await appendOrdinaryPin(journal, 14);
      await appendSealedRevealPin(journal, plans.get(2)!);
    }
    await applyExpected(
      journal,
      expected,
      expected.globalOrdinal === 4
        ? (prepared) => setContentsUri(
            prepared,
            "create_pack",
            publicRevealUri,
          )
        : undefined,
      DEFAULT_BINDINGS,
      plans,
    );
  }
  assert.equal(journal.getCompletedOperationCount(), 23);
  assert.equal(journal.getPinCount(), 15);
  assert.equal(journal.getEventCount(), 85);
  await journal.appendCounterAdvance({
    recoveryId: "7".repeat(64),
    semanticBoundary: 23,
    recoveryContractAddress: MACARONI_RECOVERY,
    advances: [
      {
        actor: "creator",
        operations: [
          externalCounterOperation({
            actor: "creator",
            ordinal: 900,
            counter: ACTOR_INITIAL_COUNTER.creator + 21,
            action: "originate",
          }),
          externalCounterOperation({
            actor: "creator",
            ordinal: 901,
            counter: ACTOR_INITIAL_COUNTER.creator + 22,
            entrypoint: "add_tokens_v2",
          }),
          externalCounterOperation({
            actor: "creator",
            ordinal: 902,
            counter: ACTOR_INITIAL_COUNTER.creator + 23,
            entrypoint: "set_stages",
          }),
        ] as any,
      },
      {
        actor: "collector1",
        operations: [externalCounterOperation({
          actor: "collector1",
          ordinal: 903,
          counter: ACTOR_INITIAL_COUNTER.collector1 + 3,
          entrypoint: "mint",
        })] as any,
      },
    ],
    recordedAt: "2026-07-24T20:16:00.000Z",
  });
  assert.equal(journal.getEventCount(), 86);
  assert.equal(journal.hasCounterAdvance(), true);
}

async function realPackSpecs(): Promise<Array<{ mode: number; editions: number; primitives: string[] }>> {
  const sourcePath = new URL("./shadownet-ravioli-ui-live.ts", import.meta.url);
  const sourceText = await readFile(sourcePath, "utf8");
  const source = ts.createSourceFile(sourcePath.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations]);
  const canonicalDeclaration = declarations
    .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "RAVIOLI_UI_LIVE_PACK_SPECS");
  assert.ok(canonicalDeclaration?.initializer, "real Ravioli runner must declare RAVIOLI_UI_LIVE_PACK_SPECS");
  const initializer = ts.isAsExpression(canonicalDeclaration.initializer)
    ? canonicalDeclaration.initializer.expression
    : canonicalDeclaration.initializer;
  assert.ok(
    ts.isArrayLiteralExpression(initializer),
    "real Ravioli RAVIOLI_UI_LIVE_PACK_SPECS must remain an array literal",
  );
  const aliasDeclaration = declarations
    .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "PACK_SPECS");
  assert.ok(aliasDeclaration?.initializer, "real Ravioli runner must declare PACK_SPECS");
  assert.ok(
    ts.isIdentifier(aliasDeclaration.initializer)
      && aliasDeclaration.initializer.text === "RAVIOLI_UI_LIVE_PACK_SPECS",
    "real Ravioli PACK_SPECS must alias RAVIOLI_UI_LIVE_PACK_SPECS",
  );

  const property = (element: ts.ObjectLiteralExpression, name: string): ts.Expression => {
    const found = element.properties.find((candidate): candidate is ts.PropertyAssignment => (
      ts.isPropertyAssignment(candidate)
      && ((ts.isIdentifier(candidate.name) || ts.isStringLiteral(candidate.name)) && candidate.name.text === name)
    ));
    assert.ok(found, `real Ravioli PACK_SPECS entry must declare ${name}`);
    return found.initializer;
  };

  return initializer.elements.map((element, index) => {
    assert.ok(ts.isObjectLiteralExpression(element), `real Ravioli PACK_SPECS[${index}] must remain an object literal`);
    const mode = property(element, "mode");
    const editions = property(element, "editions");
    const primitives = property(element, "primitives");
    assert.ok(ts.isNumericLiteral(mode), `real Ravioli PACK_SPECS[${index}].mode must remain numeric`);
    assert.ok(ts.isNumericLiteral(editions), `real Ravioli PACK_SPECS[${index}].editions must remain numeric`);
    assert.ok(ts.isArrayLiteralExpression(primitives), `real Ravioli PACK_SPECS[${index}].primitives must remain an array literal`);
    return {
      mode: Number(mode.text),
      editions: Number(editions.text),
      primitives: primitives.elements.map((primitive, primitiveIndex) => {
        assert.ok(ts.isStringLiteral(primitive), `real Ravioli PACK_SPECS[${index}].primitives[${primitiveIndex}] must remain a string literal`);
        return primitive.text;
      }),
    };
  });
}

test("semantic Ravioli journal matrix derives the exact v3 controller/router choreography", () => {
  const matrix = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX;
  const effective = RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX;
  assert.equal(matrix.length, RAVIOLI_UI_LIVE_BASE_EXPECTED_COUNTS.total);
  assert.equal(matrix.length, 66);
  assert.equal(effective.length, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total);
  assert.equal(effective.length, 67);
  assert.deepEqual(
    Object.fromEntries(["creator", "collector1", "collector2"].map((actor) => [actor, matrix.filter((operation) => operation.actor === actor).length])),
    RAVIOLI_UI_LIVE_BASE_EXPECTED_COUNTS.actors,
  );
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.originations, 4);
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.calls, 63);
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.buys, 7);
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.opens, 6);
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.transfers, 2);
  assert.equal(RAVIOLI_UI_LIVE_EXPECTED_COUNTS.refunds, 1);
  assert.equal(matrix[0].originRole, "blindController");
  assert.equal(matrix[1].originRole, "router");
  assert.equal(matrix.filter((operation) => operation.entrypoint === "commit_recipe").length, 8);
  assert.ok(matrix.some((operation) => operation.entrypoint === "finalize_blind_pack"));
  assert.ok(!matrix.some((operation) => operation.entrypoint === "finalize_le_pack"));
  assert.deepEqual(
    effective.filter((operation) => operation.proofPartition === "withheld-reveal-refund").map((operation) => operation.entrypoint || operation.originRole),
    [
      "add_minter",
      "create_allocation",
      "add_router",
      "create_pack",
      "commit_recipe",
      "commit_recipe",
      "finalize_blind_pack",
      "buy",
      "refund_blind_claims",
      "cancel_unrevealed_pack",
      "withdraw_refund",
      "recover_adapter",
    ],
  );
  assert.deepEqual(effective.at(-1), {
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
  assert.equal(RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.baseOperationCount, 66);
  assert.equal(RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION.semanticBoundary, 23);
  assert.equal(ravioliUiLiveNonceCommitment("a".repeat(64)), "046c0d987075db8217087bae19e9f753305890fc6772908c57f07878211cc8cb");
});

test("journal commit and collector-open action primitives match the real Ravioli PACK_SPECS", async () => {
  const specs = await realPackSpecs();
  assert.equal(specs.length, 5);
  for (const spec of specs) {
    const expectedRecipes = Array.from({ length: spec.editions }, () => spec.primitives);
    const committedRecipes = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX
      .filter((operation) => operation.entrypoint === "commit_recipe" && operation.tokenId === spec.mode)
      .map((operation) => [...(operation.primitiveKinds || [])]);
    const collectorOpens = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX
      .filter((operation) => operation.entrypoint === "open_pack" && operation.tokenId === spec.mode)
      .map((operation) => [...(operation.primitiveKinds || [])]);
    assert.deepEqual(committedRecipes, expectedRecipes, `mode ${spec.mode} durable commit recipes drifted from PACK_SPECS`);
    const expectedOpenedRecipes = expectedRecipes.slice(0, spec.soldEditions);
    assert.deepEqual(collectorOpens, expectedOpenedRecipes, `mode ${spec.mode} collector opens drifted from PACK_SPECS`);
  }
});

test("journal creation is nonrecursive and source-enforces POSIX parent/root directory fsync", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-dirs-"));
  try {
    await assert.rejects(
      createRavioliUiLiveJournal(inputFor(path.join(parent, "missing-parent", "journal"))),
      /ENOENT/,
    );
    const source = await readFile(new URL("./shadownet-ravioli-ui-live-journal.ts", import.meta.url), "utf8");
    assert.match(source, /await mkdir\(journalRoot\);[\s\S]*?parentHandle = await open\(path\.dirname\(journalRoot\), "r"\);[\s\S]*?await parentHandle\.sync\(\)/);
    assert.match(source, /await mkdir\(path\.join\(journalRoot, "events"\)\);[\s\S]*?await mkdir\(path\.join\(journalRoot, "pins"\)\);[\s\S]*?rootHandle = await open\(journalRoot, "r"\);[\s\S]*?await rootHandle\.sync\(\)/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("production output claim initializes an absent Ravioli tree for the real journal and fails closed on races", async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), "ravioli-fresh-output-"));
  const appRoot = path.join(runRoot, "ravioli");
  try {
    const claimed = await claimFreshRavioliUiLiveOutputDirectory(appRoot);
    assert.deepEqual(claimed, {
      appRoot,
      artifactsRoot: path.join(appRoot, "artifacts"),
    });
    const [appInfo, artifactsInfo] = await Promise.all([
      lstat(appRoot),
      lstat(path.join(appRoot, "artifacts")),
    ]);
    assert.equal(appInfo.isDirectory() && !appInfo.isSymbolicLink(), true);
    assert.equal(artifactsInfo.isDirectory() && !artifactsInfo.isSymbolicLink(), true);

    const created = await createRavioliUiLiveJournal(inputFor(path.join(appRoot, "artifacts", "journal")));
    const journalNames = (await readdir(path.join(appRoot, "artifacts", "journal"))).sort();
    assert.deepEqual(journalNames, ["events", "intent.json", "pins"]);
    const { tzktBaseline: _tzktBaseline, ...stableDependencyHashes } = created.intent.dependencyHashes;
    const reopened = await openExactRavioliUiLivePrewriteJournal({
      journalRoot: created.journalRoot,
      expected: {
        actors: created.intent.actors,
        dependencyAddresses: created.intent.dependencyAddresses,
        dependencyHashes: stableDependencyHashes,
        artifactHashes: created.intent.artifactHashes,
      },
    });
    assert.equal(reopened.getCompletedOperationCount(), 0);
    await assert.rejects(
      openExactRavioliUiLivePrewriteJournal({
        journalRoot: created.journalRoot,
        expected: {
          actors: {
            ...created.intent.actors,
            creator: {
              ...created.intent.actors.creator,
              counters: {
                ...created.intent.actors.creator.counters,
                primary: {
                  ...created.intent.actors.creator.counters.primary,
                  counter: created.intent.actors.creator.counters.primary.counter + 1,
                },
              },
            },
          },
          dependencyAddresses: created.intent.dependencyAddresses,
          dependencyHashes: stableDependencyHashes,
          artifactHashes: created.intent.artifactHashes,
        },
      }),
      /signer\/counter intent drift/,
    );
    await assert.rejects(
      claimFreshRavioliUiLiveOutputDirectory(appRoot),
      /already exists; refusing overwrite/,
    );

    if (process.platform !== "win32") {
      const realRunRoot = path.join(runRoot, "real-run-root");
      const linkedRunRoot = path.join(runRoot, "linked-run-root");
      await mkdir(realRunRoot);
      await symlink(realRunRoot, linkedRunRoot, "dir");
      await assert.rejects(
        claimFreshRavioliUiLiveOutputDirectory(path.join(linkedRunRoot, "ravioli")),
        /real, non-symbolic-link directory/,
      );
      await assert.rejects(lstat(path.join(realRunRoot, "ravioli")), /ENOENT/);
    }
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("fresh effective intent applies 67 operations and 34 pins with a dynamically bound alternate Gnocchi adapter, finalizes, and reopens", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-complete-"));
  const root = path.join(parent, "journal");
  try {
    const bindings = alternateFreshBindings();
    const journalInput = inputFor(root, bindings);
    const plans = new Map<number, BlindRevealPlan>(
      [1, 2, 3, 4, 5].map((tokenId) => [tokenId, blindRevealPlan(tokenId)]),
    );
    const journal = await createRavioliUiLiveJournal(journalInput);
    const resumePlans = new Map<number, RavioliCurrentResumePlan>();
    resumePlans.set(0, await reconcileFixtureResume(journal, journalInput));
    await assert.rejects(createRavioliUiLiveJournal(inputFor(root)), /EEXIST/);
    assert.equal(journal.hasEffectivePlan(), true);
    assert.equal(journal.hasPlanExtension(), false);

    await appendOrdinaryPin(journal, 1);
    for (const expected of EFFECTIVE_MATRIX) {
      if (expected.globalOrdinal === 3) {
        for (let ordinal = 2; ordinal <= 28; ordinal += 1) {
          await appendOrdinaryPin(journal, ordinal);
        }
        assert.equal(journal.getPinCount(), 28);
      }
      if (
        expected.entrypoint === "create_pack"
        && expected.tokenId !== undefined
        && expected.tokenId >= 1
      ) {
        await appendSealedRevealPin(
          journal,
          plans.get(expected.tokenId)!,
          bindings,
        );
      }
      let publicRevealUri = "";
      if (
        expected.entrypoint === "create_pack"
        && expected.tokenId === 0
      ) {
        publicRevealUri = await appendPublicRevealPin(journal, 0, bindings);
      }
      await applyExpected(
        journal,
        expected,
        publicRevealUri
          ? (prepared) => setContentsUri(
              prepared,
              "create_pack",
              publicRevealUri,
            )
          : undefined,
        bindings,
        plans,
      );
      const restartState = await journal.restartState();
      assert.equal(restartState.completedOperationCount, expected.globalOrdinal);
      assert.equal(restartState.pendingOperation, null);
      assert.deepEqual(
        restartState.actorAppliedCounts,
        Object.fromEntries(["creator", "collector1", "collector2"].map((actor) => [
          actor,
          EFFECTIVE_MATRIX.slice(0, expected.globalOrdinal).filter((operation) => operation.actor === actor).length,
        ])),
      );
      resumePlans.set(expected.globalOrdinal, await reconcileFixtureResume(journal, journalInput));
    }
    assert.equal(journal.getCompletedOperationCount(), 67);
    assert.equal(journal.getPinCount(), 34);
    assert.equal(journal.hasEffectivePlan(), true);
    for (const boundary of Array.from({ length: 68 }, (_, index) => index)) {
      const plan = resumePlans.get(boundary);
      assert.ok(plan, `resume plan ${boundary} is missing`);
      assert.equal(plan.completedOperationCount, boundary);
      assert.equal(plan.operations.length, boundary);
      assert.equal(plan.nextOperation?.globalOrdinal ?? null, boundary < 67 ? boundary + 1 : null);
      assert.equal(
        plan.classification,
        boundary < 67 ? "CURRENT_SAFE_PREFIX" : "CURRENT_TERMINAL",
      );
      const delegated = { creator: 0, collector1: 0, collector2: 0 };
      const coordinator = createRavioliCurrentResumeCoordinator({
        plan,
        delegates: Object.fromEntries(
          (["creator", "collector1", "collector2"] as const).map((actor) => [
            actor,
            async () => {
              delegated[actor] += 1;
              return { delegated: actor };
            },
          ]),
        ) as Record<
          RavioliUiLiveJournalActor,
          (request: PastaUiLiveBridgeRequest) => Promise<unknown>
        >,
      });
      let requestId = 0;
      for (const actor of ["creator", "collector1", "collector2"] as const) {
        const steps = [
          ...plan.pins.filter((pin) => pin.actor === actor),
          ...plan.operations.filter((operation) => operation.actor === actor),
        ].sort((left, right) => left.eventIndex - right.eventIndex);
        for (const step of steps) {
          const response = await coordinator.handles[actor](resumeReplayRequest(step, ++requestId));
          if (step.kind === "pin") assert.deepEqual(response, { pin: step.proof });
          else assert.equal((response as any).operationHash, step.operationHash);
        }
      }
      assert.equal(coordinator.isReplayComplete(), true, `resume boundary ${boundary} did not consume its prefix`);
      assert.equal(coordinator.getCompletedReplayStepCount(), plan.pins.length + plan.operations.length);
      assert.deepEqual(delegated, { creator: 0, collector1: 0, collector2: 0 });
      if (plan.nextOperation) {
        const next = preparedOperation(plan.nextOperation, bindings, plans);
        await coordinator.handles[plan.nextOperation.actor](
          preparedBridgeRequest(next, `continue-${boundary}`),
        );
        assert.equal(delegated[plan.nextOperation.actor], 1);
        assert.equal(coordinator.continuationStarted(), true);
      } else {
        const first = plan.operations[0];
        assert.ok(first);
        await assert.rejects(
          coordinator.handles[first.actor](resumeReplayRequest(first, ++requestId)),
          /duplicate recovered side effect|terminal journal/,
        );
      }
    }

    const completionTime = "2026-07-23T00:00:00.000Z";
    const preview = await journal.previewFinalization(completionTime);
    await assert.rejects(lstat(path.join(root, "final.json")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
    assert.equal(preview.finalization.finalSha256, createHash("sha256").update(preview.finalBytes).digest("hex"));
    assert.equal(preview.finalization.artifacts.at(-1)?.path, "pins/000034.bin");
    assert.ok(preview.finalization.artifacts.some((artifact) => artifact.path === "final.json"));

    const finalized = await journal.finalize(completionTime);
    assert.deepEqual(finalized, preview.finalization);
    assert.deepEqual(finalized.counts, {
      actors: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.actors,
      originations: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.originations,
      calls: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.calls,
      buys: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.buys,
      opens: 6,
      transfers: 2,
      refunds: 1,
      pins: 34,
      events: journal.getEventCount(),
    });
    assert.equal(finalized.counts.actors.creator, 49);
    assert.equal(finalized.counts.actors.collector1, 11);
    assert.equal(finalized.counts.actors.collector2, 7);
    assert.equal(finalized.counts.calls, 63);
    assert.equal(finalized.artifacts.length, 2 + journal.getEventCount() + 34);
    const terminalResume = await reconcileFixtureResume(journal, journalInput);
    assert.equal(terminalResume.classification, "CURRENT_TERMINAL");
    assert.equal(terminalResume.completedOperationCount, 67);
    assert.deepEqual(finalized.artifacts.map((artifact) => artifact.path), (await allFiles(root)).map((file) => path.relative(root, file).split(path.sep).join("/")));
    for (const file of await allFiles(root)) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (!relative.startsWith("pins/")) {
        assert.equal((await readFile(file)).includes(Buffer.from(RAW_NONCE, "utf8")), false, `raw nonce leaked into ${file}`);
      }
    }
    const allEventText = (await Promise.all((await readdir(path.join(root, "events"))).map((name) => readFile(path.join(root, "events", name), "utf8")))).join("\n");
    assert.equal(allEventText.includes(RAW_NONCE), false);
    assert.match(allEventText, /"algorithm":"blake2b-256"/);
    assert.match(allEventText, new RegExp(ravioliUiLiveNonceCommitment(RAW_NONCE)));

    const reopened = await openRavioliUiLiveJournal(root);
    assert.equal(reopened.isFinalized(), true);
    assert.equal(reopened.getCompletedOperationCount(), RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total);
    assert.equal(reopened.getPinCount(), 34);
    assert.equal(reopened.hasEffectivePlan(), true);
    assert.equal(reopened.hasPlanExtension(), false);
    assert.deepEqual(await reopened.inventory(), finalized.artifacts);
    await assert.rejects(reopened.appendPin({ actor: "creator", fileName: "late.bin", mimeType: "application/octet-stream", bytes: Uint8Array.of(1) }), /already finalized/);

    const recoverEventName = (await readdir(path.join(root, "events")))
      .sort()
      .find((name) => name.endsWith("-prepared-creator.json")
        && name.startsWith(String(journal.getEventCount() - 2).padStart(6, "0")));
    assert.ok(recoverEventName, "recover_adapter PREPARED event missing");
    const recoverEvent = JSON.parse(
      await readFile(path.join(root, "events", recoverEventName), "utf8"),
    ) as any;
    assert.equal(recoverEvent.globalOrdinal, 67);
    assert.equal(
      recoverEvent.operation.descriptor.call.payload.adapter,
      ALTERNATE_GNOCCHI_ADAPTER,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("current-generation operation-9 checkpoint replays ten pins and nine writes before creator create_pack", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-current-op9-boundary-"));
  const root = path.join(parent, "journal");
  try {
    const bindings = DEFAULT_BINDINGS;
    const journalInput = inputFor(root, bindings);
    const journal = await createRavioliUiLiveJournal(journalInput);
    const blindPlans = new Map<number, BlindRevealPlan>([[1, blindRevealPlan(1)]]);

    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      await appendOrdinaryPin(journal, ordinal);
    }
    for (const expected of EFFECTIVE_MATRIX.slice(0, 3)) {
      await applyExpected(journal, expected, undefined, bindings, blindPlans);
    }

    await appendOrdinaryPin(journal, 4);
    await appendOrdinaryPin(journal, 5);
    const publicRevealUri = await appendPublicRevealPin(journal, 0, bindings);
    await applyExpected(
      journal,
      EFFECTIVE_MATRIX[3],
      (prepared) => setContentsUri(prepared, "create_pack", publicRevealUri),
      bindings,
      blindPlans,
    );
    for (const expected of EFFECTIVE_MATRIX.slice(4, 8)) {
      await applyExpected(journal, expected, undefined, bindings, blindPlans);
    }

    await appendOrdinaryPin(journal, 7);
    await applyExpected(journal, EFFECTIVE_MATRIX[8], undefined, bindings, blindPlans);
    await appendOrdinaryPin(journal, 8);
    await appendSealedRevealPin(journal, blindPlans.get(1)!, bindings);
    await appendOrdinaryPin(journal, 10);

    const plan = await reconcileFixtureResume(journal, journalInput);
    assert.equal(plan.classification, "CURRENT_SAFE_PREFIX");
    assert.equal(plan.completedOperationCount, 9);
    assert.deepEqual(plan.operations.map((operation) => operation.expected.globalOrdinal), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(plan.pins.map((pin) => pin.pinSequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(plan.nextOperation?.globalOrdinal, 10);
    assert.equal(plan.nextOperation?.actor, "creator");
    assert.equal(plan.nextOperation?.action, "call");
    assert.equal(plan.nextOperation?.entrypoint, "create_pack");

    const createCoordinator = () => {
      const delegated = { creator: 0, collector1: 0, collector2: 0 };
      const coordinator = createRavioliCurrentResumeCoordinator({
        plan,
        delegates: Object.fromEntries(
          (["creator", "collector1", "collector2"] as const).map((actor) => [
            actor,
            async () => {
              delegated[actor] += 1;
              return { delegated: actor };
            },
          ]),
        ) as Record<
          RavioliUiLiveJournalActor,
          (request: PastaUiLiveBridgeRequest) => Promise<unknown>
        >,
      });
      return { coordinator, delegated };
    };
    const creatorSteps = [
      ...plan.pins.filter((pin) => pin.actor === "creator"),
      ...plan.operations.filter((operation) => operation.actor === "creator"),
    ].sort((left, right) => left.eventIndex - right.eventIndex);
    assert.equal(creatorSteps.length, 19);

    const exact = createCoordinator();
    let requestId = 0;
    for (const step of creatorSteps) {
      await exact.coordinator.handles.creator(resumeReplayRequest(step, ++requestId));
    }
    assert.equal(exact.coordinator.isReplayComplete(), true);
    assert.equal(exact.coordinator.getCompletedReplayStepCount(), 19);
    assert.deepEqual(exact.delegated, { creator: 0, collector1: 0, collector2: 0 });

    const next = plan.nextOperation;
    assert.ok(next);
    const nextPrepared = preparedOperation(next, bindings, blindPlans);
    assert.equal(nextPrepared.descriptor.kind, "call");
    if (nextPrepared.descriptor.kind === "call") {
      assert.equal(nextPrepared.descriptor.call.entrypoint, "create_pack");
    }
    await exact.coordinator.handles.creator(
      preparedBridgeRequest(nextPrepared, "operation-10-continuation"),
    );
    assert.deepEqual(exact.delegated, { creator: 1, collector1: 0, collector2: 0 });
    assert.equal(exact.coordinator.continuationStarted(), true);

    const wrongActorContinuation = createCoordinator();
    for (const [index, step] of creatorSteps.entries()) {
      await wrongActorContinuation.coordinator.handles.creator(
        resumeReplayRequest(step, index + 1),
      );
    }
    await assert.rejects(
      wrongActorContinuation.coordinator.handles.collector1(
        preparedBridgeRequest(nextPrepared, "wrong-operation-10-actor"),
      ),
      /first continuation mutation differs from global operation 10/,
    );
    assert.deepEqual(wrongActorContinuation.delegated, { creator: 0, collector1: 0, collector2: 0 });

    const wrongEntrypointContinuation = createCoordinator();
    for (const [index, step] of creatorSteps.entries()) {
      await wrongEntrypointContinuation.coordinator.handles.creator(
        resumeReplayRequest(step, index + 1),
      );
    }
    const wrongEntrypoint = structuredClone(
      preparedBridgeRequest(nextPrepared, "wrong-operation-10-entrypoint"),
    );
    const wrongCall = (wrongEntrypoint.payload as { call: { entrypoint: string } }).call;
    wrongCall.entrypoint = "commit_recipe";
    await assert.rejects(
      wrongEntrypointContinuation.coordinator.handles.creator(wrongEntrypoint),
      /first continuation mutation differs from global operation 10/,
    );
    assert.deepEqual(wrongEntrypointContinuation.delegated, { creator: 0, collector1: 0, collector2: 0 });

    const pinDrift = createCoordinator();
    const firstPin = creatorSteps.find((step) => step.kind === "pin");
    assert.ok(firstPin && firstPin.kind === "pin");
    const driftedPinRequest = structuredClone(resumeReplayRequest(firstPin, 1));
    (driftedPinRequest.payload as Record<string, unknown>).fileName = "drifted-pin.json";
    await assert.rejects(
      pinDrift.coordinator.handles.creator(driftedPinRequest),
      /bytes or descriptor drifted/,
    );
    assert.deepEqual(pinDrift.delegated, { creator: 0, collector1: 0, collector2: 0 });

    const descriptorDrift = createCoordinator();
    const firstOperationIndex = creatorSteps.findIndex((step) => step.kind === "operation");
    assert.ok(firstOperationIndex > 0);
    for (let index = 0; index < firstOperationIndex; index += 1) {
      await descriptorDrift.coordinator.handles.creator(
        resumeReplayRequest(creatorSteps[index], index + 1),
      );
    }
    const firstOperation = creatorSteps[firstOperationIndex];
    assert.equal(firstOperation.kind, "operation");
    const driftedOperationRequest = structuredClone(
      resumeReplayRequest(firstOperation, firstOperationIndex + 1),
    );
    const operationPayload = driftedOperationRequest.payload as Record<string, unknown>;
    operationPayload.storage = {
      ...(operationPayload.storage as Record<string, unknown>),
      injected_drift: true,
    };
    await assert.rejects(
      descriptorDrift.coordinator.handles.creator(driftedOperationRequest),
      /bytes or descriptor drifted/,
    );
    assert.deepEqual(descriptorDrift.delegated, { creator: 0, collector1: 0, collector2: 0 });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("current-generation resume fails closed on PREPARED, exact-hash reconciles SUBMITTED, and restores authenticated private UI references", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-current-resume-"));
  try {
    const preparedRoot = path.join(parent, "prepared");
    const preparedInput = inputFor(preparedRoot);
    const preparedJournal = await createRavioliUiLiveJournal(preparedInput);
    const operationOne = EFFECTIVE_MATRIX[0];
    const prepared = preparedOperation(operationOne);
    await preparedJournal.beforeOperationSubmit("creator", prepared);
    const preparedState = await preparedJournal.restartState();
    assert.equal(preparedState.pendingOperation?.phase, "PREPARED");
    assert.equal(preparedState.pendingOperation?.expected.globalOrdinal, 1);
    assert.equal(preparedState.pendingOperation?.operationHash, undefined);
    await assert.rejects(
      inspectRavioliCurrentResume({
        journal: preparedJournal,
        expected: resumeExpectedIdentity(preparedInput),
        ipfs: RESUME_IPFS,
      }),
      /PREPARED signer intent remains ambiguous/,
    );
    assert.equal(preparedJournal.getEventCount(), 1);
    const reopenedPrepared = await openRavioliUiLiveJournal(preparedRoot);
    assert.equal((await reopenedPrepared.restartState()).pendingOperation?.phase, "PREPARED");

    const submittedRoot = path.join(parent, "submitted");
    const submittedInput = inputFor(submittedRoot);
    const submittedJournal = await createRavioliUiLiveJournal(submittedInput);
    const submittedPrepared = preparedOperation(operationOne);
    const submitted = submittedOperation(operationOne, submittedPrepared);
    await submittedJournal.beforeOperationSubmit("creator", submittedPrepared);
    await submittedJournal.onOperationSubmitted("creator", submitted);
    const submittedState = await submittedJournal.restartState();
    assert.equal(submittedState.pendingOperation?.phase, "SUBMITTED");
    assert.equal(submittedState.pendingOperation?.operationHash, submitted.operationHash);
    await assert.rejects(
      reconcileRavioliCurrentResume({
        journal: submittedJournal,
        expected: resumeExpectedIdentity(submittedInput),
        ipfs: RESUME_IPFS,
        verifier: {
          readActorCounter: async () => 0,
          verifyOperation: async (operation) => operation.evidence,
          verifyPin: async () => undefined,
          verifyTarget: async () => undefined,
        },
      }),
      /requires exact-hash reconciliation/,
    );
    assert.equal(submittedJournal.getEventCount(), 2);
    let reconciledHash = "";
    const reconciled = await reconcileRavioliCurrentResume({
      journal: submittedJournal,
      expected: resumeExpectedIdentity(submittedInput),
      ipfs: RESUME_IPFS,
      reconcileSubmitted: async (pending) => {
        reconciledHash = pending.operationHash;
        assert.equal(pending.expectedCounter, ACTOR_INITIAL_COUNTER.creator + 1);
        assert.equal(pending.contractAddress, BLIND_CONTROLLER);
        return appliedEvidence(operationOne, submitted);
      },
      verifier: {
        readActorCounter: async ({ actor }) => (
          ACTOR_INITIAL_COUNTER[actor] + (actor === "creator" ? 1 : 0)
        ),
        verifyOperation: async (operation) => operation.evidence,
        verifyPin: async () => undefined,
        verifyTarget: async ({ role, address }) => {
          assert.equal(address, role === "blindController" ? BLIND_CONTROLLER : TARGET_ADDRESS[role]);
        },
      },
    });
    assert.equal(reconciledHash, submitted.operationHash);
    assert.equal(reconciled.completedOperationCount, 1);
    assert.equal(reconciled.nextOperation?.globalOrdinal, 2);
    assert.equal(reconciled.actorSequences.creator.nextOperationSequence, 2);
    assert.equal(submittedJournal.getEventCount(), 3);
    const reopenedSubmitted = await openRavioliUiLiveJournal(submittedRoot);
    assert.equal((await reopenedSubmitted.restartState()).pendingOperation, null);
    assert.equal(reopenedSubmitted.getCompletedOperationCount(), 1);

    const rejectedRoot = path.join(parent, "rejected");
    const rejectedInput = inputFor(rejectedRoot);
    const rejectedJournal = await createRavioliUiLiveJournal(rejectedInput);
    const rejectedPrepared = preparedOperation(operationOne);
    const rejectedSubmitted = submittedOperation(operationOne, rejectedPrepared);
    await rejectedJournal.beforeOperationSubmit("creator", rejectedPrepared);
    await rejectedJournal.onOperationSubmitted("creator", rejectedSubmitted);
    await assert.rejects(
      reconcileRavioliCurrentResume({
        journal: rejectedJournal,
        expected: resumeExpectedIdentity(rejectedInput),
        ipfs: RESUME_IPFS,
        reconcileSubmitted: async () => ({
          ...appliedEvidence(operationOne, rejectedSubmitted),
          operationHash: operationHash(999),
        }),
        verifier: {
          readActorCounter: async () => 0,
          verifyOperation: async (operation) => operation.evidence,
          verifyPin: async () => undefined,
          verifyTarget: async () => undefined,
        },
      }),
      /evidence operation hash drift/,
    );
    assert.equal(rejectedJournal.getEventCount(), 2);
    assert.equal((await rejectedJournal.restartState()).pendingOperation?.phase, "SUBMITTED");

    const privateRoot = path.join(parent, "private");
    const snapshotName = "ravioli-private-recovery-0123456789abcdef01234567";
    const snapshotRoot = path.join(privateRoot, snapshotName);
    const recordsRoot = path.join(snapshotRoot, "records");
    await mkdir(recordsRoot, { recursive: true });
    const draftId = "0123456789abcdef0123456789abcdef";
    const storageKey = `pasta.ravioli.publish-recovery-draft.v1:shadownet:${CREATOR}:${draftId}`;
    const privateValue = JSON.stringify({
      schema: "pasta-ravioli-publish-recovery@1",
      encoding: "pasta-recovery-canonical@1",
      status: "IN_PROGRESS",
      draftId,
      network: "shadownet",
      account: CREATOR,
      contract: null,
      tokenId: null,
      kit: null,
      product: {
        name: "Resume fixture",
        mode: "deterministic_vault",
        editions: 1,
        target: "new_collection",
        workflow: "publish",
        expectedTerminalStage: "ORIGINATE_BLIND_CONTROLLER",
      },
      history: [{
        stage: "ORIGINATE_BLIND_CONTROLLER:CONFIRMED",
        status: "IN_PROGRESS",
        at: "2026-07-22T22:00:02.000Z",
        operationHash: submitted.operationHash,
      }],
      createdAt: "2026-07-22T22:00:00.000Z",
      updatedAt: "2026-07-22T22:00:02.000Z",
    });
    const privateBytes = Buffer.from(privateValue, "utf8");
    await writeFile(path.join(recordsRoot, "0001.json"), privateBytes);
    const manifest = {
      schema: "pastaprotocol-ravioli-private-recovery-snapshot@1",
      capturedAt: "2026-07-22T22:00:03.000Z",
      records: [{
        storageKey,
        file: "records/0001.json",
        byteLength: privateBytes.byteLength,
        sha256: createHash("sha256").update(privateBytes).digest("hex"),
      }],
    };
    await writeFile(
      path.join(snapshotRoot, "manifest.json"),
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    );
    const restoration = await loadRavioliPrivateRecoveryRestoration({
      root: privateRoot,
      allowedAccounts: new Set([CREATOR, COLLECTOR1, COLLECTOR2]),
      allowedContracts: new Set([BLIND_CONTROLLER]),
      allowedOperationHashes: new Set([submitted.operationHash]),
    });
    assert.ok(restoration);
    assert.equal(restoration.records[0]?.stage, "ORIGINATE_BLIND_CONTROLLER:CONFIRMED");
    const restoredStorage = new Map<string, string>();
    const previousLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      setItem(key: string, value: string) { restoredStorage.set(key, value); },
    };
    try {
      await installRavioliPrivateRecoveryRestoration({
        addInitScript: async (script: any, argument: any) => { script(argument); },
      } as any, restoration);
    } finally {
      if (previousLocalStorage === undefined) delete (globalThis as any).localStorage;
      else (globalThis as any).localStorage = previousLocalStorage;
    }
    assert.equal(restoredStorage.get(storageKey), privateValue);
    assert.deepEqual(JSON.parse(restoredStorage.get("pasta.ravioli.publish-recovery-index.v1") || "[]"), [storageKey]);
    const privatePlan = await inspectRavioliCurrentResume({
      journal: reopenedSubmitted,
      expected: resumeExpectedIdentity(submittedInput),
      ipfs: RESUME_IPFS,
      privateRecoveryRoot: privateRoot,
    });
    assert.equal(privatePlan.privateRecovery?.manifestSha256, restoration.manifestSha256);
    assert.equal(privatePlan.privateRecovery?.records[0]?.operationHashes[0], submitted.operationHash);
    const publicPlanJson = JSON.stringify(privatePlan);
    assert.equal(publicPlanJson.includes(privateRoot), false);
    assert.equal(publicPlanJson.includes(storageKey), false);
    assert.equal(publicPlanJson.includes(draftId), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a tracked synthetic event-86 boundary appends event 87, reopens idempotently, and rejects extension tamper", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-synthetic-event86-"));
  const journalRoot = path.join(parent, "journal");
  try {
    const journal = await createSyntheticLegacyJournal(journalRoot);
    await advanceSyntheticLegacyJournalToEvent86(journal);
    const event86Bytes = await readFile(path.join(
      journalRoot,
      "events",
      "000086-counter_advance-creator.json",
    ));
    const syntheticPostEvent86BoundarySha256 = createHash("sha256")
      .update(event86Bytes)
      .digest("hex");
    assert.notEqual(
      syntheticPostEvent86BoundarySha256,
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION
        .requiredPreviousRecordSha256,
      "synthetic fixture accidentally reproduced historical event bytes",
    );

    const strictHistorical = await openRavioliUiLiveJournal(journalRoot);
    await assert.rejects(
      strictHistorical.appendAuthenticatedPostEvent86PlanExtension(
        "2026-07-24T20:17:00.000Z",
      ),
      /exact authenticated event-86 boundary/,
    );

    const openAgainstSyntheticBoundary = () =>
      openRavioliUiLiveJournalAgainstPostEvent86Boundary(
        journalRoot,
        syntheticPostEvent86BoundarySha256,
      );
    let authenticated = await openAgainstSyntheticBoundary();
    const extension =
      await authenticated.appendPostEvent86PlanExtensionAgainstBoundary(
        syntheticPostEvent86BoundarySha256,
        "2026-07-24T20:17:00.000Z",
      );
    assert.equal(extension.appended, true);
    assert.equal(extension.eventIndex, 87);
    assert.equal(extension.path, "events/000087-plan_extension-creator.json");

    authenticated = await openAgainstSyntheticBoundary();
    assert.equal(authenticated.getEventCount(), 87);
    assert.equal(authenticated.hasEffectivePlan(), true);
    assert.equal(authenticated.hasPlanExtension(), true);
    assert.deepEqual(
      await authenticated.appendPostEvent86PlanExtensionAgainstBoundary(
        syntheticPostEvent86BoundarySha256,
        "2026-07-24T20:18:00.000Z",
      ),
      { ...extension, appended: false },
    );

    const tamperedRoot = path.join(parent, "tampered");
    await cp(journalRoot, tamperedRoot, { recursive: true });
    const extensionPath = path.join(
      tamperedRoot,
      "events",
      "000087-plan_extension-creator.json",
    );
    const tampered = JSON.parse(await readFile(extensionPath, "utf8"));
    tampered.extension.operations[0].capacity = 1;
    await writeFile(extensionPath, deterministicJsonBytes(tampered));
    await assert.rejects(
      openRavioliUiLiveJournalAgainstPostEvent86Boundary(
        tamperedRoot,
        syntheticPostEvent86BoundarySha256,
      ),
      /plan extension drift/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("an exact disposable event-86 journal copy appends event 87, completes the 67-operation effective plan, and rejects extension, op67, or sealed-evidence loss and drift", {
  skip: process.env[HISTORICAL_EVENT86_OPERATOR_FIXTURE_FLAG] !== "1"
    ? `${HISTORICAL_EVENT86_OPERATOR_FIXTURE_FLAG}=1 requires the ignored authenticated operator proof fixture`
    : false,
}, async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-event86-extension-"));
  const root = path.join(parent, "journal");
  const sourceEvent86 = path.join(
    HISTORICAL_EVENT86_JOURNAL,
    "events",
    "000086-counter_advance-creator.json",
  );
  try {
    const sourceEvent86Bytes = await readFile(sourceEvent86);
    assert.equal(
      createHash("sha256").update(sourceEvent86Bytes).digest("hex"),
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION
        .requiredPreviousRecordSha256,
    );
    assert.equal(
      (await readdir(path.join(HISTORICAL_EVENT86_JOURNAL, "events"))).length,
      86,
    );
    assert.equal(
      (await readdir(path.join(HISTORICAL_EVENT86_JOURNAL, "pins"))).length,
      15,
    );
    await cp(HISTORICAL_EVENT86_JOURNAL, root, { recursive: true });

    const bindings = await historicalBindings(root);
    const plans = await historicalBlindPlans();
    let journal = await openRavioliUiLiveJournal(root);
    assert.equal(journal.getCompletedOperationCount(), 23);
    assert.equal(journal.getEventCount(), 86);
    assert.equal(journal.getPinCount(), 15);
    assert.equal(journal.hasEffectivePlan(), false);
    assert.equal(journal.hasPlanExtension(), false);

    const extension = await journal.appendAuthenticatedPostEvent86PlanExtension(
      "2026-07-24T20:17:00.000Z",
    );
    assert.equal(extension.appended, true);
    assert.equal(extension.eventIndex, 87);
    assert.equal(extension.path, "events/000087-plan_extension-creator.json");
    assert.equal(journal.hasEffectivePlan(), true);
    assert.equal(journal.hasPlanExtension(), true);
    const idempotent = await journal.appendAuthenticatedPostEvent86PlanExtension(
      "2026-07-24T20:18:00.000Z",
    );
    assert.deepEqual(idempotent, { ...extension, appended: false });
    assert.equal(journal.getEventCount(), 87);

    for (let ordinal = 101; ordinal <= 116; ordinal += 1) {
      await appendOrdinaryPin(journal, ordinal);
    }
    assert.equal(journal.getPinCount(), 31);

    for (const expected of EFFECTIVE_MATRIX.slice(23)) {
      if (
        expected.entrypoint === "create_pack"
        && expected.tokenId !== undefined
        && expected.tokenId >= 3
      ) {
        await appendSealedRevealPin(
          journal,
          plans.get(expected.tokenId)!,
          bindings,
        );
      }
      await applyExpected(
        journal,
        expected,
        undefined,
        bindings,
        plans,
      );
    }
    assert.equal(journal.getCompletedOperationCount(), 67);
    assert.equal(journal.getPinCount(), 34);
    assert.equal(journal.getEventCount(), 238);

    const finalized = await journal.finalize("2026-07-25T00:00:00.000Z");
    assert.deepEqual(finalized.counts, {
      actors: { creator: 49, collector1: 11, collector2: 7 },
      originations: 4,
      calls: 63,
      buys: 7,
      opens: 6,
      transfers: 2,
      refunds: 1,
      pins: 34,
      events: 238,
    });
    journal = await openRavioliUiLiveJournal(root);
    assert.equal(journal.isFinalized(), true);
    assert.equal(journal.hasEffectivePlan(), true);
    assert.equal(journal.hasPlanExtension(), true);
    assert.equal(
      journal.getPlanExtensionRecordSha256(),
      extension.recordSha256,
    );

    const eventEntries = await Promise.all(
      (await readdir(path.join(root, "events"))).map(async (name) => ({
        name,
        value: JSON.parse(
          await readFile(path.join(root, "events", name), "utf8"),
        ) as any,
      })),
    );
    const operation67Events = eventEntries
      .filter(({ value }) => value.globalOrdinal === 67)
      .sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(
      operation67Events.map(({ value }) => value.phase),
      ["PREPARED", "SUBMITTED", "APPLIED"],
    );
    assert.equal(
      operation67Events[0]!.value.operation.descriptor.call.payload.adapter,
      bindings.targetAddress.gnocchiAdapter,
    );

    const rejectCopy = async (
      label: string,
      mutate: (copyRoot: string) => Promise<void>,
      expectedError: RegExp,
    ): Promise<void> => {
      const copyRoot = path.join(parent, label);
      await cp(root, copyRoot, { recursive: true });
      await mutate(copyRoot);
      await assert.rejects(
        openRavioliUiLiveJournal(copyRoot),
        expectedError,
        label,
      );
    };

    await rejectCopy(
      "extension-mutated",
      async (copyRoot) => {
        const eventPath = path.join(
          copyRoot,
          "events",
          "000087-plan_extension-creator.json",
        );
        const event = JSON.parse(await readFile(eventPath, "utf8"));
        event.extension.operations[0].capacity = 1;
        await writeFile(eventPath, deterministicJsonBytes(event));
      },
      /plan extension drift|hash link|final record/i,
    );
    await rejectCopy(
      "extension-deleted",
      async (copyRoot) => {
        await unlink(path.join(
          copyRoot,
          "events",
          "000087-plan_extension-creator.json",
        ));
      },
      /filename order drift|fixed matrix drift|final record/i,
    );
    await rejectCopy(
      "operation67-mutated",
      async (copyRoot) => {
        const eventPath = path.join(
          copyRoot,
          "events",
          operation67Events[0]!.name,
        );
        const event = JSON.parse(await readFile(eventPath, "utf8"));
        event.operation.descriptor.call.payload.capacity = 1;
        await writeFile(eventPath, deterministicJsonBytes(event));
      },
      /recover_adapter payload drift|descriptor|hash link|final record/i,
    );
    await rejectCopy(
      "operation67-deleted",
      async (copyRoot) => {
        await Promise.all(operation67Events.map(({ name }) => unlink(
          path.join(copyRoot, "events", name),
        )));
      },
      /final record|count drift|hash link/i,
    );
    await rejectCopy(
      "sealed-evidence-mutated",
      async (copyRoot) => {
        const pinPath = path.join(copyRoot, "pins", "000032.bin");
        const bytes = await readFile(pinPath);
        bytes[bytes.length - 1] ^= 1;
        await writeFile(pinPath, bytes);
      },
      /pin bytes drift|sealed reveal|checkpoint/i,
    );
    await rejectCopy(
      "sealed-evidence-deleted",
      async (copyRoot) => {
        await unlink(path.join(copyRoot, "pins", "000032.bin"));
      },
      /ENOENT|missing pin|pin bytes drift|checkpoint/i,
    );

    assert.equal(
      createHash("sha256").update(await readFile(sourceEvent86)).digest("hex"),
      RAVIOLI_UI_LIVE_POST_EVENT86_PLAN_EXTENSION
        .requiredPreviousRecordSha256,
    );
    assert.equal(
      (await readdir(path.join(HISTORICAL_EVENT86_JOURNAL, "events"))).length,
      86,
    );
    assert.equal(
      (await readdir(path.join(HISTORICAL_EVENT86_JOURNAL, "pins"))).length,
      15,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("journal hash-chains an independent signer counter advance and applies its offset only to future semantic operations", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-counter-advance-"));
  const root = path.join(parent, "journal");
  try {
    let journal = await createRavioliUiLiveJournal(inputFor(root));
    const first = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0]!;
    await applyExpected(journal, first);

    const recovery = {
      recoveryId: "7".repeat(64),
      semanticBoundary: 1,
      recoveryContractAddress: MACARONI_RECOVERY,
      advances: [{
        actor: "creator" as const,
        operations: [externalCounterOperation({
          actor: "creator",
          ordinal: 90,
          counter: ACTOR_INITIAL_COUNTER.creator + 2,
          action: "originate",
        }) as any],
      }],
      recordedAt: "2026-07-24T20:16:00.000Z",
    };
    await journal.appendCounterAdvance(recovery);
    assert.equal(journal.hasCounterAdvance(), true);
    assert.equal(journal.getCounterOffset("creator"), 1);
    assert.equal(journal.getCounterOffset("collector1"), 0);
    assert.equal(journal.getCompletedOperationCount(), 1);
    assert.deepEqual((await readdir(path.join(root, "events"))).sort().at(-1), "000004-counter_advance-creator.json");
    await assert.rejects(journal.appendCounterAdvance(recovery), /already contains a counter advance/);

    journal = await openRavioliUiLiveJournal(root);
    assert.equal(journal.hasCounterAdvance(), true);
    assert.equal(journal.getCounterOffset("creator"), 1);
    assert.equal(journal.getCompletedOperationCount(), 1);

    const next = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[1]!;
    const prepared = preparedOperation(next);
    await journal.beforeOperationSubmit(next.actor, prepared);
    const submitted = submittedOperation(next, prepared);
    await journal.onOperationSubmitted(next.actor, submitted);
    await journal.appendApplied({
      actor: next.actor,
      operationSequence: next.operationSequence,
      operationHash: submitted.operationHash,
      contractAddress: TARGET_ADDRESS[next.targetRole],
      entrypoints: [],
      evidence: {
        ...appliedEvidence(next, submitted),
        counter: ACTOR_INITIAL_COUNTER.creator + next.operationSequence + 1,
      },
    });
    journal = await openRavioliUiLiveJournal(root);
    assert.equal(journal.getCompletedOperationCount(), 2);
    assert.equal(journal.getCounterOffset("creator"), 1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("counter advance fails closed before writing on boundary, target, contiguity, and origination drift", async () => {
  const cases: Array<{ label: string; mutate(value: any): void; error: RegExp }> = [
    {
      label: "semantic boundary",
      mutate: (value) => { value.semanticBoundary = 2; },
      error: /semantic boundary drift/,
    },
    {
      label: "Ravioli target overlap",
      mutate: (value) => {
        value.recoveryContractAddress = BLIND_CONTROLLER;
        value.advances[0].operations[0].contractAddress = BLIND_CONTROLLER;
      },
      error: /overlaps the Ravioli proof/,
    },
    {
      label: "counter gap",
      mutate: (value) => { value.advances[0].operations[0].counter += 1; },
      error: /not counter-contiguous/,
    },
    {
      label: "missing independent origination",
      mutate: (value) => {
        value.advances[0].operations[0].action = "call";
        value.advances[0].operations[0].entrypoints = ["mint"];
      },
      error: /lacks its independent recovery origination/,
    },
  ];
  for (const drift of cases) {
    const parent = await mkdtemp(path.join(tmpdir(), `ravioli-journal-counter-${drift.label.replaceAll(" ", "-")}-`));
    const root = path.join(parent, "journal");
    try {
      const journal = await createRavioliUiLiveJournal(inputFor(root));
      await applyExpected(journal, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0]!);
      const recovery: any = {
        recoveryId: "7".repeat(64),
        semanticBoundary: 1,
        recoveryContractAddress: MACARONI_RECOVERY,
        advances: [{
          actor: "creator",
          operations: [externalCounterOperation({
            actor: "creator",
            ordinal: 91,
            counter: ACTOR_INITIAL_COUNTER.creator + 2,
            action: "originate",
          })],
        }],
      };
      drift.mutate(recovery);
      await assert.rejects(journal.appendCounterAdvance(recovery), drift.error, drift.label);
      assert.equal((await readdir(path.join(root, "events"))).length, 3, `${drift.label} wrote an event`);
      assert.equal(journal.hasCounterAdvance(), false);
      assert.equal(journal.getCounterOffset("creator"), 0);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }
});

test("deterministic PUBLIC_REVEAL is validated before pin, redacted in events, and bound to the immediate create_pack across replay", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-public-create-"));
  const root = path.join(parent, "journal");
  try {
    let journal = await createRavioliUiLiveJournal(inputFor(root));
    const createPack = await advanceUntil(
      journal,
      (expected) => expected.entrypoint === "create_pack" && expected.tokenId === 0,
    );
    const reveal = publicReveal(0);
    const bytes = deterministicJsonBytes(reveal);
    const digest = createHash("sha256").update(bytes).digest("hex");
    await journal.beforePin({
      actor: "creator",
      fileName: "ravioli-public-reveal-0.json",
      mimeType: "application/json",
      bytes,
      preparedAt: "2026-07-22T22:10:00.000Z",
    });
    const prePinEvents = (await readdir(path.join(root, "events"))).sort();
    assert.match(prePinEvents.at(-1) || "", /public_reveal_prepared-creator\.json$/);
    const prePinText = await readFile(path.join(root, "events", prePinEvents.at(-1)!), "utf8");
    assert.equal(prePinText.includes(recipeNonce(0, 0)), false, "pre-pin intent leaked the nonce");
    assert.match(prePinText, new RegExp(ravioliUiLiveNonceCommitment(recipeNonce(0, 0))));

    journal = await openRavioliUiLiveJournal(root);
    await journal.beforePin({
      actor: "creator",
      fileName: "ravioli-public-reveal-0.json",
      mimeType: "application/json",
      bytes,
      preparedAt: "2026-07-22T22:10:00.000Z",
    });
    const changedRetry = structuredClone(reveal) as any;
    changedRetry.openKit.warning = "Different bytes after restart";
    await assert.rejects(journal.beforePin({
      actor: "creator",
      fileName: "ravioli-public-reveal-0.json",
      mimeType: "application/json",
      bytes: deterministicJsonBytes(changedRetry),
    }), /retry differs from the durable pre-pin intent/);

    await journal.appendPin({
      actor: "creator",
      fileName: "ravioli-public-reveal-0.json",
      mimeType: "application/json",
      bytes,
      expectedSha256: digest,
      expectedByteLength: bytes.byteLength,
      metadata: { cid: CID, uri: `ipfs://${CID}`, publicGatewayUrl: `https://ipfs.io/ipfs/${CID}` },
      pinnedAt: "2026-07-22T22:10:01.000Z",
    });
    journal = await openRavioliUiLiveJournal(root);
    const currentCreatePack = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[journal.getCompletedOperationCount()];
    assert.equal(currentCreatePack.id, createPack.id);
    const wrong = preparedOperation(currentCreatePack);
    setContentsUri(wrong, "create_pack", "ipfs://bafkreiwronguri000000000000000000000000000000000000000000000000000");
    await assert.rejects(journal.beforeOperationSubmit("creator", wrong), /URI is not bound/);
    await applyExpected(journal, currentCreatePack, (prepared) => setContentsUri(prepared, "create_pack", `ipfs://${CID}`));
    journal = await openRavioliUiLiveJournal(root);
    await applyExpected(journal, RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[journal.getCompletedOperationCount()]);
    const eventText = (await Promise.all((await readdir(path.join(root, "events"))).map((name) => readFile(path.join(root, "events", name), "utf8")))).join("\n");
    assert.equal(eventText.includes(recipeNonce(0, 0)), false, "journal events leaked an explicitly public nonce");
    const pinBytes = await readFile(path.join(root, "pins", "000001.bin"));
    assert.equal(pinBytes.includes(Buffer.from(recipeNonce(0, 0), "utf8")), true, "explicit PUBLIC_REVEAL artifact omitted its nonce");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("blind reveal reuses its pre-sale sealed envelope, rejects plaintext pinning, and binds exact URI, salt, and offset", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-public-set-"));
  const root = path.join(parent, "journal");
  try {
    let journal = await createRavioliUiLiveJournal(inputFor(root));
    const plans = new Map<number, BlindRevealPlan>(
      [1, 2, 3, 4].map((tokenId) => [tokenId, blindRevealPlan(tokenId)]),
    );
    let expectedRevealWrite: RavioliUiLiveExpectedOperation | undefined;
    for (const expected of EFFECTIVE_MATRIX) {
      if (
        expected.entrypoint === "set_pack_contents"
        && expected.tokenId === 1
      ) {
        expectedRevealWrite = expected;
        break;
      }
      if (
        expected.entrypoint === "create_pack"
        && expected.tokenId !== undefined
        && expected.tokenId >= 1
      ) {
        const plan = plans.get(expected.tokenId)!;
        if (expected.tokenId === 1) {
          const malformed = JSON.parse(
            Buffer.from(sealedRevealBytes(plan)).toString("utf8"),
          );
          malformed.aad.contract = GNOCCHI;
          const eventCount = journal.getEventCount();
          await assert.rejects(
            journal.beforePin({
              actor: "creator",
              fileName: "ravioli-sealed-reveal-1.json",
              mimeType: "application/json",
              bytes: deterministicJsonBytes(malformed),
            }),
            /sealed reveal AAD router drift/i,
          );
          assert.equal(journal.getEventCount(), eventCount);
        }
        await appendSealedRevealPin(journal, plan);
      }
      let publicRevealUri = "";
      if (
        expected.entrypoint === "create_pack"
        && expected.tokenId === 0
      ) {
        publicRevealUri = await appendPublicRevealPin(journal, 0);
      }
      await applyExpected(
        journal,
        expected,
        publicRevealUri
          ? (prepared) => setContentsUri(
              prepared,
              "create_pack",
              publicRevealUri,
            )
          : undefined,
        DEFAULT_BINDINGS,
        plans,
      );
    }
    assert.ok(expectedRevealWrite, "fixture did not reach token 1 reveal");
    assert.equal(expectedRevealWrite.actor, "creator");
    const reveal = publicReveal(1);
    const originalEventCount = journal.getEventCount();
    const originalPinCount = journal.getPinCount();
    await assert.rejects(
      journal.beforePin({
        actor: "creator",
        fileName: "ravioli-public-reveal-1.json",
        mimeType: "application/json",
        bytes: deterministicJsonBytes(reveal),
      }),
      /blind.*sealed|plaintext.*blind|PUBLIC_REVEAL.*token 0/i,
    );
    assert.equal(journal.getEventCount(), originalEventCount);
    assert.equal(journal.getPinCount(), originalPinCount);

    const ordinaryNonceBytes = deterministicJsonBytes({ schema: "ordinary-artifact@1", nonce: recipeNonce(1, 0) });
    await assert.rejects(journal.beforePin({
      actor: "creator",
      fileName: "ordinary.json",
      mimeType: "application/json",
      bytes: ordinaryNonceBytes,
    }), /raw open_pack nonce|ordinary pin containing a committed recipe nonce|ordinary nonce-bearing pin/);
    await assert.rejects(journal.appendPin({
      actor: "creator",
      fileName: "ordinary.json",
      mimeType: "application/json",
      bytes: ordinaryNonceBytes,
    }), /raw open_pack nonce|ordinary pin containing a committed recipe nonce|ordinary nonce-bearing pin/);

    const wrongUri = preparedOperation(
      expectedRevealWrite,
      DEFAULT_BINDINGS,
      plans,
    );
    setContentsUri(
      wrongUri,
      "set_pack_contents",
      `ipfs://${syntheticCid("wrong-sealed-uri")}`,
    );
    await assert.rejects(
      journal.beforeOperationSubmit("creator", wrongUri),
      /differs from its pre-sale sealed envelope/,
    );
    assert.equal(journal.getEventCount(), originalEventCount);
    await applyExpected(
      journal,
      expectedRevealWrite,
      undefined,
      DEFAULT_BINDINGS,
      plans,
    );
    journal = await openRavioliUiLiveJournal(root);
    assert.equal(journal.getCompletedOperationCount(), expectedRevealWrite.globalOrdinal);
    assert.equal(journal.getPinCount(), originalPinCount);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("journal rejects batches, actor/sequence drift, unsafe projection, premature finalization, and pin mismatches before writes", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-negative-"));
  const root = path.join(parent, "journal");
  try {
    const journal = await createRavioliUiLiveJournal(inputFor(root));
    const first = preparedOperation(RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0]);
    await assert.rejects(
      journal.beforeOperationSubmit("creator", {
        ...first,
        action: "batch",
        descriptor: { kind: "batch", calls: [] },
      }),
      /rejects batch/,
    );
    await assert.rejects(
      journal.beforeOperationSubmit("creator", { ...first, operationSequence: 2 }),
      /expected creator operation sequence 1/,
    );
    let getterReads = 0;
    const unsafeCode = {};
    Object.defineProperty(unsafeCode, "secret", { enumerable: true, get() { getterReads += 1; return "must not run"; } });
    await assert.rejects(
      journal.beforeOperationSubmit("creator", {
        ...first,
        descriptor: { kind: "originate", code: unsafeCode, storage: {} },
      }),
      /accessor/,
    );
    assert.equal(getterReads, 0);
    await assert.rejects(
      journal.appendPin({
        actor: "creator",
        fileName: "proof.bin",
        mimeType: "application/octet-stream",
        bytes: Uint8Array.of(1, 2, 3),
        expectedSha256: "f".repeat(64),
      }),
      /hash differs/,
    );
    assert.deepEqual(await readdir(path.join(root, "events")), []);
    assert.deepEqual(await readdir(path.join(root, "pins")), []);
    const firstExpected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0];
    const validFirst = preparedOperation(firstExpected);
    await journal.beforeOperationSubmit("creator", validFirst);
    const firstSubmitted = submittedOperation(firstExpected, validFirst);
    await journal.onOperationSubmitted("creator", firstSubmitted);
    await journal.appendApplied({
      actor: "creator",
      operationSequence: 1,
      operationHash: firstSubmitted.operationHash,
      contractAddress: BLIND_CONTROLLER,
      entrypoints: [],
      evidence: appliedEvidence(firstExpected, firstSubmitted),
    });
    const secondExpected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[1];
    const wrongDependencyTarget = preparedOperation(secondExpected);
    assert.equal(wrongDependencyTarget.descriptor.kind, "originate");
    if (wrongDependencyTarget.descriptor.kind === "originate") {
      (wrongDependencyTarget.descriptor.storage as any).blind_controller = ROTINI;
    }
    await assert.rejects(
      journal.beforeOperationSubmit("creator", wrongDependencyTarget),
      /not immutably bound to the confirmed controller/,
    );
    await assert.rejects(journal.finalize(), /before every semantic-plan operation/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("journal checkpoints the exact certified controller and router descriptors without widening arbitrary projection depth", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-certified-originations-"));
  const root = path.join(parent, "journal");
  const overDepthRoot = path.join(parent, "over-depth-journal");
  const metadataUri = "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const metadata = () => {
    const value = new MichelsonMap<string, string>();
    value.set("", Buffer.from(metadataUri, "utf8").toString("hex"));
    return value;
  };
  try {
    const [controllerCode, routerCode] = await Promise.all([
      readFile(
        path.resolve("public/creation-tools/ravioli/contract/pasta-blind-pack-controller.contract.json"),
        "utf8",
      ).then((bytes) => JSON.parse(bytes)),
      readFile(
        path.resolve("public/creation-tools/ravioli/contract/pasta-bundle.contract.json"),
        "utf8",
      ).then((bytes) => JSON.parse(bytes)),
    ]);
    const journal = await createRavioliUiLiveJournal(inputFor(root));
    const controllerExpected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0];
    const controllerPrepared: PastaUiLivePreparedOperation = {
      ...preparedOperation(controllerExpected),
      descriptor: {
        kind: "originate",
        code: controllerCode,
        storage: {
          metadata: metadata(),
          packs: new MichelsonMap(),
          claim_counts: new MichelsonMap(),
          claim_slots: new MichelsonMap(),
          consumed_serials: new MichelsonMap(),
          refund_credits: new MichelsonMap(),
        },
      },
    };
    await journal.beforeOperationSubmit("creator", controllerPrepared);
    const controllerSubmitted = submittedOperation(controllerExpected, controllerPrepared);
    await journal.onOperationSubmitted("creator", controllerSubmitted);
    await journal.appendApplied({
      actor: "creator",
      operationSequence: controllerExpected.operationSequence,
      operationHash: controllerSubmitted.operationHash,
      contractAddress: BLIND_CONTROLLER,
      entrypoints: [],
      evidence: appliedEvidence(controllerExpected, controllerSubmitted),
    });

    const routerExpected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[1];
    const routerPrepared: PastaUiLivePreparedOperation = {
      ...preparedOperation(routerExpected),
      descriptor: {
        kind: "originate",
        code: routerCode,
        storage: {
          administrator: CREATOR,
          pending_administrator: null,
          blind_controller: BLIND_CONTROLLER,
          metadata: metadata(),
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
        },
      },
    };
    await journal.beforeOperationSubmit("creator", routerPrepared);
    assert.deepEqual(
      (await readdir(path.join(root, "events"))).sort(),
      [
        "000001-prepared-creator.json",
        "000002-submitted-creator.json",
        "000003-applied-creator.json",
        "000004-prepared-creator.json",
      ],
    );
    const reopened = await openRavioliUiLiveJournal(root);
    assert.equal(reopened.getCompletedOperationCount(), 1);

    const overDepthJournal = await createRavioliUiLiveJournal(inputFor(overDepthRoot));
    let nonMicheline: unknown = "leaf";
    for (let depth = 0; depth < 65; depth += 1) nonMicheline = { invalid: nonMicheline };
    await assert.rejects(
      overDepthJournal.beforeOperationSubmit("creator", {
        ...preparedOperation(controllerExpected),
        descriptor: {
          kind: "originate",
          code: nonMicheline,
          storage: {},
        },
      }),
      /projection exceeds its depth limit/,
    );
    assert.deepEqual(await readdir(path.join(overDepthRoot, "events")), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("journal rejects semantically false APPLIED evidence both before append and during replay", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "ravioli-journal-applied-evidence-"));
  const root = path.join(parent, "journal");
  try {
    const journal = await createRavioliUiLiveJournal(inputFor(root));
    const expected = RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX[0];
    const prepared = preparedOperation(expected);
    const submitted = submittedOperation(expected, prepared);
    await journal.beforeOperationSubmit(expected.actor, prepared);
    await journal.onOperationSubmitted(expected.actor, submitted);
    const validEvidence = appliedEvidence(expected, submitted);
    const tamperCases: Array<{
      label: string;
      expectedError: RegExp;
      mutate(evidence: Record<string, unknown>): void;
    }> = [
      { label: "status", expectedError: /evidence status drift/, mutate: (evidence) => { evidence.status = "failed"; } },
      { label: "hash", expectedError: /evidence operation hash drift/, mutate: (evidence) => { evidence.operationHash = operationHash(66); } },
      { label: "signer", expectedError: /evidence signer drift/, mutate: (evidence) => { evidence.signerAddress = COLLECTOR1; } },
      { label: "counter", expectedError: /counter drift from immutable intent/, mutate: (evidence) => { evidence.counter = 102; } },
      { label: "target", expectedError: /target address drift/, mutate: (evidence) => { evidence.contractAddress = GNOCCHI; } },
      { label: "entrypoints", expectedError: /evidence entrypoint drift/, mutate: (evidence) => { evidence.entrypoints = ["buy"]; } },
      { label: "level", expectedError: /evidence level must be an integer >= 1/, mutate: (evidence) => { evidence.level = 0; } },
      { label: "timestamp", expectedError: /evidence timestamp must be an ISO timestamp/, mutate: (evidence) => { evidence.timestamp = "not-a-time"; } },
      { label: "explorer", expectedError: /evidence explorer URL drift/, mutate: (evidence) => { evidence.explorerUrl = "https://example.com/not-tzkt"; } },
    ];
    for (const tamper of tamperCases) {
      const evidence = structuredClone(validEvidence);
      tamper.mutate(evidence);
      await assert.rejects(
        journal.appendApplied({
          actor: expected.actor,
          operationSequence: expected.operationSequence,
          operationHash: submitted.operationHash,
          contractAddress: BLIND_CONTROLLER,
          entrypoints: [],
          evidence,
        }),
        tamper.expectedError,
        `${tamper.label} drift reached the append boundary`,
      );
      assert.equal((await readdir(path.join(root, "events"))).length, 2, `${tamper.label} drift wrote an APPLIED event`);
    }
    await assert.rejects(
      journal.appendApplied({
        actor: expected.actor,
        operationSequence: expected.operationSequence,
        operationHash: submitted.operationHash,
        contractAddress: BLIND_CONTROLLER,
        entrypoints: [],
        evidence: { ...validEvidence, extra: true },
      }),
      /evidence fields drift/,
    );
    await journal.appendApplied({
      actor: expected.actor,
      operationSequence: expected.operationSequence,
      operationHash: submitted.operationHash,
      contractAddress: BLIND_CONTROLLER,
      entrypoints: [],
      evidence: validEvidence,
    });
    const appliedPath = path.join(root, "events", "000003-applied-creator.json");
    const originalApplied = JSON.parse(await readFile(appliedPath, "utf8"));
    for (const tamper of tamperCases) {
      const changed = structuredClone(originalApplied);
      tamper.mutate(changed.evidence);
      await writeFile(appliedPath, deterministicJsonBytes(changed));
      await assert.rejects(
        openRavioliUiLiveJournal(root),
        tamper.expectedError,
        `${tamper.label} drift survived replay`,
      );
      await writeFile(appliedPath, deterministicJsonBytes(originalApplied));
    }
    const reopened = await openRavioliUiLiveJournal(root);
    assert.equal(reopened.getCompletedOperationCount(), 1);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
