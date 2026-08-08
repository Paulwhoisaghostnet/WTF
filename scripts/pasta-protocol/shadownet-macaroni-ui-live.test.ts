import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import { validateOperation, ValidationResult } from "@taquito/utils";
import BigNumber from "bignumber.js";
import { unzipSync } from "fflate";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  hashJsonForBridge,
  installPastaUiLiveBrowserProxy,
  startPastaUiLiveLoopbackServer,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveAppliedOperationAssertion,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";
import {
  capturePastaProofStage,
  monitorPastaProofPage,
  PASTA_PROOF_VIEWPORT,
  verifyScreenshotSidecar,
  type CapturePastaProofStageResult,
} from "./pasta-proof-screenshot-kit";
import { deterministicJsonBytes, root, utf8ToHex } from "./shadownet-proof-kit";
import {
  assertExactMacaroniMetadataJson,
  assertMacaroniUiLiveExecutionAllowed,
  assertMacaroniUiDecodeSafe,
  assertMacaroniTzktOperationApplied,
  buildMacaroniProofPng,
  configureMacaroniStudio,
  configureMacaroniV1Studio,
  decodeMacaroniCanonicalOriginationRequest,
  findMacaroniMempoolRefusal,
  installMacaroniBrowserAdapters,
  isMacaroniTzktFa2Asset,
  macaroniCollectorStageStartUtc,
  macaroniTzktBigMapNatKeyIsInactive,
  macaroniManagerOperationFitsBlock,
  macaroniReplacementByFeeEligible,
  readMacaroniBrowserProjection,
  readMacaroniV1BrowserProjection,
  simulateMacaroniMintRejection,
  validateMacaroniSiteArchive,
  waitForMacaroniSyncOutcome,
} from "./shadownet-macaroni-ui-live";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const V1_CONTRACT = "KT1E5mXCQNj9gsaw3ZYNg5fC8TLk4XHKeU6i";
const CHAIN_ID = "NetXsqzbfFenSTS";
const OPERATION_HASHES = [
  "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq",
  "onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp",
  "ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM",
  "ontvJUZ9vNVusfHbcvzSX8xpPZMutmmwqqarvj4N78u2tUQn4oz",
  "onwA9NfZ61x8n7QAPnTVXpL7ZvR9C3gFATds1YDmFLGwAFrdgso",
];
const V1_OPERATION_HASHES = OPERATION_HASHES.slice(0, 4);

test("Macaroni projection never converts a failed big-map read into zero ownership", async () => {
  const missingMap = { async get() { return undefined; } };
  let ledgerReads = 0;
  const rateLimit = Object.assign(
    new Error('Http error response: (429) {"error_msg":"Rate limit exceeded"}'),
    { response: { status: 429 } },
  );
  const failingLedger = { async get() { ledgerReads += 1; throw rateLimit; } };
  const storage = {
    administrator: CREATOR,
    treasury: CREATOR,
    supply: 2,
    minted: 1,
    token_count: 1,
    locked: false,
    paused: false,
    delayed_reveal: true,
    placeholder_count: 1,
    reveal_cursor: 0,
    reveal_tail: 1,
    reveal_delay: 0,
    unrevealed_since: "2026-07-24T20:15:39Z",
    revealed: 0,
    minter_royalty_config: null,
    metadata: missingMap,
    stages: missingMap,
    pending_tokens: missingMap,
    token_metadata: missingMap,
    token_supply: missingMap,
    token_minted: missingMap,
    placeholder_pool: missingMap,
    token_placeholder: missingMap,
    reveal_queue: missingMap,
    ledger: failingLedger,
    stage_minted: missingMap,
  };
  const tezos = {
    contract: {
      async at() {
        return { async storage() { return storage; } };
      },
    },
  };

  await assert.rejects(
    readMacaroniBrowserProjection(tezos as any, CONTRACT, COLLECTOR),
    (error: any) => {
      assert.equal(error?.name, "ReadOnlyRetryExhaustedError");
      assert.equal(error?.cause, rateLimit);
      return true;
    },
  );
  assert.equal(ledgerReads, 8, "four bounded attempts must try both equivalent ledger key encodings");
});

test("Macaroni projection serializes big-map reads and resumes the failed field after a transient 429", async () => {
  let activeReads = 0;
  let maximumActiveReads = 0;
  let ledgerReads = 0;
  const valueMap = (label: string, transientLedger = false) => ({
    async get() {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeReads -= 1;
      if (transientLedger) {
        ledgerReads += 1;
        if (ledgerReads <= 2) {
          throw Object.assign(new Error(`${label} rate limited`), { status: 429 });
        }
      }
      return { label };
    },
  });
  const storage = {
    administrator: CREATOR,
    treasury: CREATOR,
    supply: 2,
    minted: 1,
    token_count: 1,
    locked: false,
    paused: false,
    delayed_reveal: true,
    placeholder_count: 1,
    reveal_cursor: 0,
    reveal_tail: 1,
    reveal_delay: 0,
    unrevealed_since: null,
    revealed: 0,
    minter_royalty_config: null,
    metadata: valueMap("metadata"),
    stages: valueMap("stage"),
    pending_tokens: valueMap("pending"),
    token_metadata: valueMap("token metadata"),
    token_supply: valueMap("supply"),
    token_minted: valueMap("minted"),
    placeholder_pool: valueMap("placeholder"),
    token_placeholder: valueMap("token placeholder"),
    reveal_queue: valueMap("reveal queue"),
    ledger: valueMap("ledger", true),
    stage_minted: valueMap("stage minted"),
  };
  const tezos = {
    contract: {
      async at() {
        return { async storage() { return storage; } };
      },
    },
  };

  const projection = await readMacaroniBrowserProjection(tezos as any, CONTRACT, COLLECTOR);
  assert.equal(maximumActiveReads, 1);
  assert.equal(ledgerReads, 3, "the retry must resume at the failed ledger field");
  assert.equal(projection.minted, 1);
  assert.deepEqual(projection.ledger, { [`${COLLECTOR}:0`]: { label: "ledger" } });
});

type FakeCall = {
  signer: string;
  entrypoint: string;
  payload: unknown;
  sendOptions: unknown;
};

type FakeMacaroniOperationRecord = {
  hash: string;
  signerAddress: string;
  action: PastaUiLiveAppliedOperationAssertion["action"];
  contractAddress: string;
  entrypoints: string[];
  status: "applied" | "rejected";
};

class FakeMacaroniFinality {
  readonly operations = new Map<string, FakeMacaroniOperationRecord>();
  private operationIndex = 0;

  constructor(private readonly hashes: readonly string[]) {}

  recordApplied(input: {
    signerAddress: string;
    action: PastaUiLiveAppliedOperationAssertion["action"];
    contractAddress: string;
    entrypoints: string[];
    apply: () => void;
  }): string {
    const hash = this.hashes[this.operationIndex];
    assert.ok(hash, "fake Macaroni operation hash fixture is exhausted");
    assert.equal(validateOperation(hash), ValidationResult.VALID, "fake Macaroni operation hash is invalid");
    assert.equal(this.operations.has(hash), false, "fake Macaroni operation hash must be unique");
    input.apply();
    this.operationIndex += 1;
    this.operations.set(hash, {
      hash,
      signerAddress: input.signerAddress,
      action: input.action,
      contractAddress: input.contractAddress,
      entrypoints: [...input.entrypoints],
      status: "applied",
    });
    return hash;
  }

  assertOperationApplied(
    assertion: PastaUiLiveAppliedOperationAssertion,
    signerAddress: string,
  ): void {
    assert.equal(validateOperation(assertion.operationHash), ValidationResult.VALID);
    assert.notEqual(assertion.action, "batch", "fake Macaroni chains do not apply batches");
    const operation = this.operations.get(assertion.operationHash);
    assert.ok(operation, `fake Macaroni operation ${assertion.operationHash} is unknown`);
    assert.equal(
      operation.status,
      "applied",
      `fake Macaroni operation ${assertion.operationHash} is ${operation.status}`,
    );
    assert.equal(operation.signerAddress, signerAddress, "fake Macaroni operation signer drift");
    assert.equal(operation.action, assertion.action, "fake Macaroni operation action drift");
    assert.equal(operation.contractAddress, assertion.contractAddress, "fake Macaroni operation contract drift");
    assert.deepEqual(operation.entrypoints, assertion.entrypoints, "fake Macaroni operation entrypoint drift");
  }
}

type FakeState = {
  originated: boolean;
  administrator: string;
  treasury: string;
  supply: number;
  minted: number;
  tokenCount: number;
  locked: boolean;
  paused: boolean;
  delayedReveal: boolean;
  placeholderCount: number;
  revealCursor: number;
  revealTail: number;
  revealDelay: number;
  unrevealedSince: unknown;
  revealed: number;
  minterRoyaltyConfig: unknown;
  maps: Record<string, Record<string, unknown>>;
  calls: FakeCall[];
  estimates: string[];
};

function fakeEstimateForEntrypoint(entrypoint: string) {
  const profile = {
    add_tokens_v2: { gasLimit: 16_003, storageLimit: 621 },
    add_tokens: { gasLimit: 16_003, storageLimit: 621 },
    set_stages: { gasLimit: 445, storageLimit: 24 },
    mint: { gasLimit: 6_909, storageLimit: 379 },
    reveal: { gasLimit: 2_484, storageLimit: 0 },
  }[entrypoint as "add_tokens_v2" | "add_tokens" | "set_stages" | "mint" | "reveal"];
  assert.ok(profile, `missing fake estimate for ${entrypoint}`);
  return {
    ...profile,
    suggestedFeeMutez: 977,
    minimalFeeMutez: 957,
    burnFeeMutez: profile.storageLimit * 250,
  };
}

