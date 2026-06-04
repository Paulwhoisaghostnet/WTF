import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { atprotoAccounts, atprotoPostClaims, challengeSystemEvents, challenges, tokenMetadata, userMediaLibrary, userWallets, users, walletHoldings } from "@shared/schema";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import {
  accountHasAtprotoCapability,
  getAtprotoAgentForDid,
  getPublicAtprotoAgent,
  getSearchAtprotoAgent,
  isAtprotoSessionUnavailableError,
} from "../features/atproto/oauth";
import {
  SKYWIRE_ROOM_MESSAGE_COLLECTION,
  SKYWIRE_SIGNAL_COLLECTION,
  SKYWIRE_STAGE_BROADCAST_COLLECTION,
  skywirePermissionTierLabel,
  type SkywirePermissionCapability,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";
import {
  buildBskyIntentUrl,
  parseBskyPostRef,
  sourceUrlForAtUri,
} from "../features/atproto/identity";
import { emitAtprotoSystemEvent, skywireEventId } from "../features/atproto/events";
import { issueAtprotoBridgeCredential } from "../features/atproto/event-bridge";
import {
  fetchObjktCreatedTokens,
  normalizeTokenImageUrl,
  parseSkywireTokenUrl,
  resolveSkywireTokenMarket,
  type SkywireTokenSummary,
} from "../features/atproto/skywire-token-market";
import {
  extractSkywireTokenUrlsFromValues,
  SKYWIRE_MARKET_FEED_DOMAINS,
  SKYWIRE_MARKET_FEED_QUERY_BY_DOMAIN,
  SKYWIRE_MARKET_FEED_SEARCH_TERMS,
} from "@shared/skywire-token-links";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { requireSkywireRollout, requireWtfLiveRollout, skywireRolloutStatusForRole } from "../lib/skywire-access";
import { getSessionSecret } from "../auth/session-secret";
import { serveStoredMediaFile } from "../lib/storage/media-file-serve";
import { fetchSafeHttp } from "../lib/outbound-url";
import { resolveCanonicalPublicOrigin } from "../lib/canonical-domain";

const router = Router();
const SKYWIRE_CHAT_MEDIA_MAX_ATTACHMENTS = 4;
const SKYWIRE_CHAT_MEDIA_TOKEN_TTL_MS = Number(process.env.SKYWIRE_CHAT_MEDIA_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const SKYWIRE_CHAT_MEDIA_LINE_RE = /^\[skywire-media:([A-Za-z0-9_-]+)\]\s+(\S+)$/;
const SKYWIRE_EXTERNAL_THUMB_MAX_BYTES = 1_000_000;
const SKYWIRE_EXTERNAL_THUMB_TIMEOUT_MS = 8_000;

const postSchema = z.object({
  text: z.string().trim().min(1).max(300),
  langs: z.array(z.string().trim().min(2).max(12)).max(5).optional(),
  embedUrl: z.string().url().optional().nullable(),
  embedTitle: z.string().trim().min(1).max(300).optional().nullable(),
  embedDescription: z.string().trim().max(1000).optional().nullable(),
  embedThumbUrl: z.string().url().optional().nullable(),
  challengeId: z.coerce.number().int().positive().optional().nullable(),
});

const claimSchema = z.object({
  postUrlOrUri: z.string().trim().min(1).max(2000),
  challengeId: z.coerce.number().int().positive().optional().nullable(),
  claimedFor: z.string().trim().min(1).max(120).default("challenge"),
});

const refSchema = z.object({
  uri: z.string().trim().min(1).max(2000),
  cid: z.string().trim().min(1).max(255).optional(),
  text: z.string().trim().max(300).optional(),
  rootUri: z.string().trim().min(1).max(2000).optional(),
  rootCid: z.string().trim().min(1).max(255).optional(),
});

const actorSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const actorRecommendationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function skywireExternalThumbMime(contentType: string | null): string | null {
  const mime = (contentType || "").split(";")[0]?.trim().toLowerCase();
  if (!mime) return null;
  if (mime === "image/jpg") return "image/jpeg";
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime) ? mime : null;
}

async function uploadSkywireExternalThumb(agent: any, rawUrl: string | null | undefined): Promise<any | null> {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SKYWIRE_EXTERNAL_THUMB_TIMEOUT_MS);
  try {
    const response = await fetchSafeHttp(url.toString(), {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const mime = skywireExternalThumbMime(response.headers.get("content-type"));
    if (!mime) return null;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > SKYWIRE_EXTERNAL_THUMB_MAX_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > SKYWIRE_EXTERNAL_THUMB_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    if (!total) return null;
    const upload = await agent.uploadBlob(Buffer.concat(chunks, total), { encoding: mime });
    return upload.data.blob;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const actorSuggestionSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const actorListSchema = z.object({
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

const actorFeedSchema = z.object({
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(40),
});

const feedQuerySchema = z.object({
  feedType: z.enum(["home", "following", "discover", "wtf", "tezos", "market", "search"]).catch("home"),
  q: z.string().trim().min(1).max(160).optional(),
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

const tokenLinkQuerySchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

const tezosVaultQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

const skywireClientEventSchema = z.object({
  eventType: z.enum(["skywire.token_listing.buy_requested"]),
  tokenRef: z.string().trim().min(1).max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const threadQuerySchema = z.object({
  uri: z.string().trim().min(1).max(2000),
  depth: z.coerce.number().int().min(1).max(20).default(8),
  parentHeight: z.coerce.number().int().min(0).max(20).default(8),
});

const followSchema = z.object({
  did: z.string().trim().regex(/^did:[a-z0-9]+:.+/i),
});

const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(64).optional(),
  description: z.string().trim().max(256).optional(),
});

const signalSchema = z.object({
  text: z.string().trim().min(1).max(300),
  signalType: z.enum(["status", "quest", "drop", "proof", "broadcast"]).default("status"),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  relatedUri: z.string().trim().max(2000).optional().nullable(),
});

const roomIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const stageIdSchema = roomIdSchema;

const quotedPostSnapshotSchema = z
  .object({
    uri: z.string().trim().min(1).max(2000),
    cid: z.string().trim().min(1).max(255).optional().nullable(),
    sourceUrl: z.string().url().optional().nullable(),
    text: z.string().trim().max(600).optional().nullable(),
    authorHandle: z.string().trim().max(253).optional().nullable(),
    authorDid: z.string().trim().max(255).optional().nullable(),
    createdAt: z.string().trim().max(80).optional().nullable(),
  })
  .optional()
  .nullable();

const roomMessageSchema = z.object({
  text: z.string().trim().min(1).max(600),
  quotedPost: quotedPostSnapshotSchema,
  audienceDids: z.array(z.string().trim().regex(/^did:[a-z0-9]+:.+/i)).max(50).default([]),
});

const roomMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const stageBroadcastSchema = z.object({
  text: z.string().trim().min(1).max(600),
  mode: z.enum(["text", "voice", "video", "link"]).default("text"),
  liveUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), "Live URL must be absolute or a WTF path")
    .optional()
    .nullable(),
  quotedPost: quotedPostSnapshotSchema,
});

const stageBroadcastsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const skywirePipelineIdSchema = z.enum(["reward-spine", "tv", "studio", "rat-race", "wtf-live"]);

const skywirePipelinePostSchema = z.object({
  uri: z.string().trim().min(1).max(2000),
  cid: z.string().trim().min(1).max(255).optional().nullable(),
  sourceUrl: z.string().trim().max(2000).optional().nullable(),
  text: z.string().trim().max(600).optional().nullable(),
  authorHandle: z.string().trim().max(253).optional().nullable(),
  authorDid: z.string().trim().max(255).optional().nullable(),
  createdAt: z.string().trim().max(80).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

const skywirePipelineDispatchSchema = z.object({
  pipelineId: skywirePipelineIdSchema,
  post: skywirePipelinePostSchema,
  note: z.string().trim().max(280).optional().nullable(),
});

const skywirePipelineBatchDispatchSchema = z.object({
  pipelineIds: z
    .array(skywirePipelineIdSchema)
    .min(1)
    .max(5)
    .transform((ids) => Array.from(new Set(ids))),
  post: skywirePipelinePostSchema,
  note: z.string().trim().max(280).optional().nullable(),
});

const skywirePipelineHistorySchema = z.object({
  pipelineId: skywirePipelineIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const chatConvosQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const chatMembersSchema = z.object({
  members: z
    .array(z.string().trim().min(1).max(253))
    .min(1)
    .max(10)
    .transform((members) => Array.from(new Set(members.map((member) => member.replace(/^@/, "").trim()).filter(Boolean)))),
});

const chatMediaAttachmentSchema = z.object({
  mediaId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300).optional().nullable(),
  mimeType: z.string().trim().min(1).max(120).optional().nullable(),
});

const chatMessageBaseSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  quotedPost: quotedPostSnapshotSchema,
  media: z.array(chatMediaAttachmentSchema).max(SKYWIRE_CHAT_MEDIA_MAX_ATTACHMENTS).default([]),
});

const chatMessageSchema = chatMessageBaseSchema.refine(
  (value) => Boolean(value.text || value.quotedPost?.uri || value.media.length),
  "Message text, a quoted post, or media is required"
);

const chatSendToMembersSchema = chatMembersSchema
  .merge(chatMessageBaseSchema)
  .refine(
    (value) => Boolean(value.text || value.quotedPost?.uri || value.media.length),
    "Message text, a quoted post, or media is required"
  );

const chatMessagesQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const convoIdSchema = z.string().trim().min(1).max(300).regex(/^[a-z0-9._:-]+$/i);

const SKYWIRE_ROOMS = [
  {
    id: "wtf-live",
    title: "WTF LIVE",
    kind: "room",
    description: "Public room records stored in participant AT repos.",
  },
  {
    id: "tezos-wire",
    title: "Tezos Wire",
    kind: "room",
    description: "Tezos and tz2at room messages with quoted post context.",
  },
  {
    id: "stage-backchannel",
    title: "Stage Backchannel",
    kind: "stage",
    description: "Public backchannel records for future one-way WTF LIVE stages.",
  },
] as const;

const SKYWIRE_STAGES = [
  {
    id: "wtf-stage",
    title: "WTF Stage",
    kind: "stage",
    description: "One-way WTF LIVE stage broadcasts stored as public AT records.",
    liveUrl: "/live",
  },
  {
    id: "tezos-stage",
    title: "Tezos Stage",
    kind: "stage",
    description: "One-way Tezos, tz2at, and OBJKT broadcast lane.",
    liveUrl: "/tz2at",
  },
  {
    id: "stage-backchannel",
    title: "Stage Backchannel",
    kind: "stage",
    description: "Public stage notes and replay references for WTF LIVE.",
    liveUrl: "/w/chat",
  },
] as const;

const SKYWIRE_PIPELINES = [
  {
    id: "reward-spine",
    title: "Reward Spine",
    app: "WTF Rewards",
    appRoute: "/challenges",
    eventType: "skywire.pipeline.reward_queued",
    description: "Queue a Skywire post as reward/challenge context without writing extra PDS state.",
  },
  {
    id: "tv",
    title: "TV Programming",
    app: "WTF TV",
    appRoute: "/tv",
    eventType: "skywire.pipeline.tv_queued",
    description: "Send post context toward TV programming, bumpers, or future playlist automation.",
  },
  {
    id: "studio",
    title: "Studio Intake",
    app: "Studio",
    appRoute: "/studio",
    eventType: "skywire.pipeline.studio_queued",
    description: "Queue a post as creative intake for Studio and Game Studio workflows.",
  },
  {
    id: "rat-race",
    title: "Rat Race Signal",
    app: "Rat Race",
    appRoute: "/rat-race",
    eventType: "skywire.pipeline.rat_race_queued",
    description: "Promote Tezos/market posts into Rat Race discovery and reward automation.",
  },
  {
    id: "wtf-live",
    title: "WTF LIVE",
    app: "Rooms + Stages",
    appRoute: "/live",
    eventType: "skywire.pipeline.live_queued",
    description: "Queue post context for rooms, one-way stages, live recaps, and replay handoff.",
  },
] as const;

function strongRef(uri: string, cid: string) {
  return { uri, cid };
}

const actionLimiter = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `user:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many Skywire actions, please try again later" },
});

async function linkedAccountForUser(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  return account ?? null;
}

async function requireLinkedAccount(userId: number) {
  const account = await linkedAccountForUser(userId);
  if (!account) {
    const err = new Error("Connect an AT Protocol account first");
    (err as any).status = 400;
    throw err;
  }
  return account;
}

function requireAtprotoCapability(
  account: typeof atprotoAccounts.$inferSelect,
  capability: SkywirePermissionCapability,
  upgradeTier: SkywirePermissionTier
) {
  if (accountHasAtprotoCapability(account, capability)) return;
  const err = new Error(
    `Skywire needs ${skywirePermissionTierLabel(upgradeTier)} permissions for this action. Reconnect Bluesky and choose ${skywirePermissionTierLabel(upgradeTier)} or higher.`
  );
  (err as any).status = 403;
  (err as any).code = "atproto_scope_upgrade_required";
  (err as any).action = "upgrade_atproto_permissions";
  (err as any).capability = capability;
  (err as any).requiredTier = upgradeTier;
  throw err;
}

function requireSkywireChatCapability(account: typeof atprotoAccounts.$inferSelect) {
  if (accountHasAtprotoCapability(account, "chat")) return;
  const err = new Error(
    "Skywire needs the Bluesky chat add-on for DMs. Reconnect Bluesky from the Account tab and enable DM access."
  );
  (err as any).status = 403;
  (err as any).code = "atproto_chat_scope_required";
  (err as any).action = "upgrade_atproto_chat_permissions";
  (err as any).capability = "chat";
  throw err;
}

function atprotoSessionPayload(err: unknown) {
  if (!isAtprotoSessionUnavailableError(err)) return null;
  return {
    error: err.message,
    code: err.code,
    action: err.action,
    reason: err.reason,
  };
}

function skywireChatAgent(agent: Awaited<ReturnType<typeof getAtprotoAgentForDid>>) {
  return agent.withProxy("bsky_chat", "did:web:api.bsky.chat");
}

function skywirePublicBaseUrl(req: Request): string {
  return resolveCanonicalPublicOrigin(process.env, `${req.protocol}://${req.get("host")}`);
}

function safeTimingEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function skywireChatMediaFileToken(input: { mediaId: number; ownerUserId: number; expiresAt: number }): string {
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySkywireChatMediaFileToken(token: string, mediaId: number): { mediaId: number; ownerUserId: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  if (!safeTimingEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      mediaId?: unknown;
      ownerUserId?: unknown;
      expiresAt?: unknown;
    };
    const decodedMediaId = Number(decoded.mediaId);
    const ownerUserId = Number(decoded.ownerUserId);
    const expiresAt = Number(decoded.expiresAt);
    if (!Number.isInteger(decodedMediaId) || decodedMediaId !== mediaId) return null;
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) return null;
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { mediaId: decodedMediaId, ownerUserId };
  } catch {
    return null;
  }
}

type SkywireChatMediaAttachment = {
  mediaId: number;
  title: string;
  mimeType: string;
  url: string;
  fileSizeBytes: number | null;
};

function encodeSkywireChatMediaLine(attachment: SkywireChatMediaAttachment): string {
  const payload = Buffer.from(JSON.stringify(attachment)).toString("base64url");
  return `[skywire-media:${payload}] ${attachment.url}`;
}

function decodeSkywireChatMediaLine(line: string): SkywireChatMediaAttachment | null {
  const match = line.match(SKYWIRE_CHAT_MEDIA_LINE_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as Partial<SkywireChatMediaAttachment>;
    const mediaId = Number(payload.mediaId);
    const mimeType = String(payload.mimeType || "").trim();
    const title = String(payload.title || "Media attachment").trim().slice(0, 300) || "Media attachment";
    const url = String(match[2] || payload.url || "").trim();
    const fileSizeBytes = payload.fileSizeBytes == null ? null : Number(payload.fileSizeBytes);
    if (!Number.isInteger(mediaId) || mediaId <= 0 || !mimeType || !url) return null;
    return {
      mediaId,
      title,
      mimeType,
      url,
      fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : null,
    };
  } catch {
    return null;
  }
}

function parseSkywireChatMessageText(rawText: string): { text: string; media: SkywireChatMediaAttachment[] } {
  const media: SkywireChatMediaAttachment[] = [];
  const visibleLines: string[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const attachment = decodeSkywireChatMediaLine(line.trim());
    if (attachment) {
      media.push(attachment);
      continue;
    }
    visibleLines.push(line);
  }
  return {
    text: visibleLines.join("\n").trim(),
    media: media.slice(0, SKYWIRE_CHAT_MEDIA_MAX_ATTACHMENTS),
  };
}

async function resolveSkywireChatMediaAttachments(
  req: Request,
  userId: number,
  attachments: z.infer<typeof chatMediaAttachmentSchema>[]
): Promise<SkywireChatMediaAttachment[]> {
  const ids = Array.from(new Set(attachments.map((attachment) => attachment.mediaId))).slice(0, SKYWIRE_CHAT_MEDIA_MAX_ATTACHMENTS);
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: userMediaLibrary.id,
      ownerUserId: userMediaLibrary.ownerUserId,
      title: userMediaLibrary.title,
      mimeType: userMediaLibrary.mimeType,
      sourceType: userMediaLibrary.sourceType,
      fileSizeBytes: userMediaLibrary.fileSizeBytes,
      status: userMediaLibrary.status,
      uploadStatus: userMediaLibrary.uploadStatus,
    })
    .from(userMediaLibrary)
    .where(and(eq(userMediaLibrary.ownerUserId, userId), inArray(userMediaLibrary.id, ids)));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const baseUrl = skywirePublicBaseUrl(req);
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row || row.sourceType !== "upload" || row.status !== "ready" || row.uploadStatus !== "ready") {
      const err = new Error("One or more Skywire chat media attachments are unavailable");
      (err as any).status = 400;
      throw err;
    }
    const token = skywireChatMediaFileToken({
      mediaId: row.id,
      ownerUserId: userId,
      expiresAt: Date.now() + SKYWIRE_CHAT_MEDIA_TOKEN_TTL_MS,
    });
    return {
      mediaId: row.id,
      title: row.title || "Media attachment",
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes ?? null,
      url: `${baseUrl}/api/skywire/chat-media/${row.id}/file?token=${encodeURIComponent(token)}`,
    };
  });
}

