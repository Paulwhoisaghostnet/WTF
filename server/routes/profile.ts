import { Router } from "express";
import { db } from "../db";
import {
  users,
  userWallets,
  userOwnedTokens,
  xpEvents,
  marketplaceListings,
  dmConversations,
  dmConversationParticipants,
  dmMessages,
} from "@shared/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { formatWtf } from "@shared/types";

const router = Router();

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

    const update: Record<string, any> = { updatedAt: new Date() };

    if (typeof twitterHandle === "string")
      update.twitterHandle = twitterHandle.trim().replace(/^@/, "") || null;
    if (typeof twitterPublic === "boolean") update.twitterPublic = twitterPublic;
    if (typeof discordHandle === "string")
      update.discordHandle = discordHandle.trim() || null;
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
      eq(userOwnedTokens.userId, user.id),
      sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`,
    ];

    if (search) {
      const pattern = `%${search}%`;
      baseWhere.push(
        sql`(
          ${userOwnedTokens.tokenName} ILIKE ${pattern}
          OR ${userOwnedTokens.tokenContract} ILIKE ${pattern}
          OR ${userOwnedTokens.creatorAddress} ILIKE ${pattern}
          OR ${userOwnedTokens.metadata}::text ILIKE ${pattern}
        )`,
      );
    }

    const whereClause = and(...baseWhere);

    const [countRow] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(userOwnedTokens)
      .where(whereClause);

    const rows = await db
      .select({
        id: userOwnedTokens.id,
        tokenContract: userOwnedTokens.tokenContract,
        tokenId: userOwnedTokens.tokenId,
        tokenName: userOwnedTokens.tokenName,
        tokenThumbnail: userOwnedTokens.tokenThumbnail,
        metadata: userOwnedTokens.metadata,
        creatorAddress: userOwnedTokens.creatorAddress,
      })
      .from(userOwnedTokens)
      .where(whereClause)
      .orderBy(
        sql`CASE WHEN ${userOwnedTokens.metadata}::text ILIKE '%"pfp"%' THEN 0 ELSE 1 END`,
        userOwnedTokens.tokenName,
      )
      .limit(limit)
      .offset(offset);

    res.json({
      items: rows,
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
      viewer &&
      (viewer.role === "admin" ||
        viewer.role === "host" ||
        viewer.role === "cohost");

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
      .select()
      .from(userOwnedTokens)
      .where(
        and(
          inArray(userOwnedTokens.walletAddress, wallets),
          eq(userOwnedTokens.onTradeBoard, true),
          sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`
        )
      );

    res.json(
      rows.map((r) => ({
        id: r.id,
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        tokenName: (r.metadata as any)?.name || `#${r.tokenId}`,
        thumbnail: (r.metadata as any)?.thumbnailUri || (r.metadata as any)?.displayUri,
        balance: r.balance,
        tradeBoardQuantity: r.tradeBoardQuantity,
      }))
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
    const username = req.params.username.toLowerCase();

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
