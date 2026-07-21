#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { MichelCodecPacker } from "@taquito/taquito";
import { packDataBytes } from "@taquito/michel-codec";
import { validateOperation, ValidationResult } from "@taquito/utils";

import {
  PASTA_UI_LIVE_BRIDGE_SCHEMA,
  TaquitoPastaUiLiveSession,
  type PastaUiLiveBridgeRequest,
} from "./pasta-ui-live-bridge-kit";
import {
  assertShadownet,
  buildToolkit,
  deterministicJsonBytes,
  loadSignerSet,
  normalizeBase,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  resolveIpfsProofConfig,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  utf8ToHex,
  type IpfsPinnedProof,
} from "./shadownet-proof-kit";

type JsonObject = Record<string, any>;

export const RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG = "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_EXECUTE";
export const RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG = "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_RECONCILE";
export const RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV = "PASTA_PROOF_RUN_DIR";
export const RAVIOLI_NATIVE_RECOVERY_RUN_ID = "pasta-alpha-proof-20260718a";
export const RAVIOLI_NATIVE_RECOVERY_DIRECTORY = "ravioli-native-recovery";
export const RAVIOLI_NATIVE_RECOVERY_QUARANTINE =
  "pasta-alpha-proof-20260718a-ravioli-sale-open-visual-predicate-attempt-2";
export const RAVIOLI_NATIVE_RECOVERY_ROUTER = "KT1E1Emw46UTwRiVknHUreNvfcvAd7X8KZ2m";
export const RAVIOLI_NATIVE_RECOVERY_GNOCCHI = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
export const RAVIOLI_NATIVE_RECOVERY_ROTINI = "KT1LUc15yfskvtWfKvYt9oFgXt24TnWx1P8T";
export const RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER = "KT1DY8Y9U6L5i2HC8WSYqyo6iT4VcNjMpNDT";
export const RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER = "KT1BTBC7C3Gj6ZL7n6NYF29RXKR2TYQeptoQ";
export const RAVIOLI_NATIVE_RECOVERY_CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";

const EXPECTED_REJECTION_SHA256 = "f89cb04b5f62d1132ee835ae2492402130841c2dbaecde451e5c6f322128db87";
const EXPECTED_QUARANTINE_INVENTORY_SHA256 = "bedb986a20c1aba8045043cc9d1a3759ae93171725762b6e3137ec48c58e7759";
const EXPECTED_KIT_HASHES = [
  "bba4872a7b8e1d224c7e3545564336c965358af32d384463507ba73654dd692a",
  "940d881813fb20300d67b58dba661bf883cf45fd35db3c8d4cefd7abf558c7ea",
  "9abc5d85bf9cbbfaaddf116f6d8fcc31d603004f0ae4e5c7fe975fcfb72c4983",
  "45b3f092f71f70681193203d00ae2a11c617b1977889c7122f67bc445668eff6",
  "2a45eca3da4b4ce1f3c5e74fcdd786225cc8d81086b88458a1e56e052c1034fe",
] as const;
const EXPECTED_OPEN_KIT_PROGRESS_SHA256 = "caf175476a885b5e7605d0983ab2520c3bd1f5938395594ead5124ac12f5fe68";
const EXPECTED_QUARANTINE_FILE_HASHES = {
  "artifacts/open-kits/open-kit-capture-progress.json": "caf175476a885b5e7605d0983ab2520c3bd1f5938395594ead5124ac12f5fe68",
  "artifacts/open-kits/ravioli-open-kit-0.json": "bba4872a7b8e1d224c7e3545564336c965358af32d384463507ba73654dd692a",
  "artifacts/open-kits/ravioli-open-kit-1.json": "940d881813fb20300d67b58dba661bf883cf45fd35db3c8d4cefd7abf558c7ea",
  "artifacts/open-kits/ravioli-open-kit-2.json": "9abc5d85bf9cbbfaaddf116f6d8fcc31d603004f0ae4e5c7fe975fcfb72c4983",
  "artifacts/open-kits/ravioli-open-kit-3.json": "45b3f092f71f70681193203d00ae2a11c617b1977889c7122f67bc445668eff6",
  "artifacts/open-kits/ravioli-open-kit-4.json": "2a45eca3da4b4ce1f3c5e74fcdd786225cc8d81086b88458a1e56e052c1034fe",
  "artifacts/screenshot-001-compose-five-atomic-pack-modes-same-run-dependencies-entered.json": "a532971ba6eb203b4462d5f9f32ce97e64dcc910efb16c59c95a1cd999f662c1",
  "artifacts/screenshot-002-compose-five-atomic-pack-modes-creator-connected-on-shadownet.json": "cab4dee9e95bd5c20dd15ea5a916fea417b95678557c51f0a4e3587d9095fcc9",
  "artifacts/screenshot-003-compose-five-atomic-pack-modes-deterministic-vault-configured.json": "d065547118c67112f139e9045d75d1ae8ff99a8f7a0a4da8006e19bdde8a7d8f",
  "artifacts/screenshot-004-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued.json": "da29c15a1a633218a46ea027c460dd1a150ed20241dece988f8068e411044d53",
  "artifacts/screenshot-005-compose-five-atomic-pack-modes-blind-funded-pool-configured.json": "3e22038f49e720b7e84c56371adaab816556c01f4e51bf5797204b83f981b273",
  "artifacts/screenshot-006-compose-five-atomic-pack-modes-blind-funded-pool-funded-and-issued.json": "8f4cf96f43dcd62b305e84a5615bc3c8cb64b3b019a7b335e1f91016ed17c7eb",
  "artifacts/screenshot-007-compose-five-atomic-pack-modes-blind-allocated-mint-configured.json": "d14e9ae1ddf2af45c5b34ad5cc8addbe71a336349cfd327dea52a13e653de013",
  "artifacts/screenshot-008-compose-five-atomic-pack-modes-blind-allocated-mint-funded-and-issued.json": "8a7dc013ae582f3951df7cb4e4b230306d360950a04a4f2bf71d0069707beb5f",
  "artifacts/screenshot-009-compose-five-atomic-pack-modes-blind-generative-mint-configured.json": "9e7959ff9858e4e33e76c157e3350deb0e4fdcfd68cdace5302141b977d6024e",
  "artifacts/screenshot-010-compose-five-atomic-pack-modes-blind-generative-mint-funded-and-issued.json": "769031b3f63a2aa967353403780ee78fc9765e749ef19f07d2675ade3a4c9ea9",
  "artifacts/screenshot-011-compose-five-atomic-pack-modes-hybrid-atomic-pack-configured.json": "d562a6c130ae3fa0b75472c4ee3aa628509d55d36c2165361c400f1e0ac21db1",
  "artifacts/screenshot-012-compose-five-atomic-pack-modes-hybrid-atomic-pack-funded-and-issued.json": "ca64249a21550768568714c9d96faa78e9aeefe2f65dfbe5b0dd6ae9eca663c7",
  "artifacts/screenshot-013-buy-and-atomically-open-five-pack-modes-collector-one-bought-deterministic-vault.json": "24dd68b0fd9ccc2f674eaa67ff57f4c3f72c577e4af8621f87aab7b08a8ca8e1",
  "artifacts/screenshot-014-buy-and-atomically-open-five-pack-modes-collector-one-opened-deterministic-vault.json": "069e0c3eff4aae97ec35d1830806fe131e09ce0bc179cf810cc1a329f067fbc9",
  "artifacts/screenshot-015-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool.json": "b5cfb1672def874723ad0d67ed18969d7edeff10ca51a90710c0a19f3ea23816",
  "screenshots/001-compose-five-atomic-pack-modes-same-run-dependencies-entered.png": "7e3b25aac9a5756dcb08cb055428cf10364f33243e0170e18d6681cef3344bc6",
  "screenshots/002-compose-five-atomic-pack-modes-creator-connected-on-shadownet.png": "172a736a9be9a7d979cf3937f48b42b08b082155e5008543a876ef172a28e29c",
  "screenshots/003-compose-five-atomic-pack-modes-deterministic-vault-configured.png": "84a6abb53afdccd3e7cf54bb33d56689afad314aa8ed5abb6344a1729fae8fd6",
  "screenshots/004-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued.png": "e9be967eba8f31451c496a7e015f2678bcbe6362844cd387cfaf1f1b52a7cfd1",
  "screenshots/005-compose-five-atomic-pack-modes-blind-funded-pool-configured.png": "585de9442a09b72a7e71d72a797725b16128d7383eb66939cbc10fda140100fe",
  "screenshots/006-compose-five-atomic-pack-modes-blind-funded-pool-funded-and-issued.png": "e95ecd75960b05d42c5265748ee8a218a81bbb7afca2450dad1e409d59c026ac",
  "screenshots/007-compose-five-atomic-pack-modes-blind-allocated-mint-configured.png": "a1c4736f66bd02eb2aa0a71bf6f1ecc42769c8a70a937ff55cb9003dbf1b1f9b",
  "screenshots/008-compose-five-atomic-pack-modes-blind-allocated-mint-funded-and-issued.png": "17f9bc31042af1695b8c0ba0bafcc7c82ec7e988de2508dbfcf3ccf102ea41e7",
  "screenshots/009-compose-five-atomic-pack-modes-blind-generative-mint-configured.png": "2fd2df36621456dd6f80bf896bed25a814c3ec29b07875b924a9acf3d70ebe7f",
  "screenshots/010-compose-five-atomic-pack-modes-blind-generative-mint-funded-and-issued.png": "dd680bd89468f3ecbd9850b80a5f67b40baea76d964909becae2cc6122c15975",
  "screenshots/011-compose-five-atomic-pack-modes-hybrid-atomic-pack-configured.png": "f6ca397089976299fba4c4ef3c5fa9ad7ccdd22cf5277cb266fb8f9037d19cb2",
  "screenshots/012-compose-five-atomic-pack-modes-hybrid-atomic-pack-funded-and-issued.png": "40856742e446a72011f05da1208026883716a3c29bbb103529c25e1b59f5d889",
  "screenshots/013-buy-and-atomically-open-five-pack-modes-collector-one-bought-deterministic-vault.png": "bbdcb913f576794228309b7b1fbb7fa1c23a6cbee53c27fd10ced6ce1541513c",
  "screenshots/014-buy-and-atomically-open-five-pack-modes-collector-one-opened-deterministic-vault.png": "31f4fcb7b4a517d32b5c4c80fbaf6ff4a30f928c22227c704c23015bec895352",
  "screenshots/015-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool.png": "03b8d46a914b88ec752acbd0b7523dd0eb72a1db0f708141f39423c954f77534",
} as const;
const EXPECTED_ACCEPTED_HASHES = {
  gnocchiManifestSha256: "cc2e1b1867c3cd0bbd9d83eec5eca4a7c248e454567e92aaa565a8c244cb9cba",
  gnocchiReceiptSha256: "c3e78ab3af6269efdc0f71bd789c732629f8d82c07eddb4764c3d852f7f79faa",
  gnocchiHistoricalSha256: "0a37661d4f2588cb3410426f45591039be92cb1fac03e2f5cdf0aa41e2cb4936",
  rotiniManifestSha256: "45267c22d619a576efe07af7e38d463fc04b5fa5b8c73f7cd63c39295438ef2e",
  rotiniReceiptSha256: "470f5c8ee75946a1ab467bf8f83a033c4757dee3caa03b256c8026ebc0d0049e",
  administrativeRecoveryReceiptSha256: "47884383830d14a3ff6b3a29a33c2c516068dd484e82133d08b1a7ab7425fcf3",
} as const;
const EMPTY_PAYLOAD_COMMITMENT = "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8";
const RECOVERY_OPERATION_RESERVE_MUTEZ = 8_000_000;
const MAX_GAS_LIMIT = 500_000;
const MAX_STORAGE_LIMIT = 60_000;
const MAX_FEE_MUTEZ = 100_000;
const FEE_HEADROOM_MUTEZ = 1_000;
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

