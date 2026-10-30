import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { managedMacaroniV35CarPublisherConfig } from "./v35-runtime-config";

export const MACARONI_V35_MANAGED_PERMISSION = "use_managed_macaroni" as const;
export const MACARONI_V35_CAPABILITY_SCHEMA = "wtfos.macaroni-v35-capabilities.v1";
export const MACARONI_V35_PUBLIC_STATUS_SCHEMA = "wtfos.macaroni-v35-public-status.v1";
export const MACARONI_V35_SETUP_SCHEMA = "wtfos.macaroni-v35-setup.v1";

export const MACARONI_V35_ACCESS_REQUEST_TEXT = [
  "Please grant me Managed Macaroni access.",
  "I understand that wtfOS will hold private drop assets and operate a funded fulfillment signer for this drop.",
  "My creator account and Tezos administrator wallet are ready for review.",
].join(" ");

export const macaroniV35NetworkSchema = z.enum(["mainnet", "shadownet"]);
export const macaroniV35ProviderSchema = z.enum(["wtfos_managed", "creator_companion"]);
export const macaroniV35AssetStrategySchema = z.enum(["public_prepin_private_manifest", "pin_on_claim"]);
export const macaroniV35FulfillmentTriggerSchema = z.enum([
  "immediate",
  "rolling_delay",
  "absolute_time",
  "sellout",
]);
export const macaroniV35CreatorStepKeySchema = z.enum([
  "reveal_creator_key",
  "originate_contract",
  "add_tokens_v35",
  "append_token_slots_v35",
  "set_stages",
  "set_allowlist",
  "finalize_setup",
  "fund_fulfillment_reserve",
  "activate_sale",
  "close_sale",
]);

const tezosImplicitAddress = /^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/;
const tezosContractAddress = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export const macaroniV35IdentitySchema = z.object({
  clientSetupId: z.string().uuid(),
  network: macaroniV35NetworkSchema,
  contract: z.string().regex(tezosContractAddress).nullable().optional(),
  administrator: z.string().regex(tezosImplicitAddress),
});

export const macaroniV35RegistrationSchema = macaroniV35IdentitySchema.extend({
  physicalSupply: z.number().int().positive(),
  provider: macaroniV35ProviderSchema,
  assetStrategy: macaroniV35AssetStrategySchema,
  fulfillmentTrigger: macaroniV35FulfillmentTriggerSchema,
  claimDelaySeconds: z.number().int().nonnegative().default(0),
  claimIntervalSeconds: z.number().int().nonnegative().default(0),
  fulfillmentScheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  salesProceedsAddress: z.string().regex(tezosImplicitAddress),
  proof: z.object({
    nonce: z.string().regex(/^[0-9a-f]{64}$/i),
    publicKey: z.string().trim().min(1).max(128),
    signature: z.string().trim().min(1).max(256),
  }),
}).superRefine((input, ctx) => {
  if (input.provider !== "wtfos_managed") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["provider"],
      message: "Creator-companion drops are registered with the local companion, not the managed API",
    });
  }
  if (input.fulfillmentTrigger === "absolute_time" && !input.fulfillmentScheduledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fulfillmentScheduledAt"],
      message: "Absolute-time fulfillment requires a scheduled time",
    });
  }
});

export const macaroniV35AttachSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  contract: z.string().regex(tezosContractAddress),
  proof: z.object({
    nonce: z.string().regex(/^[0-9a-f]{64}$/i),
    publicKey: z.string().trim().min(1).max(128),
    signature: z.string().trim().min(1).max(256),
  }),
});

export const macaroniV35PrepareAttemptSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  stepKey: macaroniV35CreatorStepKeySchema,
  requestId: z.string().regex(/^[A-Za-z0-9:._-]{1,160}$/),
  retryOfAttemptId: z.number().int().positive().nullable().optional(),
  batchIndex: z.number().int().nonnegative().optional(),
  finalBatch: z.boolean().optional(),
  parameters: z.unknown(),
  amountMutez: z.number().int().nonnegative().optional(),
});

export const macaroniV35SubmittedAttemptSchema = z.object({
  operationHash: z.string().regex(/^o[1-9A-HJ-NP-Za-km-z]{50}$/),
  originatedContract: z.string().regex(tezosContractAddress).optional(),
});

