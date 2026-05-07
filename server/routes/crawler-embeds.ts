import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  boardThreadReplies,
  boardThreads,
  dmConversations,
  dmMessages,
  tokenMetadata,
  users,
  xDmEvents,
  xTimelinePosts,
} from "@shared/schema";
import { requestLooksLikeCrawler } from "../lib/crawler-detect";
import {
  absoluteUrl,
  compactText,
  requestBaseUrl,
  sendCrawlerPreview,
  type CrawlerPreview,
} from "../lib/crawler-preview";
import { canViewChannel, getChannelPerms } from "../lib/board-channel-permissions";
import { getWGroupchatConversationIds } from "../features/w/message-routes";
import { getRecaptureLeaderboard } from "../lib/wtf-recapture-watcher";
import { formatWtf, getXpTierForTotal } from "@shared/types";
import { sanitizeThumbnailUrl } from "../lib/thumbnail-url";

const router = Router();

type CrawlerHandler = (req: Request, res: Response) => Promise<void>;

function crawlerOnly(handler: CrawlerHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requestLooksLikeCrawler(req)) return next();
    handler(req, res).catch(next);
  };
}

function isMissingDbObject(err: unknown): boolean {
  const cause = (err as any)?.cause;
  const code = cause?.code || (err as any)?.code;
  return code === "42P01" || code === "42703";
}

async function safePreview(
  label: string,
  fallback: CrawlerPreview,
  load: () => Promise<CrawlerPreview>
): Promise<CrawlerPreview> {
  try {
    return await load();
  } catch (err) {
    if (isMissingDbObject(err)) {
      console.warn(`[crawler-preview] ${label} preview fell back:`, (err as any)?.cause?.message || err);
      return fallback;
    }
    throw err;
  }
}