function normalizeActor(actor: any) {
  if (!actor) return null;
  return {
    did: String(actor.did || ""),
    handle: String(actor.handle || "unknown"),
    displayName: actor.displayName || null,
    avatar: actor.avatar || null,
    description: actor.description || null,
    followersCount: Number(actor.followersCount ?? 0),
    followsCount: Number(actor.followsCount ?? 0),
    postsCount: Number(actor.postsCount ?? 0),
  };
}

function embedImages(embed: any): Array<{ thumb: string | null; fullsize: string | null; alt: string }> {
  if (!embed) return [];
  const direct = Array.isArray(embed.images)
    ? embed.images.map((image: any) => ({
        thumb: image.thumb || null,
        fullsize: image.fullsize || image.thumb || null,
        alt: String(image.alt || ""),
      }))
    : [];
  const nested = [
    ...embedImages(embed.media),
    ...embedImages(embed.record?.embeds?.[0]),
    ...embedImages(embed.record?.value?.embed),
  ];
  return [...direct, ...nested].slice(0, 4);
}

function embedExternal(embed: any): { uri: string; title: string; description: string | null; thumb: string | null } | null {
  const external = embed?.external || embed?.media?.external || embed?.record?.embeds?.[0]?.external;
  if (!external?.uri) return null;
  return {
    uri: String(external.uri),
    title: String(external.title || external.uri),
    description: external.description || null,
    thumb: external.thumb || null,
  };
}

