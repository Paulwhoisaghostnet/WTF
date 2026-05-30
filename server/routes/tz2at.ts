import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { AtpAgent } from "@atproto/api";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { getAtprotoAgentForDid, isAtprotoEnabled } from "../features/atproto/oauth";
import { encryptOAuthSecret } from "../auth/oauth-crypto";
import {
  atprotoAccounts,
  tz2atIdentityLinks,
  userEtherlinkWallets,
  userWallets,
  wtfosAtprotoIdentities,
} from "@shared/schema";
import {
  TZ2AT_TZBSKY_COLLECTION,
  TZ2AT_WALLET_LINK_COLLECTION,
  buildTz2atAtprotoScope,
  hasTz2atWalletLinkScope,
} from "@shared/atproto-permissions";
import { buildTz2atStatusPayload } from "../features/tz2at/status";
import {
  WTFOS_GAMESHOW_DOMAIN,
  WTFOS_IDENTITY_DOMAIN,
  WTFOS_PDS_PUBLIC_URL,
} from "@shared/platform-branding";
import { buildTz2atFirehoseSnapshot, type Tz2atFirehoseFilters } from "../features/tz2at/firehose";
import {
  buildTz2atCexAddressBook,
  buildTz2atEcosystemAnalytics,
} from "../features/tz2at/ecosystem-analytics";
import {
  publishQueuedWtfosOutbox,
  wtfosOutboxStatusForUser,
} from "../features/tz2at/wtfos-outbox";
import {
  normalizeTz2atWalletAddress,
  parseTzbskyCryptoAddressRecord,
  type Tz2atIdentityChain,
} from "../features/tz2at/tzbsky";

const router = Router();

const mutationLimiter = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many tz2at identity requests, please try again later" },
});

const publishSchema = z.object({
  chain: z.enum(["tezos", "etherlink"]),
  walletAddress: z.string().trim().min(3).max(128),
});

const activitySchema = z.object({
  chain: z.enum(["tezos", "etherlink"]).optional(),
  walletAddress: z.string().trim().min(3).max(128),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const optionalSearchField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(180).optional()
);

const firehoseEventsSchema = z.object({
  chain: z.enum(["tezos", "etherlink"]).optional(),
  walletAddress: optionalSearchField,
  address: optionalSearchField,
  contract: optionalSearchField,
  marketplace: optionalSearchField,
  tokenId: optionalSearchField,
  operationHash: optionalSearchField,
  eventType: optionalSearchField,
  q: optionalSearchField,
  fromLevel: z.coerce.number().int().min(0).optional(),
  toLevel: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().max(255).optional(),
});

const ecosystemAnalyticsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(60),
  sampleRepos: z.coerce.number().int().min(1).max(25).default(8),
  windowHours: z.coerce.number().int().min(1).max(168).default(72),
  hydrateCex: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value !== "false" && value !== false),
  marketNetwork: optionalSearchField,
  cexAddresses: optionalSearchField,
  host: z.enum(["all", "main", "wallets", "contracts", "marketplaces", "currencies", "platforms", "chains", "relay"]).optional(),
  network: optionalSearchField,
  collection: optionalSearchField,
  address: optionalSearchField,
  contract: optionalSearchField,
  marketplace: optionalSearchField,
  token: optionalSearchField,
  q: optionalSearchField,
  minAmountMutez: optionalSearchField,
  fromLevel: z.coerce.number().int().min(0).optional(),
  toLevel: z.coerce.number().int().min(0).optional(),
});

function tz2atBaseUrl(): string {
  return (process.env.TZ2AT_API_BASE_URL || "https://tz2at.xyz").replace(/\/$/, "");
}

function wtfosPdsUrl(): string {
  return (process.env.WTFOS_PDS_PUBLIC_URL || process.env.ATPROTO_WTFOS_PDS_URL || WTFOS_PDS_PUBLIC_URL).replace(/\/$/, "");
}

