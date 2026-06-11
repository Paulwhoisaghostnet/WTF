import { randomBytes } from "crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { enqueueSpineRecord } from "../atproto-spine/service";
import { getSpineConfig } from "../atproto-spine/config";
import {
  atprotoAccounts,
  atprotoHandleClaims,
  userMediaLibrary,
  users,
  userWallets,
  wtfosAtprotoIdentities,
  wtfUserSiteAssetRefs,
  wtfUserSiteAuditEvents,
  wtfUserSitePages,
  wtfUserSites,
  wtfUserSiteVersions,
} from "@shared/schema";
import {
  WTF_USER_SITE_HOME_SLUG,
  WTF_USER_SITE_MAX_ASSET_BYTES,
  WTF_USER_SITE_MAX_NAMED_PAGES,
  WTF_USER_SITE_MAX_TOTAL_PAGES,
  type WtfUserSiteDto,
  type WtfUserSiteEligibilityDto,
  type WtfUserSiteMediaDto,
  type WtfUserSitePageDto,
  type WtfUserSiteStateDto,
  type WtfUserSiteVersionDto,
} from "@shared/wtf-user-sites";
import {
  buildUserSiteManifest,
  canIssueWtfDidForRoles,
  digestUserSiteManifest,
  normalizeUserSiteSlug,
  pageSlugForRequestPath,
  validateUserSiteLabel,
  type DidTargetSnapshot,
  type ManifestPageSnapshot,
} from "./policy";

type UserRow = typeof users.$inferSelect;
type SiteRow = typeof wtfUserSites.$inferSelect;
type PageRow = typeof wtfUserSitePages.$inferSelect;
type VersionRow = typeof wtfUserSiteVersions.$inferSelect;
type MediaRow = typeof userMediaLibrary.$inferSelect;
type AuditEvent = typeof wtfUserSiteAuditEvents.$inferInsert["eventType"];

export class WtfUserSiteError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "WtfUserSiteError";
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function siteUrl(host: string): string {
  return `https://${host}/`;
}

function publicProfileUrl(label: string): string {
  const origin = process.env.PUBLIC_SITE_URL?.trim() || "https://wtfos.app";
  return `${origin.replace(/\/$/, "")}/user/${encodeURIComponent(label)}`;
}

function hasOAuthSocial(user: UserRow, activeAtproto: unknown): boolean {
  return Boolean(
    activeAtproto ||
      user.twitterId ||
      user.twitterHandle ||
      user.twitterOauthToken ||
      user.twitterOauth2AccessToken ||
      user.discordId ||
      user.discordHandle ||
      user.googleId ||
      user.githubId
  );
}

function missingRelation(err: unknown): boolean {
  return (
    (err as { code?: string; cause?: { code?: string } })?.code === "42P01" ||
    (err as { code?: string; cause?: { code?: string } })?.cause?.code === "42P01" ||
    String((err as { message?: string })?.message || "").includes("does not exist")
  );
}

function toPageDto(page: PageRow): WtfUserSitePageDto {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    draftHtml: page.draftHtml,
    sortOrder: page.sortOrder,
    updatedAt: iso(page.updatedAt) ?? new Date().toISOString(),
  };
}

function versionPageSlugs(version: VersionRow): string[] {
  const pages = Array.isArray(version.pages) ? version.pages : [];
  return pages
    .map((page) => (page && typeof page === "object" ? String((page as any).slug || "") : ""))
    .filter(Boolean);
}

function toVersionDto(version: VersionRow): WtfUserSiteVersionDto {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    digest: version.digest,
    did: version.did,
    didSource: version.didSource,
    pageSlugs: versionPageSlugs(version),
    assetMediaIds: Array.isArray(version.assetMediaIds) ? version.assetMediaIds : [],
    publishedAt: iso(version.publishedAt) ?? new Date().toISOString(),
    publishedBy: version.publishedBy ?? null,
  };
}

function mediaBytes(item: MediaRow): number {
  const explicit = Number(item.fileSizeBytes ?? item.fileSize ?? 0);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 0;
}

