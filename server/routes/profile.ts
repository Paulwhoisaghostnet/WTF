import { Router } from "express";
import { db } from "../db";
import {
  users,
  atprotoAccounts,
  userWallets,
  walletHoldings,
  tokenMetadata,
  collections,
  collectionItems,
  xpEvents,
  marketplaceListings,
  userMediaLibrary,
  dmConversations,
  dmConversationParticipants,
  dmMessages,
} from "@shared/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { hasPermission } from "../lib/permissions";
import { formatWtf } from "@shared/types";
import { sanitizeThumbnailUrl } from "../lib/thumbnail-url";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../lib/tezos-identity";
import {
  buildConsoleTokenProvenanceMap,
  mergeConsoleProvenanceIntoMetadata,
} from "../features/console/provenance";
import { serveStoredMediaFile } from "../lib/storage/media-file-serve";
import { ingestSystemEvent } from "../challenges/events/ingest";
import type { SystemEventType } from "../challenges/events/types";
import {
  normalizeProfilePfpTokenReference,
  sanitizeProfilePfpImageUrl,
  type ProfilePfpTokenReference,
} from "../features/profile/pfp-policy";

const router = Router();

function emitProfileEvent(input: {
  eventId: string;
  eventType: SystemEventType;
  userId: number;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventId: input.eventId,
    eventType: input.eventType,
    userId: input.userId,
    source: "profile",
    sourceModule: "profile",
    rawRefType: "user",
    rawRefId: input.userId,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[profile] failed to emit profile event", err));
}

function emitPublicProfileEvent(input: {
  eventType: SystemEventType;
  viewerUserId?: number | null;
  targetUserId: number;
  targetUsername: string;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventId: `${input.eventType}:${input.targetUserId}:${input.viewerUserId ?? "public"}:${Date.now()}`,
    eventType: input.eventType,
    userId: input.viewerUserId ?? null,
    source: "profile",
    sourceModule: "public-profile",
    rawRefType: "user",
    rawRefId: input.targetUserId,
    metadata: {
      targetUserId: input.targetUserId,
      targetUsername: input.targetUsername,
      ...(input.metadata || {}),
    },
  }).catch((err) => console.warn("[profile] failed to emit public profile event", err));
}

function normalizeMediaUri(input: unknown): string | null {
  return sanitizeThumbnailUrl(input);
}

function resolveTokenThumbnail(
  tokenThumbnail: string | null | undefined,
  metadata: unknown
): string | null {
  const meta =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};

  return (
    normalizeMediaUri(tokenThumbnail || null) ||
    normalizeMediaUri(meta.thumbnailUri) ||
    normalizeMediaUri(meta.displayUri) ||
    normalizeMediaUri(meta.artifactUri) ||
    normalizeMediaUri(meta.image) ||
    null
  );
}

function avatarMediaPlaybackUrl(mediaId: number): string {
  return `/api/profile/avatar-media/${mediaId}/file`;
}

function isGameSafeAvatarMime(mimeType: string | null | undefined): boolean {
  const mime = String(mimeType || "").toLowerCase();
  return (
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/webp" ||
    mime === "image/gif"
  );
}