export const macaroniV35WalletPromptStartedSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:._-]{1,160}$/),
});

// These fields must come from Beacon's raw OPERATION_REQUEST_ERROR event. Taquito's
// catch-only AbortedBeaconError deliberately omits the response and peer identities,
// and therefore cannot prove that a remote wallet prompt was actually cancelled.
export const macaroniV35WalletPromptAbortedSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:._-]{1,160}$/),
  walletErrorType: z.literal("ABORTED_ERROR"),
  walletResponseId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  walletSenderId: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{10,80}$/),
});

export const macaroniV35WalletRejectedAttemptSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:._-]{1,160}$/),
  confirmNoBroadcast: z.literal(true),
  reason: z.string().trim().max(500).optional(),
});

const macaroniV35CreatorPlanStageSchema = z.object({
  stage: z.number().int().nonnegative(),
  start: z.string().datetime({ offset: true }),
  priceMutez: z.number().int().nonnegative(),
  useAllowlist: z.boolean(),
  maxPerWallet: z.number().int().positive().nullable(),
});

const macaroniV35CreatorPlanAllowlistRowSchema = z.object({
  capacity: z.number().int().nonnegative(),
  holder: z.string().regex(tezosImplicitAddress),
  stage: z.number().int().nonnegative(),
});

export const macaroniV35CreatorPlanSchema = z.object({
  contractMetadataUri: z.string().regex(/^ipfs:\/\/[^\s]+$/),
  minterRoyalty: z.object({
    enabled: z.boolean(),
    bps: z.number().int().min(0).max(10_000),
    mode: z.number().int().nonnegative(),
  }),
  stages: z.array(macaroniV35CreatorPlanStageSchema).nonempty(),
  allowlist: z.array(macaroniV35CreatorPlanAllowlistRowSchema).default([]),
}).superRefine((plan, ctx) => {
  const stageIds = new Set<number>();
  for (const [index, stage] of plan.stages.entries()) {
    if (stageIds.has(stage.stage)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages", index, "stage"], message: "Stage ids must be unique" });
    }
    stageIds.add(stage.stage);
  }
  const allowlistKeys = new Set<string>();
  for (const [index, row] of plan.allowlist.entries()) {
    const stage = plan.stages.find((candidate) => candidate.stage === row.stage);
    if (!stage || !stage.useAllowlist) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowlist", index, "stage"], message: "Allowlist rows must reference a stage that uses an allowlist" });
    }
    const key = `${row.stage}:${row.holder}`;
    if (allowlistKeys.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowlist", index], message: "Each stage/wallet allowlist row must be unique" });
    }
    allowlistKeys.add(key);
  }
});

export const macaroniV35NextCreatorActionSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  plan: macaroniV35CreatorPlanSchema.optional(),
  requestPermanentClose: z.boolean().optional().default(false),
});

export type MacaroniV35CreatorPlan = z.infer<typeof macaroniV35CreatorPlanSchema>;

export type MacaroniV35Registration = z.infer<typeof macaroniV35RegistrationSchema>;

export type MacaroniV35CapabilityPayload = ReturnType<typeof buildMacaroniV35Capabilities>;

function positiveEnvInteger(name: string, allowZero = false) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
}

function integerEnvAtLeast(name: string, minimum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= minimum;
}

function configuredVersionedKeyring(prefix: "ENTROPY" | "RECOVERY") {
  const serialized = String(process.env[`MACARONI_V35_${prefix}_KEYRING_JSON`] || "").trim();
  const active = String(process.env[`MACARONI_V35_${prefix}_ACTIVE_KEY_VERSION`] || "").trim();
  if (serialized || active) {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      return Boolean(active && parsed && typeof parsed === "object"
        && typeof parsed[active] === "string" && String(parsed[active]).length >= 32);
    } catch {
      return false;
    }
  }
  const legacyKey = prefix === "ENTROPY"
    ? process.env.MACARONI_V35_ENTROPY_ENCRYPTION_KEY
    : process.env.MACARONI_V35_RECOVERY_ENCRYPTION_KEY;
  const legacyVersion = prefix === "ENTROPY"
    ? process.env.MACARONI_V35_ENTROPY_KEY_VERSION
    : process.env.MACARONI_V35_RECOVERY_KEY_VERSION;
  return String(legacyKey || "").length >= 32 && Boolean(String(legacyVersion || "").trim());
}

