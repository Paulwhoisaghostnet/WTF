import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { verifyWtfWebhookSignature } from "../lib/webhook-hmac";
import { awardXp } from "../lib/xp";
import {
  attendanceEvents,
  discordActivityEvents,
  discordAvatarLayerConflicts,
  discordAvatarLayers,
  discordAvatarSelections,
  discordIdentityClaims,
  discordRoleMappings,
  users,
} from "@shared/schema";
import { getXpTierForTotal } from "@shared/types";

const router = Router();
const CLAIM_TTL_MS = Math.max(
  60_000,
  Number(process.env.DICKSWORD_CLAIM_TTL_MS || 10 * 60 * 1000)
);
const SERVER_ID = process.env.DISCORD_GUILD_ID || "1375286181079810058";

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function makeClaimCode(): string {
  return randomBytes(5).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

async function expireClaims() {
  await db
    .update(discordIdentityClaims)
    .set({ status: "expired" })
    .where(
      and(
        eq(discordIdentityClaims.status, "pending"),
        lte(discordIdentityClaims.expiresAt, new Date())
      )
    );
}

async function findUserByDiscordId(discordUserId: string) {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      discordId: users.discordId,
      discordHandle: users.discordHandle,
      discordVerified: users.discordVerified,
      experiencePoints: users.experiencePoints,
    })
    .from(users)
    .where(eq(users.discordId, discordUserId))
    .limit(1);
  return row ?? null;
}

const botProofSchema = z.object({
  code: z.string().min(4).max(32),
  discordUserId: z.string().min(1).max(100),
  discordHandle: z.string().min(1).max(120),
  discordGuildId: z.string().min(1).max(100).default(SERVER_ID),
});

const botActivitySchema = z.object({
  discordUserId: z.string().min(1).max(100),
  discordHandle: z.string().max(120).optional().nullable(),
  discordGuildId: z.string().min(1).max(100).default(SERVER_ID),
  discordChannelId: z.string().max(100).optional().nullable(),
  kind: z.enum([
    "message",
    "reaction",
    "voice",
    "stage",
    "event",
    "lottery",
    "auction",
    "avatar",
    "manual",
  ]),
  action: z.string().min(1).max(80),
  xpAmount: z.number().int().min(0).max(1000).default(0),
  externalRef: z.string().max(200).optional().nullable(),
  observedAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

const layerSchema = z.object({
  key: z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(160),
  layerType: z.enum(["base", "accessory"]),
  stackOrder: z.number().int().min(-1000).max(1000).default(0),
  assetUrl: z.string().min(1).max(2000),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
});

const roleMappingSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(140),
  roleId: z.string().min(1).max(100),
  roleKind: z.string().min(1).max(40).default("custom"),
  protected: z.boolean().default(false),
  managed: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
});

const selectionSchema = z.object({
  layerIds: z.array(z.number().int().positive()).max(40),
});

router.get("/api/dicksword/config", (_req, res) => {
  res.json({
    guildId: SERVER_ID,
    inviteUrl: process.env.DICKSWORD_INVITE_URL || null,
    oauthConfigured: Boolean(
      process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
    ),
    claimTtlMs: CLAIM_TTL_MS,
    avatarMaxUploadBytes: Number(process.env.DICKSWORD_AVATAR_MAX_BYTES || 2_000_000),
    avatarAssetBasePath: "/dicksword/avatar-assets",
    commands: ["/wtf prove", "/wtf profile", "/wtf avatar", "/wtf xp", "/wtf calendar"],
  });
});

router.get("/api/dicksword/me", isAuthenticated, async (req, res) => {
  await expireClaims();
  const user = req.user as any;
  const [userRow] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      discordId: users.discordId,
      discordHandle: users.discordHandle,
      discordVerified: users.discordVerified,
      experiencePoints: users.experiencePoints,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [claim] = await db
    .select()
    .from(discordIdentityClaims)
    .where(
      and(
        eq(discordIdentityClaims.userId, user.id),
        eq(discordIdentityClaims.status, "pending"),
        gt(discordIdentityClaims.expiresAt, new Date())
      )
    )
    .orderBy(desc(discordIdentityClaims.createdAt))
    .limit(1);

  const activityWhere = userRow?.discordId
    ? or(
        eq(discordActivityEvents.userId, user.id),
        eq(discordActivityEvents.discordUserId, userRow.discordId)
      )
    : eq(discordActivityEvents.userId, user.id);

  const [activity, layers, conflicts, selections, roleMappings] = await Promise.all([
    db
      .select()
      .from(discordActivityEvents)
      .where(activityWhere)
      .orderBy(desc(discordActivityEvents.observedAt))
      .limit(50),
    db
      .select()
      .from(discordAvatarLayers)
      .orderBy(discordAvatarLayers.stackOrder, discordAvatarLayers.label),
    db.select().from(discordAvatarLayerConflicts),
    db
      .select()
      .from(discordAvatarSelections)
      .where(eq(discordAvatarSelections.userId, user.id)),
    db.select().from(discordRoleMappings).orderBy(discordRoleMappings.label),
  ]);

  res.json({
    user: userRow
      ? {
          ...userRow,
          xpTier: getXpTierForTotal(userRow.experiencePoints ?? 0),
        }
      : null,
    activeClaim: claim
      ? {
          id: claim.id,
          expiresAt: claim.expiresAt,
          createdAt: claim.createdAt,
        }
      : null,
    activity,
    avatar: { layers, conflicts, selections },
    roleMappings,
  });
});

