import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Parser } from "@taquito/michel-codec";
import { MichelsonMap, ParameterSchema, Schema, UnitValue } from "@taquito/michelson-encoder";
import { LocalForger, ProtocolsHash } from "@taquito/local-forging";
import { OpKind } from "@taquito/rpc";
import { InMemorySigner } from "@taquito/signer";
import { TezosToolkit } from "@taquito/taquito";
import { z } from "zod";
import { db } from "../../db";
import {
  macaroniV35Drops,
  macaroniV35FundingLedger,
  macaroniV35ClaimFulfillments,
  macaroniV35OperationAttempts,
  macaroniV35PrivateAssets,
  macaroniV35SetupSteps,
  macaroniV35WorkItems,
} from "@shared/schema";
import type { UserRoleInput } from "@shared/types";
import { hasPermission } from "../../lib/permissions";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import {
  buildMacaroniV35Capabilities,
  hashMacaroniV35Payload,
  MACARONI_V35_MANAGED_PERMISSION,
  MACARONI_V35_SETUP_SCHEMA,
  managedMacaroniRuntimeReadiness,
  measuredMacaroniV35FundingPolicy,
  macaroniV35CreatorPlanSchema,
  publicMacaroniV35DropStatus,
  type MacaroniV35Registration,
  type MacaroniV35CreatorPlan,
} from "./v35-types";
import { enqueueMacaroniV35Work } from "./v35-worker";
import { UpstreamClient, tzkt } from "../../lib/upstream";
import {
  verifyMacaroniV35RegistrationProof,
  type MacaroniV35RegistrationProof,
} from "./v35-auth";
import {
  decryptMacaroniV35EntropyWithKeyring,
  encryptMacaroniV35EntropySeed,
  generateMacaroniV35EntropyChain,
  MACARONI_V35_ENTROPY_VERSION,
  parseMacaroniV35VersionedKeyring,
  type MacaroniV35VersionedKeyring,
} from "./v35-entropy";
import {
  deleteObject,
  downloadObjectToFile,
  putObjectBuffer,
} from "../../lib/storage/object-storage";
import {
  managedMacaroniV35AssetRuntimeConfigured,
  recheckManagedMacaroniV35IndexedDuplicates,
} from "./v35-managed-assets";
import { stageAndPinUpload } from "../ipfs-pinning/service";

type UserSnapshot = {
  id?: number | null;
  role?: string | null;
  roles?: readonly string[] | null;
};

export async function macaroniV35CapabilitiesForUser(
  user: UserSnapshot | null | undefined,
  network?: "mainnet" | "shadownet"
) {
  if (!user?.id) return buildMacaroniV35Capabilities({ authenticated: false, allowed: false, network });
  const roles = await listRolesForUserSnapshot(user);
  const allowed = await hasPermission(roles as UserRoleInput, MACARONI_V35_MANAGED_PERMISSION);
  return buildMacaroniV35Capabilities({ authenticated: true, allowed, roles, network });
}

export async function userCanUseManagedMacaroni(user: UserSnapshot | null | undefined) {
  const capabilities = await macaroniV35CapabilitiesForUser(user);
  return { allowed: capabilities.managed.allowed, capabilities };
}

const V35_RPC = {
  mainnet: "https://tezos-mainnet.octez.io/",
  shadownet: "https://tezos-shadownet.octez.io/",
} as const;

const V35_RPC_FALLBACK = {
  mainnet: "https://tcinfra.net/rpc/tezos/mainnet",
  shadownet: "https://tcinfra.net/rpc/tezos/shadownet",
} as const;

const V35_TZKT = {
  mainnet: tzkt,
  shadownet: new UpstreamClient({
    label: "macaroni-v35-shadownet-tzkt",
    baseUrl: (process.env.SHADOWNET_TZKT_API_URL || "https://api.shadownet.tzkt.io/v1").replace(/\/+$/, ""),
    requestsPerSecond: 4,
    burst: 8,
  }),
} as const;

const V35_ABI_PATH = path.resolve(
  process.cwd(),
  "public/creation-tools/macaroni/contract/macaroni-v35.contract.json"
);
const V35_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "public/creation-tools/macaroni/contract/macaroni-v35.template.json"
);
const V35_STORAGE_PATH = path.resolve(
  process.cwd(),
  "public/creation-tools/macaroni/contract/macaroni-v35.storage.tz"
);

const ATTACHED_SETUP_ORDER = [
  "add_tokens_v35",
  "append_token_slots_v35",
  "set_stages",
  "set_allowlist",
  "finalize_setup",
  "fund_fulfillment_reserve",
  "activate_sale",
] as const;

function managedReserveEstimate() {
  const policy = measuredMacaroniV35FundingPolicy();
  if (!policy) return null;
  return {
    subsidy: policy.fulfillmentSubsidyMutez,
    version: policy.version,
    initialReserve: policy.initialContractReserveMutez,
    operatorGasMinimum: policy.finalizerLiquidStartupFloorMutez,
    evidence: policy.evidence,
  };
}

function versionedEntropyKeyring(input: {
  keyringEnv: string;
  activeVersionEnv: string;
  legacyKeyEnv: string;
  legacyVersionEnv: string;
  label: string;
}): MacaroniV35VersionedKeyring {
  const serialized = String(process.env[input.keyringEnv] || "").trim();
  const activeVersion = String(process.env[input.activeVersionEnv] || "").trim();
  if (serialized || activeVersion) {
    if (!serialized || !activeVersion) throw new Error(`${input.label} keyring configuration is incomplete`);
    return parseMacaroniV35VersionedKeyring({ serialized, activeVersion, label: input.label });
  }
  const material = String(process.env[input.legacyKeyEnv] || "");
  const version = String(process.env[input.legacyVersionEnv] || "").trim();
  if (!material || !version) throw new Error(`${input.label} keyring is not configured`);
  return parseMacaroniV35VersionedKeyring({
    serialized: JSON.stringify({ [version]: material }),
    activeVersion: version,
    label: input.label,
  });
}

export function managedMacaroniV35EntropyKeyrings() {
  const primary = versionedEntropyKeyring({
    keyringEnv: "MACARONI_V35_ENTROPY_KEYRING_JSON",
    activeVersionEnv: "MACARONI_V35_ENTROPY_ACTIVE_KEY_VERSION",
    legacyKeyEnv: "MACARONI_V35_ENTROPY_ENCRYPTION_KEY",
    legacyVersionEnv: "MACARONI_V35_ENTROPY_KEY_VERSION",
    label: "Managed Macaroni primary entropy",
  });
  const recovery = versionedEntropyKeyring({
    keyringEnv: "MACARONI_V35_RECOVERY_KEYRING_JSON",
    activeVersionEnv: "MACARONI_V35_RECOVERY_ACTIVE_KEY_VERSION",
    legacyKeyEnv: "MACARONI_V35_RECOVERY_ENCRYPTION_KEY",
    legacyVersionEnv: "MACARONI_V35_RECOVERY_KEY_VERSION",
    label: "Managed Macaroni independent recovery",
  });
  if (primary.keys.get(primary.activeVersion) === recovery.keys.get(recovery.activeVersion)) {
    throw new Error("Primary and recovery entropy key material must be independent");
  }
  return { primary, recovery };
}

type MacaroniV35EntropyRecoveryReference = {
  version: "macaroni-v35-entropy-recovery-object.v1";
  bucket: string;
  key: string;
};

function parseEntropyRecoveryReference(value: string): MacaroniV35EntropyRecoveryReference {
  const parsed = JSON.parse(value) as Partial<MacaroniV35EntropyRecoveryReference>;
  if (parsed.version !== "macaroni-v35-entropy-recovery-object.v1" || !parsed.bucket || !parsed.key) {
    throw new Error("Managed entropy recovery reference is invalid");
  }
  return parsed as MacaroniV35EntropyRecoveryReference;
}

type V35Network = keyof typeof V35_RPC;

async function managedSetupFinalityContext(network: V35Network) {
  const configured = Number(process.env.MACARONI_V35_INDEX_MIN_CONFIRMATIONS);
  if (!Number.isSafeInteger(configured) || configured < 2) {
    throw new Error("MACARONI_V35_INDEX_MIN_CONFIRMATIONS must be at least 2 for Tenderbake deterministic finality");
  }
  const confirmations = configured;
  const head = await V35_TZKT[network].getJson<{ level?: number }>("/head");
  const headLevel = Number(head.level);
  if (!Number.isSafeInteger(headLevel) || headLevel <= confirmations) {
    throw new Error("TzKT has not provided a usable finalized head level");
  }
  return { confirmations, headLevel, finalizedBlock: headLevel - confirmations };
}

async function readManagerKeyAtBlock(network: V35Network, address: string, block: string | number) {
  const url = new URL(
    `chains/main/blocks/${block}/context/contracts/${address}/manager_key`,
    V35_RPC[network]
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Could not read creator manager key (HTTP ${response.status})`);
  const value = await response.json() as string | null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function managedFinalizerSecret(network: V35Network) {
  return String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_FINALIZER_MAINNET_SECRET_KEY"
      : "MACARONI_V35_FINALIZER_SHADOWNET_SECRET_KEY"
  ] || "").trim();
}

async function managedFinalizerAddress(network: V35Network) {
  const secret = managedFinalizerSecret(network);
  if (!secret) throw new Error(`Managed V3.5 ${network} finalizer signer is not configured`);
  return new InMemorySigner(secret).publicKeyHash();
}

type MacaroniV35DecodedStorage = Record<string, unknown> & {
  administrator?: string;
  setup_finalized?: boolean;
  sale_active?: boolean;
  sale_activated?: boolean;
  sale_permanently_closed?: boolean;
  fulfillment_armed?: boolean;
  final_sweep_complete?: boolean;
};

async function readMacaroniV35Artifact() {
  const [codeText, manifestText] = await Promise.all([
    readFile(V35_ABI_PATH, "utf8"),
    readFile(V35_MANIFEST_PATH, "utf8"),
  ]);
  const code = JSON.parse(codeText) as Array<{ prim?: string; args?: unknown[] }>;
  const manifest = JSON.parse(manifestText) as {
    templateVersion?: string;
    protocolOperationDataLimitBytes?: number;
  };
  if (!Array.isArray(code) || !manifest.templateVersion
    || !Number.isSafeInteger(manifest.protocolOperationDataLimitBytes)
    || Number(manifest.protocolOperationDataLimitBytes) <= 0) {
    throw new Error("The reviewed Macaroni V3.5 ABI artifact is invalid");
  }
  const storageType = code.find((section) => section.prim === "storage")?.args?.[0];
  const parameterType = code.find((section) => section.prim === "parameter")?.args?.[0];
  if (!storageType || !parameterType) throw new Error("The reviewed Macaroni V3.5 ABI has no parameter or storage type");
  return {
    code,
    storageType,
    parameterType,
    templateVersion: manifest.templateVersion,
    protocolOperationDataLimitBytes: Number(manifest.protocolOperationDataLimitBytes),
    codeDigest: hashMacaroniV35Payload(code),
  };
}

async function readAttachedMacaroniV35Contract(input: {
  network: V35Network;
  contract: string;
  block?: string | number;
}) {
  const artifact = await readMacaroniV35Artifact();
  const scriptUrl = new URL(
    `chains/main/blocks/${input.block ?? "head"}/context/contracts/${input.contract}/script`,
    V35_RPC[input.network]
  );
  const response = await fetch(scriptUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Could not read originated contract (HTTP ${response.status})`);
  const script = await response.json() as { code?: unknown; storage?: unknown };
  if (!Array.isArray(script.code) || script.storage == null) {
    throw new Error("Originated address does not expose a valid Tezos contract script");
  }
  if (hashMacaroniV35Payload(script.code) !== artifact.codeDigest) {
    throw new Error("Originated contract code does not match the reviewed Macaroni V3.5 ABI");
  }
  const storage = new Schema(artifact.storageType as never).Execute(script.storage as never) as MacaroniV35DecodedStorage;
  return { ...artifact, storage, rawStorage: script.storage };
}

async function validateAttachedMacaroniV35Contract(input: {
  network: V35Network;
  contract: string;
  administrator: string;
  drop?: typeof macaroniV35Drops.$inferSelect;
  block?: string | number;
}) {
  const attached = await readAttachedMacaroniV35Contract(input);
  if (attached.storage.administrator !== input.administrator) {
    throw new Error("Originated contract administrator does not match the wallet-bound setup");
  }
  if (input.drop) await assertAttachedMacaroniV35StorageMatchesDrop(input.drop, attached.storage);
  return attached;
}