function signerConfigured(network: "mainnet" | "shadownet") {
  return Boolean(String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_FINALIZER_MAINNET_SECRET_KEY"
      : "MACARONI_V35_FINALIZER_SHADOWNET_SECRET_KEY"
  ] || "").trim());
}

function trustedManagedRpcConfigured(network: "mainnet" | "shadownet") {
  const value = String(process.env[
    network === "mainnet"
      ? "MACARONI_V35_TRUSTED_MAINNET_RPC_URL"
      : "MACARONI_V35_TRUSTED_SHADOWNET_RPC_URL"
  ] || "").trim();
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function configuredAssetKeyring() {
  const serialized = String(process.env.MACARONI_V35_ASSET_KEYRING_JSON || "").trim();
  const active = String(process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION || "").trim();
  if (serialized || active) {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      return Boolean(active && parsed && typeof parsed === "object"
        && typeof parsed[active] === "string" && String(parsed[active]).length >= 32);
    } catch {
      return false;
    }
  }
  return String(process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY || "").length >= 32
    && Boolean(String(process.env.MACARONI_V35_ASSET_KEY_VERSION || "").trim());
}

export type MacaroniV35MeasuredFundingPolicy = {
  evidence: string;
  version: string;
  settlementStorageBurnMutez: number;
  historicalRevealFeeMutez: number;
  fulfillmentSubsidyMutez: number;
  initialContractReserveMutez: number;
  armFulfillmentCostMutez: number;
  finalizerLiquidStartupFloorMutez: number;
};