async function hasPositivePfpHolding(
  userId: number,
  token: ProfilePfpTokenReference,
): Promise<boolean> {
  const [holding] = await db
    .select({ id: walletHoldings.id })
    .from(walletHoldings)
    .where(
      and(
        eq(walletHoldings.userId, userId),
        eq(walletHoldings.tokenContract, token.tokenContract),
        eq(walletHoldings.tokenId, token.tokenId),
        sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`,
      ),
    )
    .limit(1);
  return Boolean(holding);
}

/* ── GET /api/profile/social  ────────────────────────────────────────────── */
router.get("/api/profile/social", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const [row] = await db
      .select({
        email: users.email,
        emailPublic: users.emailPublic,
        twitterHandle: users.twitterHandle,
        twitterVerified: users.twitterVerified,
        twitterPublic: users.twitterPublic,
        discordHandle: users.discordHandle,
        discordVerified: users.discordVerified,
        discordPublic: users.discordPublic,
        pfpTokenContract: users.pfpTokenContract,
        pfpTokenId: users.pfpTokenId,
        pfpImageUrl: users.pfpImageUrl,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!row) return res.status(404).json({ error: "User not found" });
    const [atproto] = await db
      .select({
        atprotoDid: atprotoAccounts.did,
        atprotoHandle: atprotoAccounts.handle,
        atprotoDisplayName: atprotoAccounts.displayName,
        atprotoAvatarUrl: atprotoAccounts.avatarUrl,
      })
      .from(atprotoAccounts)
      .where(and(eq(atprotoAccounts.userId, user.id), sql`${atprotoAccounts.disconnectedAt} is null`))
      .limit(1);

    res.json({
      ...row,
      atprotoDid: atproto?.atprotoDid ?? null,
      atprotoHandle: atproto?.atprotoHandle ?? null,
      atprotoDisplayName: atproto?.atprotoDisplayName ?? null,
      atprotoAvatarUrl: atproto?.atprotoAvatarUrl ?? null,
    });
  } catch (err) {
    console.error("GET /api/profile/social error:", err);
    res.status(500).json({ error: "Failed to fetch social profile" });
  }
});

/* ── GET /api/profile/account  ───────────────────────────────────────────── */
router.get("/api/profile/account", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        experiencePoints: users.experiencePoints,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row) return res.status(404).json({ error: "User not found" });
    res.json(row);
  } catch (err) {
    console.error("GET /api/profile/account error:", err);
    res.status(500).json({ error: "Failed to fetch profile account" });
  }
});

/* ── PUT /api/profile/account  ──────────────────────────────────────────── */
router.put("/api/profile/account", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const rawDisplayName = typeof req.body?.displayName === "string" ? req.body.displayName : "";
    const displayName = rawDisplayName.trim();

    if (displayName.length > 100) {
      return res.status(400).json({ error: "Display name must be 100 characters or less" });
    }

    const [updated] = await db
      .update(users)
      .set({
        displayName: displayName || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        experiencePoints: users.experiencePoints,
        createdAt: users.createdAt,
      });

    if (!updated) return res.status(404).json({ error: "User not found" });
    emitProfileEvent({
      eventId: `profile.updated:account:${user.id}:${Date.now()}`,
      eventType: "profile.updated",
      userId: user.id,
      metadata: {
        fields: ["displayName"],
        hasDisplayName: Boolean(updated.displayName),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/profile/account error:", err);
    res.status(500).json({ error: "Failed to update profile account" });
  }
});

/* ── PUT /api/profile/social  ────────────────────────────────────────────── */
router.put("/api/profile/social", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const {
      twitterHandle,
      twitterPublic,
      discordHandle,
      discordPublic,
      emailPublic,
    } = req.body;

    const [current] = await db
      .select({
        twitterHandle: users.twitterHandle,
        discordHandle: users.discordHandle,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!current) return res.status(404).json({ error: "User not found" });

    const update: Record<string, any> = { updatedAt: new Date() };

    if (typeof twitterHandle === "string") {
      const nextTwitter = twitterHandle.trim().replace(/^@/, "").toLowerCase();
      const prevTwitter = (current.twitterHandle || "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
      update.twitterHandle = nextTwitter || null;
      if (nextTwitter !== prevTwitter) {
        update.twitterVerified = false;
        update.twitterId = null;
        update.twitterOauthToken = null;
        update.twitterOauthTokenSecret = null;
        update.twitterOauth2AccessToken = null;
        update.twitterOauth2RefreshToken = null;
        update.twitterOauth2Scopes = null;
        update.twitterOauth2ExpiresAt = null;
      }
    }
    if (typeof twitterPublic === "boolean") update.twitterPublic = twitterPublic;
    if (typeof discordHandle === "string") {
      const nextDiscord = discordHandle.trim();
      const prevDiscord = (current.discordHandle || "").trim();
      update.discordHandle = nextDiscord || null;
      if (nextDiscord !== prevDiscord) {
        update.discordVerified = false;
        update.discordId = null;
      }
    }
    if (typeof discordPublic === "boolean") update.discordPublic = discordPublic;
    if (typeof emailPublic === "boolean") update.emailPublic = emailPublic;

    const [updated] = await db
      .update(users)
      .set(update)
      .where(eq(users.id, user.id))
      .returning();

    res.json({
      email: updated.email,
      emailPublic: updated.emailPublic,
      twitterHandle: updated.twitterHandle,
      twitterVerified: updated.twitterVerified,
      twitterPublic: updated.twitterPublic,
      discordHandle: updated.discordHandle,
      discordVerified: updated.discordVerified,
      discordPublic: updated.discordPublic,
    });
    const visibilityChanged =
      typeof twitterPublic === "boolean" ||
      typeof discordPublic === "boolean" ||
      typeof emailPublic === "boolean";
    emitProfileEvent({
      eventId: `profile.updated:social:${user.id}:${Date.now()}`,
      eventType: "profile.updated",
      userId: user.id,
      metadata: {
        fields: Object.keys(update).filter((key) => key !== "updatedAt"),
        twitterHandleChanged: typeof twitterHandle === "string",
        discordHandleChanged: typeof discordHandle === "string",
      },
    });
    if (visibilityChanged) {
      emitProfileEvent({
        eventId: `profile.public_visibility.updated:${user.id}:${Date.now()}`,
        eventType: "profile.public_visibility.updated",
        userId: user.id,
        metadata: {
          emailPublic: updated.emailPublic,
          twitterPublic: updated.twitterPublic,
          discordPublic: updated.discordPublic,
        },
      });
    }
  } catch (err) {
    console.error("PUT /api/profile/social error:", err);
    res.status(500).json({ error: "Failed to update social profile" });
  }
});

/* ── DELETE /api/profile/social/:provider ───────────────────────────────── */
router.delete("/api/profile/social/:provider", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const provider = String(req.params.provider || "").toLowerCase();
    const update: Record<string, any> = { updatedAt: new Date() };

    if (provider === "twitter") {
      update.twitterId = null;
      update.twitterHandle = null;
      update.twitterVerified = false;
      update.twitterPublic = false;
      update.twitterOauthToken = null;
      update.twitterOauthTokenSecret = null;
      update.twitterOauth2AccessToken = null;
      update.twitterOauth2RefreshToken = null;
      update.twitterOauth2Scopes = null;
      update.twitterOauth2ExpiresAt = null;
    } else if (provider === "discord") {
      update.discordId = null;
      update.discordHandle = null;
      update.discordVerified = false;
      update.discordPublic = false;
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    const [updated] = await db
      .update(users)
      .set(update)
      .where(eq(users.id, user.id))
      .returning({
        email: users.email,
        emailPublic: users.emailPublic,
        twitterHandle: users.twitterHandle,
        twitterVerified: users.twitterVerified,
        twitterPublic: users.twitterPublic,
        discordHandle: users.discordHandle,
        discordVerified: users.discordVerified,
        discordPublic: users.discordPublic,
      });

    if (!updated) return res.status(404).json({ error: "User not found" });
    emitProfileEvent({
      eventId: `profile.social.unlinked:${provider}:${user.id}:${Date.now()}`,
      eventType: "profile.social.unlinked",
      userId: user.id,
      metadata: { provider },
    });
    emitProfileEvent({
      eventId: `profile.public_visibility.updated:${provider}:${user.id}:${Date.now()}`,
      eventType: "profile.public_visibility.updated",
      userId: user.id,
      metadata: {
        emailPublic: updated.emailPublic,
        twitterPublic: updated.twitterPublic,
        discordPublic: updated.discordPublic,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("DELETE /api/profile/social/:provider error:", err);
    res.status(500).json({ error: "Failed to disconnect social account" });
  }
});

/* ── PUT /api/profile/pfp  ───────────────────────────────────────────────── */
router.put("/api/profile/pfp", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { tokenContract, tokenId, imageUrl } = req.body;

    const safeImageUrl = sanitizeProfilePfpImageUrl(imageUrl);
    if (!safeImageUrl) {
      return res.status(400).json({ error: "Use an approved HTTPS or IPFS profile image URL" });
    }
    const tokenReference = normalizeProfilePfpTokenReference(tokenContract, tokenId);
    if (!tokenReference.ok) {
      return res.status(400).json({ error: tokenReference.error });
    }
    if (
      tokenReference.value &&
      !(await hasPositivePfpHolding(user.id, tokenReference.value))
    ) {
      return res.status(403).json({ error: "You must hold this token before using it as your PFP" });
    }

    const [updated] = await db
      .update(users)
      .set({
        pfpTokenContract: tokenReference.value?.tokenContract || null,
        pfpTokenId: tokenReference.value?.tokenId || null,
        pfpImageUrl: safeImageUrl,
        avatarUrl: safeImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    res.json({
      pfpTokenContract: updated.pfpTokenContract,
      pfpTokenId: updated.pfpTokenId,
      pfpImageUrl: updated.pfpImageUrl,
    });
    emitProfileEvent({
      eventId: `profile.updated:pfp:${user.id}:${Date.now()}`,
      eventType: "profile.updated",
      userId: user.id,
      metadata: {
        fields: ["pfp"],
        source: tokenReference.value ? "token" : "url",
        tokenContract: tokenReference.value?.tokenContract || null,
        tokenId: tokenReference.value?.tokenId || null,
      },
    });
  } catch (err) {
    console.error("PUT /api/profile/pfp error:", err);
    res.status(500).json({ error: "Failed to update PFP" });
  }
});

/* ── DELETE /api/profile/pfp  ────────────────────────────────────────────── */
router.delete("/api/profile/pfp", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    await db
      .update(users)
      .set({
        pfpTokenContract: null,
        pfpTokenId: null,
        pfpImageUrl: null,
        avatarUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    emitProfileEvent({
      eventId: `profile.updated:pfp-cleared:${user.id}:${Date.now()}`,
      eventType: "profile.updated",
      userId: user.id,
      metadata: {
        fields: ["pfp"],
        action: "cleared",
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/profile/pfp error:", err);
    res.status(500).json({ error: "Failed to remove PFP" });
  }
});

router.put("/api/profile/avatar-media", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const mediaId = Number(req.body?.mediaId);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).json({ error: "Valid mediaId is required" });
    }
    const tokenReference = normalizeProfilePfpTokenReference(
      req.body?.tokenContract,
      req.body?.tokenId,
    );
    if (!tokenReference.ok) {
      return res.status(400).json({ error: tokenReference.error });
    }
    if (
      tokenReference.value &&
      !(await hasPositivePfpHolding(user.id, tokenReference.value))
    ) {
      return res.status(403).json({ error: "You must hold this token before using it as your PFP" });
    }

    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        ownerUserId: userMediaLibrary.ownerUserId,
        sourceType: userMediaLibrary.sourceType,
        mimeType: userMediaLibrary.mimeType,
        mediaCategory: userMediaLibrary.mediaCategory,
        fileSizeBytes: userMediaLibrary.fileSizeBytes,
        status: userMediaLibrary.status,
      })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.id, mediaId))
      .limit(1);

    if (!item || item.ownerUserId !== user.id || item.sourceType !== "upload") {
      return res.status(404).json({ error: "Uploaded avatar media not found" });
    }
    if (!isGameSafeAvatarMime(item.mimeType) || item.mediaCategory !== "image") {
      return res.status(415).json({ error: "Profile avatar media must be a PNG, JPEG, WEBP, or GIF image" });
    }
    if (Number(item.fileSizeBytes || 0) > 2 * 1024 * 1024) {
      return res.status(413).json({ error: "Profile avatar media must be 2MB or smaller" });
    }
    if (item.status && item.status !== "ready") {
      return res.status(400).json({ error: "Avatar media is not ready yet" });
    }

    const imageUrl = avatarMediaPlaybackUrl(item.id);
    const [updated] = await db
      .update(users)
      .set({
        pfpTokenContract: tokenReference.value?.tokenContract || null,
        pfpTokenId: tokenReference.value?.tokenId || null,
        pfpImageUrl: imageUrl,
        avatarUrl: imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({
        pfpTokenContract: users.pfpTokenContract,
        pfpTokenId: users.pfpTokenId,
        pfpImageUrl: users.pfpImageUrl,
        avatarUrl: users.avatarUrl,
      });

    res.json({
      pfpTokenContract: updated.pfpTokenContract,
      pfpTokenId: updated.pfpTokenId,
      pfpImageUrl: updated.pfpImageUrl,
      avatarUrl: updated.avatarUrl,
      mediaId: item.id,
    });
    emitProfileEvent({
      eventId: `profile.updated:avatar-media:${user.id}:${item.id}:${Date.now()}`,
      eventType: "profile.updated",
      userId: user.id,
      metadata: {
        fields: ["avatarMedia"],
        mediaId: item.id,
        mimeType: item.mimeType,
      },
    });
  } catch (err) {
    console.error("PUT /api/profile/avatar-media error:", err);
    res.status(500).json({ error: "Failed to set uploaded avatar" });
  }
});

router.get("/api/profile/avatar-media/:id/file", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      return res.status(400).json({ error: "Invalid avatar media id" });
    }
    const expectedUrl = avatarMediaPlaybackUrl(mediaId);
    const [item] = await db
      .select({
        id: userMediaLibrary.id,
        ownerUserId: userMediaLibrary.ownerUserId,
        mimeType: userMediaLibrary.mimeType,
        sourceUrl: userMediaLibrary.sourceUrl,
        fileData: userMediaLibrary.fileData,
        sourceType: userMediaLibrary.sourceType,
        objectStorageBucket: userMediaLibrary.objectStorageBucket,
        objectStorageKey: userMediaLibrary.objectStorageKey,
        safeFilename: userMediaLibrary.safeFilename,
        hotCachePath: userMediaLibrary.hotCachePath,
        avatarUrl: users.avatarUrl,
      })
      .from(userMediaLibrary)
      .innerJoin(users, eq(users.id, userMediaLibrary.ownerUserId))
      .where(and(eq(userMediaLibrary.id, mediaId), eq(users.avatarUrl, expectedUrl)))
      .limit(1);

    if (!item || item.sourceType !== "upload" || !isGameSafeAvatarMime(item.mimeType)) {
      return res.status(404).json({ error: "Profile avatar not found" });
    }

    const served = await serveStoredMediaFile(req, res, item);
    if (!served) return res.status(404).json({ error: "Profile avatar file not found" });
  } catch (err) {
    console.error("GET /api/profile/avatar-media/:id/file error:", err);
    res.status(500).json({ error: "Failed to serve profile avatar" });
  }
});

/* ── GET /api/profile/pfp-candidates ─────────────────────────────────────── */
router.get("/api/profile/pfp-candidates", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();

    const baseWhere = [
      eq(walletHoldings.userId, user.id),
      sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`,
    ];

    if (search) {
      const pattern = `%${search}%`;
      baseWhere.push(
        sql`(
          COALESCE(${tokenMetadata.name}, '') ILIKE ${pattern}
          OR ${walletHoldings.tokenContract} ILIKE ${pattern}
          OR COALESCE(${tokenMetadata.raw}::text, '') ILIKE ${pattern}
        )`,
      );
    }

    const whereClause = and(...baseWhere);

    const [countRow] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(walletHoldings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(whereClause);

    const rows = await db
      .select({
        id: walletHoldings.id,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        creatorAddress: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
      })
      .from(walletHoldings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(whereClause)
      .orderBy(
        sql`CASE WHEN COALESCE(${tokenMetadata.raw}::text, '') ILIKE '%"pfp"%' THEN 0 ELSE 1 END`,
        tokenMetadata.name,
      )
      .limit(limit)
      .offset(offset);

    const tokenIdentities = await resolveTokenDisplayIdentities(
      rows.map((row) => ({
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        tokenName: row.tokenName,
        metadata: row.metadata,
        creatorAddress: row.creatorAddress,
      }))
    );

    res.json({
      items: rows.map((row) => {
        const identity = tokenIdentities.get(
          tokenIdentityKey(row.tokenContract, row.tokenId)
        );
        return {
          ...row,
          creatorName: identity?.creatorName ?? null,
          creatorAddress: identity?.creatorAddress ?? row.creatorAddress,
          collectionName: identity?.collectionName ?? null,
        };
      }),
      total: Number(countRow?.total ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    console.error("GET /api/profile/pfp-candidates error:", err);
    res.status(500).json({ error: "Failed to fetch PFP candidates" });
  }
});

/* ── XP history ─────────────────────────────────────────────────────────── */
router.get("/api/profile/xp", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 300));

    const [userRow] = await db
      .select({
        experiencePoints: users.experiencePoints,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const events = await db
      .select()
      .from(xpEvents)
      .where(eq(xpEvents.userId, user.id))
      .orderBy(sql`${xpEvents.createdAt} DESC`)
      .limit(limit);

    res.json({
      total: userRow?.experiencePoints ?? 0,
      events,
    });
  } catch (err) {
    console.error("GET /api/profile/xp error:", err);
    res.status(500).json({ error: "Failed to fetch XP history" });
  }
});

/* ── Public profile view ─────────────────────────────────────────────────── */
router.get("/api/users/:username", async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    if (!row) return res.status(404).json({ error: "User not found" });

    const viewer = req.user as any;
    const isOwner = viewer && viewer.id === row.id;
    const isAdmin =
      viewer && (await hasPermission(viewer.role, "manage_users"));

    const profile: Record<string, any> = {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      experiencePoints: row.experiencePoints,
      bio: row.bio,
      pfpImageUrl: row.pfpImageUrl,
      createdAt: row.createdAt,
    };

    if (isOwner || isAdmin) {
      profile.email = row.email;
      profile.emailPublic = row.emailPublic;
      profile.twitterHandle = row.twitterHandle;
      profile.twitterVerified = row.twitterVerified;
      profile.twitterPublic = row.twitterPublic;
      profile.discordHandle = row.discordHandle;
      profile.discordVerified = row.discordVerified;
      profile.discordPublic = row.discordPublic;
    } else {
      if (row.emailPublic) profile.email = row.email;
      if (row.twitterPublic) {
        profile.twitterHandle = row.twitterHandle;
        profile.twitterVerified = row.twitterVerified;
      }
      if (row.discordPublic) {
        profile.discordHandle = row.discordHandle;
        profile.discordVerified = row.discordVerified;
      }
    }

    const [atproto] = await db
      .select({
        did: atprotoAccounts.did,
        handle: atprotoAccounts.handle,
        displayName: atprotoAccounts.displayName,
        avatarUrl: atprotoAccounts.avatarUrl,
      })
      .from(atprotoAccounts)
      .where(and(eq(atprotoAccounts.userId, row.id), sql`${atprotoAccounts.disconnectedAt} is null`))
      .limit(1);
    if (atproto) {
      profile.atprotoDid = atproto.did;
      profile.atprotoHandle = atproto.handle;
      profile.atprotoDisplayName = atproto.displayName;
      profile.atprotoAvatarUrl = atproto.avatarUrl;
    }

    const walletRows = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, row.id));

    profile.wallets = walletRows.map((w) => w.walletAddress);

    emitPublicProfileEvent({
      eventType: "profile.public.viewed",
      viewerUserId: viewer?.id ?? null,
      targetUserId: row.id,
      targetUsername: row.username,
      metadata: {
        isOwner: Boolean(isOwner),
        isAdmin: Boolean(isAdmin),
        walletCount: walletRows.length,
        twitterVisible: Boolean(isOwner || isAdmin || row.twitterPublic),
        discordVisible: Boolean(isOwner || isAdmin || row.discordPublic),
        emailVisible: Boolean(isOwner || isAdmin || row.emailPublic),
      },
    });
    res.json(profile);
  } catch (err) {
    console.error("GET /api/users/:username error:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

/* ── GET /api/users/:username/trade-board ──────────────────────────────── */
router.get("/api/users/:username/trade-board", async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (!user) return res.status(404).json({ error: "User not found" });

    const walletRows = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));
    const wallets = walletRows.map((w) => w.walletAddress);
    if (wallets.length === 0) return res.json([]);

    const rows = await db
      .select({
        id: walletHoldings.id,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        balance: walletHoldings.balance,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        creatorAddress: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
        tradeBoardQuantity: collectionItems.quantity,
      })
      .from(walletHoldings)
      .innerJoin(
        collectionItems,
        and(
          eq(collectionItems.tokenContract, walletHoldings.tokenContract),
          eq(collectionItems.tokenId, walletHoldings.tokenId)
        )
      )
      .innerJoin(
        collections,
        and(
          eq(collections.id, collectionItems.collectionId),
          eq(collections.userId, user.id),
          eq(collections.type, "trade_board_listing")
        )
      )
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(
        and(
          inArray(walletHoldings.walletAddress, wallets),
          sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
        )
      );
    const tokenIdentities = await resolveTokenDisplayIdentities(
      rows.map((r) => ({
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: r.tokenName,
        metadata: r.metadata,
        creatorAddress: r.creatorAddress,
      }))
    );
    const provenanceByToken = await buildConsoleTokenProvenanceMap(
      rows.map((r) => ({
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: r.tokenName,
        metadata: r.metadata,
        source: "tezos-token",
      }))
    );

    res.json(
      rows.map((r) => {
        const identity = tokenIdentities.get(
          tokenIdentityKey(r.tokenContract, r.tokenId)
        );
        const provenance =
          provenanceByToken.get(tokenIdentityKey(r.tokenContract, r.tokenId)) ?? null;
        return {
          id: r.id,
          tokenContract: r.tokenContract,
          tokenId: r.tokenId,
          tokenName: (r.metadata as any)?.name || r.tokenName || `#${r.tokenId}`,
          thumbnail: resolveTokenThumbnail(r.tokenThumbnail, r.metadata),
          balance: r.balance,
          metadata: mergeConsoleProvenanceIntoMetadata(r.metadata, provenance),
          provenance,
          creatorName: identity?.creatorName ?? null,
          creatorAddress: identity?.creatorAddress ?? r.creatorAddress,
          collectionName: identity?.collectionName ?? null,
          tradeBoardQuantity: r.tradeBoardQuantity,
        };
      })
    );
  } catch (err) {
    console.error("GET /api/users/:username/trade-board error:", err);
    res.status(500).json({ error: "Failed to fetch trade board" });
  }
});