export const RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE = {
  active: true,
  name: utf8ToHex("Rotini UI-LIVE Shadownet Proof"),
  symbol: utf8ToHex("ROTUI"),
  generator_uri: utf8ToHex("ipfs://bafkreibr4cwbxuchsgfbdsoyviiyajfxbiawwgavrk3j3fzafr5och4vsm"),
  display_uri: utf8ToHex("ipfs://bafkreihmobyzdsodow7uodrxk5sltzk2ssilrcenhwlzqw3oehimwbcae4"),
  output_mode: utf8ToHex("png"),
  price: 0,
  treasury: RAVIOLI_NATIVE_RECOVERY_CREATOR,
  max_supply: 3,
  max_per_wallet: 3,
  reservation_ttl: 3_600,
} as const;

export type RavioliNativeKitAction =
  | { kind: "escrow"; fa2: string; tokenId: number; amount: number }
  | { kind: "allocated"; adapter: string; resourceId: number; payloadCommitment: string }
  | { kind: "generative"; adapter: string; resourceId: number; payloadCommitment: null };

export type RavioliNativeKit = {
  schema: "pasta-ravioli-open-kit@3";
  network: "shadownet";
  contract: string;
  tokenId: number;
  mode: string;
  manifestUri: string;
  recipes: Array<{ serial: number; nonce: string; actions: RavioliNativeKitAction[] }>;
};

export type RavioliNativeEvidence = {
  quarantineRoot: string;
  rejectionSha256: string;
  inventorySha256: string;
  quarantineFileHashes: Record<string, string>;
  kitHashes: string[];
  progressSha256: string;
  kits: RavioliNativeKit[];
  acceptedHashes: typeof EXPECTED_ACCEPTED_HASHES;
  acceptedPaths: Record<keyof typeof EXPECTED_ACCEPTED_HASHES, string>;
};

export type RavioliNativeGeneratedOutput = {
  tokenId: 3 | 4;
  artifactFileName: string;
  artifactBytes: Uint8Array;
  artifact: IpfsPinnedProof;
  metadata: JsonObject;
  metadataPin: IpfsPinnedProof;
  payload: string;
};

export type RavioliNativeRecoveryCall = {
  contractAddress: string;
  entrypoint: "open_pack" | "set_sale_active" | "create_project";
  payload: JsonObject;
  purpose: string;
};

export type RavioliNativeSendOptions = {
  amount: 0;
  mutez: true;
  fee: number;
  gasLimit: number;
  storageLimit: number;
};

export type RavioliNativeEstimate = {
  call: RavioliNativeRecoveryCall;
  raw: {
    gasLimit: number;
    storageLimit: number;
    suggestedFeeMutez: number;
    minimalFeeMutez: number;
    burnFeeMutez: number;
  };
  sendOptions: RavioliNativeSendOptions;
};

export type RavioliNativeOperation = {
  hash: string;
  counter: number;
  level: number;
  timestamp: string;
  explorerUrl: string;
  call: RavioliNativeRecoveryCall;
  internalEntrypoints: string[];
};

type ProjectSnapshot = {
  active: boolean;
  name: string;
  symbol: string;
  generatorUri: string;
  displayUri: string;
  outputMode: string;
  price: number;
  treasury: string;
  maxSupply: number;
  maxPerWallet: number;
  reservationTtl: number;
  minted: number;
  reserved: number;
};

type GeneratedTokenSnapshot = {
  ownerBalance: number;
  totalSupply: number;
  metadataUri: string;
  artifactUri: string;
  displayUri: string;
  thumbnailUri: string;
  mimeType: string;
  artifactHash: string;
} | null;

export type RavioliNativeState = {
  level: number;
  router: {
    administrator: string;
    nextTokenId: number;
    creatorBalances: Record<string, number>;
    minted: Record<string, number>;
    opened: Record<string, number>;
    totalSupply: Record<string, number>;
    sales: Record<string, { active: boolean; remaining: number; price: number; seller: string; treasury: string }>;
  };
  gnocchi: {
    administrator: string;
    creatorBalances: Record<string, number>;
    routerBalances: Record<string, number>;
    totalSupply: Record<string, number>;
    totalReserved: Record<string, number>;
  };
  rotini: {
    administrator: string;
    nextTokenId: number;
    nextProjectId: number;
    project0: ProjectSnapshot;
    project3: ProjectSnapshot | null;
    generatedTokens: Record<string, GeneratedTokenSnapshot>;
  };
  adapters: {
    gnocchiReservations: Record<string, number>;
    rotiniReservations: Record<string, number>;
  };
};

export type RavioliNativeLaneSnapshot = {
  counter: number;
  balanceMutez: number;
  activeOperationCount: 0;
};

export type RavioliNativeReconciliationIo = {
  loadEvidence(runRoot: string): Promise<RavioliNativeEvidence>;
  readIntent(recoveryRoot: string): Promise<JsonObject>;
  readProgress(recoveryRoot: string): Promise<JsonObject | undefined>;
  readOperations(input: {
    initialCounter: number;
    calls: RavioliNativeRecoveryCall[];
    generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
  }): Promise<RavioliNativeOperation[]>;
  readState(): Promise<RavioliNativeState>;
  readLane(rpcUrl: string, expectedCounter: number): Promise<RavioliNativeLaneSnapshot>;
  writeReceipt(recoveryRoot: string, receipt: JsonObject): Promise<string>;
  now(): string;
};

export type RavioliNativeHandoffReadIo = {
  loadEvidence(runRoot: string): Promise<RavioliNativeEvidence>;
  readReceiptBytes(receiptPath: string): Promise<Uint8Array>;
  readOperationRows(operationHash: string): Promise<unknown>;
  readState(): Promise<RavioliNativeState>;
  readPublicBytes(url: string): Promise<Uint8Array>;
};

export type RavioliNativeRecoveryHandoff = {
  schema: "pastaprotocol-ravioli-native-recovery-handoff@1";
  gnocchi: {
    contract: string;
    creatorBalances: { "0": 2; "1": 2 };
    totalSupply: { "0": 8; "1": 5 };
    totalReserved: { "0": 0; "1": 0 };
  };
  rotini: {
    contract: string;
    completedProjectId: 0;
    completedProjectMinted: 3;
    completedProjectReserved: 0;
    freshProjectId: 3;
    freshProjectMaxSupply: 3;
    freshProjectMinted: 0;
    freshProjectReserved: 0;
    nextTokenId: 5;
    freshRavioliGeneratedTokenIds: [5, 6];
  };
  failedRouter: {
    contract: string;
    allWrapperSupplyBurned: true;
    allSalesInactive: true;
  };
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed >= 0, `${label} must be a non-negative safe integer`);
  return parsed;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return value;
}

export function assertRavioliNativeRecoveryCallMatches(
  actual: { contractAddress: string; entrypoint: string; payload: unknown },
  expected: RavioliNativeRecoveryCall,
): void {
  assert.deepEqual(
    canonical(actual),
    canonical({
      contractAddress: expected.contractAddress,
      entrypoint: expected.entrypoint,
      payload: expected.payload,
    }),
    "native recovery call differs from the exact canonical plan",
  );
}

function exactProjectSnapshot(minted: number, reserved: number): ProjectSnapshot {
  return {
    active: true,
    name: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.name,
    symbol: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.symbol,
    generatorUri: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.generator_uri,
    displayUri: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.display_uri,
    outputMode: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.output_mode,
    price: 0,
    treasury: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    maxSupply: 3,
    maxPerWallet: 3,
    reservationTtl: 3_600,
    minted,
    reserved,
  };
}

export function assertRavioliNativeRecoveryExecutionAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(
    environment[RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG],
    "1",
    `explicit ${RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG}=1 is required`,
  );
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "native recovery only permits Shadownet");
  const runRoot = environment[RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV} is required`);
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_NATIVE_RECOVERY_RUN_ID, "native recovery requires the exact accepted run");
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_ROUTER",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_CREATOR",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_KIT_ROOT",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_RESUME",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_CALL_START",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `native recovery forbids override ${forbidden}`);
  }
  return path.resolve(runRoot);
}

export function assertRavioliNativeRecoveryReconciliationAllowed(environment: Record<string, string | undefined>): string {
  assert.equal(
    environment[RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG],
    "1",
    `explicit ${RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG}=1 is required`,
  );
  assert.ok(!environment[RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG]?.trim(), "read-only native reconciliation forbids the execute flag");
  assert.equal((environment.TEZOS_NETWORK || "shadownet").toLowerCase(), "shadownet", "native reconciliation only permits Shadownet");
  const runRoot = environment[RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]?.trim();
  assert.ok(runRoot, `${RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV} is required`);
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_NATIVE_RECOVERY_RUN_ID, "native reconciliation requires the exact accepted run");
  for (const forbidden of [
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_ROUTER",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_CREATOR",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_KIT_ROOT",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_RESUME",
    "PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_CALL_START",
  ]) {
    assert.ok(!environment[forbidden]?.trim(), `native reconciliation forbids override ${forbidden}`);
  }
  return path.resolve(runRoot);
}

async function regularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) assert.fail(`quarantined evidence may not contain symlink ${absolute}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push(absolute);
      else assert.fail(`quarantined evidence contains unsupported file ${absolute}`);
    }
  }
  await walk(root);
  return result.sort();
}

export function assertRavioliNativeQuarantineFileHashes(actual: Record<string, string>): void {
  assert.deepEqual(
    Object.fromEntries(Object.entries(actual).sort(([left], [right]) => left.localeCompare(right))),
    Object.fromEntries(Object.entries(EXPECTED_QUARANTINE_FILE_HASHES).sort(([left], [right]) => left.localeCompare(right))),
    "quarantined Ravioli evidence file inventory changed",
  );
}

function validateKitAction(action: RavioliNativeKitAction, tokenId: number, index: number): void {
  if (action.kind === "escrow") {
    assert.equal(action.fa2, RAVIOLI_NATIVE_RECOVERY_GNOCCHI);
    assert.equal(action.amount, 1);
    assert.ok(action.tokenId === 0 || action.tokenId === 1);
    return;
  }
  if (action.kind === "allocated") {
    assert.equal(action.adapter, RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER);
    assert.equal(action.payloadCommitment, EMPTY_PAYLOAD_COMMITMENT);
    assert.equal(action.resourceId, tokenId === 4 ? 1 : 0);
    return;
  }
  assert.equal(action.kind, "generative", `kit ${tokenId} action ${index} kind drift`);
  assert.equal(action.adapter, RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER);
  assert.equal(action.payloadCommitment, null);
  assert.equal(action.resourceId, tokenId === 4 ? 1 : 0);
}

export function validateRavioliNativeKit(kit: RavioliNativeKit, tokenId: number): void {
  assert.equal(kit.schema, "pasta-ravioli-open-kit@3");
  assert.equal(kit.network, "shadownet");
  assert.equal(kit.contract, RAVIOLI_NATIVE_RECOVERY_ROUTER);
  assert.equal(kit.tokenId, tokenId);
  assert.equal(kit.mode, MODE_NAMES[tokenId]);
  assert.match(kit.manifestUri, /^ipfs:\/\/b[a-z2-7]{20,}$/);
  assert.equal(kit.recipes.length, tokenId === 1 ? 2 : 1);
  const expectedKinds = [
    ["escrow"],
    ["escrow"],
    ["allocated"],
    ["generative"],
    ["escrow", "allocated", "generative"],
  ][tokenId];
  kit.recipes.forEach((recipe, serial) => {
    assert.equal(recipe.serial, serial);
    assert.match(recipe.nonce, /^[0-9a-f]{64}$/);
    assert.deepEqual(recipe.actions.map((action) => action.kind), expectedKinds);
    recipe.actions.forEach((action, index) => validateKitAction(action, tokenId, index));
    if (tokenId === 1) assert.equal((recipe.actions[0] as Extract<RavioliNativeKitAction, { kind: "escrow" }>).tokenId, serial);
    if (tokenId === 0) assert.equal((recipe.actions[0] as Extract<RavioliNativeKitAction, { kind: "escrow" }>).tokenId, 0);
    if (tokenId === 4) assert.equal((recipe.actions[0] as Extract<RavioliNativeKitAction, { kind: "escrow" }>).tokenId, 1);
  });
}