function storageNat(storage: Record<string, unknown>, key: string) {
  const value = storage[key] as { toNumber?: () => number } | number | string | undefined;
  const result = value && typeof value === "object" && typeof value.toNumber === "function"
    ? value.toNumber()
    : Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Attached contract ${key} is invalid`);
  return result;
}

function releasePolicyMatchesDrop(drop: typeof macaroniV35Drops.$inferSelect, value: unknown) {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  if (drop.fulfillmentTrigger === "immediate") return "immediate" in policy;
  if (drop.fulfillmentTrigger === "sellout") return "sellout" in policy;
  if (drop.fulfillmentTrigger === "rolling_delay") {
    const delay = policy.rolling_delay as { toNumber?: () => number } | number | undefined;
    const seconds = delay && typeof delay === "object" && typeof delay.toNumber === "function"
      ? delay.toNumber()
      : Number(delay);
    return seconds === drop.claimDelaySeconds;
  }
  if (!drop.fulfillmentScheduledAt || !("scheduled" in policy)) return false;
  return new Date(String(policy.scheduled)).getTime() === drop.fulfillmentScheduledAt.getTime();
}

async function assertAttachedMacaroniV35StorageMatchesDrop(
  drop: typeof macaroniV35Drops.$inferSelect,
  storage: MacaroniV35DecodedStorage
) {
  if (!drop.entropyHead || drop.entropyChainLength !== drop.physicalSupply || !drop.fulfillmentSubsidyMutez) {
    throw new Error("The managed setup has no fixed entropy and subsidy to compare with an originated contract");
  }
  const finalizer = await managedFinalizerAddress(drop.network);
  const exact = storage.administrator === drop.administrator
    && storage.creator === drop.administrator
    && storage.finalizer === finalizer
    && storage.treasury === drop.salesProceedsAddress
    && normalizedStorageBytes(storage.entropy_commitment) === drop.entropyHead
    && normalizedStorageBytes(storage.entropy_cursor) === drop.entropyHead
    && storageNat(storage, "entropy_length") === drop.entropyChainLength
    && storageNat(storage, "entropy_remaining") === drop.entropyChainLength
    && storageNat(storage, "fulfillment_subsidy") === drop.fulfillmentSubsidyMutez
    && releasePolicyMatchesDrop(drop, storage.release_policy);
  if (!exact) {
    throw new Error("Originated contract creator, finalizer, treasury, release policy, subsidy, or entropy does not match this immutable managed setup");
  }
  const pristine = storageNat(storage, "token_count") === 0
    && storageNat(storage, "supply") === 0
    && storageNat(storage, "slots_loaded") === 0
    && storageNat(storage, "next_slot_token_id") === 0
    && storageNat(storage, "claims_created") === 0
    && storageNat(storage, "claims_settled") === 0
    && storageNat(storage, "next_claim_to_settle") === 0
    && storage.setup_finalized === false
    && storage.sale_active === false
    && storage.sale_activated === false
    && storage.sale_permanently_closed === false
    && storage.fulfillment_armed === false
    && storage.final_sweep_complete === false;
  if (!pristine) throw new Error("Only a pristine, closed V3.5 origination can be attached to a pre-setup managed drop");
}

function normalizedStorageBytes(value: unknown) {
  return String(value ?? "").replace(/^0x/i, "").toLowerCase();
}

async function buildManagedMacaroniV35Origination(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  contractMetadataUri: string;
  minterRoyalty: { enabled: boolean; bps: number; mode: number };
}) {
  if (!input.drop.entropyHead || input.drop.entropyChainLength !== input.drop.physicalSupply) {
    throw new Error("Generate and verify the fixed-supply entropy commitment before origination");
  }
  if (!input.drop.fulfillmentSubsidyMutez || !input.drop.reserveEstimateVersion) {
    throw new Error("A measured fulfillment subsidy and reserve estimate are required before origination");
  }
  const [artifact, storageText, finalizer] = await Promise.all([
    readMacaroniV35Artifact(),
    readFile(V35_STORAGE_PATH, "utf8"),
    managedFinalizerAddress(input.drop.network),
  ]);
  const parser = new Parser();
  const templateStorage = parser.parseMichelineExpression(storageText);
  if (!templateStorage) throw new Error("The reviewed V3.5 storage template is invalid");
  const schema = new Schema(artifact.storageType as never);
  const storage = schema.Execute(templateStorage as never) as Record<string, any>;
  storage.administrator = input.drop.administrator;
  storage.creator = input.drop.administrator;
  storage.finalizer = finalizer;
  storage.treasury = input.drop.salesProceedsAddress;
  storage.entropy_commitment = input.drop.entropyHead;
  storage.entropy_cursor = input.drop.entropyHead;
  storage.entropy_length = input.drop.entropyChainLength;
  storage.entropy_remaining = input.drop.entropyChainLength;
  storage.fulfillment_subsidy = input.drop.fulfillmentSubsidyMutez;
  storage.minter_royalty_config = {
    enabled: input.minterRoyalty.enabled,
    bps: input.minterRoyalty.bps,
    mode: input.minterRoyalty.mode,
    updater: input.drop.administrator,
  };
  const metadata = new MichelsonMap<string, string>();
  metadata.set("", Buffer.from(input.contractMetadataUri, "utf8").toString("hex"));
  storage.metadata = metadata;
  switch (input.drop.fulfillmentTrigger) {
    case "immediate": storage.release_policy = { immediate: UnitValue }; break;
    case "rolling_delay": storage.release_policy = { rolling_delay: input.drop.claimDelaySeconds }; break;
    case "absolute_time":
      if (!input.drop.fulfillmentScheduledAt) throw new Error("Scheduled fulfillment time is missing");
      storage.release_policy = { scheduled: input.drop.fulfillmentScheduledAt.toISOString() };
      break;
    case "sellout": storage.release_policy = { sellout: UnitValue }; break;
  }
  const encodedStorage = schema.Encode(storage);
  return {
    code: artifact.code,
    storage: encodedStorage,
    finalizer,
    abiVersion: artifact.templateVersion,
    protocolOperationDataLimitBytes: artifact.protocolOperationDataLimitBytes,
    codeDigest: artifact.codeDigest,
    storageDigest: hashMacaroniV35Payload(encodedStorage),
  };
}

export async function registerManagedMacaroniDrop(input: {
  ownerUserId: number;
  registration: Omit<MacaroniV35Registration, "proof">;
  administratorPublicKey: string;
}) {
  const registrationDigest = hashMacaroniV35Payload(input.registration);
  const readiness = managedMacaroniRuntimeReadiness(input.registration.network);
  const reserve = managedReserveEstimate();
  if (input.registration.contract) {
    throw new Error("Register the managed setup before origination, then use its durable origination attempt or exact-storage attachment; a new unrelated entropy chain will never be generated for a preexisting KT1");
  }
  const [created] = await db.insert(macaroniV35Drops).values({
    ownerUserId: input.ownerUserId,
    clientSetupId: input.registration.clientSetupId,
    registrationDigest,
    network: input.registration.network,
    contract: input.registration.contract || null,
    administrator: input.registration.administrator,
    administratorPublicKey: input.administratorPublicKey,
    provider: "wtfos_managed",
    assetStrategy: input.registration.assetStrategy,
    fulfillmentTrigger: input.registration.fulfillmentTrigger,
    claimDelaySeconds: input.registration.claimDelaySeconds,
    claimIntervalSeconds: input.registration.claimIntervalSeconds,
    fulfillmentScheduledAt: input.registration.fulfillmentScheduledAt
      ? new Date(input.registration.fulfillmentScheduledAt)
      : null,
    salesProceedsAddress: input.registration.salesProceedsAddress,
    serviceReady: false,
    abiVersion: null,
    abiValidatedAt: null,
    status: "setup_required",
    publicStatus: {
      state: "setup_required",
      message: readiness.reason,
      fulfilledClaims: 0,
      pendingClaims: 0,
    },
    physicalSupply: input.registration.physicalSupply,
    supplyFixedAt: new Date(),
    reserveEstimateVersion: reserve?.version ?? null,
    fulfillmentSubsidyMutez: reserve?.subsidy ?? 0,
    contractReserveRequiredMutez: reserve?.initialReserve ?? 0,
  }).onConflictDoNothing({
    target: [macaroniV35Drops.ownerUserId, macaroniV35Drops.clientSetupId],
  }).returning();

  const drop = created ?? (await db.select()
    .from(macaroniV35Drops)
    .where(and(
      eq(macaroniV35Drops.ownerUserId, input.ownerUserId),
      eq(macaroniV35Drops.clientSetupId, input.registration.clientSetupId)
    ))
    .limit(1))[0];
  if (!drop) throw new Error("Could not persist Macaroni V3.5 setup");
  if (drop.registrationDigest !== registrationDigest) {
    throw new Error("This setup id is already bound to a different immutable registration intent");
  }
  if (drop.administratorPublicKey !== input.administratorPublicKey) {
    throw new Error("This setup id is already bound to a different administrator public key");
  }

  if (!drop.entropyHead) {
    try {
      const keyrings = managedMacaroniV35EntropyKeyrings();
      await provisionManagedMacaroniEntropy({
        ownerUserId: input.ownerUserId,
        dropId: drop.id,
        keyMaterial: keyrings.primary.keys.get(keyrings.primary.activeVersion)!,
        keyVersion: keyrings.primary.activeVersion,
      });
    } catch {
      // Registration remains durable but fail-closed. Runtime readiness names
      // the missing entropy backup/keyring before origination or activation.
    }
  }

  return drop;
}

export async function pinManagedMacaroniV35PublicContractMetadata(input: {
  ownerUserId: number;
  dropId: number;
  registrationDigest: string;
  name: string;
  description: string;
  homepage?: string;
  coverFileName: string;
  coverMimeType: string;
  coverBytes: Buffer;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  if (drop.registrationDigest !== input.registrationDigest) {
    throw new Error("Registration digest does not match this immutable setup");
  }
  const requestDigest = hashMacaroniV35Payload({
    registrationDigest: input.registrationDigest,
    name: input.name,
    description: input.description,
    homepage: input.homepage || "",
    coverChecksumSha256: createHash("sha256").update(input.coverBytes).digest("hex"),
    coverMimeType: input.coverMimeType,
  });
  const existing = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, drop.id),
    eq(macaroniV35SetupSteps.stepKey, "public_contract_metadata")
  )).limit(1))[0];
  if (existing) {
    if ((existing.details as { requestDigest?: string }).requestDigest !== requestDigest) {
      throw new Error("Public collection metadata is already pinned and bound to different immutable input");
    }
    const pinned = existing.parameters as {
      contractMetadataUri?: string;
      coverUri?: string;
      contractMetadataCid?: string;
      coverCid?: string;
    } | null;
    if (existing.status === "complete") {
      if (!pinned?.contractMetadataUri || !pinned.coverUri) {
        throw new Error("Persisted public contract metadata binding is incomplete");
      }
      return { ...pinned, created: false as const };
    }
  }
  if (drop.contract) {
    throw new Error("Public contract metadata must be pinned and bound before origination");
  }
  if (!existing) {
    const now = new Date();
    const [reserved] = await db.insert(macaroniV35SetupSteps).values({
      dropId: drop.id,
      stepKey: "public_contract_metadata",
      status: "in_progress",
      intentDigest: requestDigest,
      expectedPostcondition: { tzip16MetadataAndCoverPinned: true },
      parameters: null,
      network: drop.network,
      signer: null,
      target: null,
      entrypoint: "offchain:public_contract_metadata",
      amountMutez: 0,
      details: { requestDigest, idempotentContentAddressedPins: true },
    }).onConflictDoNothing({
      target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
    }).returning();
    if (!reserved) {
      const raced = (await db.select().from(macaroniV35SetupSteps).where(and(
        eq(macaroniV35SetupSteps.dropId, drop.id),
        eq(macaroniV35SetupSteps.stepKey, "public_contract_metadata")
      )).limit(1))[0];
      if ((raced?.details as { requestDigest?: string } | undefined)?.requestDigest !== requestDigest) {
        throw new Error("Concurrent public metadata pinning was bound to different input");
      }
    }
  }
  const cover = await stageAndPinUpload({
    userId: input.ownerUserId,
    fileName: input.coverFileName || "macaroni-v35-cover",
    mimeType: input.coverMimeType || "application/octet-stream",
    buffer: input.coverBytes,
    source: "macaroni",
    scopeType: "macaroni_drop",
    scopeRef: `macaroni-v35:${drop.id}:contract-cover`,
    metadata: { dropId: drop.id, registrationDigest: drop.registrationDigest, public: true },
  });
  const metadata = {
    name: input.name,
    description: input.description,
    version: "1.0.0",
    authors: [drop.administrator],
    ...(input.homepage ? { homepage: input.homepage } : {}),
    interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
    imageUri: cover.ipfsUri,
  };
  const metadataBytes = Buffer.from(JSON.stringify(metadata), "utf8");
  const pinnedMetadata = await stageAndPinUpload({
    userId: input.ownerUserId,
    fileName: "contract_metadata.json",
    mimeType: "application/json",
    buffer: metadataBytes,
    source: "macaroni",
    scopeType: "macaroni_drop",
    scopeRef: `macaroni-v35:${drop.id}:contract-metadata`,
    metadata: { dropId: drop.id, registrationDigest: drop.registrationDigest, public: true },
  });
  const parameters = {
    contractMetadataUri: pinnedMetadata.ipfsUri,
    contractMetadataCid: pinnedMetadata.cid,
    coverUri: cover.ipfsUri,
    coverCid: cover.cid,
  };
  const now = new Date();
  const [completed] = await db.update(macaroniV35SetupSteps).set({
    status: "complete",
    intentDigest: hashMacaroniV35Payload({ requestDigest, parameters }),
    expectedPostcondition: { tzip16MetadataAndCoverPinned: true, contractMetadataUri: pinnedMetadata.ipfsUri },
    parameters,
    details: { requestDigest, idempotentContentAddressedPins: true },
    completedAt: now,
    updatedAt: now,
  }).where(and(
    eq(macaroniV35SetupSteps.dropId, drop.id),
    eq(macaroniV35SetupSteps.stepKey, "public_contract_metadata")
  )).returning();
  if (!completed) throw new Error("Could not persist the managed public metadata binding");
  return { ...parameters, created: true as const };
}

export async function getMacaroniV35CreatorSetup(input: { ownerUserId: number; dropId: number }) {
  const drop = (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.id, input.dropId),
    eq(macaroniV35Drops.ownerUserId, input.ownerUserId)
  )).limit(1))[0];
  if (!drop) return null;
  const [steps, attempts, assets, automation] = await Promise.all([
    db.select().from(macaroniV35SetupSteps)
      .where(eq(macaroniV35SetupSteps.dropId, drop.id))
      .orderBy(asc(macaroniV35SetupSteps.id)),
    db.select({
      id: macaroniV35OperationAttempts.id,
      setupStepId: macaroniV35OperationAttempts.setupStepId,
      requestId: macaroniV35OperationAttempts.requestId,
      intent: macaroniV35OperationAttempts.intent,
      intentDigest: macaroniV35OperationAttempts.intentDigest,
      expectedPostcondition: macaroniV35OperationAttempts.expectedPostcondition,
      state: macaroniV35OperationAttempts.state,
      parameters: macaroniV35OperationAttempts.parameters,
      network: macaroniV35OperationAttempts.network,
      signer: macaroniV35OperationAttempts.signer,
      target: macaroniV35OperationAttempts.target,
      entrypoint: macaroniV35OperationAttempts.entrypoint,
      amountMutez: macaroniV35OperationAttempts.amountMutez,
      operationHash: macaroniV35OperationAttempts.operationHash,
      originatedContract: macaroniV35OperationAttempts.originatedContract,
      error: macaroniV35OperationAttempts.error,
      submittedAt: macaroniV35OperationAttempts.submittedAt,
      appliedAt: macaroniV35OperationAttempts.appliedAt,
      reconciledAt: macaroniV35OperationAttempts.reconciledAt,
    }).from(macaroniV35OperationAttempts)
      .where(eq(macaroniV35OperationAttempts.dropId, drop.id))
      .orderBy(asc(macaroniV35OperationAttempts.id)),
    db.select({
      tokenId: macaroniV35PrivateAssets.tokenSlot,
      quantity: macaroniV35PrivateAssets.quantity,
      kind: macaroniV35PrivateAssets.kind,
      commitment: macaroniV35PrivateAssets.commitment,
      checksumSha256: macaroniV35PrivateAssets.checksumSha256,
      byteSize: macaroniV35PrivateAssets.byteSize,
      status: macaroniV35PrivateAssets.status,
    }).from(macaroniV35PrivateAssets)
      .where(eq(macaroniV35PrivateAssets.dropId, drop.id))
      .orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
    db.select({
      id: macaroniV35WorkItems.id,
      workType: macaroniV35WorkItems.workType,
      state: macaroniV35WorkItems.state,
      semanticKey: macaroniV35WorkItems.semanticKey,
      operationHash: macaroniV35WorkItems.operationHash,
      submittedAt: macaroniV35WorkItems.submittedAt,
      appliedAt: macaroniV35WorkItems.appliedAt,
      lastError: macaroniV35WorkItems.lastError,
      updatedAt: macaroniV35WorkItems.updatedAt,
    }).from(macaroniV35WorkItems)
      .where(eq(macaroniV35WorkItems.dropId, drop.id))
      .orderBy(asc(macaroniV35WorkItems.id)),
  ]);
  return {
    schema: MACARONI_V35_SETUP_SCHEMA,
    drop: {
      id: drop.id,
      clientSetupId: drop.clientSetupId,
      registrationDigest: drop.registrationDigest,
      network: drop.network,
      contract: drop.contract,
      administrator: drop.administrator,
      status: drop.status,
      serviceReady: drop.serviceReady,
      provider: drop.provider,
      assetStrategy: drop.assetStrategy,
      fulfillmentTrigger: drop.fulfillmentTrigger,
      entropyCommitment: {
        head: drop.entropyHead,
        chainLength: drop.entropyChainLength,
        version: drop.entropyRecoveryVersion,
        generated: Boolean(drop.entropyGeneratedAt),
      },
      funding: {
        reserveOwner: "drop_contract",
        subsidyPerClaimMutez: drop.fulfillmentSubsidyMutez,
        estimateVersion: drop.reserveEstimateVersion,
        requiredMutez: drop.contractReserveRequiredMutez,
        observedMutez: drop.contractReserveObservedMutez,
        operatorGasObservedMutez: drop.operatorGasObservedMutez,
        operatorGasReady: drop.operatorGasReady,
        evidence: managedReserveEstimate()?.evidence ?? null,
        fiveClaimInitialReserveMutez: managedReserveEstimate()?.initialReserve ?? null,
        finalizerLiquidStartupFloorMutez: managedReserveEstimate()?.operatorGasMinimum ?? null,
        freeStageRule: "physical_supply_times_subsidy",
      },
    },
    steps: steps.map((step) => ({
      id: step.id,
      key: step.stepKey,
      status: step.status,
      intentDigest: step.intentDigest,
      expectedPostcondition: step.expectedPostcondition,
      parameters: step.parameters,
      network: step.network,
      signer: step.signer,
      target: step.target,
      entrypoint: step.entrypoint,
      amountMutez: step.amountMutez,
      operationHash: step.operationHash,
      details: step.details,
      completedAt: step.completedAt,
    })),
    attempts,
    automation,
    privateInventory: assets,
    paths: {
      publicContractMetadata: `/api/macaroni/v35/drops/${drop.id}/public-contract-metadata`,
      privateAssets: `/api/macaroni/v35/drops/${drop.id}/private-assets`,
      nextAction: `/api/macaroni/v35/drops/${drop.id}/next-action`,
    },
    blocker: drop.serviceReady ? null : managedMacaroniRuntimeReadiness(drop.network),
  };
}

export async function provisionManagedMacaroniEntropy(input: {
  ownerUserId: number;
  dropId: number;
  keyMaterial: string;
  keyVersion: string;
}) {
  const drop = (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.id, input.dropId),
    eq(macaroniV35Drops.ownerUserId, input.ownerUserId)
  )).limit(1))[0];
  if (!drop) throw new Error("Macaroni V3.5 setup not found");
  if (!drop.physicalSupply || !drop.supplyFixedAt) throw new Error("Physical supply must be fixed before entropy generation");
  if (drop.entropyHead) return { head: drop.entropyHead, length: drop.entropyChainLength, created: false };
  const keyrings = managedMacaroniV35EntropyKeyrings();
  if (keyrings.primary.activeVersion !== input.keyVersion
    || keyrings.primary.keys.get(input.keyVersion) !== input.keyMaterial) {
    throw new Error("Entropy provisioning must use the configured active primary key version");
  }
  const chain = generateMacaroniV35EntropyChain({ physicalSupply: drop.physicalSupply });
  const encrypted = encryptMacaroniV35EntropySeed({
    seed: chain.seed,
    head: chain.head,
    length: chain.length,
    keyMaterial: input.keyMaterial,
    keyVersion: input.keyVersion,
  });
  const recoveryMaterial = keyrings.recovery.keys.get(keyrings.recovery.activeVersion)!;
  const encryptedRecovery = encryptMacaroniV35EntropySeed({
    seed: chain.seed,
    head: chain.head,
    length: chain.length,
    keyMaterial: recoveryMaterial,
    keyVersion: keyrings.recovery.activeVersion,
  });
  // Prove both independently encrypted copies regenerate the exact public
  // commitment before either reference becomes authoritative.
  decryptMacaroniV35EntropyWithKeyring({
    encrypted,
    keyring: keyrings.primary,
    expectedHead: chain.head,
    expectedLength: chain.length,
  });
  decryptMacaroniV35EntropyWithKeyring({
    encrypted: encryptedRecovery,
    keyring: keyrings.recovery,
    expectedHead: chain.head,
    expectedLength: chain.length,
  });
  const recoveryObject = await putObjectBuffer({
    key: `macaroni-v35/recovery/${drop.id}/${randomUUID()}.entropy.enc`,
    body: encryptedRecovery,
    contentType: "application/octet-stream",
    metadata: {
      format: "macaroni-v35-entropy-recovery-v1",
      keyVersion: keyrings.recovery.activeVersion,
    },
  });
  const recoveryReference = JSON.stringify({
    version: "macaroni-v35-entropy-recovery-object.v1",
    bucket: recoveryObject.bucket,
    key: recoveryObject.key,
  } satisfies MacaroniV35EntropyRecoveryReference);
  const [updated] = await db.update(macaroniV35Drops).set({
    encryptedEntropyManifestRef: encrypted,
    encryptedEntropyRecoveryRef: recoveryReference,
    entropyHead: chain.head,
    entropyChainLength: chain.length,
    entropyKeyVersion: input.keyVersion,
    entropyRecoveryKeyVersion: keyrings.recovery.activeVersion,
    entropyRecoveryVersion: MACARONI_V35_ENTROPY_VERSION,
    entropyGeneratedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(macaroniV35Drops.id, drop.id),
    eq(macaroniV35Drops.ownerUserId, input.ownerUserId),
    isNull(macaroniV35Drops.entropyHead)
  )).returning();
  // A racing provisioner may have won. Never return or expose either seed.
  if (!updated) {
    await deleteObject({ bucket: recoveryObject.bucket, key: recoveryObject.key }).catch(() => undefined);
    const winner = (await db.select({
      head: macaroniV35Drops.entropyHead,
      length: macaroniV35Drops.entropyChainLength,
    }).from(macaroniV35Drops).where(eq(macaroniV35Drops.id, drop.id)).limit(1))[0];
    if (!winner?.head) throw new Error("Could not persist Macaroni entropy commitment");
    return { ...winner, created: false };
  }
  return { head: updated.entropyHead, length: updated.entropyChainLength, created: true };
}

export async function verifyManagedMacaroniV35EntropyRecovery(
  drop: typeof macaroniV35Drops.$inferSelect
) {
  if (!drop.encryptedEntropyManifestRef || !drop.encryptedEntropyRecoveryRef
    || !drop.entropyHead || !drop.entropyChainLength
    || !drop.entropyKeyVersion || !drop.entropyRecoveryKeyVersion) {
    throw new Error("Managed entropy and its independent recovery object are incomplete");
  }
  const keyrings = managedMacaroniV35EntropyKeyrings();
  if (!keyrings.primary.keys.has(drop.entropyKeyVersion)
    || !keyrings.recovery.keys.has(drop.entropyRecoveryKeyVersion)) {
    throw new Error("A stored entropy key version is absent from the configured rotation keyrings");
  }
  const primary = decryptMacaroniV35EntropyWithKeyring({
    encrypted: drop.encryptedEntropyManifestRef,
    keyring: keyrings.primary,
    expectedHead: drop.entropyHead,
    expectedLength: drop.entropyChainLength,
  });
  const reference = parseEntropyRecoveryReference(drop.encryptedEntropyRecoveryRef);
  const workspace = await mkdtemp(path.join(tmpdir(), "macaroni-v35-recovery-check-"));
  const recoveryPath = path.join(workspace, "entropy.enc");
  try {
    await downloadObjectToFile({
      bucket: reference.bucket,
      key: reference.key,
      destinationPath: recoveryPath,
    });
    const encryptedRecovery = await readFile(recoveryPath, "utf8");
    const recovery = decryptMacaroniV35EntropyWithKeyring({
      encrypted: encryptedRecovery,
      keyring: keyrings.recovery,
      expectedHead: drop.entropyHead,
      expectedLength: drop.entropyChainLength,
    });
    if (!primary.seed.equals(recovery.seed)) {
      throw new Error("Independent entropy recovery does not contain the committed primary seed");
    }
    return {
      ready: true as const,
      head: drop.entropyHead,
      length: drop.entropyChainLength,
      primaryKeyVersion: primary.keyVersion,
      recoveryKeyVersion: recovery.keyVersion,
    };
  } finally {
    primary.seed.fill(0);
    await rm(workspace, { recursive: true, force: true });
  }
}

export function recoverManagedMacaroniV35Entropy(
  drop: typeof macaroniV35Drops.$inferSelect
) {
  if (!drop.encryptedEntropyManifestRef || !drop.entropyHead || !drop.entropyChainLength) {
    throw new Error("Managed entropy is incomplete");
  }
  const { primary } = managedMacaroniV35EntropyKeyrings();
  return decryptMacaroniV35EntropyWithKeyring({
    encrypted: drop.encryptedEntropyManifestRef,
    keyring: primary,
    expectedHead: drop.entropyHead,
    expectedLength: drop.entropyChainLength,
  });
}

const v35TokenSetupParameters = z.array(z.object({
  token_id: z.number().int().nonnegative(),
  metadata_commitment: z.string().regex(/^[0-9a-f]{64}$/i).transform((value) => value.toLowerCase()),
  quantity: z.number().int().positive(),
})).nonempty();

const v35SlotAppendParameters = z.array(z.object({
  token_id: z.number().int().nonnegative(),
  count: z.number().int().positive(),
})).nonempty();

const v35OriginationParameters = z.object({
  contract_metadata_uri: z.string().regex(/^ipfs:\/\/[^\s]+$/),
  minter_royalty: z.object({
    enabled: z.boolean(),
    bps: z.number().int().min(0).max(10_000),
    mode: z.number().int().nonnegative(),
  }),
});

const v35StageSetupParameters = z.array(z.object({
  stage: z.number().int().nonnegative(),
  start: z.string().datetime({ offset: true }),
  price_mutez: z.number().int().nonnegative(),
  use_allowlist: z.boolean(),
  max_per_wallet: z.number().int().positive().nullable(),
})).nonempty();

const v35AllowlistSetupParameters = z.array(z.object({
  capacity: z.number().int().nonnegative(),
  holder: z.string().regex(/^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/),
  stage: z.number().int().nonnegative(),
}));

type CreatorStepKey = "reveal_creator_key" | "originate_contract" | typeof ATTACHED_SETUP_ORDER[number] | "close_sale";

function parseCreatorStepParameters(stepKey: CreatorStepKey, value: unknown) {
  switch (stepKey) {
    case "originate_contract": return v35OriginationParameters.parse(value);
    case "add_tokens_v35": return v35TokenSetupParameters.parse(value);
    case "append_token_slots_v35": return v35SlotAppendParameters.parse(value);
    case "set_stages": return v35StageSetupParameters.parse(value);
    case "set_allowlist": return v35AllowlistSetupParameters.parse(value);
    case "reveal_creator_key":
    case "finalize_setup":
    case "fund_fulfillment_reserve":
    case "activate_sale":
    case "close_sale":
      if (value !== null) throw new Error(`${stepKey} parameters must be null (Michelson unit)`);
      return null;
  }
}

function unwrapEntrypointRouting(value: any): unknown {
  let cursor = value;
  while (
    cursor
    && (cursor.prim === "Left" || cursor.prim === "Right")
    && Array.isArray(cursor.args)
    && cursor.args.length === 1
  ) cursor = cursor.args[0];
  return cursor;
}

async function encodeCreatorEntrypointParameters(
  stepKey: Exclude<CreatorStepKey, "originate_contract" | "reveal_creator_key">,
  value: unknown
) {
  const artifact = await readMacaroniV35Artifact();
  const schema = new ParameterSchema(artifact.parameterType as never);
  let walletValue = value;
  if (stepKey === "set_stages") {
    const stages = new MichelsonMap<number, Record<string, unknown>>();
    for (const stage of value as z.infer<typeof v35StageSetupParameters>) {
      stages.set(stage.stage, {
        start: stage.start,
        price: stage.price_mutez,
        use_allowlist: stage.use_allowlist,
        max_per_wallet: stage.max_per_wallet,
      });
    }
    walletValue = stages;
  } else if (stepKey === "finalize_setup" || stepKey === "fund_fulfillment_reserve"
    || stepKey === "activate_sale" || stepKey === "close_sale") {
    walletValue = UnitValue;
  }
  const full = schema.EncodeObject({ [stepKey]: walletValue });
  return { full, value: unwrapEntrypointRouting(full) };
}

function creatorStepExpectedPostcondition(input: {
  stepKey: CreatorStepKey;
  parameters: unknown;
  amountMutez: number;
  batchIndex?: number;
}) {
  switch (input.stepKey) {
    case "reveal_creator_key":
      return { managerKeyRevealed: true, separateFromOrigination: true };
    case "originate_contract":
      return {
        exactReviewedCodeAndStorage: true,
        administratorControlsContract: true,
        codeDigest: (input.parameters as Record<string, unknown>).codeDigest,
        storageDigest: (input.parameters as Record<string, unknown>).storageDigest,
      };
    case "add_tokens_v35":
      return { tokenCommitmentsMatchPrivateStaging: true, inventoryAddedBeforeFinalize: true };
    case "append_token_slots_v35":
      return { canonicalPhysicalSlotsAppended: true, inventorySlotsCompleteBeforeFinalize: true };
    case "set_stages":
      return { stagesMatchIntent: true, stageCount: (input.parameters as unknown[]).length };
    case "set_allowlist":
      return { allowlistMatchesIntent: true, rowCount: (input.parameters as unknown[]).length };
    case "finalize_setup":
      return { setup_finalized: true, inventoryAndSaleConfigImmutable: true };
    case "fund_fulfillment_reserve":
      return { contractBalanceIncreaseMutez: input.amountMutez, reserveOwner: "drop_contract" };
    case "activate_sale":
      return { sale_active: true, activationIsFinalSetupStep: true };
    case "close_sale":
      return { sale_permanently_closed: true, sale_active: false, irreversible: true };
  }
}

async function ownedMacaroniV35Drop(input: { ownerUserId: number; dropId: number }) {
  return (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.id, input.dropId),
    eq(macaroniV35Drops.ownerUserId, input.ownerUserId)
  )).limit(1))[0] ?? null;
}

export async function attachManagedMacaroniV35Contract(input: {
  ownerUserId: number;
  dropId: number;
  registrationDigest: string;
  contract: string;
  proof: MacaroniV35RegistrationProof;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  if (drop.registrationDigest !== input.registrationDigest) {
    throw new Error("Registration digest does not match this immutable setup");
  }
  if (drop.contract && drop.contract !== input.contract) {
    throw new Error("This setup is already attached to a different contract");
  }
  await verifyMacaroniV35RegistrationProof({
    clientSetupId: drop.clientSetupId,
    network: drop.network,
    contract: input.contract,
    administrator: drop.administrator,
  }, input.proof);
  const originationStep = (await db.select({
    parameters: macaroniV35SetupSteps.parameters,
    intentDigest: macaroniV35SetupSteps.intentDigest,
    amountMutez: macaroniV35SetupSteps.amountMutez,
  }).from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, drop.id),
    eq(macaroniV35SetupSteps.stepKey, "originate_contract")
  )).limit(1))[0];
  const expectedStorage = (originationStep?.parameters as { storage?: unknown } | null)?.storage;
  const expectedCode = (originationStep?.parameters as { code?: unknown } | null)?.code;
  if (!originationStep || expectedCode == null || expectedStorage == null) {
    throw new Error("Attach requires the exact storage from this setup's durable origination intent");
  }
  const finality = await managedSetupFinalityContext(drop.network);
  const originations = await V35_TZKT[drop.network].getJson<Array<{
    level?: number;
    status?: string;
    sender?: { address?: string };
    originatedContract?: { address?: string };
    contractBalance?: number | string;
    code?: unknown;
    storage?: unknown;
  }>>(`/operations/originations?originatedContract=${encodeURIComponent(input.contract)}&status=applied&micheline=2&limit=10`);
  const exactFinalOrigination = originations.find((row) => row.status === "applied"
    && row.sender?.address === drop.administrator
    && row.originatedContract?.address === input.contract
    && Number(row.contractBalance ?? 0) === originationStep.amountMutez
    && hashMacaroniV35Payload(row.code) === hashMacaroniV35Payload(expectedCode)
    && hashMacaroniV35Payload(row.storage) === hashMacaroniV35Payload(expectedStorage)
    && Number.isSafeInteger(row.level)
    && Number(row.level) <= finality.finalizedBlock);
  if (!exactFinalOrigination) {
    throw new Error("The exact origination is not yet indexed with the required successor block; reconcile it before attaching");
  }
  const attached = await validateAttachedMacaroniV35Contract({
    network: drop.network,
    contract: input.contract,
    administrator: drop.administrator,
    drop,
    block: finality.finalizedBlock,
  });
  if (hashMacaroniV35Payload(expectedStorage) !== hashMacaroniV35Payload(attached.rawStorage)) {
    throw new Error("Attach requires the exact finalized storage from this setup's durable origination intent");
  }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(macaroniV35Drops).set({
      contract: input.contract,
      abiVersion: attached.templateVersion,
      abiValidatedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35Drops.id, drop.id),
      eq(macaroniV35Drops.ownerUserId, input.ownerUserId),
      or(isNull(macaroniV35Drops.contract), eq(macaroniV35Drops.contract, input.contract))
    )).returning();
    if (!updated) throw new Error("Could not attach the originated contract");
    const parameters = { contractCodeDigest: attached.codeDigest, originatedContract: input.contract };
    const expectedPostcondition = {
      exactReviewedCode: true,
      administrator: drop.administrator,
      originatedContract: input.contract,
    };
    await tx.insert(macaroniV35SetupSteps).values({
      dropId: drop.id,
      stepKey: "originate_contract",
      status: "complete",
      intentDigest: hashMacaroniV35Payload({ parameters, expectedPostcondition }),
      expectedPostcondition,
      parameters,
      network: drop.network,
      signer: drop.administrator,
      target: null,
      entrypoint: "origination",
      amountMutez: 0,
      completedAt: now,
      details: {
        reconciledBy: "wallet_proof_exact_origination_and_successor_block",
        contractCodeDigest: attached.codeDigest,
        finalizedBlock: finality.finalizedBlock,
      },
    }).onConflictDoNothing({
      target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
    });
    await tx.update(macaroniV35SetupSteps).set({
      status: "complete",
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35SetupSteps.dropId, drop.id),
      eq(macaroniV35SetupSteps.stepKey, "originate_contract")
    ));
    return updated;
  });
  return {
    dropId: result.id,
    contract: result.contract,
    abiVersion: result.abiVersion,
    abiValidatedAt: result.abiValidatedAt,
    nextStepKey: "add_tokens_v35" as const,
  };
}

async function assertCreatorStepPrerequisites(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  stepKey: CreatorStepKey;
  parameters: unknown;
  amountMutez: number;
  batchIndex?: number;
}) {
  if (input.stepKey === "reveal_creator_key") {
    if (input.drop.contract) throw new Error("Creator key reveal must be completed before contract origination");
    if (input.parameters !== null || input.amountMutez !== 1) {
      throw new Error("Creator key reveal must be the reviewed one-mutez self-transfer with no parameters");
    }
    return;
  }
  if (input.stepKey === "originate_contract") {
    if (input.drop.contract) throw new Error("This setup is already attached to an originated contract");
    const staged = (await db.select({ status: macaroniV35SetupSteps.status })
      .from(macaroniV35SetupSteps).where(and(
        eq(macaroniV35SetupSteps.dropId, input.drop.id),
        eq(macaroniV35SetupSteps.stepKey, "stage_private_assets")
    )).limit(1))[0];
    if (staged?.status !== "complete") throw new Error("Complete private staging before preparing contract origination");
    const revealed = (await db.select({ status: macaroniV35SetupSteps.status })
      .from(macaroniV35SetupSteps).where(and(
        eq(macaroniV35SetupSteps.dropId, input.drop.id),
        eq(macaroniV35SetupSteps.stepKey, "reveal_creator_key")
      )).limit(1))[0];
    if (revealed?.status !== "complete") throw new Error("Finalize the creator public-key reveal before preparing origination");
    if (input.amountMutez !== 0) throw new Error("Contract origination setup must not transfer tez");
    return;
  }
  if (!input.drop.contract || !input.drop.abiValidatedAt) {
    throw new Error("Attach and reconcile the reviewed V3.5 contract before preparing this step");
  }
  const requiredByStep: Record<Exclude<CreatorStepKey, "originate_contract" | "reveal_creator_key">, string[]> = {
    add_tokens_v35: ["stage_private_assets", "originate_contract"],
    append_token_slots_v35: ["inventory_declared", "originate_contract"],
    set_stages: ["inventory_complete", "originate_contract"],
    set_allowlist: ["set_stages", "originate_contract"],
    finalize_setup: ["inventory_complete", "set_stages", "allowlist_complete", "originate_contract"],
    fund_fulfillment_reserve: ["finalize_setup"],
    activate_sale: ["fund_fulfillment_reserve", "fulfillment_armed"],
    close_sale: ["originate_contract"],
  };
  const requiredStepKeys = requiredByStep[
    input.stepKey as Exclude<CreatorStepKey, "originate_contract" | "reveal_creator_key">
  ];
  const required = await db.select({
    key: macaroniV35SetupSteps.stepKey,
    status: macaroniV35SetupSteps.status,
  }).from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    inArray(macaroniV35SetupSteps.stepKey, requiredStepKeys)
  ));
  const complete = new Set(required.filter((step) => step.status === "complete").map((step) => step.key));
  const missing = requiredStepKeys.filter((key) => !complete.has(key));
  if (missing.length) throw new Error(`Complete required setup step(s) first: ${missing.join(", ")}`);

  if (input.stepKey === "close_sale") {
    if (input.drop.status === "closed" || input.drop.status === "completed" || input.drop.status === "cancelled") {
      throw new Error("This sale is already permanently closed or complete");
    }
  } else if (input.drop.status === "closed" || input.drop.status === "completed" || input.drop.status === "cancelled") {
    throw new Error("This drop has left creator setup and cannot accept another setup operation");
  }

  if (input.stepKey === "add_tokens_v35") {
    const tokens = input.parameters as z.infer<typeof v35TokenSetupParameters>;
    const ids = tokens.map((token) => token.token_id);
    if (new Set(ids).size !== ids.length || ids.some((tokenId, index) => index > 0 && tokenId !== ids[index - 1] + 1)) {
      throw new Error("Each inventory batch must contain unique contiguous token ids in ascending order");
    }
    const metadataAssets = await db.select({
      tokenSlot: macaroniV35PrivateAssets.tokenSlot,
      commitment: macaroniV35PrivateAssets.commitment,
      quantity: macaroniV35PrivateAssets.quantity,
    }).from(macaroniV35PrivateAssets).where(and(
      eq(macaroniV35PrivateAssets.dropId, input.drop.id),
      eq(macaroniV35PrivateAssets.kind, "metadata"),
      inArray(macaroniV35PrivateAssets.commitment, tokens.map((token) => token.metadata_commitment))
    ));
    const staged = new Map(metadataAssets.map((asset) => [asset.tokenSlot, asset]));
    if (metadataAssets.length !== tokens.length || tokens.some((token) => {
      const asset = staged.get(token.token_id);
      return asset?.commitment !== token.metadata_commitment || asset.quantity !== token.quantity;
    })) {
      throw new Error("Every on-chain token commitment must match one exact privately staged metadata CAR");
    }
    const preparedBatches = await db.select({
      status: macaroniV35SetupSteps.status,
      parameters: macaroniV35SetupSteps.parameters,
      details: macaroniV35SetupSteps.details,
    }).from(macaroniV35SetupSteps).where(eq(macaroniV35SetupSteps.dropId, input.drop.id));
    const usedTokenIds = new Set<number>();
    const priorBatchIndexes: number[] = [];
    for (const batch of preparedBatches) {
      const details = batch.details as { logicalStep?: string; batchIndex?: number };
      if (details.logicalStep !== "add_tokens_v35" || details.batchIndex === input.batchIndex) continue;
      if (!Number.isSafeInteger(details.batchIndex) || batch.status !== "complete") {
        throw new Error("Reconcile the prior inventory declaration batch before preparing the next batch");
      }
      priorBatchIndexes.push(details.batchIndex!);
      const wallet = (batch.parameters as { wallet?: Array<{ token_id?: number }> } | null)?.wallet ?? [];
      for (const row of wallet) if (Number.isSafeInteger(row.token_id)) usedTokenIds.add(Number(row.token_id));
    }
    priorBatchIndexes.sort((left, right) => left - right);
    if (input.batchIndex !== priorBatchIndexes.length
      || priorBatchIndexes.some((value, index) => value !== index)) {
      throw new Error("Inventory declaration batch indexes must be contiguous and applied in order from zero");
    }
    if (tokens.some((token) => usedTokenIds.has(token.token_id))) {
      throw new Error("Inventory batches cannot overlap token ids");
    }
    if (tokens[0].token_id !== usedTokenIds.size) {
      throw new Error("Inventory token ids must remain globally contiguous across batches from token zero");
    }
  }
  if (input.stepKey === "append_token_slots_v35") {
    const items = input.parameters as z.infer<typeof v35SlotAppendParameters>;
    const [metadataAssets, setupSteps] = await Promise.all([
      db.select({
        tokenSlot: macaroniV35PrivateAssets.tokenSlot,
        quantity: macaroniV35PrivateAssets.quantity,
      }).from(macaroniV35PrivateAssets).where(and(
        eq(macaroniV35PrivateAssets.dropId, input.drop.id),
        eq(macaroniV35PrivateAssets.kind, "metadata")
      )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
      db.select({
        status: macaroniV35SetupSteps.status,
        parameters: macaroniV35SetupSteps.parameters,
        details: macaroniV35SetupSteps.details,
      }).from(macaroniV35SetupSteps).where(eq(macaroniV35SetupSteps.dropId, input.drop.id)),
    ]);
    if (!metadataAssets.length || metadataAssets.some((asset, index) => asset.tokenSlot !== index)) {
      throw new Error("Canonical slot loading requires a complete, contiguous private inventory");
    }
    const priorBatches = setupSteps
      .map((step) => ({
        ...step,
        logicalStep: (step.details as { logicalStep?: string }).logicalStep,
        batchIndex: (step.details as { batchIndex?: number }).batchIndex,
      }))
      .filter((step) => step.logicalStep === "append_token_slots_v35" && step.batchIndex !== input.batchIndex)
      .sort((left, right) => Number(left.batchIndex) - Number(right.batchIndex));
    if (priorBatches.some((step, index) => step.batchIndex !== index || step.status !== "complete")
      || input.batchIndex !== priorBatches.length) {
      throw new Error("Slot append batches must be contiguous and reconciled in order from zero");
    }
    const allItems = priorBatches.flatMap((step) =>
      (step.parameters as { wallet?: z.infer<typeof v35SlotAppendParameters> } | null)?.wallet ?? []
    ).concat(items);
    const loaded = new Map<number, number>();
    let nextTokenId = 0;
    for (const item of allItems) {
      const declared = metadataAssets[nextTokenId];
      if (!declared || item.token_id !== nextTokenId) {
        throw new Error("Slot rows must follow the contract's canonical token order");
      }
      const after = (loaded.get(nextTokenId) ?? 0) + item.count;
      if (after > declared.quantity) throw new Error("A slot batch cannot exceed the declared edition quantity");
      loaded.set(nextTokenId, after);
      if (after === declared.quantity) nextTokenId += 1;
    }
  }
  if (input.stepKey === "set_allowlist") {
    const completed = (await db.select({ status: macaroniV35SetupSteps.status })
      .from(macaroniV35SetupSteps).where(and(
        eq(macaroniV35SetupSteps.dropId, input.drop.id),
        eq(macaroniV35SetupSteps.stepKey, "allowlist_complete")
      )).limit(1))[0];
    if (completed?.status === "complete") {
      throw new Error("The logical allowlist phase is already complete and cannot accept another batch");
    }
  }
  if (input.stepKey === "fund_fulfillment_reserve") {
    if (input.drop.contractReserveRequiredMutez <= 0) {
      throw new Error("A measured reserve estimate is required before funding can be prepared");
    }
    if (input.amountMutez < input.drop.contractReserveRequiredMutez) {
      throw new Error("Funding amount must cover the measured contract reserve requirement");
    }
  } else if (input.amountMutez !== 0) {
    throw new Error(`${input.stepKey} must not transfer tez`);
  }
  if (input.stepKey === "activate_sale") {
    const runtime = managedMacaroniRuntimeReadiness(input.drop.network);
    if (!runtime.ready || !managedMacaroniV35AssetRuntimeConfigured()) {
      throw new Error("Sale activation is blocked until automatic fulfillment passes every readiness check");
    }
    await verifyManagedMacaroniV35EntropyRecovery(input.drop);
    await recheckManagedMacaroniV35IndexedDuplicates(input.drop.id);
    const observedBalance = await readMacaroniV35ContractBalance(input.drop.network, input.drop.contract!);
    if (!input.drop.operatorAddress) throw new Error("Managed finalizer address is missing from the reviewed origination");
    const operator = await readManagedMacaroniV35OperatorReadiness(
      input.drop.network,
      input.drop.operatorAddress
    );
    const attached = await readAttachedMacaroniV35Contract({
      network: input.drop.network,
      contract: input.drop.contract!,
    });
    const ready = observedBalance >= input.drop.contractReserveRequiredMutez
      && operator.ready
      && attached.storage.fulfillment_armed === true;
    await db.update(macaroniV35Drops).set({
      contractReserveObservedMutez: observedBalance,
      operatorGasObservedMutez: operator.balance,
      operatorGasReady: operator.ready,
      serviceReady: ready,
      updatedAt: new Date(),
    }).where(eq(macaroniV35Drops.id, input.drop.id));
    if (observedBalance < input.drop.contractReserveRequiredMutez) {
      throw new Error("The contract-held fulfillment reserve has not been observed on-chain");
    }
    if (!operator.ready) {
      throw new Error(operator.keyRevealed
        ? "Managed finalizer wallet is below the measured operation-gas reserve"
        : "Managed finalizer public key has not been revealed on-chain");
    }
    if (attached.storage.fulfillment_armed !== true) {
      throw new Error("The managed finalizer has not yet confirmed and armed automatic fulfillment");
    }
  }
}

async function completeLogicalSetupStep(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  stepKey: "inventory_declared" | "inventory_complete" | "allowlist_complete";
  expectedPostcondition: Record<string, unknown>;
  details: Record<string, unknown>;
}) {
  const intentDigest = hashMacaroniV35Payload({
    stepKey: input.stepKey,
    expectedPostcondition: input.expectedPostcondition,
    details: input.details,
  });
  const now = new Date();
  const [created] = await db.insert(macaroniV35SetupSteps).values({
    dropId: input.drop.id,
    stepKey: input.stepKey,
    status: "complete",
    intentDigest,
    expectedPostcondition: input.expectedPostcondition,
    parameters: null,
    network: input.drop.network,
    signer: null,
    target: input.drop.contract,
    entrypoint: `offchain:${input.stepKey}`,
    amountMutez: 0,
    details: input.details,
    completedAt: now,
  }).onConflictDoNothing({
    target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
  }).returning();
  if (created) return created;
  const existing = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    eq(macaroniV35SetupSteps.stepKey, input.stepKey)
  )).limit(1))[0];
  if (!existing || existing.intentDigest !== intentDigest) {
    throw new Error(`${input.stepKey} is already bound to a different immutable completion proof`);
  }
  return existing;
}

async function refreshLogicalSetupPhases(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  appliedAttempt: typeof macaroniV35OperationAttempts.$inferSelect;
}) {
  if (input.appliedAttempt.entrypoint === "add_tokens_v35") {
    const [metadataAssets, setupSteps] = await Promise.all([
      db.select({
        tokenSlot: macaroniV35PrivateAssets.tokenSlot,
        quantity: macaroniV35PrivateAssets.quantity,
        commitment: macaroniV35PrivateAssets.commitment,
      }).from(macaroniV35PrivateAssets).where(and(
        eq(macaroniV35PrivateAssets.dropId, input.drop.id),
        eq(macaroniV35PrivateAssets.kind, "metadata")
      )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
      db.select({
        status: macaroniV35SetupSteps.status,
        parameters: macaroniV35SetupSteps.parameters,
        details: macaroniV35SetupSteps.details,
      }).from(macaroniV35SetupSteps).where(eq(macaroniV35SetupSteps.dropId, input.drop.id)),
    ]);
    const appliedRows: Array<{ token_id: number; metadata_commitment: string; quantity: number }> = [];
    for (const step of setupSteps) {
      const details = step.details as { logicalStep?: string };
      if (details.logicalStep !== "add_tokens_v35" || step.status !== "complete") continue;
      const walletRows = (step.parameters as { wallet?: typeof appliedRows } | null)?.wallet ?? [];
      appliedRows.push(...walletRows);
    }
    const exact = metadataAssets.length > 0
      && metadataAssets.length === appliedRows.length
      && metadataAssets.every((asset, index) => {
        const row = appliedRows.find((candidate) => candidate.token_id === asset.tokenSlot);
        return asset.tokenSlot === index
          && row?.metadata_commitment === asset.commitment
          && row.quantity === asset.quantity;
      })
      && new Set(appliedRows.map((row) => row.token_id)).size === appliedRows.length;
    const physicalSupply = metadataAssets.reduce((sum, asset) => sum + asset.quantity, 0);
    if (exact && physicalSupply === input.drop.physicalSupply) {
      await completeLogicalSetupStep({
        drop: input.drop,
        stepKey: "inventory_declared",
        expectedPostcondition: {
          exactOnChainCommitments: true,
          tokenRows: metadataAssets.length,
          physicalSupply,
        },
        details: { noWalletTransaction: true, completedFrom: "applied_add_tokens_v35_batches" },
      });
    }
  }

  if (input.appliedAttempt.entrypoint === "append_token_slots_v35") {
    const [metadataAssets, setupSteps, attached] = await Promise.all([
      db.select({
        tokenSlot: macaroniV35PrivateAssets.tokenSlot,
        quantity: macaroniV35PrivateAssets.quantity,
      }).from(macaroniV35PrivateAssets).where(and(
        eq(macaroniV35PrivateAssets.dropId, input.drop.id),
        eq(macaroniV35PrivateAssets.kind, "metadata")
      )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
      db.select({
        status: macaroniV35SetupSteps.status,
        parameters: macaroniV35SetupSteps.parameters,
        details: macaroniV35SetupSteps.details,
      }).from(macaroniV35SetupSteps).where(eq(macaroniV35SetupSteps.dropId, input.drop.id)),
      readAttachedMacaroniV35Contract({
        network: input.drop.network,
        contract: input.drop.contract!,
      }),
    ]);
    const appliedItems = setupSteps
      .filter((step) => (step.details as { logicalStep?: string }).logicalStep === "append_token_slots_v35"
        && step.status === "complete")
      .sort((left, right) => Number((left.details as { batchIndex?: number }).batchIndex)
        - Number((right.details as { batchIndex?: number }).batchIndex))
      .flatMap((step) =>
        (step.parameters as { wallet?: z.infer<typeof v35SlotAppendParameters> } | null)?.wallet ?? []
      );
    const loadedByToken = new Map<number, number>();
    for (const item of appliedItems) {
      loadedByToken.set(item.token_id, (loadedByToken.get(item.token_id) ?? 0) + item.count);
    }
    const physicalSupply = metadataAssets.reduce((sum, asset) => sum + asset.quantity, 0);
    const exactOffchainSlots = metadataAssets.length > 0
      && metadataAssets.every((asset, index) => asset.tokenSlot === index
        && loadedByToken.get(asset.tokenSlot) === asset.quantity)
      && appliedItems.reduce((sum, item) => sum + item.count, 0) === physicalSupply;
    const exactOnchainSlots = storageNat(attached.storage, "slots_loaded") === physicalSupply
      && storageNat(attached.storage, "supply") === physicalSupply
      && storageNat(attached.storage, "next_slot_token_id") === metadataAssets.length
      && storageNat(attached.storage, "token_count") === metadataAssets.length;
    if (exactOffchainSlots && exactOnchainSlots && physicalSupply === input.drop.physicalSupply) {
      await completeLogicalSetupStep({
        drop: input.drop,
        stepKey: "inventory_complete",
        expectedPostcondition: {
          tokenRows: metadataAssets.length,
          physicalSupply,
          slotsLoaded: physicalSupply,
          nextSlotTokenId: metadataAssets.length,
        },
        details: { noWalletTransaction: true, completedFrom: "applied_append_token_slots_v35_batches" },
      });
    }
  }

  if (input.appliedAttempt.entrypoint === "set_stages") {
    const stages = (input.appliedAttempt.parameters as {
      wallet?: Array<{ use_allowlist?: boolean; price_mutez?: number }>;
    } | null)?.wallet ?? [];
    if (stages.some((stage) => stage.price_mutez === 0)) {
      const required = Number(input.drop.physicalSupply || 0) * input.drop.fulfillmentSubsidyMutez;
      if (!Number.isSafeInteger(required) || required <= 0) {
        throw new Error("Free-mint reserve requirement exceeds safe precision or has no measured subsidy");
      }
      // A free purchase retains no per-sale subsidy. Reserve the full possible
      // free-supply liability so collections above five claims cannot deadlock.
      await db.update(macaroniV35Drops).set({
        contractReserveRequiredMutez: Math.max(input.drop.contractReserveRequiredMutez, required),
        updatedAt: new Date(),
      }).where(eq(macaroniV35Drops.id, input.drop.id));
    }
    if (!stages.some((stage) => stage.use_allowlist === true)) {
      await completeLogicalSetupStep({
        drop: input.drop,
        stepKey: "allowlist_complete",
        expectedPostcondition: { required: false, rowCount: 0 },
        details: {
          noWalletTransaction: true,
          reason: "No configured sale stage uses an allowlist",
        },
      });
    }
  }

  if (input.appliedAttempt.entrypoint === "set_allowlist" && input.appliedAttempt.setupStepId) {
    const current = (await db.select({ details: macaroniV35SetupSteps.details })
      .from(macaroniV35SetupSteps)
      .where(eq(macaroniV35SetupSteps.id, input.appliedAttempt.setupStepId)).limit(1))[0];
    const isFinalBatch = (current?.details as { finalBatch?: boolean } | undefined)?.finalBatch === true;
    if (!isFinalBatch) return;
    const batches = await db.select({
      status: macaroniV35SetupSteps.status,
      parameters: macaroniV35SetupSteps.parameters,
      details: macaroniV35SetupSteps.details,
    }).from(macaroniV35SetupSteps).where(eq(macaroniV35SetupSteps.dropId, input.drop.id));
    const allowlistBatches = batches.filter((step) =>
      (step.details as { logicalStep?: string }).logicalStep === "set_allowlist"
    );
    if (!allowlistBatches.length || allowlistBatches.some((step) => step.status !== "complete")) return;
    const rows = allowlistBatches.flatMap((step) =>
      (step.parameters as { wallet?: Array<{ holder: string; stage: number; capacity: number }> } | null)?.wallet ?? []
    );
    const semanticRows = rows.map((row) => `${row.stage}:${row.holder}`);
    if (new Set(semanticRows).size !== semanticRows.length) {
      throw new Error("Applied allowlist batches contain duplicate stage/holder rows");
    }
    await completeLogicalSetupStep({
      drop: input.drop,
      stepKey: "allowlist_complete",
      expectedPostcondition: { required: true, rowCount: rows.length, allBatchesApplied: true },
      details: { noWalletTransaction: true, completedFrom: "applied_set_allowlist_batches" },
    });
  }
}

type MacaroniV35LiveEstimate = {
  source: "live_tezos_rpc_estimate";
  operationSizeSource: "taquito_signed_estimate" | "exact_studio_padded_forge";
  opSize: number;
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
  totalCostMutez: number;
};

function estimateNumber(value: unknown, label: string) {
  const candidate = value && typeof value === "object" && "toNumber" in value
    && typeof (value as { toNumber?: unknown }).toNumber === "function"
    ? (value as { toNumber: () => number }).toNumber()
    : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`Tezos live estimate returned an invalid ${label}`);
  }
  return candidate;
}

export function macaroniV35OperationSizeWithinProtocolLimit(opSize: number, limit: number) {
  return Number.isSafeInteger(opSize) && opSize > 0
    && Number.isSafeInteger(limit) && limit > 0
    && opSize <= limit;
}

export async function macaroniV35LargestAcceptedBatch<T, R>(input: {
  maximumUnits: number;
  build: (units: number) => T;
  evaluate: (candidate: T) => Promise<R>;
}) {
  if (!Number.isSafeInteger(input.maximumUnits) || input.maximumUnits < 1) {
    throw new Error("A measured setup batch requires at least one remaining unit");
  }
  let low = 1;
  let high = input.maximumUnits;
  let accepted: { candidate: T; result: R; units: number } | null = null;
  let lastError: unknown;
  while (low <= high) {
    const units = Math.floor((low + high) / 2);
    const candidate = input.build(units);
    try {
      const result = await input.evaluate(candidate);
      accepted = { candidate, result, units };
      low = units + 1;
    } catch (error) {
      lastError = error;
      high = units - 1;
    }
  }
  if (!accepted) throw lastError ?? new Error("No setup batch fits the current Tezos operation limits");
  return accepted;
}

type MacaroniV35StudioPaddedLimits = {
  gasLimit: number;
  storageLimit: number;
  feeMutez: number;
};

/**
 * This is intentionally byte-for-byte policy parity with Studio's
 * `paddedSecureActionLimits`. Batch acceptance must forge with the limits the
 * wallet will actually receive, because padding a Zarith field can make the
 * final operation larger than Taquito's simulated estimate.
 */
export function macaroniV35StudioPaddedLimits(input: {
  opSize: number;
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
}): MacaroniV35StudioPaddedLimits {
  const opSize = estimateNumber(input.opSize, "operation size");
  const estimatedGas = estimateNumber(input.gasLimit, "gas limit");
  const estimatedStorage = estimateNumber(input.storageLimit, "storage limit");
  const estimatedFee = estimateNumber(input.suggestedFeeMutez, "suggested fee");
  if (opSize <= 0) throw new Error("Tezos live estimate returned an empty operation size");
  const gasLimit = Math.min(1_040_000, Math.ceil(estimatedGas * 1.65) + 40_000);
  const storageLimit = Math.min(60_000, Math.ceil(estimatedStorage * 1.5) + 120);
  const bufferedEstimateFee = Math.ceil(estimatedFee * 1.35) + 500;
  const paddedGasFeeFloor = Math.ceil((100 + opSize + gasLimit * 0.1) * 1.2 + 1_000);
  return {
    gasLimit,
    storageLimit,
    feeMutez: Math.max(bufferedEstimateFee, paddedGasFeeFloor),
  };
}

export function macaroniV35SignedOperationBytes(unsignedOperationBytes: number, source: string) {
  if (!Number.isSafeInteger(unsignedOperationBytes) || unsignedOperationBytes < 1) {
    throw new Error("The exact Tezos forger returned an invalid unsigned operation size");
  }
  const normalizedSource = String(source || "").trim();
  if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizedSource)) {
    throw new Error("Exact operation sizing requires a validated tz1, tz2, tz3, or tz4 source");
  }
  // BLS (tz4) signatures are 96 bytes; ed25519/secp256k1/P-256 signatures are 64.
  return unsignedOperationBytes + (normalizedSource.startsWith("tz4") ? 96 : 64);
}

async function exactStudioPaddedOperationSize(input: {
  toolkit: TezosToolkit;
  source: string;
  estimate: {
    opSize: unknown;
    gasLimit: unknown;
    storageLimit: unknown;
    suggestedFeeMutez: unknown;
  };
  contents: (input: {
    counter: string;
    feeMutez: number;
    gasLimit: number;
    storageLimit: number;
  }) => Record<string, unknown>;
}) {
  const [branch, account, protocols] = await Promise.all([
    input.toolkit.rpc.getBlockHash(),
    input.toolkit.rpc.getContract(input.source),
    input.toolkit.rpc.getProtocols(),
  ]);
  const protocol = String(protocols.next_protocol || protocols.protocol || "");
  if (!Object.values(ProtocolsHash).includes(protocol as ProtocolsHash)) {
    throw new Error(`The active Tezos protocol ${protocol || "(missing)"} is not supported by the installed exact forger`);
  }
  let counter: string;
  try {
    counter = (BigInt(String(account.counter || "0")) + 1n).toString();
  } catch {
    throw new Error("The trusted Tezos RPC returned an invalid creator counter");
  }
  const forger = new LocalForger(protocol as ProtocolsHash);
  let operationSize = estimateNumber(input.estimate.opSize, "operation size");
  const seenSizes = new Set<number>();
  while (!seenSizes.has(operationSize)) {
    seenSizes.add(operationSize);
    const limits = macaroniV35StudioPaddedLimits({
      opSize: operationSize,
      gasLimit: estimateNumber(input.estimate.gasLimit, "gas limit"),
      storageLimit: estimateNumber(input.estimate.storageLimit, "storage limit"),
      suggestedFeeMutez: estimateNumber(input.estimate.suggestedFeeMutez, "suggested fee"),
    });
    const forged = await forger.forge({
      branch,
      contents: [input.contents({ counter, ...limits })] as never,
    });
    if (!/^[0-9a-f]+$/i.test(forged) || forged.length % 2 !== 0) {
      throw new Error("The exact Tezos forger returned malformed operation bytes");
    }
    const nextSize = macaroniV35SignedOperationBytes(forged.length / 2, input.source);
    if (nextSize === operationSize) return nextSize;
    operationSize = nextSize;
  }
  throw new Error("The exact padded Tezos operation size did not converge");
}

function normalizeLiveCreatorEstimate(estimate: {
  opSize: unknown;
  gasLimit: unknown;
  storageLimit: unknown;
  suggestedFeeMutez: unknown;
  totalCost: unknown;
}, protocolOperationDataLimitBytes: number, exactPaddedOperationSize?: number): MacaroniV35LiveEstimate {
  const opSize = exactPaddedOperationSize == null
    ? estimateNumber(estimate.opSize, "operation size")
    : estimateNumber(exactPaddedOperationSize, "exact padded operation size");
  if (opSize <= 0) throw new Error("Tezos live estimate returned an empty operation size");
  if (!Number.isSafeInteger(protocolOperationDataLimitBytes) || protocolOperationDataLimitBytes <= 0) {
    throw new Error("The reviewed contract manifest has no valid Tezos operation data limit");
  }
  if (!macaroniV35OperationSizeWithinProtocolLimit(opSize, protocolOperationDataLimitBytes)) {
    throw new Error(
      `Final forged operation is ${opSize} bytes and exceeds the reviewed Tezos protocol limit of ${protocolOperationDataLimitBytes} bytes`
    );
  }
  return {
    source: "live_tezos_rpc_estimate",
    operationSizeSource: exactPaddedOperationSize == null
      ? "taquito_signed_estimate"
      : "exact_studio_padded_forge",
    opSize,
    gasLimit: estimateNumber(estimate.gasLimit, "gas limit"),
    storageLimit: estimateNumber(estimate.storageLimit, "storage limit"),
    suggestedFeeMutez: estimateNumber(estimate.suggestedFeeMutez, "suggested fee"),
    totalCostMutez: estimateNumber(estimate.totalCost, "total cost"),
  };
}

function creatorEstimateToolkit(drop: typeof macaroniV35Drops.$inferSelect) {
  const configuredRpc = String(process.env[
    drop.network === "mainnet"
      ? "MACARONI_V35_TRUSTED_MAINNET_RPC_URL"
      : "MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL"
  ] || "").trim();
  return new TezosToolkit(configuredRpc || V35_RPC[drop.network]);
}

function creatorRecoveryRpcUrls(network: V35Network) {
  const configured = String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_TRUSTED_MAINNET_RPC_URL"
      : "MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL"
  ] || "").trim();
  return [...new Set([configured, V35_RPC[network], V35_RPC_FALLBACK[network]].filter(Boolean))];
}

type CreatorPendingOperation = {
  hash?: string;
  branch?: string;
  contents?: Array<Record<string, unknown>>;
};

function creatorPendingOperation(
  pending: Record<string, unknown>,
  operationHash: string
): CreatorPendingOperation | null {
  for (const key of ["validated", "refused", "outdated", "branch_refused", "branch_delayed", "unprocessed"]) {
    const rows = pending[key];
    if (!Array.isArray(rows)) continue;
    const found = rows.find((row) => row && typeof row === "object"
      && (row as { hash?: string }).hash === operationHash);
    if (found) return found as CreatorPendingOperation;
  }
  return null;
}

function allCreatorPendingOperations(pending: Record<string, unknown>) {
  return ["validated", "refused", "outdated", "branch_refused", "branch_delayed", "unprocessed"]
    .flatMap((key) => Array.isArray(pending[key]) ? pending[key] as CreatorPendingOperation[] : []);
}

export function creatorPendingOperationMatchesAttempt(
  operation: CreatorPendingOperation,
  attempt: typeof macaroniV35OperationAttempts.$inferSelect
) {
  if (!attempt.signer) return false;
  const contents = Array.isArray(operation.contents) ? operation.contents : [];
  const expected = attempt.parameters as {
    code?: unknown;
    storage?: unknown;
    micheline?: unknown;
  } | null;
  const signerManagerContents = contents.filter((content) => content.source === attempt.signer);
  const nonRevealSignerContents = signerManagerContents.filter((content) => content.kind !== "reveal");
  if (nonRevealSignerContents.length !== 1
    || signerManagerContents.filter((content) => content.kind === "reveal").length > 1) {
    return false;
  }
  if (attempt.entrypoint === "origination") {
    const matches = contents.filter((content) => content.kind === "origination"
      && content.source === attempt.signer
      && Number(content.balance ?? 0) === attempt.amountMutez
      && hashMacaroniV35Payload((content.script as { code?: unknown } | undefined)?.code)
        === hashMacaroniV35Payload(expected?.code)
      && hashMacaroniV35Payload((content.script as { storage?: unknown } | undefined)?.storage)
        === hashMacaroniV35Payload(expected?.storage));
    return matches.length === 1 && nonRevealSignerContents[0] === matches[0];
  }
  const matches = contents.filter((content) => content.kind === "transaction"
    && content.source === attempt.signer
    && content.destination === attempt.target
    && Number(content.amount ?? 0) === attempt.amountMutez
    && (attempt.intent === "reveal_creator_key"
      ? (!("parameters" in content)
        || (content.parameters as { entrypoint?: string } | undefined)?.entrypoint === "default")
      : (content.parameters as { entrypoint?: string; value?: unknown } | undefined)?.entrypoint === attempt.entrypoint
        && hashMacaroniV35Payload((content.parameters as { value?: unknown } | undefined)?.value)
          === hashMacaroniV35Payload(expected?.micheline)));
  return matches.length === 1 && nonRevealSignerContents[0] === matches[0];
}

function creatorPendingSignerCounter(operation: CreatorPendingOperation, signer: string) {
  const counters = (operation.contents ?? [])
    .filter((content) => content.source === signer && content.counter != null)
    .map((content) => Number(content.counter));
  if (!counters.length || counters.some((counter) => !Number.isSafeInteger(counter) || counter < 0)) {
    throw new Error("Submitted creator operation has no valid immutable signer counter evidence");
  }
  return Math.max(...counters);
}

export function macaroniV35CreatorDroppedOperationCanRetry(input: {
  presentInIndexer: boolean;
  allRpcMempoolsObserved: boolean;
  presentInAnyMempool: boolean;
  signedBranchLevel?: number | null;
  submissionHeadLevel?: number | null;
  protocolMaxOperationsTtl: number;
  confirmations: number;
  rpcHeadLevels: number[];
  indexedHeadLevel: number;
  exactPostconditionStillPending: boolean;
}) {
  if (input.presentInIndexer || !input.allRpcMempoolsObserved || input.presentInAnyMempool
    || !input.exactPostconditionStillPending || input.confirmations < 2
    || !Number.isSafeInteger(input.protocolMaxOperationsTtl) || input.protocolMaxOperationsTtl <= 0
    || !input.rpcHeadLevels.length) return false;
  // A Beacon prompt is not a signed operation: the wallet may choose a fresh
  // branch long after the prompt opened. Only an observed immutable signed
  // branch can start the protocol-TTL expiry proof. Submission head is retained
  // for diagnostics, never as a retry horizon.
  const horizon = input.signedBranchLevel;
  if (!Number.isSafeInteger(horizon) || Number(horizon) < 0
    || !Number.isSafeInteger(input.indexedHeadLevel) || input.indexedHeadLevel < 0
    || input.rpcHeadLevels.some((level) => !Number.isSafeInteger(level) || level < 0)) return false;
  const irreversibleAfter = Number(horizon) + input.protocolMaxOperationsTtl + input.confirmations;
  return input.indexedHeadLevel > irreversibleAfter
    && input.rpcHeadLevels.every((level) => level > irreversibleAfter);
}

async function observeCreatorSubmissionEnvelope(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  requireEveryRpc: boolean;
  includeConstants?: boolean;
}) {
  if (!input.attempt.operationHash || !input.attempt.signer) {
    throw new Error("Creator submission observation requires an immutable operation hash and signer");
  }
  const observations = await Promise.allSettled(creatorRecoveryRpcUrls(input.drop.network).map(async (rpcUrl) => {
    const toolkit = new TezosToolkit(rpcUrl);
    const [pending, header, constants] = await Promise.all([
      toolkit.rpc.getPendingOperations({ version: 2, operationHash: input.attempt.operationHash! }),
      toolkit.rpc.getBlockHeader(),
      input.includeConstants ? toolkit.rpc.getConstants() : Promise.resolve(null),
    ]);
    const level = Number(header.level);
    if (!Number.isSafeInteger(level) || level < 1) throw new Error("Creator recovery RPC returned an invalid head level");
    const headHash = await toolkit.rpc.getBlockHash({ block: String(level) });
    const operation = creatorPendingOperation(pending as unknown as Record<string, unknown>, input.attempt.operationHash!);
    let branchLevel: number | null = null;
    let signerCounter: number | null = null;
    if (operation) {
      if (!operation.branch || !/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(operation.branch)) {
        throw new Error("Submitted creator operation has no valid immutable branch evidence");
      }
      const branchHeader = await toolkit.rpc.getBlockHeader({ block: operation.branch });
      branchLevel = Number(branchHeader.level);
      if (!Number.isSafeInteger(branchLevel) || branchLevel < 0) {
        throw new Error("Submitted creator operation branch level is invalid");
      }
      signerCounter = creatorPendingSignerCounter(operation, input.attempt.signer!);
    }
    const ttl = constants == null ? null : Number(constants.max_operations_time_to_live);
    if (constants != null && (!Number.isSafeInteger(ttl) || Number(ttl) <= 0)) {
      throw new Error("Creator recovery RPC returned an invalid operation TTL");
    }
    return { rpcUrl, level, headHash, operation, branchLevel, signerCounter, ttl };
  }));
  const failures = observations.filter((row) => row.status === "rejected");
  if (input.requireEveryRpc && failures.length) {
    throw new Error("Every configured Tezos RPC must confirm mempool absence before a creator operation can be retried");
  }
  const successful = observations.flatMap((row) => row.status === "fulfilled" ? [row.value] : []);
  if (!successful.length) throw new Error("No configured Tezos RPC could observe the creator submission horizon");
  const horizon = successful.reduce((latest, row) => row.level > latest.level ? row : latest);
  const now = new Date();
  if (input.attempt.submissionHeadLevel == null) {
    await db.update(macaroniV35OperationAttempts).set({
      submissionHeadHash: horizon.headHash,
      submissionHeadLevel: horizon.level,
      submissionHeadObservedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35OperationAttempts.id, input.attempt.id),
      isNull(macaroniV35OperationAttempts.submissionHeadLevel)
    ));
  }
  const pendingRows = successful.filter((row) => row.operation != null);
  if (pendingRows.length) {
    const branches = new Set(pendingRows.map((row) => row.operation!.branch));
    const counters = new Set(pendingRows.map((row) => row.signerCounter));
    const branchLevels = new Set(pendingRows.map((row) => row.branchLevel));
    if (branches.size !== 1 || counters.size !== 1 || branchLevels.size !== 1) {
      throw new Error("Configured Tezos RPCs disagree about the submitted creator operation envelope");
    }
    const observed = pendingRows[0];
    if (input.attempt.signedOperationBranch == null) {
      await db.update(macaroniV35OperationAttempts).set({
        signedOperationBranch: observed.operation!.branch!,
        signedBranchLevel: observed.branchLevel!,
        signerCounter: observed.signerCounter!,
        updatedAt: now,
      }).where(and(
        eq(macaroniV35OperationAttempts.id, input.attempt.id),
        isNull(macaroniV35OperationAttempts.signedOperationBranch)
      ));
    } else if (input.attempt.signedOperationBranch !== observed.operation!.branch
      || input.attempt.signedBranchLevel !== observed.branchLevel
      || input.attempt.signerCounter !== observed.signerCounter) {
      throw new Error("Submitted creator operation envelope differs from its immutable journal evidence");
    }
  }
  const refreshed = (await db.select().from(macaroniV35OperationAttempts)
    .where(eq(macaroniV35OperationAttempts.id, input.attempt.id)).limit(1))[0];
  if (!refreshed) throw new Error("Creator operation disappeared while observing its submission horizon");
  return {
    attempt: refreshed,
    allRpcMempoolsObserved: failures.length === 0,
    presentInAnyMempool: pendingRows.length > 0,
    rpcHeadLevels: successful.map((row) => row.level),
    protocolMaxOperationsTtl: input.includeConstants
      ? Math.max(...successful.map((row) => Number(row.ttl)))
      : null,
  };
}

async function findPendingEquivalentCreatorSubmission(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
}) {
  const observations = await Promise.allSettled(creatorRecoveryRpcUrls(input.drop.network).map(async (rpcUrl) => {
    const toolkit = new TezosToolkit(rpcUrl);
    const pending = await toolkit.rpc.getPendingOperations({ version: 2, source: input.attempt.signer! });
    return allCreatorPendingOperations(pending as unknown as Record<string, unknown>)
      .filter((operation) => operation.hash && creatorPendingOperationMatchesAttempt(
        operation,
        input.attempt
      ));
  }));
  const successful = observations.flatMap((row) => row.status === "fulfilled" ? [row.value] : []);
  if (!successful.length) {
    throw new Error("No configured Tezos RPC could check for an unjournaled creator operation");
  }
  const matches = successful.flat();
  const hashes = new Set(matches.map((operation) => operation.hash!));
  if (hashes.size > 1) {
    throw new Error("Multiple matching wallet operations are pending; wait for exact finalized reconciliation before continuing");
  }
  return matches[0] ?? null;
}

async function observeHashlessCreatorActionWindow(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
}) {
  const observations = await Promise.allSettled(creatorRecoveryRpcUrls(input.drop.network).map(async (rpcUrl) => {
    const toolkit = new TezosToolkit(rpcUrl);
    const [pending, header, constants] = await Promise.all([
      toolkit.rpc.getPendingOperations({ version: 2, source: input.attempt.signer! }),
      toolkit.rpc.getBlockHeader(),
      toolkit.rpc.getConstants(),
    ]);
    const level = Number(header.level);
    const ttl = Number(constants.max_operations_time_to_live);
    if (!Number.isSafeInteger(level) || level < 1 || !Number.isSafeInteger(ttl) || ttl <= 0) {
      throw new Error("Creator action-window RPC returned an invalid head or protocol TTL");
    }
    const headHash = await toolkit.rpc.getBlockHash({ block: String(level) });
    const matches = allCreatorPendingOperations(pending as unknown as Record<string, unknown>)
      .filter((operation) => operation.hash && creatorPendingOperationMatchesAttempt(operation, input.attempt));
    return { level, ttl, headHash, matches };
  }));
  if (observations.some((row) => row.status === "rejected")) {
    throw new Error("Every configured Tezos RPC must be available before opening or replacing a wallet prompt");
  }
  const successful = observations.flatMap((row) => row.status === "fulfilled" ? [row.value] : []);
  if (!successful.length) throw new Error("No configured Tezos RPC could establish the wallet prompt horizon");
  const matches = successful.flatMap((row) => row.matches);
  const hashes = new Set(matches.map((operation) => operation.hash!));
  if (hashes.size > 1) {
    throw new Error("Multiple matching creator operations are pending; exact reconciliation is required");
  }
  const horizon = successful.reduce((latest, row) => row.level > latest.level ? row : latest);
  return {
    pending: matches[0] ?? null,
    horizon: { hash: horizon.headHash, level: horizon.level },
    rpcHeadLevels: successful.map((row) => row.level),
    protocolMaxOperationsTtl: Math.max(...successful.map((row) => row.ttl)),
  };
}

async function persistObservedCreatorOperationHash(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  operationHash: string;
  originatedContract?: string;
}) {
  const now = new Date();
  const [persisted] = await db.update(macaroniV35OperationAttempts).set({
    state: "submitted",
    operationHash: input.operationHash,
    originatedContract: input.originatedContract ?? null,
    submittedAt: now,
    updatedAt: now,
  }).where(and(
    eq(macaroniV35OperationAttempts.id, input.attempt.id),
    inArray(macaroniV35OperationAttempts.state, ["awaiting_signature", "wallet_prompt_started"]),
    isNull(macaroniV35OperationAttempts.operationHash)
  )).returning();
  const observed = persisted ?? (await db.select().from(macaroniV35OperationAttempts)
    .where(eq(macaroniV35OperationAttempts.id, input.attempt.id)).limit(1))[0];
  if (!observed || observed.operationHash !== input.operationHash) {
    throw new Error("The unjournaled wallet operation conflicts with the durable creator attempt");
  }
  if (observed.setupStepId) {
    await db.update(macaroniV35SetupSteps).set({
      status: "submitted",
      operationHash: input.operationHash,
      updatedAt: now,
    }).where(eq(macaroniV35SetupSteps.id, observed.setupStepId));
  }
  try {
    return (await observeCreatorSubmissionEnvelope({
      drop: input.drop,
      attempt: observed,
      requireEveryRpc: false,
    })).attempt;
  } catch {
    return observed;
  }
}

function setReadOnlyCreatorSigner(input: {
  toolkit: TezosToolkit;
  drop: typeof macaroniV35Drops.$inferSelect;
  publicKey: string;
}) {
  input.toolkit.setProvider({
    signer: {
      publicKeyHash: async () => input.drop.administrator,
      publicKey: async () => input.publicKey,
      secretKey: async () => { throw new Error("Read-only setup estimator has no creator secret key"); },
      sign: async () => { throw new Error("Read-only setup estimator cannot sign"); },
    } as never,
  });
}

async function liveEstimateCreatorKeyReveal(drop: typeof macaroniV35Drops.$inferSelect) {
  if (!drop.administratorPublicKey) {
    throw new Error("The wallet-proof public key is missing, so the creator-key reveal cannot be estimated safely");
  }
  const [toolkit, artifact] = [creatorEstimateToolkit(drop), await readMacaroniV35Artifact()];
  setReadOnlyCreatorSigner({ toolkit, drop, publicKey: drop.administratorPublicKey });
  const estimate = await toolkit.estimate.transfer({
    to: drop.administrator,
    amount: 1,
    mutez: true,
  });
  return normalizeLiveCreatorEstimate(estimate, artifact.protocolOperationDataLimitBytes);
}

async function liveEstimateCreatorOrigination(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  contractMetadataUri: string;
  minterRoyalty: { enabled: boolean; bps: number; mode: number };
}) {
  const toolkit = creatorEstimateToolkit(input.drop);
  const managerKey = await toolkit.rpc.getManagerKey(input.drop.administrator);
  const publicKey = typeof managerKey === "string" ? managerKey : managerKey?.key;
  if (!publicKey) throw new Error("Creator key reveal is not visible yet, so origination cannot be live-estimated");
  setReadOnlyCreatorSigner({ toolkit, drop: input.drop, publicKey });
  const origination = await buildManagedMacaroniV35Origination({
    drop: input.drop,
    contractMetadataUri: input.contractMetadataUri,
    minterRoyalty: input.minterRoyalty,
  });
  const estimate = await toolkit.estimate.originate({
    code: origination.code as never,
    // This is already encoded Micheline. Taquito's `storage` option expects a
    // high-level value and would attempt to encode it again; `init` preserves
    // the exact reviewed origination storage.
    init: origination.storage as never,
  });
  const exactPaddedOperationBytes = await exactStudioPaddedOperationSize({
    toolkit,
    source: input.drop.administrator,
    estimate,
    contents: ({ counter, feeMutez, gasLimit, storageLimit }) => ({
      kind: OpKind.ORIGINATION,
      source: input.drop.administrator,
      fee: String(feeMutez),
      counter,
      gas_limit: String(gasLimit),
      storage_limit: String(storageLimit),
      balance: "0",
      script: {
        code: origination.code as never,
        storage: origination.storage as never,
      },
    }),
  });
  return normalizeLiveCreatorEstimate(
    estimate,
    origination.protocolOperationDataLimitBytes,
    exactPaddedOperationBytes
  );
}

async function liveEstimateCreatorEntrypoint(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  stepKey: Exclude<CreatorStepKey, "originate_contract" | "reveal_creator_key">;
  parameters: unknown;
  amountMutez?: number;
}): Promise<MacaroniV35LiveEstimate> {
  if (!input.drop.contract) throw new Error("A contract must be attached before setup batching can be estimated");
  const [toolkit, artifact] = [creatorEstimateToolkit(input.drop), await readMacaroniV35Artifact()];
  const managerKey = await toolkit.rpc.getManagerKey(input.drop.administrator);
  const publicKey = typeof managerKey === "string" ? managerKey : managerKey?.key;
  if (!publicKey) {
    throw new Error("The creator account public key is not revealed yet, so the server cannot safely live-estimate this setup operation");
  }
  setReadOnlyCreatorSigner({ toolkit, drop: input.drop, publicKey });
  const encoded = await encodeCreatorEntrypointParameters(input.stepKey, input.parameters);
  const estimate = await toolkit.estimate.transfer({
    to: input.drop.contract,
    amount: input.amountMutez ?? 0,
    mutez: true,
    parameter: { entrypoint: input.stepKey, value: encoded.value as never },
  });
  const exactPaddedOperationBytes = await exactStudioPaddedOperationSize({
    toolkit,
    source: input.drop.administrator,
    estimate,
    contents: ({ counter, feeMutez, gasLimit, storageLimit }) => ({
      kind: OpKind.TRANSACTION,
      source: input.drop.administrator,
      fee: String(feeMutez),
      counter,
      gas_limit: String(gasLimit),
      storage_limit: String(storageLimit),
      amount: String(input.amountMutez ?? 0),
      destination: input.drop.contract!,
      parameters: {
        entrypoint: input.stepKey,
        value: encoded.value as never,
      },
    }),
  });
  return normalizeLiveCreatorEstimate(
    estimate,
    artifact.protocolOperationDataLimitBytes,
    exactPaddedOperationBytes
  );
}

async function largestLiveEstimatedPrefix<T>(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  stepKey: "add_tokens_v35" | "set_allowlist";
  rows: T[];
}) {
  if (!input.rows.length) throw new Error(`${input.stepKey} has no remaining rows`);
  try {
    const accepted = await macaroniV35LargestAcceptedBatch({
      maximumUnits: input.rows.length,
      build: (count) => input.rows.slice(0, count),
      evaluate: (rows) => liveEstimateCreatorEntrypoint({
        drop: input.drop,
        stepKey: input.stepKey,
        parameters: rows,
      }),
    });
    return { rows: accepted.candidate, estimate: accepted.result };
  } catch (error) {
    throw error instanceof Error
      ? new Error(`Even one ${input.stepKey} row failed live Tezos estimation: ${error.message}`)
      : new Error(`Even one ${input.stepKey} row failed live Tezos estimation`);
  }
}

function takeCanonicalSlotUnits(input: {
  assets: Array<{ tokenSlot: number; quantity: number }>;
  loaded: Map<number, number>;
  units: number;
}) {
  const rows: Array<{ token_id: number; count: number }> = [];
  let remainingUnits = input.units;
  for (const asset of input.assets) {
    if (remainingUnits <= 0) break;
    const remainingForToken = asset.quantity - (input.loaded.get(asset.tokenSlot) ?? 0);
    if (remainingForToken <= 0) continue;
    const count = Math.min(remainingForToken, remainingUnits);
    rows.push({ token_id: asset.tokenSlot, count });
    remainingUnits -= count;
  }
  if (remainingUnits !== 0) throw new Error("Requested slot batch exceeds the remaining canonical physical supply");
  return rows;
}

async function largestLiveEstimatedSlotBatch(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  assets: Array<{ tokenSlot: number; quantity: number }>;
  loaded: Map<number, number>;
}) {
  const totalRemaining = input.assets.reduce(
    (sum, asset) => sum + asset.quantity - (input.loaded.get(asset.tokenSlot) ?? 0),
    0
  );
  if (totalRemaining <= 0) throw new Error("append_token_slots_v35 has no remaining physical slots");
  try {
    const accepted = await macaroniV35LargestAcceptedBatch({
      maximumUnits: totalRemaining,
      build: (units) => takeCanonicalSlotUnits({ assets: input.assets, loaded: input.loaded, units }),
      evaluate: (rows) => liveEstimateCreatorEntrypoint({
        drop: input.drop,
        stepKey: "append_token_slots_v35",
        parameters: rows,
      }),
    });
    return { rows: accepted.candidate, units: accepted.units, estimate: accepted.result };
  } catch (error) {
    throw error instanceof Error
      ? new Error(`Even one canonical slot failed live Tezos estimation: ${error.message}`)
      : new Error("Even one canonical slot failed live Tezos estimation");
  }
}

function normalizeCreatorPlan(plan: MacaroniV35CreatorPlan): MacaroniV35CreatorPlan {
  return {
    ...plan,
    stages: [...plan.stages].sort((left, right) => left.stage - right.stage),
    allowlist: [...plan.allowlist].sort((left, right) =>
      left.stage - right.stage || left.holder.localeCompare(right.holder)
    ),
  };
}

async function persistOrLoadCreatorPlan(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  plan?: MacaroniV35CreatorPlan;
}) {
  const supplied = input.plan ? normalizeCreatorPlan(macaroniV35CreatorPlanSchema.parse(input.plan)) : null;
  const publicMetadata = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    eq(macaroniV35SetupSteps.stepKey, "public_contract_metadata")
  )).limit(1))[0];
  const boundContractMetadataUri = (publicMetadata?.parameters as { contractMetadataUri?: string } | null)?.contractMetadataUri;
  if (publicMetadata?.status !== "complete" || !boundContractMetadataUri) {
    throw new Error("Pin and bind the managed public collection cover and TZIP-16 metadata before requesting a signing action");
  }
  if (supplied && supplied.contractMetadataUri !== boundContractMetadataUri) {
    throw new Error("Creator plan contract metadata URI must equal the managed URI bound to this setup");
  }
  const existing = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    eq(macaroniV35SetupSteps.stepKey, "creator_plan")
  )).limit(1))[0];
  if (existing) {
    const stored = normalizeCreatorPlan(macaroniV35CreatorPlanSchema.parse(existing.parameters));
    if (supplied && hashMacaroniV35Payload(supplied) !== existing.intentDigest) {
      throw new Error("Creator plan is already bound to different immutable contract metadata, stages, royalty, or allowlist settings");
    }
    return stored;
  }
  if (!supplied) throw new Error("The first next-action request must include the immutable creator plan");
  const intentDigest = hashMacaroniV35Payload(supplied);
  const now = new Date();
  const [created] = await db.insert(macaroniV35SetupSteps).values({
    dropId: input.drop.id,
    stepKey: "creator_plan",
    status: "complete",
    intentDigest,
    expectedPostcondition: { allCreatorSetupCallsDerivedServerSide: true },
    parameters: supplied,
    network: input.drop.network,
    signer: null,
    target: null,
    entrypoint: "offchain:creator_plan",
    amountMutez: 0,
    details: { immutable: true, browserDoesNotAuthorContractCalls: true },
    completedAt: now,
  }).onConflictDoNothing({
    target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
  }).returning();
  if (created) return supplied;
  const raced = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    eq(macaroniV35SetupSteps.stepKey, "creator_plan")
  )).limit(1))[0];
  if (!raced || raced.intentDigest !== intentDigest) {
    throw new Error("Concurrent creator-plan registration differs from this immutable plan");
  }
  return normalizeCreatorPlan(macaroniV35CreatorPlanSchema.parse(raced.parameters));
}

function walletExplanation(stepKey: CreatorStepKey) {
  const descriptions: Record<CreatorStepKey, string> = {
    reveal_creator_key: "Reveals your creator account public key in a separate one-mutez self-transfer so the much larger origination remains safe and estimable.",
    originate_contract: "Creates the reviewed Macaroni V3.5 contract with your fixed public settings and private-inventory commitments.",
    add_tokens_v35: "Adds this server-measured batch of committed token rows; it does not reveal any private CID.",
    append_token_slots_v35: "Adds this server-measured batch of canonical edition slots used by the forced FIFO allocation.",
    set_stages: "Sets the sale times, prices, wallet limits, and allowlist switches from your saved plan.",
    set_allowlist: "Adds this server-measured allowlist batch from your saved plan.",
    finalize_setup: "Irreversibly locks inventory and sale configuration after every setup check passes.",
    fund_fulfillment_reserve: "Funds the contract-held fulfillment reserve using the measured cost policy shown below.",
    activate_sale: "Opens purchases only after private recovery, reserve, and automatic fulfillment are armed.",
    close_sale: "Irreversibly closes the sale; already purchased claims still finish and the final sweep follows fulfillment.",
  };
  return {
    whatYouAreSigning: descriptions[stepKey],
    ifYouSign: "The wallet submits only this immutable server-issued intent. The next step remains locked until the exact operation and postcondition are finalized and reconciled.",
    ifYouDoNotSign: "Nothing changes on-chain. This exact step stays resumable and no later step is unlocked.",
  };
}

function creatorActionResponse(
  attempt: typeof macaroniV35OperationAttempts.$inferSelect,
  liveEstimate: MacaroniV35LiveEstimate | null = null,
  chunk?: { batchIndex: number; finalBatch: boolean; units?: number; rows: number }
) {
  if (attempt.state === "awaiting_signature" && !liveEstimate) {
    throw new Error("An awaiting-signature creator action has no durable live Tezos estimate and is blocked");
  }
  const state = attempt.state === "awaiting_signature"
    ? "awaiting_signature"
    : attempt.state === "submitted" || attempt.state === "confirming" || attempt.state === "needs_reconciliation"
      ? "reconcile"
      : attempt.state;
  return {
    schema: "wtfos.macaroni-v35-next-creator-action.v1",
    state,
    action: {
      attemptId: attempt.id,
      setupStepId: attempt.setupStepId,
      step: attempt.intent as CreatorStepKey,
      requestId: attempt.requestId,
      intentDigest: attempt.intentDigest,
      network: attempt.network,
      signer: attempt.signer,
      target: attempt.target,
      entrypoint: attempt.entrypoint,
      amountMutez: attempt.amountMutez,
      parameters: attempt.parameters,
      expectedPostcondition: attempt.expectedPostcondition,
      operationHash: attempt.operationHash,
      explanation: walletExplanation(attempt.intent as CreatorStepKey),
      liveEstimate,
      chunk: chunk ?? null,
    },
  };
}

async function prepareServerChosenCreatorAttempt(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  ownerUserId: number;
  stepKey: CreatorStepKey;
  parameters: unknown;
  amountMutez?: number;
  batchIndex?: number;
  finalBatch?: boolean;
  liveEstimate?: MacaroniV35LiveEstimate | null;
  chunk?: { batchIndex: number; finalBatch: boolean; units?: number; rows: number };
}) {
  const persistentStepKey = input.batchIndex == null
    ? input.stepKey
    : `${input.stepKey}:${String(input.batchIndex).padStart(6, "0")}`;
  const step = (await db.select().from(macaroniV35SetupSteps).where(and(
    eq(macaroniV35SetupSteps.dropId, input.drop.id),
    eq(macaroniV35SetupSteps.stepKey, persistentStepKey)
  )).limit(1))[0];
  const retry = step ? (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.dropId, input.drop.id),
    eq(macaroniV35OperationAttempts.setupStepId, step.id)
  )).orderBy(desc(macaroniV35OperationAttempts.id)).limit(1))[0] : null;
  if (retry && !["wallet_rejected", "failed"].includes(retry.state)) {
    return creatorActionResponse(retry, input.liveEstimate ?? null, input.chunk);
  }
  const attempt = await prepareManagedMacaroniV35CreatorAttempt({
    ownerUserId: input.ownerUserId,
    dropId: input.drop.id,
    registrationDigest: input.drop.registrationDigest,
    stepKey: input.stepKey,
    requestId: `v35-next:${input.drop.id}:${input.stepKey}:${randomUUID()}`,
    retryOfAttemptId: retry?.id ?? null,
    batchIndex: input.batchIndex,
    finalBatch: input.finalBatch,
    parameters: input.parameters,
    amountMutez: input.amountMutez,
  });
  if (!attempt) return null;
  if (attempt.setupStepId && (input.liveEstimate || input.chunk)) {
    const setupStep = (await db.select({ details: macaroniV35SetupSteps.details })
      .from(macaroniV35SetupSteps)
      .where(eq(macaroniV35SetupSteps.id, attempt.setupStepId)).limit(1))[0];
    await db.update(macaroniV35SetupSteps).set({
      details: {
        ...(setupStep?.details ?? {}),
        liveEstimate: input.liveEstimate ?? null,
        serverChosenChunk: input.chunk ?? null,
        actionFirstDeliveredAt: typeof setupStep?.details?.actionFirstDeliveredAt === "string"
          ? setupStep.details.actionFirstDeliveredAt
          : new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(macaroniV35SetupSteps.id, attempt.setupStepId));
  }
  return creatorActionResponse(attempt, input.liveEstimate ?? null, input.chunk);
}

/**
 * Returns the single authoritative creator action. The browser supplies only
 * the immutable human-facing plan; target, entrypoint, exact Micheline,
 * funding amount, and live-sized batches are all chosen and journaled here.
 */
export async function getNextManagedMacaroniV35CreatorAction(input: {
  ownerUserId: number;
  dropId: number;
  registrationDigest: string;
  plan?: MacaroniV35CreatorPlan;
  requestPermanentClose?: boolean;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  if (drop.registrationDigest !== input.registrationDigest) {
    throw new Error("Registration digest does not match this immutable setup");
  }
  const plan = await persistOrLoadCreatorPlan({ drop, plan: input.plan });
  const active = (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.dropId, drop.id),
    isNull(macaroniV35OperationAttempts.workItemId),
    inArray(macaroniV35OperationAttempts.state, [
      "awaiting_signature", "wallet_prompt_started", "submitted", "confirming", "needs_reconciliation",
    ])
  )).orderBy(desc(macaroniV35OperationAttempts.id)).limit(1))[0];
  if (active) {
    const activeStep = active.setupStepId ? (await db.select({ details: macaroniV35SetupSteps.details })
      .from(macaroniV35SetupSteps)
      .where(eq(macaroniV35SetupSteps.id, active.setupStepId)).limit(1))[0] : null;
    const details = activeStep?.details as {
      liveEstimate?: MacaroniV35LiveEstimate | null;
      serverChosenChunk?: { batchIndex: number; finalBatch: boolean; units?: number; rows: number } | null;
      actionFirstDeliveredAt?: string;
    } | undefined;
    if (active.state === "wallet_prompt_started" && details?.actionFirstDeliveredAt) {
      const finality = await managedSetupFinalityContext(drop.network);
      const equivalent = await findFinalizedEquivalentCreatorOperation({
        drop,
        attempt: active,
        finalizedBlock: finality.finalizedBlock,
      });
      if (equivalent) {
        const observed = await persistObservedCreatorOperationHash({
          drop,
          attempt: active,
          operationHash: equivalent.hash,
          originatedContract: equivalent.originatedContract,
        });
        const reconciled = await reconcileManagedMacaroniV35CreatorAttempt({
          ownerUserId: input.ownerUserId,
          dropId: drop.id,
          attemptId: observed.id,
        });
        if (!reconciled) throw new Error("Recovered creator operation disappeared during exact reconciliation");
        return creatorActionResponse(
          reconciled,
          details.liveEstimate ?? null,
          details.serverChosenChunk ?? undefined
        );
      }
      const pending = await findPendingEquivalentCreatorSubmission({ drop, attempt: active });
      if (pending?.hash) {
        const observed = await persistObservedCreatorOperationHash({
          drop,
          attempt: active,
          operationHash: pending.hash,
        });
        return creatorActionResponse(
          observed,
          details.liveEstimate ?? null,
          details.serverChosenChunk ?? undefined
        );
      }
      const response = creatorActionResponse(
        active,
        details.liveEstimate ?? null,
        details.serverChosenChunk ?? undefined
      );
      return {
        ...response,
        state: "operation_hash_recovery_required" as const,
        blocker: "This wallet prompt was already delivered, but no operation hash reached the durable journal and no exact matching operation is visible yet.",
        recovery: {
          ifWalletBroadcast: "Paste or recover the wallet operation hash, then record and reconcile it. Do not sign this step again.",
          ifWalletNeverBroadcast: "Because the wallet send boundary already began, do not mark this as a pre-send rejection. An open Beacon prompt can forge against a fresh branch later, so Macaroni keeps this action quarantined until its exact hash or signed operation is recovered.",
        },
      };
    }
    return creatorActionResponse(
      active,
      details?.liveEstimate ?? null,
      details?.serverChosenChunk ?? undefined
    );
  }

  const [steps, assets] = await Promise.all([
    db.select().from(macaroniV35SetupSteps)
      .where(eq(macaroniV35SetupSteps.dropId, drop.id)).orderBy(asc(macaroniV35SetupSteps.id)),
    db.select({
      tokenSlot: macaroniV35PrivateAssets.tokenSlot,
      quantity: macaroniV35PrivateAssets.quantity,
      commitment: macaroniV35PrivateAssets.commitment,
    }).from(macaroniV35PrivateAssets).where(and(
      eq(macaroniV35PrivateAssets.dropId, drop.id),
      eq(macaroniV35PrivateAssets.kind, "metadata")
    )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
  ]);
  const complete = new Set(steps.filter((step) => step.status === "complete").map((step) => step.stepKey));
  if (input.requestPermanentClose) {
    if (!drop.contract || !complete.has("originate_contract")) {
      return {
        schema: "wtfos.macaroni-v35-next-creator-action.v1",
        state: "complete",
        blocker: null,
        abandonedBeforeOrigination: true,
        message: "No contract exists, so there is no on-chain sale to close or reserve to sweep.",
      };
    }
    if (drop.status === "closed" || drop.status === "completed" || drop.status === "cancelled") {
      return {
        schema: "wtfos.macaroni-v35-next-creator-action.v1",
        state: "complete",
        blocker: null,
        contract: drop.contract,
        salePermanentlyClosed: true,
      };
    }
    const liveEstimate = await liveEstimateCreatorEntrypoint({ drop, stepKey: "close_sale", parameters: null });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "close_sale",
      parameters: null,
      amountMutez: 0,
      liveEstimate,
    });
  }
  if (!complete.has("stage_private_assets")) {
    return {
      schema: "wtfos.macaroni-v35-next-creator-action.v1",
      state: "blocked",
      blocker: "Upload every private artifact and optional display/thumbnail until physical supply is complete. No wallet signature is needed yet.",
      nextRequiredOffchainStep: "stage_private_assets",
    };
  }
  if (!complete.has("reveal_creator_key")) {
    const finality = await managedSetupFinalityContext(drop.network);
    const managerKey = await readManagerKeyAtBlock(drop.network, drop.administrator, finality.finalizedBlock);
    if (managerKey) {
      const now = new Date();
      const expectedPostcondition = { managerKeyRevealed: true, observedAtFinalizedBlock: finality.finalizedBlock };
      await db.insert(macaroniV35SetupSteps).values({
        dropId: drop.id,
        stepKey: "reveal_creator_key",
        status: "complete",
        intentDigest: hashMacaroniV35Payload(expectedPostcondition),
        expectedPostcondition,
        parameters: { wallet: null, micheline: null, routedMicheline: null },
        network: drop.network,
        signer: drop.administrator,
        target: drop.administrator,
        entrypoint: "default",
        amountMutez: 0,
        details: { noWalletTransaction: true, reason: "Creator manager key was already revealed at finalized state" },
        completedAt: now,
      }).onConflictDoNothing({
        target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
      });
      complete.add("reveal_creator_key");
    } else {
      const liveEstimate = await liveEstimateCreatorKeyReveal(drop);
      return prepareServerChosenCreatorAttempt({
        drop,
        ownerUserId: input.ownerUserId,
        stepKey: "reveal_creator_key",
        parameters: null,
        amountMutez: 1,
        liveEstimate,
      });
    }
  }
  if (!complete.has("originate_contract")) {
    const liveEstimate = await liveEstimateCreatorOrigination({
      drop,
      contractMetadataUri: plan.contractMetadataUri,
      minterRoyalty: plan.minterRoyalty,
    });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "originate_contract",
      parameters: {
        contract_metadata_uri: plan.contractMetadataUri,
        minter_royalty: plan.minterRoyalty,
      },
      amountMutez: 0,
      liveEstimate,
    });
  }

  const completedBatches = (logicalStep: string) => steps.filter((step) =>
    step.status === "complete" && (step.details as { logicalStep?: string }).logicalStep === logicalStep
  ).sort((left, right) =>
    Number((left.details as { batchIndex?: number }).batchIndex)
      - Number((right.details as { batchIndex?: number }).batchIndex)
  );

  if (!complete.has("inventory_declared")) {
    const batches = completedBatches("add_tokens_v35");
    const declared = new Set(batches.flatMap((step) =>
      ((step.parameters as { wallet?: Array<{ token_id: number }> } | null)?.wallet ?? [])
        .map((row) => row.token_id)
    ));
    const remaining = assets.filter((asset) => !declared.has(asset.tokenSlot)).map((asset) => ({
      token_id: asset.tokenSlot,
      metadata_commitment: asset.commitment,
      quantity: asset.quantity,
    }));
    const selected = await largestLiveEstimatedPrefix({ drop, stepKey: "add_tokens_v35", rows: remaining });
    const batchIndex = batches.length;
    const finalBatch = selected.rows.length === remaining.length;
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "add_tokens_v35",
      parameters: selected.rows,
      amountMutez: 0,
      batchIndex,
      finalBatch,
      liveEstimate: selected.estimate,
      chunk: { batchIndex, finalBatch, rows: selected.rows.length },
    });
  }

  if (!complete.has("inventory_complete")) {
    const batches = completedBatches("append_token_slots_v35");
    const loaded = new Map<number, number>();
    for (const step of batches) {
      for (const item of (step.parameters as { wallet?: Array<{ token_id: number; count: number }> } | null)?.wallet ?? []) {
        loaded.set(item.token_id, (loaded.get(item.token_id) ?? 0) + item.count);
      }
    }
    const selected = await largestLiveEstimatedSlotBatch({ drop, assets, loaded });
    const totalRemaining = assets.reduce((sum, asset) => sum + asset.quantity - (loaded.get(asset.tokenSlot) ?? 0), 0);
    const batchIndex = batches.length;
    const finalBatch = selected.units === totalRemaining;
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "append_token_slots_v35",
      parameters: selected.rows,
      amountMutez: 0,
      batchIndex,
      finalBatch,
      liveEstimate: selected.estimate,
      chunk: { batchIndex, finalBatch, rows: selected.rows.length, units: selected.units },
    });
  }

  if (!complete.has("set_stages")) {
    const parameters = plan.stages.map((stage) => ({
      stage: stage.stage,
      start: stage.start,
      price_mutez: stage.priceMutez,
      use_allowlist: stage.useAllowlist,
      max_per_wallet: stage.maxPerWallet,
    }));
    const liveEstimate = await liveEstimateCreatorEntrypoint({ drop, stepKey: "set_stages", parameters });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "set_stages",
      parameters,
      amountMutez: 0,
      liveEstimate,
    });
  }

  if (!complete.has("allowlist_complete")) {
    if (!plan.allowlist.length) {
      await completeLogicalSetupStep({
        drop,
        stepKey: "allowlist_complete",
        expectedPostcondition: { required: false, rowCount: 0 },
        details: { noWalletTransaction: true, reason: "The immutable creator plan contains no allowlist rows" },
      });
      complete.add("allowlist_complete");
    } else {
      const batches = completedBatches("set_allowlist");
      const appliedKeys = new Set(batches.flatMap((step) =>
        ((step.parameters as { wallet?: Array<{ stage: number; holder: string }> } | null)?.wallet ?? [])
          .map((row) => `${row.stage}:${row.holder}`)
      ));
      const remaining = plan.allowlist.filter((row) => !appliedKeys.has(`${row.stage}:${row.holder}`));
      const selected = await largestLiveEstimatedPrefix({ drop, stepKey: "set_allowlist", rows: remaining });
      const batchIndex = batches.length;
      const finalBatch = selected.rows.length === remaining.length;
      return prepareServerChosenCreatorAttempt({
        drop,
        ownerUserId: input.ownerUserId,
        stepKey: "set_allowlist",
        parameters: selected.rows,
        amountMutez: 0,
        batchIndex,
        finalBatch,
        liveEstimate: selected.estimate,
        chunk: { batchIndex, finalBatch, rows: selected.rows.length },
      });
    }
  }

  if (!complete.has("finalize_setup")) {
    const liveEstimate = await liveEstimateCreatorEntrypoint({ drop, stepKey: "finalize_setup", parameters: null });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "finalize_setup",
      parameters: null,
      amountMutez: 0,
      liveEstimate,
    });
  }
  if (!complete.has("fund_fulfillment_reserve")) {
    const liveEstimate = await liveEstimateCreatorEntrypoint({
      drop,
      stepKey: "fund_fulfillment_reserve",
      parameters: null,
      amountMutez: drop.contractReserveRequiredMutez,
    });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "fund_fulfillment_reserve",
      parameters: null,
      amountMutez: drop.contractReserveRequiredMutez,
      liveEstimate,
    });
  }
  if (!complete.has("fulfillment_armed")) {
    return {
      schema: "wtfos.macaroni-v35-next-creator-action.v1",
      state: "waiting_for_managed_fulfillment_arm",
      blocker: "No creator signature is needed. wtfOS is verifying private recovery, exact inventory, reserve, signer readiness, and then arming fulfillment.",
      fundingPolicy: managedReserveEstimate(),
    };
  }
  if (!complete.has("activate_sale")) {
    const liveEstimate = await liveEstimateCreatorEntrypoint({ drop, stepKey: "activate_sale", parameters: null });
    return prepareServerChosenCreatorAttempt({
      drop,
      ownerUserId: input.ownerUserId,
      stepKey: "activate_sale",
      parameters: null,
      amountMutez: 0,
      liveEstimate,
    });
  }
  return {
    schema: "wtfos.macaroni-v35-next-creator-action.v1",
    state: "complete",
    blocker: null,
    contract: drop.contract,
  };
}

export async function prepareManagedMacaroniV35CreatorAttempt(input: {
  ownerUserId: number;
  dropId: number;
  registrationDigest: string;
  stepKey: CreatorStepKey;
  requestId: string;
  retryOfAttemptId?: number | null;
  batchIndex?: number;
  finalBatch?: boolean;
  parameters: unknown;
  amountMutez?: number;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  if (drop.registrationDigest !== input.registrationDigest) {
    throw new Error("Registration digest does not match this immutable setup");
  }
  const batchable = input.stepKey === "add_tokens_v35"
    || input.stepKey === "append_token_slots_v35"
    || input.stepKey === "set_allowlist";
  if (batchable && input.batchIndex == null) throw new Error(`${input.stepKey} requires a measured batch index`);
  if (!batchable && (input.batchIndex != null || input.finalBatch != null)) {
    throw new Error(`${input.stepKey} is not a batch setup operation`);
  }
  const suppliedParameters = parseCreatorStepParameters(input.stepKey, input.parameters);
  if (input.stepKey === "set_allowlist" && (suppliedParameters as unknown[]).length === 0) {
    throw new Error("An empty allowlist is a no-transaction checklist step and must not open a wallet request");
  }
  const amountMutez = input.amountMutez ?? 0;
  const isOrigination = input.stepKey === "originate_contract";
  const isCreatorKeyReveal = input.stepKey === "reveal_creator_key";
  const target = isOrigination ? null : isCreatorKeyReveal ? drop.administrator : drop.contract;
  const entrypoint = isOrigination ? "origination" : isCreatorKeyReveal ? "default" : input.stepKey;
  await assertCreatorStepPrerequisites({
    drop,
    stepKey: input.stepKey,
    parameters: suppliedParameters,
    amountMutez,
    batchIndex: input.batchIndex,
  });
  let parameters: Record<string, unknown> | unknown[] | null = suppliedParameters as Record<string, unknown> | unknown[] | null;
  if (isOrigination) {
    const semantic = suppliedParameters as z.infer<typeof v35OriginationParameters>;
    const origination = await buildManagedMacaroniV35Origination({
      drop,
      contractMetadataUri: semantic.contract_metadata_uri,
      minterRoyalty: semantic.minter_royalty,
    });
    parameters = {
      code: origination.code,
      storage: origination.storage,
      codeDigest: origination.codeDigest,
      storageDigest: origination.storageDigest,
      abiVersion: origination.abiVersion,
      finalizer: origination.finalizer,
      contractMetadataUri: semantic.contract_metadata_uri,
    };
    await db.update(macaroniV35Drops).set({
      operatorAddress: origination.finalizer,
      abiVersion: origination.abiVersion,
      updatedAt: new Date(),
    }).where(eq(macaroniV35Drops.id, drop.id));
  } else if (isCreatorKeyReveal) {
    parameters = { wallet: null, micheline: null, routedMicheline: null };
  } else {
    const encoded = await encodeCreatorEntrypointParameters(
      input.stepKey as Exclude<CreatorStepKey, "originate_contract" | "reveal_creator_key">,
      suppliedParameters
    );
    parameters = {
      wallet: suppliedParameters,
      micheline: encoded.value,
      routedMicheline: encoded.full,
    };
  }
  const expectedPostcondition = creatorStepExpectedPostcondition({
    stepKey: input.stepKey,
    parameters: input.stepKey === "originate_contract" ? parameters : suppliedParameters,
    amountMutez,
  });
  const intentDigest = hashMacaroniV35Payload({
    network: drop.network,
    signer: drop.administrator,
    target,
    entrypoint,
    amountMutez,
    parameters,
    expectedPostcondition,
    batchIndex: input.batchIndex ?? null,
    finalBatch: input.finalBatch ?? null,
  });
  const persistentStepKey = batchable
    ? `${input.stepKey}:${String(input.batchIndex).padStart(6, "0")}`
    : input.stepKey;
  const existing = (await db.select().from(macaroniV35OperationAttempts)
    .where(eq(macaroniV35OperationAttempts.requestId, input.requestId)).limit(1))[0];
  if (existing) {
    if (existing.dropId !== drop.id || existing.intentDigest !== intentDigest) {
      throw new Error("Request id is already bound to a different immutable wallet intent");
    }
    return existing;
  }
  if (input.retryOfAttemptId) {
    const prior = (await db.select().from(macaroniV35OperationAttempts).where(and(
      eq(macaroniV35OperationAttempts.id, input.retryOfAttemptId),
      eq(macaroniV35OperationAttempts.dropId, drop.id)
    )).limit(1))[0];
    if (!prior || prior.setupStepId == null || prior.intentDigest !== intentDigest) {
      throw new Error("Retry must reference the same reconciled setup intent");
    }
    if (prior.state !== "wallet_rejected" && !prior.reconciledAt) {
      throw new Error("The prior attempt must be reconciled before retry");
    }
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [createdStep] = await tx.insert(macaroniV35SetupSteps).values({
      dropId: drop.id,
      stepKey: persistentStepKey,
      status: "in_progress",
      intentDigest,
      expectedPostcondition,
      parameters,
      network: drop.network,
      signer: drop.administrator,
      target,
      entrypoint,
      amountMutez,
      details: {
        activationLast: input.stepKey === "activate_sale",
        logicalStep: input.stepKey,
        batchIndex: input.batchIndex ?? null,
        finalBatch: input.finalBatch ?? null,
      },
    }).onConflictDoNothing({
      target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
    }).returning();
    const step = createdStep ?? (await tx.select().from(macaroniV35SetupSteps).where(and(
      eq(macaroniV35SetupSteps.dropId, drop.id),
      eq(macaroniV35SetupSteps.stepKey, persistentStepKey)
    )).limit(1))[0];
    if (!step || step.intentDigest !== intentDigest) {
      throw new Error("Setup step is already bound to a different immutable intent");
    }
    const [attempt] = await tx.insert(macaroniV35OperationAttempts).values({
      dropId: drop.id,
      setupStepId: step.id,
      retryOfAttemptId: input.retryOfAttemptId ?? null,
      requestId: input.requestId,
      intent: input.stepKey,
      intentDigest,
      expectedPostcondition,
      parameters,
      network: drop.network,
      signer: drop.administrator,
      target,
      entrypoint,
      amountMutez,
      state: "awaiting_signature",
      createdAt: now,
      updatedAt: now,
    }).returning();
    return attempt;
  });
}

export async function recordManagedMacaroniV35WalletRejection(input: {
  ownerUserId: number;
  dropId: number;
  attemptId: number;
  requestId: string;
  confirmNoBroadcast: true;
  reason?: string;
}) {
  const owned = await ownedMacaroniV35Drop(input);
  if (!owned) return null;
  const now = new Date();
  const [attempt] = await db.update(macaroniV35OperationAttempts).set({
    state: "wallet_rejected",
    error: input.reason || "Creator declined or closed the wallet request",
    reconciliation: {
      explicitPreSendCancellation: true,
      confirmNoBroadcast: input.confirmNoBroadcast,
      walletPromptWasNeverStarted: true,
    },
    reconciledAt: now,
    updatedAt: now,
  }).where(and(
    eq(macaroniV35OperationAttempts.id, input.attemptId),
    eq(macaroniV35OperationAttempts.dropId, input.dropId),
    eq(macaroniV35OperationAttempts.requestId, input.requestId),
    isNull(macaroniV35OperationAttempts.operationHash),
    eq(macaroniV35OperationAttempts.state, "awaiting_signature")
  )).returning();
  if (!attempt) {
    throw new Error("Only the exact pre-send review attempt can be cancelled; once the wallet prompt starts, use the authenticated Beacon-abort path or recover and reconcile the exact operation");
  }
  await db.update(macaroniV35SetupSteps).set({ status: "pending", updatedAt: now })
    .where(eq(macaroniV35SetupSteps.id, attempt.setupStepId!));
  return attempt;
}

export function macaroniV35RemoteWalletAbortCanTerminalize(input: {
  state: string;
  expectedRequestId: string;
  requestId: string;
  operationHash?: string | null;
  walletErrorType: string;
  walletResponseId: string;
  walletSenderId: string;
}) {
  return input.state === "wallet_prompt_started"
    && input.expectedRequestId === input.requestId
    && !input.operationHash
    && input.walletErrorType === "ABORTED_ERROR"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.walletResponseId)
    && /^[1-9A-HJ-NP-Za-km-z]{10,80}$/.test(input.walletSenderId);
}

export async function recordManagedMacaroniV35WalletPromptAbort(input: {
  ownerUserId: number;
  dropId: number;
  attemptId: number;
  requestId: string;
  walletErrorType: "ABORTED_ERROR";
  walletResponseId: string;
  walletSenderId: string;
}) {
  const owned = await ownedMacaroniV35Drop(input);
  if (!owned) return null;
  const attempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.id, input.attemptId),
    eq(macaroniV35OperationAttempts.dropId, input.dropId)
  )).limit(1))[0];
  if (!attempt) throw new Error("Wallet prompt attempt not found");
  const evidenceDigest = hashMacaroniV35Payload({
    attemptId: input.attemptId,
    requestId: input.requestId,
    walletErrorType: input.walletErrorType,
    walletResponseId: input.walletResponseId,
    walletSenderId: input.walletSenderId,
  });
  const reconciliation = attempt.reconciliation as Record<string, unknown> | null;
  if (attempt.state === "wallet_rejected") {
    if (attempt.requestId === input.requestId
      && attempt.walletResponseId === input.walletResponseId
      && attempt.walletSenderId === input.walletSenderId
      && reconciliation?.remoteBeaconAbort === true
      && reconciliation?.walletAbortEvidenceDigest === evidenceDigest) {
      return attempt;
    }
    throw new Error("Wallet abort evidence does not match the terminal attempt record");
  }
  if (!macaroniV35RemoteWalletAbortCanTerminalize({
    state: attempt.state,
    expectedRequestId: attempt.requestId,
    requestId: input.requestId,
    operationHash: attempt.operationHash,
    walletErrorType: input.walletErrorType,
    walletResponseId: input.walletResponseId,
    walletSenderId: input.walletSenderId,
  })) {
    throw new Error("Only the exact remote Beacon ABORTED_ERROR response may release a started wallet prompt; catch-only, local, stale, or ambiguous errors require operation recovery");
  }
  const now = new Date();
  const [rejected] = await db.update(macaroniV35OperationAttempts).set({
    state: "wallet_rejected",
    walletResponseId: input.walletResponseId,
    walletSenderId: input.walletSenderId,
    error: "The connected remote wallet reported that the creator aborted the request before broadcast",
    reconciliation: {
      remoteBeaconAbort: true,
      evidenceSource: "beacon_operation_request_error_event",
      walletErrorType: input.walletErrorType,
      walletResponseId: input.walletResponseId,
      walletSenderId: input.walletSenderId,
      walletAbortEvidenceDigest: evidenceDigest,
      retrySafe: true,
    },
    reconciledAt: now,
    updatedAt: now,
  }).where(and(
    eq(macaroniV35OperationAttempts.id, attempt.id),
    eq(macaroniV35OperationAttempts.dropId, input.dropId),
    eq(macaroniV35OperationAttempts.requestId, input.requestId),
    eq(macaroniV35OperationAttempts.state, "wallet_prompt_started"),
    isNull(macaroniV35OperationAttempts.operationHash)
  )).returning();
  if (!rejected) {
    const current = (await db.select().from(macaroniV35OperationAttempts).where(and(
      eq(macaroniV35OperationAttempts.id, attempt.id),
      eq(macaroniV35OperationAttempts.dropId, input.dropId)
    )).limit(1))[0];
    const currentReconciliation = current?.reconciliation as Record<string, unknown> | null;
    if (current?.state === "wallet_rejected"
      && current.requestId === input.requestId
      && current.walletResponseId === input.walletResponseId
      && current.walletSenderId === input.walletSenderId
      && currentReconciliation?.walletAbortEvidenceDigest === evidenceDigest) {
      return current;
    }
    throw new Error("Wallet prompt state changed before the authenticated abort response was persisted");
  }
  if (rejected.setupStepId) {
    await db.update(macaroniV35SetupSteps).set({ status: "pending", updatedAt: now })
      .where(eq(macaroniV35SetupSteps.id, rejected.setupStepId));
  }
  return rejected;
}

export async function recordManagedMacaroniV35WalletPromptStarted(input: {
  ownerUserId: number;
  dropId: number;
  attemptId: number;
  requestId: string;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  const attempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.id, input.attemptId),
    eq(macaroniV35OperationAttempts.dropId, input.dropId),
    eq(macaroniV35OperationAttempts.requestId, input.requestId)
  )).limit(1))[0];
  if (!attempt) throw new Error("Wallet prompt attempt not found");
  if (attempt.state === "wallet_prompt_started") return attempt;
  if (attempt.state !== "awaiting_signature" || attempt.operationHash) {
    throw new Error("Wallet prompt can start only once for the exact pre-send creator action");
  }
  const finality = await managedSetupFinalityContext(drop.network);
  const equivalent = await findFinalizedEquivalentCreatorOperation({
    drop,
    attempt,
    finalizedBlock: finality.finalizedBlock,
  });
  if (equivalent) {
    return persistObservedCreatorOperationHash({
      drop,
      attempt,
      operationHash: equivalent.hash,
      originatedContract: equivalent.originatedContract,
    });
  }
  const window = await observeHashlessCreatorActionWindow({ drop, attempt });
  if (window.pending?.hash) {
    return persistObservedCreatorOperationHash({
      drop,
      attempt,
      operationHash: window.pending.hash,
    });
  }
  const now = new Date();
  const [started] = await db.update(macaroniV35OperationAttempts).set({
    state: "wallet_prompt_started",
    reconciliation: {
      walletPromptStarted: true,
      exactOperationHashRequiredAfterSend: true,
      promptHeadForAuditOnly: window.horizon,
      retrySafe: false,
    },
    updatedAt: now,
  }).where(and(
    eq(macaroniV35OperationAttempts.id, attempt.id),
    eq(macaroniV35OperationAttempts.state, "awaiting_signature"),
    isNull(macaroniV35OperationAttempts.operationHash)
  )).returning();
  if (!started) throw new Error("Creator attempt changed before the wallet prompt horizon was persisted");
  return started;
}

export async function recordManagedMacaroniV35SubmittedAttempt(input: {
  ownerUserId: number;
  dropId: number;
  attemptId: number;
  operationHash: string;
  originatedContract?: string;
}) {
  const owned = await ownedMacaroniV35Drop(input);
  if (!owned) return null;
  const now = new Date();
  const persisted = await db.transaction(async (tx) => {
    const existing = (await tx.select().from(macaroniV35OperationAttempts).where(and(
      eq(macaroniV35OperationAttempts.id, input.attemptId),
      eq(macaroniV35OperationAttempts.dropId, input.dropId)
    )).limit(1))[0];
    if (!existing) throw new Error("Setup operation attempt not found");
    if (existing.entrypoint !== "origination" && input.originatedContract) {
      throw new Error("Only an origination attempt can record an originated contract");
    }
    if (existing.operationHash) {
      if (existing.operationHash !== input.operationHash
        || (input.originatedContract && existing.originatedContract && existing.originatedContract !== input.originatedContract)) {
        throw new Error("Submitted operation hash or originated contract cannot be replaced");
      }
      if (input.originatedContract && !existing.originatedContract) {
        const [updated] = await tx.update(macaroniV35OperationAttempts).set({
          originatedContract: input.originatedContract,
          updatedAt: now,
        }).where(and(
          eq(macaroniV35OperationAttempts.id, existing.id),
          isNull(macaroniV35OperationAttempts.originatedContract)
        )).returning();
        return updated ?? existing;
      }
      return existing;
    }
    if (existing.state !== "wallet_prompt_started") {
      throw new Error("Persist the wallet-prompt-started boundary before submitting this operation hash");
    }
    const [attempt] = await tx.update(macaroniV35OperationAttempts).set({
      state: "submitted",
      operationHash: input.operationHash,
      originatedContract: input.originatedContract ?? null,
      submittedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35OperationAttempts.id, existing.id),
      isNull(macaroniV35OperationAttempts.operationHash)
    )).returning();
    if (!attempt) throw new Error("Could not durably record the submitted operation");
    await tx.update(macaroniV35SetupSteps).set({
      status: "submitted",
      operationHash: input.operationHash,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35SetupSteps.id, existing.setupStepId!),
      or(isNull(macaroniV35SetupSteps.operationHash), eq(macaroniV35SetupSteps.operationHash, input.operationHash))
    ));
    return attempt;
  });
  // The operation hash is the first durability boundary. Envelope/horizon
  // evidence is collected only after that commit, so an RPC outage can never
  // recreate the wallet-return-to-database orphan gap.
  try {
    return (await observeCreatorSubmissionEnvelope({
      drop: owned,
      attempt: persisted,
      requireEveryRpc: false,
    })).attempt;
  } catch {
    return persisted;
  }
}

async function operationPostconditionIsApplied(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  finalizedBlock: number;
}) {
  if (input.attempt.intent === "reveal_creator_key") {
    return Boolean(await readManagerKeyAtBlock(
      input.drop.network,
      input.drop.administrator,
      input.finalizedBlock
    ));
  }
  if (!input.drop.contract) return false;
  if (input.attempt.entrypoint === "finalize_setup" || input.attempt.entrypoint === "activate_sale"
    || input.attempt.entrypoint === "close_sale") {
    const attached = await readAttachedMacaroniV35Contract({
      network: input.drop.network,
      contract: input.drop.contract,
      block: input.finalizedBlock,
    });
    if (input.attempt.entrypoint === "finalize_setup") return attached.storage.setup_finalized === true;
    if (input.attempt.entrypoint === "activate_sale") {
      return attached.storage.sale_activated === true && attached.storage.sale_active === true
        && attached.storage.sale_permanently_closed === false;
    }
    return attached.storage.sale_permanently_closed === true && attached.storage.sale_active === false;
  }
  if (input.attempt.entrypoint === "fund_fulfillment_reserve") {
    const balance = await readMacaroniV35ContractBalance(input.drop.network, input.drop.contract, input.finalizedBlock);
    return Number.isSafeInteger(balance) && balance >= input.drop.contractReserveRequiredMutez;
  }
  return true;
}

async function readMacaroniV35ContractBalance(network: V35Network, contract: string, block: string | number = "head") {
  const balanceUrl = new URL(
    `chains/main/blocks/${block}/context/contracts/${contract}/balance`,
    V35_RPC[network]
  );
  const response = await fetch(balanceUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Could not read contract balance (HTTP ${response.status})`);
  const balance = Number(await response.json());
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Contract balance is outside safe integer precision");
  return balance;
}

