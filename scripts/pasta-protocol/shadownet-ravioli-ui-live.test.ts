import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";
import BigNumber from "bignumber.js";
import { blake2b } from "blakejs";
import { chromium, type BrowserContext, type Page, type Route } from "playwright";

import {
  buildPastaUiLiveProxyInstallerSource,
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
import {
  PASTA_DATETIME_LOCAL_RESOLUTION_MS,
  PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO,
  pastaDeadlineBeforeCeiling,
} from "./pasta-proof-deadline-policy";
import {
  assertTzktBalanceRecords,
  assertTzktFa2ContractRecord,
  assertTzktTokenRecords,
  assertRavioliRotiniCapacitySnapshot,
  assertRavioliPreBuyWindow,
  assertRavioliSameInstantOrNull,
  assertRavioliUiLiveExecutionAllowed,
  assertRavioliNativeRecoveryRecheckStable,
  assertRavioliJournalTzktOperationApplied,
  assertPortableRavioliCheckpointValue,
  buildRavioliRevealCapability,
  buildRavioliBlindDeadlines,
  buildRavioliRotiniCapacityExpectation,
  calculateRavioliRedDeadlineWindows,
  checkpointRavioliBeforeTerminalVerification,
  clickRavioliPublishAndWaitForDownload,
  countRavioliChainWriteReceipts,
  copyRavioliLimitedEditionDependencyEvidence,
  copyRavioliPrepackRecoveryEvidence,
  configureRavioliPackMode,
  createRavioliMirroredSessionHandler,
  decodeRavioliPackageResumeCheckpoint,
  defaultRavioliBlindDeadlines,
  dependencyOriginationReceipt,
  encodeRavioliPackageResumeCheckpoint,
  formatRavioliUiLiveError,
  hasActiveRavioliOperator,
  optionValue,
  operationEstimateMutez,
  projectRavioliUiLiveStorage,
  preserveRavioliMode0MutationRecoveryEvidence,
  parseRavioliCurrentV2OpenKitEvidence,
  publishStagedRavioliFile,
  ravioliDeliveredTokenExplorerUrls,
  ravioliPublicRevealPin,
  ravioliModeWriteOperationHashes,
  ravioliOutlivingLeProbeDatetimeLocal,
  ravioliProofPartitionWriteOperationHashes,
  RavioliUiLivePolicy,
  RavioliUiStateMirror,
  RAVIOLI_BUYER_READINESS_POLICY,
  RAVIOLI_BUYER_READINESS_BOUND_MS,
  RAVIOLI_EVENT86_RED_DEADLINE_EVIDENCE,
  RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
  RAVIOLI_MAXIMUM_GREEN_OPEN_DEADLINE_ISO,
  RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_ISO,
  RAVIOLI_MAXIMUM_GREEN_SALE_END_ISO,
  RAVIOLI_PREBUY_MIN_REMAINING_MS,
  RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC,
  RAVIOLI_UI_LIVE_PACK_SPECS,
  RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES,
  RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
  RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
  RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_REVEAL_WINDOW_MS,
  RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_SALE_WINDOW_MS,
  sampleRavioliUiLiveMemory,
  resolveRavioliLimitedEditionConstraint,
  resolveRavioliGreenDeadlinePolicy,
  requiredOptionSafeInteger,
  rethrowAfterClosingRavioliBuyerPage,
  ravioliChainWaitTimeoutMs,
  ravioliSaleNeedsDeadlineWait,
  ravioliTokenInfoValue,
  shouldCaptureRavioliFailureRecovery,
  stableRavioliMode0MutationLiveCheck,
  validateRavioliGnocchiDependencyRoles,
  validateRavioliNativeDependencyTransition,
  validateRavioliOpenKitDownload,
  waitForRavioliBuyerPageReady,
  waitForRavioliStudioTransferOutcome,
  type PackKit,
} from "./shadownet-ravioli-ui-live";
import {
  RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX,
  RAVIOLI_UI_LIVE_EXPECTED_COUNTS,
  RAVIOLI_UI_LIVE_EXPECTED_OPERATION_MATRIX,
} from "./shadownet-ravioli-ui-live-journal";
import { deterministicJsonBytes, root, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

test("Ravioli serial origination estimate retries only its read-only simulation", async () => {
  let estimateCalls = 0;
  let mutationCalls = 0;
  const toolkit = {
    estimate: {
      originate: async () => {
        estimateCalls += 1;
        if (estimateCalls === 1) throw Object.assign(new Error("rate limited"), { status: 429 });
        return { suggestedFeeMutez: 1_000, burnFeeMutez: 2_000 };
      },
    },
    contract: {
      originate: async () => {
        mutationCalls += 1;
        throw new Error("mutation boundary must remain unreachable");
      },
    },
  };
  assert.equal(await operationEstimateMutez(toolkit as never, [], {}), 103_000);
  assert.equal(estimateCalls, 2);
  assert.equal(mutationCalls, 0);
});

test("Ravioli maximum-horizon LE rejection probe stays browser-representable and outlives the child", () => {
  const childEnd = "9999-12-31T23:58:00.000Z";
  const probe = ravioliOutlivingLeProbeDatetimeLocal(childEnd);
  assert.equal(probe, "9999-12-31T23:59");
  assert.ok(Date.parse(`${probe}:00.000Z`) > Date.parse(childEnd));
});

test("Ravioli current resume binds the live Gnocchi reservation level to commit_recipe", async () => {
  const source = await readFile(new URL("./shadownet-ravioli-ui-live.ts", import.meta.url), "utf8");
  const recoveryBlock = source.slice(
    source.indexOf("const currentResumeRecovery:"),
    source.indexOf("let currentResumeInitialScreenshots:"),
  );
  assert.match(
    recoveryBlock,
    /const reservedMint = currentResumePlan\.operations\.find\([\s\S]*globalOrdinal === 22/,
  );
  assert.match(recoveryBlock, /assert\.equal\(reservedMint\.expected\.entrypoint, "commit_recipe"\)/);
  assert.doesNotMatch(
    recoveryBlock,
    /const reservedMint = currentResumePlan\.operations\.find\([\s\S]*globalOrdinal === 19/,
  );
});

test("Ravioli current resume reads token_info from live and journal map encodings", () => {
  const live = new MichelsonMap<string, string>();
  live.set("", "697066733a2f2f6c697665");
  assert.equal(ravioliTokenInfoValue(live, ""), "697066733a2f2f6c697665");
  assert.equal(
    ravioliTokenInfoValue({ $map: [["", "697066733a2f2f6a6f75726e616c"]] }, ""),
    "697066733a2f2f6a6f75726e616c",
  );
  assert.throws(
    () => ravioliTokenInfoValue({ $map: [["", "aa"], ["", "bb"]] }, ""),
    /exactly one key/,
  );
});

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR_ONE = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const COLLECTOR_TWO = "tz1gjaF81ZRRvdzjobyfVNsAeSC6PScjfQwN";
const COLLECTOR_THREE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const GNOCCHI = "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw";
const ROTINI = "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls";
const BLIND_CONTROLLER = "KT1Mjjcb6tmSsLm7Cb3DSQszePjfchPM4Uxm";
const ROUTER = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const GNOCCHI_ADAPTER = "KT1LF14kfDc3nGq8Vs26J2BykYixWeEfYqMQ";
const ROTINI_ADAPTER = "KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn";
const LIMITED_CHILD_END = "2099-08-20T00:00:00.000Z";
const LIMITED_WRAPPER_END = "2099-08-19T23:00:00.000Z";
const STATIC_ROOT = path.join(root, "public");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const ROTINI_GENERATOR_CID = "bafybeib6raviolirotinigeneratorfixtureaaaaaaaaaaaaaaaaaaaa";
const ROTINI_LAYER_CID = "bafybeib6raviolirotinilayerfixtureaaaaaaaaaaaaaaaaaaaaaaaa";
const ROTINI_GENERATOR_URI = `ipfs://${ROTINI_GENERATOR_CID}`;
const ROTINI_LAYER_URI = `ipfs://${ROTINI_LAYER_CID}`;
const ROTINI_GENERATOR_MANIFEST = {
  schema: "pasta-rotini-generator@2",
  name: "Ravioli automatic Rotini fixture",
  description: "Generated in the collector browser from the immutable Rotini project.",
  creator: CREATOR,
  width: 2,
  height: 2,
  outputMode: "png",
  seedField: "pasta:seed",
  selection: "weighted-deterministic",
  layers: [{
    name: "Background",
    variants: [{
      value: "Proof",
      weight: 1,
      artifactUri: ROTINI_LAYER_URI,
      mimeType: "image/png",
    }],
  }],
};
const MODES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
] as const;
const ADDRESSES = [BLIND_CONTROLLER, ROUTER, GNOCCHI_ADAPTER, ROTINI_ADAPTER];
const FIXTURE_RAVIOLI_CONTROLLER_VIEWS = new Set([
  "get_pack_status",
  "get_claim_count",
  "get_last_claim",
  "get_claim_serial",
  "quote_refund",
  "get_refund_credit",
]);
const FIXTURE_ROTINI_ADAPTER_VIEWS = new Set(["get_reserved", "get_render_context"]);
const FIXTURE_GNOCCHI_BALANCE_VIEWS = new Set(["get_balance"]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const utf8Hex = (value: string) => Buffer.from(value, "utf8").toString("hex");

type FakeCall = { contractAddress: string; entrypoint: string; payload: any; sendOptions: any };
type FakeOperationRecord = {
  hash: string;
  signerAddress: string;
  action: "originate" | "call";
  contractAddress: string;
  entrypoints: string[];
  status: "submitted" | "applied" | "rejected";
  rejection?: string;
};
type FakeRavioliChainOptions = {
  limitedChildActive?: boolean;
  limitedChildEnd?: string;
  limitedChildLocked?: boolean;
  routerHasChildExpiry?: boolean;
  routerHasWrapperSaleEnd?: boolean;
  rotiniHasActionIndex?: boolean;
  rotiniResourceActive?: boolean;
  failRouterStorageAfterReads?: number;
  gnocchiBalances?: Record<number, number>;
};

function rotiniMintPackIterationSchema(includeActionIndex: boolean): unknown {
  const fields = [
    ...(includeActionIndex ? [{ prim: "nat", annots: ["%action_index"] }] : []),
    { prim: "bytes", annots: ["%artifact_hash"] },
    { prim: "bytes", annots: ["%artifact_uri"] },
    { prim: "bytes", annots: ["%display_uri"] },
    { prim: "bytes", annots: ["%metadata_uri"] },
    { prim: "bytes", annots: ["%mime_type"] },
    { prim: "nat", annots: ["%open_serial"] },
    { prim: "address", annots: ["%pack_contract"] },
    { prim: "nat", annots: ["%pack_token_id"] },
    { prim: "nat", annots: ["%project_id"] },
    { prim: "address", annots: ["%recipient"] },
    { prim: "bytes", annots: ["%thumbnail_uri"] },
  ];
  const comb = (remaining: typeof fields): any => (
    remaining.length === 2
      ? { prim: "pair", args: remaining }
      : { prim: "pair", args: [remaining[0], comb(remaining.slice(1))] }
  );
  return { ...comb(fields), annots: ["%mint_pack_iteration"] };
}

function routerCreatePackSchema(options: FakeRavioliChainOptions): unknown {
  const childExpiryField = {
    prim: "option",
    args: [{ prim: "timestamp" }],
    annots: ["%child_expiry"],
  };
  const wrapperSaleEndField = {
    prim: "option",
    args: [{ prim: "timestamp" }],
    annots: ["%wrapper_sale_end"],
  };
  const configFields = [
    { prim: "bool", annots: ["%blind"] },
    { prim: "bool", annots: ["%cancelled"] },
    ...(options.routerHasChildExpiry === false ? [] : [childExpiryField]),
    { prim: "nat", annots: ["%committed_recipes"] },
    { prim: "option", args: [{ prim: "bytes" }], annots: ["%contents_uri"] },
    { prim: "bool", annots: ["%finalized"] },
    { prim: "nat", annots: ["%item_count"] },
    { prim: "bytes", annots: ["%manifest_uri"] },
    { prim: "nat", annots: ["%max_supply"] },
    { prim: "nat", annots: ["%mode"] },
    { prim: "option", args: [{ prim: "timestamp" }], annots: ["%open_deadline"] },
    { prim: "option", args: [{ prim: "bytes" }], annots: ["%reveal_commitment"] },
    { prim: "option", args: [{ prim: "timestamp" }], annots: ["%reveal_deadline"] },
    ...(options.routerHasWrapperSaleEnd === false ? [] : [wrapperSaleEndField]),
  ];
  const comb = (remaining: typeof configFields): any => (
    remaining.length === 2
      ? { prim: "pair", args: remaining }
      : { prim: "pair", args: [remaining[0], comb(remaining.slice(1))] }
  );
  return {
    prim: "pair",
    args: [
      { ...comb(configFields), annots: ["%config"] },
      {
        prim: "pair",
        args: [
          { prim: "nat", annots: ["%expected_token_id"] },
          { prim: "map", args: [{ prim: "string" }, { prim: "bytes" }], annots: ["%token_info"] },
        ],
      },
    ],
    annots: ["%create_pack"],
  };
}

class PoisonedBigMapAbstraction {
  readonly id = 123;
  constructor(private readonly onRead: () => void) {}
  get provider() {
    this.onRead();
    throw new Error("provider graph must never be traversed");
  }
  get schema() {
    this.onRead();
    throw new Error("schema graph must never be traversed");
  }
  get(_key: string) {
    return Promise.resolve(undefined);
  }
}

class FakeRavioliChain {
  readonly calls: FakeCall[] = [];
  readonly operations = new Map<string, FakeOperationRecord>();
  readonly verifiedOperationHashes: string[] = [];
  confirmationCalls = 0;
  poisonedBigMapReads = 0;
  routerStorageReads = 0;
  private originIndex = 0;
  private operationIndex = 0;
  private readonly scriptCodes = new Map<string, unknown>();
  private readonly nextClaimIdByToken = new Map<number, number>();
  private readonly claimsByHolder = new Map<string, Array<{ claimId: number; paid: number }>>();
  private mirror: RavioliUiStateMirror | null = null;

  constructor(private readonly options: FakeRavioliChainOptions = {}) {}

  attachMirror(mirror: RavioliUiStateMirror): void {
    this.mirror = mirror;
  }

  seedBlindClaim(tokenId: number, owner: string, claimId = 0, paid = 0): void {
    assert.ok(Number.isSafeInteger(tokenId) && tokenId >= 0);
    assert.ok(Number.isSafeInteger(claimId) && claimId >= 0);
    assert.equal(this.claims(tokenId, owner).some((claim) => claim.claimId === claimId), false);
    this.claimsByHolder.set(this.claimKey(tokenId, owner), [
      ...this.claims(tokenId, owner),
      { claimId, paid },
    ]);
    this.nextClaimIdByToken.set(
      tokenId,
      Math.max(this.nextClaimIdByToken.get(tokenId) || 0, claimId + 1),
    );
  }

  setRouterScriptCode(code: unknown): void {
    this.setContractScriptCode(ROUTER, code);
  }

  setContractScriptCode(address: string, code: unknown): void {
    this.scriptCodes.set(address, code);
  }

  private operation(input: {
    signerAddress: string;
    action: "originate" | "call";
    contractAddress: string;
    entrypoints: string[];
    apply?: () => void;
  }) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const marker = alphabet[++this.operationIndex % alphabet.length];
    const hash = `o${"1".repeat(49)}${marker}`;
    assert.equal(this.operations.has(hash), false, "fake Ravioli operation hash must be unique");
    const record: FakeOperationRecord = {
      hash,
      signerAddress: input.signerAddress,
      action: input.action,
      contractAddress: input.contractAddress,
      entrypoints: [...input.entrypoints],
      status: "submitted",
    };
    this.operations.set(hash, record);
    let settled = false;
    let settlementError: unknown;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        input.apply?.();
        record.status = "applied";
      } catch (error) {
        settlementError = error;
        record.status = "rejected";
        record.rejection = error instanceof Error ? error.message : String(error);
      }
    };
    queueMicrotask(settle);
    return {
      hash,
      ...(input.action === "originate" ? { contractAddress: input.contractAddress } : {}),
      confirmation: async () => {
        this.confirmationCalls += 1;
        await Promise.resolve();
        settle();
        if (record.status === "rejected") {
          throw settlementError instanceof Error
            ? settlementError
            : new Error(record.rejection || "fake Ravioli operation rejected");
        }
        return 1;
      },
    };
  }

  async assertOperationApplied(
    assertion: PastaUiLiveAppliedOperationAssertion,
    signerAddress: string,
  ): Promise<void> {
    assert.match(assertion.operationHash, /^o[1-9A-HJ-NP-Za-km-z]{50}$/);
    assert.notEqual(assertion.action, "batch", "fake Ravioli chain does not apply batches");
    const operation = this.operations.get(assertion.operationHash);
    assert.ok(operation, `fake Ravioli operation ${assertion.operationHash} is unknown`);
    assert.equal(operation.status, "applied", `fake Ravioli operation ${assertion.operationHash} is ${operation.status}`);
    assert.equal(operation.signerAddress, signerAddress, "fake Ravioli operation signer drift");
    assert.equal(operation.action, assertion.action, "fake Ravioli operation action drift");
    assert.equal(operation.contractAddress, assertion.contractAddress, "fake Ravioli operation contract drift");
    assert.deepEqual(operation.entrypoints, assertion.entrypoints, "fake Ravioli operation entrypoint drift");
    assert.equal(
      this.verifiedOperationHashes.includes(assertion.operationHash),
      false,
      `fake Ravioli operation ${assertion.operationHash} was verified more than once`,
    );
    this.verifiedOperationHashes.push(assertion.operationHash);
  }

  private storage(address: string) {
    if (address === GNOCCHI) {
      const sales = new MichelsonMap();
      sales.set("0", { active: true, start: "2026-07-19T00:00:00.000Z", end: "2026-07-20T00:00:00.000Z", max_supply: null });
      sales.set("1", { active: true, start: null, end: null, max_supply: null });
      sales.set("2", {
        active: this.options.limitedChildActive ?? true,
        start: "2026-07-19T00:00:00.000Z",
        end: this.options.limitedChildEnd ?? "2099-07-20T00:00:00.000Z",
        max_supply: 4,
      });
      sales.set("3", {
        active: true,
        start: "2026-07-19T00:00:00.000Z",
        end: LIMITED_CHILD_END,
        max_supply: 3,
      });
      const policy_locked = new MichelsonMap();
      policy_locked.set("0", true);
      policy_locked.set("1", true);
      policy_locked.set("2", this.options.limitedChildLocked ?? true);
      policy_locked.set("3", true);
      const total_minted = new MichelsonMap();
      total_minted.set("0", 1);
      total_minted.set("1", 1);
      total_minted.set("2", 1);
      total_minted.set("3", 0);
      const total_reserved = new MichelsonMap();
      total_reserved.set("0", 0);
      total_reserved.set("1", 0);
      total_reserved.set("2", 0);
      total_reserved.set("3", 0);
      return { next_token_id: 4, sales, policy_locked, total_minted, total_reserved };
    }
    if (address === ROTINI) {
      const projects = new MichelsonMap();
      projects.set("3", {
        active: true,
        name: utf8Hex("Ravioli automatic Rotini fixture"),
        symbol: utf8Hex("RRF"),
        generator_uri: utf8Hex(ROTINI_GENERATOR_URI),
        display_uri: utf8Hex(ROTINI_LAYER_URI),
        output_mode: utf8Hex("png"),
        max_supply: { Some: 16 },
        price: 0,
        treasury: CREATOR,
        max_per_wallet: null,
        reservation_ttl: 3600,
        minted: 0,
        reserved: 0,
      });
      return { next_project_id: 4, projects };
    }
    if (address === BLIND_CONTROLLER) {
      return {
        metadata: new MichelsonMap(),
        packs: new MichelsonMap(),
        claim_counts: new MichelsonMap(),
        claim_slots: new MichelsonMap(),
        consumed_serials: new MichelsonMap(),
        refund_credits: new MichelsonMap(),
      };
    }
    if (address === ROUTER) {
      this.routerStorageReads += 1;
      if (
        this.options.failRouterStorageAfterReads != null &&
        this.routerStorageReads > this.options.failRouterStorageAfterReads
      ) {
        throw new Error("simulated post-confirmation router refresh failure");
      }
      return {
        administrator: CREATOR,
        pending_administrator: null,
        blind_controller: BLIND_CONTROLLER,
        next_token_id: 5,
        packs: new MichelsonMap(),
        token_metadata: new MichelsonMap(),
        total_supply: new MichelsonMap(),
        opened: new MichelsonMap(),
        sales: new MichelsonMap(),
      };
    }
    if (address === GNOCCHI_ADAPTER) {
      return {
        administrator: CREATOR,
        allocations: new MichelsonMap(),
        metadata: new PoisonedBigMapAbstraction(() => { this.poisonedBigMapReads += 1; }),
        next_resource_id: 0,
      };
    }
    if (address === ROTINI_ADAPTER) {
      const resources = new MichelsonMap();
      resources.set("0", {
        target: ROTINI,
        project_id: 3,
        active: this.options.rotiniResourceActive ?? true,
      });
      return {
        administrator: CREATOR,
        resources,
        metadata: new PoisonedBigMapAbstraction(() => { this.poisonedBigMapReads += 1; }),
        next_resource_id: 0,
      };
    }
    return { next_token_id: 5 };
  }

  private claimKey(tokenId: number, owner: string): string {
    return `${tokenId}:${owner}`;
  }

  private claims(tokenId: number, owner: string): Array<{ claimId: number; paid: number }> {
    return this.claimsByHolder.get(this.claimKey(tokenId, owner)) || [];
  }

  private recordBlindClaims(tokenId: number, owner: string, amount: number): void {
    const sale = this.mirror?.sales.get(tokenId);
    const paid = sale?.price || 0;
    const claims = [...this.claims(tokenId, owner)];
    let nextClaimId = this.nextClaimIdByToken.get(tokenId) || 0;
    for (let index = 0; index < amount; index += 1) {
      claims.push({ claimId: nextClaimId++, paid });
    }
    this.nextClaimIdByToken.set(tokenId, nextClaimId);
    this.claimsByHolder.set(this.claimKey(tokenId, owner), claims);
  }

  private consumeBlindClaim(tokenId: number, owner: string, expectedClaimId: number): void {
    const claims = [...this.claims(tokenId, owner)];
    const index = claims.findIndex((claim) => claim.claimId === expectedClaimId);
    assert.ok(index >= 0, `holder ${owner} does not own Ravioli claim ${expectedClaimId}`);
    claims.splice(index, 1);
    const key = this.claimKey(tokenId, owner);
    if (claims.length) this.claimsByHolder.set(key, claims);
    else this.claimsByHolder.delete(key);
  }

  private claimCount(tokenId: number): number {
    const prefix = `${tokenId}:`;
    return [...this.claimsByHolder.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .reduce((sum, [, claims]) => sum + claims.length, 0);
  }

  private afterCall(address: string, entrypoint: string, payload: any, signer: string): void {
    if (address !== ROUTER) return;
    if (entrypoint === "transfer") {
      assert.ok(Array.isArray(payload) && payload.length === 1);
      const source = payload[0];
      assert.ok(Array.isArray(source?.txs) && source.txs.length === 1);
      const transfer = source.txs[0];
      const tokenId = Number(transfer?.token_id);
      const amount = Number(transfer?.amount);
      assert.equal(amount, 1);
      const sourceClaims = [...this.claims(tokenId, String(source.from_ || ""))];
      const moved = sourceClaims.pop();
      assert.ok(moved, "Ravioli blind transfer fixture has no source claim");
      const sourceKey = this.claimKey(tokenId, String(source.from_));
      if (sourceClaims.length) this.claimsByHolder.set(sourceKey, sourceClaims);
      else this.claimsByHolder.delete(sourceKey);
      this.claimsByHolder.set(
        this.claimKey(tokenId, String(transfer.to_ || "")),
        [...this.claims(tokenId, String(transfer.to_ || "")), moved],
      );
      return;
    }
    const tokenId = Number(payload?.token_id);
    if (!Number.isSafeInteger(tokenId) || tokenId < 0) return;
    const mode = this.mirror?.packs.get(tokenId)?.mode;
    if (entrypoint === "buy" && mode != null && mode > 0) {
      this.recordBlindClaims(tokenId, signer, Number(payload?.amount || 0));
    } else if (entrypoint === "open_pack" && mode != null && mode > 0) {
      this.consumeBlindClaim(tokenId, signer, Number(payload?.expected_claim_id));
    }
  }

  private controllerViews() {
    const view = (execute: (params: any, options: { viewCaller: string }) => unknown) =>
      (params: any) => ({ executeView: async (options: { viewCaller: string }) => execute(params, options) });
    return {
      get_pack_status: view((params) => {
        const tokenId = Number(params?.pack_token_id);
        const pack = this.mirror?.packs.get(tokenId);
        assert.ok(pack, `missing mirrored Ravioli pack ${tokenId}`);
        const sale = this.mirror?.sales.get(tokenId);
        const kit = this.mirror?.kits.get(tokenId);
        const revealed = pack.contents_uri != null;
        const outstanding = this.claimCount(tokenId);
        return {
          max_supply: pack.max_supply,
          inventory_owner: sale?.seller || CREATOR,
          treasury: sale?.treasury || CREATOR,
          unit_price: sale?.price || 0,
          sale_end: sale?.end ?? null,
          reveal_deadline: pack.reveal_deadline ?? null,
          open_deadline: pack.open_deadline ?? null,
          reveal_commitment: pack.reveal_commitment ?? null,
          contents_uri: pack.contents_uri == null ? null : { Some: pack.contents_uri },
          reveal_salt: revealed && kit?.sealedReveal ? { Some: kit.sealedReveal.salt } : null,
          revealed,
          reveal_offset: revealed && kit?.sealedReveal ? { Some: kit.sealedReveal.offset } : null,
          next_claim_id: this.nextClaimIdByToken.get(tokenId) || 0,
          outstanding,
          unclaimed: Math.max(0, pack.max_supply - (this.nextClaimIdByToken.get(tokenId) || 0)),
          escrowed: outstanding * (sale?.price || 0),
          cancelled: pack.cancelled,
        };
      }),
      get_claim_count: view((params) => this.claims(Number(params?.pack_token_id), String(params?.owner || "")).length),
      get_last_claim: view((params) => {
        const claims = this.claims(Number(params?.pack_token_id), String(params?.owner || ""));
        const claim = claims.at(-1);
        assert.ok(claim, "Ravioli holder has no claim");
        return { claim_id: claim.claimId, paid: claim.paid };
      }),
      get_claim_serial: view((params) => {
        const tokenId = Number(params?.pack_token_id);
        const holder = String(params?.holder || "");
        const expectedClaimId = Number(params?.expected_claim_id);
        assert.ok(this.claims(tokenId, holder).some((claim) => claim.claimId === expectedClaimId));
        const maxSupply = this.mirror?.packs.get(tokenId)?.max_supply || 1;
        const offset = this.mirror?.kits.get(tokenId)?.sealedReveal?.offset || 0;
        return (expectedClaimId + offset) % maxSupply;
      }),
      quote_refund: view((params) => {
        const claims = this.claims(Number(params?.pack_token_id), String(params?.holder || ""));
        const expectedClaimId = Number(params?.expected_claim_id);
        const start = claims.findIndex((claim) => claim.claimId === expectedClaimId);
        const amount = Number(params?.amount || 0);
        assert.ok(start >= 0 && amount >= 0 && start - amount + 1 >= 0);
        return claims.slice(start - amount + 1, start + 1).reduce((sum, claim) => sum + claim.paid, 0);
      }),
      get_refund_credit: view((owner) => this.mirror?.refundCredits.get(String(owner || "")) || 0),
    };
  }

  private rotiniAdapterViews() {
    const view = (execute: (params: any) => unknown) =>
      (params: any) => ({ executeView: async () => execute(params) });
    return {
      get_reserved: view(() => 16),
      get_render_context: view((params) => {
        const resourceId = Number(params?.resource_id);
        const resource = this.mirror?.rotiniResources.get(resourceId);
        assert.ok(resource, `missing mirrored Rotini resource ${resourceId}`);
        const seed = sha256(Buffer.from([
          params?.pack_contract,
          params?.pack_token_id,
          params?.open_serial,
          params?.action_index,
          resourceId,
          resource.target,
          resource.project_id,
        ].join(":")));
        return {
          target: String(resource.target),
          project_id: Number(resource.project_id),
          seed,
        };
      }),
    };
  }

  private gnocchiViews() {
    const view = (execute: (params: any) => unknown) =>
      (params: any) => ({ executeView: async () => execute(params) });
    return {
      get_balance: view((params) => {
        const tokenId = Number(params?.token_id);
        const owner = String(params?.owner || "");
        if (owner !== CREATOR || !Number.isSafeInteger(tokenId) || tokenId < 0) return 0;
        return this.options.gnocchiBalances?.[tokenId] ?? 16;
      }),
    };
  }

  private contract(address: string, signer: string) {
    return {
      address,
      entrypoints: {
        entrypoints: address === ROUTER ? {
          create_pack: routerCreatePackSchema(this.options),
          commit_recipe: { prim: "unit" },
          finalize_pack: { prim: "unit" },
          finalize_blind_pack: { prim: "unit" },
          mint: { prim: "unit" },
          set_sale: { prim: "unit" },
          open_pack: { prim: "unit" },
          set_pack_contents: { prim: "unit" },
          refund_blind_claims: { prim: "unit" },
          cancel_unrevealed_pack: { prim: "unit" },
          recover_asset: { prim: "unit" },
          recover_adapter: { prim: "unit" },
        } : address === BLIND_CONTROLLER ? {
          register_pack: { prim: "unit" },
          assign_claims: { prim: "unit" },
          move_claim_batch: { prim: "unit" },
          reveal: { prim: "unit" },
          consume_claim: { prim: "unit" },
          refund_claims: { prim: "unit" },
          withdraw_refund: { prim: "unit" },
          cancel_unrevealed: { prim: "unit" },
        } : address === ROTINI ? {
          mint_pack_iteration: rotiniMintPackIterationSchema(this.options.rotiniHasActionIndex !== false),
        } : address === GNOCCHI_ADAPTER ? {
          release: { prim: "unit" },
        } : address === ROTINI_ADAPTER ? {
          release: { prim: "unit" },
        } : {},
      },
      methodsObject: new Proxy({}, {
        get: (_target, entrypoint) => (payload: unknown) => ({
          send: async (sendOptions: unknown = {}) => this.operation({
            signerAddress: signer,
            action: "call",
            contractAddress: address,
            entrypoints: [String(entrypoint)],
            apply: () => {
              this.calls.push({ contractAddress: address, entrypoint: String(entrypoint), payload, sendOptions });
              this.afterCall(address, String(entrypoint), payload, signer);
            },
          }),
        }),
      }),
      contractViews: address === BLIND_CONTROLLER
        ? this.controllerViews()
        : address === GNOCCHI
          ? this.gnocchiViews()
        : address === ROTINI_ADAPTER
          ? this.rotiniAdapterViews()
          : {},
      storage: async () => this.storage(address),
    };
  }

  toolkit(address: string) {
    return {
      rpc: {
        getBlock: async (request: { block: string }) => {
          assert.deepEqual(request, { block: "head" });
          return {
            protocol: "PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY",
          };
        },
        getScript: async (contractAddress: string) => {
          assert.ok(this.scriptCodes.has(contractAddress), `missing fake script code for ${contractAddress}`);
          return { code: this.scriptCodes.get(contractAddress), storage: { prim: "Unit" } };
        },
      },
      tz: {
        async getBalance(requested: string) {
          assert.equal(requested, address);
          return { toString: () => "50000000" };
        },
      },
      contract: {
        originate: async () => {
          const originated = ADDRESSES[this.originIndex++];
          assert.ok(originated);
          const operation = this.operation({
            signerAddress: address,
            action: "originate",
            contractAddress: originated,
            entrypoints: [],
          });
          return {
            ...operation,
            async contract() { return { address: originated }; },
          };
        },
        at: async (contractAddress: string) => this.contract(contractAddress, address),
        batch() { throw new Error("Ravioli fixture does not batch"); },
      },
    } as any;
  }
}

async function projectStudioPolicyStorage(storage: unknown, mirror: RavioliUiStateMirror): Promise<unknown> {
  const source = storage as any;
  if (source?.sales && source?.policy_locked) {
    return {
      next_token_id: source.next_token_id,
      sales: source.sales,
      policy_locked: source.policy_locked,
      total_minted: source.total_minted,
      total_reserved: source.total_reserved,
    };
  }
  if (source?.projects) return { next_project_id: source.next_project_id, projects: source.projects };
  if (source?.resources || source?.allocations) return mirror.project(storage);
  return mirror.project(storage);
}

function authorizeFixtureControllerViews(
  session: TaquitoPastaUiLiveSession,
  controllerAddress: string,
  routerAddress: string,
): void {
  session.authorizeContractViews({
    contractAddress: controllerAddress,
    viewNames: FIXTURE_RAVIOLI_CONTROLLER_VIEWS,
    allowSessionSigner: true,
    allowedCallerContractAddresses: new Set([routerAddress]),
  });
}

function authorizeFixtureGnocchiBalanceView(session: TaquitoPastaUiLiveSession): void {
  session.authorizeContractViews({
    contractAddress: GNOCCHI,
    viewNames: FIXTURE_GNOCCHI_BALANCE_VIEWS,
    allowSessionSigner: true,
  });
}

function authorizeFixtureCollectorReadSurface(session: TaquitoPastaUiLiveSession): void {
  for (const contractAddress of [GNOCCHI_ADAPTER, ROTINI_ADAPTER, GNOCCHI, ROTINI]) {
    session.authorizeReadOnlyContract({ contractAddress });
  }
  session.authorizeContractViews({
    contractAddress: ROTINI_ADAPTER,
    viewNames: FIXTURE_ROTINI_ADAPTER_VIEWS,
    allowSessionSigner: true,
  });
}

let pinIndex = 0;
function fakeProof(fileName: string, mimeType = "application/json"): PastaUiLivePinProof {
  const suffix = String(++pinIndex).padStart(4, "a").replace(/0/g, "b").replace(/1/g, "c").replace(/2/g, "d").replace(/3/g, "e").replace(/4/g, "f").replace(/5/g, "g").replace(/6/g, "h").replace(/7/g, "i").replace(/8/g, "j").replace(/9/g, "k");
  const cid = `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3cte5${suffix}zzzzzzzzzzzzzzzz`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName,
    mimeType,
    byteLength: 123,
    sha256: "5af28061360b21d212e9b3f53af80d7b74b7656eaf7cc01c9e5c82a7aab28f08",
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function bridgeDecodedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bridgeDecodedJson);
  if (value && typeof value === "object") {
    const record = Object.create(null) as Record<string, unknown>;
    for (const [key, child] of Object.entries(value).reverse()) record[key] = bridgeDecodedJson(child);
    return record;
  }
  return value;
}

type FakePinRecord = {
  value?: unknown;
  bytes?: Uint8Array;
  proof: PastaUiLivePinProof;
};

async function fulfillFixtureIpfs(
  route: Route,
  pins: readonly FakePinRecord[],
): Promise<void> {
  const url = new URL(route.request().url());
  const cid = url.pathname.split("/").filter(Boolean).at(-1) || "";
  if (cid === ROTINI_GENERATOR_CID) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ROTINI_GENERATOR_MANIFEST),
    });
    return;
  }
  if (cid === ROTINI_LAYER_CID) {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    return;
  }
  const pin = pins.find((candidate) => candidate.proof.cid === cid);
  if (pin?.bytes) {
    await route.fulfill({
      status: 200,
      contentType: pin.proof.mimeType,
      body: Buffer.from(pin.bytes),
    });
    return;
  }
  if (pin && pin.value !== undefined) {
    await route.fulfill({
      status: 200,
      contentType: pin.proof.mimeType || "application/json",
      body: JSON.stringify(pin.value),
    });
    return;
  }
  await route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ error: `unknown Ravioli fixture CID ${cid}` }),
  });
}