function wtfosPdsServiceUrl(): string {
  return (process.env.WTFOS_PDS_INTERNAL_URL || process.env.WTFOS_PDS_PUBLIC_URL || process.env.ATPROTO_WTFOS_PDS_URL || WTFOS_PDS_PUBLIC_URL).replace(/\/$/, "");
}

function wtfosPdsConfigured(): boolean {
  return Boolean(
    process.env.WTFOS_PDS_PUBLIC_URL ||
      process.env.ATPROTO_WTFOS_PDS_URL ||
      process.env.WTFOS_PDS_INTERNAL_URL ||
      process.env.WTFOS_PDS_HEALTH_URL ||
      process.env.WTFOS_PDS_PROVISIONING_ENABLED === "true"
  );
}

function wtfosPdsProvisioningEnabled(): boolean {
  return process.env.WTFOS_PDS_PROVISIONING_ENABLED === "true";
}

function wtfosPdsHealthUrl(): string | null {
  const explicit = process.env.WTFOS_PDS_HEALTH_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const internal = process.env.WTFOS_PDS_INTERNAL_URL?.trim();
  if (internal) return `${internal.replace(/\/$/, "")}/xrpc/_health`;
  if (!wtfosPdsConfigured()) return null;
  return `${wtfosPdsUrl()}/xrpc/_health`;
}

function wtfosHandleDomain(): string {
  return (process.env.WTFOS_ATPROTO_HANDLE_DOMAIN || process.env.ATPROTO_WTF_HANDLE_DOMAIN || WTFOS_IDENTITY_DOMAIN)
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function suggestedWtfosHandle(handle?: string | null): string | null {
  const label = String(handle || "")
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!label) return null;
  return `${label}.${wtfosHandleDomain()}`;
}

function wtfosAccountEmail(userId: number): string {
  const domain = (process.env.WTFOS_PDS_ACCOUNT_EMAIL_DOMAIN || WTFOS_GAMESHOW_DOMAIN)
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return `wtfos-${userId}@${domain}`;
}

function randomRepoPassword(): string {
  return randomBytes(32).toString("base64url");
}

function pdsOfferingConfig(account?: { handle?: string | null } | null) {
  return {
    pdsUrl: wtfosPdsUrl(),
    handleDomain: wtfosHandleDomain(),
    identityLinkCollection: "app.wtfos.identity.link",
    gameLexiconPrefix: "app.wtfos",
    suggestedHandle: suggestedWtfosHandle(account?.handle),
    configured: wtfosPdsConfigured(),
    provisioningEnabled: wtfosPdsProvisioningEnabled(),
  };
}