function asPositiveInt(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function firstImageAttachment(
  attachments: unknown,
  req: Request
): string | null {
  if (!Array.isArray(attachments)) return null;
  const hit = attachments.find((attachment) => {
    const row = attachment as Record<string, unknown>;
    return row?.type === "image" && typeof row.url === "string" && row.url.trim();
  }) as Record<string, unknown> | undefined;
  return typeof hit?.url === "string" ? absoluteUrl(req, hit.url) : null;
}

async function isPublicBoardChannel(channel: typeof boardThreads.$inferSelect): Promise<boolean> {
  if (!channel.active) return false;
  const perms = await getChannelPerms(channel.id);
  return canViewChannel(channel, perms, "witness", null);
}

async function boardPreview(req: Request): Promise<CrawlerPreview> {
  const messageId = asPositiveInt(req.params.messageId || req.query.message);
  const channelId = asPositiveInt(req.params.channelId || req.query.channel);

  if (messageId) {
    const [row] = await db
      .select({
        message: boardThreadReplies,
        channel: boardThreads,
        username: users.username,
        displayName: users.displayName,
      })
      .from(boardThreadReplies)
      .innerJoin(boardThreads, eq(boardThreadReplies.threadId, boardThreads.id))
      .leftJoin(users, eq(boardThreadReplies.userId, users.id))
      .where(eq(boardThreadReplies.id, messageId))
      .limit(1);

    if (row && (await isPublicBoardChannel(row.channel))) {
      const author = row.displayName || row.username || "WTF user";
      const description =
        compactText(row.message.content, 220) ||
        "Open this board message on WTF.";
      return {
        title: `${author} in #${row.channel.title}`,
        description,
        canonicalUrl: absoluteUrl(
          req,
          `/messageboard?channel=${row.channel.id}&message=${row.message.id}`
        ),
        imageUrl: firstImageAttachment(row.message.attachments, req),
        label: "Message Board",
        accent: "#2f6fdd",
      };
    }
  }

  if (channelId) {
    const [channel] = await db
      .select()
      .from(boardThreads)
      .where(eq(boardThreads.id, channelId))
      .limit(1);

    if (channel && (await isPublicBoardChannel(channel))) {
      const [latest] = await db
        .select({
          content: boardThreadReplies.content,
          attachments: boardThreadReplies.attachments,
          username: users.username,
          displayName: users.displayName,
        })
        .from(boardThreadReplies)
        .leftJoin(users, eq(boardThreadReplies.userId, users.id))
        .where(eq(boardThreadReplies.threadId, channel.id))
        .orderBy(desc(boardThreadReplies.createdAt))
        .limit(1);

      const author = latest?.displayName || latest?.username || "WTF";
      const latestText = latest?.content
        ? `Latest from ${author}: ${latest.content}`
        : "";
      return {
        title: `#${channel.title} on WTF Message Board`,
        description:
          compactText(channel.topic || latestText || channel.body, 240) ||
          "Open this WTF message board channel.",
        canonicalUrl: absoluteUrl(req, `/messageboard?channel=${channel.id}`),
        imageUrl: firstImageAttachment(latest?.attachments, req),
        label: "Message Board",
        accent: "#2f6fdd",
      };
    }
  }

  const channels = await db
    .select()
    .from(boardThreads)
    .where(eq(boardThreads.active, true))
    .orderBy(desc(boardThreads.updatedAt))
    .limit(12);
  const publicChannels: typeof channels = [];
  for (const channel of channels) {
    if (await isPublicBoardChannel(channel)) publicChannels.push(channel);
    if (publicChannels.length >= 4) break;
  }

  const names = publicChannels.map((channel) => `#${channel.title}`).join(", ");
  return {
    title: "WTF Message Board",
    description: names
      ? `Latest public channels: ${names}.`
      : "Read public WTF board channels and messages.",
    canonicalUrl: absoluteUrl(req, "/messageboard"),
    label: "Message Board",
    accent: "#2f6fdd",
  };
}

function mediaPreviewImage(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  const hit = media.find((row: any) => row?.previewUrl || row?.url);
  return String((hit as any)?.previewUrl || (hit as any)?.url || "").trim() || null;
}

function linkPreviewImage(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const hit = links.find((row: any) => row?.preview?.imageUrl);
  return String((hit as any)?.preview?.imageUrl || "").trim() || null;
}

function pickMetadataString(meta: unknown, keys: string[]): string | null {
  const row = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function tokenPreviewImage(row: {
  thumbnail?: string | null;
  displayUri?: string | null;
  artifactUri?: string | null;
  raw?: unknown;
}): string | null {
  return (
    sanitizeThumbnailUrl(row.thumbnail) ||
    sanitizeThumbnailUrl(row.displayUri) ||
    sanitizeThumbnailUrl(row.artifactUri) ||
    sanitizeThumbnailUrl(pickMetadataString(row.raw, ["thumbnailUri", "thumbnail_uri"])) ||
    sanitizeThumbnailUrl(pickMetadataString(row.raw, ["displayUri", "display_uri", "image"])) ||
    sanitizeThumbnailUrl(pickMetadataString(row.raw, ["artifactUri", "artifact_uri"])) ||
    null
  );
}

async function wTimelinePreview(req: Request): Promise<CrawlerPreview> {
  const postId = String(req.params.postId || req.query.post || "").trim();
  if (postId) {
    const [post] = await db
      .select()
      .from(xTimelinePosts)
      .where(eq(xTimelinePosts.id, postId))
      .limit(1);
    if (post) {
      return {
        title: `@${post.authorHandle} on W`,
        description:
          compactText(post.displayText || post.text, 240) ||
          "Open this W post in WTF.",
        canonicalUrl: absoluteUrl(req, `/w/post/${post.id}`),
        imageUrl: mediaPreviewImage(post.media) || linkPreviewImage(post.links),
        label: "W Timeline",
        accent: "#4b9f6a",
      };
    }
  }

  const posts = await db
    .select()
    .from(xTimelinePosts)
    .orderBy(desc(xTimelinePosts.createdAt))
    .limit(4);
  const summary = posts
    .map((post) => `@${post.authorHandle}: ${compactText(post.displayText || post.text, 80)}`)
    .filter(Boolean)
    .join(" / ");
  return {
    title: "W Timeline",
    description: summary || "Follow the WTF-adjacent X timeline inside W.",
    canonicalUrl: absoluteUrl(req, "/w"),
    imageUrl: mediaPreviewImage(posts[0]?.media) || linkPreviewImage(posts[0]?.links),
    label: "W",
    accent: "#4b9f6a",
  };
}

function normalizeXConversationId(id: string | null | undefined): string {
  return String(id || "").trim().toLowerCase().replace(/^g/i, "");
}

async function wGroupchatPreview(req: Request): Promise<CrawlerPreview> {
  const configuredIds = await getWGroupchatConversationIds();
  const requested = String(req.params.conversationId || req.query.conversation || "").trim();
  const selected = requested || configuredIds[0] || "";
  const ids = Array.from(
    new Set((selected ? [selected] : configuredIds).map(normalizeXConversationId).filter(Boolean))
  );

  const rows = ids.length
    ? await db
        .select()
        .from(xDmEvents)
        .where(
          inArray(
            sql<string>`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '')`,
            ids
          )
        )
        .orderBy(desc(xDmEvents.createdAt))
        .limit(5)
    : [];

  const latest = rows[0];
  const senderData = (latest?.senderData || {}) as Record<string, unknown>;
  const sender = String(senderData.username || senderData.name || "").trim();
  const latestLine = latest?.text
    ? `${sender ? `@${sender}: ` : ""}${latest.text}`
    : "";

  return {
    title: "W Group Chat",
    description:
      compactText(latestLine, 220) ||
      "Open the official W group chat mirror inside WTF.",
    canonicalUrl: absoluteUrl(req, selected ? `/w/groupchat/${selected}` : "/w/chat"),
    label: "W Chat",
    accent: "#4b9f6a",
  };
}

async function privateInboxPreview(req: Request): Promise<CrawlerPreview> {
  return {
    title: "WTF Inbox",
    description: "Private DMs and Studio chats are available after signing in to WTF.",
    canonicalUrl: absoluteUrl(req, "/messages"),
    label: "Private Messages",
    accent: "#6d8f2f",
  };
}

async function studioChatPreview(req: Request): Promise<CrawlerPreview> {
  const conversationId = asPositiveInt(req.params.conversationId || req.query.conversation);
  if (conversationId) {
    const [conversation] = await db
      .select({
        id: dmConversations.id,
        title: dmConversations.title,
        conversationType: dmConversations.conversationType,
        latestContent: dmMessages.content,
      })
      .from(dmConversations)
      .leftJoin(dmMessages, eq(dmMessages.conversationId, dmConversations.id))
      .where(
        and(
          eq(dmConversations.id, conversationId),
          eq(dmConversations.conversationType, "studio")
        )
      )
      .orderBy(desc(dmMessages.createdAt))
      .limit(1);
    if (conversation) {
      return {
        title: conversation.title || "Studio Chat",
        description:
          compactText(conversation.latestContent, 220) ||
          "A private WTF Studio project chat.",
        canonicalUrl: absoluteUrl(req, `/messages?conversation=${conversation.id}`),
        label: "Studio Chat",
        accent: "#e0aa2f",
      };
    }
  }

  return privateInboxPreview(req);
}

async function dickswordPreview(req: Request): Promise<CrawlerPreview> {
  return {
    title: "Dicksword",
    description:
      "Discord identity, XP, avatar layers, and WTF community activity wired into the app.",
    canonicalUrl: absoluteUrl(req, "/dicksword"),
    label: "Discord",
    accent: "#5865f2",
  };
}

async function leaderboardPreview(req: Request): Promise<CrawlerPreview> {
  const rows = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      experiencePoints: users.experiencePoints,
      role: users.role,
    })
    .from(users)
    .orderBy(desc(users.experiencePoints), desc(users.id))
    .limit(3);

  const leaders = rows
    .map((row, index) => {
      const name = row.displayName || row.username;
      const xp = row.experiencePoints ?? 0;
      return `#${index + 1} ${name} (${xp.toLocaleString()} XP)`;
    })
    .join(" / ");

  return {
    title: "WTF Leaderboard",
    description:
      leaders ||
      "Track top WTF token holders, XP grinders, transfers, and community standings.",
    canonicalUrl: absoluteUrl(req, "/leaderboard"),
    label: "Leaderboard",
    accent: "#d6b03f",
  };
}