async function artifacts() {
  const base = path.join(STATIC_ROOT, "creation-tools", "ravioli", "contract");
  const [
    blindController,
    router,
    gnocchiAdapter,
    rotiniAdapter,
    gnocchiTarget,
    rotiniTarget,
  ] = await Promise.all([
    readFile(path.join(base, "pasta-blind-pack-controller.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(base, "pasta-bundle.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(base, "pasta-gnocchi-pack-adapter.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(base, "pasta-rotini-pack-adapter.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(STATIC_ROOT, "creation-tools", "gnocchi", "contract", "pasta-open-edition.contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(STATIC_ROOT, "creation-tools", "rotini", "contract", "pasta-generative-collection.contract.json"), "utf8").then(JSON.parse),
  ]);
  return { blindController, router, gnocchiAdapter, rotiniAdapter, gnocchiTarget, rotiniTarget };
}

function installBundledScriptCodes(chain: FakeRavioliChain, code: Awaited<ReturnType<typeof artifacts>>): void {
  const rpcSectionOrder = (script: unknown[]) => [
    ...script.filter((section: any) => section?.prim === "view"),
    ...["parameter", "storage", "code"].map((prim) => script.find((section: any) => section?.prim === prim)),
  ];
  chain.setContractScriptCode(BLIND_CONTROLLER, rpcSectionOrder(code.blindController));
  chain.setRouterScriptCode(rpcSectionOrder(code.router));
  chain.setContractScriptCode(GNOCCHI, rpcSectionOrder(code.gnocchiTarget));
  chain.setContractScriptCode(ROTINI, rpcSectionOrder(code.rotiniTarget));
  chain.setContractScriptCode(GNOCCHI_ADAPTER, rpcSectionOrder(code.gnocchiAdapter));
  chain.setContractScriptCode(ROTINI_ADAPTER, rpcSectionOrder(code.rotiniAdapter));
}

async function openStudio(
  server: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>,
  options: {
    exposeRecoveryInternals?: boolean;
    getPins?: () => readonly FakePinRecord[];
  } = {},
) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: PASTA_PROOF_VIEWPORT, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
  if (options.getPins) {
    await context.route("https://ipfs.fileship.xyz/**", (route) => fulfillFixtureIpfs(route, options.getPins?.() || []));
  }
  if (options.exposeRecoveryInternals) {
    const studioSource = await readFile(
      path.join(STATIC_ROOT, "creation-tools", "ravioli", "js", "studio.js"),
      "utf8",
    );
    await context.route("**/creation-tools/ravioli/js/studio.js", (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `${studioSource}\n;globalThis.__ravioliRecoveryTest = { boundedRecoveryCanonical, recoveryConfirmedIntent, canonicalJsonText, sha256Json, encryptPublicReveal, decryptPublicReveal };\n`,
    }));
  }
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${server.origin}/creation-tools/ravioli/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
  await installPastaUiLiveBrowserProxy(page, server, "UI-MOCK");
  return { browser, context, page, monitor };
}

async function openSite(input: {
  server: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>>;
  config: any;
  pins?: readonly FakePinRecord[];
}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: PASTA_PROOF_VIEWPORT, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
  const proxy = buildPastaUiLiveProxyInstallerSource(input.server.origin, input.server.sessionToken, "UI-MOCK");
  const source = await readFile(path.join(STATIC_ROOT, "creation-tools", "ravioli", "js", "site.js"), "utf8");
  await context.route("**/pasta.config.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `window.PASTA_SITE_CONFIG=${JSON.stringify(input.config)};` }));
  await context.route("**/js/site.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: `${proxy}\n${source}` }));
  await context.route(
    "http://127.0.0.1:8080/ipfs/**",
    (route) => fulfillFixtureIpfs(route, input.pins || []),
  );
  await context.route(
    "https://ipfs.fileship.xyz/**",
    (route) => fulfillFixtureIpfs(route, input.pins || []),
  );
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  await page.goto(`${input.server.origin}/creation-tools/ravioli/site.html`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.textContent?.includes("On-chain state loaded.") || status?.dataset.error === "true";
    }, undefined, { timeout: 10_000 });
  } catch (error) {
    const status = (await page.locator("#status").textContent()) || "";
    const scripts = await page.locator("script").evaluateAll((nodes) => nodes.map((node) => ({ src: (node as HTMLScriptElement).src, loaded: (node as HTMLScriptElement).dataset.loaded || "" })));
    const globals = await page.evaluate(() => ({
      bridge: Boolean((window as any).__pastaUiLiveBridge?.installed),
      config: (window as any).PASTA_SITE_CONFIG || null,
      md: Boolean((window as any).MD),
      toolkit: Boolean((window as any).MD?.getToolkit?.()),
      resources: performance.getEntriesByType("resource").map((entry: any) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize })),
    }));
    const events = monitor.list();
    monitor.dispose();
    await browser.close();
    throw new Error(`site initialization timed out: ${status}; globals=${JSON.stringify(globals)}; browser events=${JSON.stringify(events)}; scripts=${JSON.stringify(scripts)}`, { cause: error });
  }
  const initialStatus = (await page.locator("#status").textContent()) || "";
  assert.match(initialStatus, /On-chain state loaded\./, `site initialization failed: ${initialStatus}`);
  await page.selectOption("#pinProvider", "node");
  await page.fill("#pinNode", "http://127.0.0.1:5001");
  return { browser, context, page, monitor };
}

async function waitFor(page: Page, selector: string, expected: string) {
  await page.waitForFunction(
    ({ selector: selected, expected: text }) => document.querySelector(selected)?.textContent?.includes(text),
    { selector, expected },
    { timeout: 30_000 },
  );
}

type SiteActionDiagnosticContext = {
  tokenId: number;
  actor: string;
  phase: "buy" | "open";
  monitor: ReturnType<typeof monitorPastaProofPage>;
  getSessionReceipts: () => Array<{ action: string; sequence: number; entrypoints?: string[]; operationHash?: string }>;
};

async function siteActionSnapshot(
  page: Page,
  selector: string,
  beforeBrowserCallCount: number,
  beforeSessionReceiptCount: number,
  diagnostic: SiteActionDiagnosticContext,
) {
  const browser = await page.evaluate(({ selected, beforeCalls }) => {
    const selectedButton = document.querySelector(selected) as HTMLButtonElement | null;
    const submitButton = document.querySelector("#submit") as HTMLButtonElement | null;
    const secondaryButton = document.querySelector("#secondarySubmit") as HTMLButtonElement | null;
    const selectedStyle = selectedButton ? getComputedStyle(selectedButton) : null;
    const submitStyle = submitButton ? getComputedStyle(submitButton) : null;
    const secondaryStyle = secondaryButton ? getComputedStyle(secondaryButton) : null;
    const receipts = ((window as any).__pastaUiLiveBridge?.receipts || []) as any[];
    const calls = receipts.filter((receipt) => receipt.action === "call");
    const status = document.getElementById("status");
    return {
      selectedButton: {
        exists: Boolean(selectedButton),
        text: selectedButton?.textContent?.trim() || "",
        hidden: selectedButton?.hidden ?? null,
        disabled: selectedButton?.disabled ?? null,
        visible: Boolean(selectedButton && !selectedButton.hidden && selectedStyle?.display !== "none" && selectedStyle?.visibility !== "hidden"),
      },
      submitButton: {
        exists: Boolean(submitButton),
        text: submitButton?.textContent?.trim() || "",
        hidden: submitButton?.hidden ?? null,
        disabled: submitButton?.disabled ?? null,
        visible: Boolean(submitButton && !submitButton.hidden && submitStyle?.display !== "none" && submitStyle?.visibility !== "hidden"),
      },
      secondaryButton: {
        exists: Boolean(secondaryButton),
        text: secondaryButton?.textContent?.trim() || "",
        hidden: secondaryButton?.hidden ?? null,
        disabled: secondaryButton?.disabled ?? null,
        visible: Boolean(secondaryButton && !secondaryButton.hidden && secondaryStyle?.display !== "none" && secondaryStyle?.visibility !== "hidden"),
      },
      chainState: document.getElementById("chainState")?.textContent?.trim() || "",
      status: status?.textContent?.trim() || "",
      statusError: status?.dataset.error || "",
      amount: (document.getElementById("amount") as HTMLInputElement | null)?.value || "",
      openKitLength: (document.getElementById("openKit") as HTMLTextAreaElement | null)?.value.length || 0,
      manualArtifactControlPresent: Boolean(document.getElementById("openArtifact")),
      browserCallCount: calls.length,
      browserCallDelta: calls.length - beforeCalls,
      browserCalls: calls.slice(Math.max(0, beforeCalls - 1)).map((receipt) => ({
        sequence: receipt.sequence,
        entrypoints: receipt.entrypoints,
        operationHash: receipt.operationHash,
      })),
    };
  }, { selected: selector, beforeCalls: beforeBrowserCallCount });
  const sessionReceipts = diagnostic.getSessionReceipts();
  return {
    tokenId: diagnostic.tokenId,
    actor: diagnostic.actor,
    phase: diagnostic.phase,
    selector,
    ...browser,
    sessionReceiptCount: sessionReceipts.length,
    sessionReceiptDelta: sessionReceipts.length - beforeSessionReceiptCount,
    sessionReceipts: sessionReceipts.slice(Math.max(0, beforeSessionReceiptCount - 1)),
    browserEvents: diagnostic.monitor.list(),
  };
}

async function clickAndWaitForSiteSuccess(page: Page, selector: string, diagnostic: SiteActionDiagnosticContext) {
  const previousCallCount = await page.evaluate(() => (
    ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length
  ));
  const previousSessionReceiptCount = diagnostic.getSessionReceipts().length;
  const before = await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic);
  try {
    await page.click(selector);
    await page.waitForFunction((beforeCalls) => {
      const status = document.getElementById("status");
      const calls = ((window as any).__pastaUiLiveBridge?.receipts || []).filter((receipt: any) => receipt.action === "call").length;
      return calls > beforeCalls || status?.dataset.error === "true";
    }, previousCallCount, { timeout: 30_000 });
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.textContent?.includes("Confirmed on Tezos") || status?.dataset.error === "true";
    }, undefined, { timeout: 30_000 });
    const status = (await page.locator("#status").textContent()) || "";
    assert.match(status, /Confirmed on Tezos/, `site action failed: ${status}`);
  } catch (error) {
    const after = await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic);
    throw new Error(`Ravioli fixture action timeout: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`, { cause: error });
  }
  return {
    before,
    after: await siteActionSnapshot(page, selector, previousCallCount, previousSessionReceiptCount, diagnostic),
  };
}

function recipes(mode: number) {
  const escrow = (tokenId: number) => ({ kind: "escrow", fa2: GNOCCHI, tokenId, amount: 1 });
  if (mode === 0) return [[escrow(0)]];
  if (mode === 1) return [[escrow(0)], [escrow(1)]];
  if (mode === 2) return [[{ kind: "allocated", amount: 1 }]];
  if (mode === 3) return [[
    { kind: "generative", amount: 1 },
    { kind: "generative", amount: 1 },
  ]];
  return [[escrow(1), { kind: "allocated", amount: 1 }, { kind: "generative", amount: 1 }]];
}

async function configurePack(page: Page, mode: number, routerAddress: string) {
  const editions = RAVIOLI_UI_LIVE_PACK_SPECS[mode].editions;
  await configureRavioliPackMode(page, mode);
  await page.fill("#bnEditions", String(editions));
  await page.fill("#bnName", `Fixture ${MODES[mode]}`);
  await page.fill("#bnDesc", `Real Ravioli page fixture ${mode}`);
  await page.fill("#bnTags", "ravioli, fixture");
  if (await page.locator("#bnForSale").isDisabled()) {
    assert.equal(await page.locator("#bnForSale").isChecked(), true);
  } else {
    await page.check("#bnForSale");
  }
  await page.fill("#bnPrice", mode === 0 ? "0" : "0.000001");
  if (await page.locator("#bnSaleCount").isDisabled()) {
    assert.equal(await page.inputValue("#bnSaleCount"), String(editions));
  } else {
    await page.fill("#bnSaleCount", String(editions));
  }
  await page.fill("#bnSaleStart", "");
  const saleEnd = mode === 0
    ? ""
    : mode === 2
      ? LIMITED_WRAPPER_END.slice(0, 16)
      : "2099-08-01T00:00";
  const revealDeadline = mode === 0
    ? ""
    : mode === 2
      ? "2099-08-19T23:30"
      : "2099-08-02T00:00";
  const openDeadline = mode === 0
    ? ""
    : mode === 2
      ? "2099-08-20T01:00"
      : "2099-08-03T00:00";
  await page.fill("#bnSaleEnd", saleEnd);
  for (const [selector, value] of [
    ["#bnRevealDeadline", revealDeadline],
    ["#bnOpenDeadline", openDeadline],
  ] as const) {
    if (await page.locator(selector).isDisabled()) {
      assert.equal(await page.inputValue(selector), value);
    } else {
      await page.fill(selector, value);
    }
  }
  if (mode === 2) await page.fill("#gTokenId", "3");
  if (mode === 4) await page.fill("#gTokenId", String(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID));
  if (!(await page.locator("#recipeJson").isVisible())) {
    await page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
  }
  await page.fill("#recipeJson", JSON.stringify(recipes(mode)));
  await page.setInputFiles("#bnArtifact", { name: `ravioli-wrapper-${mode}.png`, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from(String(mode))]) });
  if (mode === 0) await page.check('input[name="target"][value="new_collection"]');
  else {
    await page.check('input[name="target"][value="existing_contract"]');
    await page.fill("#existingKt", routerAddress);
  }
}

async function capture(outputRoot: string, actor: { page: Page; monitor: ReturnType<typeof monitorPastaProofPage> }, ordinal: number, stage: string, selector: string, expectedText: string): Promise<CapturePastaProofStageResult> {
  await actor.page.locator(selector).scrollIntoViewIfNeeded();
  return capturePastaProofStage({ page: actor.page, monitor: actor.monitor, outputRoot, app: "ravioli", capability: "five-mode real-page fixture", stageOrdinal: ordinal, stageName: stage, classification: "UI-MOCK", requiredEvidence: [{ selector, expectedText }], waitForLoadState: "none" });
}

const STRICT_OPEN_KIT_MANIFEST_URI = "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

function ravioliFixtureDependencies() {
  return {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      limitedAllocationTokenId: 3,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2", "ipfs://gnocchi3"],
      limitedEdition: { receipt: { token: { end: LIMITED_CHILD_END, recommendedRavioliSaleEnd: LIMITED_WRAPPER_END } } },
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  } as any;
}

function strictOpenKit(input: {
  tokenId?: unknown;
  serial?: unknown;
  mode?: (typeof MODES)[number];
  manifestUri?: string;
  action?: any;
} = {}): any {
  const mode = input.mode || "deterministic_vault";
  return {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: input.tokenId === undefined ? 0 : input.tokenId,
    mode,
    manifestUri: input.manifestUri || STRICT_OPEN_KIT_MANIFEST_URI,
    blindSecurity: mode === "deterministic_vault" ? "public" : "commit-reveal-ui-hidden-chain-public",
    warning: "Keep this exact recovery kit private until holders should be able to open the pack.",
    editionPolicy: {
      requiresLimitedWrapper: false,
      wrapperEditionClass: mode === "deterministic_vault" ? "fixed-supply" : "limited-edition",
      earliestChildEnd: null,
      wrapperSaleStart: null,
      wrapperSaleEnd: mode === "deterministic_vault" ? null : "2026-08-01T00:00:00.000Z",
      revealDeadline: mode === "deterministic_vault" ? null : "2026-08-02T00:00:00.000Z",
      openDeadline: mode === "deterministic_vault" ? null : "2026-08-03T00:00:00.000Z",
    },
    ...(mode === "deterministic_vault" ? {} : {
      sealedReveal: {
        schema: "pasta-ravioli-sealed-reveal-reference@1",
        contentsUri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
        salt: "12".repeat(32),
        offset: 0,
        envelopeSha256: "34".repeat(32),
      },
    }),
    recipes: [{
      serial: input.serial === undefined ? 0 : input.serial,
      nonce: "ab".repeat(32),
      actions: [input.action || { kind: "escrow", fa2: GNOCCHI, tokenId: 0, amount: 1 }],
    }],
  };
}

function reservationForStrictKitAction(action: any): any {
  if (action.kind === "escrow") {
    return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
  }
  const value = {
    adapter: action.adapter,
    resource_id: action.resourceId,
    payload_commitment: action.payloadCommitment ?? null,
  };
  return action.kind === "allocated" ? { allocated_mint: value } : { generative_mint: value };
}

function seedStrictOpenKitPack(input: {
  mirror: RavioliUiStateMirror;
  kit: any;
  exactCommitment?: boolean;
  holder?: string;
  registerKit?: boolean;
}): void {
  const tokenId = Number(input.kit.tokenId);
  assert.ok(Number.isSafeInteger(tokenId) && tokenId >= 0);
  input.mirror.routerAddress = ROUTER;
  input.mirror.nextTokenId = tokenId + 1;
  input.mirror.packs.set(tokenId, {
    mode: MODES.indexOf(input.kit.mode),
    blind: input.kit.mode !== "deterministic_vault",
    item_count: input.kit.recipes[0].actions.length,
    max_supply: input.kit.recipes.length,
    committed_recipes: 0,
    finalized: true,
    cancelled: false,
    contents_uri: null,
    manifest_uri: Buffer.from(STRICT_OPEN_KIT_MANIFEST_URI).toString("hex"),
    child_expiry: null,
    wrapper_sale_end: null,
  });
  input.mirror.totalSupply.set(tokenId, 1);
  input.mirror.opened.set(tokenId, 0);
  if (input.exactCommitment) {
    const nonceCommitment = Buffer.from(
      blake2b(Buffer.from(input.kit.recipes[0].nonce, "hex"), undefined, 32),
    ).toString("hex");
    input.mirror.applySuccessfulCall(ROUTER, "commit_recipe", {
      token_id: tokenId,
      nonce_commitment: nonceCommitment,
      reservations: input.kit.recipes[0].actions.map(reservationForStrictKitAction),
    }, CREATOR);
  } else {
    const pack = input.mirror.packs.get(tokenId);
    assert.ok(pack);
    pack.committed_recipes = 1;
    input.mirror.recipeCommitments.set(`${tokenId}:0`, "00".repeat(32));
  }
  if (input.holder) input.mirror.ledger.set(`${input.holder}:${tokenId}`, 1);
  if (input.registerKit) input.mirror.registerKit(input.kit);
}

async function startStrictRavioliStudioFixture(input: {
  chain?: FakeRavioliChain;
  mirror?: RavioliUiStateMirror;
  signer?: string;
  callRole?: "creator" | "collector";
  exposeRecoveryInternals?: boolean;
} = {}) {
  const chain = input.chain || new FakeRavioliChain();
  const mirror = input.mirror || new RavioliUiStateMirror();
  const signer = input.signer || CREATOR;
  const pins: any[] = [];
  if (mirror.routerAddress) {
    if (!mirror.administrator) mirror.administrator = CREATOR;
    if (!mirror.blindControllerAddress) mirror.blindControllerAddress = BLIND_CONTROLLER;
    if (!mirror.gnocchiAdapterAddress) mirror.gnocchiAdapterAddress = GNOCCHI_ADAPTER;
    if (!mirror.rotiniAdapterAddress) mirror.rotiniAdapterAddress = ROTINI_ADAPTER;
  }
  chain.attachMirror(mirror);
  const code = await artifacts();
  installBundledScriptCodes(chain, code);
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies: ravioliFixtureDependencies(),
    mirror,
    pins,
    codeHashes: {
      deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
      blindController: hashJsonForBridge(code.blindController),
      router: hashJsonForBridge(code.router),
      gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(code.rotiniAdapter),
    },
  });
  const collector = input.callRole === "collector";
  const session = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(signer),
    signerAddress: signer,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([
      GNOCCHI,
      ROTINI,
      BLIND_CONTROLLER,
      GNOCCHI_ADAPTER,
      ROTINI_ADAPTER,
      ROUTER,
    ]),
    allowedEntrypoints: collector
      ? RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS
      : RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    assertOperationApplied: (assertion) => chain.assertOperationApplied(assertion, signer),
    pinJson: async ({ fileName }) => fakeProof(fileName),
    pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    validateOrigination: (value) => policy.validateOrigination(value),
    validateCall: (value) => collector
      ? policy.validateCollectorCall(signer, value)
      : policy.validateCall(value),
    beforePin: ({ value, fileName, mimeType }) => {
      policy.validatePin({ value, fileName, mimeType });
    },
    projectStorage: (storage) => projectStudioPolicyStorage(storage, mirror),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  authorizeFixtureGnocchiBalanceView(session);
  session.authorizeAfterFundingPreflight({
    balanceMutez: 50_000_000,
    requiredBalanceMutez: 10_000_000,
    estimatedOriginationMutez: 5_000_000,
    operationReserveMutez: 5_000_000,
  });
  authorizeFixtureControllerViews(session, BLIND_CONTROLLER, ROUTER);
  session.authorizeContractViews({
    contractAddress: ROTINI_ADAPTER,
    viewNames: FIXTURE_ROTINI_ADAPTER_VIEWS,
    allowSessionSigner: true,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: signer }),
  });
  const studio = await openStudio(server, {
    exposeRecoveryInternals: input.exposeRecoveryInternals,
    getPins: () => pins,
  });
  return { chain, mirror, pins, policy, session, server, signer, studio };
}

async function closeStrictRavioliStudioFixture(
  fixture: Awaited<ReturnType<typeof startStrictRavioliStudioFixture>>,
): Promise<void> {
  fixture.studio.monitor.dispose();
  await fixture.studio.browser.close();
  await fixture.server.close();
}

async function connectStrictRavioliStudioFixture(
  fixture: Awaited<ReturnType<typeof startStrictRavioliStudioFixture>>,
): Promise<void> {
  await fixture.studio.page.selectOption("#network", "shadownet");
  await fixture.studio.page.selectOption("#pinProvider", "node");
  await fixture.studio.page.fill("#pinNode", "http://127.0.0.1:5001");
  await fixture.studio.page.click("#btnConnect");
  await waitFor(fixture.studio.page, "#log", `connected ${fixture.signer}`);
}

function assertNoStrictFixtureSideEffects(
  fixture: Awaited<ReturnType<typeof startStrictRavioliStudioFixture>>,
  label: string,
): void {
  assert.equal(fixture.pins.length, 0, `${label} must precede every IPFS pin`);
  assert.equal(fixture.chain.calls.length, 0, `${label} must precede every contract call`);
  assert.equal(countRavioliChainWriteReceipts(fixture.session.getReceipts()), 0, `${label} must precede every signer write`);
}

const RAVIOLI_RECOVERY_INDEX_KEY = "pasta.ravioli.publish-recovery-index.v1";
const RAVIOLI_RECOVERY_SCHEMA = "pasta-ravioli-publish-recovery@1";
const RAVIOLI_RECOVERY_ENCODING = "pasta-recovery-canonical@1";
const RAVIOLI_RECOVERY_OPERATION = `o${"1".repeat(50)}`;

function canonicalPlainRecoveryValue(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalPlainRecoveryValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalPlainRecoveryValue(value[key])]),
    );
  }
  return value;
}