async function provisionWtfosRepo(input: {
  userId: number;
  identityId: number;
  canonicalDid: string;
  canonicalHandle: string | null;
  wtfHandle: string;
}) {
  if (!wtfosPdsProvisioningEnabled()) {
    return { provisioned: false, reason: "provisioning_disabled" as const };
  }
  const health = await fetchWtfosPdsHealth();
  if (health.ok !== true) {
    await db
      .update(wtfosAtprotoIdentities)
      .set({
        status: "failed",
        provisionError: health.error || "WTFOS PDS health is not ok",
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wtfosAtprotoIdentities.id, input.identityId));
    return { provisioned: false, reason: "pds_unhealthy" as const, health };
  }

  const inviteCode = process.env.WTFOS_PDS_INVITE_CODE?.trim() || undefined;
  if (process.env.WTFOS_PDS_INVITE_REQUIRED !== "false" && !inviteCode) {
    await db
      .update(wtfosAtprotoIdentities)
      .set({
        status: "failed",
        provisionError: "WTFOS_PDS_INVITE_CODE is required while WTFOS_PDS_INVITE_REQUIRED is true",
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wtfosAtprotoIdentities.id, input.identityId));
    return { provisioned: false, reason: "invite_required" as const };
  }

  const password = randomRepoPassword();
  const agent = new AtpAgent({ service: wtfosPdsServiceUrl() });
  const account = await agent.createAccount({
    handle: input.wtfHandle,
    email: wtfosAccountEmail(input.userId),
    password,
    inviteCode,
  });
  const session = agent.session;
  if (!session) throw new Error("WTFOS PDS created account but did not return a session");

  const now = new Date();
  const linkRecord = {
    $type: "app.wtfos.identity.link",
    schemaVersion: 1,
    canonicalDid: input.canonicalDid,
    canonicalHandle: input.canonicalHandle,
    wtfDid: account.data.did,
    wtfHandle: account.data.handle,
    verified: true,
    source: "wtfos",
    createdAt: now.toISOString(),
  };
  const created = await agent.com.atproto.repo.createRecord(
    {
      repo: account.data.did,
      collection: "app.wtfos.identity.link",
      record: linkRecord,
      validate: false,
    },
    { encoding: "application/json" }
  );

  const [updated] = await db
    .update(wtfosAtprotoIdentities)
    .set({
      wtfDid: account.data.did,
      wtfHandle: account.data.handle,
      wtfPdsUrl: wtfosPdsUrl(),
      status: "active",
      linkageRecordUri: created.data.uri,
      linkageRecordCid: created.data.cid,
      provisionError: null,
      encryptedAccessToken: encryptOAuthSecret(session.accessJwt),
      encryptedRefreshToken: encryptOAuthSecret(session.refreshJwt),
      encryptedRepoPassword: encryptOAuthSecret(password),
      provisionedAt: now,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(wtfosAtprotoIdentities.id, input.identityId))
    .returning();

  return { provisioned: true as const, identity: updated, linkageRecord: created.data };
}

async function linkedAccountForUser(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  return account ?? null;
}

function isMissingRelationError(err: unknown): boolean {
  return (err as any)?.code === "42P01" || String((err as any)?.message || err).includes("does not exist");
}

async function wtfosIdentityForAccount(userId: number, account: { did: string } | null) {
  if (!account) return null;
  try {
    const [identity] = await db
      .select()
      .from(wtfosAtprotoIdentities)
      .where(and(eq(wtfosAtprotoIdentities.userId, userId), eq(wtfosAtprotoIdentities.canonicalDid, account.did)))
      .limit(1);
    return identity ?? null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = new Error(`Upstream returned ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchRelayHealth() {
  const baseUrl = tz2atBaseUrl();
  try {
    const health = await fetchJson(`${baseUrl}/health`);
    return {
      baseUrl,
      ok: health?.ok === true,
      network: typeof health?.network === "string" ? health.network : null,
    };
  } catch (err) {
    return {
      baseUrl,
      ok: null,
      network: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchWtfosPdsHealth() {
  const healthUrl = wtfosPdsHealthUrl();
  if (!healthUrl) {
    return { ok: null, healthUrl: null, error: "WTFOS PDS is not configured" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(healthUrl, { headers: { Accept: "application/json" }, signal: controller.signal });
    return {
      ok: response.ok,
      healthUrl,
      error: response.ok ? null : `PDS health returned ${response.status}`,
    };
  } catch (err) {
    return {
      ok: null,
      healthUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDidPds(did: string, fallbackPdsUrl?: string | null): Promise<string> {
  if (fallbackPdsUrl) return fallbackPdsUrl.replace(/\/$/, "");
  const doc = await fetchJson(`https://plc.directory/${encodeURIComponent(did)}`);
  const services = Array.isArray(doc?.service) ? doc.service : [];
  const pds = services.find((service: any) => service?.id === "#atproto_pds");
  const endpoint = pds?.serviceEndpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    throw new Error("Could not resolve AT Protocol PDS for DID");
  }
  return endpoint.replace(/\/$/, "");
}

async function fetchTzbskyRecord(did: string, pdsUrl?: string | null) {
  const pds = await resolveDidPds(did, pdsUrl);
  const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", TZ2AT_TZBSKY_COLLECTION);
  url.searchParams.set("limit", "20");
  const body = await fetchJson(url.toString());
  const records = Array.isArray(body?.records) ? body.records : [];
  const record = records.find((candidate: any) => {
    const uri = typeof candidate?.uri === "string" ? candidate.uri : "";
    return uri.endsWith(`/${TZ2AT_TZBSKY_COLLECTION}/self`);
  });
  if (!record) {
    const error = new Error("No tzbsky com.tzbsky.cryptoAddress/self record found on this PDS");
    (error as any).status = 404;
    throw error;
  }
  return {
    uri: String(record.uri),
    cid: typeof record.cid === "string" ? record.cid : null,
    value: record.value,
    pds,
  };
}

async function statusForUser(userId: number) {
  const [account, links, tezosWallets, etherlinkWallets, relay, pdsHealth] = await Promise.all([
    linkedAccountForUser(userId),
    db.select().from(tz2atIdentityLinks).where(eq(tz2atIdentityLinks.userId, userId)).orderBy(asc(tz2atIdentityLinks.id)),
    db.select().from(userWallets).where(eq(userWallets.userId, userId)).orderBy(asc(userWallets.id)),
    db.select().from(userEtherlinkWallets).where(eq(userEtherlinkWallets.userId, userId)).orderBy(asc(userEtherlinkWallets.id)),
    fetchRelayHealth(),
    fetchWtfosPdsHealth(),
  ]);
  const wtfosIdentity = await wtfosIdentityForAccount(userId, account);
  return buildTz2atStatusPayload({
    account,
    links,
    tezosWallets,
    etherlinkWallets,
    relay,
    wtfosIdentity: wtfosIdentity ?? null,
    pdsOffering: { ...pdsOfferingConfig(account), serviceHealth: pdsHealth },
  });
}

router.get("/api/tz2at/status", isAuthenticated, async (req, res) => {
  res.json(await statusForUser((req.user as any).id));
});

router.get("/api/tz2at/pds-offering", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  const identity = await wtfosIdentityForAccount(user.id, account);
  res.json({
    account: account
      ? { id: account.id, did: account.did, handle: account.handle, pdsUrl: account.pdsUrl }
      : null,
    offering: buildTz2atStatusPayload({
      account,
      links: [],
      tezosWallets: [],
      etherlinkWallets: [],
      relay: await fetchRelayHealth(),
      wtfosIdentity: identity,
      pdsOffering: { ...pdsOfferingConfig(account), serviceHealth: await fetchWtfosPdsHealth() },
    }).pdsOffering,
  });
});

router.get("/api/tz2at/pds/status", isAuthenticated, async (_req, res) => {
  res.json({
    publicUrl: wtfosPdsUrl(),
    configured: wtfosPdsConfigured(),
    provisioningEnabled: wtfosPdsProvisioningEnabled(),
    handleDomain: wtfosHandleDomain(),
    identityLinkCollection: "app.wtfos.identity.link",
    gameLexiconPrefix: "app.wtfos",
    serviceHealth: await fetchWtfosPdsHealth(),
  });
});

router.get("/api/tz2at/outbox/status", isAuthenticated, async (req, res) => {
  try {
    res.json(await wtfosOutboxStatusForUser((req.user as any).id));
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.status(503).json({ error: "WTFOS AT outbox storage is not migrated yet" });
    }
    throw err;
  }
});