function embedVideo(embed: any): { playlist: string | null; thumbnail: string | null; alt: string | null; aspectRatio: { width: number; height: number } | null } | null {
  const candidates = [
    embed,
    embed?.media,
    embed?.record?.embeds?.[0],
    embed?.record?.value?.embed,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const type = String(candidate.$type || "");
    const playlist = candidate.playlist || candidate.video?.playlist || null;
    const thumbnail = candidate.thumbnail || candidate.thumb || candidate.video?.thumbnail || null;
    if (!playlist && !thumbnail && !type.includes("app.bsky.embed.video")) continue;
    const aspectRatio = candidate.aspectRatio || candidate.video?.aspectRatio || null;
    return {
      playlist: playlist ? String(playlist) : null,
      thumbnail: thumbnail ? String(thumbnail) : null,
      alt: candidate.alt ? String(candidate.alt) : null,
      aspectRatio:
        aspectRatio && Number(aspectRatio.width) > 0 && Number(aspectRatio.height) > 0
          ? { width: Number(aspectRatio.width), height: Number(aspectRatio.height) }
          : null,
    };
  }
  return null;
}

function normalizeQuotedRecord(record: any) {
  const view = record?.record?.record || record?.record;
  if (!view?.uri) return null;
  const value = view.value || {};
  return {
    uri: String(view.uri || ""),
    cid: String(view.cid || ""),
    sourceUrl: sourceUrlForAtUri(String(view.uri || ""), view.author?.handle || view.author?.did),
    author: normalizeActor(view.author),
    text: String(value.text || ""),
    createdAt: value.createdAt || view.indexedAt || null,
    indexedAt: view.indexedAt || null,
    embed: {
      images: embedImages(view.embeds?.[0] || value.embed),
      external: embedExternal(view.embeds?.[0] || value.embed),
      video: embedVideo(view.embeds?.[0] || value.embed),
    },
    state: view.notFound ? "not_found" : view.blocked ? "blocked" : view.detached ? "detached" : "visible",
  };
}

function richTextFacetLinkUris(record: any): string[] {
  const facets = Array.isArray(record?.facets) ? record.facets : [];
  const links = new Set<string>();
  for (const facet of facets) {
    const features = Array.isArray(facet?.features) ? facet.features : [];
    for (const feature of features) {
      const featureType = String(feature?.$type || "");
      const uri = typeof feature?.uri === "string" ? feature.uri.trim() : "";
      if (featureType.includes("app.bsky.richtext.facet#link") && uri) links.add(uri);
    }
  }
  return Array.from(links).slice(0, 12);
}

function normalizeRoomMessageRecord(row: {
  repoDid: string;
  repoHandle: string | null;
  uri: string;
  cid: string;
  value: any;
}) {
  const value = row.value || {};
  const quotedPost = value.quotedPost?.uri
    ? {
        uri: String(value.quotedPost.uri || ""),
        cid: value.quotedPost.cid ? String(value.quotedPost.cid) : "",
        sourceUrl: value.quotedPost.sourceUrl || sourceUrlForAtUri(String(value.quotedPost.uri || "")),
        author: {
          did: String(value.quotedPost.authorDid || ""),
          handle: String(value.quotedPost.authorHandle || "unknown"),
          displayName: null,
          avatar: null,
          description: null,
        },
        text: String(value.quotedPost.text || ""),
        createdAt: value.quotedPost.createdAt || null,
        indexedAt: value.createdAt || null,
        embed: { images: [], external: null },
        state: "visible",
      }
    : null;
  return {
    uri: row.uri,
    cid: row.cid,
    roomId: String(value.roomId || ""),
    text: String(value.text || ""),
    createdAt: value.createdAt || null,
    author: {
      did: String(value.authorDid || row.repoDid),
      handle: String(value.authorHandle || row.repoHandle || row.repoDid),
      displayName: value.authorDisplayName || null,
      avatar: value.authorAvatar || null,
      description: null,
    },
    audienceDids: Array.isArray(value.audienceDids) ? value.audienceDids.map(String).slice(0, 50) : [],
    quotedPost,
  };
}

function normalizeStageBroadcastRecord(row: {
  repoDid: string;
  repoHandle: string | null;
  uri: string;
  cid: string;
  value: any;
}) {
  const value = row.value || {};
  const quotedPost = value.quotedPost?.uri
    ? {
        uri: String(value.quotedPost.uri || ""),
        cid: value.quotedPost.cid ? String(value.quotedPost.cid) : "",
        sourceUrl: value.quotedPost.sourceUrl || sourceUrlForAtUri(String(value.quotedPost.uri || "")),
        author: {
          did: String(value.quotedPost.authorDid || ""),
          handle: String(value.quotedPost.authorHandle || "unknown"),
          displayName: null,
          avatar: null,
          description: null,
        },
        text: String(value.quotedPost.text || ""),
        createdAt: value.quotedPost.createdAt || null,
        indexedAt: value.createdAt || null,
        embed: { images: [], external: null },
        state: "visible",
      }
    : null;
  return {
    uri: row.uri,
    cid: row.cid,
    stageId: String(value.stageId || ""),
    text: String(value.text || ""),
    mode: String(value.mode || "text"),
    liveUrl: value.liveUrl || null,
    createdAt: value.createdAt || null,
    broadcaster: {
      did: String(value.authorDid || row.repoDid),
      handle: String(value.authorHandle || row.repoHandle || row.repoDid),
      displayName: value.authorDisplayName || null,
      avatar: value.authorAvatar || null,
      description: null,
    },
    quotedPost,
  };
}

function normalizeChatConvo(convo: any) {
  const kindType = String(convo?.kind?.$type || "");
  return {
    id: String(convo?.id || ""),
    rev: String(convo?.rev || ""),
    status: convo?.status || null,
    muted: Boolean(convo?.muted),
    unreadCount: Number(convo?.unreadCount ?? 0),
    kind: kindType.includes("groupConvo") ? "group" : "direct",
    groupName: convo?.kind?.name || null,
    memberCount: Number(convo?.kind?.memberCount ?? convo?.members?.length ?? 0),
    members: Array.isArray(convo?.members) ? convo.members.map(normalizeActor).filter(Boolean) : [],
    lastMessage: normalizeChatMessage(convo?.lastMessage),
  };
}

function normalizeChatMessage(message: any) {
  if (!message?.id) return null;
  const isDeleted = String(message?.$type || "").includes("deletedMessageView");
  const isSystem = String(message?.$type || "").includes("systemMessageView");
  const parsedText = parseSkywireChatMessageText(String(message.text || ""));
  return {
    id: String(message.id || ""),
    rev: String(message.rev || ""),
    text: isDeleted ? "(deleted)" : isSystem ? "System message" : parsedText.text,
    senderDid: message.sender?.did || null,
    sentAt: message.sentAt || null,
    deleted: isDeleted,
    system: isSystem,
    media: isDeleted || isSystem ? [] : parsedText.media,
    quote: normalizeQuotedRecord(message.embed),
  };
}

function chatMessageInputFromBody(
  body: z.infer<typeof chatMessageBaseSchema>,
  mediaAttachments: SkywireChatMediaAttachment[]
) {
  const quotedPost = body.quotedPost?.uri ? body.quotedPost : null;
  const embed =
    quotedPost?.cid && quotedPost.uri
      ? {
          $type: "app.bsky.embed.record",
          record: strongRef(quotedPost.uri, quotedPost.cid),
        }
      : undefined;
  const textParts = [
    body.text.trim(),
    ...mediaAttachments.map(encodeSkywireChatMediaLine),
  ].filter(Boolean);
  return {
    text: textParts.join("\n") || (quotedPost ? "[quoted post]" : "[media attachment]"),
    ...(embed ? { embed } : {}),
  };
}

function normalizePostView(post: any) {
  const record = post?.record ?? {};
  const reply = record?.reply ?? null;
  const external = embedExternal(post?.embed);
  return {
    uri: String(post?.uri || ""),
    cid: String(post?.cid || ""),
    sourceUrl: sourceUrlForAtUri(String(post?.uri || ""), post?.author?.handle || post?.author?.did),
    author: normalizeActor(post?.author),
    text: String(record?.text || ""),
    createdAt: record?.createdAt || post?.indexedAt || null,
    indexedAt: post?.indexedAt || null,
    replyRoot: reply?.root ? { uri: reply.root.uri, cid: reply.root.cid } : null,
    replyParent: reply?.parent ? { uri: reply.parent.uri, cid: reply.parent.cid } : null,
    counts: {
      reply: Number(post?.replyCount ?? 0),
      repost: Number(post?.repostCount ?? 0),
      like: Number(post?.likeCount ?? 0),
      quote: Number(post?.quoteCount ?? 0),
    },
    viewer: {
      like: post?.viewer?.like || null,
      repost: post?.viewer?.repost || null,
      threadMuted: Boolean(post?.viewer?.threadMuted),
      embeddingDisabled: Boolean(post?.viewer?.embeddingDisabled),
    },
    embed: {
      images: embedImages(post?.embed),
      external,
      video: embedVideo(post?.embed),
    },
    links: richTextFacetLinkUris(record),
    quote: normalizeQuotedRecord(post?.embed),
  };
}

function normalizeFeedItem(item: any) {
  const post = item?.post ?? item;
  const reason = item?.reason?.by
    ? {
        type: String(item.reason.$type || "").includes("reasonRepost") ? "repost" : "reason",
        by: normalizeActor(item.reason.by),
        indexedAt: item.reason.indexedAt || null,
      }
    : null;
  return { post: normalizePostView(post), reason };
}