async function recapturePreview(req: Request): Promise<CrawlerPreview> {
  const entries = await getRecaptureLeaderboard({ limit: 3 });
  const userIds = entries
    .map((entry) => entry.userId)
    .filter((id): id is number => typeof id === "number");
  const userRows = userIds.length
    ? await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
        })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRows.map((row) => [row.id, row]));
  const leaders = entries
    .map((entry, index) => {
      const user = entry.userId ? userMap.get(entry.userId) : null;
      const name = user?.displayName || user?.username || entry.walletAddress;
      return `#${index + 1} ${name} (${formatWtf(entry.totalWtf)} WTF)`;
    })
    .join(" / ");

  return {
    title: "WTF Recapture",
    description:
      leaders ||
      "Follow operator-wallet recapture flows, buyback credits, and WTF leaderboard movement.",
    canonicalUrl: absoluteUrl(req, "/wtf-recapture"),
    label: "Recapture",
    accent: "#c95f39",
  };
}

async function publicProfilePreview(req: Request): Promise<CrawlerPreview> {
  const username = String(req.params.username || "").trim().toLowerCase();
  const [row] = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      pfpImageUrl: users.pfpImageUrl,
      experiencePoints: users.experiencePoints,
      twitterHandle: users.twitterHandle,
      twitterPublic: users.twitterPublic,
      twitterVerified: users.twitterVerified,
      discordHandle: users.discordHandle,
      discordPublic: users.discordPublic,
      discordVerified: users.discordVerified,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!row) {
    return {
      title: "WTF User Profile",
      description: "Open this WTF public profile.",
      canonicalUrl: absoluteUrl(req, `/user/${encodeURIComponent(username)}`),
      label: "Profile",
      accent: "#7c5bd6",
    };
  }

  const xp = row.experiencePoints ?? 0;
  const tier = getXpTierForTotal(xp);
  const social: string[] = [];
  if (row.twitterPublic && row.twitterHandle) {
    social.push(`X @${row.twitterHandle}${row.twitterVerified ? " verified" : ""}`);
  }
  if (row.discordPublic && row.discordHandle) {
    social.push(`Discord ${row.discordHandle}${row.discordVerified ? " verified" : ""}`);
  }
  const summaryParts = [
    compactText(row.bio, 150),
    `${xp.toLocaleString()} XP (${tier.label})`,
    social.join(" / "),
  ].filter(Boolean);

  return {
    title: `${row.displayName || row.username} on WTF`,
    description: compactText(summaryParts.join(" / "), 240) || "Open this WTF public profile.",
    canonicalUrl: absoluteUrl(req, `/user/${encodeURIComponent(row.username)}`),
    imageUrl: row.pfpImageUrl || row.avatarUrl || null,
    label: row.role || "Profile",
    accent: "#7c5bd6",
  };
}