/* ── GET /api/users/:username/listings ─────────────────────────────────── */
router.get("/api/users/:username/listings", async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (!user) return res.status(404).json({ error: "User not found" });

    const rows = await db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.sellerUserId, user.id),
          eq(marketplaceListings.status, "active")
        )
      )
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(100);

    res.json(
      rows.map((r) => ({
        id: r.id,
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: r.tokenName,
        thumbnail: r.tokenThumbnail,
        amount: r.amount,
        priceWtf: r.priceWtf,
        priceFormatted: formatWtf(r.priceWtf),
        listingType: r.listingType,
        status: r.status,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("GET /api/users/:username/listings error:", err);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

/* ── GET /api/users/:username/activity ──────────────────────────────────── */
router.get("/api/users/:username/activity", async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (!user) return res.status(404).json({ error: "User not found" });

    const rows = await db
      .select({
        id: xpEvents.id,
        amount: xpEvents.amount,
        reason: xpEvents.reason,
        createdAt: xpEvents.createdAt,
      })
      .from(xpEvents)
      .where(eq(xpEvents.userId, user.id))
      .orderBy(desc(xpEvents.createdAt))
      .limit(50);

    res.json(rows);
  } catch (err) {
    console.error("GET /api/users/:username/activity error:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/* ── GET /api/users/:username/dm  (requires auth) ─────────────────────── */
router.get("/api/users/:username/dm", isAuthenticated, async (req, res) => {
  try {
    const viewer = req.user as any;
    const username = String(req.params.username || "").toLowerCase();

    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === viewer.id) {
      emitPublicProfileEvent({
        eventType: "profile.dm_lookup.opened",
        viewerUserId: viewer.id,
        targetUserId: target.id,
        targetUsername: username,
        metadata: {
          result: "self",
          hasConversation: false,
          messageCount: 0,
        },
      });
      return res.json({ conversationId: null, messages: [] });
    }

    const viewerConversations = await db
      .select({ conversationId: dmConversationParticipants.conversationId })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, viewer.id));

    const viewerConvIds = viewerConversations.map((c) => c.conversationId);
    if (viewerConvIds.length === 0) {
      emitPublicProfileEvent({
        eventType: "profile.dm_lookup.opened",
        viewerUserId: viewer.id,
        targetUserId: target.id,
        targetUsername: username,
        metadata: {
          result: "no_viewer_conversations",
          hasConversation: false,
          messageCount: 0,
        },
      });
      return res.json({ conversationId: null, messages: [] });
    }

    const targetParticipation = await db
      .select({ conversationId: dmConversationParticipants.conversationId })
      .from(dmConversationParticipants)
      .where(
        and(
          eq(dmConversationParticipants.userId, target.id),
          inArray(dmConversationParticipants.conversationId, viewerConvIds)
        )
      );

    if (targetParticipation.length === 0) {
      emitPublicProfileEvent({
        eventType: "profile.dm_lookup.opened",
        viewerUserId: viewer.id,
        targetUserId: target.id,
        targetUsername: username,
        metadata: {
          result: "not_started",
          hasConversation: false,
          messageCount: 0,
        },
      });
      return res.json({ conversationId: null, messages: [] });
    }

    const convId = targetParticipation[0].conversationId;

    const messages = await db
      .select({
        id: dmMessages.id,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        createdAt: dmMessages.createdAt,
        username: users.username,
        displayName: users.displayName,
      })
      .from(dmMessages)
      .leftJoin(users, eq(dmMessages.senderId, users.id))
      .where(eq(dmMessages.conversationId, convId))
      .orderBy(dmMessages.createdAt)
      .limit(100);

    emitPublicProfileEvent({
      eventType: "profile.dm_lookup.opened",
      viewerUserId: viewer.id,
      targetUserId: target.id,
      targetUsername: username,
      metadata: {
        result: "opened",
        hasConversation: true,
        messageCount: messages.length,
      },
    });
    res.json({ conversationId: convId, messages });
  } catch (err) {
    console.error("GET /api/users/:username/dm error:", err);
    res.status(500).json({ error: "Failed to fetch DM history" });
  }
});

export default router;
