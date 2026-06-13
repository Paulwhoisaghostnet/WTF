import type {
  MediaPinItem,
  MediaPinManifest,
  MediaPinPolicy,
} from "@shared/atproto";
import { HOSTED_PORCUPIN_PROVIDER_KEY } from "./constants";

type PinScope = {
  scopeType: string;
  scopeRef: string;
  walletAddress?: string | null;
  sourceChain?: string | null;
};

export type PinStorageRef = {
  s3Bucket?: string;
  s3Key?: string;
  s3Region?: string;
  s3Endpoint?: string;
  porcupinProviderKey?: string;
  providerPinId?: string;
  manifestKey?: string;
  byteSize?: number;
  mimeType?: string;
  checksumSha256?: string;
};

export type PinSubdomainRef = {
  kind: "wtfos.me" | "wtf.tez";
  host: string;
  grantId?: number;
};

const FORBIDDEN_STORAGE_KEYS = /credential|secret|token|signed|private|password|session|vault|authorization|cookie/i;

function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
  ) as T;
}

export function assertPublicPinStorageRef(storageRef: PinStorageRef): PinStorageRef {
  for (const key of Object.keys(storageRef)) {
    if (FORBIDDEN_STORAGE_KEYS.test(key)) {
      throw new Error(`storageRef cannot contain private coordinate: ${key}`);
    }
  }
  const values = Object.values(storageRef);
  if (
    values.some((value) =>
      typeof value === "string" &&
      (/X-Amz-Signature=|pinata.*jwt|bearer\s+/i.test(value) || value.startsWith("file://"))
    )
  ) {
    throw new Error("storageRef cannot contain credentials, signed URLs, or private file paths");
  }
  return compact(storageRef);
}

export function buildPinPolicyRecord(input: PinScope & {
  includeExisting: boolean;
  includeFuture: boolean;
  publicDiscovery: boolean;
  provider?: string | null;
  exclusions?: unknown;
  subdomainRefs?: PinSubdomainRef[];
  sourceEventId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Omit<MediaPinPolicy, "$type"> {
  const now = new Date().toISOString();
  const createdAt = input.createdAt
    ? new Date(input.createdAt).toISOString()
    : now;
  const updatedAt = input.updatedAt
    ? new Date(input.updatedAt).toISOString()
    : now;
  return compact({
    schemaVersion: 1,
    scopeType: input.scopeType,
    scopeRef: input.scopeRef,
    walletAddress: input.walletAddress ?? undefined,
    sourceChain: input.sourceChain ?? "tezos",
    includeExisting: input.includeExisting,
    includeFuture: input.includeFuture,
    provider: input.provider ?? HOSTED_PORCUPIN_PROVIDER_KEY,
    publicDiscovery: input.publicDiscovery,
    exclusions: input.exclusions,
    subdomainRefs: input.subdomainRefs,
    sourceEventId: input.sourceEventId ?? undefined,
    createdAt,
    updatedAt,
  });
}

export function buildPinManifestRecord(input: PinScope & {
  itemCount: number;
  totalBytes: number;
  provider?: string | null;
  storageRef: PinStorageRef;
  subdomainRefs?: PinSubdomainRef[];
  sourceEventId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Omit<MediaPinManifest, "$type"> {
  const now = new Date().toISOString();
  return compact({
    schemaVersion: 1,
    scopeType: input.scopeType,
    scopeRef: input.scopeRef,
    walletAddress: input.walletAddress ?? undefined,
    sourceChain: input.sourceChain ?? "tezos",
    itemCount: Math.max(0, Math.floor(input.itemCount)),
    totalBytes: Math.max(0, Math.floor(input.totalBytes)),
    provider: input.provider ?? HOSTED_PORCUPIN_PROVIDER_KEY,
    storageRef: assertPublicPinStorageRef(input.storageRef),
    subdomainRefs: input.subdomainRefs,
    sourceEventId: input.sourceEventId ?? undefined,
    createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : now,
    updatedAt: input.updatedAt ? new Date(input.updatedAt).toISOString() : now,
  });
}

export function buildPinItemRecord(input: PinScope & {
  cid: string;
  provider?: string | null;
  storageRef: PinStorageRef;
  subdomainRefs?: PinSubdomainRef[];
  sourceEventId?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  checksumSha256?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Omit<MediaPinItem, "$type"> {
  const now = new Date().toISOString();
  return compact({
    schemaVersion: 1,
    scopeType: input.scopeType,
    scopeRef: input.scopeRef,
    walletAddress: input.walletAddress ?? undefined,
    sourceChain: input.sourceChain ?? "tezos",
    cid: input.cid,
    provider: input.provider ?? HOSTED_PORCUPIN_PROVIDER_KEY,
    storageRef: assertPublicPinStorageRef(input.storageRef),
    subdomainRefs: input.subdomainRefs,
    sourceEventId: input.sourceEventId ?? undefined,
    mimeType: input.mimeType ?? undefined,
    byteSize: input.byteSize ?? undefined,
    checksumSha256: input.checksumSha256 ?? undefined,
    createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : now,
    updatedAt: input.updatedAt ? new Date(input.updatedAt).toISOString() : now,
  });
}