async function galleryPreview(req: Request): Promise<CrawlerPreview> {
  const rows = await db
    .select({
      name: tokenMetadata.name,
      description: tokenMetadata.description,
      thumbnail: tokenMetadata.thumbnail,
      displayUri: tokenMetadata.displayUri,
      artifactUri: tokenMetadata.artifactUri,
      raw: tokenMetadata.raw,
      updatedAt: tokenMetadata.updatedAt,
    })
    .from(tokenMetadata)
    .orderBy(desc(tokenMetadata.updatedAt))
    .limit(4);

  const names = rows
    .map((row) => row.name || pickMetadataString(row.raw, ["name"]))
    .filter(Boolean)
    .join(", ");

  return {
    title: "WTF Gallery",
    description: names
      ? `Recently indexed tokens: ${names}.`
      : "Explore WTF survival tokens, art drops, and indexed Tezos media.",
    canonicalUrl: absoluteUrl(req, "/gallery"),
    imageUrl: rows.map(tokenPreviewImage).find(Boolean) || null,
    label: "Gallery",
    accent: "#168f87",
  };
}

async function galleryTokenPreview(req: Request): Promise<CrawlerPreview> {
  const contract = String(req.params.contract || "").trim();
  const tokenId = String(req.params.tokenId || "").trim();
  const [row] = await db
    .select({
      tokenContract: tokenMetadata.tokenContract,
      tokenId: tokenMetadata.tokenId,
      name: tokenMetadata.name,
      description: tokenMetadata.description,
      thumbnail: tokenMetadata.thumbnail,
      displayUri: tokenMetadata.displayUri,
      artifactUri: tokenMetadata.artifactUri,
      mimeType: tokenMetadata.mimeType,
      creatorAddress: tokenMetadata.creatorAddress,
      supply: tokenMetadata.supply,
      raw: tokenMetadata.raw,
    })
    .from(tokenMetadata)
    .where(and(eq(tokenMetadata.tokenContract, contract), eq(tokenMetadata.tokenId, tokenId)))
    .limit(1);

  if (!row) {
    return {
      title: `Tezos Token ${contract} #${tokenId}`,
      description: "Open this Tezos token reference in the WTF gallery.",
      canonicalUrl: absoluteUrl(req, `/gallery/token/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`),
      label: "Token",
      accent: "#168f87",
    };
  }

  const title = row.name || pickMetadataString(row.raw, ["name"]) || `Token #${row.tokenId}`;
  const creator =
    row.creatorAddress ||
    pickMetadataString(row.raw, ["creator", "artist"]) ||
    "Tezos";
  const details = [
    row.description || pickMetadataString(row.raw, ["description"]),
    `by ${creator}`,
    row.mimeType || pickMetadataString(row.raw, ["mimeType", "mime_type", "mime"]),
    row.supply ? `${row.supply.toLocaleString()} editions` : null,
  ].filter(Boolean);

  return {
    title: `${title} on WTF`,
    description: compactText(details.join(" / "), 260) || "Open this indexed Tezos token in the WTF gallery.",
    canonicalUrl: absoluteUrl(req, `/gallery/token/${encodeURIComponent(row.tokenContract)}/${encodeURIComponent(row.tokenId)}`),
    imageUrl: tokenPreviewImage(row),
    label: "Tezos Token",
    accent: "#168f87",
  };
}

