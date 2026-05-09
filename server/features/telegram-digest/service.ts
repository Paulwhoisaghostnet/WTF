import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  boardThreadReplies,
  boardThreads,
  telegramDigestAnnouncements,
  telegramDigestMessages,
  telegramDigestSources,
  telegramFartTracks,
  userWallets,
  users,
} from "@shared/schema";
import { createNotificationsForUsers } from "../../lib/notifications";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { tzkt } from "../../lib/upstream";
import {
  normalizeTelegramUpdate,
  normalizeWalletAddress,
  type NormalizedTelegramDigestMessage,
} from "./normalization";

export const FART_TOKEN = {
  contract: "KT1F4oayJA83QQFPZz7ayfTfemEx8Z8X8mAm",
  tokenId: "0",
} as const;

const SMELL_CHANNEL_TITLE = "WTF is that smell";
const WALLET_REGEX = /tz[123][1-9A-HJ-NP-Za-km-z]{33}/g;

export function isMissingTelegramDigestTables(err: unknown): boolean {
  const candidate = err as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

export function extractTezosWallets(text: string): string[] {
  return Array.from(new Set(text.match(WALLET_REGEX) ?? []));
}

async function resolveSystemUserId(): Promise<number | null> {
  const configured = Number(process.env.WTF_TELEGRAM_DIGEST_USER_ID || "");
  if (Number.isInteger(configured) && configured > 0) return configured;

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.id)
    .limit(1);
  if (admin) return admin.id;

  const [firstUser] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(users.id)
    .limit(1);
  return firstUser?.id ?? null;
}

async function ensureSmellBoardChannel(): Promise<number | null> {
  const [existing] = await db
    .select({ id: boardThreads.id })
    .from(boardThreads)
    .where(eq(boardThreads.title, SMELL_CHANNEL_TITLE))
    .limit(1);
  if (existing) return existing.id;

  const createdBy = await resolveSystemUserId();
  if (!createdBy) return null;

  const [created] = await db
    .insert(boardThreads)
    .values({
      title: SMELL_CHANNEL_TITLE,
      body: "FART NOISES and other approved Telegram-derived Tezos alerts.",
      createdBy,
      channelType: "text",
      topic: "All the approved farts WTF can smell from Telegram.",
      position: 0,
      viewRoles: [],
      replyRoles: ["admin"],
      active: true,
      locked: true,
    })
    .returning({ id: boardThreads.id });
  return created?.id ?? null;
}

async function upsertSource(message: NormalizedTelegramDigestMessage) {
  const [source] = await db
    .insert(telegramDigestSources)
    .values({
      key: message.sourceKey,
      title: message.sourceTitle,
      telegramChatId: message.telegramChatId,
      telegramUsername: message.sourceUsername,
      sourceKind: message.sourceKind,
      description:
        message.kind === "fart_noise"
          ? "FART NOISES Telegram alert source."
          : "Approved Telegram source for I Hate Telegram.",
      enabled: true,
      publicVisible: true,
      digestEnabled: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramDigestSources.key,
      set: {
        title: message.sourceTitle,
        telegramChatId: message.telegramChatId,
        telegramUsername: message.sourceUsername,
        sourceKind: message.sourceKind,
        updatedAt: new Date(),
      },
    })
    .returning();
  return source;
}

async function notifyLinkedWalletOwners(
  message: typeof telegramDigestMessages.$inferSelect,
  wallets: string[]
): Promise<number> {
  if (wallets.length === 0) return 0;
  const rows = await db
    .select({
      userId: userWallets.userId,
      walletAddress: userWallets.walletAddress,
    })
    .from(userWallets)
    .where(inArray(userWallets.walletAddress, wallets));
  const userIds = Array.from(new Set(rows.map((row) => row.userId)));
  if (userIds.length === 0) return 0;

  return createNotificationsForUsers(userIds, {
    eventKey: "fart_noises.telegram_alert",
    preferenceKey: "fart_noises",
    title: "FART NOISES smelled your wallet",
    body: message.summary || message.text,
    metadata: {
      telegramDigestMessageId: message.id,
      wallets: rows.map((row) => row.walletAddress),
      publicLink: message.publicLink,
    },
  });
}