function normalizeThreadNode(node: any): any {
  if (!node) return null;
  const type = String(node.$type || "");
  if (type.includes("notFoundPost")) {
    return {
      state: "not_found",
      uri: String(node.uri || ""),
      post: null,
      parent: null,
      replies: [],
    };
  }
  if (type.includes("blockedPost")) {
    return {
      state: "blocked",
      uri: String(node.uri || ""),
      post: null,
      parent: null,
      replies: [],
    };
  }
  const post = node.post ? normalizePostView(node.post) : null;
  return {
    state: post ? "visible" : "unknown",
    uri: String(node.uri || post?.uri || ""),
    post,
    parent: normalizeThreadNode(node.parent),
    replies: Array.isArray(node.replies) ? node.replies.map(normalizeThreadNode).filter(Boolean) : [],
  };
}

function normalizeNotification(item: any) {
  return {
    uri: String(item?.uri || ""),
    cid: String(item?.cid || ""),
    reason: String(item?.reason || "notification"),
    reasonSubject: item?.reasonSubject || null,
    indexedAt: item?.indexedAt || null,
    isRead: Boolean(item?.isRead),
    author: normalizeActor(item?.author),
    post: normalizePostView(item),
  };
}

function pickMetadataString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSkywireTokenDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSkywireVaultToken(row: {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  balance: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata: unknown;
  creatorAddress: string | null;
  lastSeenAt: Date | string | null;
}): SkywireTokenSummary & {
  walletAddress: string;
  balance: string;
  lastSeenAt: string | null;
  source: "wallet_holdings";
} {
  const meta = row.metadata && typeof row.metadata === "object"
    ? row.metadata as Record<string, any>
    : {};
  const collection =
    pickMetadataString(meta.collectionName) ??
    pickMetadataString(meta.collection?.name) ??
    pickMetadataString(meta.contract?.name) ??
    pickMetadataString(meta.fa?.name);
  const image =
    normalizeTokenImageUrl(row.tokenThumbnail) ??
    normalizeTokenImageUrl(meta.thumbnailUri) ??
    normalizeTokenImageUrl(meta.thumbnail_uri) ??
    normalizeTokenImageUrl(meta.displayUri) ??
    normalizeTokenImageUrl(meta.display_uri) ??
    normalizeTokenImageUrl(meta.artifactUri) ??
    normalizeTokenImageUrl(meta.artifact_uri);
  const lastSeenDate = row.lastSeenAt
    ? row.lastSeenAt instanceof Date
      ? row.lastSeenAt
      : new Date(row.lastSeenAt)
    : null;
  const lastSeen = lastSeenDate && !Number.isNaN(lastSeenDate.getTime())
    ? lastSeenDate.toISOString()
    : null;
  const mintedAt =
    normalizeSkywireTokenDate(meta.mintedAt) ??
    normalizeSkywireTokenDate(meta.minted_at) ??
    normalizeSkywireTokenDate(meta.timestamp) ??
    normalizeSkywireTokenDate(meta.date) ??
    normalizeSkywireTokenDate(meta.createdAt) ??
    normalizeSkywireTokenDate(meta.created_at) ??
    normalizeSkywireTokenDate(meta.firstTime) ??
    normalizeSkywireTokenDate(meta.first_time);
  return {
    walletAddress: row.walletAddress,
    balance: row.balance,
    lastSeenAt: lastSeen,
    source: "wallet_holdings",
    faContract: row.tokenContract,
    tokenId: row.tokenId,
    title: row.tokenName ?? pickMetadataString(meta.name) ?? `${row.tokenContract} #${row.tokenId}`,
    imageUrl: image,
    creatorAddress: row.creatorAddress ?? pickMetadataString(meta.creatorAddress),
    creatorName: pickMetadataString(meta.creatorName) ?? pickMetadataString(meta.creator),
    collectionName: collection,
    mintedAt,
    marketUrl: `https://objkt.com/tokens/${row.tokenContract}/${row.tokenId}`,
  };
}

function recordSkywireSystemEvent(
  user: any,
  eventType: "skywire.token_link.resolved" | "skywire.token_listing.buy_requested" | "skywire.tezos_vault.viewed",
  rawRefType: string,
  rawRefId: string,
  metadata: Record<string, unknown> = {},
) {
  void ingestSystemEvent({
    eventType,
    userId: user?.id ?? null,
    source: "skywire",
    sourceModule: "skywire",
    rawRefType,
    rawRefId,
    metadata,
  }).catch((err: any) => {
    console.warn("[skywire] system event failed:", eventType, err?.message || err);
  });
}

function feedSearchQuery(feedType: string, q?: string): string {
  if (feedType === "tezos") return q || "(objkt OR teia OR fxhash OR tezos OR tez OR xtz OR .tez OR WTF)";
  if (feedType === "market") return q || "(objkt.com OR teia.art)";
  return q || "(Bluesky OR ATProto OR AT Protocol)";
}

function skywireMarketplaceTokenUrls(post: ReturnType<typeof normalizePostView>): string[] {
  return extractSkywireTokenUrlsFromValues(
    [
      post.text,
      post.embed.external?.uri,
      post.embed.external?.title,
      post.embed.external?.description,
      ...(Array.isArray(post.links) ? post.links : []),
    ],
    8,
  );
}

function uniqueSkywireFeedItems(items: ReturnType<typeof normalizeFeedItem>[]): ReturnType<typeof normalizeFeedItem>[] {
  const seen = new Set<string>();
  const unique: ReturnType<typeof normalizeFeedItem>[] = [];
  for (const item of items) {
    const key = item.post.uri || item.post.cid;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function decodeMarketFeedCursor(cursor: string | undefined): Record<string, string> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(
          ([domain, value]) =>
            SKYWIRE_MARKET_FEED_DOMAINS.includes(domain as any) &&
            typeof value === "string" &&
            value.trim(),
        )
        .map(([domain, value]) => [domain, String(value)]),
    );
  } catch {
    return {};
  }
}

function encodeMarketFeedCursor(cursors: Record<string, string | null | undefined>): string | null {
  const active = Object.fromEntries(
    Object.entries(cursors).filter(([, value]) => typeof value === "string" && value.trim()),
  );
  return Object.keys(active).length ? Buffer.from(JSON.stringify(active)).toString("base64url") : null;
}

function officialWtfAtprotoActor(): string {
  return process.env.SKYWIRE_WTF_ATPROTO_ACTOR || process.env.ATPROTO_WTF_ACTOR || "wtfgameshow.bsky.social";
}