async function readManagedMacaroniV35OperatorReadiness(
  network: V35Network,
  operator: string,
  block: string | number = "head"
) {
  // Activation is checked after the one-time arm call has already spent its
  // measured fee. The remaining liquid floor is five settlement envelopes.
  const required = managedReserveEstimate()?.initialReserve ?? 0;
  if (!required) throw new Error("The evidence-derived V3.5 finalizer startup policy is unavailable");
  const [balanceResponse, keyResponse] = await Promise.all([
    fetch(new URL(`chains/main/blocks/${block}/context/contracts/${operator}/balance`, V35_RPC[network]), {
      signal: AbortSignal.timeout(20_000),
    }),
    fetch(new URL(`chains/main/blocks/${block}/context/contracts/${operator}/manager_key`, V35_RPC[network]), {
      signal: AbortSignal.timeout(20_000),
    }),
  ]);
  if (!balanceResponse.ok || !keyResponse.ok) throw new Error("Could not verify managed finalizer wallet readiness");
  const balance = Number(await balanceResponse.json());
  const managerKey = await keyResponse.json() as string | null;
  return {
    balance: Number.isSafeInteger(balance) && balance >= 0 ? balance : 0,
    required,
    keyRevealed: Boolean(managerKey),
    ready: Number.isSafeInteger(balance) && balance >= required && Boolean(managerKey),
  };
}