router.post("/api/dicksword/claims", isAuthenticated, async (req, res) => {
  await expireClaims();
  const user = req.user as any;
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
  let code = makeClaimCode();
  while (code.length < 6) code = makeClaimCode();

  await db
    .update(discordIdentityClaims)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(discordIdentityClaims.userId, user.id),
        eq(discordIdentityClaims.status, "pending")
      )
    );

  const [claim] = await db
    .insert(discordIdentityClaims)
    .values({
      userId: user.id,
      codeHash: hashCode(code),
      expiresAt,
    })
    .returning();

  res.json({
    id: claim.id,
    code,
    expiresAt: claim.expiresAt,
    command: `/wtf prove ${code}`,
  });
});

router.put("/api/dicksword/avatar/selection", isAuthenticated, async (req, res) => {
  const parsed = selectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
  }
  const user = req.user as any;
  const layerIds = [...new Set(parsed.data.layerIds)];
  if (layerIds.length === 0) {
    await db
      .delete(discordAvatarSelections)
      .where(eq(discordAvatarSelections.userId, user.id));
    return res.json({ ok: true, layerIds: [] });
  }

  const layers = await db
    .select()
    .from(discordAvatarLayers)
    .where(inArray(discordAvatarLayers.id, layerIds));
  if (layers.length !== layerIds.length || layers.some((l) => !l.enabled)) {
    return res.status(400).json({ error: "unknown_or_disabled_layer" });
  }

  const conflicts = await db
    .select()
    .from(discordAvatarLayerConflicts)
    .where(inArray(discordAvatarLayerConflicts.layerId, layerIds));
  const selected = new Set(layerIds);
  const conflict = conflicts.find((c) => selected.has(c.conflictsWithLayerId));
  if (conflict) {
    return res.status(400).json({
      error: "layer_conflict",
      layerId: conflict.layerId,
      conflictsWithLayerId: conflict.conflictsWithLayerId,
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(discordAvatarSelections)
      .where(eq(discordAvatarSelections.userId, user.id));
    await tx.insert(discordAvatarSelections).values(
      layerIds.map((layerId) => ({
        userId: user.id,
        layerId,
      }))
    );
  });

  res.json({ ok: true, layerIds });
});

router.post(
  "/api/dicksword/admin/avatar-layers",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    const parsed = layerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const actor = req.user as any;
    const data = parsed.data;
    const [row] = await db
      .insert(discordAvatarLayers)
      .values({
        key: normalizeKey(data.key || data.label),
        label: data.label,
        layerType: data.layerType,
        stackOrder: data.stackOrder,
        assetUrl: data.assetUrl,
        enabled: data.enabled,
        metadataJson: data.metadata ?? {},
        createdBy: actor.id,
      })
      .returning();
    res.json(row);
  }
);

router.post(
  "/api/dicksword/admin/avatar-conflicts",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    const parsed = z
      .object({
        layerId: z.number().int().positive(),
        conflictsWithLayerId: z.number().int().positive(),
        reason: z.string().max(1000).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    if (parsed.data.layerId === parsed.data.conflictsWithLayerId) {
      return res.status(400).json({ error: "self_conflict" });
    }
    const [row] = await db
      .insert(discordAvatarLayerConflicts)
      .values(parsed.data)
      .returning();
    res.json(row);
  }
);

router.post(
  "/api/dicksword/admin/role-mappings",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    const parsed = roleMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const actor = req.user as any;
    const data = parsed.data;
    const [row] = await db
      .insert(discordRoleMappings)
      .values({
        key: normalizeKey(data.key || data.label),
        label: data.label,
        roleId: data.roleId,
        roleKind: data.roleKind,
        protected: data.protected,
        managed: data.managed,
        notes: data.notes ?? null,
        createdBy: actor.id,
      })
      .returning();
    res.json(row);
  }
);