function canonicalOpenRecoveryIntent(kit: any): any {
  return canonicalPlainRecoveryValue({
    action: "call",
    entrypoint: "open_pack",
    expectedCounter: 42,
    network: "shadownet",
    payload: {
      actions: kit.recipes[0].actions.map(reservationForStrictKitAction),
      nonce: kit.recipes[0].nonce,
      token_id: Number(kit.tokenId),
    },
    signer: CREATOR,
    target: ROUTER,
  });
}

function recoveryHistoryForSignerStage(input: {
  kit: any;
  stage: string;
  terminal: "PREPARED" | "SUBMITTED" | "CONFIRMED";
  includeOpenPreflight?: boolean;
}): any[] {
  const intent = canonicalOpenRecoveryIntent(input.kit);
  const intentSha256 = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  const history: any[] = [{
    stage: "DRAFT_SAVED_BEFORE_SIDE_EFFECT",
    status: "IN_PROGRESS",
    at: "2026-07-22T00:00:00.000Z",
  }];
  if (input.includeOpenPreflight) {
    history.push({
      stage: "OPEN_PREFLIGHT_VERIFIED",
      status: "IN_PROGRESS",
      at: "2026-07-22T00:00:01.000Z",
      details: { serial: 0 },
    });
  }
  history.push({
    stage: `${input.stage}:PREPARED`,
    status: "IN_PROGRESS",
    at: "2026-07-22T00:00:02.000Z",
    details: { intent, intentSha256 },
  });
  if (["SUBMITTED", "CONFIRMED"].includes(input.terminal)) {
    history.push({
      stage: `${input.stage}:SUBMITTED`,
      status: "IN_PROGRESS",
      at: "2026-07-22T00:00:03.000Z",
      operationHash: RAVIOLI_RECOVERY_OPERATION,
      details: { intentSha256 },
    });
  }
  if (input.terminal === "CONFIRMED") {
    history.push({
      stage: `${input.stage}:CONFIRMED`,
      status: "IN_PROGRESS",
      at: "2026-07-22T00:00:04.000Z",
      operationHash: RAVIOLI_RECOVERY_OPERATION,
      details: { intentSha256 },
    });
  }
  return history;
}

function recoveryRecord(input: {
  draftId: string;
  history: any[];
  kit?: any;
  encoding?: string | null;
  workflow?: string;
  expectedTerminalStage?: string;
}): any {
  const kit = input.kit ?? null;
  return {
    schema: RAVIOLI_RECOVERY_SCHEMA,
    ...(input.encoding === null ? {} : { encoding: input.encoding || RAVIOLI_RECOVERY_ENCODING }),
    status: "IN_PROGRESS",
    draftId: input.draftId,
    network: "shadownet",
    account: CREATOR,
    contract: kit?.contract ?? null,
    tokenId: kit?.tokenId ?? null,
    kit,
    product: {
      name: `Recovery ${input.draftId}`,
      mode: kit?.mode || "deterministic_vault",
      editions: kit?.recipes?.length || 1,
      target: kit ? "existing_contract" : "new_collection",
      workflow: input.workflow || "publish",
      expectedTerminalStage: input.expectedTerminalStage || "SET_WRAPPER_SALE",
    },
    history: input.history,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: input.history.at(-1)?.at || "2026-07-22T00:00:00.000Z",
  };
}

async function installRecoveryRecord(page: Page, record: any): Promise<string> {
  const key = `pasta.ravioli.publish-recovery-draft.v1:shadownet:${CREATOR}:${record.draftId}`;
  await page.evaluate(({ recoveryKey, indexKey, value }) => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const candidate = localStorage.key(index);
      if (candidate?.startsWith("pasta.ravioli.publish-recovery")) localStorage.removeItem(candidate);
    }
    localStorage.setItem(recoveryKey, JSON.stringify(value));
    localStorage.setItem(indexKey, JSON.stringify([recoveryKey]));
  }, { recoveryKey: key, indexKey: RAVIOLI_RECOVERY_INDEX_KEY, value: record });
  await page.selectOption("#network", "mainnet");
  await page.selectOption("#network", "shadownet");
  await page.locator("#publishRecoveryPanel").waitFor({ state: "visible" });
  return key;
}

async function storedRecovery(page: Page, key: string): Promise<any> {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), key);
}

test("Ravioli buyer initialization retries only read-only loads and closes every pre-return failure", async () => {
  assert.deepEqual(RAVIOLI_BUYER_READINESS_POLICY, {
    maxAttempts: 3,
    attemptTimeoutMs: 30_000,
    retryDelayMs: 750,
  });
  assert.equal(RAVIOLI_BUYER_READINESS_BOUND_MS, 91_500);
  assert.equal(RAVIOLI_PREBUY_MIN_REMAINING_MS, 2 * 60 * 1_000);
  const runnerSource = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-ravioli-ui-live.ts"),
    "utf8",
  );
  const buyPackSource = runnerSource.slice(
    runnerSource.indexOf("const buyPack = async"),
    runnerSource.indexOf("const openHeldPack = async"),
  );
  assert.match(buyPackSource, /assertRemainingSaleWindow\("before buyer-page initialization"\)/);
  assert.match(buyPackSource, /assertRemainingSaleWindow\("before purchase submission"\)/);
  assert.doesNotMatch(
    buyPackSource,
    /mainProduct\s*!==?\s*false[\s\S]{0,200}assertRemainingSaleWindow/,
    "the expired-permission fixture must not bypass either pre-buy deadline guard",
  );
  const chainTimestamp = "2026-07-24T01:00:00.000Z";
  const exactSafeEnd = new Date(
    Date.parse(chainTimestamp) + RAVIOLI_PREBUY_MIN_REMAINING_MS,
  ).toISOString();
  assert.equal(
    assertRavioliPreBuyWindow({
      chainTimestamp,
      saleEnd: exactSafeEnd,
      label: "fixture",
    }),
    RAVIOLI_PREBUY_MIN_REMAINING_MS,
  );
  assert.throws(
    () => assertRavioliPreBuyWindow({
      chainTimestamp,
      saleEnd: new Date(Date.parse(exactSafeEnd) - 1).toISOString(),
      label: "fixture",
    }),
    /before sale expiry/,
  );
  assert.equal(
    ravioliChainWaitTimeoutMs("2026-07-24T01:30:00.000Z", Date.parse(chainTimestamp)),
    40 * 60 * 1_000,
  );
  assert.equal(
    ravioliChainWaitTimeoutMs("2026-07-24T00:59:00.000Z", Date.parse(chainTimestamp)),
    10 * 60 * 1_000,
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  let navigations = 0;
  await context.route("https://ravioli-readiness.invalid/site", async (route) => {
    navigations += 1;
    const ready = navigations > 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body>
        <p id="status"${ready ? "" : " data-error=\"true\""}>${ready ? "On-chain state loaded." : "Transient RPC read failed."}</p>
        <script>
          globalThis.__pastaUiLiveBridge = { installed: true };
          ${ready ? "" : "console.error('first read failed');"}
        </script>
      </body></html>`,
    });
  });
  try {
    const result = await waitForRavioliBuyerPageReady({
      page,
      monitor,
      url: "https://ravioli-readiness.invalid/site",
      policy: {
        maxAttempts: 3,
        attemptTimeoutMs: 2_000,
        retryDelayMs: 0,
      },
    });
    assert.deepEqual(result, { attempts: 2 });
    assert.equal(navigations, 2);
    assert.deepEqual(
      monitor.list(),
      [],
      "fatal events from the failed read attempt must not poison a later clean read",
    );
  } finally {
    monitor.dispose();
    await browser.close();
  }

  const originalFailure = new Error("readiness failed");
  let disposed = 0;
  let closed = 0;
  await assert.rejects(
    () => rethrowAfterClosingRavioliBuyerPage({
      browser: { close: async () => { closed += 1; } },
      monitor: { dispose: () => { disposed += 1; } },
      error: originalFailure,
    }),
    (error) => error === originalFailure,
  );
  assert.equal(disposed, 1);
  assert.equal(closed, 1);

  const closeFailure = new Error("browser close failed");
  await assert.rejects(
    () => rethrowAfterClosingRavioliBuyerPage({
      browser: { close: async () => { throw closeFailure; } },
      monitor: { dispose: () => {} },
      error: originalFailure,
    }),
    (error: any) => (
      error instanceof AggregateError
      && error.errors[0] === originalFailure
      && error.errors[1] === closeFailure
    ),
  );
});

test("Ravioli timestamp policy compares equal instants instead of ISO text formatting", () => {
  assert.doesNotThrow(() =>
    assertRavioliSameInstantOrNull(
      "2026-07-31T02:07:00.000Z",
      "2026-07-31T02:07:00Z",
      "LE child expiry",
    )
  );
  assert.doesNotThrow(() =>
    assertRavioliSameInstantOrNull(null, undefined, "absent deadline")
  );
  assert.throws(
    () =>
      assertRavioliSameInstantOrNull(
        "2026-07-31T02:07:00.001Z",
        "2026-07-31T02:07:00Z",
        "LE child expiry",
      ),
    /LE child expiry/,
  );
  assert.throws(
    () => assertRavioliSameInstantOrNull("not-a-date", "2026-07-31T02:07:00Z", "LE child expiry"),
    /actual timestamp is invalid/,
  );
});

test("Ravioli separates configurable long green windows from its explicit short-expiry red fixture", () => {
  const nowMs = Date.parse("2026-07-24T01:00:00.000Z");
  const defaults = resolveRavioliGreenDeadlinePolicy({}, nowMs);
  assert.deepEqual(defaults, {
    saleWindowMs: Date.parse(RAVIOLI_MAXIMUM_GREEN_SALE_END_ISO) - nowMs,
    revealAfterSaleMs: PASTA_DATETIME_LOCAL_RESOLUTION_MS,
    openAfterSaleMs: 2 * PASTA_DATETIME_LOCAL_RESOLUTION_MS,
  });
  const custom = resolveRavioliGreenDeadlinePolicy({
    PASTA_SHADOWNET_RAVIOLI_GREEN_SALE_HOURS: "36",
    PASTA_SHADOWNET_RAVIOLI_GREEN_REVEAL_AFTER_SALE_HOURS: "72",
    PASTA_SHADOWNET_RAVIOLI_GREEN_OPEN_AFTER_SALE_HOURS: "240",
  }, nowMs);
  assert.deepEqual(custom, {
    saleWindowMs: 36 * 60 * 60 * 1_000,
    revealAfterSaleMs: 72 * 60 * 60 * 1_000,
    openAfterSaleMs: 240 * 60 * 60 * 1_000,
  });
  assert.throws(
    () => resolveRavioliGreenDeadlinePolicy({
      PASTA_SHADOWNET_RAVIOLI_GREEN_SALE_HOURS: "0.5",
    }, nowMs),
    /GREEN_SALE_HOURS/,
  );
  assert.throws(
    () => resolveRavioliGreenDeadlinePolicy({
      PASTA_SHADOWNET_RAVIOLI_GREEN_REVEAL_AFTER_SALE_HOURS: "72",
      PASTA_SHADOWNET_RAVIOLI_GREEN_OPEN_AFTER_SALE_HOURS: "48",
    }, nowMs),
    /open deadline must follow its reveal deadline/,
  );
  const standard = buildRavioliBlindDeadlines({
    kind: "non-limited",
    nowMs,
    ...defaults,
  });
  assert.equal(standard.saleEnd, RAVIOLI_MAXIMUM_GREEN_SALE_END_ISO);
  assert.equal(standard.revealDeadline, RAVIOLI_MAXIMUM_GREEN_REVEAL_DEADLINE_ISO);
  assert.equal(standard.openDeadline, RAVIOLI_MAXIMUM_GREEN_OPEN_DEADLINE_ISO);
  assert.equal(standard.openDeadline, PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO);

  const redCalculation = calculateRavioliRedDeadlineWindows();
  assert.deepEqual(RAVIOLI_EVENT86_RED_DEADLINE_EVIDENCE, {
    maxOperationMs: 25_995,
    maxPinGapMs: 36_597,
    preBuyOperationCount: 7,
    preBuyPinCount: 4,
    buyerReadinessBoundMs: 91_500,
    datetimeLocalTruncationBoundMs: 60_000,
    shadownetBlockDelayMs: 6_000,
  });
  assert.deepEqual(redCalculation, {
    measuredSaleRunwayMs: 485_853,
    saleWindowMs: 9 * 60 * 1_000,
    revealWindowMs: 10 * 60 * 1_000,
  });

  const withheldFixture = buildRavioliBlindDeadlines({
    kind: "withheld-reveal-test-fixture",
    nowMs,
  });
  assert.equal(
    Date.parse(withheldFixture.saleEnd) - nowMs,
    RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_SALE_WINDOW_MS,
  );
  assert.equal(
    Date.parse(withheldFixture.revealDeadline) - nowMs,
    RAVIOLI_WITHHELD_REVEAL_TEST_FIXTURE_REVEAL_WINDOW_MS,
  );
  assert.equal(withheldFixture.openDeadline, PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO);
  assert.ok(Date.parse(withheldFixture.saleEnd) < Date.parse(withheldFixture.revealDeadline));
  assert.ok(Date.parse(withheldFixture.revealDeadline) < Date.parse(withheldFixture.openDeadline));

  const greenPool = RAVIOLI_UI_LIVE_PACK_SPECS[1];
  assert.deepEqual(
    { editions: greenPool.editions, soldEditions: greenPool.soldEditions },
    { editions: 2, soldEditions: 2 },
  );
  assert.equal(ravioliSaleNeedsDeadlineWait(greenPool), false);
  assert.deepEqual(
    {
      editions: RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC.editions,
      soldEditions: RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC.soldEditions,
    },
    { editions: 2, soldEditions: 1 },
  );
  assert.equal(
    ravioliSaleNeedsDeadlineWait(RAVIOLI_UI_LIVE_EXPIRED_PERMISSION_PACK_SPEC),
    true,
  );

  const childExpiry = "2026-07-31T02:00:00.000Z";
  const limited = buildRavioliBlindDeadlines({
    kind: "limited-child",
    nowMs,
    wrapperMaxSupply: 1,
    wrapperSaleEnd: "2026-07-31T01:00:00.000Z",
    childExpiry,
    minimumSaleRunwayMs: RAVIOLI_PREBUY_MIN_REMAINING_MS,
  });
  assert.ok(Date.parse(limited.saleEnd) < Date.parse(limited.revealDeadline));
  assert.ok(Date.parse(limited.revealDeadline) <= Date.parse(childExpiry));
  assert.ok(Date.parse(limited.revealDeadline) < Date.parse(limited.openDeadline));

  const maximumLimited = buildRavioliBlindDeadlines({
    kind: "limited-child",
    nowMs,
    wrapperMaxSupply: 1,
    wrapperSaleEnd: pastaDeadlineBeforeCeiling(3),
    childExpiry: pastaDeadlineBeforeCeiling(1),
    minimumSaleRunwayMs: RAVIOLI_PREBUY_MIN_REMAINING_MS,
  });
  assert.deepEqual(maximumLimited, {
    saleEnd: pastaDeadlineBeforeCeiling(3),
    revealDeadline: pastaDeadlineBeforeCeiling(2),
    openDeadline: pastaDeadlineBeforeCeiling(0),
  });

  const maximumHorizonDependencies = ravioliFixtureDependencies();
  maximumHorizonDependencies.gnocchi.limitedEdition.receipt.token = {
    end: pastaDeadlineBeforeCeiling(1),
    recommendedRavioliSaleEnd: pastaDeadlineBeforeCeiling(3),
  };
  assert.deepEqual(
    defaultRavioliBlindDeadlines(2, maximumHorizonDependencies, nowMs, {}),
    maximumLimited,
    "Ravioli's default Gnocchi LE composition must retain the bounded-child pre-buy runway",
  );

  assert.throws(
    () => buildRavioliBlindDeadlines({
      kind: "limited-child",
      nowMs,
      wrapperMaxSupply: 1,
      wrapperSaleEnd: childExpiry,
      childExpiry,
    }),
    /sale must end before its LE child expiry/,
  );
  assert.throws(
    () => buildRavioliBlindDeadlines({
      kind: "limited-child",
      nowMs,
      wrapperMaxSupply: 0,
      wrapperSaleEnd: "2026-07-31T01:00:00.000Z",
      childExpiry,
    }),
    /finite wrapper supply/,
  );
});

test("real Ravioli studio and buyer page drive all five v3 modes through loopback signer callbacks", async (context) => {
  const baselineHeapUsed = process.memoryUsage().heapUsed;
  const memorySamples = [sampleRavioliUiLiveMemory("browser-fixture-start")];
  const outputRoot = await mkdtemp(path.join(tmpdir(), "ravioli-ui-live-browser-"));
  const chain = new FakeRavioliChain();
  const mirror = new RavioliUiStateMirror();
  const pins: any[] = [];
  chain.attachMirror(mirror);
  const code = await artifacts();
  installBundledScriptCodes(chain, code);
  const dependencies: any = {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      limitedAllocationTokenId: 3,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2", "ipfs://gnocchi3"],
      limitedEdition: { receipt: { token: { end: LIMITED_CHILD_END, recommendedRavioliSaleEnd: LIMITED_WRAPPER_END } } },
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  };
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies,
    mirror,
    pins,
    codeHashes: {
      deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
      blindController: hashJsonForBridge(code.blindController),
      router: hashJsonForBridge(code.router),
      gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(code.rotiniAdapter),
    },
  });
  const creatorSession = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(CREATOR), signerAddress: CREATOR, expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI, ROTINI]), allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    assertOperationApplied: (assertion) => chain.assertOperationApplied(assertion, CREATOR),
    pinJson: async ({ fileName }) => fakeProof(fileName), pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    beforePin: (input) => policy.validatePin(input),
    validateOrigination: (input) => policy.validateOrigination(input),
    validateCall: (input) => {
      if (input.entrypoint !== "set_pack_contents") {
        policy.validateCall(input);
        return;
      }
      const payload = input.payload as any;
      const tokenId = Number(payload?.token_id);
      const kit = mirror.kits.get(tokenId);
      assert.ok(kit?.sealedReveal, `Ravioli token ${tokenId} reveal needs its private sealed reference`);
      const uri = Buffer.from(String(payload.contents_uri || ""), "hex").toString("utf8");
      assert.equal(uri, kit.sealedReveal.contentsUri);
      assert.equal(payload.salt, kit.sealedReveal.salt);
      assert.equal(Number(payload.offset), kit.sealedReveal.offset);
      const sealed = pins.find((pin) => pin.proof.uri === uri);
      assert.equal(sealed?.value?.schema, "pasta-ravioli-sealed-reveal@1");
      assert.equal(
        sha256(deterministicJsonBytes(sealed.value)),
        kit.sealedReveal.envelopeSha256,
        "published Ravioli reveal must reuse the exact authenticated ciphertext pinned before sale",
      );
    },
    projectStorage: (storage) => projectStudioPolicyStorage(storage, mirror),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  authorizeFixtureGnocchiBalanceView(creatorSession);
  creatorSession.authorizeAfterFundingPreflight({ balanceMutez: 50_000_000, requiredBalanceMutez: 10_000_000, estimatedOriginationMutez: 5_000_000, operationReserveMutez: 5_000_000 });
  const creatorServer = await startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: createRavioliMirroredSessionHandler({ session: creatorSession, mirror, policy, signerAddress: CREATOR }) });
  let studio: Awaited<ReturnType<typeof openStudio>> | null = null;
  let collectorOneServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  let collectorTwoServer: Awaited<ReturnType<typeof startPastaUiLiveLoopbackServer>> | null = null;
  const captures: CapturePastaProofStageResult[] = [];
  try {
    studio = await openStudio(creatorServer, { getPins: () => pins });
    await studio.page.selectOption("#network", "shadownet");
    await studio.page.selectOption("#pinProvider", "node");
    await studio.page.fill("#pinNode", "http://127.0.0.1:5001");
    await studio.page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
    await studio.page.fill("#collSymbol", "RVUI");
    await studio.page.locator("#adapterSetup > summary").click();
    await studio.page.fill("#gTargetKt", GNOCCHI);
    await studio.page.fill("#gTokenId", String(RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID));
    await studio.page.fill("#rTargetKt", ROTINI);
    await studio.page.fill("#rProjectId", "3");
    await studio.page.click("#btnConnect");
    await waitFor(studio.page, "#log", `connected ${CREATOR} on shadownet`);
    const kits: any[] = [];
    for (let mode = 0; mode < 5; mode += 1) {
      await configurePack(studio.page, mode, mirror.routerAddress);
      const downloadPromise = studio.page.waitForEvent("download");
      await studio.page.click("#btnPublish");
      const download = await downloadPromise.catch(async (error) => {
        const log = (await studio?.page.locator("#log").textContent()) || "";
        throw new Error(
          `Ravioli open-kit download did not start for mode ${mode}; log=${JSON.stringify(log)}; browser events=${JSON.stringify(studio?.monitor.list() || [])}`,
          { cause: error },
        );
      });
      await waitFor(studio.page, "#log", `pack ${mode} is fully reserved and ready`).catch(async (error) => {
        throw new Error(
          `Ravioli pack ${mode} did not reach ready after its open-kit download; ` +
          `log=${JSON.stringify((await studio?.page.locator("#log").textContent()) || "")} ` +
          `recovery=${JSON.stringify((await studio?.page.locator("#publishRecoveryInfo").textContent()) || "")}`,
          { cause: error },
        );
      });
      await studio.page.waitForFunction(() => !document.getElementById("btnPublish")?.hasAttribute("disabled"));
      const inPageJson = await studio.page.inputValue("#openKit");
      const downloadPath = await download.path();
      assert.ok(downloadPath);
      const openKitCapture = validateRavioliOpenKitDownload({
        mode,
        routerAddress: mirror.routerAddress,
        suggestedFilename: download.suggestedFilename(),
        inPageJson,
        downloadedBytes: await readFile(downloadPath),
      });
      const kit = openKitCapture.kit;
      mirror.registerKit(kit);
      kits.push(kit);
      if (mode === 0) {
        authorizeFixtureControllerViews(creatorSession, BLIND_CONTROLLER, ROUTER);
      }
      memorySamples.push(sampleRavioliUiLiveMemory(`browser-fixture-pack-${mode}-published`));
    }
    captures.push(await capture(outputRoot, studio, 1, "five products issued", "#log", "pack 4 is fully reserved"));
    assert.equal(mirror.nextTokenId, 5);
    assert.equal(mirror.gnocchiNextResourceId, 2);
    assert.equal(mirror.rotiniNextResourceId, 2);
    assert.equal(pins.filter((pin) => pin.proof.fileName.includes("pack-adapter-contract")).length, 2);

    const makeCollector = async (wallet: string) => {
      const session = new TaquitoPastaUiLiveSession({
        tezos: chain.toolkit(wallet), signerAddress: wallet, expectedChainId: SHADOWNET_CHAIN_ID,
        allowedContractAddresses: new Set([ROUTER, BLIND_CONTROLLER]), allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_COLLECTOR_ENTRYPOINTS,
        assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
        assertOperationApplied: (assertion) => chain.assertOperationApplied(assertion, wallet),
        pinJson: async ({ fileName }) => fakeProof(fileName), pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
        validateCall: (input) => policy.validateCollectorCall(wallet, input),
        projectStorage: (storage) => projectRavioliUiLiveStorage(storage, mirror),
        onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
      });
      session.authorizeAfterFundingPreflight({ balanceMutez: 50_000_000, requiredBalanceMutez: 2_000_000, estimatedOriginationMutez: 0, operationReserveMutez: 2_000_000 });
      authorizeFixtureControllerViews(session, BLIND_CONTROLLER, ROUTER);
      authorizeFixtureCollectorReadSurface(session);
      const server = await startPastaUiLiveLoopbackServer({ staticRoot: STATIC_ROOT, handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: wallet }) });
      return { session, server };
    };
    const collectorOne = await makeCollector(COLLECTOR_ONE);
    const collectorTwo = await makeCollector(COLLECTOR_TWO);
    collectorOneServer = collectorOne.server;
    collectorTwoServer = collectorTwo.server;
    const siteConfig = (tokenId: number) => ({
      app: "ravioli",
      label: "Ravioli",
      title: `Fixture ${MODES[tokenId]}`,
      description: "Real Ravioli v3 page fixture",
      network: "shadownet",
      contract: ROUTER,
      tokenId,
      ipfsGateway: "http://127.0.0.1:8080/ipfs/",
    });
    const purchases: Array<[number, typeof collectorOne, string]> = [
      [0, collectorOne, COLLECTOR_ONE],
      [1, collectorOne, COLLECTOR_ONE],
      [1, collectorTwo, COLLECTOR_TWO],
      [2, collectorOne, COLLECTOR_ONE],
      [3, collectorTwo, COLLECTOR_TWO],
      [4, collectorOne, COLLECTOR_ONE],
    ];
    for (const [tokenId, collector, actor] of purchases) {
      const site = await openSite({
        server: collector.server,
        config: siteConfig(tokenId),
        pins,
      });
      try {
        assert.equal(await site.page.locator("#openArtifact").count(), 0);
        await site.page.click("#connect");
        await waitFor(site.page, "#status", "Wallet connected");
        const diagnostic = await clickAndWaitForSiteSuccess(site.page, "#submit", {
          tokenId,
          actor,
          phase: "buy",
          monitor: site.monitor,
          getSessionReceipts: () => collector.session.getReceipts(),
        });
        if (process.env.PASTA_RAVIOLI_FIXTURE_DIAGNOSTICS === "1") {
          context.diagnostic(`Ravioli fixture action ${JSON.stringify(diagnostic.after)}`);
        }
      } finally {
        site.monitor.dispose();
        await site.browser.close();
      }
    }
    assert.ok([1, 2, 3, 4].every((tokenId) => mirror.sales.get(tokenId)?.remaining === 0));

    for (const tokenId of [1, 2, 3, 4]) {
      await studio.page.fill("#opKt", ROUTER);
      await studio.page.fill("#opTokenId", String(tokenId));
      await studio.page.fill("#openKit", JSON.stringify(kits[tokenId]));
      await studio.page.locator("#ppNotice").evaluate((node) => { node.textContent = ""; });
      await studio.page.click("#btnReveal");
      await waitFor(studio.page, "#ppNotice", "Reveal key published.");
      await studio.page.waitForFunction(() => !document.getElementById("btnReveal")?.hasAttribute("disabled"));
      const contentsHex = mirror.packs.get(tokenId)?.contents_uri;
      assert.equal(
        Buffer.from(String(contentsHex || ""), "hex").toString("utf8"),
        kits[tokenId].sealedReveal.contentsUri,
        `Ravioli token ${tokenId} must publish its precommitted encrypted reveal`,
      );
    }

    const tokenOneOwnersByClaimId: Array<[typeof collectorOne, string]> = [
      [collectorOne, COLLECTOR_ONE],
      [collectorTwo, COLLECTOR_TWO],
    ];
    const tokenOneOffset = Number(kits[1].sealedReveal.offset);
    const tokenOneOpenings: Array<[number, typeof collectorOne, string]> = [0, 1].map((serial) => {
      const claimId = (serial - tokenOneOffset + 2) % 2;
      const [collector, actor] = tokenOneOwnersByClaimId[claimId];
      return [1, collector, actor];
    });
    const openings: Array<[number, typeof collectorOne, string]> = [
      [0, collectorOne, COLLECTOR_ONE],
      ...tokenOneOpenings,
      [2, collectorOne, COLLECTOR_ONE],
      [3, collectorTwo, COLLECTOR_TWO],
      [4, collectorOne, COLLECTOR_ONE],
    ];
    let captureOrdinal = 2;
    for (const [tokenId, collector, actor] of openings) {
      const site = await openSite({
        server: collector.server,
        config: siteConfig(tokenId),
        pins,
      });
      try {
        assert.equal(await site.page.locator("#openArtifact").count(), 0);
        await waitFor(site.page, "#ravioliRenderNotice", "No artwork upload is accepted");
        const discoveredKit = JSON.parse(await site.page.inputValue("#openKit"));
        assert.equal(Object.prototype.hasOwnProperty.call(discoveredKit, "sealedReveal"), false);
        assert.equal(discoveredKit.tokenId, tokenId);
        if (tokenId > 0) {
          await waitFor(site.page, "#actionDetail", "Open kit loaded from the authenticated encrypted on-chain reveal");
        } else {
          await waitFor(site.page, "#actionDetail", "Open kit loaded from the on-chain public reveal");
        }
        await site.page.click("#connect");
        await waitFor(site.page, "#status", "Wallet connected");
        const openSelector = await site.page.locator("#secondarySubmit").isVisible() ? "#secondarySubmit" : "#submit";
        const openingDiagnostic = await clickAndWaitForSiteSuccess(site.page, openSelector, {
          tokenId,
          actor,
          phase: "open",
          monitor: site.monitor,
          getSessionReceipts: () => collector.session.getReceipts(),
        });
        if (process.env.PASTA_RAVIOLI_FIXTURE_DIAGNOSTICS === "1") {
          context.diagnostic(`Ravioli fixture action ${JSON.stringify(openingDiagnostic.after)}`);
        }
        const expectedChainState = `${mirror.totalSupply.get(tokenId) || 0} wrappers live · fully reserved${tokenId > 0 ? " · transfers freeze at the open cutoff" : ""}`;
        await waitFor(site.page, "#chainState", expectedChainState);
        assert.equal((await site.page.locator("#chainState").textContent())?.trim(), expectedChainState);
        memorySamples.push(sampleRavioliUiLiveMemory(`browser-fixture-pack-${tokenId}-opened`));
        if (tokenId === 3 || tokenId === 4) {
          captures.push(await capture(outputRoot, site, captureOrdinal++, `${MODES[tokenId]} opened`, "#chainState", "fully reserved"));
        }
      } finally {
        site.monitor.dispose();
        await site.browser.close();
      }
    }
    assert.deepEqual([...mirror.opened.entries()], [[0, 1], [1, 2], [2, 1], [3, 1], [4, 1]]);
    assert.ok([...mirror.totalSupply.values()].every((value) => value === 0));
    assert.equal(chain.calls.filter((call) => call.entrypoint === "open_pack").length, 6);
    const buyCalls = chain.calls.filter((call) => call.entrypoint === "buy");
    assert.equal(buyCalls.length, 6);
    assert.deepEqual(
      buyCalls.map((call) => Number(call.sendOptions?.amount || 0)),
      [0, 1, 1, 1, 1, 1],
    );
    assert.equal(
      pins.filter((pin) => pin.bytes && /^ravioli-(?:3|4)-\d+-\d+\.png$/.test(pin.proof.fileName)).length,
      3,
      "Ravioli must render and pin all three Rotini children automatically",
    );
    assert.equal(
      pins.filter((pin) => pin.value && pin.proof.fileName.startsWith("ravioli-generated-token")).length,
      3,
      "Ravioli must pin generator-bound metadata for all three automatic Rotini children",
    );
    assert.equal(
      chain.confirmationCalls,
      0,
      "successful Ravioli UI-live verification must not depend on native confirmation polling",
    );
    assert.equal(
      chain.verifiedOperationHashes.length,
      chain.operations.size,
      "every fake Ravioli operation must pass exact-hash applied-state verification",
    );
    assert.ok(
      [...chain.operations.values()].every(({ status }) => status === "applied"),
      "every fake Ravioli operation must settle independently as applied",
    );
    assert.equal(chain.poisonedBigMapReads, 0, "real Studio flow must never traverse adapter BigMap provider graphs");
    const peakHeapGrowth = Math.max(...memorySamples.map((sample) => sample.heapUsedBytes)) - baselineHeapUsed;
    assert.ok(peakHeapGrowth < 384 * 1024 * 1024, `browser fixture heap grew by ${peakHeapGrowth} bytes`);
    context.diagnostic(
      `Ravioli heap telemetry: ${memorySamples.length} samples, ${peakHeapGrowth} byte peak growth, ` +
      `${RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES} byte production ceiling, ${chain.poisonedBigMapReads} poisoned BigMap reads`,
    );
    assert.equal(captures.length, 3);
    for (const proof of captures) await verifyScreenshotSidecar(proof.pngPath, proof.sidecarPath);
  } finally {
    studio?.monitor.dispose();
    await studio?.browser.close();
    await Promise.all([
      creatorServer.close(),
      collectorOneServer?.close(),
      collectorTwoServer?.close(),
    ]);
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Ravioli mirror fails closed for unknown storage and memory telemetry enforces its ceiling", () => {
  const mirror = new RavioliUiStateMirror();
  assert.throws(
    () => mirror.project({ next_resource_id: 0 }),
    /unsupported Ravioli storage shape.*refusing to expose raw Taquito storage/,
  );

  const usage = {
    rss: 200,
    heapTotal: 180,
    heapUsed: 150,
    external: 10,
    arrayBuffers: 5,
  };
  assert.deepEqual(
    sampleRavioliUiLiveMemory("deterministic-unit", {
      usage,
      sampledAtUtc: "2026-07-18T00:00:00.000Z",
      heapCeilingBytes: 160,
    }),
    {
      stage: "deterministic-unit",
      sampledAtUtc: "2026-07-18T00:00:00.000Z",
      heapCeilingBytes: 160,
      rssBytes: 200,
      heapTotalBytes: 180,
      heapUsedBytes: 150,
      externalBytes: 10,
      arrayBuffersBytes: 5,
    },
  );
  assert.throws(
    () => sampleRavioliUiLiveMemory("over-ceiling", { usage, heapCeilingBytes: 149 }),
    /heap ceiling exceeded at over-ceiling: 150 > 149 bytes/,
  );
  assert.ok(RAVIOLI_UI_LIVE_HEAP_CEILING_BYTES < 4_000_000_000);
});

test("Ravioli mirror preserves pull-based refund credit through permissionless closure and holder withdrawal", () => {
  const mirror = new RavioliUiStateMirror();
  mirror.bindOrigination("blindController", BLIND_CONTROLLER);
  mirror.bindOrigination("router", ROUTER);
  mirror.applySuccessfulCall(ROUTER, "create_pack", {
    expected_token_id: 0,
    token_info: {},
    config: {
      mode: 2,
      blind: true,
      item_count: 1,
      max_supply: 1,
      committed_recipes: 1,
      finalized: false,
      cancelled: false,
      contents_uri: null,
      manifest_uri: STRICT_OPEN_KIT_MANIFEST_URI,
      child_expiry: null,
      wrapper_sale_end: "2026-08-01T00:00:00.000Z",
      reveal_deadline: "2026-08-02T00:00:00.000Z",
      open_deadline: "2026-08-03T00:00:00.000Z",
      reveal_commitment: "ab".repeat(32),
    },
  }, CREATOR);
  mirror.applySuccessfulCall(ROUTER, "finalize_blind_pack", {
    token_id: 0,
    sale: {
      active: true,
      seller: CREATOR,
      treasury: CREATOR,
      price: 1,
      remaining: 1,
      start: null,
      end: "2026-08-01T00:00:00.000Z",
    },
  }, CREATOR);
  mirror.applySuccessfulCall(ROUTER, "buy", { token_id: 0, amount: 1 }, COLLECTOR_ONE);
  mirror.applySuccessfulCall(ROUTER, "refund_blind_claims", {
    token_id: 0,
    holder: COLLECTOR_ONE,
    expected_claim_id: 0,
    amount: 1,
  }, COLLECTOR_TWO);
  assert.equal(mirror.totalSupply.get(0), 0);
  assert.equal(mirror.refundCredits.get(COLLECTOR_ONE), 1);

  mirror.applySuccessfulCall(ROUTER, "cancel_unrevealed_pack", 0, COLLECTOR_TWO);
  assert.equal(mirror.packs.get(0)?.cancelled, true);
  assert.equal(mirror.packs.get(0)?.finalized, false);
  assert.equal(mirror.sales.get(0)?.active, false);
  assert.equal(mirror.refundCredits.get(COLLECTOR_ONE), 1, "permissionless closure must not consume holder credit");

  assert.throws(
    () => mirror.applySuccessfulCall(BLIND_CONTROLLER, "withdraw_refund", {
      destination: COLLECTOR_ONE,
      amount: 2,
    }, COLLECTOR_ONE),
    /refund withdrawal exceeds mirrored credit/,
  );
  mirror.applySuccessfulCall(BLIND_CONTROLLER, "withdraw_refund", {
    destination: COLLECTOR_ONE,
    amount: 1,
  }, COLLECTOR_ONE);
  assert.equal(mirror.refundCredits.get(COLLECTOR_ONE), undefined);
});

test("Ravioli mirror burns cancelled wrapper supply and releases exact unused Gnocchi adapter capacity", () => {
  const mirror = new RavioliUiStateMirror();
  mirror.bindOrigination("blindController", BLIND_CONTROLLER);
  mirror.bindOrigination("router", ROUTER);
  mirror.bindOrigination("gnocchiAdapter", GNOCCHI_ADAPTER);
  mirror.applySuccessfulCall(ROUTER, "create_pack", {
    expected_token_id: 0,
    token_info: {},
    config: {
      mode: 2,
      blind: true,
      item_count: 1,
      max_supply: 2,
      committed_recipes: 0,
      finalized: false,
      cancelled: false,
      contents_uri: null,
      manifest_uri: STRICT_OPEN_KIT_MANIFEST_URI,
      child_expiry: null,
      wrapper_sale_end: "2026-08-01T00:00:00.000Z",
      reveal_deadline: "2026-08-02T00:00:00.000Z",
      open_deadline: "2026-08-03T00:00:00.000Z",
      reveal_commitment: "ab".repeat(32),
    },
  }, CREATOR);
  for (const nonceCommitment of ["11".repeat(32), "22".repeat(32)]) {
    mirror.applySuccessfulCall(ROUTER, "commit_recipe", {
      token_id: 0,
      nonce_commitment: nonceCommitment,
      reservations: [{
        allocated_mint: {
          adapter: GNOCCHI_ADAPTER,
          payload_commitment: null,
          resource_id: 2,
        },
      }],
    }, CREATOR);
  }
  mirror.applySuccessfulCall(ROUTER, "finalize_blind_pack", {
    token_id: 0,
    sale: {
      active: true,
      seller: CREATOR,
      treasury: CREATOR,
      price: 1,
      remaining: 2,
      start: null,
      end: "2026-08-01T00:00:00.000Z",
    },
  }, CREATOR);
  mirror.applySuccessfulCall(
    ROUTER,
    "buy",
    { token_id: 0, amount: 1 },
    COLLECTOR_ONE,
  );
  mirror.applySuccessfulCall(ROUTER, "refund_blind_claims", {
    token_id: 0,
    holder: COLLECTOR_ONE,
    expected_claim_id: 0,
    amount: 1,
  }, COLLECTOR_TWO);
  mirror.applySuccessfulCall(
    ROUTER,
    "cancel_unrevealed_pack",
    0,
    COLLECTOR_TWO,
  );

  const allowanceKey = `0:${GNOCCHI_ADAPTER}:1:2`;
  const reservationKey = `${GNOCCHI_ADAPTER}:0:2`;
  assert.equal(mirror.totalSupply.get(0), 0);
  assert.equal(mirror.minted.get(0), 0);
  assert.equal(mirror.adapterAllowances.get(allowanceKey), 2);
  assert.equal(mirror.adapterReservations.get(reservationKey), 2);
  assert.throws(
    () => mirror.applySuccessfulCall(ROUTER, "recover_adapter", {
      token_id: 0,
      adapter: GNOCCHI_ADAPTER,
      kind: 1,
      resource_id: 2,
      capacity: 3,
    }, CREATOR),
    /Ravioli adapter allowance cannot become negative/,
  );
  assert.equal(mirror.adapterAllowances.get(allowanceKey), 2);
  assert.equal(mirror.adapterReservations.get(reservationKey), 2);

  mirror.applySuccessfulCall(ROUTER, "recover_adapter", {
    token_id: 0,
    adapter: GNOCCHI_ADAPTER,
    kind: 1,
    resource_id: 2,
    capacity: 2,
  }, CREATOR);
  assert.equal(mirror.adapterAllowances.has(allowanceKey), false);
  assert.equal(mirror.adapterReservations.has(reservationKey), false);
});

test("Ravioli projects exact late-bound adapter resources without traversing provider graphs", async () => {
  const mirror = new RavioliUiStateMirror();
  mirror.bindOrigination("gnocchiAdapter", GNOCCHI_ADAPTER);
  mirror.bindOrigination("rotiniAdapter", ROTINI_ADAPTER);
  mirror.applySuccessfulCall(GNOCCHI_ADAPTER, "create_allocation", {
    target: GNOCCHI,
    token_id: 3,
    amount_per_open: 1,
    active: true,
  }, CREATOR);
  mirror.applySuccessfulCall(ROTINI_ADAPTER, "create_resource", {
    target: ROTINI,
    project_id: 3,
    active: true,
  }, CREATOR);
  let providerGraphReads = 0;
  const poison = new PoisonedBigMapAbstraction(() => { providerGraphReads += 1; });
  const allocationProjection = await projectRavioliUiLiveStorage({
    administrator: CREATOR,
    allocations: poison,
    next_resource_id: 1,
  }, mirror) as any;
  const resourceProjection = await projectRavioliUiLiveStorage({
    administrator: CREATOR,
    resources: poison,
    next_resource_id: 1,
  }, mirror) as any;
  assert.deepEqual(allocationProjection.allocations.get("0"), {
    target: GNOCCHI,
    token_id: 3,
    amount_per_open: 1,
    active: true,
  });
  assert.deepEqual(resourceProjection.resources.get("0"), {
    target: ROTINI,
    project_id: 3,
    active: true,
  });
  assert.equal(allocationProjection.next_resource_id, 1);
  assert.equal(resourceProjection.next_resource_id, 1);
  assert.equal(providerGraphReads, 0);
});

test("Ravioli router projection exposes only positive bounded FA2 ledger balances needed by Studio transfer preflight", () => {
  const mirror = new RavioliUiStateMirror();
  mirror.setAdministrator(CREATOR);
  mirror.bindOrigination("blindController", BLIND_CONTROLLER);
  mirror.bindOrigination("router", ROUTER);
  mirror.ledger.set(`${COLLECTOR_ONE}:1`, 1);
  mirror.ledger.set(`${COLLECTOR_TWO}:1`, 2);
  const projection = mirror.projectRouter() as any;
  assert.equal(projection.ledger.get({ owner: COLLECTOR_ONE, token_id: 1 }), 1);
  assert.equal(projection.ledger.get({ owner: COLLECTOR_TWO, token_id: 1 }), 2);
  assert.equal(Array.from(projection.ledger.entries()).length, 2);
});

test("Ravioli live transfer waiter reports Studio preflight rejection immediately instead of hiding it behind the success timeout", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <div id="ppNotice"></div>
      <pre id="log"></pre>
      <div id="transferInfo"></div>
    `);
    await page.evaluate(() => {
      setTimeout(() => {
        document.getElementById("ppNotice")!.textContent =
          "Wrapper transfer failed: Ravioli router does not expose its FA2 ledger";
        document.getElementById("log")!.textContent =
          "wrapper transfer failed: Ravioli router does not expose its FA2 ledger";
      }, 25);
    });
    const startedAt = Date.now();
    await assert.rejects(
      () => waitForRavioliStudioTransferOutcome(page, 5_000),
      /failed before confirmation.*does not expose its FA2 ledger/,
    );
    assert.ok(Date.now() - startedAt < 2_000, "Ravioli Studio preflight rejection was not surfaced immediately");
  } finally {
    await browser.close();
  }
});