function officialTezosAtprotoActors(): string[] {
  const configured = String(process.env.SKYWIRE_TEZOS_ATPROTO_ACTORS || "")
    .split(",")
    .map((actor) => actor.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return configured.slice(0, 25);
  return [
    "tezos.com",
    "tezosfoundation.bsky.social",
    "tezoscommons.org",
    "thetezoscommunity.bsky.social",
    "objkt.com",
    "teia.bsky.social",
    "fxhash.bsky.social",
    "etherlink.bsky.social",
    "1x1music.bsky.social",
    "tezosnews.bsky.social",
  ];
}

function skywirePipelineRefKey(uri: string) {
  return createHash("sha256").update(uri).digest("hex").slice(0, 16);
}

function skywirePipelineById(id: z.infer<typeof skywirePipelineIdSchema>) {
  return SKYWIRE_PIPELINES.find((pipeline) => pipeline.id === id) ?? null;
}

function skywirePipelineEventTypes() {
  return SKYWIRE_PIPELINES.map((pipeline) => pipeline.eventType);
}

async function dispatchSkywirePipeline(input: {
  user: any;
  account: typeof atprotoAccounts.$inferSelect | null;
  pipeline: (typeof SKYWIRE_PIPELINES)[number];
  post: z.infer<typeof skywirePipelinePostSchema>;
  note?: string | null;
}) {
  const { user, account, pipeline, post } = input;
  const refKey = skywirePipelineRefKey(post.uri);
  const actorDid = account?.did ?? `did:wtf:local-user-${user.id}`;
  const actorHandle = account?.handle ?? user.username ?? null;
  const baseMetadata = {
    pipelineId: pipeline.id,
    pipelineTitle: pipeline.title,
    targetApp: pipeline.app,
    appRoute: pipeline.appRoute,
    postUri: post.uri,
    postCid: post.cid ?? null,
    postSourceUrl: post.sourceUrl || sourceUrlForAtUri(post.uri),
    postText: post.text || "",
    postAuthorHandle: post.authorHandle ?? null,
    postAuthorDid: post.authorDid ?? null,
    postCreatedAt: post.createdAt ?? null,
    tags: post.tags,
    note: input.note || null,
    actorDid,
    actorHandle,
    storage: "wtfos_system_events",
    canonicalPdsWrite: false,
  };
  const pipelineBridge = issueAtprotoBridgeCredential("skywire.pipeline", pipeline.eventType);
  const event = await ingestSystemEvent({
    eventId: `${pipeline.eventType}:${user.id}:${refKey}`,
    eventType: pipeline.eventType,
    userId: user.id,
    source: "atproto",
    sourceModule: "skywire-pipeline",
    rawRefType: "atproto_post",
    rawRefId: post.uri,
    atprotoBridge: pipelineBridge,
    metadata: baseMetadata,
  });
  const interactionBridge = issueAtprotoBridgeCredential("skywire.pipeline", "app.interaction.tracked");
  const interactionEvent = await ingestSystemEvent({
    eventId: `app.interaction.tracked:skywire:${pipeline.id}:${user.id}:${refKey}`,
    eventType: "app.interaction.tracked",
    userId: user.id,
    source: "atproto",
    sourceModule: "skywire-pipeline",
    rawRefType: "atproto_post",
    rawRefId: post.uri,
    atprotoBridge: interactionBridge,
    metadata: {
      ...baseMetadata,
      interaction: "skywire.pipeline.dispatch",
      eventType: pipeline.eventType,
    },
  });
  return {
    pipeline,
    event: {
      id: event.event.id,
      eventId: event.event.eventId,
      eventType: event.event.eventType,
      deduped: event.deduped,
    },
    interactionEvent: {
      id: interactionEvent.event.id,
      eventId: interactionEvent.event.eventId,
      eventType: interactionEvent.event.eventType,
      deduped: interactionEvent.deduped,
    },
  };
}

function actorIdentityKeys(actor: any): string[] {
  return [actor?.did, actor?.handle]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

router.get("/api/skywire/share-intent", (req, res) => {
  res.json({ url: buildBskyIntentUrl(String(req.query.text || "")) });
});

router.get("/api/skywire/status", isAuthenticated, requireSkywireRollout, async (req, res) => {
  const user = req.user as any;
  const rollout = skywireRolloutStatusForRole(user.roles ?? user.role ?? null);
  res.json({
    ...rollout,
    pipelines: SKYWIRE_PIPELINES.filter((pipeline) => pipeline.id === "wtf-live" || rollout.wtfLiveEligible),
  });
});

router.use("/api/skywire", isAuthenticated, requireSkywireRollout);


router.get("/api/skywire/pipelines", isAuthenticated, async (_req, res) => {
  res.json({
    pipelines: SKYWIRE_PIPELINES,
    source: "skywire.systemEventPipelines",
    storage: "wtfos_system_events",
    writesCanonicalPdsState: false,
  });
});

router.get("/api/skywire/pipelines/history", isAuthenticated, async (req, res) => {
  const parsed = skywirePipelineHistorySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire pipeline history query" });
  const user = req.user as any;
  const eventTypes = parsed.data.pipelineId
    ? [skywirePipelineById(parsed.data.pipelineId)?.eventType].filter(Boolean)
    : skywirePipelineEventTypes();
  const rows = await db
    .select()
    .from(challengeSystemEvents)
    .where(
      and(
        eq(challengeSystemEvents.userId, user.id),
        eq(challengeSystemEvents.sourceModule, "skywire-pipeline"),
        inArray(challengeSystemEvents.eventType, eventTypes as string[])
      )
    )
    .orderBy(desc(challengeSystemEvents.occurredAt), desc(challengeSystemEvents.id))
    .limit(parsed.data.limit);
  res.json({
    events: rows.map((event) => ({
      id: event.id,
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      rawRefType: event.rawRefType,
      rawRefId: event.rawRefId,
      metadata: event.metadata ?? {},
    })),
    source: "challenge_system_events",
    sourceModule: "skywire-pipeline",
    storage: "wtfos_system_events",
  });
});

router.post("/api/skywire/pipelines/dispatch", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = skywirePipelineDispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire pipeline dispatch" });
  const pipeline = skywirePipelineById(parsed.data.pipelineId);
  if (!pipeline) return res.status(400).json({ error: "Unknown Skywire pipeline" });
  if (pipeline.id === "wtf-live") {
    const rollout = skywireRolloutStatusForRole(user.roles ?? user.role ?? null);
    if (!rollout.wtfLiveEligible) {
      return res.status(403).json({
        error: "WTF LIVE is not available for your account yet",
        code: "wtf_live_rollout_denied",
      });
    }
  }

  const account = await linkedAccountForUser(user.id);
  const result = await dispatchSkywirePipeline({
    user,
    account,
    pipeline,
    post: parsed.data.post,
    note: parsed.data.note,
  });
  res.status(201).json({
    ...result,
    source: "skywire.systemEventPipelines",
  });
});

router.post("/api/skywire/pipelines/dispatch-batch", actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = skywirePipelineBatchDispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire pipeline batch dispatch" });
  const rollout = skywireRolloutStatusForRole(user.roles ?? user.role ?? null);
  if (parsed.data.pipelineIds.includes("wtf-live") && !rollout.wtfLiveEligible) {
    return res.status(403).json({
      error: "WTF LIVE is not available for your account yet",
      code: "wtf_live_rollout_denied",
    });
  }
  const account = await linkedAccountForUser(user.id);
  const results = [];
  for (const pipelineId of parsed.data.pipelineIds) {
    const pipeline = skywirePipelineById(pipelineId);
    if (!pipeline) continue;
    results.push(
      await dispatchSkywirePipeline({
        user,
        account,
        pipeline,
        post: parsed.data.post,
        note: parsed.data.note,
      })
    );
  }
  res.status(201).json({
    results,
    count: results.length,
    source: "skywire.systemEventPipelines",
  });
});

router.get("/api/skywire/chat-media/:mediaId/file", async (req, res) => {
  const user = req.user as any;
  const mediaId = Number(req.params.mediaId);
  const token = String(req.query.token || "");
  if (!Number.isInteger(mediaId) || mediaId <= 0 || !token) {
    return res.status(400).json({ error: "Invalid Skywire chat media link" });
  }
  const grant = verifySkywireChatMediaFileToken(token, mediaId);
  if (!grant) return res.status(403).json({ error: "Skywire chat media link expired or invalid" });

  const account = await requireLinkedAccount(user.id);
  requireSkywireChatCapability(account);

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
    })
    .from(userMediaLibrary)
    .where(eq(userMediaLibrary.id, mediaId));

  if (!item || item.sourceType !== "upload" || item.ownerUserId !== grant.ownerUserId) {
    return res.status(404).json({ error: "Skywire chat media not found" });
  }
  const served = await serveStoredMediaFile(req, res, item);
  if (!served) res.status(404).json({ error: "Skywire chat media file not found" });
});

router.get("/api/skywire/chats", isAuthenticated, async (req, res) => {
  const parsed = chatConvosQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire chat query" });
  const account = await requireLinkedAccount((req.user as any).id);
  requireSkywireChatCapability(account);
  const agent = skywireChatAgent(await getAtprotoAgentForDid(account.did));
  const convos = await agent.chat.bsky.convo.listConvos({
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    status: "accepted",
  });
  res.json({
    convos: (convos.data.convos ?? []).map(normalizeChatConvo),
    cursor: convos.data.cursor || null,
    source: "chat.bsky.convo.listConvos",
    service: "did:web:api.bsky.chat#bsky_chat",
  });
});

router.post("/api/skywire/chats/resolve", isAuthenticated, actionLimiter, async (req, res) => {
  const parsed = chatMembersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire chat members" });
  const account = await requireLinkedAccount((req.user as any).id);
  requireSkywireChatCapability(account);
  const agent = skywireChatAgent(await getAtprotoAgentForDid(account.did));
  const convo = await agent.chat.bsky.convo.getConvoForMembers({ members: parsed.data.members });
  res.json({
    convo: normalizeChatConvo(convo.data.convo),
    source: "chat.bsky.convo.getConvoForMembers",
  });
});

router.get("/api/skywire/chats/:convoId/messages", isAuthenticated, async (req, res) => {
  const convoId = convoIdSchema.safeParse(req.params.convoId);
  const parsed = chatMessagesQuerySchema.safeParse(req.query);
  if (!convoId.success || !parsed.success) return res.status(400).json({ error: "Invalid Skywire chat message query" });
  const account = await requireLinkedAccount((req.user as any).id);
  requireSkywireChatCapability(account);
  const agent = skywireChatAgent(await getAtprotoAgentForDid(account.did));
  const messages = await agent.chat.bsky.convo.getMessages({
    convoId: convoId.data,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  const relatedProfiles = new Map(
    (messages.data.relatedProfiles ?? [])
      .map((profile) => normalizeActor(profile))
      .filter(Boolean)
      .map((profile: any) => [profile.did, profile])
  );
  res.json({
    convoId: convoId.data,
    messages: (messages.data.messages ?? []).map((message) => {
      const normalized = normalizeChatMessage(message);
      return normalized
        ? {
            ...normalized,
            sender: normalized.senderDid ? relatedProfiles.get(normalized.senderDid) ?? null : null,
          }
        : normalized;
    }).filter(Boolean),
    cursor: messages.data.cursor || null,
    source: "chat.bsky.convo.getMessages",
  });
});

router.post("/api/skywire/chats/:convoId/messages", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const convoId = convoIdSchema.safeParse(req.params.convoId);
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!convoId.success || !parsed.success) return res.status(400).json({ error: "Invalid Skywire chat message" });
  const account = await requireLinkedAccount(user.id);
  requireSkywireChatCapability(account);
  const agent = skywireChatAgent(await getAtprotoAgentForDid(account.did));
  const mediaAttachments = await resolveSkywireChatMediaAttachments(req, user.id, parsed.data.media);
  const messageInput = chatMessageInputFromBody(parsed.data, mediaAttachments);
  const result = await agent.chat.bsky.convo.sendMessage(
    {
      convoId: convoId.data,
      message: messageInput,
    },
    { encoding: "application/json" }
  );
  await emitAtprotoSystemEvent({
    eventType: "atproto.chat.message_sent",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    text: parsed.data.text || (mediaAttachments.length ? "[media attachment]" : "[quoted post]"),
    rawRefType: "atproto_chat_message",
    rawRefId: `${convoId.data}:${result.data.id}`,
    metadata: {
      convoId: convoId.data,
      messageId: result.data.id,
      quotedUri: parsed.data.quotedPost?.uri ?? null,
      mediaIds: mediaAttachments.map((attachment) => attachment.mediaId),
      mediaCount: mediaAttachments.length,
    },
  });
  res.status(201).json({
    message: normalizeChatMessage(result.data),
    source: "chat.bsky.convo.sendMessage",
  });
});