export function measuredMacaroniV35FundingPolicy(): MacaroniV35MeasuredFundingPolicy | null {
  const manifestPath = path.resolve(
    process.cwd(),
    "public/creation-tools/macaroni/contract/macaroni-v35.template.json"
  );
  const evidencePath = path.resolve(
    process.cwd(),
    ".agents/docs/archive/contracts/macaroni-v35-shadownet-costs.json"
  );
  try {
    const report = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      schema?: string;
      measuredAt?: string;
      contractArtifact?: string;
      contractArtifactSha256?: string;
      historicalRevealFeeEvidence?: { bakerFeeMutez?: number };
      observed?: { maximumObservedStorageBurnMutez?: number; maximumArmCostMutez?: number };
      recommendedFundingPolicy?: {
        minimumFulfillmentSubsidyMutez?: number;
        initialContractReserveClaims?: number;
        initialContractReserveMutez?: number;
        finalizerStartupMutez?: number;
      };
    };
    const artifactPath = path.resolve(process.cwd(), String(report.contractArtifact || ""));
    const artifactDigest = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
    const settlementStorageBurnMutez = Number(report.observed?.maximumObservedStorageBurnMutez);
    const historicalRevealFeeMutez = Number(report.historicalRevealFeeEvidence?.bakerFeeMutez);
    const fulfillmentSubsidyMutez = Number(report.recommendedFundingPolicy?.minimumFulfillmentSubsidyMutez);
    const initialContractReserveMutez = Number(report.recommendedFundingPolicy?.initialContractReserveMutez);
    const armFulfillmentCostMutez = Number(report.observed?.maximumArmCostMutez);
    const finalizerLiquidStartupFloorMutez = Number(report.recommendedFundingPolicy?.finalizerStartupMutez);
    const exact = report.schema === "wtfos.macaroni-v35-shadownet-costs.v1"
      && Boolean(report.measuredAt)
      && artifactDigest === report.contractArtifactSha256
      && report.recommendedFundingPolicy?.initialContractReserveClaims === 5
      && fulfillmentSubsidyMutez === settlementStorageBurnMutez + historicalRevealFeeMutez
      && initialContractReserveMutez === fulfillmentSubsidyMutez * 5
      && finalizerLiquidStartupFloorMutez === initialContractReserveMutez + armFulfillmentCostMutez;
    if (exact) {
      return {
        evidence: ".agents/docs/archive/contracts/macaroni-v35-shadownet-costs.json",
        version: String(report.measuredAt),
        settlementStorageBurnMutez,
        historicalRevealFeeMutez,
        fulfillmentSubsidyMutez,
        initialContractReserveMutez,
        armFulfillmentCostMutez,
        finalizerLiquidStartupFloorMutez,
      };
    }
  } catch {
    // A manifest-embedded policy may be used when its evidence tuple is exact.
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      templateVersion?: string;
      measuredFundingPolicy?: Record<string, unknown>;
    };
    const policy = manifest.measuredFundingPolicy || {};
    const numberFrom = (...keys: string[]) => {
      for (const key of keys) {
        const value = Number(policy[key]);
        if (Number.isSafeInteger(value) && value >= 0) return value;
      }
      return Number.NaN;
    };
    const settlementStorageBurnMutez = numberFrom(
      "maximumSettlementStorageBurnMutez",
      "settlementStorageBurnMutez"
    );
    const historicalRevealFeeMutez = numberFrom(
      "highestHistoricalAppliedRevealFeeMutez",
      "highestHistoricalRevealBakerFeeMutez",
      "historicalRevealFeeMutez"
    );
    const fulfillmentSubsidyMutez = numberFrom(
      "fulfillmentSubsidyMutez",
      "minimumFulfillmentSubsidyMutez"
    );
    const initialContractReserveMutez = numberFrom(
      "initialContractReserveMutez",
      "fiveSettlementStartupMutez"
    );
    const finalizerLiquidStartupFloorMutez = numberFrom(
      "finalizerLiquidStartupFloorMutez",
      "finalizerStartupFloorMutez"
    );
    const armFulfillmentCostMutez = numberFrom(
      "armFulfillmentCostMutez",
      "measuredArmFulfillmentCostMutez"
    );
    const evidence = String(policy.evidence || "").trim();
    const version = String(policy.version || policy.measuredAt || "").trim();
    const exact = evidence && version
      && settlementStorageBurnMutez > 0
      && historicalRevealFeeMutez > 0
      && fulfillmentSubsidyMutez === settlementStorageBurnMutez + historicalRevealFeeMutez
      && initialContractReserveMutez === fulfillmentSubsidyMutez * 5
      && armFulfillmentCostMutez > 0
      && finalizerLiquidStartupFloorMutez === initialContractReserveMutez + armFulfillmentCostMutez;
    if (!exact || manifest.templateVersion !== "macaroni-secure-claim-v3.5") return null;
    return {
      evidence,
      version,
      settlementStorageBurnMutez,
      historicalRevealFeeMutez,
      fulfillmentSubsidyMutez,
      initialContractReserveMutez,
      armFulfillmentCostMutez,
      finalizerLiquidStartupFloorMutez,
    };
  } catch {
    return null;
  }
}

