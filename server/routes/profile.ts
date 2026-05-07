import { Router } from "express";
import { db } from "../db";
import {
  users,
  userWallets,
  walletHoldings,
  tokenMetadata,
  collections,
  collectionItems,
  xpEvents,
  marketplaceListings,
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

const router = Router();

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
    res.json(row);
  } catch (err) {
    console.error("GET /api/profile/social error:", err);
    res.status(500).json({ error: "Failed to fetch social profile" });
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

    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const [updated] = await db
      .update(users)
      .set({
        pfpTokenContract: tokenContract || null,
        pfpTokenId: tokenId != null ? String(tokenId) : null,
        pfpImageUrl: imageUrl,
        avatarUrl: imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    res.json({
      pfpTokenContract: updated.pfpTokenContract,
      pfpTokenId: updated.pfpTokenId,
      pfpImageUrl: updated.pfpImageUrl,
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
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/profile/pfp error:", err);
    res.status(500).json({ error: "Failed to remove PFP" });
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

    const walletRows = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, row.id));

    profile.wallets = walletRows.map((w) => w.walletAddress);

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
    if (target.id === viewer.id) return res.json({ conversationId: null, messages: [] });

    const viewerConversations = await db
      .select({ conversationId: dmConversationParticipants.conversationId })
      .from(dmConversationParticipants)
      .where(eq(dmConversationParticipants.userId, viewer.id));

    const viewerConvIds = viewerConversations.map((c) => c.conversationId);
    if (viewerConvIds.length === 0)
      return res.json({ conversationId: null, messages: [] });

    const targetParticipation = await db
      .select({ conversationId: dmConversationParticipants.conversationId })
      .from(dmConversationParticipants)
      .where(
        and(
          eq(dmConversationParticipants.userId, target.id),
          inArray(dmConversationParticipants.conversationId, viewerConvIds)
        )
      );

    if (targetParticipation.length === 0)
      return res.json({ conversationId: null, messages: [] });

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

    res.json({ conversationId: convId, messages });
  } catch (err) {
    console.error("GET /api/users/:username/dm error:", err);
    res.status(500).json({ error: "Failed to fetch DM history" });
  }
});

export default router;