router.post("/api/skywire/chats/send", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = chatSendToMembersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire chat send payload" });
  const account = await requireLinkedAccount(user.id);
  requireSkywireChatCapability(account);
  const agent = skywireChatAgent(await getAtprotoAgentForDid(account.did));
  const convo = await agent.chat.bsky.convo.getConvoForMembers({ members: parsed.data.members });
  const mediaAttachments = await resolveSkywireChatMediaAttachments(req, user.id, parsed.data.media);
  const messageInput = chatMessageInputFromBody(parsed.data, mediaAttachments);
  const result = await agent.chat.bsky.convo.sendMessage(
    {
      convoId: convo.data.convo.id,
      message: messageInput,
    },
    { encoding: "application/json" }
  );
  await emitAtprotoSystemEvent({
    eventType: "atproto.chat.message_sent",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    text: parsed.data.text || (mediaAttachments.length ? "[media attachment]" : "[quoted post]"),
    rawRefType: "atproto_chat_message",
    rawRefId: `${convo.data.convo.id}:${result.data.id}`,
    metadata: {
      convoId: convo.data.convo.id,
      messageId: result.data.id,
      members: parsed.data.members,
      quotedUri: parsed.data.quotedPost?.uri ?? null,
      mediaIds: mediaAttachments.map((attachment) => attachment.mediaId),
      mediaCount: mediaAttachments.length,
    },
  });
  res.status(201).json({
    convo: normalizeChatConvo(convo.data.convo),
    message: normalizeChatMessage(result.data),
    source: "chat.bsky.convo.sendMessage",
  });
});