async function reconcileMacaroniV35Origination(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  lookupOperationHash?: string;
  equivalentOperationHash?: string;
}) {
  if (!input.attempt.operationHash || !input.attempt.signer) {
    throw new Error("Origination attempt is missing its durably recorded operation hash or signer");
  }
  const lookupOperationHash = input.lookupOperationHash ?? input.attempt.operationHash;
  const rows = await V35_TZKT[input.drop.network].getJson<Array<{
    level?: number;
    status?: string;
    sender?: { address?: string };
    originatedContract?: { address?: string };
    contractBalance?: number | string;
    code?: unknown;
    storage?: unknown;
  }>>(`/operations/originations/${encodeURIComponent(lookupOperationHash)}?micheline=2`);
  if (!rows.length) return { indexed: false as const };
  const finality = await managedSetupFinalityContext(input.drop.network);
  const expected = input.attempt.parameters as { code?: unknown; storage?: unknown } | null;
  const match = rows.find((row) =>
    row.status === "applied"
    && row.sender?.address === input.attempt.signer
    && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(row.originatedContract?.address || ""))
    && (!input.attempt.originatedContract || row.originatedContract?.address === input.attempt.originatedContract)
    && Number(row.contractBalance ?? 0) === input.attempt.amountMutez
    && hashMacaroniV35Payload(row.code) === hashMacaroniV35Payload(expected?.code)
    && hashMacaroniV35Payload(row.storage) === hashMacaroniV35Payload(expected?.storage)
  );
  if (!match) return { indexed: true as const, applied: false as const };
  if (!Number.isSafeInteger(match.level) || Number(match.level) > finality.finalizedBlock) {
    return { indexed: true as const, applied: false as const, pendingConfirmation: true as const };
  }
  const derivedContract = String(match.originatedContract!.address);
  const attached = await validateAttachedMacaroniV35Contract({
    network: input.drop.network,
    contract: derivedContract,
    administrator: input.drop.administrator,
    drop: input.drop,
    block: finality.finalizedBlock,
  });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(macaroniV35OperationAttempts).set({
      state: "applied",
      error: null,
      reconciliation: {
        indexed: true,
        exactSenderCodeStorageAndDerivedContract: true,
        contractCodeDigest: attached.codeDigest,
        ...(input.equivalentOperationHash
          ? { originalHashExpiredOrUnrecoverable: input.attempt.operationHash, equivalentOperationHash: input.equivalentOperationHash }
          : {}),
      },
      originatedContract: derivedContract,
      reconciledAt: now,
      appliedAt: now,
      updatedAt: now,
    }).where(eq(macaroniV35OperationAttempts.id, input.attempt.id));
    if (input.attempt.setupStepId) {
      await tx.update(macaroniV35SetupSteps).set({
        status: "complete",
        operationHash: input.equivalentOperationHash ?? input.attempt.operationHash,
        completedAt: now,
        updatedAt: now,
      }).where(eq(macaroniV35SetupSteps.id, input.attempt.setupStepId));
    }
    await tx.update(macaroniV35Drops).set({
      contract: derivedContract,
      abiVersion: attached.templateVersion,
      abiValidatedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35Drops.id, input.drop.id),
      isNull(macaroniV35Drops.contract)
    ));
  });
  return { indexed: true as const, applied: true as const };
}