test("real Ravioli Studio transfers a blind wrapper and its exact claim to a holder with no prior ledger row", async () => {
  const kit = strictOpenKit({ tokenId: 1, mode: "blind_funded_pool" });
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({
    mirror,
    kit,
    exactCommitment: true,
    holder: COLLECTOR_ONE,
  });
  mirror.blindClaims.set(`${COLLECTOR_ONE}:1`, [0]);
  mirror.blindNextClaimId.set(1, 1);
  const chain = new FakeRavioliChain();
  chain.seedBlindClaim(1, COLLECTOR_ONE, 0, 1);
  const fixture = await startStrictRavioliStudioFixture({
    chain,
    mirror,
    signer: COLLECTOR_ONE,
    callRole: "collector",
  });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    await fixture.studio.page
      .locator("#btnTransferWrapper")
      .locator("xpath=ancestor::details")
      .locator("summary")
      .click();
    await fixture.studio.page.fill("#opKt", ROUTER);
    await fixture.studio.page.fill("#opTokenId", "1");
    await fixture.studio.page.fill("#transferRecipient", COLLECTOR_TWO);
    await fixture.studio.page.click("#btnTransferWrapper");
    await waitForRavioliStudioTransferOutcome(fixture.studio.page, 5_000);
    assert.equal(mirror.ledger.get(`${COLLECTOR_ONE}:1`), undefined);
    assert.equal(mirror.ledger.get(`${COLLECTOR_TWO}:1`), 1);
    assert.equal(
      chain.calls.filter((call) => call.entrypoint === "transfer").length,
      1,
      "Ravioli Studio submitted more than one wrapper transfer",
    );
    assert.match(
      (await fixture.studio.page.locator("#transferInfo").textContent()) || "",
      /blind claim 0 moved together/,
    );
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio rejects null or false open-kit token ids and serials before external side effects", async () => {
  const kit = strictOpenKit();
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({ mirror, kit });
  const fixture = await startStrictRavioliStudioFixture({ mirror });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    await fixture.studio.page.fill("#opKt", ROUTER);
    await fixture.studio.page.fill("#opTokenId", "0");
    const cases = [
      { label: "null token id", mutate: (value: any) => { value.tokenId = null; }, expected: "open kit contract/token does not match" },
      { label: "false token id", mutate: (value: any) => { value.tokenId = false; }, expected: "open kit contract/token does not match" },
      { label: "null recipe serial", mutate: (value: any) => { value.recipes[0].serial = null; }, expected: "open kit recipe 0 is malformed" },
      { label: "false recipe serial", mutate: (value: any) => { value.recipes[0].serial = false; }, expected: "open kit recipe 0 is malformed" },
    ];
    for (const scenario of cases) {
      const malformed = structuredClone(kit);
      scenario.mutate(malformed);
      await fixture.studio.page.locator("#log").evaluate((node) => { node.textContent = ""; });
      await fixture.studio.page.fill("#openKit", JSON.stringify(malformed));
      await fixture.studio.page.click("#btnRedeem");
      await waitFor(fixture.studio.page, "#log", scenario.expected);
      assertNoStrictFixtureSideEffects(fixture, scenario.label);
    }
    assert.equal(
      await fixture.studio.page.evaluate(() => localStorage.getItem("pasta.ravioli.publish-recovery-index.v1")),
      null,
      "invalid primitive types must not start a recovery journal",
    );
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio rejects manifest substitution and unknown open-kit fields before pins or writes", async () => {
  const kit = strictOpenKit();
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({ mirror, kit });
  const fixture = await startStrictRavioliStudioFixture({ mirror });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    await fixture.studio.page.fill("#opKt", ROUTER);
    await fixture.studio.page.fill("#opTokenId", "0");
    const cases = [
      {
        label: "substituted manifest",
        mutate: (value: any) => { value.manifestUri = "ipfs://bafkreibadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad"; },
        expected: "open kit manifest URI does not match immutable pack identity",
      },
      {
        label: "unknown outer field",
        mutate: (value: any) => { value.uncommittedDisplayOverride = "ipfs://bafkreiunknown"; },
        expected: "Ravioli open kit has unsupported or missing fields",
      },
      {
        label: "unknown recipe field",
        mutate: (value: any) => { value.recipes[0].uncommittedOverride = true; },
        expected: "open kit recipe 0 has unsupported or missing fields",
      },
      {
        label: "unknown action field",
        mutate: (value: any) => { value.recipes[0].actions[0].uncommittedOverride = 1; },
        expected: "open kit recipe 0 escrow action has unsupported or missing fields",
      },
    ];
    for (const scenario of cases) {
      const malformed = structuredClone(kit);
      scenario.mutate(malformed);
      await fixture.studio.page.locator("#log").evaluate((node) => { node.textContent = ""; });
      await fixture.studio.page.fill("#openKit", JSON.stringify(malformed));
      await fixture.studio.page.click("#btnRedeem");
      await waitFor(fixture.studio.page, "#log", scenario.expected);
      assertNoStrictFixtureSideEffects(fixture, scenario.label);
    }
    assert.equal(
      await fixture.studio.page.evaluate(() => localStorage.getItem("pasta.ravioli.publish-recovery-index.v1")),
      null,
      "schema/identity rejection must not start a recovery journal",
    );
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio verifies the next recipe commitment before generative pins", async () => {
  const kit = strictOpenKit({
    mode: "blind_generative_mint",
    action: { kind: "generative", adapter: ROTINI_ADAPTER, resourceId: 0, payloadCommitment: null },
  });
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({ mirror, kit, holder: CREATOR });
  const chain = new FakeRavioliChain();
  chain.seedBlindClaim(0, CREATOR);
  const fixture = await startStrictRavioliStudioFixture({ chain, mirror });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    await fixture.studio.page.fill("#opKt", ROUTER);
    await fixture.studio.page.fill("#opTokenId", "0");
    await fixture.studio.page.fill("#openKit", JSON.stringify(kit));
    await fixture.studio.page.click("#btnRedeem");
    await waitFor(
      fixture.studio.page,
      "#log",
      "open kit recipe 0 does not match the immutable on-chain commitment",
    ).catch(async (error) => {
      throw new Error(
        `Ravioli commitment mismatch preflight returned ${JSON.stringify((await fixture.studio.page.locator("#log").textContent()) || "")}`,
        { cause: error },
      );
    });
    assertNoStrictFixtureSideEffects(fixture, "commitment mismatch");
    assert.equal(
      await fixture.studio.page.evaluate(() => localStorage.getItem("pasta.ravioli.publish-recovery-index.v1")),
      null,
      "commitment rejection must occur before generative recovery/pinning starts",
    );
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli recovery canonicalization is map-order stable and preserves large BigNumber decimals", async () => {
  const fixture = await startStrictRavioliStudioFixture({ exposeRecoveryInternals: true });
  try {
    const result = await fixture.studio.page.evaluate(`(async () => {
      const api = window.__ravioliRecoveryTest;
      if (!api) throw new Error("recovery canonicalization test hook was not installed");
      const first = new window.TZ.MichelsonMap();
      first.set("zeta", { amount: 2, bytes: "bb" });
      first.set("alpha", { amount: 1, bytes: "aa" });
      const second = new window.TZ.MichelsonMap();
      second.set("alpha", { bytes: "aa", amount: 1 });
      second.set("zeta", { bytes: "bb", amount: 2 });
      const canonicalFirst = api.boundedRecoveryCanonical(first, "first map");
      const canonicalSecond = api.boundedRecoveryCanonical(second, "second map");

      class ExactBigNumber {
        static isBigNumber(value) { return value instanceof ExactBigNumber; }
        constructor(decimal) { this.decimal = decimal; }
        isFinite() { return true; }
        isInteger() { return true; }
        toFixed() { return this.decimal; }
      }
      const decimal = "900719925474099312345678901234567890";
      const bigNumber = api.boundedRecoveryCanonical(new ExactBigNumber(decimal), "large counter");
      return {
        canonicalFirst,
        canonicalSecond,
        firstHash: await api.sha256Json(canonicalFirst, "first map"),
        secondHash: await api.sha256Json(canonicalSecond, "second map"),
        decimal,
        bigNumber,
      };
    })()`);
    assert.deepEqual(result.canonicalFirst, result.canonicalSecond);
    assert.deepEqual(result.canonicalFirst, {
      __pastaRecoveryType: "MichelsonMap",
      entries: [
        ["alpha", { amount: 1, bytes: "aa" }],
        ["zeta", { amount: 2, bytes: "bb" }],
      ],
    });
    assert.match(result.firstHash, /^[0-9a-f]{64}$/);
    assert.equal(result.firstHash, result.secondHash, "MichelsonMap insertion order must not alter the signer-intent digest");
    assert.deepEqual(result.bigNumber, {
      __pastaRecoveryType: "BigNumber",
      value: result.decimal,
    });
    assert.equal(Number(result.decimal).toString(), "9.007199254740993e+35", "fixture must exceed JavaScript's exact integer range");
    assertNoStrictFixtureSideEffects(fixture, "canonical recovery encoding");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli sealed reveal authenticates the exact canonical bytes used by deterministic pinning", async () => {
  const fixture = await startStrictRavioliStudioFixture({ exposeRecoveryInternals: true });
  try {
    const result = await fixture.studio.page.evaluate(`(async () => {
      const api = window.__ravioliRecoveryTest;
      if (!api) throw new Error("Ravioli cryptographic test hook was not installed");
      const kit = {
        warning: "private fixture",
        tokenId: 1,
        schema: "pasta-ravioli-open-kit@3",
        network: "shadownet",
        manifestUri: "ipfs://bafkreicanonicalaadfixture",
        mode: "blind_funded_pool",
        contract: "${ROUTER}",
      };
      const publicReveal = {
        openKit: kit,
        schema: "pasta-ravioli-public-reveal@1",
        tokenId: 1,
      };
      const salt = "ab".repeat(32);
      const envelope = await api.encryptPublicReveal(publicReveal, salt);
      const canonicalEnvelopeText = api.canonicalJsonText(envelope, "fixture envelope");
      const pinnedEnvelope = JSON.parse(canonicalEnvelopeText);
      const decrypted = await api.decryptPublicReveal(pinnedEnvelope, salt, kit);
      const originalHash = await api.sha256Json(envelope, "fixture envelope");
      const pinnedHash = await api.sha256Json(pinnedEnvelope, "pinned fixture envelope");
      const tampered = JSON.parse(canonicalEnvelopeText);
      const bytes = Uint8Array.from(atob(tampered.ciphertext), (character) => character.charCodeAt(0));
      bytes[0] ^= 1;
      tampered.ciphertext = btoa(String.fromCharCode(...bytes));
      let tamperError = "";
      try {
        await api.decryptPublicReveal(tampered, salt, kit);
      } catch (error) {
        tamperError = String(error?.message || error);
      }
      return {
        canonicalEnvelopeText,
        decryptedText: api.canonicalJsonText(decrypted, "decrypted fixture"),
        expectedText: api.canonicalJsonText(publicReveal, "expected fixture"),
        originalHash,
        pinnedHash,
        tamperError,
      };
    })()`);
    assert.equal(result.decryptedText, result.expectedText);
    assert.equal(result.originalHash, result.pinnedHash);
    assert.match(result.originalHash, /^[0-9a-f]{64}$/);
    assert.match(result.tamperError, /authentication failed/);
    assert.equal(
      result.canonicalEnvelopeText,
      JSON.stringify(JSON.parse(result.canonicalEnvelopeText)),
      "canonical envelope must retain its exact bytes after the pin transport parses it",
    );
    assertNoStrictFixtureSideEffects(fixture, "canonical sealed reveal");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli recovery canonicalization rejects poisoned graphs without traversing getters", async () => {
  const fixture = await startStrictRavioliStudioFixture({ exposeRecoveryInternals: true });
  try {
    const result = await fixture.studio.page.evaluate(`(() => {
      const api = window.__ravioliRecoveryTest;
      if (!api) throw new Error("recovery canonicalization test hook was not installed");
      const rejected = (value, label) => {
        try {
          api.boundedRecoveryCanonical(value, label);
          return "accepted";
        } catch (error) {
          return String(error && error.message || error);
        }
      };

      let customGetterReads = 0;
      class PoisonedBigMapLike {
        get provider() {
          customGetterReads += 1;
          throw new Error("provider getter must not run");
        }
        get schema() {
          customGetterReads += 1;
          throw new Error("schema getter must not run");
        }
        get(_key) { return undefined; }
      }
      const customError = rejected(new PoisonedBigMapLike(), "custom big-map");

      let ownAccessorReads = 0;
      const accessor = {};
      Object.defineProperty(accessor, "secret", {
        enumerable: true,
        get() {
          ownAccessorReads += 1;
          throw new Error("accessor must not run");
        },
      });
      const accessorError = rejected(accessor, "accessor graph");

      const cycle = {};
      cycle.self = cycle;
      const cycleError = rejected(cycle, "cyclic graph");
      const oversizeError = rejected("x".repeat(1_048_577), "oversize graph");
      return {
        accessorError,
        customError,
        customGetterReads,
        cycleError,
        oversizeError,
        ownAccessorReads,
      };
    })()`);
    assert.match(result.customError, /custom big-map contains an unsupported object/);
    assert.equal(result.customGetterReads, 0, "custom/BigMap-like getters must never be traversed");
    assert.match(result.accessorError, /accessor graph\.secret is an accessor/);
    assert.equal(result.ownAccessorReads, 0, "own accessors must be rejected from descriptors without invoking them");
    assert.match(result.cycleError, /cyclic graph\.self contains a cycle/);
    assert.match(result.oversizeError, /oversize graph exceeds the recovery journal byte limit/);
    assertNoStrictFixtureSideEffects(fixture, "rejected recovery graph");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli downloads a private recovery journal before any open kit exists", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    const record = recoveryRecord({
      draftId: "private-pre-kit-download",
      history: [
        { stage: "DRAFT_SAVED_BEFORE_SIDE_EFFECT", status: "IN_PROGRESS", at: "2026-07-22T00:00:00.000Z" },
        {
          stage: "PIN_PACK_MANIFEST:CONFIRMED",
          status: "IN_PROGRESS",
          at: "2026-07-22T00:00:01.000Z",
          details: { uri: "ipfs://orphaned-private-fixture", nonce: "ab".repeat(32) },
        },
      ],
    });
    await installRecoveryRecord(fixture.studio.page, record);
    assert.equal(record.kit, null);
    const downloadPromise = fixture.studio.page.waitForEvent("download");
    await fixture.studio.page.click("#btnDownloadRecovery");
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "ravioli-private-recovery-private-pre-kit-download.json");
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const downloaded = JSON.parse(await readFile(downloadPath, "utf8"));
    assert.deepEqual(downloaded, record, "the private pre-kit journal must survive download byte-for-byte as JSON data");
    assert.equal("_storageKey" in downloaded, false, "the internal localStorage key must not enter the private journal");
    assert.match(
      (await fixture.studio.page.locator("#publishRecoverySummary").textContent()) || "",
      /Private recovery journal download started/,
    );
    assertNoStrictFixtureSideEffects(fixture, "private recovery download");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli restores the recovery panel with exact signer and operation evidence after reload", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    const kit = strictOpenKit();
    const record = recoveryRecord({
      draftId: "panel-reload-operation",
      kit,
      workflow: "open",
      expectedTerminalStage: "OPEN_PACK",
      history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "SUBMITTED", includeOpenPreflight: true }),
    });
    const key = await installRecoveryRecord(fixture.studio.page, record);
    await fixture.studio.page.reload({ waitUntil: "networkidle" });
    await fixture.studio.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(fixture.studio.page, fixture.server, "UI-MOCK");
    await fixture.studio.page.locator("#publishRecoveryPanel").waitFor({ state: "visible" });
    const details = (await fixture.studio.page.locator("#publishRecoveryDetails").textContent()) || "";
    assert.match(details, /Workflow: open/);
    assert.match(details, /Last checkpoint: OPEN_PACK:SUBMITTED/);
    assert.match(details, new RegExp(`Signer: ${CREATOR}`));
    assert.match(details, /Expected counter: 42/);
    assert.match(details, new RegExp(`Target: ${ROUTER}`));
    assert.match(details, /Entrypoint: open_pack/);
    assert.match(details, new RegExp(`Operation: ${RAVIOLI_RECOVERY_OPERATION}`));
    const explorer = fixture.studio.page.locator("#publishRecoveryExplorer");
    assert.equal(await explorer.isVisible(), true);
    assert.equal(await explorer.getAttribute("href"), `https://shadownet.tzkt.io/${RAVIOLI_RECOVERY_OPERATION}`);
    assert.equal(await fixture.studio.page.locator("#btnDiscardRecovery").isHidden(), true);
    assert.deepEqual(await storedRecovery(fixture.studio.page, key), record, "rendering after reload must not mutate the recovery evidence");
    assertNoStrictFixtureSideEffects(fixture, "reloaded recovery panel");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli requires inline two-click confirmation to discard only a no-chain draft and then unblocks writes", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    await connectStrictRavioliStudioFixture(fixture);
    const record = recoveryRecord({
      draftId: "discard-no-chain",
      history: [{ stage: "DRAFT_SAVED_BEFORE_SIDE_EFFECT", status: "IN_PROGRESS", at: "2026-07-22T00:00:00.000Z" }],
    });
    const key = await installRecoveryRecord(fixture.studio.page, record);
    assert.equal(await fixture.studio.page.locator("#btnDiscardRecovery").isVisible(), true);

    await fixture.studio.page.click("#btnDiscardRecovery");
    assert.match(
      (await fixture.studio.page.locator("#publishRecoverySummary").textContent()) || "",
      /Confirm discard: any IPFS pins remain public/i,
    );
    assert.equal(
      await fixture.studio.page.locator("#btnDiscardRecovery").textContent(),
      "Confirm discard of no-chain draft",
    );
    assert.equal(
      await fixture.studio.page.locator("#btnDiscardRecovery").getAttribute("data-confirming"),
      "true",
    );
    assert.deepEqual(await storedRecovery(fixture.studio.page, key), record, "the first inline acknowledgement must preserve the unresolved journal");
    assert.equal(await fixture.studio.page.locator("#publishRecoveryPanel").isVisible(), true);

    await fixture.studio.page.click("#btnDiscardRecovery");
    await fixture.studio.page.locator("#publishRecoveryPanel").waitFor({ state: "hidden" });
    const completed = await storedRecovery(fixture.studio.page, key);
    assert.equal(completed.status, "COMPLETE");
    assert.equal(completed.history.at(-1)?.stage, "RECOVERY_ABANDONED_NO_CHAIN_INTENT");
    assert.equal(completed.history.at(-1)?.details?.acknowledgedOrphanedPinsAndRevealRisk, true);

    await fixture.studio.page.locator("#log").evaluate((node) => { node.textContent = ""; });
    await fixture.studio.page.click("#btnPublish");
    await waitFor(fixture.studio.page, "#log", "the pack needs a name");
    assert.doesNotMatch((await fixture.studio.page.locator("#log").textContent()) || "", /must be reconciled before another write/);
    assertNoStrictFixtureSideEffects(fixture, "safely discarded no-chain draft");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli never permits discard once any signer PREPARED intent exists", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    const kit = strictOpenKit();
    const record = recoveryRecord({
      draftId: "prepared-cannot-discard",
      kit,
      workflow: "open",
      expectedTerminalStage: "OPEN_PACK",
      history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "PREPARED", includeOpenPreflight: true }),
    });
    const key = await installRecoveryRecord(fixture.studio.page, record);
    assert.equal(await fixture.studio.page.locator("#btnDiscardRecovery").isHidden(), true);
    await fixture.studio.page.locator("#btnDiscardRecovery").evaluate((button: HTMLButtonElement) => button.click());
    assert.deepEqual(await storedRecovery(fixture.studio.page, key), record, "programmatic activation must not bypass signer-intent protection");
    assert.equal(await fixture.studio.page.locator("#publishRecoveryPanel").isVisible(), true);
    assertNoStrictFixtureSideEffects(fixture, "signer-prepared discard attempt");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli read-only recovery closes only exact canonical confirmation with matching chain state", async () => {
  const kit = strictOpenKit();
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({ mirror, kit, exactCommitment: true, holder: CREATOR, registerKit: true });
  const fixture = await startStrictRavioliStudioFixture({ mirror, exposeRecoveryInternals: true });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    const scenarios = [
      {
        label: "submitted",
        record: recoveryRecord({
          draftId: "check-submitted",
          kit,
          workflow: "open",
          expectedTerminalStage: "OPEN_PACK",
          history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "SUBMITTED", includeOpenPreflight: true }),
        }),
        expected: "not durably recorded as confirmed",
      },
      {
        label: "legacy",
        record: recoveryRecord({
          draftId: "check-legacy",
          kit,
          encoding: null,
          workflow: "open",
          expectedTerminalStage: "OPEN_PACK",
          history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "CONFIRMED", includeOpenPreflight: true }),
        }),
        expected: "lossy payload encoding",
      },
      {
        label: "partial",
        record: recoveryRecord({
          draftId: "check-partial",
          kit,
          workflow: "publish",
          expectedTerminalStage: "FINALIZE_LE_PACK",
          history: recoveryHistoryForSignerStage({ kit, stage: "COMMIT_RECIPE", terminal: "CONFIRMED" }),
        }),
        expected: "not durably recorded as confirmed",
      },
      {
        label: "postcondition mismatch",
        record: recoveryRecord({
          draftId: "check-postcondition-mismatch",
          kit,
          workflow: "open",
          expectedTerminalStage: "OPEN_PACK",
          history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "CONFIRMED", includeOpenPreflight: true }),
        }),
        expected: "not reflected in the router's current opened counter",
      },
    ];
    for (const scenario of scenarios) {
      const routerReadsBefore = fixture.chain.routerStorageReads;
      const key = await installRecoveryRecord(fixture.studio.page, scenario.record);
      if (scenario.label === "postcondition mismatch") {
        const confirmationDiagnostic = await fixture.studio.page.evaluate(async (record) => {
          const history = Array.isArray(record.history) ? record.history : [];
          const confirmedEntry = history.find((entry: any) => entry.stage === "OPEN_PACK:CONFIRMED");
          const preparedEntry = history.find((entry: any) => entry.stage === "OPEN_PACK:PREPARED");
          return {
            confirmed: await (window as any).__ravioliRecoveryTest.recoveryConfirmedIntent(record, "OPEN_PACK"),
            confirmedEntry,
            confirmedHashValid: /^[0-9a-f]{64}$/.test(String(confirmedEntry?.details?.intentSha256 || "")),
            operationHashLength: String(confirmedEntry?.operationHash || "").length,
            operationHashValid: /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(String(confirmedEntry?.operationHash || "")),
            preparedAction: preparedEntry?.details?.intent?.action,
            preparedHash: preparedEntry?.details?.intentSha256,
            hashesMatch: preparedEntry?.details?.intentSha256 === confirmedEntry?.details?.intentSha256,
            stages: history.map((entry: any) => entry.stage),
          };
        }, scenario.record);
        assert.equal(
          confirmationDiagnostic.confirmed?.operationHash,
          RAVIOLI_RECOVERY_OPERATION,
          `exact terminal confirmation must be recognized before checking chain state: ${JSON.stringify(confirmationDiagnostic)}`,
        );
      }
      const sentinel = `checking ${scenario.label}`;
      await fixture.studio.page.locator("#publishRecoverySummary").evaluate((node, value) => { node.textContent = value; }, sentinel);
      await fixture.studio.page.click("#btnCheckRecovery");
      await fixture.studio.page.waitForFunction(
        (value) => document.getElementById("publishRecoverySummary")?.textContent !== value,
        sentinel,
      );
      await fixture.studio.page.waitForFunction(() => !(document.getElementById("btnCheckRecovery") as HTMLButtonElement).disabled);
      assert.match(
        (await fixture.studio.page.locator("#publishRecoverySummary").textContent()) || "",
        new RegExp(scenario.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `${scenario.label} must explain why automatic recovery remains blocked`,
      );
      assert.equal((await storedRecovery(fixture.studio.page, key)).status, "IN_PROGRESS", `${scenario.label} must remain blocked`);
      assert.equal(await fixture.studio.page.locator("#publishRecoveryPanel").isVisible(), true, `${scenario.label} panel must remain visible`);
      assert.equal(
        fixture.chain.routerStorageReads - routerReadsBefore,
        scenario.label === "postcondition mismatch" ? 1 : 0,
        `${scenario.label} must ${scenario.label === "postcondition mismatch" ? "perform exactly one" : "not perform a"} chain-state read`,
      );
      assertNoStrictFixtureSideEffects(fixture, `${scenario.label} read-only recovery`);
    }

    mirror.opened.set(0, 1);
    const confirmedRecord = recoveryRecord({
      draftId: "check-confirmed-current",
      kit,
      workflow: "open",
      expectedTerminalStage: "OPEN_PACK",
      history: recoveryHistoryForSignerStage({ kit, stage: "OPEN_PACK", terminal: "CONFIRMED", includeOpenPreflight: true }),
    });
    const confirmedKey = await installRecoveryRecord(fixture.studio.page, confirmedRecord);
    const confirmedReadsBefore = fixture.chain.routerStorageReads;
    await fixture.studio.page.click("#btnCheckRecovery");
    await fixture.studio.page.locator("#publishRecoveryPanel").waitFor({ state: "hidden" });
    const completed = await storedRecovery(fixture.studio.page, confirmedKey);
    assert.equal(completed.status, "COMPLETE");
    assert.equal(completed.history.at(-1)?.stage, "RECOVERY_CHAIN_STATE_VERIFIED_COMPLETE");
    assert.equal(completed.history.at(-1)?.operationHash, RAVIOLI_RECOVERY_OPERATION);
    assert.equal(completed.history.at(-1)?.details?.expectedTerminalStage, "OPEN_PACK");
    assert.match(
      (await fixture.studio.page.locator("#publishRecoveryInfo").textContent()) || "",
      /Recovery checkpoint complete/,
    );
    assert.equal(
      fixture.chain.routerStorageReads - confirmedReadsBefore,
      1,
      "an exact terminal confirmation must perform exactly one current router-state read",
    );
    assertNoStrictFixtureSideEffects(fixture, "successful read-only recovery reconciliation");
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio preserves an unfinished recovery across reload and blocks every retry", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    const recoveryKey = "pasta.ravioli.publish-recovery-draft.v1:shadownet:fixture:unfinished";
    const recovery = {
      schema: "pasta-ravioli-publish-recovery@1",
      status: "IN_PROGRESS",
      draftId: "unfinished-reload-fixture",
      network: "shadownet",
      account: CREATOR,
      contract: null,
      tokenId: null,
      kit: null,
      product: { name: "Interrupted pack", mode: "deterministic_vault", editions: 1, target: "new_collection" },
      history: [{ stage: "ORIGINATE_RAVIOLI_ROUTER:PREPARED", status: "IN_PROGRESS", at: "2026-07-22T00:00:00.000Z" }],
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:01.000Z",
    };
    await fixture.studio.page.evaluate(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("pasta.ravioli.publish-recovery-index.v1", JSON.stringify([key]));
    }, { key: recoveryKey, value: recovery });
    await fixture.studio.page.reload({ waitUntil: "networkidle" });
    await fixture.studio.page.waitForFunction(() => Boolean((window as any).MD && (window as any).TZ?.MichelsonMap));
    await installPastaUiLiveBrowserProxy(fixture.studio.page, fixture.server, "UI-MOCK");
    assert.match(
      (await fixture.studio.page.locator("#publishRecoveryInfo").textContent()) || "",
      /Unfinished Ravioli recovery.*ORIGINATE_RAVIOLI_ROUTER:PREPARED/,
    );
    await fixture.studio.page.fill("#collName", "Blocked recovery fixture");
    await fixture.studio.page.fill("#collSymbol", "BLOCK");
    await configurePack(fixture.studio.page, 0, "");
    await connectStrictRavioliStudioFixture(fixture);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await fixture.studio.page.locator("#log").evaluate((node) => { node.textContent = ""; });
      await fixture.studio.page.click("#btnPublish");
      await waitFor(fixture.studio.page, "#log", "must be reconciled before another write");
      assertNoStrictFixtureSideEffects(fixture, `unfinished recovery retry ${attempt + 1}`);
    }
    assert.deepEqual(
      await fixture.studio.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), recoveryKey),
      recovery,
      "blocked retries must not mutate the unresolved recovery record",
    );
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio keeps COMPLETE terminal when local events and post-confirmation refresh fail", async () => {
  const kit = strictOpenKit();
  const mirror = new RavioliUiStateMirror();
  seedStrictOpenKitPack({
    mirror,
    kit,
    exactCommitment: true,
    holder: COLLECTOR_ONE,
    registerKit: true,
  });
  const chain = new FakeRavioliChain({ failRouterStorageAfterReads: 3 });
  const fixture = await startStrictRavioliStudioFixture({
    chain,
    mirror,
    signer: COLLECTOR_ONE,
    callRole: "collector",
  });
  try {
    await connectStrictRavioliStudioFixture(fixture);
    await fixture.studio.page.fill("#opKt", ROUTER);
    await fixture.studio.page.fill("#opTokenId", "0");
    await fixture.studio.page.fill("#openKit", JSON.stringify(kit));
    await fixture.studio.page.evaluate(() => {
      (window as any).MD.logEvent = () => { throw new Error("simulated local event failure"); };
    });
    await fixture.studio.page.click("#btnRedeem");
    await waitFor(fixture.studio.page, "#log", "opened ✓").catch(async (error) => {
      throw new Error(
        `Ravioli COMPLETE-terminal fixture returned ${JSON.stringify((await fixture.studio.page.locator("#log").textContent()) || "")}`,
        { cause: error },
      );
    });
    await waitFor(fixture.studio.page, "#log", "local event bookkeeping needs attention");
    await fixture.studio.page.waitForFunction(() => !(document.getElementById("btnRedeem") as HTMLButtonElement).disabled);
    assert.equal(chain.calls.length, 1);
    assert.equal(chain.calls[0].entrypoint, "open_pack");
    assert.equal(countRavioliChainWriteReceipts(fixture.session.getReceipts()), 1);
    assert.equal(chain.routerStorageReads, 4, "the fourth router read must be the deliberately failed post-confirmation refresh");
    assert.equal(fixture.pins.length, 0, "an escrow-only open needs no generative pins");
    const records = await fixture.studio.page.evaluate(() => {
      const keys = JSON.parse(localStorage.getItem("pasta.ravioli.publish-recovery-index.v1") || "[]");
      return keys.map((key: string) => JSON.parse(localStorage.getItem(key) || "null")).filter(Boolean);
    });
    assert.equal(records.length, 2, "the durable draft and token-address alias must both remain indexed");
    for (const record of records) {
      assert.equal(record.status, "COMPLETE");
      assert.equal(record.history.at(-1)?.stage, "OPEN_COMPLETE");
      assert.equal(record.history.some((entry: any) => /FAILED/.test(entry.stage)), false);
    }
    assert.match(
      (await fixture.studio.page.locator("#publishRecoveryInfo").textContent()) || "",
      /Recovery checkpoint complete/,
    );
    assert.deepEqual(
      fixture.studio.monitor.list().filter((event) => (
        event.kind !== "console.error"
        || !/Failed to load resource:.*500 \(Internal Server Error\)/.test(event.message)
      )),
      [],
      "the deliberately failed refresh may emit a browser resource diagnostic, but no unrelated diagnostic is allowed",
    );
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli CREATE_PACK recovery canonicalizes every token-info map entry into its intent hash", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    await fixture.studio.page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
    await fixture.studio.page.fill("#collSymbol", "RCAN");
    await configurePack(fixture.studio.page, 0, "");
    await connectStrictRavioliStudioFixture(fixture);
    await clickRavioliPublishAndWaitForDownload(fixture.studio.page, 30_000);
    await waitFor(fixture.studio.page, "#log", "pack 0 is fully reserved and ready");
    const records = await fixture.studio.page.evaluate(() => {
      const keys = JSON.parse(localStorage.getItem("pasta.ravioli.publish-recovery-index.v1") || "[]");
      return keys.map((key: string) => JSON.parse(localStorage.getItem(key) || "null")).filter(Boolean);
    });
    const prepared = records[0]?.history?.find((entry: any) => entry.stage === "CREATE_PACK:PREPARED");
    assert.ok(prepared, "CREATE_PACK must record its signer intent before submission");
    const intent = prepared.details?.intent;
    const tokenInfo = intent?.payload?.token_info;
    assert.deepEqual(Object.keys(tokenInfo || {}).sort(), ["__pastaRecoveryType", "entries"]);
    assert.equal(tokenInfo.__pastaRecoveryType, "MichelsonMap");
    assert.ok(Array.isArray(tokenInfo.entries));
    assert.deepEqual(
      tokenInfo.entries.map((entry: any[]) => entry[0]),
      ["", "decimals", "name", "pasta:editionClass", "pasta:fulfillment", "pasta:packMode", "symbol"],
      "canonical recovery must retain and deterministically order every token_info key",
    );
    const values = Object.fromEntries(tokenInfo.entries);
    const decode = (value: unknown) => Buffer.from(String(value), "hex").toString("utf8");
    assert.match(decode(values[""]), /^ipfs:\/\//);
    assert.equal(decode(values.decimals), "0");
    assert.equal(decode(values.name), "Fixture deterministic_vault");
    assert.equal(decode(values["pasta:editionClass"]), "fixed-supply");
    assert.equal(decode(values["pasta:fulfillment"]), "atomic");
    assert.equal(decode(values["pasta:packMode"]), "deterministic_vault");
    assert.equal(decode(values.symbol), "RCAN");
    const recordedHash = String(prepared.details?.intentSha256 || "");
    assert.match(recordedHash, /^[0-9a-f]{64}$/);
    assert.equal(
      recordedHash,
      createHash("sha256").update(JSON.stringify(intent)).digest("hex"),
      "intentSha256 must cover the exact canonical intent persisted in recovery",
    );
    const changedIntent = structuredClone(intent);
    const changedSymbol = changedIntent.payload.token_info.entries.find((entry: any[]) => entry[0] === "symbol");
    assert.ok(changedSymbol);
    changedSymbol[1] = Buffer.from("RCAN-CHANGED").toString("hex");
    assert.notEqual(
      createHash("sha256").update(JSON.stringify(changedIntent)).digest("hex"),
      recordedHash,
      "changing one MichelsonMap value must change the signer-intent digest",
    );
    assert.ok(countRavioliChainWriteReceipts(fixture.session.getReceipts()) > 0);
    assert.deepEqual(fixture.studio.monitor.list(), []);
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("real Ravioli Studio blocks an expired capped-and-timed child before pinning or writing", async () => {
  const chain = new FakeRavioliChain({ limitedChildEnd: "2026-07-20T00:00:00.000Z" });
  const mirror = new RavioliUiStateMirror();
  const pins: any[] = [];
  const code = await artifacts();
  installBundledScriptCodes(chain, code);
  const dependencies: any = {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      limitedAllocationTokenId: 3,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2", "ipfs://gnocchi3"],
      limitedEdition: { receipt: { token: { end: LIMITED_CHILD_END, recommendedRavioliSaleEnd: LIMITED_WRAPPER_END } } },
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  };
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies,
    mirror,
    pins,
    codeHashes: {
      deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
      blindController: hashJsonForBridge(code.blindController),
      router: hashJsonForBridge(code.router),
      gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(code.rotiniAdapter),
    },
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(CREATOR),
    signerAddress: CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI, ROTINI]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    assertOperationApplied: (assertion) => chain.assertOperationApplied(assertion, CREATOR),
    pinJson: async ({ fileName }) => fakeProof(fileName),
    pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    validateOrigination: (input) => policy.validateOrigination(input),
    validateCall: (input) => policy.validateCall(input),
    projectStorage: (storage) => projectStudioPolicyStorage(storage, mirror),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  authorizeFixtureGnocchiBalanceView(session);
  session.authorizeAfterFundingPreflight({
    balanceMutez: 50_000_000,
    requiredBalanceMutez: 10_000_000,
    estimatedOriginationMutez: 5_000_000,
    operationReserveMutez: 5_000_000,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: CREATOR }),
  });
  const studio = await openStudio(server);
  try {
    await studio.page.selectOption("#network", "shadownet");
    await studio.page.selectOption("#pinProvider", "node");
    await studio.page.fill("#pinNode", "http://127.0.0.1:5001");
    await studio.page.fill("#collName", "Rejected expired LE wrapper");
    await studio.page.fill("#collSymbol", "NOLE");
    await studio.page.fill("#bnName", "Expired LE child");
    await studio.page.selectOption("#bnMode", "2");
    await studio.page.check("#bnForSale");
    await studio.page.fill("#bnSaleEnd", "2099-07-19T23:00");
    await studio.page.locator("#adapterSetup > summary").click();
    await studio.page.fill("#gTargetKt", GNOCCHI);
    await studio.page.fill("#gTokenId", "2");
    if (!(await studio.page.locator("#recipeJson").isVisible())) {
      await studio.page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
    }
    await studio.page.fill("#recipeJson", JSON.stringify([[
      { kind: "allocated", amount: 1, name: "Expired LE allocation" },
    ]]));
    await studio.page.click("#btnConnect");
    await waitFor(studio.page, "#log", `connected ${CREATOR} on shadownet`);
    await studio.page.click("#btnPublish");
    await waitFor(studio.page, "#log", "Allocated Pasta child 2 mint window has expired");
    assert.equal(pins.length, 0, "expired LE rejection must precede every durable pin");
    assert.equal(chain.calls.length, 0, "expired LE rejection must precede every contract call");
    assert.equal(mirror.routerAddress, "", "expired LE rejection must precede router origination");
    assert.deepEqual(studio.monitor.list(), []);
  } finally {
    studio.monitor.dispose();
    await studio.browser.close();
    await server.close();
  }
});