router.get("/api/skywire/token-link", isAuthenticated, async (req, res) => {
  const parsed = tokenLinkQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid token link query" });
  try {
    const market = await resolveSkywireTokenMarket(parsed.data.url);
    recordSkywireSystemEvent(req.user, "skywire.token_link.resolved", "tezos_token", `${market.reference.faContract ?? market.reference.faSlug ?? "unknown"}:${market.reference.tokenId}`, {
      sourceUrl: market.reference.sourceUrl,
      marketplaceSource: market.source,
      listingKind: market.listing?.kind ?? null,
      directBuySupported: market.purchaseIntent.supported,
    });
    res.json(market);
  } catch (err: any) {
    const message = String(err?.message || "Token market lookup failed");
    if (/not a supported Tezos token link/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    console.warn("[skywire] token-link lookup failed:", message);
    res.status(502).json({ error: "Token market lookup failed" });
  }
});

router.post("/api/skywire/events", isAuthenticated, actionLimiter, async (req, res) => {
  const parsed = skywireClientEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire event" });
  const user = req.user as any;
  recordSkywireSystemEvent(
    user,
    parsed.data.eventType,
    "tezos_token",
    parsed.data.tokenRef ?? "skywire",
    parsed.data.metadata ?? {},
  );
  res.json({ ok: true });
});

router.get("/api/skywire/tezos-vault", isAuthenticated, async (req, res) => {
  const parsed = tezosVaultQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Tezos vault query" });
  const user = req.user as any;
  const limit = parsed.data.limit;

  const wallets = await db
    .select({
      id: userWallets.id,
      walletAddress: userWallets.walletAddress,
      tezDomain: userWallets.tezDomain,
      isPrimary: userWallets.isPrimary,
      linkedAt: userWallets.linkedAt,
      lastSyncedAt: userWallets.lastSyncedAt,
    })
    .from(userWallets)
    .where(eq(userWallets.userId, user.id))
    .orderBy(desc(userWallets.isPrimary), asc(userWallets.linkedAt));

  const lastSeenExpr = sql<Date | null>`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;
  const ownedRows = wallets.length
    ? await db
        .select({
          walletAddress: walletHoldings.walletAddress,
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          balance: walletHoldings.balance,
          tokenName: tokenMetadata.name,
          tokenThumbnail: tokenMetadata.thumbnail,
          metadata: tokenMetadata.raw,
          creatorAddress: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
          lastSeenAt: lastSeenExpr,
        })
        .from(walletHoldings)
        .leftJoin(
          tokenMetadata,
          and(
            eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
            eq(tokenMetadata.tokenId, walletHoldings.tokenId),
          ),
        )
        .where(eq(walletHoldings.userId, user.id))
        .orderBy(desc(lastSeenExpr))
        .limit(limit)
    : [];

  let createdError: string | null = null;
  let createdItems: SkywireTokenSummary[] = [];
  try {
    createdItems = await fetchObjktCreatedTokens(
      wallets.map((wallet) => wallet.walletAddress),
      limit,
    );
  } catch (err: any) {
    createdError = "Created-token lookup is temporarily unavailable.";
    console.warn("[skywire] created token lookup failed:", err?.message || err);
  }

  const response = {
    generatedAt: new Date().toISOString(),
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      walletAddress: wallet.walletAddress,
      tezDomain: wallet.tezDomain,
      isPrimary: wallet.isPrimary,
      linkedAt: wallet.linkedAt,
      lastSyncedAt: wallet.lastSyncedAt,
    })),
    owned: {
      source: "wallet_holdings",
      items: ownedRows.map(normalizeSkywireVaultToken),
      total: ownedRows.length,
    },
    created: {
      source: "objkt",
      items: createdItems,
      total: createdItems.length,
      error: createdError,
    },
  };
  recordSkywireSystemEvent(user, "skywire.tezos_vault.viewed", "tezos_wallet", wallets.map((wallet) => wallet.walletAddress).join(",") || "none", {
    walletCount: wallets.length,
    ownedCount: response.owned.total,
    createdCount: response.created.total,
    createdLookupError: createdError,
  });
  res.json(response);
});

router.get("/api/skywire/feed", isAuthenticated, async (req, res) => {
  const parsed = feedQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire feed query" });
  const { feedType, q, cursor, limit } = parsed.data;
  const account = await linkedAccountForUser((req.user as any).id);
  if ((feedType === "home" || feedType === "following") && account) {
    let agent;
    try {
      agent = await getAtprotoAgentForDid(account.did);
    } catch (err) {
      const payload = atprotoSessionPayload(err);
      if (payload) return res.status(409).json(payload);
      throw err;
    }
    const timeline = await agent.getTimeline({ limit, cursor });
    return res.json({
      feedType: "home",
      source: "app.bsky.feed.getTimeline",
      feed: (timeline.data.feed ?? []).map(normalizeFeedItem),
      cursor: timeline.data.cursor ?? null,
      upstreamAvailable: true,
    });
  }
  if (feedType === "wtf") {
    const agent = getPublicAtprotoAgent();
    const actor = q?.trim() || officialWtfAtprotoActor();
    const feed = await agent.getAuthorFeed({
      actor,
      limit,
      cursor,
      filter: "posts_no_replies",
    });
    return res.json({
      feedType: "wtf",
      source: "app.bsky.feed.getAuthorFeed",
      actor,
      feed: (feed.data.feed ?? []).map(normalizeFeedItem),
      cursor: feed.data.cursor ?? null,
      upstreamAvailable: true,
      sessionFallback: false,
    });
  }
  if (feedType === "tezos") {
    const agent = getPublicAtprotoAgent();
    const actors = officialTezosAtprotoActors();
    const perActorLimit = Math.max(3, Math.min(10, Math.ceil(limit / Math.max(1, actors.length)) + 2));
    const feeds = await Promise.allSettled(
      actors.map((actor) =>
        agent.getAuthorFeed({
          actor,
          limit: perActorLimit,
          filter: "posts_no_replies",
        })
      )
    );
    const feed = feeds
      .flatMap((result, index) => {
        if (result.status !== "fulfilled") {
          console.warn("[skywire] curated Tezos actor feed failed:", actors[index], result.reason);
          return [];
        }
        const actorKey = actors[index].toLowerCase();
        return (result.value.data.feed ?? [])
          .map(normalizeFeedItem)
          .filter((item) => actorIdentityKeys(item.post.author).includes(actorKey));
      })
      .sort((a, b) => {
        const aTime = new Date(a.post.indexedAt || a.post.createdAt || 0).getTime();
        const bTime = new Date(b.post.indexedAt || b.post.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);
    return res.json({
      feedType: "tezos",
      source: "skywire.curatedTezosAuthorFeeds",
      actors,
      feed,
      cursor: null,
      upstreamAvailable: true,
      sessionFallback: false,
    });
  }
  if (feedType === "market") {
    const agent = getSearchAtprotoAgent();
    const domainCursors = decodeMarketFeedCursor(cursor);
    const perDomainLimit = Math.min(100, Math.max(limit * 2, 25));
    const searches = await Promise.allSettled(
      SKYWIRE_MARKET_FEED_DOMAINS.map((domain) =>
        agent.app.bsky.feed.searchPosts({
          q: q?.trim() || SKYWIRE_MARKET_FEED_QUERY_BY_DOMAIN[domain],
          domain,
          sort: "latest",
          limit: perDomainLimit,
          cursor: domainCursors[domain],
        })
      )
    );
    const nextCursors: Record<string, string | null | undefined> = {};
    const feed = uniqueSkywireFeedItems(
      searches.flatMap((result, index) => {
        const domain = SKYWIRE_MARKET_FEED_DOMAINS[index];
        if (result.status !== "fulfilled") {
          console.warn("[skywire] marketplace domain search failed:", domain, result.reason);
          return [];
        }
        nextCursors[domain] = result.value.data.cursor ?? null;
        return (result.value.data.posts ?? [])
          .map((post) => normalizeFeedItem({ post }))
          .filter((item) => skywireMarketplaceTokenUrls(item.post).some((url) => parseSkywireTokenUrl(url)));
      })
    )
      .sort((a, b) => {
        const aTime = new Date(a.post.indexedAt || a.post.createdAt || 0).getTime();
        const bTime = new Date(b.post.indexedAt || b.post.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);
    const upstreamAvailable = searches.some((result) => result.status === "fulfilled");
    if (!upstreamAvailable) {
      return res.status(502).json({
        error: "Skywire Market Feed search is unavailable right now",
        feedType: "market",
        source: "app.bsky.feed.searchPosts",
        domains: SKYWIRE_MARKET_FEED_DOMAINS,
        urlPatterns: SKYWIRE_MARKET_FEED_SEARCH_TERMS,
        q: q?.trim() || SKYWIRE_MARKET_FEED_DOMAINS.map((domain) => SKYWIRE_MARKET_FEED_QUERY_BY_DOMAIN[domain]).join(" OR "),
        feed: [],
        cursor: null,
        upstreamAvailable: false,
        sessionFallback: false,
      });
    }
    return res.json({
      feedType: "market",
      source: "app.bsky.feed.searchPosts",
      domains: SKYWIRE_MARKET_FEED_DOMAINS,
      urlPatterns: SKYWIRE_MARKET_FEED_SEARCH_TERMS,
      q: q?.trim() || SKYWIRE_MARKET_FEED_DOMAINS.map((domain) => SKYWIRE_MARKET_FEED_QUERY_BY_DOMAIN[domain]).join(" OR "),
      feed,
      cursor: encodeMarketFeedCursor(nextCursors),
      upstreamAvailable,
      sessionFallback: false,
    });
  }
  const agent = getSearchAtprotoAgent();
  const searchQuery = feedSearchQuery(feedType, q);
  const feed = await agent.app.bsky.feed.searchPosts({
    q: searchQuery,
    sort: "latest",
    limit,
    cursor,
  });
  res.json({
    feedType,
    source: "app.bsky.feed.searchPosts",
    q: searchQuery,
    feed: (feed.data.posts ?? []).map((post) => normalizeFeedItem({ post })),
    cursor: feed.data.cursor ?? null,
    hitsTotal: feed.data.hitsTotal ?? null,
    upstreamAvailable: true,
    sessionFallback: false,
  });
});

router.get("/api/skywire/actors/recommended", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const parsed = actorRecommendationSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid actor recommendation query" });
  const rows = await db
    .select({
      did: atprotoAccounts.did,
      handle: atprotoAccounts.handle,
      displayName: atprotoAccounts.displayName,
      avatarUrl: atprotoAccounts.avatarUrl,
      description: atprotoAccounts.description,
      lastSyncedAt: atprotoAccounts.lastSyncedAt,
      wtfUserId: users.id,
      wtfUsername: users.username,
      wtfDisplayName: users.displayName,
    })
    .from(atprotoAccounts)
    .innerJoin(users, eq(users.id, atprotoAccounts.userId))
    .where(and(isNull(atprotoAccounts.disconnectedAt), ne(atprotoAccounts.userId, user.id)))
    .orderBy(desc(atprotoAccounts.lastSyncedAt), desc(atprotoAccounts.updatedAt))
    .limit(parsed.data.limit);
  res.json({
    actors: rows.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.displayName || row.wtfDisplayName || row.wtfUsername,
      avatar: row.avatarUrl,
      description: row.description,
      followersCount: 0,
      followsCount: 0,
      postsCount: 0,
      wtfUserId: row.wtfUserId,
      wtfUsername: row.wtfUsername,
    })),
    cursor: null,
    source: "wtf.atproto_accounts",
    upstreamAvailable: true,
  });
});

router.get("/api/skywire/actors/follows", isAuthenticated, async (req, res) => {
  const parsed = actorListSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid follows query" });
  const account = await requireLinkedAccount((req.user as any).id);
  const agent = getPublicAtprotoAgent();
  const follows = await agent.getFollows({
    actor: account.did,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  res.json({
    actors: (follows.data.follows ?? []).map(normalizeActor).filter(Boolean),
    cursor: follows.data.cursor ?? null,
    source: "app.bsky.graph.getFollows",
    upstreamAvailable: true,
    sessionFallback: false,
  });
});

router.get("/api/skywire/actors/suggestions", isAuthenticated, async (req, res) => {
  const parsed = actorSuggestionSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid actor suggestion query" });
  const account = await requireLinkedAccount((req.user as any).id);
  const agent = getPublicAtprotoAgent();
  const myFollows = await agent.getFollows({ actor: account.did, limit: 100 }).catch((err) => {
    console.warn("[skywire] own follows lookup failed for suggestions:", err);
    return null;
  });
  const blocked = new Set<string>([account.did.toLowerCase(), account.handle.toLowerCase()]);
  for (const actor of myFollows?.data.follows ?? []) {
    for (const key of actorIdentityKeys(actor)) blocked.add(key);
  }

  const peerRows = await db
    .select({
      did: atprotoAccounts.did,
      handle: atprotoAccounts.handle,
    })
    .from(atprotoAccounts)
    .where(and(isNull(atprotoAccounts.disconnectedAt), ne(atprotoAccounts.did, account.did)))
    .orderBy(desc(atprotoAccounts.lastSyncedAt), desc(atprotoAccounts.updatedAt))
    .limit(12);

  const suggestions = new Map<string, { actor: any; score: number; suggestedBy: Set<string> }>();
  const peerFollows = await Promise.allSettled(
    peerRows.map((peer) => agent.getFollows({ actor: peer.did, limit: 60 }))
  );
  peerFollows.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const peer = peerRows[index];
    for (const actor of result.value.data.follows ?? []) {
      const normalized = normalizeActor(actor);
      if (!normalized?.did) continue;
      const keys = actorIdentityKeys(normalized);
      if (keys.some((key) => blocked.has(key))) continue;
      const key = normalized.did.toLowerCase();
      const existing = suggestions.get(key) ?? { actor: normalized, score: 0, suggestedBy: new Set<string>() };
      existing.score += 1;
      existing.suggestedBy.add(peer.handle);
      suggestions.set(key, existing);
    }
  });

  const actors = [...suggestions.values()]
    .sort((a, b) => b.score - a.score || String(a.actor.handle).localeCompare(String(b.actor.handle)))
    .slice(0, parsed.data.limit)
    .map((entry) => ({
      ...entry.actor,
      suggestedByHandles: [...entry.suggestedBy].slice(0, 4),
      suggestionScore: entry.score,
    }));

  res.json({
    actors,
    cursor: null,
    source: "skywire.peerFollowGraph",
    upstreamAvailable: true,
    sessionFallback: false,
  });
});

router.get("/api/skywire/profile/:actor", async (req, res) => {
  const actor = req.params.actor;
  const agent = getPublicAtprotoAgent();
  const profile = await agent.getProfile({ actor });
  res.json(profile.data);
});

router.get("/api/skywire/actors/search", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const parsed = actorSearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Search text is required" });
  const account = await linkedAccountForUser(user.id);
  const agent = getPublicAtprotoAgent();
  const results = await agent.searchActors({ q: parsed.data.q, limit: parsed.data.limit }).catch((err) => {
    console.warn("[skywire] actor search failed:", err);
    return null;
  });
  const actors = results?.data.actors ?? [];
  await emitAtprotoSystemEvent({
    eventType: "atproto.actor.searched",
    userId: user.id,
    did: account?.did ?? `did:wtf:local-user-${user.id}`,
    handle: account?.handle ?? user.username ?? null,
    rawRefType: "atproto_actor_search",
    rawRefId: parsed.data.q,
    metadata: { resultCount: actors.length, upstreamAvailable: Boolean(results), sessionFallback: false },
  });
  res.json({
    actors,
    cursor: results?.data.cursor ?? null,
    upstreamAvailable: Boolean(results),
    sessionFallback: false,
  });
});

router.get("/api/skywire/actor/:actor/feed", isAuthenticated, async (req, res) => {
  const parsed = actorFeedSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid actor feed query" });
  const agent = getPublicAtprotoAgent();
  const actor = String(req.params.actor);
  const actorKey = actor.toLowerCase();
  const feed = await agent.getAuthorFeed({
    actor,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    filter: "posts_with_replies",
  });
  const normalizedFeed = (feed.data.feed ?? [])
    .map(normalizeFeedItem)
    .filter((item) => {
      const author = item.post.author;
      return author?.did.toLowerCase() === actorKey || author?.handle.toLowerCase() === actorKey;
    });
  res.json({
    feedType: "actor",
    source: "app.bsky.feed.getAuthorFeed",
    actor,
    feed: normalizedFeed,
    cursor: feed.data.cursor ?? null,
    sessionFallback: false,
  });
});

router.post("/api/skywire/follow", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = followSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid actor DID is required" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "socialActions", "be-social");
  if (parsed.data.did === account.did) return res.status(400).json({ error: "You cannot follow yourself" });
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.follow(parsed.data.did);
  await emitAtprotoSystemEvent({
    eventType: "atproto.actor.followed",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: result.uri,
    cid: result.cid,
    rawRefType: "atproto_follow",
    rawRefId: result.uri,
    metadata: { subjectDid: parsed.data.did },
  });
  res.status(201).json(result);
});

router.post("/api/skywire/profile", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid profile payload" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "profileWrite", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  await agent.upsertProfile((existing) => ({
    ...existing,
    displayName: parsed.data.displayName ?? existing?.displayName,
    description: parsed.data.description ?? existing?.description,
  }));
  const profile = await agent.getProfile({ actor: account.did });
  await db
    .update(atprotoAccounts)
    .set({
      displayName: profile.data.displayName ?? null,
      avatarUrl: profile.data.avatar ?? null,
      description: profile.data.description ?? null,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(atprotoAccounts.id, account.id));
  await emitAtprotoSystemEvent({
    eventType: "atproto.profile.updated",
    userId: user.id,
    did: account.did,
    handle: profile.data.handle,
    rawRefType: "atproto_profile",
    rawRefId: account.id,
  });
  res.json({ profile: profile.data });
});

router.get("/api/skywire/post/thread", isAuthenticated, async (req, res) => {
  const parsed = threadQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire thread query" });
  const user = req.user as any;
  const account = await requireLinkedAccount(user.id);
  const agent = await getAtprotoAgentForDid(account.did);
  const thread = await agent.getPostThread({
    uri: parsed.data.uri,
    depth: parsed.data.depth,
    parentHeight: parsed.data.parentHeight,
  });
  await emitAtprotoSystemEvent({
    eventId: skywireEventId("atproto.thread.viewed", `${user.id}:${parsed.data.uri}`),
    eventType: "atproto.thread.viewed",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: parsed.data.uri,
    rawRefType: "atproto_thread",
    rawRefId: parsed.data.uri,
    metadata: {
      source: "app.bsky.feed.getPostThread",
      depth: parsed.data.depth,
      parentHeight: parsed.data.parentHeight,
    },
  });
  res.json({
    uri: parsed.data.uri,
    source: "app.bsky.feed.getPostThread",
    thread: normalizeThreadNode(thread.data.thread),
  });
});

router.post("/api/skywire/post", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid post payload" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "compose", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const postRecord: any = {
    text: parsed.data.text,
    langs: parsed.data.langs,
  };
  if (parsed.data.embedUrl) {
    let fallbackTitle = "Skywire link";
    try {
      fallbackTitle = new URL(parsed.data.embedUrl).hostname;
    } catch {
      fallbackTitle = "Skywire link";
    }
    const external: any = {
      uri: parsed.data.embedUrl,
      title: parsed.data.embedTitle || fallbackTitle,
      description: parsed.data.embedDescription || "",
    };
    const thumb = await uploadSkywireExternalThumb(agent, parsed.data.embedThumbUrl);
    if (thumb) external.thumb = thumb;
    postRecord.embed = {
      $type: "app.bsky.embed.external",
      external,
    };
  }
  const result = await agent.post(postRecord);
  await emitAtprotoSystemEvent({
    eventId: skywireEventId("atproto.post.created", result.uri),
    eventType: "atproto.post.created",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: result.uri,
    cid: result.cid,
    text: parsed.data.text,
    challengeId: parsed.data.challengeId ?? null,
    rawRefType: "atproto_post",
    rawRefId: result.uri,
    metadata: {
      embedUrl: parsed.data.embedUrl ?? null,
      embedTitle: parsed.data.embedTitle ?? null,
      embedThumbUrl: parsed.data.embedThumbUrl ?? null,
    },
  });
  res.status(201).json({
    uri: result.uri,
    cid: result.cid,
    sourceUrl: sourceUrlForAtUri(result.uri),
    claimable: Boolean(parsed.data.challengeId),
  });
});

router.post("/api/skywire/post/claim", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid claim payload" });
  const account = await requireLinkedAccount(user.id);
  const ref = parseBskyPostRef(parsed.data.postUrlOrUri);
  const agent = await getAtprotoAgentForDid(account.did);
  const posts = await agent.getPosts({ uris: [ref.uri] });
  const post = posts.data.posts?.[0];
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.author.did !== account.did) {
    return res.status(403).json({ error: "Post actor DID does not match linked account" });
  }

  if (parsed.data.challengeId) {
    const [challenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, parsed.data.challengeId))
      .limit(1);
    if (!challenge) return res.status(404).json({ error: "Challenge not found" });
  }

  const text = typeof (post.record as any)?.text === "string" ? (post.record as any).text : "";
  const [claim] = await db
    .insert(atprotoPostClaims)
    .values({
      userId: user.id,
      challengeId: parsed.data.challengeId ?? null,
      did: account.did,
      handleAtClaimTime: account.handle,
      postUri: post.uri,
      postCid: post.cid,
      postText: text,
      claimedFor: parsed.data.claimedFor,
      verificationStatus: "verified",
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        atprotoPostClaims.userId,
        atprotoPostClaims.challengeId,
        atprotoPostClaims.claimedFor,
        atprotoPostClaims.postUri,
      ],
      set: {
        postCid: post.cid,
        postText: text,
        verificationStatus: "verified",
        rejectionReason: null,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  await emitAtprotoSystemEvent({
    eventId: skywireEventId("atproto.post.claimed", `${parsed.data.challengeId ?? "general"}:${post.uri}`),
    eventType: "atproto.post.claimed",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: post.uri,
    cid: post.cid,
    text,
    challengeId: parsed.data.challengeId ?? null,
    rawRefType: "atproto_post_claim",
    rawRefId: claim.id,
    metadata: { claimedFor: parsed.data.claimedFor },
  });
  res.status(201).json({ claim, sourceUrl: sourceUrlForAtUri(post.uri) });
});

router.post("/api/skywire/like", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = refSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.cid) return res.status(400).json({ error: "uri and cid are required" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "socialActions", "be-social");
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.like(parsed.data.uri, parsed.data.cid);
  await emitAtprotoSystemEvent({
    eventType: "atproto.post.liked",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: parsed.data.uri,
    cid: parsed.data.cid,
    rawRefType: "atproto_like",
    rawRefId: result.uri,
  });
  res.status(201).json(result);
});

router.post("/api/skywire/repost", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = refSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.cid) return res.status(400).json({ error: "uri and cid are required" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "socialActions", "be-social");
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.repost(parsed.data.uri, parsed.data.cid);
  await emitAtprotoSystemEvent({
    eventType: "atproto.post.reposted",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: parsed.data.uri,
    cid: parsed.data.cid,
    rawRefType: "atproto_repost",
    rawRefId: result.uri,
  });
  res.status(201).json(result);
});

router.post("/api/skywire/reply", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = refSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.cid) return res.status(400).json({ error: "uri, cid, and text are required" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "compose", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const root =
    parsed.data.rootUri && parsed.data.rootCid
      ? { uri: parsed.data.rootUri, cid: parsed.data.rootCid }
      : { uri: parsed.data.uri, cid: parsed.data.cid };
  const result = await agent.post({
    text: parsed.data.text || "",
    reply: {
      root,
      parent: { uri: parsed.data.uri, cid: parsed.data.cid },
    },
  });
  await emitAtprotoSystemEvent({
    eventType: "atproto.post.replied",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: result.uri,
    cid: result.cid,
    text: parsed.data.text || "",
    rawRefType: "atproto_reply",
    rawRefId: result.uri,
  });
  res.status(201).json(result);
});

router.post("/api/skywire/quote", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = refSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.cid) return res.status(400).json({ error: "uri, cid, and text are required" });
  const text = parsed.data.text || "";
  if (!text.trim()) return res.status(400).json({ error: "Quote text is required" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "compose", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.post({
    text,
    embed: {
      $type: "app.bsky.embed.record",
      record: strongRef(parsed.data.uri, parsed.data.cid),
    },
  });
  await emitAtprotoSystemEvent({
    eventType: "atproto.post.quoted",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: result.uri,
    cid: result.cid,
    text,
    rawRefType: "atproto_quote",
    rawRefId: result.uri,
    metadata: { quotedUri: parsed.data.uri, quotedCid: parsed.data.cid },
  });
  res.status(201).json(result);
});

router.get("/api/skywire/notifications", isAuthenticated, async (req, res) => {
  const account = await requireLinkedAccount((req.user as any).id);
  requireAtprotoCapability(account, "notifications", "be-safe");
  const agent = await getAtprotoAgentForDid(account.did);
  const list = await agent.listNotifications({ limit: 50 });
  res.json({
    ...list.data,
    notifications: (list.data.notifications ?? []).map(normalizeNotification),
  });
});

router.get("/api/skywire/signals", isAuthenticated, async (req, res) => {
  const account = await requireLinkedAccount((req.user as any).id);
  requireAtprotoCapability(account, "signals", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const records = await agent.com.atproto.repo.listRecords({
    repo: account.did,
    collection: SKYWIRE_SIGNAL_COLLECTION,
    limit: 50,
    reverse: true,
  });
  res.json({
    collection: SKYWIRE_SIGNAL_COLLECTION,
    records: records.data.records ?? [],
    cursor: records.data.cursor ?? null,
  });
});

router.post("/api/skywire/signals", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Skywire signal payload" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "signals", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const record = {
    $type: SKYWIRE_SIGNAL_COLLECTION,
    text: parsed.data.text,
    signalType: parsed.data.signalType,
    tags: parsed.data.tags,
    relatedUri: parsed.data.relatedUri || null,
    wtfUserId: user.id,
    wtfUsername: user.username ?? null,
    source: "wtfos.skywire",
    createdAt: new Date().toISOString(),
  };
  const result = await agent.com.atproto.repo.createRecord(
    {
      repo: account.did,
      collection: SKYWIRE_SIGNAL_COLLECTION,
      record,
      validate: false,
    },
    { encoding: "application/json" }
  );
  await emitAtprotoSystemEvent({
    eventType: "atproto.signal.published",
    userId: user.id,
    did: account.did,
    handle: account.handle,
    uri: result.data.uri,
    cid: result.data.cid,
    text: parsed.data.text,
    rawRefType: "atproto_signal",
    rawRefId: result.data.uri,
    metadata: {
      signalType: parsed.data.signalType,
      tags: parsed.data.tags,
      collection: SKYWIRE_SIGNAL_COLLECTION,
    },
  });
  res.status(201).json({
    collection: SKYWIRE_SIGNAL_COLLECTION,
    uri: result.data.uri,
    cid: result.data.cid,
    record,
  });
});

router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (!err) return next();
  const payload = atprotoSessionPayload(err);
  if (payload) return res.status(409).json(payload);
  res.status(Number(err.status) || 500).json({
    error: err.message || "Skywire request failed",
    code: err.code || undefined,
    action: err.action || undefined,
    capability: err.capability || undefined,
    requiredTier: err.requiredTier || undefined,
  });
});

export default router;