export function managedMacaroniRuntimeReadiness(network?: "mainnet" | "shadownet") {
  const abiPath = path.resolve(
    process.cwd(),
    "public/creation-tools/macaroni/contract/macaroni-v35.contract.json"
  );
  const manifestPath = path.resolve(
    process.cwd(),
    "public/creation-tools/macaroni/contract/macaroni-v35.template.json"
  );
  let abiReady = false;
  if (existsSync(abiPath) && existsSync(manifestPath)) {
    try {
      const code = JSON.parse(readFileSync(abiPath, "utf8"));
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        templateVersion?: string;
        entrypoints?: string[];
      };
      const requiredEntrypoints = [
        "add_tokens_v35",
        "append_token_slots_v35",
        "finalize_setup",
        "fund_fulfillment_reserve",
        "arm_fulfillment",
        "activate_sale",
        "close_sale",
        "purchase",
        "settle_claims_v35",
      ];
      abiReady = Array.isArray(code)
        && manifest.templateVersion === "macaroni-secure-claim-v3.5"
        && requiredEntrypoints.every((entrypoint) => manifest.entrypoints?.includes(entrypoint));
    } catch {
      abiReady = false;
    }
  }
  const networkSignerReady = network
    ? signerConfigured(network)
    : signerConfigured("mainnet") || signerConfigured("shadownet");
  const trustedRpcReady = network
    ? trustedManagedRpcConfigured(network)
    : trustedManagedRpcConfigured("mainnet") || trustedManagedRpcConfigured("shadownet");
  const measuredFunding = measuredMacaroniV35FundingPolicy();
  const runtimeReady = Boolean(
    positiveEnvInteger("MACARONI_V35_WORKER_INTERVAL_MS")
    && positiveEnvInteger("MACARONI_V35_WORKER_LEASE_MS")
    // Tenderbake deterministic finality needs two blocks after inclusion. A
    // shallower setting could publish private CARs after a reorgable settle.
    && integerEnvAtLeast("MACARONI_V35_INDEX_MIN_CONFIRMATIONS", 2)
    && measuredFunding
    && configuredAssetKeyring()
    && configuredVersionedKeyring("ENTROPY")
    && configuredVersionedKeyring("RECOVERY")
    && process.env.S3_ENDPOINT
    && process.env.S3_BUCKET
    && process.env.S3_ACCESS_KEY_ID
    && process.env.S3_SECRET_ACCESS_KEY
    && managedMacaroniV35CarPublisherConfig()
    && process.env.MACARONI_V35_IPFS_GATEWAY
    && networkSignerReady
    && trustedRpcReady
  );
  const missing = [
    !abiReady && "reviewed_contract_abi",
    !runtimeReady && "managed_runtime_environment",
  ].filter(Boolean);
  return {
    ready: abiReady && runtimeReady,
    code: abiReady && runtimeReady ? "ready" as const : "fulfillment_pipeline_unavailable" as const,
    reason: abiReady && runtimeReady
      ? "Managed claim scanning, durable settlement signing, independent entropy recovery, and post-mint CAR publication are configured. Each drop still requires its live recovery, balance, duplicate, signer, and contract checks before activation."
      : `Managed fulfillment remains fail-closed until these checks are configured: ${missing.join(", ")}.`,
    checks: {
      deterministicCidCarStaging: {
        ready: true,
        profile: "wtfos.macaroni-unixfs-import.v1",
      },
      contractAbiAndHandler: {
        ready: abiReady,
        version: "macaroni-secure-claim-v3.5",
      },
      claimScannerAssetLookupCarPinAndSettlement: {
        ready: runtimeReady,
        code: runtimeReady ? "ready" : "fulfillment_pipeline_unavailable",
      },
    },
  };
}