test("real Ravioli Studio accepts an expired already-minted timed child as funded escrow inventory", async () => {
  const chain = new FakeRavioliChain({ limitedChildEnd: "2026-07-20T00:00:00.000Z" });
  const mirror = new RavioliUiStateMirror();
  const pins: any[] = [];
  const code = await artifacts();
  installBundledScriptCodes(chain, code);
  const gnocchiStorage = await (await chain.toolkit(CREATOR).contract.at(GNOCCHI)).storage();
  assert.equal(await gnocchiStorage.total_minted.get("0"), 1, "escrow fixture must represent an already-minted child token");
  const dependencies: any = {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      limitedAllocationTokenId: 3,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2", "ipfs://gnocchi3"],
      limitedEdition: { receipt: { token: { end: LIMITED_CHILD_END, recommendedRavioliSaleEnd: LIMITED_WRAPPER_END } } },
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  };
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies,
    mirror,
    pins,
    codeHashes: {
      deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
      blindController: hashJsonForBridge(code.blindController),
      router: hashJsonForBridge(code.router),
      gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(code.rotiniAdapter),
    },
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos: chain.toolkit(CREATOR),
    signerAddress: CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI, ROTINI]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    assertOperationApplied: (assertion) => chain.assertOperationApplied(assertion, CREATOR),
    pinJson: async ({ fileName }) => fakeProof(fileName),
    pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    validateOrigination: (input) => policy.validateOrigination(input),
    validateCall: (input) => policy.validateCall(input),
    projectStorage: (storage) => projectStudioPolicyStorage(storage, mirror),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  authorizeFixtureGnocchiBalanceView(session);
  session.authorizeAfterFundingPreflight({
    balanceMutez: 50_000_000,
    requiredBalanceMutez: 10_000_000,
    estimatedOriginationMutez: 5_000_000,
    operationReserveMutez: 5_000_000,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: CREATOR }),
  });
  const studio = await openStudio(server);
  try {
    await studio.page.selectOption("#network", "shadownet");
    await studio.page.selectOption("#pinProvider", "node");
    await studio.page.fill("#pinNode", "http://127.0.0.1:5001");
    await studio.page.fill("#collName", "Ravioli UI-LIVE Atomic Packs");
    await studio.page.fill("#collSymbol", "RVUI");
    await configurePack(studio.page, 0, "");
    await studio.page.click("#btnConnect");
    await waitFor(studio.page, "#log", `connected ${CREATOR} on shadownet`);
    await clickRavioliPublishAndWaitForDownload(studio.page, 30_000);
    await waitFor(studio.page, "#log", "pack 0 is fully reserved and ready");
    const log = (await studio.page.locator("#log").textContent()) || "";
    assert.doesNotMatch(log, /mint window has expired/);
    assert.ok(pins.length > 0, "valid existing escrow must advance through durable publishing");
    assert.ok(countRavioliChainWriteReceipts(session.getReceipts()) > 0, "valid existing escrow must reach chain writes");
    assert.ok(chain.calls.some((call) => call.entrypoint === "update_operators"), "existing child must be escrow-authorized");
    assert.equal(mirror.routerAddress, ROUTER);
    assert.deepEqual(studio.monitor.list(), []);
  } finally {
    studio.monitor.dispose();
    await studio.browser.close();
    await server.close();
  }
});

async function expectRavioliStudioPrewriteRejection(input: {
  chain: FakeRavioliChain;
  expected: string;
  recipe: any;
  mode?: number;
  editions?: number;
  saleCount?: number;
  wrapperSaleEnabled?: boolean;
  wrapperSaleEnd?: string | null;
  revealDeadline?: string | null;
  openDeadline?: string | null;
  existingRouter?: boolean;
  autoAdapters?: boolean;
  allocationTokenId?: number;
  routerCodeMatches?: boolean;
  adapterCodeMismatch?: "gnocchi" | "rotini";
  prefilledAutoAdapter?: boolean;
}): Promise<void> {
  const mirror = new RavioliUiStateMirror();
  const pins: any[] = [];
  const code = await artifacts();
  const mismatchedScript = (script: unknown[]) => {
    const changed = structuredClone(script) as any[];
    const codeSection = changed.find((section) => section?.prim === "code");
    assert.ok(Array.isArray(codeSection?.args?.[0]), "fixture needs a complete Michelson code section");
    codeSection.args[0].push({ prim: "DROP" });
    return changed;
  };
  installBundledScriptCodes(input.chain, code);
  input.chain.setRouterScriptCode(input.routerCodeMatches === false
    ? mismatchedScript(code.router)
    : code.router);
  input.chain.setContractScriptCode(
    GNOCCHI_ADAPTER,
    input.adapterCodeMismatch === "gnocchi"
      ? mismatchedScript(code.gnocchiAdapter)
      : code.gnocchiAdapter,
  );
  input.chain.setContractScriptCode(
    ROTINI_ADAPTER,
    input.adapterCodeMismatch === "rotini"
      ? mismatchedScript(code.rotiniAdapter)
      : code.rotiniAdapter,
  );
  const dependencies: any = {
    gnocchi: {
      address: GNOCCHI,
      allocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      limitedAllocationTokenId: 3,
      tokenMetadataUris: ["ipfs://gnocchi0", "ipfs://gnocchi1", "ipfs://gnocchi2", "ipfs://gnocchi3"],
      limitedEdition: { receipt: { token: { end: LIMITED_CHILD_END, recommendedRavioliSaleEnd: LIMITED_WRAPPER_END } } },
    },
    rotini: { address: ROTINI, projectId: 3, nextTokenId: 5, generatedTokenIds: [5, 6] },
  };
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies,
    mirror,
    pins,
    codeHashes: {
      deploymentCertificate: "e907cc1114064568f78d37752272fd17f867cb60a88bae269d76d053b486933c",
      blindController: hashJsonForBridge(code.blindController),
      router: hashJsonForBridge(code.router),
      gnocchiAdapter: hashJsonForBridge(code.gnocchiAdapter),
      rotiniAdapter: hashJsonForBridge(code.rotiniAdapter),
    },
  });
  const session = new TaquitoPastaUiLiveSession({
    tezos: input.chain.toolkit(CREATOR),
    signerAddress: CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([GNOCCHI, ROTINI, GNOCCHI_ADAPTER, ROTINI_ADAPTER, ROUTER]),
    allowedEntrypoints: RAVIOLI_UI_LIVE_ALLOWED_CREATOR_ENTRYPOINTS,
    assertExpectedChain: async () => SHADOWNET_CHAIN_ID,
    assertOperationApplied: (assertion) => input.chain.assertOperationApplied(assertion, CREATOR),
    pinJson: async ({ fileName }) => fakeProof(fileName),
    pinBlob: async ({ fileName, mimeType }) => fakeProof(fileName, mimeType),
    validateOrigination: (value) => policy.validateOrigination(value),
    validateCall: (value) => policy.validateCall(value),
    projectStorage: (storage) => projectStudioPolicyStorage(storage, mirror),
    onPin: ({ value, bytes, proof }) => { pins.push({ value, bytes, proof }); },
  });
  authorizeFixtureGnocchiBalanceView(session);
  session.authorizeAfterFundingPreflight({
    balanceMutez: 50_000_000,
    requiredBalanceMutez: 10_000_000,
    estimatedOriginationMutez: 5_000_000,
    operationReserveMutez: 5_000_000,
  });
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: createRavioliMirroredSessionHandler({ session, mirror, policy, signerAddress: CREATOR }),
  });
  const studio = await openStudio(server);
  try {
    await studio.page.selectOption("#network", "shadownet");
    await studio.page.selectOption("#pinProvider", "node");
    await studio.page.fill("#pinNode", "http://127.0.0.1:5001");
    await studio.page.fill("#collName", "Rejected Ravioli policy fixture");
    await studio.page.fill("#collSymbol", "NOLE");
    await studio.page.fill("#bnName", "Rejected child policy");
    await studio.page.selectOption("#bnMode", String(input.mode ?? 0));
    const editions = input.editions ?? 1;
    await studio.page.fill("#bnEditions", String(editions));
    const saleCount = String(input.saleCount ?? editions);
    if (await studio.page.locator("#bnSaleCount").isDisabled()) {
      if (saleCount === String(editions)) {
        assert.equal(await studio.page.inputValue("#bnSaleCount"), saleCount);
      } else {
        await studio.page.locator("#bnSaleCount").evaluate(
          (node, value) => {
            (node as HTMLInputElement).value = String(value);
          },
          saleCount,
        );
      }
    } else {
      await studio.page.fill("#bnSaleCount", saleCount);
    }
    const saleEnabled = input.wrapperSaleEnabled !== false;
    if (await studio.page.locator("#bnForSale").isDisabled()) {
      await studio.page.locator("#bnForSale").evaluate(
        (node, checked) => {
          (node as HTMLInputElement).checked = Boolean(checked);
        },
        saleEnabled,
      );
    } else if (saleEnabled) {
      await studio.page.check("#bnForSale");
    } else {
      await studio.page.uncheck("#bnForSale");
    }
    await studio.page.fill(
      "#bnSaleEnd",
      input.wrapperSaleEnd === undefined ? "2099-07-19T23:00" : (input.wrapperSaleEnd ?? ""),
    );
    if (input.revealDeadline !== undefined) {
      await studio.page.fill("#bnRevealDeadline", input.revealDeadline ?? "");
    }
    if (input.openDeadline !== undefined) {
      await studio.page.fill("#bnOpenDeadline", input.openDeadline ?? "");
    }
    if (input.autoAdapters !== false && ["allocated", "generative"].includes(input.recipe.kind)) {
      await studio.page.locator("#adapterSetup > summary").click();
    }
    if (input.autoAdapters !== false && input.recipe.kind === "allocated") {
      await studio.page.fill("#gTargetKt", GNOCCHI);
      await studio.page.fill("#gTokenId", String(input.allocationTokenId ?? RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID));
      if (input.prefilledAutoAdapter) {
        await studio.page.fill("#gAdapterKt", GNOCCHI_ADAPTER);
      }
    }
    if (input.autoAdapters !== false && input.recipe.kind === "generative") {
      await studio.page.fill("#rTargetKt", ROTINI);
      await studio.page.fill("#rProjectId", "3");
      if (input.prefilledAutoAdapter) {
        await studio.page.fill("#rAdapterKt", ROTINI_ADAPTER);
      }
    }
    if (!(await studio.page.locator("#recipeJson").isVisible())) {
      await studio.page.locator("#recipeJson").locator("xpath=ancestor::details").locator("summary").click();
    }
    await studio.page.fill(
      "#recipeJson",
      JSON.stringify(Array.from({ length: editions }, () => [structuredClone(input.recipe)])),
    );
    if (input.autoAdapters === false) {
      await studio.page.locator("#autoAdapters").evaluate((node) => {
        const checkbox = node as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    if (input.existingRouter) {
      await studio.page.check('input[name="target"][value="existing_contract"]');
      await studio.page.fill("#existingKt", ROUTER);
    }
    await studio.page.click("#btnConnect");
    await waitFor(studio.page, "#log", `connected ${CREATOR} on shadownet`);
    await studio.page.click("#btnPublish");
    try {
      await waitFor(studio.page, "#log", input.expected);
    } catch (error) {
      throw new Error(`expected Ravioli rejection ${JSON.stringify(input.expected)}; Studio log=${JSON.stringify(await studio.page.locator("#log").textContent())}`, { cause: error });
    }
    assert.equal(pins.length, 0, `${input.expected} must precede every durable pin`);
    assert.equal(input.chain.calls.length, 0, `${input.expected} must precede every contract call`);
    assert.equal(mirror.routerAddress, "", `${input.expected} must precede router origination`);
    assert.equal(countRavioliChainWriteReceipts(session.getReceipts()), 0, `${input.expected} may perform read-only identity checks but no chain writes`);
    assert.deepEqual(studio.monitor.list(), []);
  } finally {
    studio.monitor.dispose();
    await studio.browser.close();
    await server.close();
  }
}

test("real Ravioli Studio rejects incomplete LE wrapper sales before pinning or writing", async () => {
  const recipe = { kind: "allocated", amount: 1, name: "Limited allocation" };
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "LE child requires a direct Ravioli sale",
    recipe,
    mode: 2,
    allocationTokenId: 2,
    wrapperSaleEnabled: false,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "LE child requires a finite Ravioli sale end",
    recipe,
    mode: 2,
    allocationTokenId: 2,
    wrapperSaleEnd: null,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Blind Ravioli sale quantity must equal its complete finite wrapper supply",
    recipe,
    mode: 2,
    allocationTokenId: 2,
    editions: 2,
    saleCount: 1,
  });
});