type FinalizedEquivalentCreatorOperation = {
  hash: string;
  level: number;
  originatedContract?: string;
};

async function findFinalizedEquivalentCreatorOperation(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  finalizedBlock: number;
}) : Promise<FinalizedEquivalentCreatorOperation | null> {
  if (!input.attempt.signer) return null;
  const pageSize = 1_000; // TzKT's documented REST page ceiling; pagination continues until exhausted.
  // TzKT timestamps are second-granular. Round only to the containing second;
  // prior setup batches cannot share it because each batch requires finalized
  // reconciliation before the server issues the next one.
  const createdLowerBound = new Date(
    Math.floor(input.attempt.createdAt.getTime() / 1_000) * 1_000
  ).toISOString();
  let offset = 0;
  if (input.attempt.entrypoint === "origination") {
    const expected = input.attempt.parameters as { code?: unknown; storage?: unknown } | null;
    while (true) {
      const query = new URLSearchParams({
        sender: input.attempt.signer,
        status: "applied",
        "timestamp.ge": createdLowerBound,
        micheline: "2",
        "sort.asc": "id",
        limit: String(pageSize),
        offset: String(offset),
      });
      const rows = await V35_TZKT[input.drop.network].getJson<Array<{
        hash?: string;
        level?: number;
        sender?: { address?: string };
        originatedContract?: { address?: string };
        contractBalance?: number | string;
        code?: unknown;
        storage?: unknown;
      }>>(`/operations/originations?${query.toString()}`);
      const match = rows.find((row) => row.hash && row.hash !== input.attempt.operationHash
        && row.sender?.address === input.attempt.signer
        && Number(row.contractBalance ?? 0) === input.attempt.amountMutez
        && hashMacaroniV35Payload(row.code) === hashMacaroniV35Payload(expected?.code)
        && hashMacaroniV35Payload(row.storage) === hashMacaroniV35Payload(expected?.storage)
        && Number.isSafeInteger(row.level) && Number(row.level) <= input.finalizedBlock
        && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(row.originatedContract?.address || "")));
      if (match) return {
        hash: match.hash!,
        level: Number(match.level),
        originatedContract: match.originatedContract!.address!,
      };
      if (rows.length < pageSize) return null;
      offset += rows.length;
    }
  }
  if (!input.attempt.target) return null;
  while (true) {
    const query = new URLSearchParams({
      sender: input.attempt.signer,
      target: input.attempt.target,
      status: "applied",
      "timestamp.ge": createdLowerBound,
      micheline: "2",
      "sort.asc": "id",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await V35_TZKT[input.drop.network].getJson<Array<{
      hash?: string;
      level?: number;
      sender?: { address?: string };
      target?: { address?: string };
      amount?: number | string;
      parameter?: { entrypoint?: string; value?: unknown };
    }>>(`/operations/transactions?${query.toString()}`);
    const expectedMicheline = (input.attempt.parameters as { micheline?: unknown } | null)?.micheline;
    const match = rows.find((row) => row.hash && row.hash !== input.attempt.operationHash
      && row.sender?.address === input.attempt.signer
      && row.target?.address === input.attempt.target
      && Number(row.amount ?? 0) === input.attempt.amountMutez
      && Number.isSafeInteger(row.level) && Number(row.level) <= input.finalizedBlock
      && (input.attempt.intent === "reveal_creator_key"
        ? (!row.parameter || row.parameter.entrypoint === "default")
        : row.parameter?.entrypoint === input.attempt.entrypoint
          && hashMacaroniV35Payload(row.parameter.value) === hashMacaroniV35Payload(expectedMicheline)));
    if (match) return { hash: match.hash!, level: Number(match.level) };
    if (rows.length < pageSize) return null;
    offset += rows.length;
  }
}

async function reconcileMissingCreatorOperationAfterExpiry(input: {
  drop: typeof macaroniV35Drops.$inferSelect;
  attempt: typeof macaroniV35OperationAttempts.$inferSelect;
  finality: { confirmations: number; headLevel: number; finalizedBlock: number };
}) {
  let observation: Awaited<ReturnType<typeof observeCreatorSubmissionEnvelope>>;
  try {
    observation = await observeCreatorSubmissionEnvelope({
      drop: input.drop,
      attempt: input.attempt,
      requireEveryRpc: true,
      includeConstants: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creator operation recovery proof is unavailable";
    const [pending] = await db.update(macaroniV35OperationAttempts).set({
      state: "needs_reconciliation",
      error: `${message}; retry is locked until every required absence proof succeeds`,
      reconciliation: { indexed: false, retrySafe: false, reason: "rpc_absence_proof_incomplete" },
      updatedAt: new Date(),
    }).where(eq(macaroniV35OperationAttempts.id, input.attempt.id)).returning();
    return pending;
  }
  const canRetry = macaroniV35CreatorDroppedOperationCanRetry({
    presentInIndexer: false,
    allRpcMempoolsObserved: observation.allRpcMempoolsObserved,
    presentInAnyMempool: observation.presentInAnyMempool,
    signedBranchLevel: observation.attempt.signedBranchLevel,
    submissionHeadLevel: observation.attempt.submissionHeadLevel,
    protocolMaxOperationsTtl: observation.protocolMaxOperationsTtl!,
    confirmations: input.finality.confirmations,
    rpcHeadLevels: observation.rpcHeadLevels,
    indexedHeadLevel: input.finality.headLevel,
    exactPostconditionStillPending: true,
  });
  const horizon = observation.attempt.signedBranchLevel ?? observation.attempt.submissionHeadLevel;
  const proof = {
    indexed: false,
    absentFromCanonicalIndexerThroughLevel: input.finality.headLevel,
    everyConfiguredRpcMempoolObserved: observation.allRpcMempoolsObserved,
    absentFromEveryConfiguredRpcMempool: !observation.presentInAnyMempool,
    signedBranchLevel: observation.attempt.signedBranchLevel,
    submissionHeadLevel: observation.attempt.submissionHeadLevel,
    recoveryHorizonLevel: horizon,
    protocolMaxOperationsTtl: observation.protocolMaxOperationsTtl,
    confirmations: input.finality.confirmations,
    rpcHeadLevels: observation.rpcHeadLevels,
    exactEquivalentFinalizedOperationAbsent: true,
    retrySafe: canRetry,
  };
  if (!canRetry) {
    const [pending] = await db.update(macaroniV35OperationAttempts).set({
      state: "needs_reconciliation",
      error: observation.presentInAnyMempool
        ? "Operation is still present in a Tezos mempool; retry remains prohibited"
        : "Operation is absent but its protocol branch/submission horizon has not irreversibly expired; retry remains prohibited",
      reconciliation: proof,
      updatedAt: new Date(),
    }).where(eq(macaroniV35OperationAttempts.id, input.attempt.id)).returning();
    return pending;
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [expired] = await tx.update(macaroniV35OperationAttempts).set({
      state: "failed",
      error: "The submitted wallet operation was proven absent after protocol TTL; an identical linked retry may now be issued",
      reconciliation: proof,
      reconciledAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35OperationAttempts.id, input.attempt.id),
      inArray(macaroniV35OperationAttempts.state, ["submitted", "confirming", "needs_reconciliation"]),
      isNull(macaroniV35OperationAttempts.reconciledAt)
    )).returning();
    if (!expired) throw new Error("Creator operation changed while proving its safe retry horizon");
    if (expired.setupStepId) {
      await tx.update(macaroniV35SetupSteps).set({
        status: "pending",
        operationHash: null,
        completedAt: null,
        updatedAt: now,
      }).where(eq(macaroniV35SetupSteps.id, expired.setupStepId));
    }
    return expired;
  });
}

export async function reconcileManagedMacaroniV35CreatorAttempt(input: {
  ownerUserId: number;
  dropId: number;
  attemptId: number;
}) {
  const drop = await ownedMacaroniV35Drop(input);
  if (!drop) return null;
  const attempt = (await db.select().from(macaroniV35OperationAttempts).where(and(
    eq(macaroniV35OperationAttempts.id, input.attemptId),
    eq(macaroniV35OperationAttempts.dropId, drop.id)
  )).limit(1))[0];
  if (!attempt?.operationHash || !attempt.signer || (attempt.entrypoint !== "origination" && !attempt.target)) {
    throw new Error("Attempt has no submitted operation to reconcile");
  }
  if (attempt.state === "applied" || attempt.state === "failed") return attempt;
  await db.update(macaroniV35OperationAttempts).set({ state: "confirming", updatedAt: new Date() })
    .where(eq(macaroniV35OperationAttempts.id, attempt.id));
  const finality = await managedSetupFinalityContext(drop.network);
  if (attempt.entrypoint === "origination") {
    let result = await reconcileMacaroniV35Origination({ drop, attempt });
    if (!result.indexed) {
      const equivalent = await findFinalizedEquivalentCreatorOperation({
        drop,
        attempt,
        finalizedBlock: finality.finalizedBlock,
      });
      if (equivalent) {
        result = await reconcileMacaroniV35Origination({
          drop,
          attempt,
          lookupOperationHash: equivalent.hash,
          equivalentOperationHash: equivalent.hash,
        });
      } else {
        return reconcileMissingCreatorOperationAfterExpiry({ drop, attempt, finality });
      }
    }
    if (result.applied) {
      return (await db.select().from(macaroniV35OperationAttempts)
        .where(eq(macaroniV35OperationAttempts.id, attempt.id)).limit(1))[0];
    }
    const terminal = result.indexed && !("pendingConfirmation" in result && result.pendingConfirmation);
    const [pending] = await db.update(macaroniV35OperationAttempts).set({
      state: terminal ? "failed" : "needs_reconciliation",
      error: terminal
        ? "Indexed origination does not match the immutable sender, code, storage, amount, or derived KT1"
        : result.indexed
          ? "Origination is indexed but not yet final; retry reconciliation without originating again"
          : "Origination has not been indexed yet; retry reconciliation without originating again",
      reconciliation: {
        indexed: result.indexed,
        minimumSuccessorBlocksObserved: terminal,
      },
      reconciledAt: terminal ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(macaroniV35OperationAttempts.id, attempt.id)).returning();
    return pending;
  }
  type CreatorTransactionRow = {
    level?: number;
    status?: string;
    hash?: string;
    sender?: { address?: string };
    target?: { address?: string };
    amount?: number | string;
    parameter?: { entrypoint?: string; value?: unknown };
  };
  let equivalentOperationHash: string | null = null;
  let rows = await V35_TZKT[drop.network].getJson<CreatorTransactionRow[]>(
    `/operations/transactions/${encodeURIComponent(attempt.operationHash)}?micheline=2`
  );
  if (!rows.length) {
    const equivalent = await findFinalizedEquivalentCreatorOperation({
      drop,
      attempt,
      finalizedBlock: finality.finalizedBlock,
    });
    if (!equivalent) return reconcileMissingCreatorOperationAfterExpiry({ drop, attempt, finality });
    equivalentOperationHash = equivalent.hash;
    rows = await V35_TZKT[drop.network].getJson<CreatorTransactionRow[]>(
      `/operations/transactions/${encodeURIComponent(equivalent.hash)}?micheline=2`
    );
    if (!rows.length) throw new Error("Equivalent finalized creator operation disappeared from the indexer");
  }
  const expectedMicheline = (attempt.parameters as { micheline?: unknown } | null)?.micheline;
  const call = rows.find((row) =>
    row.status === "applied"
    && row.sender?.address === attempt.signer
    && row.target?.address === attempt.target
    && Number(row.amount ?? 0) === attempt.amountMutez
    && (attempt.intent === "reveal_creator_key"
      ? (!row.parameter || row.parameter.entrypoint === "default")
      : row.parameter?.entrypoint === attempt.entrypoint
        && hashMacaroniV35Payload(row.parameter?.value) === hashMacaroniV35Payload(expectedMicheline))
  );
  const exactCall = Boolean(call);
  if (call && (!Number.isSafeInteger(call.level) || Number(call.level) > finality.finalizedBlock)) {
    const [pending] = await db.update(macaroniV35OperationAttempts).set({
      state: "needs_reconciliation",
      error: "Operation is indexed but does not yet have the required successor block; retry reconciliation without resubmitting",
      reconciliation: {
        indexed: true,
        exactSignerTargetEntrypointAmountAndParameters: true,
        finalized: false,
      },
      updatedAt: new Date(),
    }).where(eq(macaroniV35OperationAttempts.id, attempt.id)).returning();
    return pending;
  }
  const postcondition = exactCall
    ? await operationPostconditionIsApplied({ drop, attempt, finalizedBlock: finality.finalizedBlock })
    : false;
  const applied = exactCall && postcondition;
  const now = new Date();
  const [reconciled] = await db.update(macaroniV35OperationAttempts).set({
    state: applied ? "applied" : "failed",
    error: applied ? null : "Indexed operation does not match the immutable intent or expected postcondition",
    reconciliation: {
      indexed: true,
      exactSignerTargetEntrypointAndAmount: exactCall,
      expectedPostconditionObserved: postcondition,
      ...(equivalentOperationHash
        ? { originalHashExpiredOrUnrecoverable: attempt.operationHash, equivalentOperationHash }
        : {}),
    },
    reconciledAt: now,
    appliedAt: applied ? now : null,
    updatedAt: now,
  }).where(eq(macaroniV35OperationAttempts.id, attempt.id)).returning();
  if (attempt.setupStepId) {
    await db.update(macaroniV35SetupSteps).set({
      status: applied ? "complete" : "failed",
      operationHash: applied && equivalentOperationHash ? equivalentOperationHash : attempt.operationHash,
      completedAt: applied ? now : null,
      updatedAt: now,
    }).where(eq(macaroniV35SetupSteps.id, attempt.setupStepId));
  }
  if (applied && attempt.entrypoint === "fund_fulfillment_reserve") {
    const effectiveOperationHash = equivalentOperationHash ?? attempt.operationHash;
    const observedBalance = await readMacaroniV35ContractBalance(
      drop.network,
      drop.contract!,
      finality.finalizedBlock
    );
    await db.update(macaroniV35Drops).set({
      contractReserveObservedMutez: observedBalance,
      updatedAt: now,
    }).where(eq(macaroniV35Drops.id, drop.id));
    await db.insert(macaroniV35FundingLedger).values({
      dropId: drop.id,
      direction: "credit",
      account: "contract_reserve",
      kind: "initial_reserve",
      amountMutez: attempt.amountMutez,
      balanceAfterMutez: observedBalance,
      semanticEventKey: `creator-funding-attempt:${attempt.id}`,
      operationHash: effectiveOperationHash,
      sourceRef: `setup-attempt:${attempt.id}`,
      details: { reserveOwner: "drop_contract", finalizedBlock: finality.finalizedBlock },
      occurredAt: now,
    }).onConflictDoNothing({
      target: [macaroniV35FundingLedger.dropId, macaroniV35FundingLedger.semanticEventKey],
    });
    await enqueueMacaroniV35Work({
      dropId: drop.id,
      workType: "arm_fulfillment",
      semanticKey: "arm-managed-fulfillment-v1",
      payload: { dropId: drop.id },
      eligibleAt: now,
    });
  }
  if (applied && attempt.entrypoint === "activate_sale") {
    await db.update(macaroniV35Drops).set({
      status: "active",
      publicStatus: {
        state: "active",
        message: "Sale is active. Purchases are secured and automatic fulfillment is running.",
        fulfilledClaims: Number(drop.publicStatus.fulfilledClaims || 0),
        pendingClaims: Number(drop.publicStatus.pendingClaims || 0),
      },
      updatedAt: now,
    }).where(eq(macaroniV35Drops.id, drop.id));
  }
  if (applied && attempt.entrypoint === "close_sale") {
    const effectiveOperationHash = equivalentOperationHash ?? attempt.operationHash;
    const attached = await readAttachedMacaroniV35Contract({
      network: drop.network,
      contract: drop.contract!,
      block: finality.finalizedBlock,
    });
    const claimsCreated = storageNat(attached.storage, "claims_created");
    const claimsSettled = storageNat(attached.storage, "claims_settled");
    const swept = attached.storage.final_sweep_complete === true;
    const finalSweepAmount = storageNat(attached.storage, "final_sweep_amount");
    await db.update(macaroniV35Drops).set({
      status: swept ? "completed" : "closed",
      salePermanentlyClosedAt: now,
      finalFulfillmentAt: swept ? now : drop.finalFulfillmentAt,
      finalSweepOperationHash: swept ? effectiveOperationHash : drop.finalSweepOperationHash,
      completedAt: swept ? now : drop.completedAt,
      publicStatus: {
        state: swept ? "completed" : "closed",
        message: swept
          ? "Sale permanently closed; all purchased NFTs are fulfilled and the remaining contract balance was swept automatically."
          : "Sale permanently closed. Existing purchases remain secured and automatic fulfillment is continuing.",
        fulfilledClaims: claimsSettled,
        pendingClaims: Math.max(0, claimsCreated - claimsSettled),
      },
      updatedAt: now,
    }).where(eq(macaroniV35Drops.id, drop.id));
    if (swept) {
      await db.insert(macaroniV35FundingLedger).values({
        dropId: drop.id,
        direction: "debit",
        account: "contract_reserve",
        kind: "automatic_final_sweep",
        amountMutez: finalSweepAmount,
        balanceAfterMutez: 0,
        semanticEventKey: "automatic-final-sweep",
        operationHash: effectiveOperationHash,
        sourceRef: `setup-attempt:${attempt.id}`,
        details: { afterPermanentCloseWithNoPendingClaims: true },
        occurredAt: now,
      }).onConflictDoNothing({
        target: [macaroniV35FundingLedger.dropId, macaroniV35FundingLedger.semanticEventKey],
      });
    }
  }
  if (applied) {
    await refreshLogicalSetupPhases({ drop, appliedAttempt: reconciled });
  }
  return reconciled;
}

export async function getPublicMacaroniV35Status(network: "mainnet" | "shadownet", contract: string) {
  const drop = (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.network, network),
    eq(macaroniV35Drops.contract, contract)
  )).limit(1))[0];
  return drop ? publicMacaroniV35DropStatus(drop) : null;
}

