import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { verifyWtfWebhookSignature } from "../lib/webhook-hmac";
import {
  telegramDigestSources,
  type TelegramDigestSourceKind,
} from "@shared/schema";
import {
  createTelegramAnnouncement,
  ingestTelegramDigestUpdate,
  isMissingTelegramDigestTables,
  listFartTracks,
  listTelegramAnnouncements,
  listTelegramDigestMessages,
  listTelegramDigestSources,
  upsertFartTrack,
} from "../features/telegram-digest/service";

const router = Router();
const hmacBridgeAuth = verifyWtfWebhookSignature({
  secretEnv: "WTF_BOT_WEBHOOK_SECRET",
  optional: true,
});

function telegramBridgeAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.I_HATE_TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided =
    typeof req.headers["x-telegram-bot-api-secret-token"] === "string"
      ? req.headers["x-telegram-bot-api-secret-token"]
      : "";
  if (secret && provided && provided === secret) {
    (req as any).wtfWebhookVerified = "telegram-secret-token";
    return next();
  }

  return hmacBridgeAuth(req, res, () => {
    if ((req as any).wtfWebhookVerified) return next();
    return res.status(401).json({ error: "telegram_bridge_not_authenticated" });
  });
}

const sourceSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  telegramChatId: z.string().max(120).optional().nullable(),
  telegramUsername: z.string().max(120).optional().nullable(),
  sourceKind: z
    .enum(["channel", "group", "bot", "user_client"])
    .default("channel"),
  enabled: z.boolean().default(true),
  publicVisible: z.boolean().default(true),
  digestEnabled: z.boolean().default(true),
  boardChannelId: z.number().int().positive().optional().nullable(),
});

const announcementSchema = z.object({
  sourceId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(180),
  body: z.string().min(1).max(4000),
});

const fartTrackSchema = z.object({
  walletAddress: z.string().min(1).max(80),
  label: z.string().max(120).optional().nullable(),
});

router.get("/api/telegram-digest/config", (_req, res) => {
  res.json({
    appName: "I Hate Telegram",
    botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    webhookSecretConfigured: Boolean(
      process.env.I_HATE_TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET
    ),
    bridgeHmacConfigured: Boolean(process.env.WTF_BOT_WEBHOOK_SECRET),
    userClientModeConfigured: Boolean(
      process.env.TELEGRAM_API_ID &&
        process.env.TELEGRAM_API_HASH &&
        process.env.TELEGRAM_USER_SESSION
    ),
    fartNoisesBot: "fart_noises_bot",
    readOnly: true,
  });
});

router.get("/api/telegram-digest/sources", async (_req, res) => {
  try {
    res.json({ sources: await listTelegramDigestSources() });
  } catch (err) {
    if (isMissingTelegramDigestTables(err)) return res.json({ sources: [] });
    console.error("[telegram-digest] sources failed:", err);
    res.status(500).json({ error: "Failed to fetch Telegram digest sources" });
  }
});

router.get("/api/telegram-digest/messages", async (req, res) => {
  try {
    res.json({
      messages: await listTelegramDigestMessages({
        sourceKey: typeof req.query.source === "string" ? req.query.source : null,
        kind: typeof req.query.kind === "string" ? req.query.kind : null,
        limit: Number(req.query.limit || 80),
      }),
    });
  } catch (err) {
    if (isMissingTelegramDigestTables(err)) return res.json({ messages: [] });
    console.error("[telegram-digest] messages failed:", err);
    res.status(500).json({ error: "Failed to fetch Telegram digest messages" });
  }
});

router.post("/api/telegram-digest/bot/update", telegramBridgeAuth, async (req, res) => {
  try {
    const result = await ingestTelegramDigestUpdate(req.body || {});
    const ignored = "ignored" in result && result.ignored;
    const duplicate = "duplicate" in result && result.duplicate;
    res.status(ignored ? 202 : duplicate ? 200 : 201).json(result);
  } catch (err) {
    console.error("[telegram-digest] ingest failed:", err);
    res.status(500).json({ error: "Failed to ingest Telegram update" });
  }
});