async function readExactJson(filePath: string): Promise<{ value: JsonObject; bytes: Uint8Array; digest: string }> {
  const bytes = await readFile(filePath);
  return { value: JSON.parse(bytes.toString("utf8")), bytes, digest: sha256(bytes) };
}

export async function loadRavioliNativeRecoveryEvidence(runRoot: string): Promise<RavioliNativeEvidence> {
  assert.equal(path.basename(path.resolve(runRoot)), RAVIOLI_NATIVE_RECOVERY_RUN_ID);
  const proofRunsRoot = path.dirname(path.resolve(runRoot));
  const quarantineRoot = path.join(proofRunsRoot, "discarded", RAVIOLI_NATIVE_RECOVERY_QUARANTINE);
  const quarantineStat = await stat(quarantineRoot);
  assert.ok(quarantineStat.isDirectory(), "exact quarantined Ravioli lane is missing");
  const rejectionPath = path.join(quarantineRoot, "rejection.json");
  const rejection = await readExactJson(rejectionPath);
  assert.equal(rejection.digest, EXPECTED_REJECTION_SHA256, "quarantined rejection bytes changed");
  assert.equal(rejection.value.status, "REJECTED-AFTER-APPLIED-WRITES");
  assert.equal(rejection.value.contracts?.router?.address, RAVIOLI_NATIVE_RECOVERY_ROUTER);
  assert.equal(rejection.value.acceptance?.nativeAssetRecoveryRequired, true);
  assert.equal(rejection.value.evidence?.fileCountBeforeRejectionRecord, 36);
  assert.equal(rejection.value.evidence?.relativeInventorySha256BeforeRejectionRecord, EXPECTED_QUARANTINE_INVENTORY_SHA256);
  const files = await regularFiles(quarantineRoot);
  assert.equal(files.length, 37, "quarantined Ravioli lane file count drift");
  const quarantineFileHashes = Object.fromEntries(await Promise.all(
    files
      .filter((filePath) => path.resolve(filePath) !== path.resolve(rejectionPath))
      .map(async (filePath) => [path.relative(quarantineRoot, filePath).split(path.sep).join("/"), sha256(await readFile(filePath))] as const),
  ));
  assertRavioliNativeQuarantineFileHashes(quarantineFileHashes);

  const kits: RavioliNativeKit[] = [];
  const kitHashes: string[] = [];
  for (let tokenId = 0; tokenId < 5; tokenId += 1) {
    const kitPath = path.join(quarantineRoot, "artifacts", "open-kits", `ravioli-open-kit-${tokenId}.json`);
    const loaded = await readExactJson(kitPath);
    assert.equal(loaded.digest, EXPECTED_KIT_HASHES[tokenId], `open kit ${tokenId} bytes changed`);
    const kit = loaded.value as RavioliNativeKit;
    validateRavioliNativeKit(kit, tokenId);
    kits.push(kit);
    kitHashes.push(loaded.digest);
  }
  const progress = await readExactJson(path.join(quarantineRoot, "artifacts", "open-kits", "open-kit-capture-progress.json"));
  assert.equal(progress.digest, EXPECTED_OPEN_KIT_PROGRESS_SHA256, "open-kit capture log bytes changed");
  assert.equal(progress.value.status, "CAPTURED");
  assert.deepEqual(progress.value.openKits?.map((entry: JsonObject) => entry.sha256), kitHashes);

  const acceptedPaths: Record<keyof typeof EXPECTED_ACCEPTED_HASHES, string> = {
    gnocchiManifestSha256: path.join(runRoot, "gnocchi", "manifest.json"),
    gnocchiReceiptSha256: path.join(runRoot, "gnocchi", "artifacts", "gnocchi-ui-live-run.json"),
    gnocchiHistoricalSha256: path.join(runRoot, "gnocchi", "artifacts", "gnocchi-proof-time-indexer-snapshot.json"),
    rotiniManifestSha256: path.join(runRoot, "rotini", "manifest.json"),
    rotiniReceiptSha256: path.join(runRoot, "rotini", "artifacts", "rotini-ui-live-run.json"),
    administrativeRecoveryReceiptSha256: path.join(runRoot, "ravioli-dependency-recovery", "artifacts", "gnocchi-inventory-recovery.json"),
  };
  for (const [key, expected] of Object.entries(EXPECTED_ACCEPTED_HASHES) as Array<[keyof typeof EXPECTED_ACCEPTED_HASHES, string]>) {
    assert.equal(sha256(await readFile(acceptedPaths[key])), expected, `${key} changed`);
  }
  const gnocchiManifest = (await readExactJson(acceptedPaths.gnocchiManifestSha256)).value;
  const rotiniManifest = (await readExactJson(acceptedPaths.rotiniManifestSha256)).value;
  assert.equal(gnocchiManifest.app, "gnocchi");
  assert.equal(gnocchiManifest.contracts?.[0]?.address, RAVIOLI_NATIVE_RECOVERY_GNOCCHI);
  assert.equal(rotiniManifest.app, "rotini");
  assert.equal(rotiniManifest.contracts?.[0]?.address, RAVIOLI_NATIVE_RECOVERY_ROTINI);
  return {
    quarantineRoot,
    rejectionSha256: rejection.digest,
    inventorySha256: EXPECTED_QUARANTINE_INVENTORY_SHA256,
    quarantineFileHashes,
    kitHashes,
    progressSha256: progress.digest,
    kits,
    acceptedHashes: EXPECTED_ACCEPTED_HASHES,
    acceptedPaths,
  };
}

function nestedPair(values: JsonObject[]): JsonObject {
  assert.ok(values.length >= 2);
  let value: JsonObject = { prim: "Pair", args: [values.at(-2), values.at(-1)] };
  for (let index = values.length - 3; index >= 0; index -= 1) value = { prim: "Pair", args: [values[index], value] };
  return value;
}

function nestedBytesType(length: number): JsonObject {
  assert.ok(length >= 2);
  let value: JsonObject = { prim: "pair", args: [{ prim: "bytes" }, { prim: "bytes" }] };
  for (let index = length - 3; index >= 0; index -= 1) value = { prim: "pair", args: [{ prim: "bytes" }, value] };
  return value;
}

function exactGeneratedPayload(input: {
  artifactSha256: string;
  artifactUri: string;
  metadataUri: string;
}): string {
  const ordered = [
    input.artifactSha256,
    utf8ToHex(input.artifactUri),
    utf8ToHex(input.artifactUri),
    utf8ToHex(input.metadataUri),
    utf8ToHex("image/png"),
    utf8ToHex(input.artifactUri),
  ].map((bytes) => ({ bytes }));
  return packDataBytes(nestedPair(ordered) as never, nestedBytesType(ordered.length) as never).bytes;
}

export async function prepareRavioliNativeGeneratedOutput(input: {
  tokenId: 3 | 4;
  pinBytes: (input: { bytes: Uint8Array; fileName: string; mimeType: string }) => Promise<IpfsPinnedProof>;
  pinJson: (input: { value: JsonObject; fileName: string }) => Promise<IpfsPinnedProof>;
  packer?: Pick<MichelCodecPacker, "packData">;
}): Promise<RavioliNativeGeneratedOutput> {
  const artifactFileName = `ravioli-generated-${input.tokenId}.png`;
  const artifactBytes = Buffer.concat([PNG_BYTES, Buffer.from(`ravioli-generated-${input.tokenId}`, "utf8")]);
  const artifact = await input.pinBytes({ bytes: artifactBytes, fileName: artifactFileName, mimeType: "image/png" });
  assert.equal(artifact.sha256, sha256(artifactBytes));
  assert.equal(artifact.publicGatewayVerified, true);
  const metadata: JsonObject = {
    name: `Ravioli UI-LIVE ${MODE_NAMES[input.tokenId]} #1`,
    decimals: 0,
    artifactUri: artifact.uri,
    displayUri: artifact.uri,
    thumbnailUri: artifact.uri,
    creators: [RAVIOLI_NATIVE_RECOVERY_CREATOR],
    formats: [{ uri: artifact.uri, mimeType: "image/png" }],
    ravioli: { generatedAtOpen: true },
  };
  const metadataPin = await input.pinJson({ value: metadata, fileName: "ravioli-generated-token.json" });
  assert.equal(metadataPin.sha256, sha256(deterministicJsonBytes(metadata)));
  assert.equal(metadataPin.publicGatewayVerified, true);
  const ordered = [sha256(artifactBytes), utf8ToHex(artifact.uri), utf8ToHex(artifact.uri), utf8ToHex(metadataPin.uri), utf8ToHex("image/png"), utf8ToHex(artifact.uri)].map((bytes) => ({ bytes }));
  const packed = await (input.packer || new MichelCodecPacker()).packData({
    data: nestedPair(ordered),
    type: nestedBytesType(ordered.length),
  } as never);
  assert.match(packed.packed, /^[0-9a-f]+$/);
  assert.equal(packed.packed, exactGeneratedPayload({ artifactSha256: artifact.sha256, artifactUri: artifact.uri, metadataUri: metadataPin.uri }));
  return {
    tokenId: input.tokenId,
    artifactFileName,
    artifactBytes: Uint8Array.from(artifactBytes),
    artifact,
    metadata,
    metadataPin,
    payload: packed.packed,
  };
}

function openAction(action: RavioliNativeKitAction, generated?: RavioliNativeGeneratedOutput): JsonObject {
  if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
  if (action.kind === "allocated") {
    return { allocated_mint: { adapter: action.adapter, resource_id: action.resourceId, payload: "", payload_commitment: action.payloadCommitment } };
  }
  assert.ok(generated, "generative recipe requires exact prepared output");
  return { generative_mint: { adapter: action.adapter, resource_id: action.resourceId, payload: generated.payload, payload_commitment: null } };
}

export function ravioliNativeRecoveryCalls(
  evidence: Pick<RavioliNativeEvidence, "kits">,
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput],
): RavioliNativeRecoveryCall[] {
  assert.deepEqual(generated.map((entry) => entry.tokenId), [3, 4]);
  const selections = [
    { tokenId: 1, serial: 1 },
    { tokenId: 2, serial: 0 },
    { tokenId: 3, serial: 0 },
    { tokenId: 4, serial: 0 },
  ] as const;
  const opens = selections.map(({ tokenId, serial }) => {
    const kit = evidence.kits[tokenId];
    validateRavioliNativeKit(kit, tokenId);
    const recipe = kit.recipes[serial];
    assert.ok(recipe && recipe.serial === serial);
    const output = tokenId >= 3 ? generated[tokenId - 3] : undefined;
    return {
      contractAddress: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      entrypoint: "open_pack" as const,
      payload: {
        token_id: tokenId,
        nonce: recipe.nonce,
        actions: recipe.actions.map((action) => openAction(action, output)),
      },
      purpose: `natively open failed-router wrapper token ${tokenId} serial ${serial}`,
    };
  });
  const saleClosures = [0, 1, 2, 3, 4].map((tokenId) => ({
    contractAddress: RAVIOLI_NATIVE_RECOVERY_ROUTER,
    entrypoint: "set_sale_active" as const,
    payload: { token_id: tokenId, active: false },
    purpose: `deactivate failed-router sale ${tokenId}`,
  }));
  const clone = {
    contractAddress: RAVIOLI_NATIVE_RECOVERY_ROTINI,
    entrypoint: "create_project" as const,
    payload: { ...RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE },
    purpose: "create fresh Rotini project 3 by exactly cloning accepted PNG project 0",
  };
  // Close every public sale before touching a wrapper. This removes the only
  // external race that could transfer an irreplaceable recovery wrapper while
  // the strict creator lane is progressing.
  const calls = [...saleClosures, ...opens, clone];
  assert.equal(calls.length, 10);
  return calls;
}