router.get(
  [
    "/messageboard",
    "/messageboard/channels/:channelId",
    "/messageboard/messages/:messageId",
  ],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "messageboard",
        {
          title: "WTF Message Board",
          description: "Read public WTF board channels and messages.",
          canonicalUrl: absoluteUrl(req, "/messageboard"),
          label: "Message Board",
          accent: "#2f6fdd",
        },
        () => boardPreview(req)
      )
    );
  })
);

router.get(
  ["/w", "/w/timeline", "/w/post/:postId"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "w-timeline",
        {
          title: "W Timeline",
          description: "Follow the WTF-adjacent X timeline inside W.",
          canonicalUrl: absoluteUrl(req, "/w"),
          label: "W",
          accent: "#4b9f6a",
        },
        () => wTimelinePreview(req)
      )
    );
  })
);

router.get(
  ["/w/chat", "/w/groupchat", "/w/groupchat/:conversationId", "/chat", "/chat/:conversationId"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "w-chat",
        {
          title: "W Group Chat",
          description: "Open the official W group chat mirror inside WTF.",
          canonicalUrl: absoluteUrl(req, "/w/chat"),
          label: "W Chat",
          accent: "#4b9f6a",
        },
        () => wGroupchatPreview(req)
      )
    );
  })
);

router.get(
  ["/messages", "/messages/dms/:conversationId", "/messages/dms/:conversationId/messages/:messageId"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(res, await privateInboxPreview(req));
  })
);