export function buildMacaroniV35Capabilities(input: {
  authenticated: boolean;
  allowed: boolean;
  roles?: readonly string[];
  network?: "mainnet" | "shadownet";
}) {
  const runtime = managedMacaroniRuntimeReadiness(input.network);
  const fundingPolicy = measuredMacaroniV35FundingPolicy();
  return {
    schema: MACARONI_V35_CAPABILITY_SCHEMA,
    network: input.network ?? null,
    authenticated: input.authenticated,
    managed: {
      allowed: input.authenticated && input.allowed,
      requiredPermission: MACARONI_V35_MANAGED_PERMISSION,
      requiredRole: "Trusted Creator or another role explicitly granted Use Managed Macaroni",
      defaultEligibleRoles: ["Administrator", "Host", "Co-host", "Trusted Creator", "Cobwebsaints Full User"],
      assignedRoles: [...(input.roles ?? [])],
      reason: "Managed Macaroni stores unrevealed assets privately and uses wtfOS fulfillment infrastructure, so access is limited to reviewed creator accounts.",
      denial: input.authenticated && input.allowed
        ? null
        : {
            code: input.authenticated ? "managed_macaroni_permission_required" : "sign_in_required",
            adminInboxPath: "/admin-inbox",
            requestText: MACARONI_V35_ACCESS_REQUEST_TEXT,
            nextStep: input.authenticated
              ? "Open Admin Inbox, send the request text, and wait for a wtfOS administrator to grant the Managed Macaroni capability."
              : "Sign in, then open Admin Inbox and request Managed Macaroni access.",
          },
      service: runtime,
      fundingPolicy: fundingPolicy ? {
        ready: true,
        ...fundingPolicy,
        initialReserveClaims: 5,
        freeStageRule: "physical_supply_times_subsidy",
      } : {
        ready: false,
        reason: "The evidence-derived V3.5 funding report does not match the current contract artifact.",
      },
    },
    selfHostedAlternative: {
      available: true,
      name: "Macaroni Companion",
      accessRequired: false,
      keepsDropPageStatic: true,
      instructions: "Install the included companion on an always-on computer, provide your own Tezos operator and pinning credentials, and complete its doctor check.",
      packagePath: "companion/macaroni-v35",
    },
    assetStrategies: {
      pin_on_claim: {
        default: true,
        description: "Exact artifact and metadata CARs remain encrypted and private until the committed NFT is minted, then those same CARs are published to IPFS.",
        copymintWindow: "There is no earlier IPFS or static-page CID publication. The configured trusted RPC and Tezos mempool necessarily see the committed metadata URI and entropy preimage shortly before the settlement is included; a short post-mint IPFS availability gap is expected.",
      },
      public_prepin_private_manifest: {
        default: false,
        advanced: true,
        description: "Standards-compatible plaintext final artifact and metadata files are pinned publicly before sale; only the CID and nonce mapping stays private.",
        warning: "This is lower latency but weaker blindness: IPFS providers and anyone who discovers the public CIDs can inspect or copy-mint files before legitimate allocation.",
      },
    },
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}

export function hashMacaroniV35Payload(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function publicMacaroniV35DropStatus(drop: {
  network: "mainnet" | "shadownet";
  contract: string | null;
  provider: string;
  assetStrategy: string;
  fulfillmentTrigger: string;
  claimDelaySeconds: number;
  claimIntervalSeconds: number;
  fulfillmentScheduledAt: Date | null;
  status: string;
  serviceReady: boolean;
  publicStatus: unknown;
  contractReserveRequiredMutez: number;
  contractReserveObservedMutez: number;
  operatorGasObservedMutez: number;
  operatorGasReady: boolean;
  finalFulfillmentAt: Date | null;
  salePermanentlyClosedAt: Date | null;
  finalSweepOperationHash: string | null;
}) {
  const runtimeReadiness = managedMacaroniRuntimeReadiness(drop.network);
  const serviceReady = drop.serviceReady && runtimeReadiness.ready;
  const serviceBlocker = serviceReady
    ? null
    : runtimeReadiness.ready
      ? {
          ...runtimeReadiness,
          ready: false,
          code: "drop_fulfillment_not_ready" as const,
          reason: "This drop has not completed its live contract, recovery, signer, and funding readiness checks.",
        }
      : runtimeReadiness;
  return {
    schema: MACARONI_V35_PUBLIC_STATUS_SCHEMA,
    network: drop.network,
    contract: drop.contract,
    provider: drop.provider,
    assetStrategy: drop.assetStrategy,
    fulfillment: {
      trigger: drop.fulfillmentTrigger,
      claimDelaySeconds: drop.claimDelaySeconds,
      claimIntervalSeconds: drop.claimIntervalSeconds,
      scheduledAt: drop.fulfillmentScheduledAt?.toISOString() ?? null,
      finalFulfillmentAt: drop.finalFulfillmentAt?.toISOString() ?? null,
      salePermanentlyClosedAt: drop.salePermanentlyClosedAt?.toISOString() ?? null,
    },
    status: drop.status,
    // Persisted readiness records the drop-level activation checks, while the
    // live runtime check prevents a stale `true` value from accepting a paid
    // purchase after this network's worker, signer, or private storage has
    // become unavailable.
    serviceReady,
    serviceBlocker,
    progress: drop.publicStatus,
    funding: {
      reserveOwner: "drop_contract",
      contractReserveRequiredMutez: drop.contractReserveRequiredMutez,
      contractReserveObservedMutez: drop.contractReserveObservedMutez,
      reserveFunded: drop.contractReserveRequiredMutez > 0
        && drop.contractReserveObservedMutez >= drop.contractReserveRequiredMutez,
      saleSubsidyDestination: "drop_contract",
      finalizerReimbursement: "after_success",
      finalSweep: "automatic_after_final_fulfillment_when_sold_out_or_permanently_closed",
      finalSweepOperationHash: drop.finalSweepOperationHash,
      operatorGasObservedMutez: drop.operatorGasObservedMutez,
      operatorGasReady: drop.operatorGasReady,
    },
  };
}