export function ravioliNativeRecoverySendOptions(estimate: JsonObject): RavioliNativeSendOptions {
  const rawGas = safeInteger(estimate.gasLimit, "estimated gas limit");
  const rawStorage = safeInteger(estimate.storageLimit, "estimated storage limit");
  const suggested = safeInteger(estimate.suggestedFeeMutez, "suggested fee");
  const minimal = safeInteger(estimate.minimalFeeMutez, "minimal fee");
  safeInteger(estimate.burnFeeMutez, "burn fee");
  assert.ok(rawGas > 0 && rawGas <= MAX_GAS_LIMIT, "native recovery estimate exceeds gas policy");
  assert.ok(rawStorage <= MAX_STORAGE_LIMIT, "native recovery estimate exceeds storage policy");
  const gasPadding = Math.max(1_000, Math.ceil(rawGas / 10));
  const gasLimit = rawGas + gasPadding;
  const storageLimit = rawStorage + 256;
  assert.ok(gasLimit <= MAX_GAS_LIMIT, "padded native recovery gas exceeds policy");
  assert.ok(storageLimit <= MAX_STORAGE_LIMIT, "padded native recovery storage exceeds policy");
  const fee = Math.max(suggested, minimal) + Math.ceil(gasPadding / 10) + FEE_HEADROOM_MUTEZ;
  assert.ok(fee <= MAX_FEE_MUTEZ, "native recovery fee exceeds policy");
  return { amount: 0, mutez: true, fee, gasLimit, storageLimit };
}

export function ravioliNativeRecoveryAggregateCostMutez(estimates: readonly RavioliNativeEstimate[]): number {
  assert.equal(estimates.length, 10, "native recovery aggregate cost requires all ten estimates");
  let total = 0;
  estimates.forEach((estimate, index) => {
    assert.deepEqual(estimate.sendOptions, ravioliNativeRecoverySendOptions(estimate.raw), `estimate ${index} send options drift`);
    const operationCost = estimate.sendOptions.fee + safeInteger(estimate.raw.burnFeeMutez, `estimate ${index} burn fee`);
    assert.ok(Number.isSafeInteger(operationCost), `estimate ${index} cost exceeds safe integer range`);
    total += operationCost;
    assert.ok(Number.isSafeInteger(total), "native recovery aggregate cost exceeds safe integer range");
  });
  assert.ok(total <= RECOVERY_OPERATION_RESERVE_MUTEZ, "native recovery aggregate fee and burn cost exceeds the fixed reserve");
  return total;
}

function bridgeRequest(
  action: "estimate_call" | "call",
  id: string,
  call: RavioliNativeRecoveryCall,
  sendOptions: RavioliNativeSendOptions | { amount: 0; mutez: true },
): PastaUiLiveBridgeRequest {
  return { schema: PASTA_UI_LIVE_BRIDGE_SCHEMA, id, action, payload: { call, sendOptions } };
}