router.post("/api/tz2at/outbox/flush", isAuthenticated, mutationLimiter, async (req, res) => {
  try {
    const published = await publishQueuedWtfosOutbox({ userId: (req.user as any).id, limit: 10 });
    res.json({ ok: true, published, status: await wtfosOutboxStatusForUser((req.user as any).id) });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.status(503).json({ error: "WTFOS AT outbox storage is not migrated yet" });
    }
    throw err;
  }
});

router.post("/api/tz2at/pds-offering/request", isAuthenticated, mutationLimiter, async (req, res) => {
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  if (!account) return res.status(409).json({ error: "Connect an AT Protocol DID before requesting a WTFOS PDS identity" });
  if (!wtfosPdsConfigured()) return res.status(503).json({ error: "WTFOS PDS is not configured yet" });
  const now = new Date();
  const config = pdsOfferingConfig(account);
  let identity;
  try {
    [identity] = await db
      .insert(wtfosAtprotoIdentities)
      .values({
        userId: user.id,
        atprotoAccountId: account.id,
        canonicalDid: account.did,
        canonicalHandle: account.handle,
        wtfHandle: config.suggestedHandle,
        wtfPdsUrl: config.pdsUrl,
        status: "requested",
        provisionRequest: {
          source: "tz2at",
          identityLinkCollection: config.identityLinkCollection,
          gameLexiconPrefix: config.gameLexiconPrefix,
        },
        requestedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [wtfosAtprotoIdentities.userId, wtfosAtprotoIdentities.canonicalDid],
        set: {
          atprotoAccountId: account.id,
          canonicalHandle: account.handle,
          wtfHandle: sql`coalesce(${wtfosAtprotoIdentities.wtfHandle}, ${config.suggestedHandle})`,
          wtfPdsUrl: config.pdsUrl,
          status: sql`CASE WHEN ${wtfosAtprotoIdentities.status} = 'active' THEN ${wtfosAtprotoIdentities.status} ELSE 'requested'::wtfos_atproto_identity_status END`,
          provisionRequest: {
            source: "tz2at",
            identityLinkCollection: config.identityLinkCollection,
            gameLexiconPrefix: config.gameLexiconPrefix,
          },
          requestedAt: sql`coalesce(${wtfosAtprotoIdentities.requestedAt}, ${now})`,
          updatedAt: now,
        },
      })
      .returning();
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.status(503).json({ error: "WTFOS PDS offering storage is not migrated yet" });
    }
    throw err;
  }
  await ingestSystemEvent({
    eventType: "tz2at.wtfos_pds.requested",
    userId: user.id,
    source: "tz2at",
    sourceModule: "tz2at",
    rawRefType: "atproto_identity",
    rawRefId: account.did,
    metadata: { canonicalDid: account.did, wtfHandle: identity.wtfHandle, wtfPdsUrl: identity.wtfPdsUrl },
  });

  if (identity.status === "active" && identity.wtfDid) {
    return res.status(200).json({ ok: true, identity, status: await statusForUser(user.id) });
  }

  if (!wtfosPdsProvisioningEnabled()) {
    return res.status(202).json({
      ok: true,
      identity,
      provisioning: { queued: true, reason: "provisioning_disabled" },
      status: await statusForUser(user.id),
    });
  }

  if (!identity.wtfHandle) {
    return res.status(400).json({ error: "Could not derive a WTFOS handle for this account" });
  }

  try {
    const result = await provisionWtfosRepo({
      userId: user.id,
      identityId: identity.id,
      canonicalDid: account.did,
      canonicalHandle: account.handle,
      wtfHandle: identity.wtfHandle,
    });
    if (!result.provisioned) {
      return res.status(503).json({
        ok: false,
        error: `WTFOS PDS repo provisioning did not complete: ${result.reason}`,
        provisioning: result,
        status: await statusForUser(user.id),
      });
    }
    const linkageRecord = result.linkageRecord;
    if (!linkageRecord) throw new Error("WTFOS PDS provisioning completed without a linkage record");
    await ingestSystemEvent({
      eventType: "tz2at.wtfos_pds.provisioned",
      userId: user.id,
      source: "tz2at",
      sourceModule: "tz2at",
      rawRefType: "atproto_record",
      rawRefId: linkageRecord.uri,
      metadata: {
        canonicalDid: account.did,
        wtfDid: result.identity?.wtfDid,
        wtfHandle: result.identity?.wtfHandle,
        cid: linkageRecord.cid,
      },
    });
    return res.status(201).json({ ok: true, identity: result.identity, status: await statusForUser(user.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(wtfosAtprotoIdentities)
      .set({
        status: "failed",
        provisionError: message,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wtfosAtprotoIdentities.id, identity.id));
    return res.status(502).json({ error: message, status: await statusForUser(user.id) });
  }
});

router.post("/api/tz2at/import/tzbsky", isAuthenticated, mutationLimiter, async (req, res) => {
  if (!isAtprotoEnabled()) return res.status(503).json({ error: "AT Protocol is disabled" });
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  if (!account) return res.status(409).json({ error: "Connect an AT Protocol DID before importing tzbsky wallet proofs" });

  try {
    const imported = await fetchTzbskyRecord(account.did, account.pdsUrl);
    const proofs = parseTzbskyCryptoAddressRecord(imported.value);
    const now = new Date();
    const rows = [];
    for (const proof of proofs) {
      const [row] = await db
        .insert(tz2atIdentityLinks)
        .values({
          userId: user.id,
          atprotoAccountId: account.id,
          did: account.did,
          chain: proof.chain,
          walletAddress: proof.walletAddress,
          source: "tzbsky_import",
          importedUri: imported.uri,
          importedCid: imported.cid,
          importedRecord: imported.value,
          proof: proof.proof,
          verificationStatus: "imported",
          importedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            tz2atIdentityLinks.userId,
            tz2atIdentityLinks.did,
            tz2atIdentityLinks.chain,
            tz2atIdentityLinks.walletAddress,
          ],
          set: {
            atprotoAccountId: account.id,
            source: "tzbsky_import",
            importedUri: imported.uri,
            importedCid: imported.cid,
            importedRecord: imported.value,
            proof: proof.proof,
            verificationStatus: sql`CASE WHEN ${tz2atIdentityLinks.verificationStatus} = 'published' THEN ${tz2atIdentityLinks.verificationStatus} ELSE 'imported'::tz2at_identity_status END`,
            importedAt: now,
            updatedAt: now,
          },
        })
        .returning();
      rows.push(row);
    }
    await ingestSystemEvent({
      eventType: "tz2at.tzbsky.imported",
      userId: user.id,
      walletAddress: rows[0]?.walletAddress ?? null,
      source: "tz2at",
      sourceModule: "tz2at",
      rawRefType: "tzbsky_record",
      rawRefId: imported.uri,
      metadata: { did: account.did, count: rows.length, pdsUrl: imported.pds },
    });
    res.json({ ok: true, imported: rows, status: await statusForUser(user.id) });
  } catch (err) {
    const status = Number((err as any)?.status) || 400;
    res.status(status === 404 ? 404 : 400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function findLocalWallet(userId: number, chain: Tz2atIdentityChain, walletAddress: string) {
  if (chain === "tezos") {
    const [wallet] = await db
      .select()
      .from(userWallets)
      .where(and(eq(userWallets.userId, userId), eq(userWallets.walletAddress, walletAddress)))
      .limit(1);
    return wallet ? { localWalletId: wallet.id, localEtherlinkWalletId: null, primary: wallet.isPrimary } : null;
  }
  const [wallet] = await db
    .select()
    .from(userEtherlinkWallets)
    .where(
      and(
        eq(userEtherlinkWallets.userId, userId),
        sql`lower(${userEtherlinkWallets.walletAddress}) = ${walletAddress.toLowerCase()}`
      )
    )
    .limit(1);
  return wallet ? { localWalletId: null, localEtherlinkWalletId: wallet.id, primary: wallet.isPrimary } : null;
}

router.post("/api/tz2at/publish/wallet-link", isAuthenticated, mutationLimiter, async (req, res) => {
  if (!isAtprotoEnabled()) return res.status(503).json({ error: "AT Protocol is disabled" });
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid tz2at wallet-link payload" });
  const user = req.user as any;
  const account = await linkedAccountForUser(user.id);
  if (!account) return res.status(409).json({ error: "Connect an AT Protocol DID before publishing wallet links" });
  if (!hasTz2atWalletLinkScope(account.oauthScopes)) {
    return res.status(409).json({
      error: "Approve the tz2at wallet-link repo scope before publishing this proof",
      action: "upgrade_tz2at_permissions",
      requiredScope: buildTz2atAtprotoScope("wallet-link"),
    });
  }

  const chain = parsed.data.chain;
  const walletAddress = normalizeTz2atWalletAddress(chain, parsed.data.walletAddress);
  const localWallet = await findLocalWallet(user.id, chain, walletAddress);
  if (!localWallet) {
    return res.status(409).json({ error: "Verify this wallet in WTF before publishing a tz2at wallet-link record" });
  }

  const now = new Date();
  const record = {
    $type: TZ2AT_WALLET_LINK_COLLECTION,
    schemaVersion: 1,
    did: account.did,
    chain,
    walletAddress,
    role: localWallet.primary ? "primary" : "additional",
    source: "wtfos",
    createdAt: now.toISOString(),
  };
  const agent = await getAtprotoAgentForDid(account.did);
  const created = await agent.com.atproto.repo.createRecord(
    {
      repo: account.did,
      collection: TZ2AT_WALLET_LINK_COLLECTION,
      record,
      validate: false,
    },
    { encoding: "application/json" }
  );

  const [link] = await db
    .insert(tz2atIdentityLinks)
    .values({
      userId: user.id,
      atprotoAccountId: account.id,
      did: account.did,
      chain,
      walletAddress,
      source: "wtf_signature",
      role: localWallet.primary ? "primary" : "additional",
      localWalletId: localWallet.localWalletId,
      localEtherlinkWalletId: localWallet.localEtherlinkWalletId,
      verificationStatus: "published",
      verifiedAt: now,
      publishedAt: now,
      tz2atRecordUri: created.data.uri,
      tz2atRecordCid: created.data.cid,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tz2atIdentityLinks.userId,
        tz2atIdentityLinks.did,
        tz2atIdentityLinks.chain,
        tz2atIdentityLinks.walletAddress,
      ],
      set: {
        atprotoAccountId: account.id,
        source: "wtf_signature",
        role: localWallet.primary ? "primary" : "additional",
        localWalletId: localWallet.localWalletId,
        localEtherlinkWalletId: localWallet.localEtherlinkWalletId,
        verificationStatus: "published",
        verifiedAt: now,
        publishedAt: now,
        tz2atRecordUri: created.data.uri,
        tz2atRecordCid: created.data.cid,
        updatedAt: now,
      },
    })
    .returning();

  await ingestSystemEvent({
    eventType: "tz2at.wallet_link.published",
    userId: user.id,
    walletAddress,
    source: "tz2at",
    sourceModule: "tz2at",
    rawRefType: "atproto_record",
    rawRefId: created.data.uri,
    metadata: { did: account.did, chain, cid: created.data.cid },
  });

  const outbox = await publishQueuedWtfosOutbox({ userId: user.id, limit: 10 });
  res.status(201).json({ ok: true, link, outbox, status: await statusForUser(user.id) });
});

router.get("/api/tz2at/activity", isAuthenticated, async (req, res) => {
  const parsed = activitySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid tz2at activity query" });
  const url = new URL(`${tz2atBaseUrl()}/wallet/${encodeURIComponent(parsed.data.walletAddress)}/activity`);
  url.searchParams.set("limit", String(parsed.data.limit));
  if (parsed.data.chain) url.searchParams.set("chain", parsed.data.chain);
  try {
    const upstream = await fetchJson(url.toString());
    res.json({
      baseUrl: tz2atBaseUrl(),
      walletAddress: parsed.data.walletAddress,
      chain: parsed.data.chain ?? null,
      items: Array.isArray(upstream?.items) ? upstream.items : Array.isArray(upstream) ? upstream : [],
      raw: upstream && typeof upstream === "object" ? upstream : null,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/api/tz2at/firehose/status", isAuthenticated, async (_req, res) => {
  const relay = await fetchRelayHealth();
  const websocketBaseUrl = relay.baseUrl.replace(/^http/i, "ws");
  res.json({
    mode: "read-only-appview-consumer",
    baseUrl: relay.baseUrl,
    ok: relay.ok,
    network: relay.network,
    error: relay.error ?? null,
    jsonFirehoseUrl: `${websocketBaseUrl}/firehose`,
    snapshotEndpoint: "/api/tz2at/firehose/events",
    pdsWrites: "none",
  });
});

async function searchTz2atFirehose(req: Request, res: Response) {
  const parsed = firehoseEventsSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid tz2at firehose query" });
  const baseUrl = tz2atBaseUrl();
  const walletAddress = parsed.data.walletAddress;
  const mode = walletAddress ? "wallet-activity-snapshot" : "relay-replay-search";
  const url = new URL(walletAddress ? `${baseUrl}/wallet/${encodeURIComponent(walletAddress)}/activity` : `${baseUrl}/replay`);
  url.searchParams.set("limit", String(parsed.data.limit));
  if (parsed.data.chain) url.searchParams.set("chain", parsed.data.chain);
  if (parsed.data.cursor) url.searchParams.set("cursor", parsed.data.cursor);
  if (!walletAddress && parsed.data.fromLevel !== undefined) url.searchParams.set("fromLevel", String(parsed.data.fromLevel));
  if (!walletAddress && parsed.data.toLevel !== undefined) url.searchParams.set("toLevel", String(parsed.data.toLevel));

  const filters: Tz2atFirehoseFilters = {
    chain: parsed.data.chain,
    eventType: parsed.data.eventType,
    query: parsed.data.q,
    address: parsed.data.address ?? parsed.data.walletAddress,
    contract: parsed.data.contract,
    marketplace: parsed.data.marketplace,
    tokenId: parsed.data.tokenId,
    operationHash: parsed.data.operationHash,
  };

  try {
    const upstream = await fetchJson(url.toString());
    res.json(
      buildTz2atFirehoseSnapshot({
        mode,
        baseUrl,
        sourceUrl: url.toString(),
        chain: parsed.data.chain,
        walletAddress: walletAddress ?? null,
        limit: parsed.data.limit,
        upstream,
        filters,
      })
    );
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

router.get("/api/tz2at/firehose/events", isAuthenticated, searchTz2atFirehose);
router.get("/api/tz2at/firehose/search", isAuthenticated, searchTz2atFirehose);

router.get("/api/tz2at/ecosystem/analytics", isAuthenticated, async (req, res) => {
  const parsed = ecosystemAnalyticsSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid tz2at ecosystem analytics query" });
  const cexAddressBook = buildTz2atCexAddressBook({
    query: parsed.data.cexAddresses,
    envBook: process.env.TZ2AT_CEX_ADDRESS_BOOK,
    envAddresses: process.env.TZ2AT_CEX_ADDRESSES,
    disableDefault: process.env.TZ2AT_DISABLE_DEFAULT_CEX_ADDRESS_BOOK === "true",
  });
  try {
    const analytics = await buildTz2atEcosystemAnalytics({
      limitPerCollection: parsed.data.limit,
      sampleReposPerHost: parsed.data.sampleRepos,
      windowHours: parsed.data.windowHours,
      hydrateCex: parsed.data.hydrateCex,
      marketNetwork: parsed.data.marketNetwork ?? parsed.data.network ?? "mainnet",
      cexAddresses: cexAddressBook,
      filters: {
        host: parsed.data.host,
        network: parsed.data.network,
        collection: parsed.data.collection,
        address: parsed.data.address,
        contract: parsed.data.contract,
        marketplace: parsed.data.marketplace,
        token: parsed.data.token,
        q: parsed.data.q,
        minAmountMutez: parsed.data.minAmountMutez,
        fromLevel: parsed.data.fromLevel,
        toLevel: parsed.data.toLevel,
      },
    });
    res.json(analytics);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