test("real Ravioli Studio rejects cumulative funded-pool demand above creator inventory before pins or writes", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ gnocchiBalances: { 0: 2 } }),
    expected: "3 required across every recipe, 2 available",
    recipe: { kind: "escrow", fa2: GNOCCHI, tokenId: 0, amount: 1, name: "Cumulative escrow" },
    mode: 1,
    editions: 3,
    saleCount: 3,
    wrapperSaleEnd: "2099-08-01T00:00",
    revealDeadline: "2099-08-02T00:00",
    openDeadline: "2099-08-03T00:00",
  });
});

test("real Ravioli Studio fails closed on inactive or unlocked timed LE children", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ limitedChildActive: false }),
    expected: "Allocated Pasta child 2 is inactive",
    recipe: { kind: "allocated", amount: 1, name: "Inactive LE allocation" },
    mode: 2,
    allocationTokenId: 2,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ limitedChildLocked: false }),
    expected: "Allocated Pasta child 2 must have a locked edition policy",
    recipe: { kind: "allocated", amount: 1, name: "Unlocked LE allocation" },
    mode: 2,
    allocationTokenId: 2,
  });
});

test("real Ravioli Studio rejects a Rotini target without action-index seeds before pinning or writing", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ rotiniHasActionIndex: false }),
    expected: "Rotini target predates distinct Ravioli action-index seeds; deploy the current Rotini contract",
    recipe: { kind: "generative", amount: 1, name: "Legacy generator" },
    mode: 3,
  });
});

test("real Ravioli Studio rejects router and manual-adapter code mismatches before pinning", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Ravioli router code does not match the bundled production artifact. Originate a new router.",
    recipe: { kind: "escrow", fa2: GNOCCHI, tokenId: 1, amount: 1, name: "Forever OE" },
    existingRouter: true,
    routerCodeMatches: false,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Gnocchi adapter code does not match the bundled production artifact. Originate a new adapter.",
    recipe: { kind: "allocated", adapter: GNOCCHI_ADAPTER, resourceId: 0, amount: 1, name: "Look-alike allocation" },
    mode: 2,
    autoAdapters: false,
    adapterCodeMismatch: "gnocchi",
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Rotini adapter code does not match the bundled production artifact. Originate a new adapter.",
    recipe: { kind: "generative", adapter: ROTINI_ADAPTER, resourceId: 0, name: "Look-alike generator" },
    mode: 3,
    autoAdapters: false,
    adapterCodeMismatch: "rotini",
  });
});

test("real Ravioli Studio rejects prefilled auto-adapter code mismatches before pinning", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Gnocchi adapter code does not match the bundled production artifact. Originate a new adapter.",
    recipe: { kind: "allocated", amount: 1, name: "Look-alike auto allocation" },
    mode: 2,
    adapterCodeMismatch: "gnocchi",
    prefilledAutoAdapter: true,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Rotini adapter code does not match the bundled production artifact. Originate a new adapter.",
    recipe: { kind: "generative", name: "Look-alike auto generator" },
    mode: 3,
    adapterCodeMismatch: "rotini",
    prefilledAutoAdapter: true,
  });
});

test("real Ravioli Studio rejects legacy router schemas after exact code identity", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ routerHasChildExpiry: false }),
    expected: "This router predates Ravioli LE safety (%child_expiry). Originate a new router.",
    recipe: { kind: "escrow", fa2: GNOCCHI, tokenId: 1, amount: 1, name: "Forever OE" },
    existingRouter: true,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain({ routerHasWrapperSaleEnd: false }),
    expected: "This router predates atomic Ravioli LE issuance (%wrapper_sale_end). Originate a new router.",
    recipe: { kind: "escrow", fa2: GNOCCHI, tokenId: 1, amount: 1, name: "Forever OE" },
    existingRouter: true,
  });
});

test("real Ravioli Studio accepts exact manual-adapter code before resource validation", async () => {
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Gnocchi allocation resource 99 does not exist",
    recipe: { kind: "allocated", adapter: GNOCCHI_ADAPTER, resourceId: 99, amount: 1, name: "Missing allocation" },
    mode: 2,
    autoAdapters: false,
  });
  await expectRavioliStudioPrewriteRejection({
    chain: new FakeRavioliChain(),
    expected: "Rotini resource 99 does not exist",
    recipe: { kind: "generative", adapter: ROTINI_ADAPTER, resourceId: 99, name: "Missing resource" },
    mode: 3,
    autoAdapters: false,
  });
});