async function mirrorFartToBoard(
  source: typeof telegramDigestSources.$inferSelect,
  message: typeof telegramDigestMessages.$inferSelect
) {
  if (message.messageKind !== "fart_noise" || message.postedBoardReplyId) return null;

  const channelId = source.boardChannelId ?? (await ensureSmellBoardChannel());
  if (!channelId) return null;

  if (!source.boardChannelId) {
    await db
      .update(telegramDigestSources)
      .set({ boardChannelId: channelId, updatedAt: new Date() })
      .where(eq(telegramDigestSources.id, source.id));
  }

  const userId = await resolveSystemUserId();
  if (!userId) return null;

  const content = [
    `**[${source.title}]** ${message.summary || message.text}`,
    message.publicLink ? `Source: ${message.publicLink}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const [reply] = await db
    .insert(boardThreadReplies)
    .values({
      threadId: channelId,
      userId,
      content,
      attachments: [],
    })
    .returning();

  await db
    .update(boardThreads)
    .set({ updatedAt: new Date() })
    .where(eq(boardThreads.id, channelId));

  await db
    .update(telegramDigestMessages)
    .set({ postedBoardReplyId: reply.id })
    .where(eq(telegramDigestMessages.id, message.id));

  void ingestSystemEvent({
    eventId: `telegram.fart.mirrored:${message.id}`,
    eventType: "telegram.fart.mirrored",
    userId,
    source: "telegram_digest",
    sourceModule: "i-hate-telegram",
    rawRefType: "telegram_digest_message",
    rawRefId: message.id,
    metadata: { channelId, boardReplyId: reply.id, sourceKey: source.key },
  }).catch(() => undefined);

  return reply;
}

export async function ingestTelegramDigestUpdate(update: Record<string, unknown>) {
  const normalized = normalizeTelegramUpdate(update);
  if (!normalized) return { ok: true, ignored: true as const };

  const source = await upsertSource(normalized);
  const inserted = await db
    .insert(telegramDigestMessages)
    .values({
      sourceId: source.id,
      externalRef: normalized.externalRef,
      telegramChatId: normalized.telegramChatId,
      telegramMessageId: normalized.telegramMessageId,
      messageKind: normalized.kind,
      authorName: normalized.authorName,
      authorUsername: normalized.authorUsername,
      authorTelegramId: normalized.authorTelegramId,
      text: normalized.text,
      summary: normalized.summary,
      publicLink: normalized.publicLink,
      metadata: normalized.metadata,
      messageDate: normalized.messageDate,
      publicVisible: source.publicVisible,
    })
    .onConflictDoNothing({ target: telegramDigestMessages.externalRef })
    .returning();

  const message =
    inserted[0] ??
    (
      await db
        .select()
        .from(telegramDigestMessages)
        .where(eq(telegramDigestMessages.externalRef, normalized.externalRef))
        .limit(1)
    )[0];

  if (!message) throw new Error("Failed to persist Telegram digest message");
  if (!inserted[0]) return { ok: true, duplicate: true as const, message };

  const wallets = extractTezosWallets(normalized.text);
  const notifications =
    normalized.kind === "fart_noise"
      ? await notifyLinkedWalletOwners(message, wallets)
      : 0;
  const boardReply =
    normalized.kind === "fart_noise" ? await mirrorFartToBoard(source, message) : null;

  void ingestSystemEvent({
    eventId: `telegram.digest.message_ingested:${message.id}`,
    eventType: "telegram.digest.message_ingested",
    source: "telegram_digest",
    sourceModule: "i-hate-telegram",
    rawRefType: "telegram_digest_message",
    rawRefId: message.id,
    metadata: {
      sourceKey: source.key,
      messageKind: message.messageKind,
      walletMentions: wallets,
      notificationCount: notifications,
      boardReplyId: boardReply?.id ?? null,
    },
    occurredAt: message.messageDate,
  }).catch(() => undefined);

  return { ok: true, duplicate: false as const, message, wallets, notifications };
}

export async function listTelegramDigestSources() {
  return db
    .select()
    .from(telegramDigestSources)
    .where(and(eq(telegramDigestSources.enabled, true), eq(telegramDigestSources.publicVisible, true)))
    .orderBy(telegramDigestSources.title);
}

export async function listTelegramDigestMessages(opts: {
  sourceKey?: string | null;
  kind?: string | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(opts.limit || 80), 1), 200);
  const sources = await db
    .select()
    .from(telegramDigestSources)
    .where(and(eq(telegramDigestSources.enabled, true), eq(telegramDigestSources.publicVisible, true)));
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const selectedSource = opts.sourceKey
    ? sources.find((source) => source.key === opts.sourceKey)
    : null;

  if (opts.sourceKey && !selectedSource) return [];

  const filters = [eq(telegramDigestMessages.publicVisible, true)];
  if (selectedSource) filters.push(eq(telegramDigestMessages.sourceId, selectedSource.id));
  if (opts.kind) filters.push(eq(telegramDigestMessages.messageKind, opts.kind as any));

  const rows = await db
    .select()
    .from(telegramDigestMessages)
    .where(and(...filters))
    .orderBy(desc(telegramDigestMessages.messageDate), desc(telegramDigestMessages.id))
    .limit(limit);

  return rows.map((message) => ({
    ...message,
    source: sourceMap.get(message.sourceId) ?? null,
  }));
}

export async function createTelegramAnnouncement(input: {
  sourceId?: number | null;
  title: string;
  body: string;
  createdBy: number;
}) {
  const source = input.sourceId
    ? (
        await db
          .select()
          .from(telegramDigestSources)
          .where(eq(telegramDigestSources.id, input.sourceId))
          .limit(1)
      )[0]
    : null;
  const sendTarget = source?.telegramChatId
    ? source.telegramChatId
    : source?.telegramUsername
      ? `@${source.telegramUsername.replace(/^@+/, "")}`
      : null;
  const canSend = Boolean(process.env.TELEGRAM_BOT_TOKEN && sendTarget);

  const [announcement] = await db
    .insert(telegramDigestAnnouncements)
    .values({
      sourceId: input.sourceId ?? null,
      title: input.title,
      body: input.body,
      status: canSend ? "queued" : "blocked",
      failure: canSend
        ? null
        : "TELEGRAM_BOT_TOKEN or a Telegram chat target is not configured; announcement stored but not sent.",
      createdBy: input.createdBy,
    })
    .returning();

  let finalAnnouncement = announcement;
  if (canSend && sendTarget) {
    finalAnnouncement = await sendAnnouncementToTelegram({
      announcementId: announcement.id,
      chatId: sendTarget,
      title: input.title,
      body: input.body,
    });
  }

  void ingestSystemEvent({
    eventId: `telegram.announcement.queued:${finalAnnouncement.id}`,
    eventType: "telegram.announcement.queued",
    userId: input.createdBy,
    source: "telegram_digest",
    sourceModule: "i-hate-telegram",
    rawRefType: "telegram_digest_announcement",
    rawRefId: finalAnnouncement.id,
    metadata: { sourceId: input.sourceId ?? null, status: finalAnnouncement.status },
  }).catch(() => undefined);

  return finalAnnouncement;
}

async function sendAnnouncementToTelegram(input: {
  announcementId: number;
  chatId: string;
  title: string;
  body: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN missing");
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: `${input.title}\n\n${input.body}`.slice(0, 4096),
        disable_web_page_preview: false,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { message_id?: number }; description?: string }
      | null;

    if (!response.ok || !body?.ok) {
      const failure = body?.description || `Telegram sendMessage ${response.status}`;
      const [failed] = await db
        .update(telegramDigestAnnouncements)
        .set({ status: "failed", failure })
        .where(eq(telegramDigestAnnouncements.id, input.announcementId))
        .returning();
      return failed;
    }

    const [sent] = await db
      .update(telegramDigestAnnouncements)
      .set({
        status: "sent",
        telegramMessageId:
          body.result?.message_id == null ? null : String(body.result.message_id),
        sentAt: new Date(),
      })
      .where(eq(telegramDigestAnnouncements.id, input.announcementId))
      .returning();
    return sent;
  } catch (err) {
    const failure = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(telegramDigestAnnouncements)
      .set({ status: "failed", failure })
      .where(eq(telegramDigestAnnouncements.id, input.announcementId))
      .returning();
    return failed;
  }
}

export async function listTelegramAnnouncements(limit = 40) {
  return db
    .select()
    .from(telegramDigestAnnouncements)
    .orderBy(desc(telegramDigestAnnouncements.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function upsertFartTrack(input: {
  userId: number;
  walletAddress: string;
  label?: string | null;
}) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  if (!walletAddress) throw new Error("invalid_wallet_address");

  const balance = await checkFartTokenBalance(walletAddress).catch(() => null);
  const [row] = await db
    .insert(telegramFartTracks)
    .values({
      userId: input.userId,
      walletAddress,
      label: input.label ?? null,
      status: balance && BigInt(balance) > 0n ? "ready" : "needs_fart",
      fartTokenContract: FART_TOKEN.contract,
      fartTokenId: FART_TOKEN.tokenId,
      fartTokenBalance: balance,
      lastCheckedAt: new Date(),
      metadata: {
        delivery: "telegram_client_required",
        note:
          "WTF can track readiness, but FART NOISES registration still happens through the configured Telegram/FART client.",
      },
    })
    .onConflictDoUpdate({
      target: [telegramFartTracks.userId, telegramFartTracks.walletAddress],
      set: {
        label: input.label ?? null,
        status: balance && BigInt(balance) > 0n ? "ready" : "needs_fart",
        fartTokenBalance: balance,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  void ingestSystemEvent({
    eventId: `fart_noises.track.requested:${row.id}:${Date.now()}`,
    eventType: "fart_noises.track.requested",
    userId: input.userId,
    walletAddress,
    source: "telegram_digest",
    sourceModule: "i-hate-telegram",
    rawRefType: "telegram_fart_track",
    rawRefId: row.id,
    metadata: {
      status: row.status,
      fartTokenBalance: row.fartTokenBalance,
    },
  }).catch(() => undefined);

  return row;
}

export async function listFartTracks(userId: number) {
  return db
    .select()
    .from(telegramFartTracks)
    .where(eq(telegramFartTracks.userId, userId))
    .orderBy(desc(telegramFartTracks.createdAt));
}

export async function checkFartTokenBalance(walletAddress: string): Promise<string> {
  const rows = await tzkt.getJson<Array<{ balance?: string | number }>>("/tokens/balances", {
    account: walletAddress,
    "token.contract": FART_TOKEN.contract,
    "token.tokenId": FART_TOKEN.tokenId,
  });
  const raw = String(rows[0]?.balance ?? "0");
  return /^\d+$/.test(raw) ? raw : "0";
}
