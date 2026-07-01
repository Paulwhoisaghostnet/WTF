import { createHash, randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  inAppInventoryItems,
  ipfsPinningJobs,
  ipfsPinningManifests,
  ipfsPinningPolicies,
  ipfsPinningProviderStatus,
  ipfsPinningSubdomainBindings,
  users,
  userWallets,
  wtfosAtprotoOutbox,
  wtfSubdomainGrants,
  wtfUserSites,
} from "@shared/schema";
import { db } from "../../db";
import { isSpineEnabled } from "../atproto-spine/config";
import { resolveSpineIdentity } from "../atproto-spine/identity-resolve";
import {
  echoRecordToMaster,
  enqueueSpineRecord,
} from "../atproto-spine/service";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { logSystemEvent } from "../../lib/system-log";
import { getTzktBase } from "../../lib/contract-config";
import {
  getObjectStorageConfig,
  putObjectBuffer,
  verifyObjectStorageAccess,
} from "../../lib/storage/object-storage";
import {
  latestObjectStorageUsageStatus,
  shouldProtectObjectUploads,
} from "../../lib/storage/object-storage-usage";
import { getEffectivePermissionsForRoles } from "../../lib/permissions";
import { ensureUserRole, listRolesForUserSnapshot } from "../../lib/user-roles";
import {
  HOSTED_PORCUPIN_PROVIDER_KEY,
  IPFS_PINNING_SOURCE,
  LEGACY_AUTOPIN_SKU,
  PIN_COLLECTOR_PERMISSION,
  PIN_COLLECTOR_ROLE,
  PIN_COLLECTOR_SKU,
  PINNING_EVENTS,
} from "./constants";
import {
  buildPinItemRecord,
  buildPinManifestRecord,
  buildPinPolicyRecord,
  type PinStorageRef,
  type PinSubdomainRef,
} from "./records";
import { isWellKnownPinDiscoveryReady } from "./well-known-policy";

type ScopeType = (typeof ipfsPinningPolicies.$inferInsert)["scopeType"];
type UserLike = typeof users.$inferSelect | { id: number; role?: string | null; roles?: string[] | null };

const BROAD_SCOPE_TYPES = new Set<string>(["wallet_full", "wallet_collection"]);
const PINNING_S3_PREFIX = "ipfs-pinning/users";
const DEFAULT_WALLET_SCAN_LIMIT = 250;
const DEFAULT_USER_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
const CID_RE = /\b(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9a-z]{20,}|bafy[0-9a-z]{20,}|baga[0-9a-z]{20,})\b/i;

export class IpfsPinningError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "IpfsPinningError";
  }
}