function assetCapLabel(): string {
  return `${Math.round(WTF_USER_SITE_MAX_ASSET_BYTES / 1024 / 1024)} MB`;
}

function mediaUrl(host: string, id: number): string {
  return `https://${host}/_media/${id}`;
}

function toMediaDto(host: string, item: MediaRow): WtfUserSiteMediaDto {
  return {
    id: item.id,
    title: item.title,
    mimeType: item.mimeType,
    url: mediaUrl(host, item.id),
    fileSizeBytes: mediaBytes(item),
  };
}

async function audit(siteId: number, actorUserId: number | null, eventType: AuditEvent, metadata: Record<string, unknown> = {}) {
  try {
    await db.insert(wtfUserSiteAuditEvents).values({
      siteId,
      actorUserId,
      eventType,
      metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    if (!missingRelation(err)) throw err;
  }
}

async function fetchUser(userId: number): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new WtfUserSiteError(404, "User not found");
  return user;
}

async function fetchActiveAtprotoAccount(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  return account ?? null;
}

async function fetchActiveWtfIdentity(userId: number) {
  const [identity] = await db
    .select()
    .from(wtfosAtprotoIdentities)
    .where(
      and(
        eq(wtfosAtprotoIdentities.userId, userId),
        eq(wtfosAtprotoIdentities.status, "active"),
        isNotNull(wtfosAtprotoIdentities.wtfDid)
      )
    )
    .orderBy(desc(wtfosAtprotoIdentities.provisionedAt), desc(wtfosAtprotoIdentities.id))
    .limit(1);
  return identity ?? null;
}

export async function getUserSiteEligibility(userId: number): Promise<WtfUserSiteEligibilityDto> {
  const user = await fetchUser(userId);
  const networkDomain = getSpineConfig().networkDomain;
  const labelResult = validateUserSiteLabel(user.username, networkDomain);
  const [wallet, activeAtproto, activeWtfIdentity, roles] = await Promise.all([
    db.select({ id: userWallets.id }).from(userWallets).where(eq(userWallets.userId, userId)).limit(1),
    fetchActiveAtprotoAccount(userId),
    fetchActiveWtfIdentity(userId),
    listRolesForUserSnapshot(user),
  ]);

  const hasWallet = wallet.length > 0;
  const hasLinkedBluesky = Boolean(activeAtproto);
  const hasActiveWtfDid = Boolean(activeWtfIdentity?.wtfDid);
  const canIssueWtfDid = canIssueWtfDidForRoles(roles);
  const didTarget: DidTargetSnapshot | null = activeWtfIdentity?.wtfDid
    ? {
        did: activeWtfIdentity.wtfDid,
        source: "wtf",
        handle: activeWtfIdentity.wtfHandle ?? null,
        pdsUrl: activeWtfIdentity.wtfPdsUrl ?? null,
        atprotoAccountId: activeWtfIdentity.atprotoAccountId ?? null,
        wtfosIdentityId: activeWtfIdentity.id,
      }
    : activeAtproto
      ? {
          did: activeAtproto.did,
          source: "bsky",
          handle: activeAtproto.handle ?? null,
          pdsUrl: activeAtproto.pdsUrl ?? null,
          atprotoAccountId: activeAtproto.id,
          wtfosIdentityId: null,
        }
      : null;

  const reasons: string[] = [];
  if (!labelResult.ok) reasons.push(labelResult.reason);
  if (!hasWallet) reasons.push("Link a wallet before claiming a wtfOS site.");
  if (!hasOAuthSocial(user, activeAtproto)) reasons.push("Link at least one OAuth social account.");
  if (!hasLinkedBluesky && !hasActiveWtfDid) {
    reasons.push("Link Bluesky or activate a WTF DID before claiming a wtfOS site.");
  }

  return {
    canClaim: labelResult.ok && hasWallet && hasOAuthSocial(user, activeAtproto) && Boolean(didTarget),
    label: labelResult.ok ? labelResult.label : null,
    host: labelResult.ok ? labelResult.host : null,
    reasons,
    hasWallet,
    hasOAuthSocial: hasOAuthSocial(user, activeAtproto),
    hasLinkedBluesky,
    hasActiveWtfDid,
    canIssueWtfDid,
    didTarget,
  };
}

async function ensureHomePage(siteId: number) {
  await db
    .insert(wtfUserSitePages)
    .values({
      siteId,
      slug: WTF_USER_SITE_HOME_SLUG,
      title: "Home",
      draftHtml: "<main><h1>wtfOS site</h1></main>",
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

async function ensureVerifiedHandleClaim(input: {
  userId: number;
  accountId: number | null;
  did: string;
  handle: string;
}) {
  const now = new Date();
  const proofToken = randomBytes(32).toString("hex");
  const [claim] = await db
    .insert(atprotoHandleClaims)
    .values({
      userId: input.userId,
      atprotoAccountId: input.accountId,
      did: input.did,
      desiredHandle: input.handle,
      verificationMethod: "wtf_hosted_subdomain",
      verificationStatus: "verified",
      proofToken,
      verifiedAt: now,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [atprotoHandleClaims.userId, atprotoHandleClaims.desiredHandle],
      set: {
        atprotoAccountId: input.accountId,
        did: input.did,
        verificationMethod: "wtf_hosted_subdomain",
        verificationStatus: "verified",
        verifiedAt: now,
        lastCheckedAt: now,
        failureReason: null,
        updatedAt: now,
      },
    })
    .returning();
  return claim;
}

export async function claimUserSite(userId: number): Promise<WtfUserSiteStateDto> {
  const eligibility = await getUserSiteEligibility(userId);
  if (!eligibility.canClaim || !eligibility.didTarget || !eligibility.label || !eligibility.host) {
    throw new WtfUserSiteError(403, eligibility.reasons[0] || "User is not eligible to claim a wtfOS site");
  }

  const existingForLabel = await db
    .select({ id: wtfUserSites.id, userId: wtfUserSites.userId })
    .from(wtfUserSites)
    .where(eq(wtfUserSites.label, eligibility.label))
    .limit(1);
  if (existingForLabel[0] && existingForLabel[0].userId !== userId) {
    throw new WtfUserSiteError(409, "Username site label is already claimed");
  }

  const claim = await ensureVerifiedHandleClaim({
    userId,
    accountId: eligibility.didTarget.atprotoAccountId ?? null,
    did: eligibility.didTarget.did,
    handle: eligibility.host,
  });

  const now = new Date();
  const [site] = await db
    .insert(wtfUserSites)
    .values({
      userId,
      label: eligibility.label,
      host: eligibility.host,
      status: "draft",
      activeDid: eligibility.didTarget.did,
      activeDidSource: eligibility.didTarget.source,
      atprotoAccountId: eligibility.didTarget.atprotoAccountId ?? null,
      wtfosIdentityId: eligibility.didTarget.wtfosIdentityId ?? null,
      atprotoHandleClaimId: claim?.id ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: wtfUserSites.userId,
      set: {
        label: eligibility.label,
        host: eligibility.host,
        activeDid: eligibility.didTarget.did,
        activeDidSource: eligibility.didTarget.source,
        atprotoAccountId: eligibility.didTarget.atprotoAccountId ?? null,
        wtfosIdentityId: eligibility.didTarget.wtfosIdentityId ?? null,
        atprotoHandleClaimId: claim?.id ?? null,
        proofGraceUntil: null,
        updatedAt: now,
      },
    })
    .returning();

  await ensureHomePage(site.id);
  await audit(site.id, userId, "claimed", {
    host: eligibility.host,
    did: eligibility.didTarget.did,
    didSource: eligibility.didTarget.source,
  });
  return getUserSiteState(userId);
}

async function fetchSiteForUser(userId: number): Promise<SiteRow | null> {
  const [site] = await db.select().from(wtfUserSites).where(eq(wtfUserSites.userId, userId)).limit(1);
  return site ?? null;
}

async function fetchSitePages(siteId: number): Promise<PageRow[]> {
  return db
    .select()
    .from(wtfUserSitePages)
    .where(eq(wtfUserSitePages.siteId, siteId))
    .orderBy(asc(wtfUserSitePages.sortOrder), asc(wtfUserSitePages.id));
}

async function fetchSiteVersions(siteId: number, limit = 20): Promise<VersionRow[]> {
  return db
    .select()
    .from(wtfUserSiteVersions)
    .where(eq(wtfUserSiteVersions.siteId, siteId))
    .orderBy(desc(wtfUserSiteVersions.versionNumber))
    .limit(limit);
}

async function fetchSiteAssets(siteId: number): Promise<MediaRow[]> {
  return db
    .select({ media: userMediaLibrary })
    .from(wtfUserSiteAssetRefs)
    .innerJoin(userMediaLibrary, eq(wtfUserSiteAssetRefs.mediaId, userMediaLibrary.id))
    .where(eq(wtfUserSiteAssetRefs.siteId, siteId))
    .orderBy(asc(userMediaLibrary.title))
    .then((rows) => rows.map((row) => row.media));
}

async function refreshProofState(site: SiteRow, eligibility: WtfUserSiteEligibilityDto): Promise<SiteRow> {
  if (site.status === "suspended") return site;
  const now = new Date();
  if (eligibility.didTarget) {
    const [updated] = await db
      .update(wtfUserSites)
      .set({
        activeDid: eligibility.didTarget.did,
        activeDidSource: eligibility.didTarget.source,
        atprotoAccountId: eligibility.didTarget.atprotoAccountId ?? null,
        wtfosIdentityId: eligibility.didTarget.wtfosIdentityId ?? null,
        proofGraceUntil: null,
        updatedAt: now,
      })
      .where(eq(wtfUserSites.id, site.id))
      .returning();
    return updated ?? site;
  }

  if (site.proofGraceUntil && site.proofGraceUntil <= now) {
    const [updated] = await db
      .update(wtfUserSites)
      .set({
        status: "suspended",
        suspendedAt: now,
        suspendedReason: "Identity proof was not restored before the grace period ended.",
        updatedAt: now,
      })
      .where(eq(wtfUserSites.id, site.id))
      .returning();
    await audit(site.id, null, "suspended", { reason: "proof_grace_expired" });
    return updated ?? site;
  }

  if (!site.proofGraceUntil) {
    const graceUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(wtfUserSites)
      .set({
        proofGraceUntil: graceUntil,
        updatedAt: now,
      })
      .where(eq(wtfUserSites.id, site.id))
      .returning();
    await audit(site.id, null, "proof_warning", { graceUntil: graceUntil.toISOString() });
    return updated ?? site;
  }
  return site;
}

async function serializeSite(site: SiteRow): Promise<WtfUserSiteDto> {
  const [pages, versions, assets] = await Promise.all([
    fetchSitePages(site.id),
    fetchSiteVersions(site.id),
    fetchSiteAssets(site.id),
  ]);
  const assetBytes = assets.reduce((sum, item) => sum + mediaBytes(item), 0);
  return {
    id: site.id,
    label: site.label,
    host: site.host,
    url: siteUrl(site.host),
    status: site.status,
    activeDid: site.activeDid ?? null,
    activeDidSource: site.activeDidSource ?? null,
    proofGraceUntil: iso(site.proofGraceUntil),
    suspendedAt: iso(site.suspendedAt),
    suspendedReason: site.suspendedReason ?? null,
    publishedAt: iso(site.publishedAt),
    pages: pages.map(toPageDto),
    versions: versions.map(toVersionDto),
    assets: assets.map((item) => toMediaDto(site.host, item)),
    assetBytes,
    maxAssetBytes: WTF_USER_SITE_MAX_ASSET_BYTES,
    maxNamedPages: WTF_USER_SITE_MAX_NAMED_PAGES,
  };
}

export async function getUserSiteState(userId: number): Promise<WtfUserSiteStateDto> {
  const eligibility = await getUserSiteEligibility(userId);
  const site = await fetchSiteForUser(userId);
  if (!site) return { eligibility, site: null };
  const refreshed = await refreshProofState(site, eligibility);
  return { eligibility, site: await serializeSite(refreshed) };
}

export async function saveUserSitePage(input: {
  userId: number;
  slug: string;
  title: string;
  html: string;
}): Promise<WtfUserSiteStateDto> {
  const site = await fetchSiteForUser(input.userId);
  if (!site) throw new WtfUserSiteError(404, "Claim a wtfOS site before editing pages");
  if (site.status === "suspended") throw new WtfUserSiteError(423, "This site is suspended");

  const slug = normalizeUserSiteSlug(input.slug);
  if (!slug) throw new WtfUserSiteError(400, "Invalid page slug");
  const title = input.title.trim().slice(0, 200) || (slug === WTF_USER_SITE_HOME_SLUG ? "Home" : slug);
  const html = String(input.html ?? "");

  const pages = await fetchSitePages(site.id);
  const existing = pages.find((page) => page.slug === slug);
  const namedPageCount = pages.filter((page) => page.slug !== WTF_USER_SITE_HOME_SLUG).length;
  if (!existing && slug !== WTF_USER_SITE_HOME_SLUG && namedPageCount >= WTF_USER_SITE_MAX_NAMED_PAGES) {
    throw new WtfUserSiteError(400, `User sites can have at most ${WTF_USER_SITE_MAX_NAMED_PAGES} named pages`);
  }

  const now = new Date();
  if (existing) {
    await db
      .update(wtfUserSitePages)
      .set({ title, draftHtml: html, updatedAt: now })
      .where(and(eq(wtfUserSitePages.siteId, site.id), eq(wtfUserSitePages.slug, slug)));
    await audit(site.id, input.userId, "page_updated", { slug });
  } else {
    await db.insert(wtfUserSitePages).values({
      siteId: site.id,
      slug,
      title,
      draftHtml: html,
      sortOrder: pages.length,
      createdAt: now,
      updatedAt: now,
    });
    await audit(site.id, input.userId, "page_created", { slug });
  }
  await db.update(wtfUserSites).set({ updatedAt: now }).where(eq(wtfUserSites.id, site.id));
  return getUserSiteState(input.userId);
}

export async function deleteUserSitePage(userId: number, rawSlug: string): Promise<WtfUserSiteStateDto> {
  const site = await fetchSiteForUser(userId);
  if (!site) throw new WtfUserSiteError(404, "Claim a wtfOS site before editing pages");
  if (site.status === "suspended") throw new WtfUserSiteError(423, "This site is suspended");
  const slug = normalizeUserSiteSlug(rawSlug);
  if (!slug || slug === WTF_USER_SITE_HOME_SLUG) {
    throw new WtfUserSiteError(400, "The home page cannot be deleted");
  }
  await db
    .delete(wtfUserSitePages)
    .where(and(eq(wtfUserSitePages.siteId, site.id), eq(wtfUserSitePages.slug, slug)));
  await audit(site.id, userId, "page_deleted", { slug });
  await db.update(wtfUserSites).set({ updatedAt: new Date() }).where(eq(wtfUserSites.id, site.id));
  return getUserSiteState(userId);
}

export async function updateUserSiteAssets(userId: number, mediaIds: number[]): Promise<WtfUserSiteStateDto> {
  const site = await fetchSiteForUser(userId);
  if (!site) throw new WtfUserSiteError(404, "Claim a wtfOS site before attaching media");
  if (site.status === "suspended") throw new WtfUserSiteError(423, "This site is suspended");
  const uniqueIds = [...new Set(mediaIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  let rows: MediaRow[] = [];
  if (uniqueIds.length > 0) {
    rows = await db
      .select()
      .from(userMediaLibrary)
      .where(
        and(
          eq(userMediaLibrary.ownerUserId, userId),
          isNull(userMediaLibrary.deletedAt),
          inArray(userMediaLibrary.id, uniqueIds)
        )
      );
    if (rows.length !== uniqueIds.length) {
      throw new WtfUserSiteError(400, "One or more media items are not in your media library");
    }
  }
  const total = rows.reduce((sum, item) => sum + mediaBytes(item), 0);
  if (total > WTF_USER_SITE_MAX_ASSET_BYTES) {
    throw new WtfUserSiteError(400, `Attached site assets exceed the ${assetCapLabel()} site cap`);
  }

  await db.delete(wtfUserSiteAssetRefs).where(eq(wtfUserSiteAssetRefs.siteId, site.id));
  if (uniqueIds.length > 0) {
    await db.insert(wtfUserSiteAssetRefs).values(
      uniqueIds.map((mediaId) => ({
        siteId: site.id,
        mediaId,
        createdAt: new Date(),
      }))
    );
  }
  await audit(site.id, userId, "assets_updated", { mediaIds: uniqueIds, bytes: total });
  await db.update(wtfUserSites).set({ updatedAt: new Date() }).where(eq(wtfUserSites.id, site.id));
  return getUserSiteState(userId);
}

async function latestVersionNumber(siteId: number): Promise<number> {
  const [row] = await db
    .select({ versionNumber: wtfUserSiteVersions.versionNumber })
    .from(wtfUserSiteVersions)
    .where(eq(wtfUserSiteVersions.siteId, siteId))
    .orderBy(desc(wtfUserSiteVersions.versionNumber))
    .limit(1);
  return row?.versionNumber ?? 0;
}

export async function publishUserSite(userId: number): Promise<WtfUserSiteStateDto> {
  const eligibility = await getUserSiteEligibility(userId);
  if (!eligibility.didTarget) throw new WtfUserSiteError(403, "Restore Bluesky or WTF DID proof before publishing");
  const site = await fetchSiteForUser(userId);
  if (!site) throw new WtfUserSiteError(404, "Claim a wtfOS site before publishing");
  if (site.status === "suspended") throw new WtfUserSiteError(423, "This site is suspended");

  const pages = await fetchSitePages(site.id);
  if (!pages.some((page) => page.slug === WTF_USER_SITE_HOME_SLUG)) {
    await ensureHomePage(site.id);
  }
  const refreshedPages = await fetchSitePages(site.id);
  if (refreshedPages.length > WTF_USER_SITE_MAX_TOTAL_PAGES) {
    throw new WtfUserSiteError(400, "User site page limit exceeded");
  }
  const assets = await fetchSiteAssets(site.id);
  const assetMediaIds = assets.map((item) => item.id);
  const assetBytes = assets.reduce((sum, item) => sum + mediaBytes(item), 0);
  if (assetBytes > WTF_USER_SITE_MAX_ASSET_BYTES) {
    throw new WtfUserSiteError(400, `Attached site assets exceed the ${assetCapLabel()} site cap`);
  }

  const claim = await ensureVerifiedHandleClaim({
    userId,
    accountId: eligibility.didTarget.atprotoAccountId ?? null,
    did: eligibility.didTarget.did,
    handle: site.host,
  });

  const publishedAt = new Date();
  const versionNumber = (await latestVersionNumber(site.id)) + 1;
  const pageSnapshots: ManifestPageSnapshot[] = refreshedPages.map((page) => ({
    slug: page.slug,
    title: page.title,
    html: page.draftHtml,
  }));
  const manifest = buildUserSiteManifest({
    host: site.host,
    url: siteUrl(site.host),
    didTarget: eligibility.didTarget,
    pages: pageSnapshots,
    assetMediaIds,
    versionNumber,
    publishedAt: publishedAt.toISOString(),
  });
  const digest = digestUserSiteManifest(manifest);

  const [version] = await db
    .insert(wtfUserSiteVersions)
    .values({
      siteId: site.id,
      versionNumber,
      did: eligibility.didTarget.did,
      didSource: eligibility.didTarget.source,
      digest,
      manifest,
      pages: pageSnapshots as unknown as Array<Record<string, unknown>>,
      assetMediaIds,
      publishedBy: userId,
      publishedAt,
      createdAt: publishedAt,
    })
    .returning();

  await db
    .update(wtfUserSites)
    .set({
      status: "published",
      activeDid: eligibility.didTarget.did,
      activeDidSource: eligibility.didTarget.source,
      atprotoAccountId: eligibility.didTarget.atprotoAccountId ?? null,
      wtfosIdentityId: eligibility.didTarget.wtfosIdentityId ?? null,
      atprotoHandleClaimId: claim?.id ?? null,
      publishedVersionId: version.id,
      proofGraceUntil: null,
      publishedAt,
      updatedAt: publishedAt,
    })
    .where(eq(wtfUserSites.id, site.id));

  await audit(site.id, userId, "published", {
    versionId: version.id,
    versionNumber,
    digest,
    pages: pageSnapshots.map((page) => page.slug),
    assetMediaIds,
    did: eligibility.didTarget.did,
    didSource: eligibility.didTarget.source,
  });

  await enqueueSpineRecord({
    userId,
    type: "app.wtfos.identity.site",
    record: {
      schemaVersion: 1,
      host: site.host,
      url: siteUrl(site.host),
      versionDigest: digest,
      pageSlugs: pageSnapshots.map((page) => page.slug),
      assetMediaIds,
      didTarget: {
        did: eligibility.didTarget.did,
        source: eligibility.didTarget.source,
        handle: eligibility.didTarget.handle ?? site.host,
      },
      publishedAt: publishedAt.toISOString(),
    },
    rkeyParts: [site.label, versionNumber],
    targetType: "user_wtfos_repo",
    targetDid: eligibility.didTarget.did,
    targetHandle: eligibility.didTarget.handle ?? site.host,
    targetPdsUrl: eligibility.didTarget.pdsUrl,
    wtfosIdentityId: eligibility.didTarget.wtfosIdentityId ?? null,
    sourceEventType: "wtf_user_site.published",
    sourceRefType: "wtf_user_site_version",
    sourceRefId: String(version.id),
  });

  return getUserSiteState(userId);
}

export async function rollbackUserSite(userId: number, versionId: number): Promise<WtfUserSiteStateDto> {
  const site = await fetchSiteForUser(userId);
  if (!site) throw new WtfUserSiteError(404, "Claim a wtfOS site before rolling back");
  if (site.status === "suspended") throw new WtfUserSiteError(423, "This site is suspended");
  const [version] = await db
    .select()
    .from(wtfUserSiteVersions)
    .where(and(eq(wtfUserSiteVersions.siteId, site.id), eq(wtfUserSiteVersions.id, versionId)))
    .limit(1);
  if (!version) throw new WtfUserSiteError(404, "Published version not found");

  const now = new Date();
  await db
    .update(wtfUserSites)
    .set({
      status: "published",
      publishedVersionId: version.id,
      activeDid: version.did,
      activeDidSource: version.didSource,
      publishedAt: version.publishedAt,
      updatedAt: now,
    })
    .where(eq(wtfUserSites.id, site.id));
  await audit(site.id, userId, "rolled_back", {
    versionId: version.id,
    versionNumber: version.versionNumber,
    digest: version.digest,
  });
  return getUserSiteState(userId);
}

export async function suspendUserSite(siteId: number, actorUserId: number | null, reason: string): Promise<WtfUserSiteDto> {
  const [site] = await db
    .update(wtfUserSites)
    .set({
      status: "suspended",
      suspendedAt: new Date(),
      suspendedBy: actorUserId,
      suspendedReason: reason.trim().slice(0, 2000) || "Suspended by staff",
      updatedAt: new Date(),
    })
    .where(eq(wtfUserSites.id, siteId))
    .returning();
  if (!site) throw new WtfUserSiteError(404, "Site not found");
  await audit(site.id, actorUserId, "suspended", { reason: site.suspendedReason });
  return serializeSite(site);
}

export async function restoreUserSite(siteId: number, actorUserId: number | null): Promise<WtfUserSiteDto> {
  const [site] = await db
    .update(wtfUserSites)
    .set({
      status: sql`CASE WHEN ${wtfUserSites.publishedVersionId} IS NULL THEN 'draft'::wtf_user_site_status ELSE 'published'::wtf_user_site_status END`,
      suspendedAt: null,
      suspendedBy: null,
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(wtfUserSites.id, siteId))
    .returning();
  if (!site) throw new WtfUserSiteError(404, "Site not found");
  await audit(site.id, actorUserId, "restored");
  return serializeSite(site);
}

export async function listAdminUserSites(limit = 100): Promise<WtfUserSiteDto[]> {
  const sites = await db
    .select()
    .from(wtfUserSites)
    .orderBy(desc(wtfUserSites.updatedAt))
    .limit(Math.max(1, Math.min(limit, 250)));
  return Promise.all(sites.map((site) => serializeSite(site)));
}

export async function isHostRegisteredForTls(host: string): Promise<boolean> {
  try {
    const [site] = await db
      .select({ id: wtfUserSites.id })
      .from(wtfUserSites)
      .where(and(eq(wtfUserSites.host, host.toLowerCase()), sql`${wtfUserSites.status} <> 'suspended'`))
      .limit(1);
    return Boolean(site);
  } catch (err) {
    if (missingRelation(err)) return false;
    throw err;
  }
}

export async function resolveDidForHost(host: string): Promise<{ did: string; status: SiteRow["status"] } | null> {
  const [site] = await db
    .select()
    .from(wtfUserSites)
    .where(eq(wtfUserSites.host, host.toLowerCase()))
    .limit(1);
  if (!site?.activeDid) return null;
  return { did: site.activeDid, status: site.status };
}

export async function redirectUrlForUnpublishedHost(host: string): Promise<string | null> {
  const [site] = await db
    .select({ label: wtfUserSites.label })
    .from(wtfUserSites)
    .where(eq(wtfUserSites.host, host.toLowerCase()))
    .limit(1);
  return site ? publicProfileUrl(site.label) : null;
}

export async function resolvePublishedPage(input: {
  host: string;
  pathname: string;
}): Promise<
  | { kind: "missing" }
  | { kind: "redirect"; url: string }
  | { kind: "suspended"; reason: string | null }
  | { kind: "not_found" }
  | { kind: "page"; html: string; title: string; digest: string }
> {
  const [site] = await db
    .select()
    .from(wtfUserSites)
    .where(eq(wtfUserSites.host, input.host.toLowerCase()))
    .limit(1);
  if (!site) return { kind: "missing" };
  if (site.status === "suspended") return { kind: "suspended", reason: site.suspendedReason ?? null };
  if (!site.publishedVersionId || site.status !== "published") {
    return { kind: "redirect", url: publicProfileUrl(site.label) };
  }
  const slug = pageSlugForRequestPath(input.pathname);
  if (!slug) return { kind: "not_found" };
  const [version] = await db
    .select()
    .from(wtfUserSiteVersions)
    .where(and(eq(wtfUserSiteVersions.siteId, site.id), eq(wtfUserSiteVersions.id, site.publishedVersionId)))
    .limit(1);
  if (!version) return { kind: "redirect", url: publicProfileUrl(site.label) };
  const pages = Array.isArray(version.pages) ? version.pages : [];
  const page = pages.find(
    (candidate) => candidate && typeof candidate === "object" && String((candidate as any).slug) === slug
  ) as { title?: unknown; html?: unknown } | undefined;
  if (!page) return { kind: "not_found" };
  return {
    kind: "page",
    html: String(page.html ?? ""),
    title: String(page.title ?? slug),
    digest: version.digest,
  };
}

export async function resolvePublishedAsset(input: {
  host: string;
  mediaId: number;
}): Promise<MediaRow | null> {
  const [site] = await db
    .select()
    .from(wtfUserSites)
    .where(eq(wtfUserSites.host, input.host.toLowerCase()))
    .limit(1);
  if (!site || site.status !== "published" || !site.publishedVersionId) return null;
  const [version] = await db
    .select()
    .from(wtfUserSiteVersions)
    .where(and(eq(wtfUserSiteVersions.siteId, site.id), eq(wtfUserSiteVersions.id, site.publishedVersionId)))
    .limit(1);
  const ids = Array.isArray(version?.assetMediaIds) ? version.assetMediaIds : [];
  if (!ids.includes(input.mediaId)) return null;
  const [media] = await db
    .select()
    .from(userMediaLibrary)
    .where(and(eq(userMediaLibrary.id, input.mediaId), isNull(userMediaLibrary.deletedAt)))
    .limit(1);
  return media ?? null;
}