export async function getPublicMacaroniV35ClaimStatus(input: {
  network: "mainnet" | "shadownet";
  contract: string;
  claimId: string;
}) {
  const row = (await db.select({
    claimId: macaroniV35ClaimFulfillments.claimId,
    state: macaroniV35ClaimFulfillments.state,
    settlementOperationHash: macaroniV35ClaimFulfillments.settlementOperationHash,
    settledAt: macaroniV35ClaimFulfillments.settledAt,
    publishedAt: macaroniV35ClaimFulfillments.publishedAt,
    readyAt: macaroniV35ClaimFulfillments.readyAt,
  }).from(macaroniV35ClaimFulfillments)
    .innerJoin(macaroniV35Drops, eq(macaroniV35ClaimFulfillments.dropId, macaroniV35Drops.id))
    .where(and(
      eq(macaroniV35Drops.network, input.network),
      eq(macaroniV35Drops.contract, input.contract),
      eq(macaroniV35ClaimFulfillments.claimId, input.claimId)
    )).limit(1))[0];
  if (!row) return null;
  const message = row.state === "artwork_secured"
    ? "Artwork secured"
    : row.state === "publishing_ipfs"
      ? "Publishing to IPFS"
      : row.state === "nft_ready"
        ? "NFT ready"
        : "Purchase secured; automatic completion is in progress";
  return {
    schema: "wtfos.macaroni-v35-claim-status.v1",
    claimId: row.claimId,
    state: row.state,
    message,
    settlementOperationHash: row.settlementOperationHash,
    settledAt: row.settledAt,
    publishedAt: row.publishedAt,
    readyAt: row.readyAt,
  };
}