export async function executeRavioliNativeRecoveryPlan(input: {
  session: Pick<TaquitoPastaUiLiveSession, "handle">;
  calls: RavioliNativeRecoveryCall[];
  beforeSubmit: (estimates: RavioliNativeEstimate[]) => Promise<void>;
  afterAppliedCall?: (index: number, call: RavioliNativeRecoveryCall) => Promise<void>;
}): Promise<RavioliNativeEstimate[]> {
  assert.equal(input.calls.length, 10, "native recovery requires exactly ten calls");
  const estimates: RavioliNativeEstimate[] = [];
  for (let index = 0; index < input.calls.length; index += 1) {
    const call = input.calls[index];
    const response = await input.session.handle(bridgeRequest("estimate_call", `native-recovery-estimate-${index}`, call, { amount: 0, mutez: true })) as JsonObject;
    assert.equal(response.contractAddress, call.contractAddress, `estimate ${index} target drift`);
    assert.equal(response.entrypoint, call.entrypoint, `estimate ${index} entrypoint drift`);
    const raw = {
      gasLimit: safeInteger(response.estimate?.gasLimit, `estimate ${index} gas`),
      storageLimit: safeInteger(response.estimate?.storageLimit, `estimate ${index} storage`),
      suggestedFeeMutez: safeInteger(response.estimate?.suggestedFeeMutez, `estimate ${index} suggested fee`),
      minimalFeeMutez: safeInteger(response.estimate?.minimalFeeMutez, `estimate ${index} minimal fee`),
      burnFeeMutez: safeInteger(response.estimate?.burnFeeMutez, `estimate ${index} burn fee`),
    };
    estimates.push({ call, raw, sendOptions: ravioliNativeRecoverySendOptions(raw) });
  }
  assert.equal(estimates.length, input.calls.length, "all estimates must finish before native recovery submission");
  await input.beforeSubmit(estimates);
  for (let index = 0; index < input.calls.length; index += 1) {
    await input.session.handle(bridgeRequest("call", `native-recovery-call-${index}`, input.calls[index], estimates[index].sendOptions));
    await input.afterAppliedCall?.(index, input.calls[index]);
  }
  return estimates;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchPublicBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function bigMapRows(id: unknown): Promise<JsonObject[]> {
  const bigMapId = safeInteger(id, "TzKT big-map id");
  const rows = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/bigmaps/${bigMapId}/keys?active=true&limit=10000`);
  assert.ok(Array.isArray(rows), `TzKT big-map ${bigMapId} response must be an array`);
  return rows;
}

function natByKey(rows: JsonObject[], key: number, label: string): number {
  const match = rows.find((row) => row?.active === true && Number(row?.key) === key);
  return match ? safeInteger(match.value, `${label} ${key}`) : 0;
}

function ledgerBalance(rows: JsonObject[], owner: string, tokenId: number, label: string): number {
  const match = rows.find((row) => row?.active === true && row?.key?.owner === owner && Number(row?.key?.token_id) === tokenId);
  return match ? safeInteger(match.value, `${label} ${owner}/${tokenId}`) : 0;
}

function rowValue(rows: JsonObject[], key: number): JsonObject | null {
  return rows.find((row) => row?.active === true && Number(row?.key) === key)?.value || null;
}

function hexUri(value: unknown, label: string): string {
  const hex = String(value || "");
  assert.match(hex, /^(?:[0-9a-f]{2})*$/, `${label} is not hex`);
  return Buffer.from(hex, "hex").toString("utf8");
}

function projectSnapshot(value: JsonObject | null): ProjectSnapshot | null {
  if (!value) return null;
  return {
    active: value.active === true,
    name: String(value.name || ""),
    symbol: String(value.symbol || ""),
    generatorUri: String(value.generator_uri || ""),
    displayUri: String(value.display_uri || ""),
    outputMode: String(value.output_mode || ""),
    price: safeInteger(value.price, "Rotini project price"),
    treasury: String(value.treasury || ""),
    maxSupply: safeInteger(value.max_supply, "Rotini project max supply"),
    maxPerWallet: safeInteger(value.max_per_wallet, "Rotini project wallet cap"),
    reservationTtl: safeInteger(value.reservation_ttl, "Rotini reservation ttl"),
    minted: safeInteger(value.minted, "Rotini project minted"),
    reserved: safeInteger(value.reserved, "Rotini project reserved"),
  };
}

function generatedTokenSnapshot(input: {
  tokenId: number;
  ledger: JsonObject[];
  supply: JsonObject[];
  metadata: JsonObject[];
  artifacts: JsonObject[];
}): GeneratedTokenSnapshot {
  const metadata = rowValue(input.metadata, input.tokenId);
  const artifact = rowValue(input.artifacts, input.tokenId);
  if (!metadata && !artifact) return null;
  assert.ok(metadata && artifact, `Rotini token ${input.tokenId} metadata/artifact presence differs`);
  const tokenInfo = metadata.token_info || metadata;
  return {
    ownerBalance: ledgerBalance(input.ledger, RAVIOLI_NATIVE_RECOVERY_CREATOR, input.tokenId, "Rotini ledger"),
    totalSupply: natByKey(input.supply, input.tokenId, "Rotini supply"),
    metadataUri: hexUri(tokenInfo[""], `Rotini token ${input.tokenId} metadata URI`),
    artifactUri: hexUri(artifact.artifact_uri, `Rotini token ${input.tokenId} artifact URI`),
    displayUri: hexUri(artifact.display_uri, `Rotini token ${input.tokenId} display URI`),
    thumbnailUri: hexUri(artifact.thumbnail_uri, `Rotini token ${input.tokenId} thumbnail URI`),
    mimeType: hexUri(artifact.mime_type, `Rotini token ${input.tokenId} MIME type`),
    artifactHash: String(artifact.artifact_hash || ""),
  };
}

function adapterReservations(rows: JsonObject[]): Record<string, number> {
  const pairs: Array<[string, number]> = rows
    .filter((row) => row?.active === true)
    .map((row): [string, number] => [
      `${safeInteger(row.key?.pack_token_id, "adapter reservation pack token")}:${safeInteger(row.key?.resource_id, "adapter reservation resource")}`,
      safeInteger(row.value, "adapter reservation amount"),
    ]);
  return Object.fromEntries(pairs.sort((left, right) => left[0].localeCompare(right[0])));
}

export async function readRavioliNativeRecoveryState(): Promise<RavioliNativeState> {
  const base = normalizeBase(SHADOWNET_TZKT_API);
  const [head, routerContract, routerStorage, gnocchiContract, gnocchiStorage, rotiniContract, rotiniStorage, gnocchiAdapterStorage, rotiniAdapterStorage] = await Promise.all([
    fetchJson(`${base}/head`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_ROUTER}`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_ROUTER}/storage`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_GNOCCHI}`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_GNOCCHI}/storage`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_ROTINI}`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_ROTINI}/storage`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER}/storage`),
    fetchJson(`${base}/contracts/${RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER}/storage`),
  ]);
  for (const [label, contract] of [["router", routerContract], ["Gnocchi", gnocchiContract], ["Rotini", rotiniContract]] as const) {
    assert.equal(contract?.kind, "asset", `${label} is not indexed as an asset`);
    assert.ok(contract?.tzips?.map((entry: unknown) => String(entry).toLowerCase()).includes("fa2"), `${label} is not indexed as FA2`);
  }
  assert.equal(routerStorage.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(gnocchiStorage.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(rotiniStorage.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(gnocchiAdapterStorage.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(rotiniAdapterStorage.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);

  const [routerLedger, routerMinted, routerOpened, routerSupply, routerSales, gnocchiLedger, gnocchiSupply, gnocchiReserved, rotiniLedger, rotiniSupply, rotiniProjects, rotiniMetadata, rotiniArtifacts, gnocchiAdapterReservationRows, rotiniAdapterReservationRows] = await Promise.all([
    bigMapRows(routerStorage.ledger),
    bigMapRows(routerStorage.minted),
    bigMapRows(routerStorage.opened),
    bigMapRows(routerStorage.total_supply),
    bigMapRows(routerStorage.sales),
    bigMapRows(gnocchiStorage.ledger),
    bigMapRows(gnocchiStorage.total_supply),
    bigMapRows(gnocchiStorage.total_reserved),
    bigMapRows(rotiniStorage.ledger),
    bigMapRows(rotiniStorage.total_supply),
    bigMapRows(rotiniStorage.projects),
    bigMapRows(rotiniStorage.token_metadata),
    bigMapRows(rotiniStorage.token_artifact),
    bigMapRows(gnocchiAdapterStorage.reservations),
    bigMapRows(rotiniAdapterStorage.reservations),
  ]);

  const tokenRecord = (read: (tokenId: number) => number): Record<string, number> => Object.fromEntries([0, 1, 2, 3, 4].map((tokenId) => [String(tokenId), read(tokenId)]));
  const sales = Object.fromEntries([0, 1, 2, 3, 4].map((tokenId) => {
    const sale = rowValue(routerSales, tokenId);
    assert.ok(sale, `failed router sale ${tokenId} is missing`);
    return [String(tokenId), {
      active: sale.active === true,
      remaining: safeInteger(sale.remaining, `sale ${tokenId} remaining`),
      price: safeInteger(sale.price, `sale ${tokenId} price`),
      seller: String(sale.seller || ""),
      treasury: String(sale.treasury || ""),
    }];
  }));
  const project0 = projectSnapshot(rowValue(rotiniProjects, 0));
  assert.ok(project0, "accepted Rotini project 0 is missing");
  return {
    level: safeInteger(head.level, "TzKT level"),
    router: {
      administrator: routerStorage.administrator,
      nextTokenId: safeInteger(routerStorage.next_token_id, "router next token id"),
      creatorBalances: tokenRecord((tokenId) => ledgerBalance(routerLedger, RAVIOLI_NATIVE_RECOVERY_CREATOR, tokenId, "router ledger")),
      minted: tokenRecord((tokenId) => natByKey(routerMinted, tokenId, "router minted")),
      opened: tokenRecord((tokenId) => natByKey(routerOpened, tokenId, "router opened")),
      totalSupply: tokenRecord((tokenId) => natByKey(routerSupply, tokenId, "router supply")),
      sales,
    },
    gnocchi: {
      administrator: gnocchiStorage.administrator,
      creatorBalances: Object.fromEntries([0, 1].map((tokenId) => [String(tokenId), ledgerBalance(gnocchiLedger, RAVIOLI_NATIVE_RECOVERY_CREATOR, tokenId, "Gnocchi creator ledger")])),
      routerBalances: Object.fromEntries([0, 1].map((tokenId) => [String(tokenId), ledgerBalance(gnocchiLedger, RAVIOLI_NATIVE_RECOVERY_ROUTER, tokenId, "Gnocchi router ledger")])),
      totalSupply: Object.fromEntries([0, 1].map((tokenId) => [String(tokenId), natByKey(gnocchiSupply, tokenId, "Gnocchi supply")])),
      totalReserved: Object.fromEntries([0, 1].map((tokenId) => [String(tokenId), natByKey(gnocchiReserved, tokenId, "Gnocchi reserved")])),
    },
    rotini: {
      administrator: rotiniStorage.administrator,
      nextTokenId: safeInteger(rotiniStorage.next_token_id, "Rotini next token id"),
      nextProjectId: safeInteger(rotiniStorage.next_project_id, "Rotini next project id"),
      project0,
      project3: projectSnapshot(rowValue(rotiniProjects, 3)),
      generatedTokens: {
        "3": generatedTokenSnapshot({ tokenId: 3, ledger: rotiniLedger, supply: rotiniSupply, metadata: rotiniMetadata, artifacts: rotiniArtifacts }),
        "4": generatedTokenSnapshot({ tokenId: 4, ledger: rotiniLedger, supply: rotiniSupply, metadata: rotiniMetadata, artifacts: rotiniArtifacts }),
      },
    },
    adapters: {
      gnocchiReservations: adapterReservations(gnocchiAdapterReservationRows),
      rotiniReservations: adapterReservations(rotiniAdapterReservationRows),
    },
  };
}

function exactSale(active: boolean, remaining: number, price: number) {
  return {
    active,
    remaining,
    price,
    seller: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    treasury: RAVIOLI_NATIVE_RECOVERY_CREATOR,
  };
}

export function assertRavioliNativeRecoveryBeforeState(state: RavioliNativeState): void {
  assert.ok(Number.isSafeInteger(state.level) && state.level > 0);
  assert.deepEqual(state.router, {
    administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    nextTokenId: 5,
    creatorBalances: { "0": 0, "1": 1, "2": 1, "3": 1, "4": 1 },
    minted: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
    opened: { "0": 1, "1": 1, "2": 0, "3": 0, "4": 0 },
    totalSupply: { "0": 0, "1": 1, "2": 1, "3": 1, "4": 1 },
    sales: {
      "0": exactSale(true, 0, 0),
      "1": exactSale(true, 1, 1),
      "2": exactSale(true, 1, 1),
      "3": exactSale(true, 1, 1),
      "4": exactSale(true, 1, 1),
    },
  });
  assert.deepEqual(state.gnocchi, {
    administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    creatorBalances: { "0": 0, "1": 0 },
    routerBalances: { "0": 0, "1": 2 },
    totalSupply: { "0": 6, "1": 5 },
    totalReserved: { "0": 2, "1": 0 },
  });
  assert.equal(state.rotini.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(state.rotini.nextTokenId, 3);
  assert.equal(state.rotini.nextProjectId, 3);
  assert.deepEqual(state.rotini.project0, exactProjectSnapshot(1, 2));
  assert.equal(state.rotini.project3, null);
  assert.deepEqual(state.rotini.generatedTokens, { "3": null, "4": null });
  assert.deepEqual(state.adapters, {
    gnocchiReservations: { "2:0": 1, "4:1": 1 },
    rotiniReservations: { "3:0": 1, "4:1": 1 },
  });
}

export function assertRavioliNativeRecoverySalesClosedState(state: RavioliNativeState): void {
  for (const tokenId of [0, 1, 2, 3, 4]) {
    assert.equal(state.router.sales[String(tokenId)]?.active, false, `failed-router sale ${tokenId} remained active`);
  }
  const normalized = structuredClone(state);
  for (const tokenId of [0, 1, 2, 3, 4]) normalized.router.sales[String(tokenId)].active = true;
  assertRavioliNativeRecoveryBeforeState(normalized);
}

export function assertRavioliNativeRecoveryAfterState(
  state: RavioliNativeState,
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput],
): void {
  assert.ok(Number.isSafeInteger(state.level) && state.level > 0);
  assert.deepEqual(state.router, {
    administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    nextTokenId: 5,
    creatorBalances: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 },
    minted: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
    opened: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
    totalSupply: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 },
    sales: {
      "0": exactSale(false, 0, 0),
      "1": exactSale(false, 1, 1),
      "2": exactSale(false, 1, 1),
      "3": exactSale(false, 1, 1),
      "4": exactSale(false, 1, 1),
    },
  });
  assert.deepEqual(state.gnocchi, {
    administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    creatorBalances: { "0": 2, "1": 2 },
    routerBalances: { "0": 0, "1": 0 },
    totalSupply: { "0": 8, "1": 5 },
    totalReserved: { "0": 0, "1": 0 },
  });
  assert.equal(state.rotini.administrator, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(state.rotini.nextTokenId, 5);
  assert.equal(state.rotini.nextProjectId, 4);
  assert.deepEqual(state.rotini.project0, exactProjectSnapshot(3, 0));
  assert.deepEqual(state.rotini.project3, exactProjectSnapshot(0, 0));
  for (const output of generated) {
    assert.deepEqual(state.rotini.generatedTokens[String(output.tokenId)], {
      ownerBalance: 1,
      totalSupply: 1,
      metadataUri: output.metadataPin.uri,
      artifactUri: output.artifact.uri,
      displayUri: output.artifact.uri,
      thumbnailUri: output.artifact.uri,
      mimeType: "image/png",
      artifactHash: output.artifact.sha256,
    });
  }
  assert.deepEqual(state.adapters, { gnocchiReservations: {}, rotiniReservations: {} });
}

async function pollRavioliNativeRecoveryAfterState(
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput],
  options: { attempts?: number; delayMs?: number } = {},
): Promise<RavioliNativeState> {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 4_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const state = await readRavioliNativeRecoveryState();
      assertRavioliNativeRecoveryAfterState(state, generated);
      return state;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`native recovery terminal state did not converge: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function pollRavioliNativeRecoverySalesClosedState(
  minimumLevel: number,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<RavioliNativeState> {
  const attempts = options.attempts ?? 15;
  const delayMs = options.delayMs ?? 4_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const state = await readRavioliNativeRecoveryState();
      assert.ok(state.level >= minimumLevel, "sale-closure state predates native recovery preflight");
      assertRavioliNativeRecoverySalesClosedState(state);
      return state;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`native recovery sale-closure state did not converge: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function readRpcCounter(rpcUrl: string): Promise<number> {
  const response = await fetch(`${normalizeBase(rpcUrl)}/chains/main/blocks/head/context/contracts/${RAVIOLI_NATIVE_RECOVERY_CREATOR}/counter`, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `${rpcUrl} counter returned HTTP ${response.status}`);
  return safeInteger(JSON.parse(await response.text()), `${rpcUrl} creator counter`);
}

async function assertRavioliNativeSignerLaneClear(rpcUrl: string, expectedCounter?: number): Promise<RavioliNativeLaneSnapshot> {
  const base = normalizeBase(rpcUrl);
  const [chainResponse, balanceResponse, counter, mempool] = await Promise.all([
    fetch(`${base}/chains/main/chain_id`, { signal: AbortSignal.timeout(30_000) }),
    fetch(`${base}/chains/main/blocks/head/context/contracts/${RAVIOLI_NATIVE_RECOVERY_CREATOR}/balance`, { signal: AbortSignal.timeout(30_000) }),
    readRpcCounter(rpcUrl),
    fetchJson(`${base}/chains/main/mempool/pending_operations`),
  ]);
  assert.ok(chainResponse.ok && balanceResponse.ok);
  assert.equal(JSON.parse(await chainResponse.text()), SHADOWNET_CHAIN_ID);
  if (expectedCounter !== undefined) assert.equal(counter, expectedCounter, `${rpcUrl} creator counter drift`);
  const active = ["applied", "validated", "branch_delayed", "unprocessed"]
    .flatMap((bucket) => Array.isArray(mempool?.[bucket]) ? mempool[bucket] : [])
    .map((entry: JsonObject | [string, JsonObject]) => Array.isArray(entry) ? entry[1] : entry)
    .filter((operation: JsonObject) => operation?.contents?.some((content: JsonObject) => content?.source === RAVIOLI_NATIVE_RECOVERY_CREATOR));
  assert.equal(active.length, 0, `${rpcUrl} has an active creator operation`);
  return {
    counter,
    balanceMutez: safeInteger(JSON.parse(await balanceResponse.text()), `${rpcUrl} creator balance`),
    activeOperationCount: 0,
  };
}

type InternalExpectation = {
  sender: string;
  target: string;
  entrypoint: string;
  payload: JsonObject | JsonObject[];
};

function expectedInternalOperations(
  call: RavioliNativeRecoveryCall,
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput],
): InternalExpectation[] {
  if (call.entrypoint !== "open_pack") return [];
  const tokenId = safeInteger(call.payload.token_id, "open token id");
  const serial = tokenId === 1 ? 1 : 0;
  const transfer = (assetTokenId: number): InternalExpectation => ({
    sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
    target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
    entrypoint: "transfer",
    payload: [{
      from_: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      txs: [{ to_: RAVIOLI_NATIVE_RECOVERY_CREATOR, token_id: assetTokenId, amount: 1 }],
    }],
  });
  const allocated = (resourceId: number): InternalExpectation[] => [
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER,
      entrypoint: "fulfill",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        resource_id: resourceId,
        payload: "",
      },
    },
    {
      sender: RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER,
      target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
      entrypoint: "mint_reserved",
      payload: { to_: RAVIOLI_NATIVE_RECOVERY_CREATOR, token_id: 0, amount: 1 },
    },
  ];
  const generative = (resourceId: number, output: RavioliNativeGeneratedOutput): InternalExpectation[] => [
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      target: RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER,
      entrypoint: "fulfill",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        resource_id: resourceId,
        payload: output.payload,
      },
    },
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER,
      target: RAVIOLI_NATIVE_RECOVERY_ROTINI,
      entrypoint: "mint_pack_iteration",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        project_id: 0,
        metadata_uri: utf8ToHex(output.metadataPin.uri),
        artifact_uri: utf8ToHex(output.artifact.uri),
        display_uri: utf8ToHex(output.artifact.uri),
        thumbnail_uri: utf8ToHex(output.artifact.uri),
        mime_type: utf8ToHex("image/png"),
        artifact_hash: output.artifact.sha256,
      },
    },
  ];
  if (tokenId === 1) return [transfer(1)];
  if (tokenId === 2) return allocated(0);
  if (tokenId === 3) return generative(0, generated[0]);
  assert.equal(tokenId, 4);
  return [transfer(1), ...allocated(1), ...generative(1, generated[1])];
}