function missingRelation(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return (
    candidate?.code === "42P01" ||
    candidate?.cause?.code === "42P01" ||
    String((err as { message?: string })?.message || "").includes("does not exist")
  );
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function userQuotaBytes(): number {
  return envInt("IPFS_PINNING_USER_QUOTA_BYTES", DEFAULT_USER_QUOTA_BYTES);
}

function walletScanLimit(): number {
  return Math.min(envInt("IPFS_PINNING_WALLET_SCAN_LIMIT", DEFAULT_WALLET_SCAN_LIMIT), 1000);
}

function normalizeScopeRef(input: {
  scopeType: ScopeType;
  scopeRef?: string | null;
  walletAddress?: string | null;
}): string {
  const explicit = String(input.scopeRef || "").trim();
  if (explicit) return explicit.slice(0, 500);
  if (input.walletAddress) return input.walletAddress.trim();
  return input.scopeType;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeFileName(name: string | null | undefined): string {
  return String(name || "pin-upload")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "pin-upload";
}

export function objectKeyForPin(input: {
  userId: number;
  checksumSha256: string;
  fileName?: string | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${PINNING_S3_PREFIX}/${input.userId}/${yyyy}/${mm}/${input.checksumSha256.slice(0, 16)}-${safeFileName(input.fileName)}`;
}

function pinataJwt(): string {
  return (
    process.env.WTFGAMESHOW_IPFS_JWT ||
    process.env.WTF_GAMESHOW_IPFS_JWT ||
    process.env.WTFGAMESHOW_PINATA_JWT ||
    process.env.PINATA_JWT ||
    process.env.PINATA_API_JWT ||
    ""
  ).trim();
}

function hostedPorcupinBase(): string {
  return (process.env.WTFOS_PORCUPIN_API_URL || "").trim().replace(/\/+$/, "");
}

function hostedPorcupinToken(): string {
  return (process.env.WTFOS_PORCUPIN_API_TOKEN || "").trim();
}

function hostedPorcupinCidEndpoint(): string {
  return (
    process.env.WTFOS_PORCUPIN_PIN_CID_ENDPOINT ||
    (hostedPorcupinBase() ? `${hostedPorcupinBase()}/api/pins` : "")
  ).trim();
}

function hostedPorcupinFileEndpoint(): string {
  return (process.env.WTFOS_PORCUPIN_PIN_FILE_ENDPOINT || "").trim();
}

async function pinBufferWithProvider(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<{ cid: string; providerKey: string; providerPinId?: string | null; raw?: unknown }> {
  const fileEndpoint = hostedPorcupinFileEndpoint();
  if (fileEndpoint) {
    const bytes = new Uint8Array(input.buffer.byteLength);
    bytes.set(input.buffer);
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: input.mimeType || "application/octet-stream" }),
      input.fileName || "pin-upload"
    );
    const headers: Record<string, string> = {};
    const token = hostedPorcupinToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const upstream = await fetch(fileEndpoint, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await upstream.text();
    if (!upstream.ok) throw new Error(`Hosted Porcupin file pin failed ${upstream.status}: ${text.slice(0, 1000)}`);
    const json = JSON.parse(text) as Record<string, unknown>;
    const cid = String(json.cid || json.IpfsHash || json.hash || "");
    if (!cid) throw new Error("Hosted Porcupin file pin returned no CID");
    return {
      cid,
      providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      providerPinId: typeof json.id === "string" ? json.id : null,
      raw: json,
    };
  }

  const jwt = pinataJwt();
  if (!jwt) {
    throw new IpfsPinningError(
      503,
      "Hosted Porcupin file endpoint or Pinata JWT is required for upload pinning",
      "provider_not_configured"
    );
  }
  const bytes = new Uint8Array(input.buffer.byteLength);
  bytes.set(input.buffer);
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: input.mimeType || "application/octet-stream" }),
    input.fileName || "pin-upload"
  );
  const upstream = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    throw new IpfsPinningError(502, `Macaroni IPFS pinning failed: ${text.slice(0, 1000)}`, "provider_failed");
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  const cid = String(json.IpfsHash || json.cid || "");
  if (!cid) throw new Error("IPFS pinning returned no CID");
  return { cid, providerKey: "pinata", providerPinId: String(json.id || ""), raw: json };
}

async function pinCidWithHostedPorcupin(input: {
  cid: string;
  userId: number;
  jobId: number;
}): Promise<{ pinned: boolean; providerPinId?: string | null; reason?: string }> {
  const endpoint = hostedPorcupinCidEndpoint();
  if (!endpoint) return { pinned: false, reason: "hosted_porcupin_not_configured" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = hostedPorcupinToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      cid: input.cid,
      providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      userId: input.userId,
      jobId: input.jobId,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    return { pinned: false, reason: `hosted_porcupin_failed_${res.status}:${text.slice(0, 300)}` };
  }
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    json = {};
  }
  return {
    pinned: true,
    providerPinId: typeof json.id === "string" ? json.id : null,
  };
}

function extractIpfsCid(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("ipfs://")) {
    const path = raw.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
    const cid = path.split(/[/?#]/)[0];
    return CID_RE.test(cid) ? cid : null;
  }
  const match = raw.match(CID_RE);
  return match?.[1] ?? null;
}

function metadataStrings(metadata: unknown): string[] {
  const out: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) visit(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (/password|secret|token|credential|session/i.test(key)) continue;
        visit(child, depth + 1);
      }
    }
  };
  visit(metadata, 0);
  return out;
}

async function discoverWalletPinItems(walletAddress: string) {
  const limit = walletScanLimit();
  const url = `${getTzktBase()}/tokens/balances?account=${encodeURIComponent(walletAddress)}&balance.ne=0&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`TzKT wallet scan failed ${res.status}`);
  const rows = await res.json() as Array<Record<string, unknown>>;
  const byCid = new Map<string, {
    cid: string;
    sourceUri: string;
    scopeRef: string;
    mimeType?: string;
    metadata: Record<string, unknown>;
  }>();
  for (const row of rows) {
    const token = (row.token && typeof row.token === "object" ? row.token : {}) as Record<string, unknown>;
    const metadata = (token.metadata && typeof token.metadata === "object" ? token.metadata : {}) as Record<string, unknown>;
    const contract =
      typeof (token.contract as Record<string, unknown> | undefined)?.address === "string"
        ? String((token.contract as Record<string, unknown>).address)
        : "unknown";
    const tokenId = String(token.tokenId ?? token.id ?? "");
    const scopeRef = `${contract}:${tokenId}`;
    for (const uri of metadataStrings(metadata)) {
      const cid = extractIpfsCid(uri);
      if (!cid || byCid.has(cid)) continue;
      byCid.set(cid, {
        cid,
        sourceUri: uri,
        scopeRef,
        mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : undefined,
        metadata: {
          tokenContract: contract,
          tokenId,
          tokenName: metadata.name ?? tokenId,
          sourceUri: uri,
        },
      });
    }
  }
  return [...byCid.values()];
}

async function emitPinningEvent(input: {
  eventType: string;
  userId: number;
  walletAddress?: string | null;
  metadata?: Record<string, unknown>;
  rawRefType?: string | null;
  rawRefId?: string | number | null;
}) {
  const eventId = `${input.eventType}:${input.userId}:${input.rawRefType ?? "event"}:${input.rawRefId ?? randomUUID()}`;
  try {
    const result = await ingestSystemEvent({
      eventId,
      eventType: input.eventType,
      userId: input.userId,
      walletAddress: input.walletAddress ?? null,
      source: "wtfos",
      sourceModule: IPFS_PINNING_SOURCE,
      metadata: input.metadata ?? {},
      rawRefType: input.rawRefType ?? null,
      rawRefId: input.rawRefId ?? null,
    });
    logSystemEvent({
      source: IPFS_PINNING_SOURCE,
      eventType: input.eventType,
      severity: "info",
      userId: input.userId,
      metadata: { eventId, ...(input.metadata ?? {}) },
    });
    return result.event.eventId;
  } catch (err) {
    if (missingRelation(err)) return eventId;
    throw err;
  }
}

async function fetchUser(userId: number): Promise<typeof users.$inferSelect> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new IpfsPinningError(404, "User not found");
  return user;
}

export async function syncPinCollectorRoleFromInventory(userId: number): Promise<boolean> {
  try {
    const rows = await db
      .select({ sku: inAppInventoryItems.sku, quantity: inAppInventoryItems.quantity })
      .from(inAppInventoryItems)
      .where(and(eq(inAppInventoryItems.userId, userId), inArray(inAppInventoryItems.sku, [
        PIN_COLLECTOR_SKU,
        LEGACY_AUTOPIN_SKU,
      ])));
    const ownsPass = rows.some((row) => Number(row.quantity) > 0);
    if (ownsPass) await ensureUserRole(userId, PIN_COLLECTOR_ROLE);
    return ownsPass;
  } catch (err) {
    if (missingRelation(err)) return false;
    throw err;
  }
}

export async function getPinningEntitlement(user: UserLike) {
  await syncPinCollectorRoleFromInventory(user.id);
  const freshUser = "username" in user ? user : await fetchUser(user.id);
  const roles = await listRolesForUserSnapshot(freshUser);
  const permissions = await getEffectivePermissionsForRoles(roles);
  return {
    roles,
    canUsePinning: Boolean(permissions[PIN_COLLECTOR_PERMISSION]),
    hasPinCollectorRole: roles.includes(PIN_COLLECTOR_ROLE),
    permissionKey: PIN_COLLECTOR_PERMISSION,
    marketSku: PIN_COLLECTOR_SKU,
    legacyAliasSku: LEGACY_AUTOPIN_SKU,
  };
}

async function listSubdomainRefs(userId: number, host?: string | null): Promise<PinSubdomainRef[]> {
  const refs: PinSubdomainRef[] = [];
  if (host) refs.push({ kind: "wtfos.me", host });
  try {
    const grants = await db
      .select({
        id: wtfSubdomainGrants.id,
        fullName: wtfSubdomainGrants.fullName,
        status: wtfSubdomainGrants.status,
      })
      .from(wtfSubdomainGrants)
      .where(and(eq(wtfSubdomainGrants.userId, userId), inArray(wtfSubdomainGrants.status, [
        "reserved",
        "pending",
        "provisioned",
      ])));
    for (const grant of grants) {
      refs.push({ kind: "wtf.tez", host: grant.fullName, grantId: grant.id });
    }
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
  return refs;
}

async function resolvePinHome(userId: number) {
  const [identity, site] = await Promise.all([
    resolveSpineIdentity(userId),
    db
      .select()
      .from(wtfUserSites)
      .where(eq(wtfUserSites.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch((err) => {
        if (missingRelation(err)) return null;
        throw err;
      }),
  ]);
  const host = site?.host ?? null;
  const siteSuspended = site?.status === "suspended";
  const ready = Boolean(identity?.hasRepo && identity.repoDid && host && !siteSuspended);
  const subdomainRefs = await listSubdomainRefs(userId, host);
  return {
    identity,
    site,
    host,
    subdomainRefs,
    ready,
    status: siteSuspended ? "suspended" : ready ? "active" : "pending_identity",
    wellKnownUrl: host ? `https://${host}/.well-known/wtfos-pins` : null,
  };
}

async function upsertSubdomainBinding(input: {
  userId: number;
  manifestId?: number | null;
  manifestUri?: string | null;
  manifestCid?: string | null;
  publicDiscoveryEnabled: boolean;
}) {
  const home = await resolvePinHome(input.userId);
  const now = new Date();
  const status = home.status as typeof ipfsPinningSubdomainBindings.$inferInsert.status;
  const values = {
    userId: input.userId,
    userSiteId: home.site?.id ?? null,
    wtfosIdentityId: home.identity?.identityId ?? null,
    atprotoHandleClaimId: home.site?.atprotoHandleClaimId ?? null,
    manifestId: input.manifestId ?? null,
    host: home.host,
    repoDid: home.identity?.repoDid ?? null,
    repoHandle: home.identity?.handle ?? null,
    pdsUrl: home.identity?.pdsUrl ?? null,
    pinManifestRecordUri: input.manifestUri ?? null,
    pinManifestRecordCid: input.manifestCid ?? null,
    publicDiscoveryEnabled: input.publicDiscoveryEnabled,
    status,
    lastPublishedAt: input.manifestUri ? now : null,
    updatedAt: now,
  };
  const [binding] = await db
    .insert(ipfsPinningSubdomainBindings)
    .values(values)
    .onConflictDoUpdate({
      target: ipfsPinningSubdomainBindings.userId,
      set: values,
    })
    .returning();
  await emitPinningEvent({
    eventType: PINNING_EVENTS.subdomainRegistryLinked,
    userId: input.userId,
    metadata: {
      host: home.host,
      repoDid: home.identity?.repoDid ?? null,
      manifestUri: input.manifestUri ?? null,
      status,
    },
    rawRefType: "ipfs_pinning_binding",
    rawRefId: binding?.id,
  });
  return { binding, home };
}

function outboxAtUri(row: typeof wtfosAtprotoOutbox.$inferSelect | null | undefined): string | null {
  if (!row?.targetDid || !row.collection || !row.rkey) return null;
  return `at://${row.targetDid}/${row.collection}/${row.rkey}`;
}

async function enqueuePolicyRecord(input: {
  userId: number;
  policy: typeof ipfsPinningPolicies.$inferSelect;
  home: Awaited<ReturnType<typeof resolvePinHome>>;
}) {
  const outbox = await enqueueSpineRecord({
    userId: input.userId,
    type: "app.wtfos.media.pinPolicy",
    record: buildPinPolicyRecord({
      scopeType: input.policy.scopeType,
      scopeRef: normalizeScopeRef(input.policy),
      walletAddress: input.policy.walletAddress,
      sourceChain: input.policy.sourceChain,
      includeExisting: input.policy.includeExisting,
      includeFuture: input.policy.includeFuture,
      provider: input.policy.providerKey,
      publicDiscovery: input.policy.publicDiscovery,
      exclusions: input.policy.exclusions,
      subdomainRefs: input.home.subdomainRefs,
      sourceEventId: input.policy.sourceEventId,
      createdAt: input.policy.createdAt,
      updatedAt: input.policy.updatedAt,
    }) as unknown as Record<string, unknown>,
    rkeyParts: ["pin-policy", input.policy.id],
    targetDid: input.home.identity?.repoDid ?? null,
    targetHandle: input.home.identity?.handle ?? null,
    targetPdsUrl: input.home.identity?.pdsUrl ?? null,
    wtfosIdentityId: input.home.identity?.identityId ?? null,
    sourceEventType: PINNING_EVENTS.policySaved,
    sourceRefType: "ipfs_pinning_policy",
    sourceRefId: String(input.policy.id),
  });
  const uri = outboxAtUri(outbox);
  await db
    .update(ipfsPinningPolicies)
    .set({ pdsPolicyRecordUri: uri, updatedAt: new Date() })
    .where(eq(ipfsPinningPolicies.id, input.policy.id));
  await emitPinningEvent({
    eventType: PINNING_EVENTS.pdsRecordQueued,
    userId: input.userId,
    metadata: { type: "app.wtfos.media.pinPolicy", uri, outboxStatus: outbox?.status ?? null },
    rawRefType: "ipfs_pinning_policy",
    rawRefId: input.policy.id,
  });
  if (uri && input.home.identity?.repoDid && outbox?.rkey) {
    await echoRecordToMaster({
      userId: input.userId,
      fact: {
        factRepo: input.home.identity.repoDid,
        factCollection: "app.wtfos.media.pinPolicy",
        factRkey: outbox.rkey,
        factType: "app.wtfos.media.pinPolicy",
        refKind: "pin-policy",
        subdomain: "ipfs-pinning",
        summary: {
          scopeType: input.policy.scopeType,
          scopeRef: input.policy.scopeRef,
          host: input.home.host,
        },
      },
      sourceRefType: "ipfs_pinning_policy",
      sourceRefId: String(input.policy.id),
    });
  }
}

async function enqueueItemRecord(input: {
  job: typeof ipfsPinningJobs.$inferSelect;
  home: Awaited<ReturnType<typeof resolvePinHome>>;
}) {
  if (!input.job.cid) return null;
  const storageRef: PinStorageRef = {
    s3Bucket: input.job.s3Bucket ?? undefined,
    s3Key: input.job.s3Key ?? undefined,
    s3Region: input.job.s3Region ?? undefined,
    s3Endpoint: input.job.s3Endpoint ?? undefined,
    porcupinProviderKey: input.job.providerKey,
    providerPinId: input.job.providerPinId ?? undefined,
    manifestKey: input.job.manifestKey ?? undefined,
    byteSize: Number(input.job.byteSize || 0) || undefined,
    mimeType: input.job.mimeType ?? undefined,
    checksumSha256: input.job.checksumSha256 ?? undefined,
  };
  const outbox = await enqueueSpineRecord({
    userId: input.job.userId,
    type: "app.wtfos.media.pinItem",
    record: buildPinItemRecord({
      scopeType: input.job.scopeType,
      scopeRef: normalizeScopeRef(input.job),
      walletAddress: (input.job.metadata as Record<string, unknown> | null)?.walletAddress as string | undefined,
      sourceChain: "tezos",
      cid: input.job.cid,
      provider: input.job.providerKey,
      storageRef,
      subdomainRefs: input.home.subdomainRefs,
      sourceEventId: input.job.sourceEventId,
      mimeType: input.job.mimeType,
      byteSize: Number(input.job.byteSize || 0),
      checksumSha256: input.job.checksumSha256,
      createdAt: input.job.createdAt,
      updatedAt: input.job.updatedAt,
    }) as unknown as Record<string, unknown>,
    rkeyParts: ["pin-item", input.job.id],
    targetDid: input.home.identity?.repoDid ?? null,
    targetHandle: input.home.identity?.handle ?? null,
    targetPdsUrl: input.home.identity?.pdsUrl ?? null,
    wtfosIdentityId: input.home.identity?.identityId ?? null,
    sourceEventType: PINNING_EVENTS.pdsRecordQueued,
    sourceRefType: "ipfs_pinning_job",
    sourceRefId: String(input.job.id),
  });
  const uri = outboxAtUri(outbox);
  await db.update(ipfsPinningJobs)
    .set({ pdsItemRecordUri: uri, updatedAt: new Date() })
    .where(eq(ipfsPinningJobs.id, input.job.id));
  await emitPinningEvent({
    eventType: PINNING_EVENTS.pdsRecordQueued,
    userId: input.job.userId,
    metadata: { type: "app.wtfos.media.pinItem", uri, cid: input.job.cid, outboxStatus: outbox?.status ?? null },
    rawRefType: "ipfs_pinning_job",
    rawRefId: input.job.id,
  });
  return { outbox, uri };
}

async function enqueueManifestRecord(input: {
  manifest: typeof ipfsPinningManifests.$inferSelect;
  home: Awaited<ReturnType<typeof resolvePinHome>>;
  storageRef: PinStorageRef;
}) {
  const outbox = await enqueueSpineRecord({
    userId: input.manifest.userId,
    type: "app.wtfos.media.pinManifest",
    record: buildPinManifestRecord({
      scopeType: input.manifest.scopeType,
      scopeRef: normalizeScopeRef(input.manifest),
      walletAddress: input.manifest.walletAddress,
      sourceChain: input.manifest.sourceChain,
      itemCount: input.manifest.itemCount,
      totalBytes: Number(input.manifest.byteSize || 0),
      provider: input.manifest.providerKey,
      storageRef: input.storageRef,
      subdomainRefs: input.home.subdomainRefs,
      sourceEventId: input.manifest.sourceEventId,
      createdAt: input.manifest.createdAt,
      updatedAt: input.manifest.updatedAt,
    }) as unknown as Record<string, unknown>,
    rkeyParts: ["pin-manifest", input.manifest.id],
    targetDid: input.home.identity?.repoDid ?? null,
    targetHandle: input.home.identity?.handle ?? null,
    targetPdsUrl: input.home.identity?.pdsUrl ?? null,
    wtfosIdentityId: input.home.identity?.identityId ?? null,
    sourceEventType: PINNING_EVENTS.pdsRecordQueued,
    sourceRefType: "ipfs_pinning_manifest",
    sourceRefId: String(input.manifest.id),
  });
  const uri = outboxAtUri(outbox);
  const pdsStatus = outbox?.status === "queued" ? "queued" : outbox?.status === "skipped" ? "skipped" : "pending_identity";
  await db.update(ipfsPinningManifests)
    .set({ pdsManifestRecordUri: uri, pdsStatus, updatedAt: new Date() })
    .where(eq(ipfsPinningManifests.id, input.manifest.id));
  await emitPinningEvent({
    eventType: PINNING_EVENTS.pdsRecordQueued,
    userId: input.manifest.userId,
    metadata: { type: "app.wtfos.media.pinManifest", uri, outboxStatus: outbox?.status ?? null },
    rawRefType: "ipfs_pinning_manifest",
    rawRefId: input.manifest.id,
  });
  if (uri && input.home.identity?.repoDid && outbox?.rkey) {
    await echoRecordToMaster({
      userId: input.manifest.userId,
      fact: {
        factRepo: input.home.identity.repoDid,
        factCollection: "app.wtfos.media.pinManifest",
        factRkey: outbox.rkey,
        factType: "app.wtfos.media.pinManifest",
        refKind: "pin-manifest",
        subdomain: "ipfs-pinning",
        summary: {
          scopeType: input.manifest.scopeType,
          scopeRef: input.manifest.scopeRef,
          itemCount: input.manifest.itemCount,
          host: input.home.host,
        },
      },
      sourceRefType: "ipfs_pinning_manifest",
      sourceRefId: String(input.manifest.id),
    });
  }
  return { outbox, uri };
}

async function writeManifestBundle(input: {
  userId: number;
  manifestId: number;
  payload: Record<string, unknown>;
}) {
  const config = getObjectStorageConfig();
  if (!config) return { storageRef: { porcupinProviderKey: HOSTED_PORCUPIN_PROVIDER_KEY } as PinStorageRef };
  const key = `${PINNING_S3_PREFIX}/${input.userId}/manifests/${input.manifestId}.json`;
  const result = await putObjectBuffer({
    key,
    body: JSON.stringify(input.payload, null, 2),
    contentType: "application/json",
    metadata: {
      source: "wtfos-ipfs-pinning",
      manifestId: String(input.manifestId),
    },
  });
  await db.update(ipfsPinningManifests)
    .set({
      manifestBucket: result.bucket,
      manifestKey: result.key,
      updatedAt: new Date(),
    })
    .where(eq(ipfsPinningManifests.id, input.manifestId));
  return {
    storageRef: {
      s3Bucket: result.bucket,
      s3Key: result.key,
      s3Endpoint: result.endpoint,
      s3Region: result.region,
      porcupinProviderKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      manifestKey: result.key,
      byteSize: Buffer.byteLength(JSON.stringify(input.payload)),
      mimeType: "application/json",
    } satisfies PinStorageRef,
  };
}

export async function getIpfsPinningOverview(user: UserLike) {
  const entitlement = await getPinningEntitlement(user);
  const home = await resolvePinHome(user.id);
  const [policies, manifests, jobs, providerRows, storageUsage] = await Promise.all([
    db.select().from(ipfsPinningPolicies).where(eq(ipfsPinningPolicies.userId, user.id)).orderBy(desc(ipfsPinningPolicies.updatedAt)).limit(20).catch((err) => {
      if (missingRelation(err)) return [];
      throw err;
    }),
    db.select().from(ipfsPinningManifests).where(eq(ipfsPinningManifests.userId, user.id)).orderBy(desc(ipfsPinningManifests.createdAt)).limit(10).catch((err) => {
      if (missingRelation(err)) return [];
      throw err;
    }),
    db.select().from(ipfsPinningJobs).where(eq(ipfsPinningJobs.userId, user.id)).orderBy(desc(ipfsPinningJobs.createdAt)).limit(50).catch((err) => {
      if (missingRelation(err)) return [];
      throw err;
    }),
    db.select().from(ipfsPinningProviderStatus).limit(10).catch((err) => {
      if (missingRelation(err)) return [];
      throw err;
    }),
    latestObjectStorageUsageStatus().catch((err) => {
      if (missingRelation(err)) return null;
      throw err;
    }),
  ]);
  const providerRow = providerRows.find((row) => row.providerKey === HOSTED_PORCUPIN_PROVIDER_KEY) ?? null;
  const s3Access = await verifyObjectStorageAccess().catch((err) => ({
    ok: false,
    bucket: getObjectStorageConfig()?.bucket ?? null,
    endpoint: getObjectStorageConfig()?.endpoint ?? null,
    error: err instanceof Error ? err.message : String(err),
  }));
  const usedBytes = jobs.reduce((sum, job) => sum + Number(job.byteSize || 0), 0);
  const quotaBytes = userQuotaBytes();
  return {
    organ: "ipfs-pinning",
    role: entitlement,
    prerequisites: {
      hasActivePdsRepo: Boolean(home.identity?.hasRepo && home.identity?.repoDid),
      hasWtfosSite: Boolean(home.host),
      siteSuspended: home.site?.status === "suspended",
      spineEnabled: isSpineEnabled(),
    },
    pds: home.identity,
    site: home.site
      ? {
          id: home.site.id,
          host: home.site.host,
          status: home.site.status,
          activeDid: home.site.activeDid,
          wtfosIdentityId: home.site.wtfosIdentityId,
          atprotoHandleClaimId: home.site.atprotoHandleClaimId,
          wellKnownUrl: home.wellKnownUrl,
        }
      : null,
    subdomainRefs: home.subdomainRefs,
    provider: {
      key: HOSTED_PORCUPIN_PROVIDER_KEY,
      kind: "wtfos_porcupin_hetzner",
      health: providerRow?.health ?? "unknown",
      enabled: providerRow?.enabled ?? true,
      storageRoot: providerRow?.storageRoot ?? "/mnt/wtf-data/workers/porcupin",
      hostedApiConfigured: Boolean(hostedPorcupinBase() || hostedPorcupinCidEndpoint()),
      pinataFallbackConfigured: Boolean(pinataJwt()),
      lastCheckAt: iso(providerRow?.lastCheckAt),
      lastError: providerRow?.lastError ?? null,
    },
    storage: {
      objectStorage: storageUsage,
      s3Access,
      storageBoxMirror: {
        configured: Boolean(process.env.WTFOS_STORAGE_BOX_MANIFEST_MIRROR),
        scope: "critical manifest/proof bundles only",
      },
    },
    quota: {
      usedBytes,
      quotaBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes),
      jobs: jobs.length,
      pinnedJobs: jobs.filter((job) => job.status === "pinned").length,
    },
    policies,
    manifests,
    jobs,
  };
}

export async function savePinPolicy(user: UserLike, input: {
  scopeType: ScopeType;
  scopeRef?: string | null;
  walletAddress?: string | null;
  sourceChain?: string | null;
  includeExisting?: boolean;
  includeFuture?: boolean;
  publicDiscovery?: boolean;
  exclusions?: Record<string, unknown>;
}) {
  const entitlement = await getPinningEntitlement(user);
  if (!entitlement.canUsePinning) {
    throw new IpfsPinningError(403, "WTF Pin Collector role is required for hosted IPFS pinning", "pin_collector_required");
  }
  const home = await resolvePinHome(user.id);
  if (BROAD_SCOPE_TYPES.has(String(input.scopeType)) && !home.ready) {
    throw new IpfsPinningError(409, "Set up an active wtfos.me PDS/repo before enabling broad wallet backup", "pds_required");
  }
  const now = new Date();
  const scopeRef = normalizeScopeRef({
    scopeType: input.scopeType,
    scopeRef: input.scopeRef,
    walletAddress: input.walletAddress,
  });
  const status = home.ready ? "active" : "pending_identity";
  const sourceEventId = await emitPinningEvent({
    eventType: PINNING_EVENTS.policySaved,
    userId: user.id,
    walletAddress: input.walletAddress ?? null,
    metadata: {
      scopeType: input.scopeType,
      scopeRef,
      includeFuture: Boolean(input.includeFuture),
      publicDiscovery: Boolean(input.publicDiscovery),
    },
    rawRefType: "ipfs_pinning_policy",
    rawRefId: scopeRef,
  });
  const [policy] = await db.insert(ipfsPinningPolicies)
    .values({
      userId: user.id,
      scopeType: input.scopeType,
      scopeRef,
      walletAddress: input.walletAddress?.trim() || null,
      sourceChain: input.sourceChain?.trim() || "tezos",
      includeExisting: input.includeExisting ?? true,
      includeFuture: input.includeFuture ?? false,
      publicDiscovery: input.publicDiscovery ?? false,
      providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      status,
      exclusions: input.exclusions ?? {},
      sourceEventId,
      updatedAt: now,
    })
    .returning();
  await enqueuePolicyRecord({ userId: user.id, policy, home });
  await upsertSubdomainBinding({
    userId: user.id,
    publicDiscoveryEnabled: Boolean(input.publicDiscovery),
  });
  let manifest: typeof ipfsPinningManifests.$inferSelect | null = null;
  if (input.scopeType === "wallet_full" && input.walletAddress) {
    manifest = await createWalletBackupManifest({
      user,
      policy,
      walletAddress: input.walletAddress,
      publicDiscovery: Boolean(input.publicDiscovery),
      home,
    });
    await emitPinningEvent({
      eventType: PINNING_EVENTS.walletBackupEnabled,
      userId: user.id,
      walletAddress: input.walletAddress,
      metadata: { policyId: policy.id, manifestId: manifest.id, scopeRef },
      rawRefType: "ipfs_pinning_manifest",
      rawRefId: manifest.id,
    });
  }
  return { policy, manifest, overview: await getIpfsPinningOverview(user) };
}

async function createWalletBackupManifest(input: {
  user: UserLike;
  policy: typeof ipfsPinningPolicies.$inferSelect;
  walletAddress: string;
  publicDiscovery: boolean;
  home: Awaited<ReturnType<typeof resolvePinHome>>;
}) {
  const now = new Date();
  let discovered: Awaited<ReturnType<typeof discoverWalletPinItems>> = [];
  let discoveryError: string | null = null;
  try {
    discovered = await discoverWalletPinItems(input.walletAddress);
  } catch (err) {
    discoveryError = err instanceof Error ? err.message : String(err);
  }
  const [manifest] = await db.insert(ipfsPinningManifests)
    .values({
      userId: input.user.id,
      policyId: input.policy.id,
      scopeType: "wallet_full",
      scopeRef: input.walletAddress,
      walletAddress: input.walletAddress,
      sourceChain: input.policy.sourceChain,
      title: `Wallet backup ${input.walletAddress}`,
      itemCount: discovered.length,
      byteSize: 0,
      providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      pdsStatus: input.home.ready ? "queued" : "pending_identity",
      sourceEventId: input.policy.sourceEventId,
      updatedAt: now,
    })
    .returning();

  const jobRows: Array<typeof ipfsPinningJobs.$inferSelect> = [];
  for (const item of discovered) {
    const [job] = await db.insert(ipfsPinningJobs)
      .values({
        userId: input.user.id,
        policyId: input.policy.id,
        manifestId: manifest.id,
        scopeType: "token",
        scopeRef: item.scopeRef,
        source: "wallet_scan",
        sourceUri: item.sourceUri,
        fileName: item.cid,
        mimeType: item.mimeType ?? null,
        byteSize: 0,
        cid: item.cid,
        providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
        status: hostedPorcupinCidEndpoint() ? "queued" : "staged",
        storageStatus: "existing_ipfs",
        porcupinStatus: hostedPorcupinCidEndpoint() ? "queued" : "provider_not_configured",
        sourceEventId: input.policy.sourceEventId,
        metadata: {
          walletAddress: input.walletAddress,
          sourceUri: item.sourceUri,
          ...(item.metadata ?? {}),
        },
        updatedAt: now,
      })
      .returning();
    jobRows.push(job);
    await enqueueItemRecord({ job, home: input.home });
  }

  const manifestPayload = {
    schemaVersion: 1,
    manifestId: manifest.id,
    userId: input.user.id,
    walletAddress: input.walletAddress,
    sourceChain: input.policy.sourceChain,
    provider: HOSTED_PORCUPIN_PROVIDER_KEY,
    createdAt: now.toISOString(),
    discoveryError,
    items: jobRows.map((job) => ({
      jobId: job.id,
      cid: job.cid,
      scopeRef: job.scopeRef,
      sourceUri: job.sourceUri,
      status: job.status,
    })),
  };
  const { storageRef } = await writeManifestBundle({
    userId: input.user.id,
    manifestId: manifest.id,
    payload: manifestPayload,
  });
  const [refreshed] = await db.select().from(ipfsPinningManifests).where(eq(ipfsPinningManifests.id, manifest.id)).limit(1);
  const manifestRecord = await enqueueManifestRecord({
    manifest: refreshed ?? manifest,
    home: input.home,
    storageRef,
  });
  await upsertSubdomainBinding({
    userId: input.user.id,
    manifestId: manifest.id,
    manifestUri: manifestRecord.uri,
    manifestCid: null,
    publicDiscoveryEnabled: input.publicDiscovery,
  });
  await emitPinningEvent({
    eventType: PINNING_EVENTS.restoreProofCreated,
    userId: input.user.id,
    walletAddress: input.walletAddress,
    metadata: {
      manifestId: manifest.id,
      manifestUri: manifestRecord.uri,
      itemCount: discovered.length,
      discoveryError,
      storageRef,
    },
    rawRefType: "ipfs_pinning_manifest",
    rawRefId: manifest.id,
  });
  return refreshed ?? manifest;
}

export async function stageAndPinUpload(input: {
  userId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  source: "macaroni" | "macaroni_package" | "manual" | "studio";
  scopeType?: ScopeType;
  scopeRef?: string | null;
}) {
  const checksumSha256 = sha256(input.buffer);
  const now = new Date();
  const objectKey = objectKeyForPin({
    userId: input.userId,
    checksumSha256,
    fileName: input.fileName,
    now,
  });
  const protect = await shouldProtectObjectUploads(input.buffer.length);
  if (protect.protected) {
    throw new IpfsPinningError(507, `Object storage quota protects new uploads: ${protect.reason}`, "quota_protected");
  }
  let storage: Awaited<ReturnType<typeof putObjectBuffer>> | null = null;
  let storageStatus = "not_configured";
  if (getObjectStorageConfig()) {
    storage = await putObjectBuffer({
      key: objectKey,
      body: input.buffer,
      contentType: input.mimeType || "application/octet-stream",
      metadata: {
        source: "wtfos-ipfs-pinning",
        userId: String(input.userId),
        checksumSha256,
      },
    });
    storageStatus = "staged_s3";
    await emitPinningEvent({
      eventType: PINNING_EVENTS.storageStaged,
      userId: input.userId,
      metadata: { s3Bucket: storage.bucket, s3Key: storage.key, bytes: input.buffer.length },
      rawRefType: "s3_object",
      rawRefId: storage.key,
    });
  }
  const pinned = await pinBufferWithProvider({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType || "application/octet-stream",
  });
  const sourceEventId = await emitPinningEvent({
    eventType: PINNING_EVENTS.pinCompleted,
    userId: input.userId,
    metadata: {
      cid: pinned.cid,
      providerKey: pinned.providerKey,
      bytes: input.buffer.length,
      source: input.source,
    },
    rawRefType: "ipfs_cid",
    rawRefId: pinned.cid,
  });
  const [job] = await db.insert(ipfsPinningJobs)
    .values({
      userId: input.userId,
      scopeType: input.scopeType ?? "manual_upload",
      scopeRef: input.scopeRef ?? pinned.cid,
      source: input.source,
      fileName: input.fileName,
      mimeType: input.mimeType || "application/octet-stream",
      byteSize: input.buffer.length,
      checksumSha256,
      cid: pinned.cid,
      providerKey: pinned.providerKey,
      providerPinId: pinned.providerPinId ?? null,
      status: "pinned",
      attempts: 1,
      s3Bucket: storage?.bucket ?? null,
      s3Key: storage?.key ?? null,
      s3Endpoint: storage?.endpoint ?? null,
      s3Region: storage?.region ?? null,
      storageStatus,
      porcupinStatus: pinned.providerKey === HOSTED_PORCUPIN_PROVIDER_KEY ? "pinned" : "fallback_pinata",
      sourceEventId,
      metadata: { source: input.source },
      updatedAt: now,
      completedAt: now,
    })
    .returning();
  const home = await resolvePinHome(input.userId);
  if (home.identity?.repoDid) {
    await enqueueItemRecord({ job, home });
  }
  return {
    cid: pinned.cid,
    IpfsHash: pinned.cid,
    ipfsUri: `ipfs://${pinned.cid}`,
    providerKey: pinned.providerKey,
    jobId: job.id,
    storage: storage
      ? {
          bucket: storage.bucket,
          key: storage.key,
          endpoint: storage.endpoint,
          region: storage.region,
        }
      : null,
  };
}

export async function retryPinningJob(userId: number, jobId: number) {
  const [job] = await db
    .select()
    .from(ipfsPinningJobs)
    .where(and(eq(ipfsPinningJobs.id, jobId), eq(ipfsPinningJobs.userId, userId)))
    .limit(1);
  if (!job) throw new IpfsPinningError(404, "Pinning job not found");
  if (!job.cid) throw new IpfsPinningError(400, "Only CID-based jobs can be retried here");
  await db.update(ipfsPinningJobs)
    .set({ status: "queued", porcupinStatus: "queued", lastError: null, updatedAt: new Date() })
    .where(eq(ipfsPinningJobs.id, job.id));
  return { ok: true };
}

export async function getPinRegistrySummaryForUser(userId: number) {
  try {
    const [binding] = await db
      .select()
      .from(ipfsPinningSubdomainBindings)
      .where(eq(ipfsPinningSubdomainBindings.userId, userId))
      .limit(1);
    const manifests = await db
      .select({
        id: ipfsPinningManifests.id,
        scopeType: ipfsPinningManifests.scopeType,
        scopeRef: ipfsPinningManifests.scopeRef,
        itemCount: ipfsPinningManifests.itemCount,
        pdsStatus: ipfsPinningManifests.pdsStatus,
        pdsManifestRecordUri: ipfsPinningManifests.pdsManifestRecordUri,
        createdAt: ipfsPinningManifests.createdAt,
      })
      .from(ipfsPinningManifests)
      .where(eq(ipfsPinningManifests.userId, userId))
      .orderBy(desc(ipfsPinningManifests.createdAt))
      .limit(5);
    return {
      binding: binding
        ? {
            host: binding.host,
            repoDid: binding.repoDid,
            status: binding.status,
            publicDiscoveryEnabled: binding.publicDiscoveryEnabled,
            manifestUri: binding.pinManifestRecordUri,
            wellKnownUrl: binding.host ? `https://${binding.host}/.well-known/wtfos-pins` : null,
          }
        : null,
      manifests,
    };
  } catch (err) {
    if (missingRelation(err)) return { binding: null, manifests: [] };
    throw err;
  }
}

export async function wellKnownPinsForHost(host: string) {
  const normalized = host.trim().toLowerCase().replace(/:\d+$/, "");
  const [site] = await db
    .select()
    .from(wtfUserSites)
    .where(eq(wtfUserSites.host, normalized))
    .limit(1);
  if (!site) return { status: 404 as const, body: { error: "Pin home not found" } };
  if (site.status === "suspended") {
    return { status: 410 as const, body: { error: "Site suspended" } };
  }
  const [binding] = await db
    .select()
    .from(ipfsPinningSubdomainBindings)
    .where(eq(ipfsPinningSubdomainBindings.host, normalized))
    .limit(1);
  if (!binding || !binding.publicDiscoveryEnabled) {
    return { status: 404 as const, body: { error: "Pin discovery not enabled" } };
  }
  if (!isWellKnownPinDiscoveryReady(binding)) {
    return { status: 404 as const, body: { error: "Pin discovery pending" } };
  }
  return {
    status: 200 as const,
    body: {
      schemaVersion: 1,
      host: normalized,
      repoDid: binding.repoDid,
      repoHandle: binding.repoHandle,
      manifestUri: binding.pinManifestRecordUri,
      recordCid: binding.pinManifestRecordCid,
      latestPublishedAt: iso(binding.lastPublishedAt ?? binding.updatedAt),
      gatewayLinks: binding.pinManifestRecordUri
        ? [`https://bsky.app/profile/${binding.repoDid}/post/${encodeURIComponent(binding.pinManifestRecordUri)}`]
        : [],
    },
  };
}

export async function runIpfsPinningWorker() {
  let processed = 0;
  let pinned = 0;
  let published = 0;
  const jobs = await db
    .select()
    .from(ipfsPinningJobs)
    .where(and(eq(ipfsPinningJobs.status, "queued"), sql`${ipfsPinningJobs.cid} IS NOT NULL`))
    .orderBy(ipfsPinningJobs.createdAt)
    .limit(25)
    .catch((err) => {
      if (missingRelation(err)) return [] as Array<typeof ipfsPinningJobs.$inferSelect>;
      throw err;
    });
  for (const job of jobs) {
    processed++;
    const result = await pinCidWithHostedPorcupin({
      cid: job.cid!,
      userId: job.userId,
      jobId: job.id,
    });
    if (result.pinned) {
      pinned++;
      await db.update(ipfsPinningJobs)
        .set({
          status: "pinned",
          providerPinId: result.providerPinId ?? job.providerPinId,
          porcupinStatus: "pinned",
          attempts: job.attempts + 1,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ipfsPinningJobs.id, job.id));
      await emitPinningEvent({
        eventType: PINNING_EVENTS.pinCompleted,
        userId: job.userId,
        metadata: { cid: job.cid, jobId: job.id, providerKey: job.providerKey },
        rawRefType: "ipfs_pinning_job",
        rawRefId: job.id,
      });
    } else {
      await db.update(ipfsPinningJobs)
        .set({
          status: "failed",
          porcupinStatus: "failed",
          attempts: job.attempts + 1,
          lastError: result.reason ?? "pin_failed",
          updatedAt: new Date(),
        })
        .where(eq(ipfsPinningJobs.id, job.id));
    }
  }

  const outboxRows = await db
    .select()
    .from(wtfosAtprotoOutbox)
    .where(and(
      inArray(wtfosAtprotoOutbox.sourceRefType, [
        "ipfs_pinning_policy",
        "ipfs_pinning_manifest",
        "ipfs_pinning_job",
      ]),
      eq(wtfosAtprotoOutbox.status, "published")
    ))
    .orderBy(desc(wtfosAtprotoOutbox.publishedAt))
    .limit(100)
    .catch((err) => {
      if (missingRelation(err)) return [] as Array<typeof wtfosAtprotoOutbox.$inferSelect>;
      throw err;
    });
  for (const row of outboxRows) {
    if (!row.sourceRefId || !row.recordUri) continue;
    const id = Number(row.sourceRefId);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (row.sourceRefType === "ipfs_pinning_manifest") {
      const updated = await db.update(ipfsPinningManifests)
        .set({
          pdsStatus: "published",
          pdsManifestRecordUri: row.recordUri,
          pdsManifestRecordCid: row.recordCid ?? null,
          publishedAt: row.publishedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(ipfsPinningManifests.id, id), sql`${ipfsPinningManifests.pdsStatus} <> 'published'`))
        .returning();
      if (updated.length > 0) {
        published++;
        await db.update(ipfsPinningSubdomainBindings)
          .set({
            pinManifestRecordUri: row.recordUri,
            pinManifestRecordCid: row.recordCid ?? null,
            lastPublishedAt: row.publishedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(ipfsPinningSubdomainBindings.manifestId, id));
        await emitPinningEvent({
          eventType: PINNING_EVENTS.pdsRecordPublished,
          userId: row.userId,
          metadata: { type: row.collection, uri: row.recordUri, cid: row.recordCid ?? null },
          rawRefType: row.sourceRefType,
          rawRefId: id,
        });
      }
    } else if (row.sourceRefType === "ipfs_pinning_job") {
      await db.update(ipfsPinningJobs)
        .set({ pdsItemRecordUri: row.recordUri, pdsItemRecordCid: row.recordCid ?? null, updatedAt: new Date() })
        .where(eq(ipfsPinningJobs.id, id));
    } else if (row.sourceRefType === "ipfs_pinning_policy") {
      await db.update(ipfsPinningPolicies)
        .set({ pdsPolicyRecordUri: row.recordUri, pdsPolicyRecordCid: row.recordCid ?? null, updatedAt: new Date() })
        .where(eq(ipfsPinningPolicies.id, id));
    }
  }

  await db.insert(ipfsPinningProviderStatus)
    .values({
      providerKey: HOSTED_PORCUPIN_PROVIDER_KEY,
      providerKind: "wtfos_porcupin_hetzner",
      enabled: true,
      health: hostedPorcupinCidEndpoint() || hostedPorcupinFileEndpoint() || pinataJwt() ? "configured" : "degraded",
      s3Bucket: getObjectStorageConfig()?.bucket ?? null,
      lastCheckAt: new Date(),
      lastError: hostedPorcupinCidEndpoint() || hostedPorcupinFileEndpoint() || pinataJwt() ? null : "provider_endpoint_not_configured",
      metadata: { s3Configured: Boolean(getObjectStorageConfig()) },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ipfsPinningProviderStatus.providerKey,
      set: {
        health: hostedPorcupinCidEndpoint() || hostedPorcupinFileEndpoint() || pinataJwt() ? "configured" : "degraded",
        s3Bucket: getObjectStorageConfig()?.bucket ?? null,
        lastCheckAt: new Date(),
        lastError: hostedPorcupinCidEndpoint() || hostedPorcupinFileEndpoint() || pinataJwt() ? null : "provider_endpoint_not_configured",
        metadata: { s3Configured: Boolean(getObjectStorageConfig()) },
        updatedAt: new Date(),
      },
    })
    .catch((err) => {
      if (!missingRelation(err)) throw err;
    });
  return {
    itemsIn: processed + outboxRows.length,
    itemsOut: pinned + published,
    cursorAfter: { processed, pinned, published },
  };
}