router.get("/api/telegram-digest/me/farts", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json({ tracks: await listFartTracks(user.id) });
  } catch (err) {
    if (isMissingTelegramDigestTables(err)) return res.json({ tracks: [] });
    console.error("[telegram-digest] fart tracks failed:", err);
    res.status(500).json({ error: "Failed to fetch FART tracks" });
  }
});

router.post("/api/telegram-digest/me/farts", isAuthenticated, async (req, res) => {
  try {
    const parsed = fartTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    }
    const user = req.user as any;
    const track = await upsertFartTrack({
      userId: user.id,
      walletAddress: parsed.data.walletAddress,
      label: parsed.data.label,
    });
    res.status(201).json({ track });
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_wallet_address") {
      return res.status(400).json({ error: "Invalid Tezos wallet address" });
    }
    console.error("[telegram-digest] save fart track failed:", err);
    res.status(500).json({ error: "Failed to save FART track" });
  }
});

router.post(
  "/api/telegram-digest/admin/sources",
  requirePermission("manage_content"),
  async (req, res) => {
    try {
      const parsed = sourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      }
      const actor = req.user as any;
      const data = parsed.data;
      const [source] = await db
        .insert(telegramDigestSources)
        .values({
          key: data.key,
          title: data.title,
          description: data.description ?? null,
          telegramChatId: data.telegramChatId ?? null,
          telegramUsername: data.telegramUsername ?? null,
          sourceKind: data.sourceKind as TelegramDigestSourceKind,
          enabled: data.enabled,
          publicVisible: data.publicVisible,
          digestEnabled: data.digestEnabled,
          boardChannelId: data.boardChannelId ?? null,
          createdBy: actor.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: telegramDigestSources.key,
          set: {
            title: data.title,
            description: data.description ?? null,
            telegramChatId: data.telegramChatId ?? null,
            telegramUsername: data.telegramUsername ?? null,
            sourceKind: data.sourceKind as TelegramDigestSourceKind,
            enabled: data.enabled,
            publicVisible: data.publicVisible,
            digestEnabled: data.digestEnabled,
            boardChannelId: data.boardChannelId ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      res.status(201).json({ source });
    } catch (err) {
      console.error("[telegram-digest] upsert source failed:", err);
      res.status(500).json({ error: "Failed to save Telegram digest source" });
    }
  }
);

router.get(
  "/api/telegram-digest/admin/announcements",
  requirePermission("manage_content"),
  async (_req, res) => {
    try {
      res.json({ announcements: await listTelegramAnnouncements() });
    } catch (err) {
      if (isMissingTelegramDigestTables(err)) return res.json({ announcements: [] });
      console.error("[telegram-digest] announcements failed:", err);
      res.status(500).json({ error: "Failed to fetch Telegram announcements" });
    }
  }
);

router.post(
  "/api/telegram-digest/admin/announcements",
  requirePermission("manage_content"),
  async (req, res) => {
    try {
      const parsed = announcementSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      }
      const actor = req.user as any;
      const announcement = await createTelegramAnnouncement({
        sourceId: parsed.data.sourceId ?? null,
        title: parsed.data.title,
        body: parsed.data.body,
        createdBy: actor.id,
      });
      res.status(201).json({ announcement });
    } catch (err) {
      console.error("[telegram-digest] create announcement failed:", err);
      res.status(500).json({ error: "Failed to queue Telegram announcement" });
    }
  }
);

router.delete(
  "/api/telegram-digest/admin/sources/:id",
  requirePermission("manage_content"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid source id" });
      }
      await db
        .update(telegramDigestSources)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(telegramDigestSources.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[telegram-digest] disable source failed:", err);
      res.status(500).json({ error: "Failed to disable Telegram digest source" });
    }
  }
);

export default router;