function base32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function rawCid(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  return `b${base32(Uint8Array.from([1, 0x55, 0x12, 0x20, ...digest]))}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function numeric(value: unknown): number {
  const parsed = Number(value && typeof (value as any).toString === "function" ? (value as any).toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKey(key: unknown): string {
  if (key && typeof key === "object") {
    const record = key as Record<string, unknown>;
    if ("stage" in record && "holder" in record) return `${record.stage}:${record.holder}`;
    if ("owner" in record && "token_id" in record) return `${record.owner}:${record.token_id}`;
  }
  return String(key);
}

function recordFromMap(value: unknown): Record<string, unknown> {
  if (!(value instanceof MichelsonMap)) return {};
  return Object.fromEntries([...value.entries()].map(([key, child]) => [normalizeKey(key), child]));
}

function realDecodedStageMap(value: unknown): Record<string, unknown> {
  const records = recordFromMap(value);
  return Object.fromEntries(Object.entries(records).map(([key, child]) => {
    const stage = child as Record<string, unknown>;
    const maximum = stage.max_per_wallet;
    return [key, {
      start: String(stage.start),
      price: new BigNumber(numeric(stage.price)),
      use_allowlist: Boolean(stage.use_allowlist),
      max_per_wallet: maximum == null ? null : { Some: new BigNumber(numeric(maximum)) },
    }];
  }));
}

function fakeBigMap(values: Record<string, unknown>) {
  return {
    async get(key: unknown) {
      return values[normalizeKey(key)];
    },
  };
}

function createFakeChain() {
  const mapNames = [
    "metadata", "ledger", "operators", "token_metadata", "pending_tokens", "token_supply", "token_minted",
    "slots", "stages", "allowlist", "stage_minted", "placeholder_pool", "token_placeholder", "reveal_queue",
  ];
  const state: FakeState = {
    originated: false,
    administrator: "",
    treasury: "",
    supply: 0,
    minted: 0,
    tokenCount: 0,
    locked: false,
    paused: false,
    delayedReveal: true,
    placeholderCount: 0,
    revealCursor: 0,
    revealTail: 0,
    revealDelay: 0,
    unrevealedSince: null,
    revealed: 0,
    minterRoyaltyConfig: null,
    maps: Object.fromEntries(mapNames.map((name) => [name, {}])),
    calls: [],
    estimates: [],
  };
  const finality = new FakeMacaroniFinality(OPERATION_HASHES);

  function storage() {
    return {
      administrator: state.administrator,
      treasury: state.treasury,
      supply: state.supply,
      minted: state.minted,
      token_count: state.tokenCount,
      locked: state.locked,
      paused: state.paused,
      delayed_reveal: state.delayedReveal,
      placeholder_count: state.placeholderCount,
      reveal_cursor: state.revealCursor,
      reveal_tail: state.revealTail,
      reveal_delay: state.revealDelay,
      unrevealed_since: state.unrevealedSince,
      revealed: state.revealed,
      minter_royalty_config: state.minterRoyaltyConfig,
      ...Object.fromEntries(mapNames.map((name) => [name, fakeBigMap(state.maps[name])])),
    };
  }

  function applyCall(signer: string, entrypoint: string, payload: unknown, sendOptions: unknown): void {
    if (entrypoint === "mint" && numeric(state.maps.stage_minted[`0:${signer}`]) >= 1) {
      throw new Error("WALLET_LIMIT");
    }
    state.calls.push({ signer, entrypoint, payload, sendOptions });
    if (entrypoint === "add_tokens_v2") {
      assert.equal(signer, CREATOR);
      const rows = payload as Array<Record<string, unknown>>;
      assert.equal(rows.length, 1);
      const row = rows[0];
      state.maps.pending_tokens["0"] = { token_id: 0, token_info: row.token_info };
      state.maps.token_supply["0"] = numeric(row.quantity);
      state.maps.token_minted["0"] = 0;
      state.supply = numeric(row.quantity);
      state.tokenCount = 1;
      return;
    }
    if (entrypoint === "set_stages") {
      assert.equal(signer, CREATOR);
      state.maps.stages = realDecodedStageMap(payload);
      return;
    }
    if (entrypoint === "mint") {
      assert.equal(signer, COLLECTOR);
      assert.equal(numeric(payload), 1);
      assert.equal(numeric((sendOptions as Record<string, unknown>).amount), 1_000);
      assert.equal((sendOptions as Record<string, unknown>).mutez, true);
      const placeholder = state.maps.placeholder_pool["0"] as Record<string, unknown>;
      state.maps.token_metadata["0"] = { token_id: 0, token_info: placeholder.token_info };
      state.maps.token_placeholder["0"] = 0;
      state.maps.reveal_queue["0"] = 0;
      state.maps.ledger[`${COLLECTOR}:0`] = 1;
      state.maps.token_minted["0"] = 1;
      state.maps.stage_minted[`0:${COLLECTOR}`] = 1;
      state.minted = 1;
      state.revealTail = 1;
      state.unrevealedSince = { Some: new Date(Date.now() - 5_000).toISOString() };
      return;
    }
    if (entrypoint === "reveal") {
      assert.equal(signer, COLLECTOR);
      assert.equal(numeric(payload), 1);
      const finalRow = state.maps.pending_tokens["0"] as Record<string, unknown>;
      state.maps.token_metadata["0"] = { token_id: 0, token_info: finalRow.token_info };
      delete state.maps.token_placeholder["0"];
      state.revealCursor = 1;
      state.revealed = 1;
      state.unrevealedSince = null;
      return;
    }
    assert.fail(`unexpected fake Macaroni entrypoint ${entrypoint}`);
  }

  const contract = (signer: string) => ({
    address: CONTRACT,
    methodsObject: new Proxy({}, {
      get(_target, entrypoint) {
        if (typeof entrypoint !== "string") return undefined;
        return (payload: unknown) => ({
          toTransferParams(sendOptions: unknown = {}) {
            return {
              ...(sendOptions as object),
              to: CONTRACT,
              parameter: { entrypoint, value: payload },
            };
          },
          async send(sendOptions: unknown = {}) {
            const hash = finality.recordApplied({
              signerAddress: signer,
              action: "call",
              contractAddress: CONTRACT,
              entrypoints: [entrypoint],
              apply: () => applyCall(signer, entrypoint, payload, sendOptions),
            });
            return { hash, opHash: hash, async confirmation() { return 1; } };
          },
        });
      },
    }),
    async storage() {
      return storage();
    },
  });

  function toolkit(signer: string) {
    return {
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      estimate: {
        async transfer(params: Record<string, any>) {
          const entrypoint = String(params?.parameter?.entrypoint || "");
          state.estimates.push(entrypoint);
          if (entrypoint === "mint" && numeric(state.maps.stage_minted[`0:${signer}`]) >= 1) {
            throw new Error("WALLET_LIMIT");
          }
          return fakeEstimateForEntrypoint(entrypoint);
        },
      },
      contract: {
        async originate(input: { storage: Record<string, unknown> }) {
          const hash = finality.recordApplied({
            signerAddress: signer,
            action: "originate",
            contractAddress: CONTRACT,
            entrypoints: [],
            apply: () => {
              assert.equal(signer, CREATOR);
              assert.equal(state.originated, false);
              state.originated = true;
              state.administrator = String(input.storage.administrator);
              state.treasury = String(input.storage.treasury);
              state.supply = numeric(input.storage.supply);
              state.minted = numeric(input.storage.minted);
              state.tokenCount = numeric(input.storage.token_count);
              state.locked = Boolean(input.storage.locked);
              state.paused = Boolean(input.storage.paused);
              state.delayedReveal = Boolean(input.storage.delayed_reveal);
              state.placeholderCount = numeric(input.storage.placeholder_count);
              state.revealCursor = numeric(input.storage.reveal_cursor);
              state.revealTail = numeric(input.storage.reveal_tail);
              state.revealDelay = numeric(input.storage.reveal_delay);
              state.unrevealedSince = input.storage.unrevealed_since as null;
              state.revealed = numeric(input.storage.revealed);
              state.minterRoyaltyConfig = input.storage.minter_royalty_config;
              for (const name of mapNames) state.maps[name] = recordFromMap(input.storage[name]);
            },
          });
          return {
            hash,
            async confirmation() { return 1; },
            async contract() { return contract(signer); },
          };
        },
        async at(address: string) {
          assert.equal(address, CONTRACT);
          return contract(signer);
        },
      },
    } as any;
  }

  return { state, finality, creatorTezos: toolkit(CREATOR), collectorTezos: toolkit(COLLECTOR) };
}

function createFakeV1Chain() {
  const mapNames = [
    "metadata", "ledger", "operators", "token_metadata", "pending_tokens", "slots", "stages",
    "allowlist", "stage_minted", "placeholder",
  ];
  const state = {
    originated: false,
    administrator: "",
    treasury: "",
    supply: 0,
    minted: 0,
    locked: false,
    paused: false,
    delayedReveal: false,
    revealDelay: 604800,
    unrevealedSince: null as unknown,
    revealed: 0,
    seedSalt: "00",
    entropy: "00",
    maps: Object.fromEntries(mapNames.map((name) => [name, {}])) as Record<string, Record<string, unknown>>,
    calls: [] as FakeCall[],
    estimates: [] as string[],
  };
  const finality = new FakeMacaroniFinality(V1_OPERATION_HASHES);

  function storage() {
    return {
      administrator: state.administrator,
      treasury: state.treasury,
      supply: state.supply,
      minted: state.minted,
      locked: state.locked,
      paused: state.paused,
      delayed_reveal: state.delayedReveal,
      reveal_delay: state.revealDelay,
      unrevealed_since: state.unrevealedSince,
      revealed: state.revealed,
      seed_salt: state.seedSalt,
      entropy: state.entropy,
      ...Object.fromEntries(mapNames.map((name) => [name, fakeBigMap(state.maps[name])])),
    };
  }

  function applyCall(signer: string, entrypoint: string, payload: unknown, sendOptions: unknown): void {
    if (entrypoint === "mint" && state.minted >= state.supply) throw new Error("SOLD_OUT");
    state.calls.push({ signer, entrypoint, payload, sendOptions });
    if (entrypoint === "add_tokens") {
      assert.equal(signer, CREATOR);
      const rows = payload as Array<Record<string, unknown>>;
      assert.equal(rows.length, 1);
      assert.equal("quantity" in rows[0], false);
      state.maps.pending_tokens["0"] = { token_id: 0, token_info: rows[0].token_info };
      state.supply = 1;
      return;
    }
    if (entrypoint === "set_stages") {
      assert.equal(signer, CREATOR);
      state.maps.stages = realDecodedStageMap(payload);
      return;
    }
    if (entrypoint === "mint") {
      assert.equal(signer, COLLECTOR);
      assert.equal(numeric(payload), 1);
      assert.equal(numeric((sendOptions as Record<string, unknown>).amount), 1_000);
      assert.equal((sendOptions as Record<string, unknown>).mutez, true);
      const finalRow = state.maps.pending_tokens["0"] as Record<string, unknown>;
      state.maps.ledger["0"] = COLLECTOR;
      state.maps.token_metadata["0"] = { token_id: 0, token_info: finalRow.token_info };
      state.maps.stage_minted[`0:${COLLECTOR}`] = 1;
      delete state.maps.pending_tokens["0"];
      delete state.maps.slots["0"];
      state.locked = true;
      state.minted = 1;
      state.revealed = 1;
      state.unrevealedSince = null;
      return;
    }
    assert.fail(`unexpected fake Macaroni V1 entrypoint ${entrypoint}`);
  }

  const contract = (signer: string) => ({
    address: V1_CONTRACT,
    methodsObject: new Proxy({}, {
      get(_target, entrypoint) {
        if (typeof entrypoint !== "string") return undefined;
        return (payload: unknown) => ({
          toTransferParams(sendOptions: unknown = {}) {
            return {
              ...(sendOptions as object),
              to: V1_CONTRACT,
              parameter: { entrypoint, value: payload },
            };
          },
          async send(sendOptions: unknown = {}) {
            const hash = finality.recordApplied({
              signerAddress: signer,
              action: "call",
              contractAddress: V1_CONTRACT,
              entrypoints: [entrypoint],
              apply: () => applyCall(signer, entrypoint, payload, sendOptions),
            });
            return { hash, opHash: hash, async confirmation() { return 1; } };
          },
        });
      },
    }),
    async storage() {
      return storage();
    },
  });

  function toolkit(signer: string) {
    return {
      tz: {
        async getBalance() {
          return { toString: () => "5000000" };
        },
      },
      estimate: {
        async transfer(params: Record<string, any>) {
          const entrypoint = String(params?.parameter?.entrypoint || "");
          state.estimates.push(entrypoint);
          if (entrypoint === "mint" && state.minted >= state.supply) {
            throw new Error("SOLD_OUT");
          }
          return fakeEstimateForEntrypoint(entrypoint);
        },
      },
      contract: {
        async originate(input: { storage: Record<string, unknown> }) {
          const hash = finality.recordApplied({
            signerAddress: signer,
            action: "originate",
            contractAddress: V1_CONTRACT,
            entrypoints: [],
            apply: () => {
              assert.equal(signer, CREATOR);
              assert.equal(state.originated, false);
              state.originated = true;
              state.administrator = String(input.storage.administrator);
              state.treasury = String(input.storage.treasury);
              state.supply = numeric(input.storage.supply);
              state.minted = numeric(input.storage.minted);
              state.locked = Boolean(input.storage.locked);
              state.paused = Boolean(input.storage.paused);
              state.delayedReveal = Boolean(input.storage.delayed_reveal);
              state.revealDelay = numeric(input.storage.reveal_delay);
              state.unrevealedSince = input.storage.unrevealed_since as null;
              state.revealed = numeric(input.storage.revealed);
              state.seedSalt = String(input.storage.seed_salt);
              state.entropy = String(input.storage.entropy);
              for (const name of mapNames) state.maps[name] = recordFromMap(input.storage[name]);
            },
          });
          return {
            hash,
            async confirmation() { return 1; },
            async contract() { return contract(signer); },
          };
        },
        async at(address: string) {
          assert.equal(address, V1_CONTRACT);
          return contract(signer);
        },
      },
    } as any;
  }

  return { state, finality, creatorTezos: toolkit(CREATOR), collectorTezos: toolkit(COLLECTOR) };
}

function createPinService() {
  const store = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const proofs: PastaUiLivePinProof[] = [];
  function proofFor(bytes: Uint8Array, fileName: string, mimeType: string): PastaUiLivePinProof {
    const copy = Uint8Array.from(bytes);
    const cid = rawCid(copy);
    store.set(cid, { bytes: copy, mimeType });
    const proof: PastaUiLivePinProof = {
      cid,
      uri: `ipfs://${cid}`,
      fileName,
      mimeType,
      byteLength: copy.byteLength,
      sha256: sha256(copy),
      localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
      publicGatewayUrl: `https://proof.invalid/ipfs/${cid}`,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    };
    proofs.push(proof);
    return proof;
  }
  return {
    store,
    proofs,
    pinJson: async ({ value, fileName }: { value: unknown; fileName: string }) =>
      proofFor(deterministicJsonBytes(value), fileName, "application/json"),
    pinBlob: async ({ bytes, fileName, mimeType }: { bytes: Uint8Array; fileName: string; mimeType: string }) =>
      proofFor(bytes, fileName, mimeType),
  };
}