test("Ravioli consumes a one-use CH-EASE handoff into the real Studio", async () => {
  const handoffKey = "wtfos:pasta:chease-handoff:ravioli:browser-proof";
  const handoff = {
    schemaVersion: "wtfos.pasta.chease-package.v1",
    kind: "collection",
    targetApp: "ravioli",
    title: "CH-EASE Atomic Pack",
    description: "A staged package that Ravioli turns into recipe references.",
    symbol: "CRAV",
    relationship: {
      parent_contract: GNOCCHI,
      franchise_contract: ROTINI,
      collection_group: "ravioli-browser-proof",
    },
    items: [{
      tokenId: 7,
      name: "Enclosed artwork reference",
      artifactUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3cte5proofproofproofproofproof",
      mimeType: "image/png",
    }],
  };
  const server = await startPastaUiLiveLoopbackServer({
    staticRoot: STATIC_ROOT,
    handleAction: async () => { throw new Error("CH-EASE handoff must not invoke the signing bridge"); },
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: PASTA_PROOF_VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(({ key, payload }) => {
    sessionStorage.setItem(key, JSON.stringify(payload));
  }, { key: handoffKey, payload: handoff });
  const page = await context.newPage();
  const monitor = monitorPastaProofPage(page);
  try {
    const query = new URLSearchParams({ handoff: "chease-package", handoffKey });
    await page.goto(`${server.origin}/creation-tools/ravioli/index.html?${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#members .pp-token").length === 1);

    assert.equal(await page.inputValue("#bnName"), handoff.title);
    assert.equal(await page.inputValue("#bnDesc"), handoff.description);
    assert.equal(await page.inputValue("#collSymbol"), handoff.symbol);
    assert.equal(await page.inputValue("#relParent"), handoff.relationship.parent_contract);
    assert.equal(await page.inputValue("#relFranchise"), handoff.relationship.franchise_contract);
    assert.equal(await page.inputValue("#relGroup"), handoff.relationship.collection_group);
    assert.equal(await page.inputValue("#members .m-name"), handoff.items[0].name);
    assert.equal(await page.inputValue("#members .m-type"), "escrow");
    assert.equal(await page.inputValue("#members .m-kt"), "");
    assert.equal(await page.inputValue("#members .m-tid"), String(handoff.items[0].tokenId));
    assert.equal(await page.inputValue("#members .m-uri"), handoff.items[0].artifactUri);
    assert.equal(await page.inputValue("#members .m-mime"), handoff.items[0].mimeType);
    assert.match((await page.locator("#log").textContent()) || "", /imported 1 recipe reference\(s\) from CH-EASE handoff/);
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), handoffKey), null);
    assert.deepEqual(monitor.list(), []);
  } finally {
    monitor.dispose();
    await browser.close();
    await server.close();
  }
});

test("Ravioli accepts only the exact native-recovery inventory and fresh Rotini handoff", () => {
  const input: any = {
    handoff: {
      schema: "pastaprotocol-ravioli-native-recovery-handoff@1",
      gnocchi: {
        contract: GNOCCHI,
        creatorBalances: { "0": 2, "1": 2 },
        totalSupply: { "0": 8, "1": 5 },
        totalReserved: { "0": 0, "1": 0 },
      },
      rotini: {
        contract: ROTINI,
        completedProjectId: 0,
        completedProjectMinted: 3,
        completedProjectReserved: 0,
        freshProjectId: 3,
        freshProjectMaxSupply: 3,
        freshProjectMinted: 0,
        freshProjectReserved: 0,
        nextTokenId: 5,
        freshRavioliGeneratedTokenIds: [5, 6],
      },
      failedRouter: {
        contract: ROUTER,
        allWrapperSupplyBurned: true,
        allSalesInactive: true,
      },
    },
    gnocchiAddress: GNOCCHI,
    rotiniAddress: ROTINI,
    creatorBalances: { "0": 2, "1": 2 },
    totalSupply: { "0": 8, "1": 5 },
    totalReserved: { "0": 0, "1": 0 },
    completedProject: { active: true, minted: 3, reserved: 0 },
    freshProject: {
      active: true,
      output_mode: Buffer.from("png").toString("hex"),
      price: 0,
      max_supply: 3,
      minted: 0,
      reserved: 0,
    },
    nextProjectId: 4,
    nextTokenId: 5,
  };
  assert.deepEqual(validateRavioliNativeDependencyTransition(input), {
    projectId: 3,
    nextTokenId: 5,
    generatedTokenIds: [5, 6],
  });

  const reject = (mutate: (drift: any) => void, expected: RegExp) => {
    const drift = structuredClone(input);
    mutate(drift);
    assert.throws(() => validateRavioliNativeDependencyTransition(drift), expected);
  };
  reject((drift) => { drift.handoff.rotini.contract = ROUTER; }, /Rotini contract differs/);
  reject((drift) => { drift.creatorBalances["0"] = 1; }, /creator balances drift/);
  reject((drift) => { drift.totalSupply["0"] = 7; }, /total supply drift/);
  reject((drift) => { drift.totalReserved["0"] = 1; }, /reserved supply drift/);
  reject((drift) => { drift.completedProject.minted = 2; }, /completed Rotini project mint count drift/);
  reject((drift) => { drift.freshProject.max_supply = 2; }, /fresh Rotini project supply cap drift/);
  reject((drift) => { drift.nextTokenId = 6; }, /next token id differs/);
  reject((drift) => { drift.handoff.rotini.freshRavioliGeneratedTokenIds = [5, 7]; }, /next two Rotini token ids/);
});

test("Ravioli normalizes the live Taquito Rotini option shape before capacity arithmetic", () => {
  const capacityDependencies = {
    fresh: {
      rotini: {
        contractAddress: ROTINI,
        nextTokenId: 3,
        project0: {
          projectId: 0,
          maxSupply: 4,
          minted: 1,
        },
      },
    },
    liveCheck: {
      rotini: {
        contractAddress: ROTINI,
        nextProjectId: 3,
        nextTokenId: 3,
        project0: {
          maxSupply: 4,
          minted: 1,
        },
      },
    },
    rotini: {
      address: ROTINI,
      projectId: 0,
      nextTokenId: 3,
      generatedTokenIds: [3, 4, 5],
    },
  };
  const expected = buildRavioliRotiniCapacityExpectation(capacityDependencies, 0);
  assert.deepEqual(expected, {
    contractAddress: ROTINI,
    projectId: 0,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    nextProjectId: 3,
    nextTokenId: 3,
    generatedTokenCount: 3,
  });
  assert.notEqual(
    expected.nextProjectId,
    expected.projectId + 1,
    "a project identifier must not be reused as the collection's global project counter",
  );
  const storage = {
    next_project_id: new BigNumber(3),
    next_token_id: new BigNumber(3),
  };
  const expectedSnapshot = {
    contract: ROTINI,
    projectId: 0,
    active: true,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    nextProjectId: 3,
    nextTokenId: 3,
    remaining: 3,
    stillNeeded: 3,
  };
  for (const maxSupply of [
    { Some: new BigNumber(4) },
    "4",
    4,
    { prim: "Some", args: [{ int: "4" }] },
  ]) {
    assert.deepEqual(assertRavioliRotiniCapacitySnapshot({
      project: {
        active: true,
        max_supply: maxSupply,
        minted: new BigNumber(1),
        reserved: new BigNumber(0),
      },
      storage,
      expected,
    }), expectedSnapshot);
  }
  assert.equal(optionValue({ Some: new BigNumber(4) }, "Rotini max supply") instanceof BigNumber, true);
  assert.equal(requiredOptionSafeInteger({ some: new BigNumber(4) }, "Rotini max supply"), 4);
  assert.throws(
    () => requiredOptionSafeInteger(null, "Rotini max supply"),
    /must be Some\/non-null/,
  );
  assert.throws(
    () => requiredOptionSafeInteger({ None: null }, "Rotini max supply"),
    /must be Some\/non-null/,
  );
  assert.throws(
    () => requiredOptionSafeInteger({ Some: new BigNumber(4), drift: true }, "Rotini max supply"),
    /unexpected fields/,
  );
  assert.throws(
    () => requiredOptionSafeInteger({ Some: new BigNumber("9007199254740992") }, "Rotini max supply"),
    /must be a safe integer/,
  );
  assert.throws(
    () => buildRavioliRotiniCapacityExpectation({
      ...capacityDependencies,
      liveCheck: {
        rotini: {
          ...capacityDependencies.liveCheck.rotini,
          nextProjectId: 0,
        },
      },
    }, 0),
    /authenticated next project id/,
  );
  assert.throws(
    () => buildRavioliRotiniCapacityExpectation({
      ...capacityDependencies,
      rotini: {
        ...capacityDependencies.rotini,
        generatedTokenIds: [3, 5, 6],
      },
    }, 0),
    /generated token ids do not continue/,
  );
});

test("Ravioli final pre-write recovery recheck rejects mutable signer or dependency drift", () => {
  const base: any = {
    schema: "pastaprotocol-ravioli-native-recovery-live-verification@1",
    verifiedAt: "2026-07-22T12:00:00.000Z",
    receiptSha256: "ab".repeat(32),
    handoff: { schema: "pastaprotocol-ravioli-native-recovery-handoff@1" },
    operations: [{ hash: "op-proof", counter: 10 }],
    lanes: {
      primaryRpcUrl: "https://tezos-shadownet.octez.io/",
      fallbackRpcUrl: "https://tcinfra.net/rpc/tezos/shadownet",
      minimumRecoveryCounter: 10,
      primary: { counter: 10, balanceMutez: 20_000_000, activeOperationCount: 0 },
      fallback: { counter: 10, balanceMutez: 20_000_000, activeOperationCount: 0 },
    },
    terminalState: { level: 100, rotini: { nextTokenId: 5, project3: { minted: 0, reserved: 0 } } },
    publicIpfs: [{ tokenId: 3, kind: "artifact", cid: "bafy", sha256: "cd".repeat(32), byteLength: 1 }],
  };
  const final = structuredClone(base);
  final.verifiedAt = "2026-07-22T12:01:00.000Z";
  final.terminalState.level = 101;
  assert.doesNotThrow(() => assertRavioliNativeRecoveryRecheckStable(base, final));
  const counterDrift = structuredClone(final);
  counterDrift.lanes.primary.counter = 11;
  counterDrift.lanes.fallback.counter = 11;
  assert.throws(() => assertRavioliNativeRecoveryRecheckStable(base, counterDrift), /creator counter changed/);
  const projectDrift = structuredClone(final);
  projectDrift.terminalState.rotini.project3.reserved = 1;
  assert.throws(() => assertRavioliNativeRecoveryRecheckStable(base, projectDrift), /terminal dependency state changed/);
});

test("Ravioli LE policy requires finite wrapper supply/time and rejects equality or outliving the earliest child", () => {
  const now = Date.parse("2026-07-22T12:00:00.000Z");
  const earliestChildEnd = "2026-07-24T12:00:00.000Z";
  const valid = resolveRavioliLimitedEditionConstraint({
    childPolicies: [
      { contract: GNOCCHI, tokenId: 2, maxSupply: 5, end: earliestChildEnd },
      { contract: GNOCCHI, tokenId: 3, maxSupply: 10, end: "2026-07-25T12:00:00.000Z" },
      { contract: GNOCCHI, tokenId: 1, maxSupply: null, end: null },
    ],
    wrapperSaleEnabled: true,
    wrapperSaleEnd: "2026-07-24T11:59:00.000Z",
    wrapperMaxSupply: 2,
    nowMs: now,
  });
  assert.deepEqual(valid, {
    requiresLimitedWrapper: true,
    earliestChildEnd,
    wrapperSaleEnd: "2026-07-24T11:59:00.000Z",
  });

  const base = {
    childPolicies: [{ contract: GNOCCHI, tokenId: 2, maxSupply: 5, end: earliestChildEnd }],
    wrapperSaleEnabled: true,
    wrapperSaleEnd: earliestChildEnd,
    wrapperMaxSupply: 1,
    nowMs: now,
  };
  assert.throws(
    () => resolveRavioliLimitedEditionConstraint({ ...base, wrapperSaleEnabled: false }),
    /LE child requires a direct Ravioli sale/,
  );
  assert.throws(
    () => resolveRavioliLimitedEditionConstraint({ ...base, wrapperSaleEnd: null }),
    /LE child requires a finite Ravioli sale end/,
  );
  assert.throws(
    () => resolveRavioliLimitedEditionConstraint(base),
    /Ravioli sale must end before its earliest LE child/,
  );
  assert.throws(
    () => resolveRavioliLimitedEditionConstraint({ ...base, wrapperSaleEnd: "2026-07-24T12:00:00.001Z" }),
    /Ravioli sale must end before its earliest LE child/,
  );
  assert.throws(
    () => resolveRavioliLimitedEditionConstraint({
      ...base,
      childPolicies: [{ contract: GNOCCHI, tokenId: 2, maxSupply: 5, end: "2026-07-22T11:59:59.000Z" }],
    }),
    /LE child mint window has already expired/,
  );
  assert.deepEqual(
    resolveRavioliLimitedEditionConstraint({
      childPolicies: [
        { contract: GNOCCHI, tokenId: 0, maxSupply: null, end: earliestChildEnd },
        { contract: GNOCCHI, tokenId: 1, maxSupply: null, end: null },
      ],
      wrapperSaleEnabled: true,
      wrapperSaleEnd: null,
      wrapperMaxSupply: 2,
      nowMs: now,
    }),
    { requiresLimitedWrapper: false, earliestChildEnd: null, wrapperSaleEnd: null },
  );
});

test("Ravioli reserves forever-OE capacity while an expired timed OE remains valid escrow inventory", () => {
  const metadataUris = ["ipfs://timed", "ipfs://forever", "ipfs://limited"];
  const limitedEdition = { tokenId: 2, end: LIMITED_CHILD_END, maxSupply: 3, metadataUri: metadataUris[2] };
  const rolesInput = {
    sales: [
      { key: "0", value: { active: true, start: "2026-07-19T00:00:00Z", end: "2026-07-20T00:00:00Z", max_supply: null } },
      { key: "1", value: { active: true, start: null, end: null, max_supply: null } },
      { key: "2", value: { active: true, start: "2099-08-19T00:00:00Z", end: "2099-08-20T00:00:00Z", max_supply: 3 } },
    ],
    metadata: metadataUris.map((uri, tokenId) => ({
      key: String(tokenId),
      value: { token_info: { "": Buffer.from(uri).toString("hex") } },
    })),
    policyLocked: [{ key: "0", value: true }, { key: "1", value: true }, { key: "2", value: true }],
    tokenMetadataUris: metadataUris,
    limitedEdition,
  };
  const result = validateRavioliGnocchiDependencyRoles(rolesInput);
  assert.deepEqual(result, { allocationTokenId: 1, limitedAllocationTokenId: 2 });
  assert.throws(
    () => validateRavioliGnocchiDependencyRoles({
      ...rolesInput,
      limitedEdition: { ...limitedEdition, end: "2099-08-20T00:00:00.001Z" },
    }),
    /expiry drift/,
  );
  assert.throws(
    () => validateRavioliGnocchiDependencyRoles({
      sales: [
        { key: "0", value: { active: true, start: "2026-07-19T00:00:00Z", end: "2026-07-20T00:00:00Z", max_supply: null } },
        { key: "1", value: { active: true, start: null, end: "2026-07-25T00:00:00Z", max_supply: null } },
      ],
      metadata: metadataUris.map((uri, tokenId) => ({ key: String(tokenId), value: { token_info: { "": Buffer.from(uri).toString("hex") } } })),
      policyLocked: [{ key: "0", value: true }, { key: "1", value: true }],
      tokenMetadataUris: metadataUris,
      limitedEdition,
    }),
    /forever OE without an expiry/,
  );
});

test("Ravioli mode-0 live comparison removes verification timestamps at every depth and nothing else", () => {
  const initial = {
    verifiedAt: "2026-07-23T00:00:00.000Z",
    routerAddress: ROUTER,
    ipfs: [{ url: "https://ipfs.io/ipfs/example", sha256: "a".repeat(64), verifiedAt: "2026-07-23T00:00:01.000Z" }],
    operationEvidence: [{ hash: "o".repeat(51), observedAt: "stable-chain-value" }],
  };
  const later = {
    ...initial,
    verifiedAt: "2026-07-23T00:01:00.000Z",
    ipfs: [{ ...initial.ipfs[0], verifiedAt: "2026-07-23T00:01:01.000Z" }],
  };
  assert.deepEqual(stableRavioliMode0MutationLiveCheck(later), stableRavioliMode0MutationLiveCheck(initial));
  assert.notDeepEqual(
    stableRavioliMode0MutationLiveCheck({ ...later, ipfs: [{ ...later.ipfs[0], sha256: "b".repeat(64) }] }),
    stableRavioliMode0MutationLiveCheck(initial),
  );
});

test("Ravioli partitions the derived v3 write plan into non-overlapping semantic histories", () => {
  const receipts = RAVIOLI_UI_LIVE_EFFECTIVE_OPERATION_MATRIX.map((expected, index) => ({
    schema: "pasta-ui-live-receipt@1",
    sequence: index + 1,
    timestampUtc: new Date(1_750_000_000_000 + index).toISOString(),
    action: expected.action,
    chainId: SHADOWNET_CHAIN_ID,
    operationHash: `operation-${index + 1}`,
    entrypoints: expected.entrypoint ? [expected.entrypoint] : [],
  })) as any;
  const products = ravioliModeWriteOperationHashes(receipts);
  assert.deepEqual(products.map((operations) => operations.length), [8, 12, 10, 10, 13]);
  assert.equal(new Set(products.flat()).size, 53);
  const partitions = ravioliProofPartitionWriteOperationHashes(receipts);
  assert.deepEqual(
    Object.fromEntries(Object.entries(partitions).map(([partition, operations]) => [partition, operations.length])),
    {
      infrastructure: 2,
      "mode-0-deterministic-vault": 8,
      "mode-1-blind-funded-pool": 12,
      "mode-2-blind-allocated-mint": 10,
      "mode-3-blind-generative-mint": 10,
      "mode-4-hybrid-atomic-pack": 13,
      "withheld-reveal-refund": 12,
    },
  );
  assert.equal(new Set(Object.values(partitions).flat()).size, RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total);
  assert.deepEqual(
    Object.values(partitions).flat().sort(),
    receipts.map((receipt: any) => receipt.operationHash).sort(),
  );
  assert.throws(
    () => ravioliModeWriteOperationHashes(receipts.map((receipt: any, index: number) => index === 10 ? { ...receipt, entrypoints: ["mint"] } : receipt)),
    /entrypoint drift/,
  );
});

test("Ravioli mode-0 recovery receipt freezes source artifacts before adding its own file", async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), "ravioli-mode0-preserve-"));
  try {
    const appRoot = path.join(runRoot, "ravioli");
    const openKitRoot = path.join(appRoot, "artifacts", "open-kits");
    const journalRoot = path.join(appRoot, "artifacts", "journal");
    await mkdir(openKitRoot, { recursive: true });
    await mkdir(path.join(journalRoot, "pins"), { recursive: true });
    const openKitBytes = Buffer.from(JSON.stringify({
      contract: ROUTER,
      tokenId: 0,
      mode: MODES[0],
      blindSecurity: "commit-reveal-ui-hidden-chain-public",
    }));
    const openKitSha256 = sha256(openKitBytes);
    await writeFile(path.join(openKitRoot, "ravioli-open-kit-0.json"), openKitBytes);
    await writeFile(path.join(openKitRoot, "open-kit-capture-progress.json"), JSON.stringify({
      status: "PARTIAL",
      openKits: [{ sha256: openKitSha256 }],
    }));
    await writeFile(path.join(journalRoot, "pins", "000003.bin"), Buffer.from("superseded manifest"));
    await writeFile(path.join(journalRoot, "pins", "000004.bin"), Buffer.from("superseded token"));
    const activeProof = (fileName: string) => ({
      cid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
      uri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
      publicGatewayUrl: "https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
      fileName,
      mimeType: "application/json",
      sha256: "c".repeat(64),
      byteLength: 1,
    });
    const recovery = await preserveRavioliMode0MutationRecoveryEvidence({
      appRoot,
      replay: {
        journalRoot,
        routerAddress: ROUTER,
        identity: { journalId: "d".repeat(64), intentSha256: "e".repeat(64) },
        activePins: [
          { pinSequence: 1, bytes: new Uint8Array([1]), proof: activeProof("ravioli-wrapper.png") },
          { pinSequence: 2, bytes: new Uint8Array([2]), value: {}, proof: activeProof("collection.json") },
        ],
        writeReceipts: [
          { action: "originate", operationHash: `o${"1".repeat(50)}`, contractAddress: ROUTER, entrypoints: [] },
          { action: "call", operationHash: `o${"2".repeat(50)}`, contractAddress: GNOCCHI, entrypoints: ["update_operators"] },
        ],
        stalePins: [{ pinSequence: 3 }, { pinSequence: 4 }],
      } as any,
      initialLive: { verifiedAt: "2026-07-23T00:00:00.000Z" },
      finalLive: { verifiedAt: "2026-07-23T00:00:01.000Z" },
    });
    assert.equal((recovery.receipt.preservedArtifacts as unknown[]).length, 4);
    assert.equal(recovery.files.length, 5);
    const receiptBytes = await readFile(path.join(recovery.sourceRoot, "ravioli-mode0-mutation-recovery.json"));
    assert.equal(sha256(receiptBytes), recovery.receiptSha256);
    assert.deepEqual(JSON.parse(receiptBytes.toString("utf8")), recovery.receipt);
    assert.ok(recovery.sourceRoot.startsWith(`${appRoot}${path.sep}`), "recovery evidence escaped the Ravioli app root");
    const reused = await preserveRavioliMode0MutationRecoveryEvidence({
      appRoot,
      replay: {
        journalRoot,
        routerAddress: ROUTER,
        identity: { journalId: "d".repeat(64), intentSha256: "e".repeat(64) },
        activePins: [
          { pinSequence: 1, bytes: new Uint8Array([1]), proof: activeProof("ravioli-wrapper.png") },
          { pinSequence: 2, bytes: new Uint8Array([2]), value: {}, proof: activeProof("collection.json") },
        ],
        writeReceipts: [
          { action: "originate", operationHash: `o${"1".repeat(50)}`, contractAddress: ROUTER, entrypoints: [] },
          { action: "call", operationHash: `o${"2".repeat(50)}`, contractAddress: GNOCCHI, entrypoints: ["update_operators"] },
        ],
        stalePins: [{ pinSequence: 3 }, { pinSequence: 4 }],
      } as any,
      initialLive: { verifiedAt: "2026-07-23T00:10:00.000Z" },
      finalLive: { verifiedAt: "2026-07-23T00:10:01.000Z" },
    });
    assert.equal(reused.receiptSha256, recovery.receiptSha256);
    assert.deepEqual(reused.files, recovery.files);
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("Ravioli package-resume checkpoint is canonical, scope-bound, and payload-hash protected", async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), "ravioli-package-checkpoint-"));
  try {
    const scope = {
      runId: path.basename(runRoot),
      appPath: "ravioli" as const,
    };
    const bytes = encodeRavioliPackageResumeCheckpoint({
      scope,
      payload: {
        marker: "alpha",
        operations: Array.from(
          { length: RAVIOLI_UI_LIVE_EXPECTED_COUNTS.total },
          (_, index) => index + 1,
        ),
      },
    });
    const checkpoint = decodeRavioliPackageResumeCheckpoint(bytes);
    assert.deepEqual(checkpoint.scope, scope);
    assert.equal(checkpoint.status, "READY_TO_PACKAGE");
    assert.equal(checkpoint.payload.marker, "alpha");
    assert.match(checkpoint.payloadSha256, /^[0-9a-f]{64}$/);
    const checkpointText = Buffer.from(bytes).toString("utf8");
    assert.doesNotMatch(checkpointText, /\/Users\//);
    assert.ok(!checkpointText.includes(runRoot));

    const tampered = Buffer.from(Buffer.from(bytes).toString("utf8").replace('"marker":"alpha"', '"marker":"omega"'), "utf8");
    assert.throws(() => decodeRavioliPackageResumeCheckpoint(tampered), /payload digest drift/);
    assert.throws(
      () => decodeRavioliPackageResumeCheckpoint(Buffer.concat([Buffer.from(bytes), Buffer.from("\n")])),
      /not canonical deterministic JSON/,
    );
    assert.throws(
      () => encodeRavioliPackageResumeCheckpoint({
        scope: { ...scope, appPath: "other" as "ravioli" },
        payload: {},
      }),
      /app scope is invalid/,
    );
    assert.throws(
      () => assertPortableRavioliCheckpointValue(
        { screenshots: [{ pngPath: `/Users/example/private/${scope.runId}.png` }] },
        [runRoot],
      ),
      /leaks a local user path/,
    );
    assert.throws(
      () => assertPortableRavioliCheckpointValue({ bridge: { sessionToken: "not-public" } }, [runRoot]),
      /prohibited private field/,
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});

test("Ravioli commits its durable checkpoint before an injected terminal-index failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ravioli-terminal-boundary-"));
  try {
    const checkpointPath = path.join(directory, "checkpoint.json");
    let terminalReadStarted = false;
    await assert.rejects(
      () => checkpointRavioliBeforeTerminalVerification(
        async () => {
          await writeFile(checkpointPath, Buffer.from('{"status":"READY_TO_PACKAGE"}', "utf8"));
          return checkpointPath;
        },
        async () => {
          terminalReadStarted = true;
          assert.equal((await readFile(checkpointPath)).toString("utf8"), '{"status":"READY_TO_PACKAGE"}');
          throw new Error("injected terminal indexed verification failure");
        },
      ),
      /injected terminal indexed verification failure/,
    );
    assert.equal(terminalReadStarted, true);
    assert.equal((await readFile(checkpointPath)).toString("utf8"), '{"status":"READY_TO_PACKAGE"}');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Ravioli staged publication is idempotent and rejects a conflicting final", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ravioli-staged-publication-"));
  try {
    const stagedPath = path.join(directory, "receipt.json.awaiting-journal-finalization");
    const finalPath = path.join(directory, "receipt.json");
    const exact = Buffer.from('{"status":"exact"}', "utf8");
    await writeFile(stagedPath, exact);
    await publishStagedRavioliFile(stagedPath, finalPath);
    assert.deepEqual(await readFile(finalPath), exact);
    await assert.rejects(() => readFile(stagedPath), (error: NodeJS.ErrnoException) => error.code === "ENOENT");

    await writeFile(stagedPath, exact);
    await publishStagedRavioliFile(stagedPath, finalPath);
    assert.deepEqual(await readFile(finalPath), exact);
    await assert.rejects(() => readFile(stagedPath), (error: NodeJS.ErrnoException) => error.code === "ENOENT");

    await writeFile(stagedPath, Buffer.from('{"status":"conflict"}', "utf8"));
    await assert.rejects(
      () => publishStagedRavioliFile(stagedPath, finalPath),
      /existing Ravioli publication differs/,
    );
    assert.deepEqual(await readFile(finalPath), exact);

    const symlinkStage = path.join(directory, "manifest.json.awaiting-journal-finalization");
    const symlinkFinal = path.join(directory, "manifest.json");
    await writeFile(symlinkStage, exact);
    await symlink(finalPath, symlinkFinal);
    await assert.rejects(
      () => publishStagedRavioliFile(symlinkStage, symlinkFinal),
      /existing Ravioli publication is not a real file/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Ravioli AggregateError reporting preserves every recovery cause", () => {
  const output = formatRavioliUiLiveError(new AggregateError([
    new Error("publish boundary failed"),
    new Error("private capture rejected genuine record"),
  ], "Ravioli combined failure"));
  assert.match(output, /Ravioli combined failure/);
  assert.match(output, /publish boundary failed/);
  assert.match(output, /private capture rejected genuine record/);
});

test("Ravioli failure handling captures only new publish recovery state or new writes", () => {
  assert.equal(shouldCaptureRavioliFailureRecovery({
    publishRecoveryRecordBaseline: 1,
    publishRecoveryRecordCount: 1,
    writeReceiptBaseline: 23,
    writeReceiptCount: 23,
  }), false);
  assert.equal(shouldCaptureRavioliFailureRecovery({
    publishRecoveryRecordBaseline: 1,
    publishRecoveryRecordCount: 2,
    writeReceiptBaseline: 23,
    writeReceiptCount: 23,
  }), true);
  assert.equal(shouldCaptureRavioliFailureRecovery({
    publishRecoveryRecordBaseline: 1,
    publishRecoveryRecordCount: 1,
    writeReceiptBaseline: 23,
    writeReceiptCount: 24,
  }), true);
  assert.equal(shouldCaptureRavioliFailureRecovery({
    publishRecoveryRecordBaseline: 1,
    publishRecoveryRecordCount: 0,
    writeReceiptBaseline: 23,
    writeReceiptCount: 23,
  }), false);
  assert.throws(() => shouldCaptureRavioliFailureRecovery({
    publishRecoveryRecordBaseline: 0,
    publishRecoveryRecordCount: -1,
    writeReceiptBaseline: 0,
    writeReceiptCount: 0,
  }), /record count is invalid/);
});

test("Ravioli current-generation resume flag is exact, private, exclusive, and cannot revive retired lanes", () => {
  const currentResumeFlag = "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_RESUME_EXECUTE";
  const base = {
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/private/tmp/pasta-ravioli-current-resume-public-test",
  };
  const canonicalPrivateRoot = "/private/tmp/pasta-ravioli-current-resume-private-test";

  assert.doesNotThrow(() => assertRavioliUiLiveExecutionAllowed({
    ...base,
    [currentResumeFlag]: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: canonicalPrivateRoot,
  }));

  for (const invalid of ["", "0", "yes", "true"]) {
    assert.throws(
      () => assertRavioliUiLiveExecutionAllowed({
        ...base,
        [currentResumeFlag]: invalid,
        PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: canonicalPrivateRoot,
      }),
      /current resume flag is invalid/,
      `current-generation resume unexpectedly accepted ${JSON.stringify(invalid)}`,
    );
  }

  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({
      ...base,
      [currentResumeFlag]: "1",
    }),
    /requires private recovery storage/,
  );

  for (const otherResumeFlag of [
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PREWRITE_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V5_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PACKAGE_RESUME_EXECUTE",
  ]) {
    assert.throws(
      () => assertRavioliUiLiveExecutionAllowed({
        ...base,
        [currentResumeFlag]: "1",
        [otherResumeFlag]: "1",
        PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: canonicalPrivateRoot,
      }),
      /resume modes are mutually exclusive/,
      `current-generation resume was not exclusive with ${otherResumeFlag}`,
    );
  }

  for (const retiredResumeFlag of [
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_MODE0_MUTATION_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V2_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_RESTART_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_PREFLIGHT_ONLY",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_PREFLIGHT_ONLY",
    "PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V6_RESUME_EXECUTE",
  ]) {
    assert.throws(
      () => assertRavioliUiLiveExecutionAllowed({
        ...base,
        [currentResumeFlag]: "1",
        [retiredResumeFlag]: "1",
        PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: canonicalPrivateRoot,
      }),
      /RECOVERY_RETIRED/,
      `${retiredResumeFlag} stopped failing as immutable evidence`,
    );
  }
});

test("Ravioli production runner is Shadownet-only, dependency-gated, recovery-scoped, and UI-LIVE", async () => {
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({}), /explicit Ravioli UI-live execute flag/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", TEZOS_NETWORK: "mainnet", PASTA_PROOF_RUN_DIR: "/tmp/run" }), /only permits Shadownet/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
    PASTA_SHADOWNET_RAVIOLI_ROUTER_ADDRESS: ROUTER,
  }), /rejects legacy mutation resume/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PREWRITE_RESUME_EXECUTE: "yes" }), /resume flag is invalid/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE: "yes" }), /controller-resume flag is invalid/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V6_RESUME_EXECUTE: "yes",
  }), /CURRENT_V6_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V6_RESUME_EXECUTE: "1",
  }), /CURRENT_V6_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE: "yes",
  }), /current-v7 resume flag is invalid/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE: "1",
  }), /requires explicit corrected-plan activation/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V8_PLAN_EXTENSION_ACTIVATE: "yes",
  }), /plan-extension activation flag is invalid/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V8_PLAN_EXTENSION_ACTIVATE: "1",
  }), /requires the authenticated event-86 lane/);
  assert.throws(
    () => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_MODE0_MUTATION_RESUME_EXECUTE: "1" }),
    /LEGACY_RECOVERY_RETIRED/,
  );
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V2_RESUME_EXECUTE: "yes" }), /CURRENT_V2_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V2_RESUME_EXECUTE: "1" }), /CURRENT_V2_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_RESTART_EXECUTE: "yes" }), /CURRENT_V3_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_PREFLIGHT_ONLY: "1" }), /CURRENT_V3_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V3_RESTART_EXECUTE: "1" }), /CURRENT_V3_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE: "yes",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_PREFLIGHT_ONLY: "1",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE: "1",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({ PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1", PASTA_PROOF_RUN_DIR: "/tmp/run", PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PACKAGE_RESUME_EXECUTE: "yes" }), /package-resume flag is invalid/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }), /requires private recovery storage/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PREWRITE_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }), /resume modes are mutually exclusive/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }), /resume modes are mutually exclusive/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PREWRITE_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.throws(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V4_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PACKAGE_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }), /CURRENT_V4_RECOVERY_RETIRED/);
  assert.doesNotThrow(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CONTROLLER_RESUME_EXECUTE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }));
  assert.doesNotThrow(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_PACKAGE_RESUME_EXECUTE: "1",
  }));
  assert.doesNotThrow(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V7_RESUME_EXECUTE: "1",
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_CURRENT_V8_PLAN_EXTENSION_ACTIVATE: "1",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }));
  assert.doesNotThrow(() => assertRavioliUiLiveExecutionAllowed({
    PASTA_SHADOWNET_RAVIOLI_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR: "/tmp/ravioli-private",
  }));
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:resume:mode0"], undefined);
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:resume:current-v2"], undefined);
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:restart:current-v3"], undefined);
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:preflight:current-v3"], undefined);
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:resume:current-v4"], undefined);
  assert.equal(packageJson.scripts["pasta:shadownet:ravioli:ui-live:preflight:current-v4"], undefined);
  assert.equal(
    packageJson.scripts["pasta:shadownet:ravioli:ui-live:resume:current-v6"],
    undefined,
    "the exact current-v6 boundary must not become a reusable package command",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:ravioli:ui-live:resume:current-v7"],
    undefined,
    "the exact current-v7 boundary must not become a reusable package command",
  );
  const source = await readFile(new URL("./shadownet-ravioli-ui-live.ts", import.meta.url), "utf8");
  const directIssueProbe = source.slice(
    source.indexOf("async function assertLimitedEditionDirectMintRejected"),
    source.indexOf("async function assertFreshRotiniCapacity"),
  );
  assert.match(directIssueProbe, /BLIND_USE_ATOMIC_ISSUE/);
  assert.doesNotMatch(directIssueProbe, /LE_SUPPLY_ATOMIC/);
  const main = source.slice(source.indexOf("export async function runRavioliUiLive"));
  assert.ok(main.indexOf("if (packageResume)") < main.indexOf("const signerConfiguration"));
  assert.ok(main.indexOf("resolveIpfsProofConfig") < main.indexOf("loadRavioliMode0MutationReplay"));
  assert.ok(main.indexOf("loadRavioliMode0MutationReplay") < main.indexOf("validateRavioliDependencies"));
  assert.ok(main.indexOf("validateRavioliDependencies") < main.indexOf("await mkdir"));
  assert.ok(main.indexOf("validateRavioliDependencies") < main.indexOf("operationEstimateMutez"));
  assert.ok(main.indexOf("recheckFreshRavioliDependencies") < main.indexOf("await claimFreshRavioliUiLiveOutputDirectory"));
  assert.ok(main.indexOf("await claimFreshRavioliUiLiveOutputDirectory") < main.indexOf("createRavioliUiLiveJournal"));
  assert.match(main, /openExactRavioliUiLivePrewriteJournal/);
  assert.match(main, /loadExactRavioliUiLivePrewriteScreenshots/);
  assert.match(main, /loadRavioliControllerResume/);
  assert.match(main, /loadExactRavioliUiLiveControllerResumeScreenshots/);
  assert.match(main, /createRavioliControllerResumeInterceptor/);
  assert.match(main, /loadRavioliMode0MutationReplay/);
  assert.match(main, /loadExactRavioliUiLiveMode0MutationScreenshots/);
  assert.match(main, /loadRavioliCurrentV4Resume/);
  assert.match(main, /loadExactRavioliUiLiveCurrentV4Screenshots/);
  assert.match(main, /createRavioliCurrentV4ResumeInterceptor/);
  assert.match(main, /loadRavioliCurrentV5Resume/);
  assert.match(main, /loadExactRavioliUiLiveCurrentV5Screenshots/);
  assert.match(main, /currentV5Replay\.operations\[14\]/);
  assert.match(main, /loadRavioliCurrentV7Resume/);
  assert.match(main, /currentResumeTzktBaseline = currentResumeJournal\?\.intent\.dependencyHashes\.tzktBaseline/);
  assert.match(main, /tzktBaseline: currentResumeTzktBaseline!/);
  assert.match(main, /!\(mode === 0 && \(currentV4Replay \|\| currentResumePlan\)\)/);
  assert.match(main, /loadExactRavioliUiLiveCurrentV7Screenshots/);
  assert.match(main, /verifyRavioliCurrentV7ResumeLive/);
  assert.match(main, /currentV7Replay\.planExtensionBoundary/);
  assert.match(main, /authenticated-event87-restart/);
  assert.match(main, /recheckRavioliDependenciesForCurrentV6Resume/);
  assert.match(source, /buildRavioliRotiniCapacityExpectation\(dependencies, expectedReserved\)/);
  assert.doesNotMatch(source, /nextProjectId: dependencies\.rotini\.projectId \+ 1/);
  assert.match(main, /currentV7Replay\.operations\[13\]/);
  assert.match(main, /currentV7Replay\.operations\[14\]/);
  assert.match(main, /currentV7Replay\.operations\[21\]/);
  assert.match(main, /initialOperationSequence: 20, initialReceiptSequence: 20/);
  assert.match(main, /currentV7FirstSemanticOperationPending/);
  assert.match(main, /current-v7 first new creator sequence is not 21/);
  assert.match(main, /current-v7 first new operation is not the Rotini adapter origination/);
  assert.match(main, /initialOperationSequence: 14, initialReceiptSequence: 14/);
  assert.match(main, /initialOperationSequence: 1, initialReceiptSequence: 1/);
  assert.match(main, /primeAuthenticatedMode0Prefix/);
  assert.match(main, /RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY/);
  assert.match(main, /captureRavioliPrivateRecovery/);
  assert.match(main, /captureFreshBlindPrecommit/);
  assert.ok(
    main.indexOf("await captureFreshBlindPrecommit(operation)")
      < main.indexOf("await creatorJournalHooks.beforeOperationSubmit(operation)"),
    "fresh blind recovery must be externalized before the signer PREPARED boundary",
  );
  assert.match(main, /countRavioliPrivateRecoveryRecords\(\s*creatorRecoveryPage,\s*\)/);
  assert.match(main, /shouldCaptureRavioliFailureRecovery\(\{/);
  assert.match(main, /failureRecoveryBaseline\.creatorWriteReceiptCount/);
  assert.match(main, /failureRecoveryBaseline\.collectorOneWriteReceiptCount/);
  assert.match(main, /failureRecoveryBaseline\.collectorTwoWriteReceiptCount/);
  assert.match(main, /countRavioliChainWriteReceipts\(creatorSession\.getReceipts\(\)\)/);
  assert.doesNotMatch(main, /newWriteReceiptCount/);
  assert.match(source, /export async function waitForRavioliBuyerPageReady/);
  assert.match(source, /await waitForRavioliBuyerPageReady\(\{/);
  assert.match(main, /assertRemainingSaleWindow\("before purchase submission"\)/);
  assert.ok(main.indexOf("if (currentV4PreflightOnly)") < main.indexOf("await claimFreshRavioliUiLiveOutputDirectory"));
  const currentV4Runtime = main.slice(
    main.indexOf("const currentV4Interceptor"),
    main.indexOf("const creatorBridge"),
  );
  assert.doesNotMatch(currentV4Runtime, /installRavioliCurrentV2NonceOverride|beginFreshRestart/);
  assert.match(main, /if \(!prewriteResume && !controllerResume && !mode0MutationResume && !currentV3Restart && !currentV4Resume && !currentV5Resume && !currentV7Resume && !currentResume\)/);
  assert.ok(
    main.indexOf("await publishMainMode(0)") <
      main.indexOf("authorizeRavioliControllerViews(\n      creatorSession"),
    "creator controller views must be authorized only after the v3 controller is originated",
  );
  assert.ok(
    main.indexOf("authorizeRavioliControllerViews(\n      creatorSession") <
      main.indexOf("await publishMainMode(1)"),
    "creator controller views must be available before the existing-router publish path",
  );
  assert.ok(
    main.indexOf("await publishMainMode(4)") <
      main.indexOf("authorizeRavioliCollectorReadSurface(collector.session"),
    "collector helper reads must be authorized only after both adapters are originated",
  );
  assert.ok(
    main.indexOf("authorizeRavioliCollectorReadSurface(collector.session") <
      main.indexOf("const tokenZeroBuyer"),
    "collector read surface must be authorized before any atomic open",
  );
  assert.match(source, /authorizeReadOnlyContract\(\{ contractAddress \}\)/);
  assert.match(source, /viewNames: RAVIOLI_ROTINI_ADAPTER_VIEW_NAMES/);
  assert.ok(main.indexOf("checkpointRavioliBeforeTerminalVerification") < main.indexOf("verifyRavioliIndexedProof"));
  assert.ok(main.indexOf("writeRavioliProofPackageCheckpoint") < main.indexOf("verifyRavioliIndexedProof"));
  assert.ok(main.indexOf("writeRavioliProofPackage") < main.indexOf("journal.finalize"));
  assert.ok(main.indexOf("journal.finalize") < main.indexOf("publishStagedRavioliProof"));
  const packageResume = source.slice(
    source.indexOf("async function resumeRavioliUiLiveProofPackage"),
    source.indexOf("async function verifyRavioliIndexedProof"),
  );
  assert.ok(packageResume.indexOf("verifyRavioliProofPackageCheckpointEvidence") < packageResume.indexOf("verifyRavioliIndexedProof"));
  assert.ok(packageResume.indexOf("verifyRavioliIndexedProof") < packageResume.indexOf("writeRavioliProofPackage"));
  assert.ok(packageResume.indexOf("writeRavioliProofPackage") < packageResume.indexOf("journal.finalize"));
  assert.ok(packageResume.indexOf("journal.finalize") < packageResume.indexOf("publishStagedRavioliProof"));
  assert.doesNotMatch(packageResume, /TaquitoPastaUiLiveSession|startPastaUiLiveLoopbackServer|pinIpfsProof|\.transfer\(|\.originate\(/);
  assert.match(source, /Ravioli LE pre-write rejection differed from policy; studioLog=/);
  assert.match(source, /classification: "UI-LIVE"/);
  assert.match(source, /pasta-ravioli-open-kit@3/);
  assert.match(source, /ravioliPayloadCommitment\(""\)/);
  assert.match(source, /generated-at-open actions must use the explicit None commitment policy/);
  assert.match(source, /verifiedOperations/);
  assert.match(source, /hybridEntrypoints/);
  assert.match(source, /wrapperPurchaseCheckpoints/);
  assert.match(source, /\.\.\.deliveredTokenUrls\[tokenId\]/);
  assert.match(source, /const revealCapability = buildRavioliRevealCapability/);
  assert.match(
    source,
    /const capabilities = \[[\s\S]*\.\.\.modeCapabilities,[\s\S]*revealCapability,[\s\S]*limitedEditionCapability,[\s\S]*journalCapability,[\s\S]*mutationRecoveryCapability/,
  );
  assert.match(source, /limited-edition-expiry-deconfliction-ui-live-proof/);
  assert.match(source, /journalArtifactOperationCount: journalOperationCount/);
  assert.match(source, /manifestOperationReferenceCount: operations\.length/);
  assert.match(source, /const operations = \[\.\.\.dependencyOriginations\.map\(operationRecord\), \.\.\.journalOperations\]/);
  assert.match(source, /RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total/);
  assert.match(source, /RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total \+ 2/);
  assert.match(source, /dependencyOriginationCount: dependencyOriginations\.length/);
  assert.match(source, /The durable Ravioli journal covers all \$\{RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total\} composed writes\.[\s\S]*yielding \$\{RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total \+ 2\} exact operation references across the six contracts invoked by the suite\./);
  assert.match(source, /Bind all \$\{RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total\} composed signer operations[\s\S]*two independently proven exact-current dependency originations[\s\S]*\$\{RAVIOLI_UI_LIVE_EXPECTED_COUNTS\.total \+ 2\}-operation graph/);
  assert.match(source, /operationCoverage: journalOperationCoverage/);
  assert.match(source, /const modeOperationHashes = ravioliModeWriteOperationHashes\(input\.writeReceipts\)/);
  assert.match(source, /schema: "pastaprotocol-ravioli-mode-outcome@1"/);
  assert.match(source, /operationHashes: modeOperationHashes\[tokenId\]/);
  assert.match(source, /modeOutcomeArtifacts\[tokenId\]\.id/);
  assert.match(source, /operations: modeOperationHashes\[tokenId\]/);
  assert.match(source, /open hash is outside its operation partition/);
  assert.match(source, /child balance delta drift/);
  assert.match(source, /loadFreshRavioliDependencies/);
  assert.match(source, /recheckFreshRavioliDependencies/);
  assert.match(source, /bigmaps\/\$\{bigMapId\}\/keys\?active=true&limit=\$\{limit\}/);
  assert.match(source, /entry\?\.active === true/);
  assert.match(source, /copyFreshRavioliDependencyEvidence/);
  assert.match(source, /fresh-dependencies/);
  assert.match(source, /same-run-dependency-evidence/);
  assert.match(source, /pastaprotocol-ravioli-dependencies@3/);
  assert.match(source, /freshDependencies/);
  assert.doesNotMatch(
    main,
    /input\.dependencies\.(?:recovery|nativeRecovery|prepackRecovery)|dependency-recovery-evidence|native-recovery-evidence/,
  );
  assert.match(source, /assertOfficialLimitedEditionDependencyMismatchRejected/);
  assert.match(source, /dishonestRevealDeadline/);
  assert.match(source, /dishonestOpenDeadline/);
  assert.match(source, /reveal_commitment: "00"\.repeat\(32\)/);
  assert.match(source, /DECLARED_CHILD_EXPIRY_AFTER_CHILD/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("export async function assertOfficialLimitedEditionDependencyMismatchRejected"),
      source.indexOf("async function assertLimitedEditionDirectMintRejected"),
    ),
    /PACK_END_AFTER_CHILD/,
  );
  assert.match(source, /Ravioli LE allocation commit operation tree/);
  assert.match(source, /reserve_mint_capacity/);
  assert.match(source, /wrapperFullyIssuedBeforeSale/);
  assert.match(source, /distinct Ravioli action indexes must produce distinct Rotini token seeds/);
  assert.match(source, /generativeActionIndexes: \[0, 1\]/);
  assert.match(
    source,
    /terminalRotiniCapacityBaseline\.minted \+ terminalRotiniCapacityBaseline\.generatedTokenCount/,
  );
  assert.match(source, /rotiniGeneratedTokenIds: input\.dependencies\.rotini\.generatedTokenIds/);
  assert.match(source, /waitForEvent\("download"/);
  assert.match(source, /pastaprotocol-ravioli-open-kit-capture-progress@1/);
  assert.match(source, /kind: "open-kit"/);
  assert.match(source, /openKitArtifacts\.slice\(1\)/);
  assert.match(source, /ipfsPinned: false/);
  assert.match(source, /kind === "asset"/);
  assert.match(source, /tokens\/balances\?token\.contract=/);
  assert.match(source, /same-run origination/);
  assert.doesNotMatch(source, /PASTA_SHADOWNET_RAVIOLI_GNOCCHI_ADDRESS/);
  const contractSource = await readFile(new URL("../../contracts/pasta-protocol/PastaPackRouterFA2.py", import.meta.url), "utf8");
  assert.match(contractSource, /if sp\.amount > sp\.mutez\(0\):\s+sp\.send\(sale\.treasury, sp\.amount\)/);
});

test("Ravioli negative-policy gates distinguish read-only receipts from chain writes", () => {
  assert.equal(countRavioliChainWriteReceipts([
    { action: "connect" },
    { action: "chain_check" },
    { action: "pin_json" },
  ] as any), 0);
  assert.equal(countRavioliChainWriteReceipts([
    { action: "chain_check" },
    { action: "originate" },
    { action: "call" },
    { action: "batch" },
  ] as any), 3);
});

test("Ravioli open-kit waits surface the real Studio failure instead of timing out on download", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.setContent(`
      <button id="btnPublish">Publish</button>
      <pre id="log">publish failed: stale negative-policy probe\n</pre>
      <script>
        document.getElementById("btnPublish").addEventListener("click", () => {
          document.getElementById("log").textContent += "publish failed: exact create_pack simulation error\\n";
        });
      </script>
    `);
    await assert.rejects(
      () => clickRavioliPublishAndWaitForDownload(page, 5_000),
      /exact create_pack simulation error/,
    );
  } finally {
    await browser.close();
  }
});

test("Ravioli pack configuration clears mystery state when switching from LE to deterministic mode", async () => {
  const fixture = await startStrictRavioliStudioFixture();
  try {
    const page = fixture.studio.page;
    await configureRavioliPackMode(page, 2);
    await page.fill("#bnRevealDeadline", "2026-07-30T20:25");
    await page.fill("#bnOpenDeadline", "2026-07-30T21:25");
    assert.equal(await page.locator("#bnMystery").isChecked(), true);
    await configureRavioliPackMode(page, 0);
    assert.equal(await page.locator("#bnMystery").isChecked(), false);
    assert.equal(await page.locator("#bnRevealDeadline").isDisabled(), true);
    assert.equal(await page.locator("#bnOpenDeadline").isDisabled(), true);
    assert.equal(await page.inputValue("#bnRevealDeadline"), "");
    assert.equal(await page.inputValue("#bnOpenDeadline"), "");
  } finally {
    await closeStrictRavioliStudioFixture(fixture);
  }
});

test("Ravioli pin policy rejects contaminated deterministic disclosure metadata before IPFS", () => {
  const policy = new RavioliUiLivePolicy({
    administrator: CREATOR,
    dependencies: ravioliFixtureDependencies(),
    mirror: new RavioliUiStateMirror(),
    pins: [],
    codeHashes: {
      deploymentCertificate: "e".repeat(64),
      blindController: "d".repeat(64),
      router: "a".repeat(64),
      gnocchiAdapter: "b".repeat(64),
      rotiniAdapter: "c".repeat(64),
    },
  });
  assert.throws(() => policy.validatePin({
    fileName: "ravioli-pack-manifest.json",
    mimeType: "application/json",
    value: { mode: "deterministic_vault", mystery: true, blindSecurity: "commit-reveal-ui-hidden-chain-public" },
  }), /manifest mystery policy drift/);
  assert.throws(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: { ravioli: { mode: "deterministic_vault", blindSecurity: "commit-reveal-ui-hidden-chain-public" } },
  }), /token disclosure policy drift/);
  assert.doesNotThrow(() => policy.validatePin({
    fileName: "ravioli-pack-manifest.json",
    mimeType: "application/json",
    value: { mode: "deterministic_vault", mystery: false, blindSecurity: "public-recipe" },
  }));
  assert.doesNotThrow(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: { ravioli: { mode: "deterministic_vault", blindSecurity: "public", manifestUri: "ipfs://corrected" } },
  }));
  assert.throws(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: {
      ravioli: {
        mode: "blind_funded_pool",
        blindSecurity: "commit-reveal-ui-hidden-chain-public",
        manifestUri: "ipfs://manifest",
        sealedContentsUri: "ipfs://sealed",
        revealCommitment: "a".repeat(64),
      },
    },
  }), /token disclosure policy drift/);
  assert.throws(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: {
      ravioli: {
        mode: "blind_funded_pool",
        blindSecurity: "authenticated-ciphertext-until-reveal",
        manifestUri: "ipfs://manifest",
        revealCommitment: "a".repeat(64),
      },
    },
  }), /authenticated ciphertext URI/);
  assert.throws(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: {
      ravioli: {
        mode: "blind_funded_pool",
        blindSecurity: "authenticated-ciphertext-until-reveal",
        manifestUri: "ipfs://manifest",
        sealedContentsUri: "ipfs://sealed",
        revealCommitment: "not-a-commitment",
      },
    },
  }), /reveal commitment/);
  assert.doesNotThrow(() => policy.validatePin({
    fileName: "token.json",
    mimeType: "application/json",
    value: {
      ravioli: {
        mode: "blind_funded_pool",
        blindSecurity: "authenticated-ciphertext-until-reveal",
        manifestUri: "ipfs://manifest",
        sealedContentsUri: "ipfs://sealed",
        revealCommitment: "a".repeat(64),
      },
    },
  }));
});

test("Ravioli publish wait surfaces a Studio failure logged after the kit download", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.setContent(`
      <button id="btnPublish">Publish</button>
      <pre id="log"></pre>
      <script>
        document.getElementById("btnPublish").addEventListener("click", () => {
          const link = document.createElement("a");
          link.download = "ravioli-open-kit-0.json";
          link.href = "data:application/json,%7B%7D";
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.getElementById("log").textContent += "publish failed: journal rejected public reveal\\n";
          }, 25);
        });
      </script>
    `);
    let downloadCaptured = false;
    await assert.rejects(
      () => clickRavioliPublishAndWaitForDownload(page, 5_000, async (download) => {
        assert.equal(download.suggestedFilename(), "ravioli-open-kit-0.json");
        downloadCaptured = true;
      }),
      /journal rejected public reveal/,
    );
    assert.equal(downloadCaptured, true, "Ravioli must preserve its recovery kit before surfacing a post-download failure");
  } finally {
    await browser.close();
  }
});

test("Ravioli proof maps reveal evidence and every delivered child token to exact TzKT URLs", () => {
  assert.deepEqual(
    ravioliDeliveredTokenExplorerUrls({
      gnocchiAddress: GNOCCHI,
      limitedAllocationTokenId: 3,
      foreverAllocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      rotiniAddress: ROTINI,
      rotiniGeneratedTokenIds: [5, 6, 7],
    }),
    [
      [`https://shadownet.tzkt.io/${GNOCCHI}/tokens/0`],
      [
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/0`,
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/1`,
      ],
      [`https://shadownet.tzkt.io/${GNOCCHI}/tokens/3`],
      [
        `https://shadownet.tzkt.io/${ROTINI}/tokens/5`,
        `https://shadownet.tzkt.io/${ROTINI}/tokens/6`,
      ],
      [
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/${RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID}`,
        `https://shadownet.tzkt.io/${GNOCCHI}/tokens/${RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID}`,
        `https://shadownet.tzkt.io/${ROTINI}/tokens/7`,
      ],
    ],
  );
  assert.throws(
    () => ravioliDeliveredTokenExplorerUrls({
      gnocchiAddress: GNOCCHI,
      limitedAllocationTokenId: 3,
      foreverAllocationTokenId: RAVIOLI_GNOCCHI_ALLOCATION_TOKEN_ID,
      rotiniAddress: ROTINI,
      rotiniGeneratedTokenIds: [5, 7, 8],
    }),
    /must be consecutive/,
  );

  const capability = buildRavioliRevealCapability({
    screenshots: [
      { stage: "024-hybrid-opened", caption: "collector one opened hybrid_atomic_pack" },
      {
        stage: "025-blind-sealed-reveals",
        caption:
          "Blind reveal keys published for pre-sale encrypted envelopes",
      },
    ],
    blindRevealArtifacts: [1, 2, 3, 4].map((tokenId) => ({
      id: `public-reveal-${tokenId}`,
      gatewayUrl: `https://ipfs.io/ipfs/bafy-public-reveal-${tokenId}`,
    })),
    contracts: [{ address: ROUTER, explorerUrl: `https://shadownet.tzkt.io/${ROUTER}` }],
    operations: [
      { hash: "opCreate", entrypoint: "create_pack" },
      ...[1, 2, 3, 4].map((tokenId) => ({ hash: `opReveal${tokenId}`, entrypoint: "set_pack_contents" })),
    ],
    blindTokens: [1, 2, 3, 4].map((tokenId) => ({
      id: `ravioli-wrapper-${tokenId}`,
      explorerUrl: `https://shadownet.tzkt.io/${ROUTER}/tokens/${tokenId}`,
    })),
    supportingArtifactIds: ["native-recovery-evidence", "tzkt-index-evidence", "ui-live-run-receipt"],
  });
  assert.equal(capability.id, "blind-sealed-reveal-ui-live-proof");
  assert.deepEqual(capability.evidence.screenshots, [
    "025-blind-sealed-reveals",
  ]);
  assert.deepEqual(capability.evidence.operations, ["opReveal1", "opReveal2", "opReveal3", "opReveal4"]);
  assert.deepEqual(capability.evidence.tokens, [
    "ravioli-wrapper-1",
    "ravioli-wrapper-2",
    "ravioli-wrapper-3",
    "ravioli-wrapper-4",
  ]);
  assert.deepEqual(capability.evidence.artifacts, [
    "public-reveal-1",
    "public-reveal-2",
    "public-reveal-3",
    "public-reveal-4",
    "native-recovery-evidence",
    "tzkt-index-evidence",
    "ui-live-run-receipt",
  ]);
  assert.ok(capability.evidence.urls.includes(`https://shadownet.tzkt.io/${ROUTER}/tokens/4`));
  assert.ok(capability.evidence.urls.includes("https://ipfs.io/ipfs/bafy-public-reveal-4"));
});