router.post(
  "/api/dicksword/bot/proof",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (req, res) => {
    await expireClaims();
    const parsed = botProofSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const data = parsed.data;
    const [claim] = await db
      .select()
      .from(discordIdentityClaims)
      .where(
        and(
          eq(discordIdentityClaims.codeHash, hashCode(data.code)),
          eq(discordIdentityClaims.status, "pending"),
          gt(discordIdentityClaims.expiresAt, new Date())
        )
      )
      .limit(1);
    if (!claim) return res.status(404).json({ error: "claim_not_found" });

    const existing = await findUserByDiscordId(data.discordUserId);
    if (existing && existing.id !== claim.userId) {
      return res.status(409).json({ error: "discord_already_linked" });
    }

    const [updatedUser] = await db.transaction(async (tx) => {
      const [linked] = await tx
        .update(users)
        .set({
          discordId: data.discordUserId,
          discordHandle: data.discordHandle,
          discordVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, claim.userId))
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          role: users.role,
          discordHandle: users.discordHandle,
          experiencePoints: users.experiencePoints,
        });

      await tx
        .update(discordIdentityClaims)
        .set({
          status: "claimed",
          discordUserId: data.discordUserId,
          discordHandle: data.discordHandle,
          discordGuildId: data.discordGuildId,
          claimedAt: new Date(),
        })
        .where(eq(discordIdentityClaims.id, claim.id));

      await tx
        .update(discordActivityEvents)
        .set({ userId: claim.userId })
        .where(
          and(
            eq(discordActivityEvents.discordUserId, data.discordUserId),
            isNull(discordActivityEvents.userId)
          )
        );

      await tx
        .update(attendanceEvents)
        .set({ userId: claim.userId })
        .where(
          and(
            eq(attendanceEvents.discordUserId, data.discordUserId),
            isNull(attendanceEvents.userId)
          )
        );

      return [linked];
    });

    res.json({
      ok: true,
      user: updatedUser
        ? {
            ...updatedUser,
            xpTier: getXpTierForTotal(updatedUser.experiencePoints ?? 0),
          }
        : null,
    });
  }
);

router.post(
  "/api/dicksword/bot/activity",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (req, res) => {
    const parsed = botActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const data = parsed.data;
    if (data.externalRef) {
      const [existing] = await db
        .select()
        .from(discordActivityEvents)
        .where(eq(discordActivityEvents.externalRef, data.externalRef))
        .limit(1);
      if (existing) return res.json({ ok: true, duplicate: true, event: existing });
    }

    const linked = await findUserByDiscordId(data.discordUserId);
    const observedAt = data.observedAt ? new Date(data.observedAt) : new Date();
    const [event] = await db
      .insert(discordActivityEvents)
      .values({
        userId: linked?.id ?? null,
        discordUserId: data.discordUserId,
        discordHandle: data.discordHandle ?? null,
        discordGuildId: data.discordGuildId,
        discordChannelId: data.discordChannelId ?? null,
        kind: data.kind,
        action: data.action,
        xpAmount: data.xpAmount,
        externalRef: data.externalRef ?? null,
        payloadJson: data.payload ?? {},
        observedAt,
      })
      .returning();

    let xp: Awaited<ReturnType<typeof awardXp>> | null = null;
    if (linked && data.xpAmount > 0 && data.externalRef) {
      xp = await awardXp({
        userId: linked.id,
        amount: data.xpAmount,
        reason: `discord_${data.kind}_${data.action}`.slice(0, 120),
        metadata: {
          discordActivityEventId: event.id,
          discordGuildId: data.discordGuildId,
          discordChannelId: data.discordChannelId ?? null,
          externalRef: data.externalRef,
        },
      });
      await db
        .update(discordActivityEvents)
        .set({ xpAwardedAt: new Date(), xpEventId: xp.eventId })
        .where(eq(discordActivityEvents.id, event.id));
    }

    res.json({ ok: true, event, matchedUserId: linked?.id ?? null, xp });
  }
);

router.get(
  "/api/dicksword/bot/role-sync",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (_req, res) => {
    const mappings = await db
      .select()
      .from(discordRoleMappings)
      .where(eq(discordRoleMappings.managed, true))
      .orderBy(discordRoleMappings.label);
    res.json({
      guildId: SERVER_ID,
      protectedRoleIds: (process.env.DICKSWORD_PROTECTED_ROLE_IDS || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      mappings,
    });
  }
);

router.get(
  "/api/dicksword/bot/profile/:discordUserId",
  verifyWtfWebhookSignature({ secretEnv: "WTF_BOT_WEBHOOK_SECRET" }),
  async (req, res) => {
    const discordUserId = String(req.params.discordUserId || "").trim();
    if (!discordUserId) return res.status(400).json({ error: "missing_discord_user" });
    const linked = await findUserByDiscordId(discordUserId);
    const activity = await db
      .select()
      .from(discordActivityEvents)
      .where(eq(discordActivityEvents.discordUserId, discordUserId))
      .orderBy(desc(discordActivityEvents.observedAt))
      .limit(10);

    const selections = linked
      ? await db
          .select({
            id: discordAvatarLayers.id,
            label: discordAvatarLayers.label,
            stackOrder: discordAvatarLayers.stackOrder,
            assetUrl: discordAvatarLayers.assetUrl,
          })
          .from(discordAvatarSelections)
          .innerJoin(
            discordAvatarLayers,
            eq(discordAvatarSelections.layerId, discordAvatarLayers.id)
          )
          .where(eq(discordAvatarSelections.userId, linked.id))
      : [];

    res.json({
      linked: Boolean(linked),
      user: linked
        ? {
            ...linked,
            xpTier: getXpTierForTotal(linked.experiencePoints ?? 0),
          }
        : null,
      activity,
      avatarLayers: selections.sort((a, b) => a.stackOrder - b.stackOrder),
    });
  }
);

export default router;