router.get(
  ["/studio/chat", "/studio/chat/:conversationId"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "studio-chat",
        {
          title: "Studio Chat",
          description: "Private WTF Studio project chat.",
          canonicalUrl: absoluteUrl(req, "/messages"),
          label: "Studio Chat",
          accent: "#e0aa2f",
        },
        () => studioChatPreview(req)
      )
    );
  })
);

router.get(
  ["/dicksword"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(res, await dickswordPreview(req));
  })
);

router.get(
  ["/leaderboard"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "leaderboard",
        {
          title: "WTF Leaderboard",
          description: "Track top WTF token holders, XP grinders, transfers, and community standings.",
          canonicalUrl: absoluteUrl(req, "/leaderboard"),
          label: "Leaderboard",
          accent: "#d6b03f",
        },
        () => leaderboardPreview(req)
      )
    );
  })
);

router.get(
  ["/wtf-recapture"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "wtf-recapture",
        {
          title: "WTF Recapture",
          description: "Follow operator-wallet recapture flows, buyback credits, and WTF leaderboard movement.",
          canonicalUrl: absoluteUrl(req, "/wtf-recapture"),
          label: "Recapture",
          accent: "#c95f39",
        },
        () => recapturePreview(req)
      )
    );
  })
);

router.get(
  ["/user/:username", "/users/:username"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "public-profile",
        {
          title: "WTF User Profile",
          description: "Open this WTF public profile.",
          canonicalUrl: absoluteUrl(req, `/user/${encodeURIComponent(String(req.params.username || ""))}`),
          label: "Profile",
          accent: "#7c5bd6",
        },
        () => publicProfilePreview(req)
      )
    );
  })
);

router.get(
  ["/gallery"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "gallery",
        {
          title: "WTF Gallery",
          description: "Explore WTF survival tokens, art drops, and indexed Tezos media.",
          canonicalUrl: absoluteUrl(req, "/gallery"),
          label: "Gallery",
          accent: "#168f87",
        },
        () => galleryPreview(req)
      )
    );
  })
);

router.get(
  ["/gallery/token/:contract/:tokenId", "/token/:contract/:tokenId"],
  crawlerOnly(async (req, res) => {
    sendCrawlerPreview(
      res,
      await safePreview(
        "gallery-token",
        {
          title: "WTF Tezos Token",
          description: "Open this indexed Tezos token in the WTF gallery.",
          canonicalUrl: absoluteUrl(
            req,
            `/gallery/token/${encodeURIComponent(String(req.params.contract || ""))}/${encodeURIComponent(String(req.params.tokenId || ""))}`
          ),
          label: "Tezos Token",
          accent: "#168f87",
        },
        () => galleryTokenPreview(req)
      )
    );
  })
);

router.get("/api/crawler-preview/status", (_req, res) => {
  res.json({
    ok: true,
    origin: requestBaseUrl(_req),
    routes: [
      "/messageboard",
      "/messageboard/channels/:channelId",
      "/messageboard/messages/:messageId",
      "/w",
      "/w/post/:postId",
      "/w/chat",
      "/chat/:conversationId",
      "/messages",
      "/studio/chat/:conversationId",
      "/dicksword",
      "/leaderboard",
      "/wtf-recapture",
      "/user/:username",
      "/gallery",
      "/gallery/token/:contract/:tokenId",
      "/token/:contract/:tokenId",
    ],
  });
});

export default router;