async function installProofGateway(
  context: BrowserContext,
  store: Map<string, { bytes: Uint8Array; mimeType: string }>,
): Promise<void> {
  await context.route("https://proof.invalid/ipfs/**", async (route) => {
    const cid = new URL(route.request().url()).pathname.split("/").at(-1) || "";
    const record = store.get(cid);
    if (!record) {
      await route.fulfill({ status: 404, body: "missing fake pin" });
      return;
    }
    await route.fulfill({
      status: 200,
      body: Buffer.from(record.bytes),
      contentType: record.mimeType,
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    });
  });
}

async function installStudioRoutes(context: BrowserContext): Promise<void> {
  await context.route("**/api/profile/social", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await context.route("**/api/macaroni/installers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"installers":[]}' }));
  await context.route("**/export", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":false,"error":"test ZIP fallback"}' }));
}

async function waitForText(page: Page, selector: string, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    ({ target, expected }) => document.querySelector(target)?.textContent?.includes(expected),
    { target: selector, expected: text },
    { timeout },
  );
}

async function captureMock(
  page: Page,
  monitor: ReturnType<typeof monitorPastaProofPage>,
  outputRoot: string,
  ordinal: number,
  stageName: string,
  evidence: Array<{ selector: string; name: string; expectedText: string | RegExp }>,
  focusSelector?: string,
): Promise<CapturePastaProofStageResult> {
  if (focusSelector) {
    await page.locator(focusSelector).scrollIntoViewIfNeeded();
  }
  return capturePastaProofStage({
    page,
    monitor,
    outputRoot,
    app: "macaroni",
    capability: "actual page fake-chain choreography",
    stageOrdinal: ordinal,
    stageName,
    classification: "UI-MOCK",
    requiredEvidence: evidence,
    waitForLoadState: "none",
    timeoutMs: 30_000,
  });
}

async function extractArchive(files: Record<string, Uint8Array>, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const output = path.join(destination, ...name.split("/"));
    assert.ok(path.resolve(output).startsWith(`${path.resolve(destination)}${path.sep}`));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
}

test("Macaroni collector stage start is expressed in the proof browser's UTC wall clock", () => {
  assert.equal(
    macaroniCollectorStageStartUtc(Date.parse("2026-08-08T13:40:00.000Z")),
    "2026-08-08T13:38",
  );
});

test("Macaroni actual Studio exports an actual collector page that mints sealed, enforces wallet policy, and reveals", async (t) => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "macaroni-ui-live-test-"));
  const chain = createFakeChain();
  const pins = createPinService();
  const captures: CapturePastaProofStageResult[] = [];
  const code = JSON.parse(await readFile(path.join(root, "public", "creation-tools", "macaroni", "contract", "macaroni-v2.contract.json"), "utf8"));
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => undefined);
    await rm(outputRoot, { recursive: true, force: true });
  });
  let creatorProjection: any = {};
  const expectedCodeHash = hashJsonForBridge(code);
  const creatorBootstrapSession = new TaquitoPastaUiLiveSession({
    tezos: chain.creatorTezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set<string>(),
    assertExpectedChain: async () => CHAIN_ID,
    assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, CREATOR),
    pinJson: pins.pinJson,
    pinBlob: pins.pinBlob,
    projectStorage: () => creatorProjection,
  });
  creatorBootstrapSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 1,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 1,
  });
  let creatorContractSession: TaquitoPastaUiLiveSession | null = null;
  let originationReceipt: any = null;
  const creatorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: async (request) => {
      if (request.action !== "originate") {
        return (creatorContractSession || creatorBootstrapSession).handle(request);
      }
      const decoded = decodeMacaroniCanonicalOriginationRequest(request, expectedCodeHash);
      const storage = decoded.storage as Record<string, unknown>;
      assert.equal(storage.administrator, CREATOR);
      assert.equal(storage.delayed_reveal, true);
      assert.equal(storage.reveal_delay, 0);
      assert.equal(storage.placeholder_count, 1);
      const operation = await chain.creatorTezos.contract.originate({ code, storage });
      await operation.confirmation(1);
      await operation.contract();
      chain.finality.assertOperationApplied({
        action: "originate",
        operationHash: operation.hash,
        contractAddress: CONTRACT,
        entrypoints: [],
      }, CREATOR);
      originationReceipt = {
        schema: "pastaprotocol-ui-live-receipt@1",
        sequence: creatorBootstrapSession.getReceipts().length + 1,
        timestampUtc: new Date().toISOString(),
        action: "originate",
        chainId: CHAIN_ID,
        signerAddress: CREATOR,
        contractAddress: CONTRACT,
        operationHash: operation.hash,
      };
      creatorProjection = await readMacaroniBrowserProjection(chain.creatorTezos, CONTRACT, CREATOR);
      creatorContractSession = new TaquitoPastaUiLiveSession({
        tezos: chain.creatorTezos,
        signerAddress: CREATOR,
        expectedChainId: CHAIN_ID,
        allowedContractAddresses: new Set([CONTRACT]),
        allowedEntrypoints: new Set(["add_tokens_v2", "set_stages"]),
        assertExpectedChain: async () => CHAIN_ID,
        assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, CREATOR),
        pinJson: pins.pinJson,
        validateCall: ({ entrypoint, payload }) => {
          if (entrypoint === "add_tokens_v2") {
            const row = (payload as Array<Record<string, unknown>>)[0];
            assert.equal(numeric(row.quantity), 2);
          } else {
            assert.equal(entrypoint, "set_stages");
            assert.ok(payload instanceof MichelsonMap);
          }
        },
        projectStorage: () => creatorProjection,
        onReceipt: async (receipt) => {
          if (receipt.operationHash) {
            creatorProjection = await readMacaroniBrowserProjection(chain.creatorTezos, CONTRACT, CREATOR);
          }
        },
      });
      creatorContractSession.authorizeAfterFundingPreflight({
        balanceMutez: 5_000_000,
        requiredBalanceMutez: 1,
        estimatedOriginationMutez: 0,
        operationReserveMutez: 1,
      });
      return { contractAddress: CONTRACT, operationHash: operation.hash, confirmationLevel: 1, receipt: originationReceipt };
    },
  });
  let siteBytes = new Uint8Array();
  let finalMetadataUri = "";
  let placeholderMetadataUri = "";
  try {
    const context = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      acceptDownloads: true,
    });
    await installProofGateway(context, pins.store);
    await installStudioRoutes(context);
    await context.route("https://api.shadownet.tzkt.io/v1/operations/**", async (route) => {
      const hash = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) || "");
      const backtracked = hash === OPERATION_HASHES[1];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          hash,
          target: { address: CONTRACT },
          parameter: { entrypoint: "add_tokens_v2" },
          status: backtracked ? "backtracked" : "applied",
          errors: backtracked ? [{ type: "storage_exhausted.operation" }] : null,
        }]),
      });
    });
    const page = await context.newPage();
    const monitor = monitorPastaProofPage(page);
    try {
      await page.goto(`${creatorServer.origin}/creation-tools/macaroni/studio.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).MD && (window as any).MDSiteBundle));
      await assert.doesNotReject(() => page.evaluate(async ({ hash, contractAddress }) => {
        await (window as any).MD.assertOperationApplied(
          { hash },
          { network: "shadownet", contractAddress, entrypoint: "add_tokens_v2", attempts: 1, delayMs: 0 },
        );
      }, { hash: OPERATION_HASHES[0], contractAddress: CONTRACT }));
      await assert.rejects(
        () => page.evaluate(async ({ hash, contractAddress }) => {
          await (window as any).MD.assertOperationApplied(
            { hash },
            { network: "shadownet", contractAddress, entrypoint: "add_tokens_v2", attempts: 1, delayMs: 0 },
          );
        }, { hash: OPERATION_HASHES[1], contractAddress: CONTRACT }),
        /backtracked.*storage_exhausted\.operation/,
      );
      await installPastaUiLiveBrowserProxy(page, creatorServer, "UI-MOCK");
      await installMacaroniBrowserAdapters(page, "https://proof.invalid/ipfs", expectedCodeHash);
      await page.click("#btnConnect");
      await waitForText(page, "#log", `wallet connected: ${CREATOR}`);
      await configureMacaroniStudio(page, "http://127.0.0.1:5001", "test-run");
      captures.push(await captureMock(page, monitor, outputRoot, 1, "configured", [
        { selector: ".brand", name: "application", expectedText: "Macaroni" },
        { selector: "#log", name: "creator", expectedText: CREATOR },
        { selector: "#tokenSummary", name: "supply", expectedText: "2 editions" },
      ]));

      await page.click("#btnPin");
      await waitForText(page, "#pinStatus", "all pinned ✓");
      assert.equal(pins.proofs.length, 5);
      await page.click("#btnDeploy");
      try {
        await waitForText(page, "#deployStatus", "deployed ✓");
      } catch (error) {
        assert.fail(`deploy did not complete: status=${await page.textContent("#deployStatus")} log=${await page.textContent("#log")} cause=${error instanceof Error ? error.message : String(error)}`);
      }
      assert.equal((await page.inputValue("#contractAddr")), CONTRACT);
      await page.click("#btnSync");
      await waitForMacaroniSyncOutcome(page, { timeout: 30_000, pollInterval: 10 });
      assert.equal(chain.state.supply, 2);
      assert.equal(Object.keys(chain.state.maps.stages).length, 1);
      const v2StorageModel = await page.evaluate(() => ({
        one: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 1 }),
        fullChunk: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 40 }),
        protocolCap: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 100 }),
      }));
      assert.deepEqual(v2StorageModel, { one: 1_300, fullChunk: 36_400, protocolCap: 60_000 });
      for (const call of chain.state.calls.filter(({ signer }) => signer === CREATOR)) {
        const options = call.sendOptions as Record<string, unknown>;
        const fee = numeric(options.fee);
        const gasLimit = numeric(options.gasLimit);
        const safeFallbackFloor = Math.ceil((100 + 1_800 + gasLimit * 0.1) * 1.2 + 1_000);
        assert.notEqual(fee, 2_500, "Macaroni UI-live must never restore the rejected fixed fee");
        assert.ok(gasLimit > 0, "Macaroni app estimator must provide a bounded gas limit");
        assert.ok(fee >= safeFallbackFloor, "Macaroni app estimator fee must cover its gas/byte-derived floor");
        if (call.entrypoint === "add_tokens_v2") {
          assert.ok(numeric(options.storageLimit) >= 621, "V2 inventory fallback must cover the observed 621-byte write");
        }
      }
      assert.equal(pins.proofs.length, 6);
      finalMetadataUri = pins.proofs.find((proof) => proof.fileName === "1.json")?.uri || "";
      placeholderMetadataUri = pins.proofs.find((proof) => proof.fileName === "placeholder-1.json")?.uri || "";
      captures.push(await captureMock(page, monitor, outputRoot, 2, "deployed and synced", [
        { selector: "#deployStatus", name: "sync", expectedText: "in sync ✓" },
        { selector: "#log", name: "contract", expectedText: CONTRACT },
        { selector: "#log", name: "chain state", expectedText: "drop is live on-chain" },
      ]));

      await page.click("#tabPage");
      const downloadPromise = page.waitForEvent("download");
      await page.click("#btnExport");
      const download = await downloadPromise;
      const zipPath = path.join(outputRoot, "macaroni-site.zip");
      await download.saveAs(zipPath);
      await waitForText(page, "#exportStatus", "Downloaded macaroni-site.zip");
      siteBytes = await readFile(zipPath);
      validateMacaroniSiteArchive(siteBytes, {
        contractAddress: CONTRACT,
        finalMetadataUri,
        placeholderMetadataUri,
      });
      captures.push(await captureMock(page, monitor, outputRoot, 3, "self hosted site exported", [
        { selector: "#exportStatus", name: "export", expectedText: "Downloaded macaroni-site.zip" },
        { selector: "#codeStatus", name: "drop config", expectedText: "generated from controls" },
      ]));
    } finally {
      monitor.dispose();
      await context.close();
    }
  } finally {
    await creatorServer.close();
  }

  const siteRoot = path.join(outputRoot, "site");
  await extractArchive(unzipSync(siteBytes), siteRoot);
  let collectorProjection = await readMacaroniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
  const v2Stage = collectorProjection.stages["0"] as Record<string, unknown>;
  assert.deepEqual(v2Stage.max_per_wallet, { Some: 1 });
  assert.equal(v2Stage.price, 1000);
  assert.equal(Number.isNaN(new Date(String(v2Stage.start)).getTime()), false);
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.collectorTezos,
    signerAddress: COLLECTOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([CONTRACT]),
    allowedEntrypoints: new Set(["mint", "reveal"]),
    assertExpectedChain: async () => CHAIN_ID,
    assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, COLLECTOR),
    pinJson: pins.pinJson,
    validateCall: ({ entrypoint, payload }) => {
      assert.ok(["mint", "reveal"].includes(entrypoint));
      assert.equal(numeric(payload), 1);
    },
    projectStorage: async () => {
      if (chain.state.minted > 0) await new Promise((resolve) => setTimeout(resolve, 250));
      collectorProjection = await readMacaroniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
      return collectorProjection;
    },
    onReceipt: async (receipt) => {
      if (receipt.operationHash) {
        collectorProjection = await readMacaroniBrowserProjection(chain.collectorTezos, CONTRACT, COLLECTOR);
        if (receipt.entrypoints?.includes("mint")) {
          collectorProjection = { ...collectorProjection, stage_minted: {} };
        }
      }
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 1,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 1,
  });
  const collectorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: siteRoot,
    handleAction: (request) => collectorSession.handle(request),
  });
  try {
    const context = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await installProofGateway(context, pins.store);
    const page = await context.newPage();
    const monitor = monitorPastaProofPage(page);
    try {
      await page.goto(`${collectorServer.origin}/index.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
      await installPastaUiLiveBrowserProxy(page, collectorServer, "UI-MOCK");
      await installMacaroniBrowserAdapters(page, "https://proof.invalid/ipfs");
      await page.evaluate(() => (window as any).refresh());
      await waitForText(page, "#supplyText", "0 / 2 minted");
      await page.waitForFunction(() => !(document.getElementById("btnConnect") as HTMLButtonElement).disabled);
      await page.click("#btnConnect");
      await waitForText(page, "#walletLimitStatus", "0/1");
      const fallbackProfile = await page.evaluate(async () => {
        const md = (window as any).MD;
        const toolkit = md.getToolkit();
        const estimate = toolkit.estimate;
        toolkit.estimate = undefined;
        try {
          const contract = await toolkit.contract.at((window as any).DROP_CONFIG.contract);
          return await md.estimateWalletOp(
            contract.methodsObject.mint(1),
            { amount: 1_000, mutez: true },
            { gasPerUnit: 50_000, units: 1, storageBase: 400, storagePerUnit: 900 },
          );
        } finally {
          toolkit.estimate = estimate;
        }
      });
      assert.deepEqual(fallbackProfile, {
        fee: 9_280,
        gasLimit: 50_000,
        storageLimit: 1_300,
        storageFeeMutez: 325_000,
        estimated: false,
      });
      assert.equal(
        macaroniManagerOperationFitsBlock(937_746, numeric(fallbackProfile.gasLimit)),
        true,
        "one-unit Macaroni fallback must fit the observed rollup-saturated manager block",
      );
      captures.push(await captureMock(page, monitor, outputRoot, 4, "exported collector connected", [
        { selector: "#brand", name: "application", expectedText: "Macaroni" },
        { selector: "#title", name: "drop", expectedText: "Macaroni UI-LIVE test-run" },
        { selector: "#supplyText", name: "supply", expectedText: "0 / 2 minted" },
        { selector: "#walletLimitStatus", name: "limit", expectedText: "0/1" },
      ]));

      await page.click("#btnMint");
      await waitForText(page, "#mintStatus", "minted ✓");
      assert.match(
        await page.locator("#walletLimitStatus").innerText(),
        /1\/1/,
        "Macaroni must await a fresh Taquito-shaped stage_minted read before reporting mint success",
      );
      const taquitoShapeMinted = await page.evaluate(async (holder) => {
        const toolkit = (window as any).MD.getToolkit();
        const contract = await toolkit.contract.at((window as any).DROP_CONFIG.contract);
        const storage = await contract.storage();
        return storage.stage_minted.get({ holder, stage: 0 });
      }, COLLECTOR);
      assert.equal(numeric(taquitoShapeMinted), 1);
      assert.equal(typeof collectorProjection.unrevealed_since, "string");
      assert.equal(Number.isNaN(new Date(String(collectorProjection.unrevealed_since)).getTime()), false);
      await page.evaluate(async () => {
        await (window as any).refresh();
        await (window as any).loadOwnedMints();
      });
      await page.waitForFunction(() => document.querySelector('#revealGrid [data-token-id="0"]')?.classList.contains("sealed") === true);
      await waitForText(page, "#walletLimitStatus", "1/1");
      await assertMacaroniUiDecodeSafe(page);
      assert.equal(await page.locator("#btnMint").isDisabled(), true);
      const callsBeforeDisabledClick = chain.state.calls.length;
      await page.evaluate(() => (document.getElementById("btnMint") as HTMLButtonElement).click());
      await page.waitForTimeout(100);
      assert.equal(chain.state.calls.length, callsBeforeDisabledClick);
      captures.push(await captureMock(page, monitor, outputRoot, 5, "sealed mint and wallet limit", [
        { selector: "#supplyText", name: "minted", expectedText: "1 / 2 minted" },
        { selector: "#walletLimitStatus", name: "limit", expectedText: "1/1" },
        { selector: '#revealGrid [data-token-id="0"]', name: "sealed", expectedText: "unrevealed" },
      ]));

      const boundaryContract = await chain.collectorTezos.contract.at(CONTRACT);
      await assert.rejects(
        () => boundaryContract.methodsObject.mint(1).send({ amount: 1_000, mutez: true }),
        /WALLET_LIMIT/,
      );

      await page.waitForSelector("#btnReveal", { state: "visible" });
      await page.click("#btnReveal");
      await waitForText(page, "#revealOpStatus", "revealed ✓");
      await page.waitForFunction(() => {
        const card = document.querySelector('#revealGrid [data-token-id="0"]');
        return Boolean(card && !card.classList.contains("sealed") && card.textContent?.includes("Macaroni Revealed Proof"));
      });
      captures.push(await captureMock(page, monitor, outputRoot, 6, "revealed final metadata", [
        { selector: "#supplyText", name: "final supply", expectedText: "1 / 2 minted" },
        { selector: '#revealGrid [data-token-id="0"]', name: "final token", expectedText: "Macaroni Revealed Proof" },
      ]));
    } finally {
      monitor.dispose();
      await context.close();
    }
  } finally {
    await collectorServer.close();
    await browser.close();
  }

  try {
    assert.deepEqual(chain.state.calls.map(({ signer, entrypoint }) => ({ signer, entrypoint })), [
      { signer: CREATOR, entrypoint: "add_tokens_v2" },
      { signer: CREATOR, entrypoint: "set_stages" },
      { signer: COLLECTOR, entrypoint: "mint" },
      { signer: COLLECTOR, entrypoint: "reveal" },
    ]);
    assert.deepEqual(chain.state.estimates, ["add_tokens_v2", "set_stages", "mint", "mint", "reveal"]);
    const mintCall = chain.state.calls.find(({ signer, entrypoint }) => signer === COLLECTOR && entrypoint === "mint");
    assert.ok(mintCall);
    assert.equal(numeric((mintCall.sendOptions as Record<string, unknown>).gasLimit), 51_400);
    assert.equal(
      macaroniManagerOperationFitsBlock(
        937_746,
        numeric((mintCall.sendOptions as Record<string, unknown>).gasLimit),
      ),
      true,
      "estimated Macaroni mint must fit the observed rollup-saturated manager block",
    );
    assert.equal(chain.state.supply, 2);
    assert.equal(chain.state.minted, 1);
    assert.equal(chain.state.revealed, 1);
    assert.equal(chain.state.revealCursor, 1);
    assert.equal(chain.state.revealTail, 1);
    assert.equal(chain.state.maps.ledger[`${COLLECTOR}:0`], 1);
    assert.equal(chain.state.maps.stage_minted[`0:${COLLECTOR}`], 1);
    assert.ok(originationReceipt);
    const finalizedCreatorContractSession = creatorContractSession as TaquitoPastaUiLiveSession | null;
    assert.ok(finalizedCreatorContractSession);
    const creatorReceipts = [
      ...creatorBootstrapSession.getReceipts(),
      originationReceipt,
      ...finalizedCreatorContractSession.getReceipts(),
    ];
    assert.equal(creatorReceipts.filter((receipt) => receipt.operationHash).length, 3);
    assert.equal(collectorSession.getReceipts().filter((receipt) => receipt.operationHash).length, 2);
    assert.deepEqual(
      [...creatorReceipts, ...collectorSession.getReceipts()]
        .filter((receipt) => receipt.operationHash)
        .map((receipt) => receipt.operationHash),
      OPERATION_HASHES,
    );
    assert.equal(captures.length, 6);
    for (const capture of captures) {
      assert.equal(capture.sidecar.classification, "UI-MOCK");
      await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Macaroni V1 actual Studio exports an actual collector page that instant-mints final metadata", async (t) => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "macaroni-v1-ui-live-test-"));
  const chain = createFakeV1Chain();
  const pins = createPinService();
  const captures: CapturePastaProofStageResult[] = [];
  const code = JSON.parse(await readFile(
    path.join(root, "public", "creation-tools", "macaroni", "contract", "mydrop.contract.json"),
    "utf8",
  ));
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => undefined);
    await rm(outputRoot, { recursive: true, force: true });
  });
  let creatorProjection: Record<string, unknown> = {};
  const expectedCodeHash = hashJsonForBridge(code);
  const creatorBootstrapSession = new TaquitoPastaUiLiveSession({
    tezos: chain.creatorTezos,
    signerAddress: CREATOR,
    expectedChainId: CHAIN_ID,
    allowedEntrypoints: new Set<string>(),
    assertExpectedChain: async () => CHAIN_ID,
    assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, CREATOR),
    pinJson: pins.pinJson,
    pinBlob: pins.pinBlob,
    projectStorage: () => creatorProjection,
  });
  creatorBootstrapSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 1,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 1,
  });
  let creatorContractSession: TaquitoPastaUiLiveSession | null = null;
  let originationReceipt: any = null;
  const creatorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: async (request) => {
      if (request.action !== "originate") {
        return (creatorContractSession || creatorBootstrapSession).handle(request);
      }
      const { storage } = decodeMacaroniCanonicalOriginationRequest(request, expectedCodeHash);
      const decodedStorage = storage as Record<string, unknown>;
      assert.equal(decodedStorage.administrator, CREATOR);
      assert.equal(decodedStorage.delayed_reveal, false);
      assert.equal("token_supply" in decodedStorage, false);
      const operation = await chain.creatorTezos.contract.originate({ code, storage: decodedStorage });
      await operation.confirmation(1);
      await operation.contract();
      chain.finality.assertOperationApplied({
        action: "originate",
        operationHash: operation.hash,
        contractAddress: V1_CONTRACT,
        entrypoints: [],
      }, CREATOR);
      originationReceipt = {
        schema: "pastaprotocol-ui-live-receipt@1",
        sequence: creatorBootstrapSession.getReceipts().length + 1,
        timestampUtc: new Date().toISOString(),
        action: "originate",
        chainId: CHAIN_ID,
        signerAddress: CREATOR,
        contractAddress: V1_CONTRACT,
        operationHash: operation.hash,
      };
      creatorProjection = await readMacaroniV1BrowserProjection(chain.creatorTezos, V1_CONTRACT, CREATOR);
      creatorContractSession = new TaquitoPastaUiLiveSession({
        tezos: chain.creatorTezos,
        signerAddress: CREATOR,
        expectedChainId: CHAIN_ID,
        allowedContractAddresses: new Set([V1_CONTRACT]),
        allowedEntrypoints: new Set(["add_tokens", "set_stages"]),
        assertExpectedChain: async () => CHAIN_ID,
        assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, CREATOR),
        pinJson: pins.pinJson,
        validateCall: ({ entrypoint, payload }) => {
          if (entrypoint === "add_tokens") {
            const row = (payload as Array<Record<string, unknown>>)[0];
            assert.equal("quantity" in row, false);
            assert.equal(numeric(row.token_id), 0);
          } else {
            assert.equal(entrypoint, "set_stages");
            assert.ok(payload instanceof MichelsonMap);
          }
        },
        projectStorage: () => creatorProjection,
        onReceipt: async (receipt) => {
          if (receipt.operationHash) {
            creatorProjection = await readMacaroniV1BrowserProjection(chain.creatorTezos, V1_CONTRACT, CREATOR);
          }
        },
      });
      creatorContractSession.authorizeAfterFundingPreflight({
        balanceMutez: 5_000_000,
        requiredBalanceMutez: 1,
        estimatedOriginationMutez: 0,
        operationReserveMutez: 1,
      });
      return {
        contractAddress: V1_CONTRACT,
        operationHash: operation.hash,
        confirmationLevel: 1,
        receipt: originationReceipt,
      };
    },
  });
  let siteBytes = new Uint8Array();
  try {
    const context = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      acceptDownloads: true,
    });
    await installProofGateway(context, pins.store);
    await installStudioRoutes(context);
    const page = await context.newPage();
    const monitor = monitorPastaProofPage(page);
    try {
      await page.goto(`${creatorServer.origin}/creation-tools/macaroni/studio.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).MD && (window as any).MDSiteBundle));
      await installPastaUiLiveBrowserProxy(page, creatorServer, "UI-MOCK");
      await installMacaroniBrowserAdapters(page, "https://proof.invalid/ipfs", expectedCodeHash);
      await page.click("#btnConnect");
      await waitForText(page, "#log", `wallet connected: ${CREATOR}`);
      await configureMacaroniV1Studio(page, "http://127.0.0.1:5001", "v1-test-run");
      assert.equal(await page.inputValue("#contractVersion"), "macaroni-v1");
      await waitForText(page, "#tokenSummary", "1 edition");

      await page.click("#btnPin");
      await waitForText(page, "#pinStatus", "all pinned ✓");
      assert.deepEqual(pins.proofs.map((proof) => proof.fileName), ["macaroni-v1-cover.png", "1.png", "1.json"]);
      await page.click("#btnDeploy");
      await waitForText(page, "#deployStatus", "deployed ✓");
      assert.equal(await page.inputValue("#contractAddr"), V1_CONTRACT);
      assert.equal(pins.proofs.at(-1)?.fileName, "contract_metadata.json");
      await page.click("#btnSync");
      await waitForMacaroniSyncOutcome(page, { timeout: 30_000, pollInterval: 10 });
      assert.equal(await page.locator("#viewDrop").isVisible(), true);
      captures.push(await captureMock(
        page,
        monitor,
        outputRoot,
        12,
        "V1 contract visibly synchronized",
        [
          { selector: "#deployStatus", name: "sync", expectedText: "in sync ✓" },
          { selector: "#log", name: "live drop", expectedText: "drop is live on-chain" },
        ],
        "#secDeploy",
      ));
      assert.equal(await page.locator("#secDeploy").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      }), true, "V1 sync capture target must intersect the screenshot viewport");
      assert.equal(chain.state.supply, 1);
      assert.ok(chain.state.maps.pending_tokens["0"]);
      const v1StorageModel = await page.evaluate(() => ({
        one: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 1 }),
        fullChunk: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 40 }),
        protocolCap: (window as any).MD.fallbackStorageLimit({ storageBase: 400, storagePerUnit: 900, units: 100 }),
      }));
      assert.deepEqual(v1StorageModel, { one: 1_300, fullChunk: 36_400, protocolCap: 60_000 });
      for (const call of chain.state.calls.filter(({ signer }) => signer === CREATOR)) {
        const options = call.sendOptions as Record<string, unknown>;
        const fee = numeric(options.fee);
        const gasLimit = numeric(options.gasLimit);
        const safeFallbackFloor = Math.ceil((100 + 1_800 + gasLimit * 0.1) * 1.2 + 1_000);
        assert.notEqual(fee, 2_500, "Macaroni V1 UI-live must never restore the rejected fixed fee");
        assert.ok(gasLimit > 0, "Macaroni V1 app estimator must provide a bounded gas limit");
        assert.ok(fee >= safeFallbackFloor, "Macaroni V1 app estimator fee must cover its gas/byte-derived floor");
        if (call.entrypoint === "add_tokens") {
          assert.ok(numeric(options.storageLimit) >= 621, "V1 inventory fallback must conservatively cover the observed V2 write");
        }
      }

      const finalMetadataUri = pins.proofs.find((proof) => proof.fileName === "1.json")?.uri || "";
      await page.click("#tabPage");
      const downloadPromise = page.waitForEvent("download");
      await page.click("#btnExport");
      const download = await downloadPromise;
      const zipPath = path.join(outputRoot, "macaroni-v1-site.zip");
      await download.saveAs(zipPath);
      await waitForText(page, "#exportStatus", "Downloaded macaroni-site.zip");
      assert.equal(await page.locator("#viewPage").isVisible(), true);
      assert.equal(await page.locator("#deployStatus").isVisible(), false);
      captures.push(await captureMock(
        page,
        monitor,
        outputRoot,
        13,
        "V1 standalone collector website visibly exported",
        [
          { selector: "#btnExport", name: "export action", expectedText: "Export website" },
          { selector: "#exportStatus", name: "site package", expectedText: "Downloaded macaroni-site.zip" },
        ],
        "#exportStatus",
      ));
      assert.equal(await page.locator("#exportStatus").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      }), true, "V1 export capture target must intersect the screenshot viewport");
      siteBytes = await readFile(zipPath);
      validateMacaroniSiteArchive(siteBytes, {
        contractAddress: V1_CONTRACT,
        finalMetadataUri,
        contractVersion: "macaroni-v1",
        revealMode: "instant",
      });
    } finally {
      monitor.dispose();
      await context.close();
    }
  } finally {
    await creatorServer.close();
  }

  const siteRoot = path.join(outputRoot, "v1-site");
  await extractArchive(unzipSync(siteBytes), siteRoot);
  let collectorProjection = await readMacaroniV1BrowserProjection(chain.collectorTezos, V1_CONTRACT, COLLECTOR);
  const v1Stage = (collectorProjection.stages as Record<string, unknown>)["0"] as Record<string, unknown>;
  assert.deepEqual(v1Stage.max_per_wallet, { Some: 1 });
  assert.equal(v1Stage.price, 1000);
  assert.equal(Number.isNaN(new Date(String(v1Stage.start)).getTime()), false);
  const collectorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.collectorTezos,
    signerAddress: COLLECTOR,
    expectedChainId: CHAIN_ID,
    allowedContractAddresses: new Set([V1_CONTRACT]),
    allowedEntrypoints: new Set(["mint"]),
    assertExpectedChain: async () => CHAIN_ID,
    assertOperationApplied: (assertion) => chain.finality.assertOperationApplied(assertion, COLLECTOR),
    pinJson: pins.pinJson,
    validateCall: ({ entrypoint, payload }) => {
      assert.equal(entrypoint, "mint");
      assert.equal(numeric(payload), 1);
    },
    projectStorage: () => collectorProjection,
    onReceipt: async (receipt) => {
      if (receipt.operationHash) {
        collectorProjection = await readMacaroniV1BrowserProjection(chain.collectorTezos, V1_CONTRACT, COLLECTOR);
      }
    },
  });
  collectorSession.authorizeAfterFundingPreflight({
    balanceMutez: 5_000_000,
    requiredBalanceMutez: 1,
    estimatedOriginationMutez: 0,
    operationReserveMutez: 1,
  });
  const collectorServer = await startPastaUiLiveLoopbackServer({
    staticRoot: siteRoot,
    handleAction: (request) => collectorSession.handle(request),
  });
  try {
    const context = await browser.newContext({
      viewport: PASTA_PROOF_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await installProofGateway(context, pins.store);
    const page = await context.newPage();
    try {
      await page.goto(`${collectorServer.origin}/index.html`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
      await installPastaUiLiveBrowserProxy(page, collectorServer, "UI-MOCK");
      await installMacaroniBrowserAdapters(page, "https://proof.invalid/ipfs");
      await page.evaluate(() => (window as any).refresh());
      await waitForText(page, "#supplyText", "0 / 1 minted");
      await page.click("#btnConnect");
      await waitForText(page, "#walletLimitStatus", "0/1");
      await page.click("#btnMint");
      await waitForText(page, "#mintStatus", "minted ✓ (check your wallet)");
      await page.evaluate(async () => {
        await (window as any).refresh();
        await (window as any).loadOwnedMints();
      });
      await page.waitForFunction(() => {
        const card = document.querySelector('#revealGrid [data-token-id="0"]');
        return Boolean(card && !card.classList.contains("sealed") && card.textContent?.includes("Macaroni V1 Proof"));
      });
      await waitForText(page, "#supplyText", "1 / 1 minted");
      await waitForText(page, "#stageInfo", "Sold out");
      await assertMacaroniUiDecodeSafe(page);
      assert.equal(await page.locator("#btnMint").isDisabled(), true);
      assert.equal(await page.locator("#btnReveal").isVisible(), false);
    } finally {
      await context.close();
    }
  } finally {
    await collectorServer.close();
  }

  assert.deepEqual(chain.state.calls.map(({ signer, entrypoint }) => ({ signer, entrypoint })), [
    { signer: CREATOR, entrypoint: "add_tokens" },
    { signer: CREATOR, entrypoint: "set_stages" },
    { signer: COLLECTOR, entrypoint: "mint" },
  ]);
  assert.deepEqual(chain.state.estimates, ["add_tokens", "set_stages", "mint", "mint"]);
  const v1MintCall = chain.state.calls.find(({ signer, entrypoint }) => signer === COLLECTOR && entrypoint === "mint");
  assert.ok(v1MintCall);
  assert.equal(numeric((v1MintCall.sendOptions as Record<string, unknown>).gasLimit), 51_400);
  assert.equal(
    macaroniManagerOperationFitsBlock(
      937_746,
      numeric((v1MintCall.sendOptions as Record<string, unknown>).gasLimit),
    ),
    true,
  );
  assert.equal(chain.state.locked, true);
  assert.equal(chain.state.minted, 1);
  assert.equal(chain.state.revealed, 1);
  assert.equal(chain.state.maps.ledger["0"], COLLECTOR);
  assert.equal(chain.state.maps.pending_tokens["0"], undefined);
  assert.ok(chain.state.maps.token_metadata["0"]);
  assert.ok(originationReceipt);
  const finalizedCreatorContractSession = creatorContractSession as TaquitoPastaUiLiveSession | null;
  assert.ok(finalizedCreatorContractSession);
  assert.equal(finalizedCreatorContractSession.getReceipts().filter((receipt) => receipt.operationHash).length, 2);
  assert.equal(collectorSession.getReceipts().filter((receipt) => receipt.operationHash).length, 1);
  assert.deepEqual(
    captures.map((capture) => ({ ordinal: capture.sidecar.stageOrdinal, selectors: capture.sidecar.domEvidence.map((item) => item.selector) })),
    [
      { ordinal: 12, selectors: ["#deployStatus", "#log"] },
      { ordinal: 13, selectors: ["#btnExport", "#exportStatus"] },
    ],
  );
  for (const capture of captures) await verifyScreenshotSidecar(capture.pngPath, capture.sidecarPath);
});

test("Macaroni V1 production proof splits visible sync and export evidence before collector stages", async () => {
  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-macaroni-ui-live.ts"), "utf8");
  const syncOutcome = source.indexOf("await waitForMacaroniSyncOutcome(opened.page");
  const syncCapture = source.indexOf('12,\n      "sync V1 contract"', syncOutcome);
  const pageTab = source.indexOf('await opened.page.click("#tabPage")', syncOutcome);
  const exportCapture = source.indexOf('13,\n      "export V1 site"', pageTab);
  const collectorOpen = source.indexOf('14,\n      "operate exported V1 collector page"', exportCapture);
  const collectorMint = source.indexOf('15,\n      "mint V1 token from exported page"', collectorOpen);

  assert.ok(syncOutcome >= 0 && syncCapture > syncOutcome, "V1 sync capture must follow the applied sync outcome");
  assert.ok(pageTab > syncCapture, "V1 sync evidence must be captured before leaving the visible Drop tab");
  assert.ok(exportCapture > pageTab, "V1 export evidence must be captured on the visible Page Designer tab");
  assert.ok(collectorOpen > exportCapture && collectorMint > collectorOpen, "V1 collector ordinals must follow both Studio stages");

  const syncBlock = source.slice(syncCapture, pageTab);
  assert.match(syncBlock, /"#secDeploy"/);
  assert.match(syncBlock, /selector: "#deployStatus"/);
  assert.match(syncBlock, /selector: "#log"/);

  const exportBlock = source.slice(exportCapture, collectorOpen);
  assert.match(exportBlock, /"#exportStatus"/);
  assert.match(exportBlock, /selector: "#btnExport"/);
  assert.doesNotMatch(exportBlock, /selector: "#deployStatus"|selector: "#log"/);
});

test("Macaroni production runner is explicit, fresh, Shadownet-only, funded-before-write, and recorder-free", async () => {
  assert.throws(() => assertMacaroniUiLiveExecutionAllowed({}), /explicit Macaroni UI-live execute flag is required/);
  assert.throws(
    () => assertMacaroniUiLiveExecutionAllowed({
      PASTA_SHADOWNET_MACARONI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.throws(
    () => assertMacaroniUiLiveExecutionAllowed({
      PASTA_SHADOWNET_MACARONI_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "shadownet",
      PASTA_SHADOWNET_MACARONI_EXISTING_CONTRACT: CONTRACT,
    }),
    /fresh-origination only/,
  );
  assert.doesNotThrow(() => assertMacaroniUiLiveExecutionAllowed({
    PASTA_SHADOWNET_MACARONI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));

  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-macaroni-ui-live.ts"), "utf8");
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /loadSignerPair\(env\)/);
  assert.match(source, /allowedContractAddresses: new Set\(\[creatorContractAddress\]\)/);
  assert.match(source, /new Set\(\["mint", "reveal"\]\)/);
  assert.match(source, /validateMacaroniSiteArchive\(exportZipBytes/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(source, /decodeMacaroniCanonicalOriginationRequest\(request, expectedCodeHash\)/);
  assert.match(source, /browserLoadedSha256: expectedCodeHash/);
  assert.match(source, /pastaprotocol-app-proof@1/);
  assert.match(source, /pastaprotocol-macaroni-ui-live-run@1/);
  assert.match(source, /publicGatewayVerified/);
  assert.match(source, /walletLimitUiSubmissionPrevented: true/);
  assert.match(source, /classic-blind-drop-v1/);
  assert.match(source, /new Set\(\["add_tokens", "set_stages"\]\)/);
  assert.match(source, /kind === "asset"/);
  assert.match(source, /tzips\.includes\("fa2"\)/);
  assert.match(source, /macaroniTzktBigMapNatKeyIsInactive\(json, 0\)/);
  assert.match(source, /Invalid Date/);
  assert.match(source, /\\\[object Object\\\]/);
  assert.match(source, /waitForMacaroniSyncOutcome/);
  assert.equal(
    (source.match(/assertOperationApplied:/g) || []).length,
    6,
    "both Macaroni generations must bind creator, bootstrap, and collector sessions to exact-hash finality",
  );
  assert.match(source, /signerAddress: creatorAddress/);
  assert.match(source, /signerAddress: collectorAddress/);
  assert.match(source, /signerAddress: creator\.address/);
  assert.match(source, /signerAddress: collector\.address/);
  assert.doesNotMatch(source, /fee:\s*2500/);
  assert.doesNotMatch(source, /UI-MOCK/);
  assert.doesNotMatch(source, /recordVideo|recordHar|tracing\.start|launchPersistentContext/);
  assert.doesNotMatch(source, /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{20,}/);

  const fundingGate = source.indexOf("Macaroni UI-live collector is underfunded before any pin or chain write");
  const firstOutputWrite = source.indexOf("await mkdir(path.join(appRoot");
  const firstPinCallback = source.indexOf("pinIpfsProofJson({ value, fileName, options: ipfs })", firstOutputWrite);
  const v1LaneCall = source.indexOf("await runMacaroniV1UiLane({", firstOutputWrite);
  assert.ok(fundingGate > 0 && firstOutputWrite > fundingGate, "output directory must be created only after both funding gates");
  assert.ok(firstPinCallback > firstOutputWrite, "live pin callbacks must be installed only after both funding gates");
  assert.ok(v1LaneCall > firstOutputWrite, "V1 live UI lane must start only after both funding gates");
});

test("Macaroni screenshot guard rejects undecoded optional values", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main>Stage opens Invalid Date · limit [object Object] · supply NaN</main>");
    await assert.rejects(() => assertMacaroniUiDecodeSafe(page), /undecoded Michelson value/);
  } finally {
    await browser.close();
  }
});

test("Macaroni sync outcome fails immediately on UI or Shadownet refusal evidence", async () => {
  const refusal = findMacaroniMempoolRefusal({
    refused: [{
      hash: "ooAvv3yuqC7tdXnhHXs8dD4ArZ3x2DRnuF62g8cSW5C7PNC9NeG",
      error: [{ kind: "permanent", id: "proto.025-PsUshuai.prefilter.fees_too_low" }],
      contents: [{
        kind: "transaction",
        source: CREATOR,
        destination: CONTRACT,
        fee: "2500",
        gas_limit: "200000",
      }],
    }],
  }, CREATOR, CONTRACT);
  assert.deepEqual(refusal, {
    operationHash: "ooAvv3yuqC7tdXnhHXs8dD4ArZ3x2DRnuF62g8cSW5C7PNC9NeG",
    errorIds: ["proto.025-PsUshuai.prefilter.fees_too_low"],
  });
  assert.equal(findMacaroniMempoolRefusal({ refused: [] }, CREATOR, CONTRACT), null);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="deployStatus">Sync failed: fees too low</div><pre id="log">sync failed: rejected</pre>');
    await assert.rejects(
      () => waitForMacaroniSyncOutcome(page, { timeout: 1_000, pollInterval: 10 }),
      /sync failed before success/i,
    );
    await page.setContent('<div id="deployStatus">in sync ✓</div><pre id="log">sync complete</pre>');
    await assert.doesNotReject(() => waitForMacaroniSyncOutcome(page, { timeout: 1_000, pollInterval: 10 }));
  } finally {
    await browser.close();
  }
});

test("Macaroni fake finality rejects unknown, foreign, mismatched, and rejected operations", () => {
  const finality = new FakeMacaroniFinality([OPERATION_HASHES[0]]);
  const operationHash = finality.recordApplied({
    signerAddress: CREATOR,
    action: "call",
    contractAddress: CONTRACT,
    entrypoints: ["set_stages"],
    apply: () => undefined,
  });
  const exact: PastaUiLiveAppliedOperationAssertion = {
    action: "call",
    operationHash,
    contractAddress: CONTRACT,
    entrypoints: ["set_stages"],
  };
  assert.doesNotThrow(() => finality.assertOperationApplied(exact, CREATOR));
  assert.throws(
    () => finality.assertOperationApplied({ ...exact, operationHash: OPERATION_HASHES[1] }, CREATOR),
    /is unknown/,
  );
  assert.throws(() => finality.assertOperationApplied(exact, COLLECTOR), /signer drift/);
  assert.throws(
    () => finality.assertOperationApplied({ ...exact, action: "originate" }, CREATOR),
    /action drift/,
  );
  assert.throws(
    () => finality.assertOperationApplied({ ...exact, contractAddress: V1_CONTRACT }, CREATOR),
    /contract drift/,
  );
  assert.throws(
    () => finality.assertOperationApplied({ ...exact, entrypoints: ["mint"] }, CREATOR),
    /entrypoint drift/,
  );
  const record = finality.operations.get(operationHash);
  assert.ok(record);
  record.status = "rejected";
  assert.throws(() => finality.assertOperationApplied(exact, CREATOR), /is rejected/);
});

test("Macaroni TzKT evidence rejects generic contracts and requires FA2 asset identity", () => {
  assert.equal(isMacaroniTzktFa2Asset({ address: CONTRACT, kind: "asset", tzips: ["fa2"] }, CONTRACT), true);
  assert.equal(isMacaroniTzktFa2Asset({ address: CONTRACT, kind: "smart_contract", tzips: ["fa2"] }, CONTRACT), false);
  assert.equal(isMacaroniTzktFa2Asset({ address: CONTRACT, kind: "asset", tzips: [] }, CONTRACT), false);
  assert.equal(isMacaroniTzktFa2Asset({ address: V1_CONTRACT, kind: "asset", tzips: ["fa2"] }, CONTRACT), false);

  const expected = {
    action: "call" as const,
    operationHash: OPERATION_HASHES[1],
    contractAddress: CONTRACT,
    entrypoints: ["add_tokens_v2"],
    signerAddress: CREATOR,
  };
  const applied = {
    hash: OPERATION_HASHES[1],
    sender: { address: CREATOR },
    target: { address: CONTRACT },
    parameter: { entrypoint: "add_tokens_v2" },
    status: "applied",
  };
  assert.equal(assertMacaroniTzktOperationApplied([applied], expected), applied);
  assert.throws(
    () => assertMacaroniTzktOperationApplied([{
      ...applied,
      sender: { address: COLLECTOR },
    }], expected),
    /expected target\/entrypoint/,
  );
  assert.throws(
    () => assertMacaroniTzktOperationApplied([{
      ...applied,
      status: "backtracked",
      errors: [{ type: "storage_exhausted.operation" }],
    }], expected),
    /backtracked.*storage_exhausted\.operation/,
  );
});

test("Macaroni TzKT consumed-key evidence accepts only absence or literal inactive tombstones", () => {
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([], 0), true);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "0", active: false, value: { token_info: {} } },
  ], 0), true);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "1", active: true, value: {} },
    { key: "0", active: false, value: {} },
  ], 0), true);

  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "0", active: true, value: {} },
  ], 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "0", value: {} },
  ], 0), false, "a matching row without an activity marker is ambiguous");
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "0", active: "false", value: {} },
  ], 0), false, "a string activity marker must not impersonate literal false");
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([
    { key: "0", active: false, value: {} },
    { key: 0, active: true, value: {} },
  ], 0), false, "any active duplicate makes the state unconsumed");

  assert.equal(macaroniTzktBigMapNatKeyIsInactive({}, 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([null], 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([{ active: false }], 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([{ key: "not-a-nat", active: false }], 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([{ key: "-1", active: false }], 0), false);
  assert.equal(macaroniTzktBigMapNatKeyIsInactive([{ key: "1.5", active: false }], 0), false);
});

test("Macaroni proof PNGs are deterministic and distinct by seed", () => {
  const first = buildMacaroniProofPng("same");
  const second = buildMacaroniProofPng("same");
  const other = buildMacaroniProofPng("other");
  assert.deepEqual(first, second);
  assert.notEqual(sha256(first), sha256(other));
  assert.deepEqual([...first.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(first.byteLength < 1_000_000);
  assert.equal(utf8ToHex("ipfs://proof").startsWith("697066733a2f2f"), true);
});

test("Macaroni metadata verifier normalizes representation drift but rejects any real mismatch", () => {
  const expected: Record<string, unknown> = Object.create(null);
  expected.name = "Macaroni Revealed Proof";
  expected.supply = new BigNumber(2);
  expected.macaroni = Object.assign(Object.create(null), {
    contractVersion: "macaroni-editions-v2",
  });
  expected.formats = [new Map<string, unknown>([
    ["uri", "ipfs://bafkreiproof"],
    ["mimeType", "image/png"],
  ])];

  const plain = {
    name: "Macaroni Revealed Proof",
    supply: "2",
    macaroni: { contractVersion: "macaroni-editions-v2" },
    formats: [{ mimeType: "image/png", uri: "ipfs://bafkreiproof" }],
  };
  assert.doesNotThrow(() => assertExactMacaroniMetadataJson(deterministicJsonBytes(plain), expected));
  assert.throws(
    () => assertExactMacaroniMetadataJson(
      deterministicJsonBytes({ ...plain, name: "Different artwork" }),
      expected,
    ),
    /does not exactly match the pinned metadata value/,
  );
});

test("Macaroni manager-operation profiles prove saturated-block fit and exact 21/20 RBF rules", () => {
  assert.equal(macaroniManagerOperationFitsBlock(937_746, 50_000), true);
  assert.equal(macaroniManagerOperationFitsBlock(937_746, 102_254), true);
  assert.equal(macaroniManagerOperationFitsBlock(937_746, 102_255), false);
  assert.equal(macaroniManagerOperationFitsBlock(937_746, 480_000), false);

  const stranded = { oldFeeMutez: 60_880, oldGasLimit: 480_000 };
  assert.equal(macaroniReplacementByFeeEligible({
    ...stranded,
    newFeeMutez: 100_000,
    newGasLimit: 50_000,
  }), true);
  assert.equal(macaroniReplacementByFeeEligible({
    ...stranded,
    newFeeMutez: 63_923,
    newGasLimit: 50_000,
  }), false, "one mutez below the exact absolute 21/20 threshold must fail");
  assert.equal(macaroniReplacementByFeeEligible({
    ...stranded,
    newFeeMutez: 63_924,
    newGasLimit: 480_001,
  }), false, "absolute fee alone must not bypass the exact fee/gas threshold");
});

test("Macaroni red-light simulation rejects an estimate that incorrectly succeeds", async () => {
  let estimateCalls = 0;
  const unexpectedlyPermissiveToolkit = {
    contract: {
      async at() {
        return {
          methodsObject: {
            mint() {
              return {
                toTransferParams() {
                  return { to: CONTRACT, parameter: { entrypoint: "mint", value: "1" } };
                },
              };
            },
          },
        };
      },
    },
    estimate: {
      async transfer() {
        estimateCalls += 1;
        return fakeEstimateForEntrypoint("mint");
      },
    },
  } as any;
  await assert.rejects(
    () => simulateMacaroniMintRejection(
      unexpectedlyPermissiveToolkit,
      CONTRACT,
      "WALLET_LIMIT",
    ),
    /unexpectedly bypassed WALLET_LIMIT/,
  );
  assert.equal(estimateCalls, 1);

  const rejectingToolkit = {
    ...unexpectedlyPermissiveToolkit,
    estimate: {
      async transfer() {
        throw new Error("proto.alpha.contract_error: WALLET_LIMIT");
      },
    },
  } as any;
  assert.match(
    await simulateMacaroniMintRejection(rejectingToolkit, CONTRACT, "WALLET_LIMIT"),
    /WALLET_LIMIT/,
  );
});
