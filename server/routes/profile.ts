import { Router } from "express";
import { db } from "../db";
import { users, userWallets, userOwnedTokens } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";

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
      .where(
        and(
          eq(userOwnedTokens.userId, user.id),
          sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`,
        ),
      )
      .orderBy(
        sql`CASE WHEN ${userOwnedTokens.metadata}::text ILIKE '%"pfp"%' THEN 0 ELSE 1 END`,
        userOwnedTokens.tokenName,
      )
      .limit(limit)
      .offset(offset);

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /api/profile/pfp-candidates error:", err);
    res.status(500).json({ error: "Failed to fetch PFP candidates" });
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
      viewer && (viewer.role === "host" || viewer.role === "cohost");

    const profile: Record<string, any> = {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
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

export default router;