export async function getPublicMacaroniV35PurchaseStatus(input: {
  network: "mainnet" | "shadownet";
  contract: string;
  operationHash: string;
}) {
  const rows = await db.select({
    claimId: macaroniV35ClaimFulfillments.claimId,
    eventIndex: macaroniV35ClaimFulfillments.purchaseEventIndex,
    state: macaroniV35ClaimFulfillments.state,
    settlementOperationHash: macaroniV35ClaimFulfillments.settlementOperationHash,
  }).from(macaroniV35ClaimFulfillments)
    .innerJoin(macaroniV35Drops, eq(macaroniV35ClaimFulfillments.dropId, macaroniV35Drops.id))
    .where(and(
      eq(macaroniV35Drops.network, input.network),
      eq(macaroniV35Drops.contract, input.contract),
      eq(macaroniV35ClaimFulfillments.purchaseOperationHash, input.operationHash)
    )).orderBy(asc(macaroniV35ClaimFulfillments.purchaseEventIndex));
  if (!rows.length) return null;
  return {
    schema: "wtfos.macaroni-v35-purchase-status.v1",
    operationHash: input.operationHash,
    claims: rows,
  };
}

export async function wakePublicMacaroniV35Drop(network: "mainnet" | "shadownet", contract: string) {
  const drop = (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.network, network),
    eq(macaroniV35Drops.contract, contract)
  )).limit(1))[0];
  if (!drop) return { registered: false, accepted: false, reason: "not_registered" } as const;
  const status = publicMacaroniV35DropStatus(drop);
  if (!status.serviceReady) {
    return {
      registered: true,
      accepted: false,
      reason: status.serviceBlocker?.code || "drop_fulfillment_not_ready",
      status,
    } as const;
  }
  const queued = await enqueueMacaroniV35Work({
    dropId: drop.id,
    workType: "scan_claims",
    semanticKey: `purchase-event-cursor:${drop.lastScannedPurchaseEventId}`,
    payload: {
      network,
      contract,
      purchaseEventCursor: drop.lastScannedPurchaseEventId,
    },
    eligibleAt: new Date(),
  });
  const [requeued] = queued.created ? [] : await db.update(macaroniV35WorkItems).set({
    state: "queued",
    eligibleAt: new Date(),
    nextAttemptAt: new Date(),
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(macaroniV35WorkItems.id, queued.workItem.id),
    eq(macaroniV35WorkItems.state, "completed")
  )).returning();
  return {
    registered: true,
    accepted: true,
    idempotent: !queued.created && !requeued,
    workItemId: queued.workItem.id,
  } as const;
}