test("Ravioli proof packaging copies and rehashes the complete Gnocchi LE supplement", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ravioli-le-package-"));
  const runRoot = path.join(root, "run");
  const appRoot = path.join(runRoot, "ravioli");
  const supplementRoot = path.join(runRoot, "ravioli-le-dependency");
  const artifactBytes = Buffer.from('{"name":"future LE child"}\n');
  const screenshotBytes = Buffer.concat([PNG, Buffer.from("dependency-stage")]);
  const receipt: any = {
    artifacts: [{
      id: "gnocchi-le-token-3-metadata",
      kind: "token-metadata",
      path: "artifacts/token-3-metadata.json",
      sha256: sha256(artifactBytes),
    }],
    screenshots: [{
      stage: "004-token-three-live",
      path: "screenshots/004-token-three-live.png",
      sha256: sha256(screenshotBytes),
      caption: "Gnocchi token three live",
    }],
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const receiptPath = path.join(supplementRoot, "artifacts", "ravioli-gnocchi-le-dependency.json");
  try {
    await mkdir(path.join(supplementRoot, "artifacts"), { recursive: true });
    await mkdir(path.join(supplementRoot, "screenshots"), { recursive: true });
    await mkdir(appRoot, { recursive: true });
    await writeFile(path.join(supplementRoot, "artifacts", "token-3-metadata.json"), artifactBytes);
    await writeFile(path.join(supplementRoot, "screenshots", "004-token-three-live.png"), screenshotBytes);
    await writeFile(receiptPath, receiptBytes);
    const copied = await copyRavioliLimitedEditionDependencyEvidence({
      appRoot,
      runRoot,
      dependency: {
        receipt,
        receiptPath: "ravioli-le-dependency/artifacts/ravioli-gnocchi-le-dependency.json",
        receiptSha256: sha256(receiptBytes),
      },
    });
    assert.deepEqual(copied.map((entry) => entry.id), [
      "gnocchi-le-dependency-receipt",
      "gnocchi-le-gnocchi-le-token-3-metadata",
      "gnocchi-le-screenshot-004-token-three-live",
    ]);
    assert.deepEqual(
      await readFile(path.join(appRoot, "artifacts", "gnocchi-le-dependency", "artifacts", "token-3-metadata.json")),
      artifactBytes,
    );
    assert.deepEqual(
      await readFile(path.join(appRoot, "artifacts", "gnocchi-le-dependency", "screenshots", "004-token-three-live.png")),
      screenshotBytes,
    );
    await assert.rejects(
      () => copyRavioliLimitedEditionDependencyEvidence({
        appRoot,
        runRoot,
        dependency: { receipt, receiptPath: "../escape.json", receiptSha256: sha256(receiptBytes) },
      }),
      /must be a string|escapes|equal|false|path/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Ravioli proof packaging copies every hash-bound pre-pack recovery checkpoint", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ravioli-prepack-package-"));
  const runRoot = path.join(root, "run");
  const appRoot = path.join(runRoot, "ravioli");
  const recoveryRoot = path.join(runRoot, "ravioli-prepack-recovery");
  const values = {
    preflight: { schema: "preflight", counter: 8 },
    intent: { schema: "intent", expectedCounter: 9 },
    progress: { schema: "progress", status: "APPLIED" },
    receipt: { schema: "receipt", operation: { hash: "opRecovery" } },
  };
  const files = {
    preflight: "recovery-preflight.json",
    intent: "recovery-intent.json",
    progress: "recovery-progress.json",
    receipt: "artifacts/ravioli-prepack-recovery.json",
  } as const;
  try {
    await mkdir(path.join(recoveryRoot, "artifacts"), { recursive: true });
    await mkdir(appRoot, { recursive: true });
    const bytes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Buffer.from(JSON.stringify(value))])) as Record<keyof typeof values, Buffer>;
    await Promise.all((Object.keys(files) as Array<keyof typeof files>).map((key) =>
      writeFile(path.join(recoveryRoot, files[key]), bytes[key]),
    ));
    const recovery = {
      preflight: values.preflight,
      preflightSha256: sha256(bytes.preflight),
      preflightPath: "ravioli-prepack-recovery/recovery-preflight.json",
      intent: values.intent,
      intentSha256: sha256(bytes.intent),
      intentPath: "ravioli-prepack-recovery/recovery-intent.json",
      progress: values.progress,
      progressSha256: sha256(bytes.progress),
      progressPath: "ravioli-prepack-recovery/recovery-progress.json",
      receipt: values.receipt,
      receiptSha256: sha256(bytes.receipt),
      receiptPath: "ravioli-prepack-recovery/artifacts/ravioli-prepack-recovery.json",
    };
    const copied = await copyRavioliPrepackRecoveryEvidence({ appRoot, runRoot, recovery });
    assert.deepEqual(copied.map((entry) => entry.id), [
      "ravioli-prepack-recovery-preflight",
      "ravioli-prepack-recovery-intent",
      "ravioli-prepack-recovery-progress",
      "ravioli-prepack-recovery-receipt",
    ]);
    for (const [key, fileName] of Object.entries({
      preflight: "recovery-preflight.json",
      intent: "recovery-intent.json",
      progress: "recovery-progress.json",
      receipt: "ravioli-prepack-recovery.json",
    })) {
      assert.deepEqual(
        await readFile(path.join(appRoot, "artifacts", "prepack-recovery", fileName)),
        bytes[key as keyof typeof bytes],
      );
    }
    await assert.rejects(
      () => copyRavioliPrepackRecoveryEvidence({
        appRoot,
        runRoot,
        recovery: { ...recovery, intentSha256: "00".repeat(32) },
      }),
      /changed after the final pre-write gate/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Ravioli retains exact real-Studio open-kit download bytes without publishing their nonces", () => {
  const kit = {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    editionPolicy: {
      requiresLimitedWrapper: false,
      wrapperEditionClass: "limited-edition",
      earliestChildEnd: null,
      wrapperSaleStart: null,
      wrapperSaleEnd: "2026-08-01T00:00:00.000Z",
      revealDeadline: "2026-08-02T00:00:00.000Z",
      openDeadline: "2026-08-03T00:00:00.000Z",
    },
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    warning: "Do not publish recipe nonces before you intend holders to open.",
    recipes: [
      { serial: 0, nonce: "ab".repeat(32), actions: [{ kind: "escrow" }] },
      { serial: 1, nonce: "cd".repeat(32), actions: [{ kind: "escrow" }] },
    ],
    sealedReveal: {
      schema: "pasta-ravioli-sealed-reveal-reference@1",
      contentsUri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
      salt: "12".repeat(32),
      offset: 1,
      envelopeSha256: "34".repeat(32),
    },
  };
  const inPageJson = JSON.stringify(kit, null, 2);
  const downloadedBytes = Buffer.from(`${inPageJson}\n`);
  const captured = validateRavioliOpenKitDownload({
    mode: 1,
    routerAddress: ROUTER,
    suggestedFilename: "ravioli-open-kit-1.json",
    inPageJson,
    downloadedBytes,
  });
  assert.deepEqual(captured.kit, kit);
  assert.equal(captured.fileName, "ravioli-open-kit-1.json");
  assert.match(captured.sha256, /^[0-9a-f]{64}$/);
  assert.throws(
    () => validateRavioliOpenKitDownload({
      mode: 1,
      routerAddress: ROUTER,
      suggestedFilename: "wrong.json",
      inPageJson,
      downloadedBytes,
    }),
    /filename drift/,
  );
  assert.throws(
    () => validateRavioliOpenKitDownload({
      mode: 1,
      routerAddress: ROUTER,
      suggestedFilename: "ravioli-open-kit-1.json",
      inPageJson,
      downloadedBytes: Buffer.from(`${inPageJson} `),
    }),
    /download bytes differ/,
  );

  const originalParse = JSON.parse;
  let parseCount = 0;
  try {
    JSON.parse = ((text: string, reviver?: (this: any, key: string, value: any) => any) => {
      const parsed = originalParse(text, reviver);
      parseCount += 1;
      return parseCount === 1 ? bridgeDecodedJson(parsed) : parsed;
    }) as typeof JSON.parse;
    assert.doesNotThrow(() => validateRavioliOpenKitDownload({
      mode: 1,
      routerAddress: ROUTER,
      suggestedFilename: "ravioli-open-kit-1.json",
      inPageJson,
      downloadedBytes,
    }));
  } finally {
    JSON.parse = originalParse;
  }

  parseCount = 0;
  try {
    JSON.parse = ((text: string, reviver?: (this: any, key: string, value: any) => any) => {
      const parsed = originalParse(text, reviver);
      parseCount += 1;
      if (parseCount === 2) parsed.recipes[0].nonce = "99".repeat(32);
      return parsed;
    }) as typeof JSON.parse;
    assert.throws(
      () => validateRavioliOpenKitDownload({
        mode: 1,
        routerAddress: ROUTER,
        suggestedFilename: "ravioli-open-kit-1.json",
        inPageJson,
        downloadedBytes,
      }),
      /downloaded content differs from the real Studio field/,
    );
  } finally {
    JSON.parse = originalParse;
  }
});

test("Ravioli current-v2 recovery accepts exact pretty Studio bytes and compares canonical open-kit content", () => {
  const kit = {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 0,
    mode: "deterministic_vault",
    recipes: [{
      serial: 0,
      nonce: "ab".repeat(32),
      actions: [{ kind: "escrow", fa2: GNOCCHI, tokenId: 0, amount: 1 }],
    }],
  };
  const prettyStudioBytes = Buffer.from(`${JSON.stringify(kit, null, 2)}\n`, "utf8");
  const canonicalKitBytes = Buffer.from(deterministicJsonBytes(kit));
  assert.notDeepEqual(
    prettyStudioBytes,
    canonicalKitBytes,
    "the regression fixture must preserve the Studio's non-canonical presentation bytes",
  );
  const publicRevealBytes = Buffer.from(deterministicJsonBytes({
    schema: "pasta-ravioli-public-reveal@1",
    openKit: kit,
  }));
  const recovered = parseRavioliCurrentV2OpenKitEvidence(prettyStudioBytes, publicRevealBytes);
  assert.deepEqual(recovered.openKit, kit);
  assert.deepEqual(recovered.publicReveal.openKit, kit);

  const changedKit = structuredClone(kit);
  changedKit.recipes[0].nonce = "cd".repeat(32);
  assert.throws(
    () => parseRavioliCurrentV2OpenKitEvidence(
      prettyStudioBytes,
      deterministicJsonBytes({
        schema: "pasta-ravioli-public-reveal@1",
        openKit: changedKit,
      }),
    ),
    /open kit differs from pin 5 publicReveal\.openKit/,
  );
});

test("Ravioli public reveals compare bridge-decoded open kits by canonical value", () => {
  const kit: PackKit = {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    editionPolicy: {
      requiresLimitedWrapper: false,
      wrapperEditionClass: "limited-edition",
      earliestChildEnd: null,
      wrapperSaleStart: null,
      wrapperSaleEnd: "2026-08-01T00:00:00.000Z",
      revealDeadline: "2026-08-02T00:00:00.000Z",
      openDeadline: "2026-08-03T00:00:00.000Z",
    },
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    warning: "Do not publish recipe nonces before you intend holders to open.",
    recipes: [{
      serial: 0,
      nonce: "ab".repeat(32),
      actions: [{ kind: "escrow", contract: GNOCCHI, tokenId: 0 }],
    }],
  };
  const reveal = bridgeDecodedJson({
    schema: "pasta-ravioli-public-reveal@1",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: kit.manifestUri,
    maxSupply: 1,
    itemCount: 1,
    openKit: kit,
  });
  const pin = { value: reveal, proof: fakeProof("ravioli-public-reveal-1.json") };

  assert.equal(ravioliPublicRevealPin([pin], ROUTER, 1, kit), pin);

  const changedKit = structuredClone(kit);
  changedKit.recipes[0].nonce = "cd".repeat(32);
  assert.throws(
    () => ravioliPublicRevealPin([pin], ROUTER, 1, changedKit),
    /public reveal changed its captured open kit/,
  );
});

test("Ravioli TzKT acceptance rejects non-FA2 contracts, missing tokens, and missing balances", () => {
  const contract = { address: ROUTER, kind: "asset", tzips: ["fa2"], creator: { address: CREATOR } };
  const tokens = [0, 1].map((tokenId) => ({ contract: { address: ROUTER }, tokenId: String(tokenId), totalSupply: "1" }));
  const balances = [{
    account: { address: COLLECTOR_ONE },
    token: { contract: { address: ROUTER }, tokenId: "0", standard: "fa2" },
    balance: "1",
  }];
  assert.doesNotThrow(() => assertTzktFa2ContractRecord(contract, ROUTER, CREATOR));
  assert.doesNotThrow(() => assertTzktTokenRecords(tokens, ROUTER, [0, 1]));
  assert.doesNotThrow(() => assertTzktBalanceRecords(balances, ROUTER, [{ owner: COLLECTOR_ONE, tokenId: 0, balance: 1 }]));
  assert.throws(() => assertTzktFa2ContractRecord({ ...contract, kind: "smart_contract" }, ROUTER, CREATOR), /not classified by TzKT as an asset/);
  assert.throws(() => assertTzktFa2ContractRecord({ ...contract, tzips: [] }, ROUTER, CREATOR), /not classified by TzKT as FA2/);
  assert.throws(() => assertTzktTokenRecords(tokens, ROUTER, [0, 1, 2]), /token 2 is not indexed/);
  assert.throws(
    () => assertTzktBalanceRecords(balances, ROUTER, [{ owner: COLLECTOR_TWO, tokenId: 0, balance: 1 }]),
    /balance .* is not indexed by TzKT/,
  );
  const operationHash = "opU3hjsJEBMmu3b9dJzArhoGzbCdaE2osEoWmicot6U1neGcwsh";
  const manifest = {
    app: "gnocchi",
    operations: [{ kind: "origination", hash: operationHash, contractAddress: ROUTER }],
  };
  const receipt = {
    receipts: [{ action: "originate", operationHash, contractAddress: ROUTER, signerAddress: CREATOR }],
  };
  assert.equal(dependencyOriginationReceipt(manifest, receipt, ROUTER, CREATOR).operationHash, operationHash);
  assert.throws(
    () => dependencyOriginationReceipt(manifest, receipt, ROUTER, COLLECTOR_ONE),
    /origination signer drift/,
  );
});

test("Ravioli recovery gate distinguishes an active operator from its TzKT tombstone", () => {
  const key = {
    owner: CREATOR,
    operator: ROUTER,
    token_id: "0",
  };
  assert.equal(hasActiveRavioliOperator([{ active: false, key }], {
    owner: CREATOR,
    operator: ROUTER,
    tokenId: 0,
  }), false);
  assert.equal(hasActiveRavioliOperator([{ active: true, key }], {
    owner: CREATOR,
    operator: ROUTER,
    tokenId: 0,
  }), true);
  assert.throws(() => hasActiveRavioliOperator([{ key }], {
    owner: CREATOR,
    operator: ROUTER,
    tokenId: 0,
  }), /active tombstone flag/);
});

test("Ravioli journal accepts APPLIED only at the exact TzKT actor counter and target", () => {
  const operationHash = "opU3hjsJEBMmu3b9dJzArhoGzbCdaE2osEoWmicot6U1neGcwsh";
  const transaction = {
    status: "applied",
    hash: operationHash,
    sender: { address: CREATOR },
    counter: 101,
    level: 4_300_001,
    timestamp: "2026-07-22T22:00:01Z",
    target: { address: ROUTER },
    parameter: { entrypoint: "buy" },
  };
  const evidence = assertRavioliJournalTzktOperationApplied({
    rows: [transaction],
    action: "call",
    operationHash,
    signerAddress: CREATOR,
    expectedCounter: 101,
    contractAddress: ROUTER,
    entrypoints: ["buy"],
  });
  assert.equal(evidence.counter, 101);
  assert.equal(evidence.contractAddress, ROUTER);
  assert.equal(evidence.timestamp, transaction.timestamp);
  assert.deepEqual(Object.keys(evidence).sort(), [
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
  assert.throws(
    () => assertRavioliJournalTzktOperationApplied({
      rows: [transaction],
      action: "call",
      operationHash,
      signerAddress: CREATOR,
      expectedCounter: 102,
      contractAddress: ROUTER,
      entrypoints: ["buy"],
    }),
    /exactly one applied operation/,
  );
  assert.throws(
    () => assertRavioliJournalTzktOperationApplied({
      rows: [{ ...transaction, timestamp: "not-a-time" }],
      action: "call",
      operationHash,
      signerAddress: CREATOR,
      expectedCounter: 101,
      contractAddress: ROUTER,
      entrypoints: ["buy"],
    }),
    /operation timestamp is invalid/,
  );
  assertRavioliJournalTzktOperationApplied({
    rows: [{
      ...transaction,
      originatedContract: { address: GNOCCHI_ADAPTER },
      target: undefined,
      parameter: undefined,
    }],
    action: "originate",
    operationHash,
    signerAddress: CREATOR,
    expectedCounter: 101,
    contractAddress: GNOCCHI_ADAPTER,
    entrypoints: [],
  });
});

test("Ravioli Studio pins exact adapter contract metadata instead of inline data URIs", async () => {
  const studio = await readFile(new URL("../../public/creation-tools/ravioli/js/studio.js", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /metadataMap\(`data:application\/json/);
  assert.match(studio, /pinning \$\{kind\} adapter contract metadata/);
  assert.match(studio, /pasta-\$\{kind\.toLowerCase\(\)\}-pack-adapter-contract\.json/);
  assert.match(studio, /adapterStorage\(admin, metadataUri, kind\)/);
});

test("Ravioli Studio exposes cancellation-only adapter recovery and emits telemetry only after exact postconditions", async () => {
  const studio = await readFile(new URL("../../public/creation-tools/ravioli/js/studio.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../../public/creation-tools/ravioli/index.html", import.meta.url), "utf8");
  for (const id of [
    "recoverAdapter",
    "recoverAdapterKind",
    "recoverResourceId",
    "recoverCapacity",
    "btnRecoverAdapter",
    "recoverAdapterInfo",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const recovery = studio.slice(
    studio.indexOf("async function recoverAdapterCapacity()"),
    studio.indexOf("async function ravioliWrapperBalance"),
  );
  assert.match(recovery, /adapter capacity can only be recovered from a cancelled pack/);
  assert.match(recovery, /methodsObject\.recover_adapter\(payload\)\.send\(\)/);
  assert.match(recovery, /confirmed recovery did not decrement router and adapter capacity exactly/);
  assert.match(recovery, /confirmed recovery did not release exact Gnocchi target capacity/);
  assert.match(recovery, /"ravioli\.adapter_capacity_recovered"/);
  assert.ok(
    recovery.indexOf("RECOVER_ADAPTER_POSTCONDITION_VERIFIED")
      < recovery.indexOf('"ravioli.adapter_capacity_recovered"'),
    "adapter recovery telemetry must follow durable postcondition verification",
  );
});

test("Ravioli Studio resolves child LE policy before pinning and commits the bounded wrapper window", async () => {
  const studio = await readFile(new URL("../../public/creation-tools/ravioli/js/studio.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../../public/creation-tools/ravioli/index.html", import.meta.url), "utf8");
  const publish = studio.slice(studio.indexOf("async function publish()"));
  const inspectExisting = studio.slice(
    studio.indexOf("async function inspectExistingRavioliRouter"),
    studio.indexOf("async function readChildEditionPolicy"),
  );
  assert.match(html, /id="bnSaleStart"[^>]*type="datetime-local"/);
  assert.match(html, /id="bnSaleEnd"[^>]*type="datetime-local"/);
  assert.match(studio, /resolveChildEditionPolicies/);
  assert.match(studio, /policy_locked/);
  assert.match(studio, /Allocated Pasta child \$\{normalizedTokenId\} is inactive/);
  assert.match(studio, /Allocated Pasta child \$\{normalizedTokenId\} must have a locked edition policy/);
  assert.match(studio, /storage\.total_minted/);
  assert.match(studio, /storage\.total_reserved/);
  assert.match(studio, /storage\.projects/);
  assert.match(studio, /storage\.resources/);
  assert.match(studio, /Rotini resource \$\{action\.resourceId\} does not exist/);
  assert.match(studio, /%child_expiry/);
  assert.match(studio, /This router predates Ravioli LE safety/);
  assert.match(studio, /canonicalJsonText\(value, label\)/);
  assert.match(studio, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(studio, /preflightEscrowInventory\(recipes, admin\)/);
  assert.match(studio, /required across every recipe/);
  assert.match(studio, /rpc\.getScript\(contractAddress\)/);
  assert.match(studio, /\$\{label\} code does not match the bundled production artifact/);
  assert.match(studio, /requireExactBundledContractCode\(adapterAddress, "gnocchiAdapter", "Gnocchi adapter", "adapter"\)/);
  assert.match(studio, /requireExactBundledContractCode\(adapterAddress, "rotiniAdapter", "Rotini adapter", "adapter"\)/);
  assert.match(studio, /requireExactBundledContractCode\(contractAddress, "gnocchiTarget", "Gnocchi allocation target", "Gnocchi contract"\)/);
  assert.match(studio, /requireExactBundledContractCode\(targetAddress, "rotiniTarget", "Rotini generative target", "Rotini contract"\)/);
  assert.match(studio, /michelineHasAnnotation\(mintPackIterationSchema, "%action_index"\)/);
  assert.ok(
    inspectExisting.indexOf("requireExactBundledContractCode") < inspectExisting.indexOf("contract.at"),
    "exact router code identity must precede interface and storage reads",
  );
  assert.match(studio, /LE child requires a finite Ravioli sale end/);
  assert.match(studio, /Ravioli primary sale must end before its earliest LE child public mint expiry/);
  assert.ok(
    publish.indexOf("resolveChildEditionPolicies") < publish.indexOf("pinning wrapper artwork"),
    "child LE policy must resolve before the first durable pin",
  );
  assert.ok(
    publish.indexOf("inspectExistingRavioliRouter") < publish.indexOf("pinning wrapper artwork"),
    "existing-router schema verification must precede the first durable pin",
  );
  assert.match(studio, /child_expiry: editionConstraint\.childExpiry/);
  assert.match(studio, /expected_token_id: tokenId/);
  assert.match(studio, /manifest_uri: MD\.utf8ToHex\(manifestUri\)/);
  assert.match(studio, /open kit manifest URI does not match immutable pack identity/);
  assert.match(studio, /start: wrapperSaleStart, end: wrapperSaleEnd/);
  assert.match(studio, /requiresLimitedWrapper/);
  assert.match(studio, /earliestChildEnd/);
});