export function validateRavioliNativeOperationRows(
  rows: unknown,
  input: {
    operationHash: string;
    expectedCounter: number;
    call: RavioliNativeRecoveryCall;
    generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
  },
): RavioliNativeOperation {
  assert.equal(validateOperation(input.operationHash), ValidationResult.VALID, "native recovery operation hash is invalid");
  assert.ok(Array.isArray(rows), "TzKT native recovery operation response must be an array");
  const allRows = rows as JsonObject[];
  assert.ok(allRows.length >= 1, "TzKT native recovery operation response is empty");
  assert.ok(allRows.every((row) => row?.hash === input.operationHash && row?.status === "applied"), "native recovery operation tree is not wholly applied");
  const topRows = allRows.filter((row) => row?.nonce == null);
  assert.equal(topRows.length, 1, "native recovery must have one top-level transaction");
  const top = topRows[0];
  assert.equal(top?.sender?.address, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  assert.equal(top?.target?.address, input.call.contractAddress);
  assert.equal(top?.parameter?.entrypoint, input.call.entrypoint);
  assert.equal(safeInteger(top.counter, "native recovery counter"), input.expectedCounter);
  assert.equal(safeInteger(top.amount, "native recovery tez amount"), 0);
  assert.deepEqual(canonical(top.parameter.value), canonical(input.call.payload), "native recovery top-level payload drift");
  const expectedInternal = expectedInternalOperations(input.call, input.generated);
  const actualInternal = allRows.filter((row) => row?.nonce != null);
  assert.equal(actualInternal.length, expectedInternal.length, `native recovery ${input.call.entrypoint} internal operation count drift`);
  const unmatched = [...actualInternal];
  for (const expected of expectedInternal) {
    const index = unmatched.findIndex((row) =>
      row?.sender?.address === expected.sender &&
      row?.target?.address === expected.target &&
      row?.parameter?.entrypoint === expected.entrypoint &&
      JSON.stringify(canonical(row?.parameter?.value)) === JSON.stringify(canonical(expected.payload)),
    );
    assert.ok(index >= 0, `native recovery operation lacks exact internal ${expected.sender} -> ${expected.target}%${expected.entrypoint}`);
    const [row] = unmatched.splice(index, 1);
    assert.equal(safeInteger(row.amount, `internal ${expected.entrypoint} amount`), 0);
    assert.equal(row?.initiator?.address, RAVIOLI_NATIVE_RECOVERY_CREATOR);
  }
  assert.equal(unmatched.length, 0, "native recovery has unexpected internal operations");
  const level = safeInteger(top.level, "native recovery level");
  assert.ok(level > 0);
  const timestamp = String(top.timestamp || "");
  assert.ok(Number.isFinite(Date.parse(timestamp)), "native recovery timestamp is invalid");
  return {
    hash: input.operationHash,
    counter: input.expectedCounter,
    level,
    timestamp,
    explorerUrl: `https://shadownet.tzkt.io/${input.operationHash}`,
    call: input.call,
    internalEntrypoints: actualInternal.map((row) => String(row?.parameter?.entrypoint || "")).sort(),
  };
}

async function verifyAppliedRavioliNativeOperation(input: {
  operationHash: string;
  expectedCounter: number;
  call: RavioliNativeRecoveryCall;
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
}): Promise<RavioliNativeOperation> {
  const rows = await pollJson(
    `native Ravioli recovery operation ${input.operationHash}`,
    `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(input.operationHash)}`,
    (value) => Array.isArray(value) && value.some((row: JsonObject) =>
      row?.hash === input.operationHash &&
      row?.status === "applied" &&
      row?.sender?.address === RAVIOLI_NATIVE_RECOVERY_CREATOR &&
      row?.target?.address === input.call.contractAddress &&
      row?.parameter?.entrypoint === input.call.entrypoint,
    ),
  );
  return validateRavioliNativeOperationRows(rows, input);
}

export function buildRavioliNativeRecoveryHandoff(): RavioliNativeRecoveryHandoff {
  return {
    schema: "pastaprotocol-ravioli-native-recovery-handoff@1",
    gnocchi: {
      contract: RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
      creatorBalances: { "0": 2, "1": 2 },
      totalSupply: { "0": 8, "1": 5 },
      totalReserved: { "0": 0, "1": 0 },
    },
    rotini: {
      contract: RAVIOLI_NATIVE_RECOVERY_ROTINI,
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
      contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      allWrapperSupplyBurned: true,
      allSalesInactive: true,
    },
  };
}

function receiptGeneratedOutputs(receipt: JsonObject): [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput] {
  assert.ok(Array.isArray(receipt.generatedOutputs) && receipt.generatedOutputs.length === 2);
  const outputs = receipt.generatedOutputs.map((entry: JsonObject, index: number) => {
    const tokenId = (index + 3) as 3 | 4;
    assert.equal(entry.tokenId, tokenId);
    assert.equal(entry.artifactFileName, `ravioli-generated-${tokenId}.png`);
    assert.equal(entry.artifact?.publicGatewayVerified, true);
    assert.equal(entry.metadataPin?.publicGatewayVerified, true);
    assert.match(String(entry.payload || ""), /^[0-9a-f]+$/);
    const output = {
      tokenId,
      artifactFileName: entry.artifactFileName,
      artifactBytes: new Uint8Array(),
      artifact: entry.artifact,
      metadata: entry.metadata,
      metadataPin: entry.metadataPin,
      payload: entry.payload,
    } satisfies RavioliNativeGeneratedOutput;
    assert.equal(output.artifact.sha256, sha256(Buffer.concat([PNG_BYTES, Buffer.from(`ravioli-generated-${tokenId}`, "utf8")])));
    assert.deepEqual(output.metadata, {
      name: `Ravioli UI-LIVE ${MODE_NAMES[tokenId]} #1`,
      decimals: 0,
      artifactUri: output.artifact.uri,
      displayUri: output.artifact.uri,
      thumbnailUri: output.artifact.uri,
      creators: [RAVIOLI_NATIVE_RECOVERY_CREATOR],
      formats: [{ uri: output.artifact.uri, mimeType: "image/png" }],
      ravioli: { generatedAtOpen: true },
    });
    assert.equal(output.metadataPin.sha256, sha256(deterministicJsonBytes(output.metadata)));
    assert.equal(output.payload, exactGeneratedPayload({
      artifactSha256: output.artifact.sha256,
      artifactUri: output.artifact.uri,
      metadataUri: output.metadataPin.uri,
    }), `generated token ${tokenId} packed payload drift`);
    return output;
  });
  return outputs as [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
}

export function validateRavioliNativeRecoveryReceipt(
  receipt: JsonObject,
  evidence: RavioliNativeEvidence,
): RavioliNativeRecoveryHandoff {
  assert.equal(receipt.schema, "pastaprotocol-ravioli-native-recovery@1");
  assert.equal(receipt.classification, "CHAIN-LIVE-NATIVE-PACK-RECOVERY");
  assert.equal(receipt.status, "PASSED");
  assert.deepEqual(receipt.network, { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: receipt.network.rpcUrl });
  assert.ok([normalizeBase(SHADOWNET_RPC_PRIMARY), normalizeBase(SHADOWNET_RPC_FALLBACK)].includes(normalizeBase(String(receipt.network.rpcUrl || ""))));
  const startedAt = Date.parse(String(receipt.startedAt || ""));
  const completedAt = Date.parse(String(receipt.completedAt || ""));
  assert.ok(Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt);
  assert.deepEqual(receipt.quarantinedEvidence, {
    directory: RAVIOLI_NATIVE_RECOVERY_QUARANTINE,
    rejectionSha256: evidence.rejectionSha256,
    relativeInventorySha256: evidence.inventorySha256,
    openKitCaptureProgressSha256: evidence.progressSha256,
    openKitSha256: evidence.kitHashes,
  });
  assert.deepEqual(receipt.acceptedEvidenceHashes, evidence.acceptedHashes);
  assertRavioliNativeRecoveryBeforeState(receipt.before as RavioliNativeState);
  const generated = receiptGeneratedOutputs(receipt);
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  assert.deepEqual(receipt.exactCallPlan, calls);
  assert.ok(Array.isArray(receipt.estimates) && receipt.estimates.length === calls.length);
  receipt.estimates.forEach((estimate: JsonObject, index: number) => {
    assert.deepEqual(estimate.call, calls[index]);
    assert.deepEqual(estimate.sendOptions, ravioliNativeRecoverySendOptions(estimate.raw));
  });
  assert.equal(
    receipt.aggregateEstimatedCostMutez,
    ravioliNativeRecoveryAggregateCostMutez(receipt.estimates as RavioliNativeEstimate[]),
    "native recovery aggregate estimated cost drift",
  );
  assert.ok(Array.isArray(receipt.operations) && receipt.operations.length === calls.length);
  assert.equal(new Set(receipt.operations.map((operation: JsonObject) => operation.hash)).size, calls.length, "native recovery operation hashes must be unique");
  const firstCounter = safeInteger(receipt.operations[0].counter, "native recovery first receipt counter");
  assert.ok(firstCounter > 0, "native recovery receipt counter must be positive");
  let previousLevel = 0;
  let previousTimestamp = startedAt;
  receipt.operations.forEach((operation: JsonObject, index: number) => {
    assert.equal(validateOperation(operation.hash), ValidationResult.VALID);
    assert.equal(safeInteger(operation.counter, `receipt operation ${index} counter`), firstCounter + index);
    assert.deepEqual(operation.call, calls[index]);
    assert.equal(operation.explorerUrl, `https://shadownet.tzkt.io/${operation.hash}`);
    const level = safeInteger(operation.level, `receipt operation ${index} level`);
    assert.ok(level > 0 && level >= previousLevel, `receipt operation ${index} level is not monotonic`);
    previousLevel = level;
    const timestamp = Date.parse(String(operation.timestamp || ""));
    assert.ok(Number.isFinite(timestamp), `receipt operation ${index} timestamp is invalid`);
    assert.ok(timestamp >= startedAt && timestamp <= completedAt && timestamp >= previousTimestamp, `receipt operation ${index} timestamp is outside the recovery window`);
    previousTimestamp = timestamp;
    assert.deepEqual(
      operation.internalEntrypoints,
      expectedInternalOperations(calls[index], generated).map((entry) => entry.entrypoint).sort(),
      `receipt operation ${index} internal entrypoint summary drift`,
    );
  });
  assertRavioliNativeRecoveryAfterState(receipt.after as RavioliNativeState, generated);
  assert.ok(receipt.after.level >= Math.max(...receipt.operations.map((operation: JsonObject) => safeInteger(operation.level, "receipt operation level"))));
  const handoff = buildRavioliNativeRecoveryHandoff();
  assert.deepEqual(receipt.handoff, handoff);
  assert.deepEqual(receipt.invariants, {
    privilegedGnocchiMintUsed: false,
    routerRecoverEntrypointUsed: false,
    nativeOpenPackCount: 4,
    saleDeactivationCount: 5,
    freshRotiniProjectCreated: 3,
    allFailedWrapperSupplyBurned: true,
    allFailedSalesInactive: true,
    acceptedProofFilesMutated: false,
    publicGeneratedArtifactsVerified: true,
  });
  return handoff;
}

export function buildRavioliNativeRecoveryReceipt(input: {
  startedAt: string;
  completedAt: string;
  rpcUrl: string;
  evidence: RavioliNativeEvidence;
  before: RavioliNativeState;
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
  calls: RavioliNativeRecoveryCall[];
  estimates: RavioliNativeEstimate[];
  operations: RavioliNativeOperation[];
  after: RavioliNativeState;
}): JsonObject {
  const receipt: JsonObject = {
    schema: "pastaprotocol-ravioli-native-recovery@1",
    classification: "CHAIN-LIVE-NATIVE-PACK-RECOVERY",
    status: "PASSED",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: input.rpcUrl },
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    reason: "Deactivate every stale public sale, consume every remaining failed-router wrapper through ordinary open_pack, and create a fresh clone of Rotini PNG project 0 without privileged replacement minting.",
    quarantinedEvidence: {
      directory: RAVIOLI_NATIVE_RECOVERY_QUARANTINE,
      rejectionSha256: input.evidence.rejectionSha256,
      relativeInventorySha256: input.evidence.inventorySha256,
      openKitCaptureProgressSha256: input.evidence.progressSha256,
      openKitSha256: input.evidence.kitHashes,
    },
    acceptedEvidenceHashes: input.evidence.acceptedHashes,
    before: input.before,
    generatedOutputs: input.generated.map(({ artifactBytes: _artifactBytes, ...output }) => output),
    exactCallPlan: input.calls,
    estimates: input.estimates,
    aggregateEstimatedCostMutez: ravioliNativeRecoveryAggregateCostMutez(input.estimates),
    operations: input.operations,
    after: input.after,
    handoff: buildRavioliNativeRecoveryHandoff(),
    links: {
      router: `https://shadownet.tzkt.io/${RAVIOLI_NATIVE_RECOVERY_ROUTER}`,
      gnocchi: `https://shadownet.tzkt.io/${RAVIOLI_NATIVE_RECOVERY_GNOCCHI}`,
      rotini: `https://shadownet.tzkt.io/${RAVIOLI_NATIVE_RECOVERY_ROTINI}`,
      generatedTokens: [3, 4].map((tokenId) => `https://shadownet.tzkt.io/${RAVIOLI_NATIVE_RECOVERY_ROTINI}/tokens/${tokenId}`),
      operations: input.operations.map((operation) => operation.explorerUrl),
      publicIpfs: input.generated.flatMap((output) => [output.artifact.publicGatewayUrl, output.metadataPin.publicGatewayUrl]),
    },
    invariants: {
      privilegedGnocchiMintUsed: false,
      routerRecoverEntrypointUsed: false,
      nativeOpenPackCount: 4,
      saleDeactivationCount: 5,
      freshRotiniProjectCreated: 3,
      allFailedWrapperSupplyBurned: true,
      allFailedSalesInactive: true,
      acceptedProofFilesMutated: false,
      publicGeneratedArtifactsVerified: true,
    },
  };
  validateRavioliNativeRecoveryReceipt(receipt, input.evidence);
  return receipt;
}

export async function loadRavioliNativeRecoveryHandoff(runRoot: string): Promise<{
  receiptSha256: string;
  receipt: JsonObject;
  handoff: RavioliNativeRecoveryHandoff;
}> {
  const evidence = await loadRavioliNativeRecoveryEvidence(path.resolve(runRoot));
  const receiptPath = path.join(path.resolve(runRoot), RAVIOLI_NATIVE_RECOVERY_DIRECTORY, "artifacts", "ravioli-native-recovery.json");
  const loaded = await readExactJson(receiptPath);
  return {
    receiptSha256: loaded.digest,
    receipt: loaded.value,
    handoff: validateRavioliNativeRecoveryReceipt(loaded.value, evidence),
  };
}

export function validateRavioliNativeRecoveryIntent(
  intent: JsonObject,
  evidence: RavioliNativeEvidence,
): {
  startedAt: string;
  initialCounter: number;
  generated: [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
  calls: RavioliNativeRecoveryCall[];
  estimates: RavioliNativeEstimate[];
  before: RavioliNativeState;
  rpcUrl: string;
} {
  assert.equal(intent.schema, "pastaprotocol-ravioli-native-recovery-intent@1");
  assert.equal(intent.status, "AUTHORIZED-NOT-YET-SUBMITTED");
  assert.equal(intent.network?.name, "shadownet");
  assert.equal(intent.network?.chainId, SHADOWNET_CHAIN_ID);
  const rpcUrl = String(intent.network?.rpcUrl || "");
  assert.ok([normalizeBase(SHADOWNET_RPC_PRIMARY), normalizeBase(SHADOWNET_RPC_FALLBACK)].includes(normalizeBase(rpcUrl)));
  const startedAt = String(intent.startedAt || "");
  assert.ok(Number.isFinite(Date.parse(startedAt)), "native recovery intent timestamp is invalid");
  const initialCounter = safeInteger(intent.initialCounter, "native recovery initial counter");
  assert.deepEqual(intent.quarantinedEvidence, {
    rejectionSha256: evidence.rejectionSha256,
    inventorySha256: evidence.inventorySha256,
    progressSha256: evidence.progressSha256,
    kitHashes: evidence.kitHashes,
  });
  assert.deepEqual(intent.acceptedEvidenceHashes, evidence.acceptedHashes);
  assertRavioliNativeRecoveryBeforeState(intent.before as RavioliNativeState);
  const generated = receiptGeneratedOutputs(intent);
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  assert.deepEqual(intent.exactCallPlan, calls);
  assert.ok(Array.isArray(intent.estimates) && intent.estimates.length === calls.length);
  intent.estimates.forEach((estimate: JsonObject, index: number) => {
    assert.deepEqual(estimate.call, calls[index]);
    assert.deepEqual(estimate.sendOptions, ravioliNativeRecoverySendOptions(estimate.raw));
  });
  assert.equal(
    intent.aggregateEstimatedCostMutez,
    ravioliNativeRecoveryAggregateCostMutez(intent.estimates as RavioliNativeEstimate[]),
    "native recovery intent aggregate estimated cost drift",
  );
  return {
    startedAt,
    initialCounter,
    generated,
    calls,
    estimates: intent.estimates as RavioliNativeEstimate[],
    before: intent.before as RavioliNativeState,
    rpcUrl,
  };
}

function validateReconciledOperations(input: {
  operations: RavioliNativeOperation[];
  calls: RavioliNativeRecoveryCall[];
  initialCounter: number;
  progress?: JsonObject;
  before: RavioliNativeState;
}): void {
  assert.equal(input.operations.length, input.calls.length, "reconciliation requires all ten native recovery operations");
  assert.equal(new Set(input.operations.map((operation) => operation.hash)).size, input.calls.length, "reconciled operation hashes must be unique");
  input.operations.forEach((operation, index) => {
    assert.equal(validateOperation(operation.hash), ValidationResult.VALID);
    assert.equal(operation.counter, input.initialCounter + index + 1, `reconciled operation ${index} counter drift`);
    assert.deepEqual(operation.call, input.calls[index], `reconciled operation ${index} call drift`);
    assert.equal(operation.explorerUrl, `https://shadownet.tzkt.io/${operation.hash}`);
  });
  if (input.progress !== undefined) {
    assert.equal(input.progress.schema, "pastaprotocol-ravioli-native-recovery-progress@1");
    assert.ok(input.progress.status === "IN_PROGRESS" || input.progress.status === "APPLIED");
    assert.deepEqual(input.progress.before, input.before);
    assert.ok(Array.isArray(input.progress.appliedOperations));
    assert.ok(input.progress.appliedOperations.length > 0 && input.progress.appliedOperations.length <= input.operations.length);
    assert.deepEqual(
      input.progress.appliedOperations,
      input.operations.slice(0, input.progress.appliedOperations.length),
      "native recovery progress is not an exact applied-operation prefix",
    );
  }
}

async function readOptionalNativeRecoveryProgress(recoveryRoot: string): Promise<JsonObject | undefined> {
  try {
    return (await readExactJson(path.join(recoveryRoot, "recovery-progress.json"))).value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readReconciledNativeOperations(input: {
  initialCounter: number;
  calls: RavioliNativeRecoveryCall[];
  generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
}): Promise<RavioliNativeOperation[]> {
  const query = new URLSearchParams({
    sender: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    "counter.ge": String(input.initialCounter + 1),
    "counter.le": String(input.initialCounter + input.calls.length),
    "sort.asc": "id",
    limit: "100",
  });
  const candidates = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions?${query.toString()}`);
  assert.ok(Array.isArray(candidates), "native recovery reconciliation candidate response must be an array");
  const topRows = candidates.filter((row: JsonObject) => row?.nonce == null);
  assert.equal(topRows.length, input.calls.length, "TzKT does not expose the exact ten top-level recovery counters");
  const byCounter = new Map<number, JsonObject>();
  for (const row of topRows) {
    const counter = safeInteger(row.counter, "reconciliation candidate counter");
    assert.ok(!byCounter.has(counter), `duplicate recovery counter ${counter}`);
    byCounter.set(counter, row);
  }
  const operations: RavioliNativeOperation[] = [];
  for (let index = 0; index < input.calls.length; index += 1) {
    const expectedCounter = input.initialCounter + index + 1;
    const candidate = byCounter.get(expectedCounter);
    assert.ok(candidate, `missing native recovery counter ${expectedCounter}`);
    const hash = String(candidate.hash || "");
    const rows = await fetchJson(`${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(hash)}`);
    operations.push(validateRavioliNativeOperationRows(rows, {
      operationHash: hash,
      expectedCounter,
      call: input.calls[index],
      generated: input.generated,
    }));
  }
  return operations;
}

async function writeReconciledNativeReceipt(recoveryRoot: string, receipt: JsonObject): Promise<string> {
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  const receiptPath = path.join(artifactRoot, "ravioli-native-recovery.json");
  await writeFile(receiptPath, deterministicJsonBytes(receipt), { flag: "wx" });
  return receiptPath;
}

const DEFAULT_NATIVE_RECONCILIATION_IO: RavioliNativeReconciliationIo = {
  loadEvidence: loadRavioliNativeRecoveryEvidence,
  readIntent: async (recoveryRoot) => (await readExactJson(path.join(recoveryRoot, "recovery-intent.json"))).value,
  readProgress: readOptionalNativeRecoveryProgress,
  readOperations: readReconciledNativeOperations,
  readState: readRavioliNativeRecoveryState,
  readLane: assertRavioliNativeSignerLaneClear,
  writeReceipt: writeReconciledNativeReceipt,
  now: () => new Date().toISOString(),
};

export async function runRavioliNativeRecoveryReconciliation(options: {
  environment?: Record<string, string | undefined>;
  io?: RavioliNativeReconciliationIo;
} = {}): Promise<JsonObject> {
  const environment = options.environment ?? process.env;
  const io = options.io ?? DEFAULT_NATIVE_RECONCILIATION_IO;
  const runRoot = assertRavioliNativeRecoveryReconciliationAllowed(environment);
  const recoveryRoot = path.join(runRoot, RAVIOLI_NATIVE_RECOVERY_DIRECTORY);
  const [evidence, intent, progress] = await Promise.all([
    io.loadEvidence(runRoot),
    io.readIntent(recoveryRoot),
    io.readProgress(recoveryRoot),
  ]);
  const validated = validateRavioliNativeRecoveryIntent(intent, evidence);
  const expectedTerminalCounter = validated.initialCounter + validated.calls.length;
  const [operations, after, primaryLane, fallbackLane] = await Promise.all([
    io.readOperations({ initialCounter: validated.initialCounter, calls: validated.calls, generated: validated.generated }),
    io.readState(),
    io.readLane(SHADOWNET_RPC_PRIMARY, expectedTerminalCounter),
    io.readLane(SHADOWNET_RPC_FALLBACK, expectedTerminalCounter),
  ]);
  validateReconciledOperations({
    operations,
    calls: validated.calls,
    initialCounter: validated.initialCounter,
    progress,
    before: validated.before,
  });
  assert.equal(primaryLane.counter, fallbackLane.counter, "reconciliation RPC counters disagree");
  assert.equal(primaryLane.balanceMutez, fallbackLane.balanceMutez, "reconciliation RPC balances disagree");
  assert.equal(primaryLane.activeOperationCount, 0);
  assert.equal(fallbackLane.activeOperationCount, 0);
  assertRavioliNativeRecoveryAfterState(after, validated.generated);
  const finalEvidence = await io.loadEvidence(runRoot);
  assert.deepEqual(finalEvidence.acceptedHashes, evidence.acceptedHashes, "accepted evidence changed before reconciliation receipt");
  assert.deepEqual(finalEvidence.kitHashes, evidence.kitHashes, "open kits changed before reconciliation receipt");
  assert.equal(finalEvidence.rejectionSha256, evidence.rejectionSha256);
  const receipt = buildRavioliNativeRecoveryReceipt({
    startedAt: validated.startedAt,
    completedAt: io.now(),
    rpcUrl: validated.rpcUrl,
    evidence,
    before: validated.before,
    generated: validated.generated,
    calls: validated.calls,
    estimates: validated.estimates,
    operations,
    after,
  });
  const receiptPath = await io.writeReceipt(recoveryRoot, receipt);
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    mode: "READ-ONLY-RECONCILIATION",
    receiptPath,
    operations: operations.map((operation) => operation.hash),
    handoff: receipt.handoff,
  }, null, 2)}\n`);
  return receipt;
}

async function requireFreshNativeRecoveryDirectory(runRoot: string): Promise<string> {
  const recoveryRoot = path.join(path.resolve(runRoot), RAVIOLI_NATIVE_RECOVERY_DIRECTORY);
  try {
    await lstat(recoveryRoot);
    assert.fail(`native Ravioli recovery directory already exists: ${recoveryRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return recoveryRoot;
}

async function persistGeneratedOutput(
  recoveryRoot: string,
  output: RavioliNativeGeneratedOutput,
  captured: readonly RavioliNativeGeneratedOutput[],
): Promise<void> {
  const generatedRoot = path.join(recoveryRoot, "artifacts", "generated");
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(path.join(generatedRoot, output.artifactFileName), output.artifactBytes, { flag: "wx" });
  await writeFile(path.join(generatedRoot, `ravioli-generated-${output.tokenId}-metadata.json`), deterministicJsonBytes(output.metadata), { flag: "wx" });
  await writeFile(
    path.join(recoveryRoot, "generated-pin-progress.json"),
    deterministicJsonBytes({
      schema: "pastaprotocol-ravioli-native-generated-pin-progress@1",
      status: captured.length === 2 ? "PINNED" : "PARTIAL",
      outputs: captured.map((entry) => ({
        tokenId: entry.tokenId,
        artifact: entry.artifact,
        metadata: entry.metadataPin,
        payloadSha256: sha256(Buffer.from(entry.payload, "hex")),
      })),
    }),
  );
}

export async function runRavioliNativeRecovery(): Promise<JsonObject> {
  const runRoot = assertRavioliNativeRecoveryExecutionAllowed(process.env);
  const recoveryRoot = await requireFreshNativeRecoveryDirectory(runRoot);
  const evidence = await loadRavioliNativeRecoveryEvidence(runRoot);
  const rpc = await probeRpcChainId();
  assert.equal(rpc.chainId, SHADOWNET_CHAIN_ID);
  const signerConfiguration = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-ravioli-native-recovery.sock",
    authToken: "local-pasta-shadownet-ravioli-native-recovery",
    auditLog: "/tmp/wtf-pasta-shadownet-ravioli-native-recovery-audit.log",
  });
  const signerSet = await loadSignerSet(signerConfiguration);
  assert.equal(signerSet.creator.address, RAVIOLI_NATIVE_RECOVERY_CREATOR, "native recovery signer is not the exact creator");
  const tezos = buildToolkit(signerSet.creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "Ravioli native recovery startup");

  const [primaryLane, fallbackLane, before] = await Promise.all([
    assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_PRIMARY),
    assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_FALLBACK),
    readRavioliNativeRecoveryState(),
  ]);
  assert.equal(primaryLane.counter, fallbackLane.counter, "configured RPC creator counters disagree");
  assert.equal(primaryLane.balanceMutez, fallbackLane.balanceMutez, "configured RPC creator balances disagree");
  assert.ok(primaryLane.balanceMutez >= RECOVERY_OPERATION_RESERVE_MUTEZ, "creator balance is below native recovery reserve");
  assertRavioliNativeRecoveryBeforeState(before);
  await mkdir(recoveryRoot, { recursive: false });
  await writeFile(path.join(recoveryRoot, "preflight.json"), deterministicJsonBytes({
    schema: "pastaprotocol-ravioli-native-recovery-preflight@1",
    status: "PASSED-NO-CHAIN-WRITE-YET",
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
    lane: { primary: primaryLane, fallback: fallbackLane },
    quarantinedEvidence: {
      rejectionSha256: evidence.rejectionSha256,
      inventorySha256: evidence.inventorySha256,
      kitHashes: evidence.kitHashes,
    },
    before,
  }), { flag: "wx" });

  const ipfs = resolveIpfsProofConfig();
  const generatedOutputs: RavioliNativeGeneratedOutput[] = [];
  for (const tokenId of [3, 4] as const) {
    const output = await prepareRavioliNativeGeneratedOutput({
      tokenId,
      pinBytes: ({ bytes, fileName, mimeType }) => pinIpfsProofBytes({ bytes, fileName, mimeType, options: ipfs }),
      pinJson: ({ value, fileName }) => pinIpfsProofJson({ value, fileName, options: ipfs }),
    });
    generatedOutputs.push(output);
    await persistGeneratedOutput(recoveryRoot, output, generatedOutputs);
  }
  const generated = generatedOutputs as [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  let validatedCallCount = 0;
  const operations: RavioliNativeOperation[] = [];
  const session = new TaquitoPastaUiLiveSession({
    tezos,
    signerAddress: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    expectedChainId: SHADOWNET_CHAIN_ID,
    allowedContractAddresses: new Set([RAVIOLI_NATIVE_RECOVERY_ROUTER, RAVIOLI_NATIVE_RECOVERY_ROTINI]),
    allowedEntrypoints: new Set(["open_pack", "set_sale_active", "create_project"]),
    minimumActionBalanceMutez: 50_000,
    assertExpectedChain: async (stage) => {
      await assertShadownet(tezos, stage);
      return SHADOWNET_CHAIN_ID;
    },
    pinJson: async () => { throw new Error("native recovery pins only before call authorization"); },
    pinBlob: async () => { throw new Error("native recovery pins only before call authorization"); },
    validateOrigination: () => { throw new Error("native recovery cannot originate"); },
    validateCall: (actual) => {
      const expected = calls[validatedCallCount];
      assert.ok(expected, "native recovery call exceeds exact plan");
      assertRavioliNativeRecoveryCallMatches(actual, expected);
      validatedCallCount += 1;
    },
    assertOperationApplied: async ({ operationHash }) => {
      const expected = calls[operations.length];
      assert.ok(expected && operationHash);
      const operation = await verifyAppliedRavioliNativeOperation({
        operationHash,
        expectedCounter: primaryLane.counter + operations.length + 1,
        call: expected,
        generated,
      });
      operations.push(operation);
      await writeFile(path.join(recoveryRoot, "recovery-progress.json"), deterministicJsonBytes({
        schema: "pastaprotocol-ravioli-native-recovery-progress@1",
        status: operations.length === calls.length ? "APPLIED" : "IN_PROGRESS",
        before,
        appliedOperations: operations,
      }));
    },
  });
  session.authorizeAfterFundingPreflight({
    balanceMutez: primaryLane.balanceMutez,
    requiredBalanceMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
    estimatedOriginationMutez: 0,
    operationReserveMutez: RECOVERY_OPERATION_RESERVE_MUTEZ,
  });
  let startedAt = "";
  const estimates = await executeRavioliNativeRecoveryPlan({
    session,
    calls,
    beforeSubmit: async (acceptedEstimates) => {
      const refreshedEvidence = await loadRavioliNativeRecoveryEvidence(runRoot);
      assert.deepEqual(refreshedEvidence.acceptedHashes, evidence.acceptedHashes);
      assert.deepEqual(refreshedEvidence.kitHashes, evidence.kitHashes);
      const [freshPrimary, freshFallback, freshBefore] = await Promise.all([
        assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_PRIMARY, primaryLane.counter),
        assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_FALLBACK, primaryLane.counter),
        readRavioliNativeRecoveryState(),
      ]);
      assert.equal(freshPrimary.balanceMutez, freshFallback.balanceMutez);
      assertRavioliNativeRecoveryBeforeState(freshBefore);
      const aggregateEstimatedCostMutez = ravioliNativeRecoveryAggregateCostMutez(acceptedEstimates);
      assert.ok(
        freshPrimary.balanceMutez >= aggregateEstimatedCostMutez,
        `creator balance ${freshPrimary.balanceMutez} is below aggregate native recovery fee and burn cost ${aggregateEstimatedCostMutez}`,
      );
      startedAt = new Date().toISOString();
      await writeFile(path.join(recoveryRoot, "recovery-intent.json"), deterministicJsonBytes({
        schema: "pastaprotocol-ravioli-native-recovery-intent@1",
        status: "AUTHORIZED-NOT-YET-SUBMITTED",
        startedAt,
        initialCounter: primaryLane.counter,
        network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl: rpc.rpcUrl },
        quarantinedEvidence: {
          rejectionSha256: evidence.rejectionSha256,
          inventorySha256: evidence.inventorySha256,
          progressSha256: evidence.progressSha256,
          kitHashes: evidence.kitHashes,
        },
        acceptedEvidenceHashes: evidence.acceptedHashes,
        before,
        generatedOutputs: generated.map(({ artifactBytes: _artifactBytes, ...output }) => output),
        exactCallPlan: calls,
        estimates: acceptedEstimates,
        aggregateEstimatedCostMutez,
      }), { flag: "wx" });
    },
    afterAppliedCall: async (index) => {
      if (index !== 4) return;
      assert.equal(operations.length, 5, "sale-closure checkpoint requires exactly five applied operations");
      const salesClosed = await pollRavioliNativeRecoverySalesClosedState(before.level);
      await writeFile(path.join(recoveryRoot, "sale-closure-checkpoint.json"), deterministicJsonBytes({
        schema: "pastaprotocol-ravioli-native-sale-closure-checkpoint@1",
        status: "ALL-SALES-INACTIVE-WRAPPERS-STILL-CREATOR-OWNED",
        operations: operations.slice(0, 5),
        state: salesClosed,
      }), { flag: "wx" });
    },
  });
  assert.ok(startedAt, "native recovery intent must exist before submission");
  assert.equal(validatedCallCount, calls.length, "native recovery did not validate exact call plan");
  assert.equal(operations.length, calls.length, "native recovery operation count drift");

  const after = await pollRavioliNativeRecoveryAfterState(generated);
  await Promise.all([
    assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_PRIMARY, primaryLane.counter + calls.length),
    assertRavioliNativeSignerLaneClear(SHADOWNET_RPC_FALLBACK, primaryLane.counter + calls.length),
  ]);
  const finalEvidence = await loadRavioliNativeRecoveryEvidence(runRoot);
  assert.deepEqual(finalEvidence.acceptedHashes, evidence.acceptedHashes, "accepted Pasta proof hashes changed during native recovery");
  assert.deepEqual(finalEvidence.kitHashes, evidence.kitHashes, "quarantined kit hashes changed during native recovery");
  const receipt = buildRavioliNativeRecoveryReceipt({
    startedAt,
    completedAt: new Date().toISOString(),
    rpcUrl: rpc.rpcUrl,
    evidence,
    before,
    generated,
    calls,
    estimates,
    operations,
    after,
  });
  const artifactRoot = path.join(recoveryRoot, "artifacts");
  await mkdir(artifactRoot, { recursive: true });
  const receiptPath = path.join(artifactRoot, "ravioli-native-recovery.json");
  const receiptBytes = deterministicJsonBytes(receipt);
  await writeFile(receiptPath, receiptBytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    status: "PASSED",
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    operations: operations.map((operation) => operation.hash),
    handoff: receipt.handoff,
  }, null, 2)}\n`);
  return receipt;
}

async function main(): Promise<void> {
  try {
    if (process.env[RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG] !== undefined) {
      await runRavioliNativeRecoveryReconciliation();
    } else {
      await runRavioliNativeRecovery();
    }
  } catch (error) {
    if (error instanceof ProofBlocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n${error.lines.join("\n")}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
