import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { atprotoAccounts, atprotoPostClaims, challenges, users } from "@shared/schema";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import {
  accountHasAtprotoCapability,
  getAtprotoAgentForDid,
  getPublicAtprotoAgent,
  isAtprotoSessionUnavailableError,
} from "../features/atproto/oauth";
import {
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

const router = Router();

const postSchema = z.object({
  text: z.string().trim().min(1).max(300),
  langs: z.array(z.string().trim().min(2).max(12)).max(5).optional(),
  embedUrl: z.string().url().optional().nullable(),
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
  feedType: z.enum(["home", "following", "discover", "wtf", "tezos", "search"]).catch("home"),
  q: z.string().trim().min(1).max(160).optional(),
  cursor: z.string().trim().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
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

const SKYWIRE_SIGNAL_COLLECTION = "app.wtfgameshow.skywire.signal";

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

function atprotoSessionPayload(err: unknown) {
  if (!isAtprotoSessionUnavailableError(err)) return null;
  return {
    error: err.message,
    code: err.code,
    action: err.action,
    reason: err.reason,
  };
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

function normalizePostView(post: any) {
  const record = post?.record ?? {};
  const reply = record?.reply ?? null;
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
      external: embedExternal(post?.embed),
    },
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

function feedSearchQuery(feedType: string, q?: string): string {
  if (feedType === "tezos") return q || "(objkt OR teia OR fxhash OR tezos OR tez OR xtz OR .tez OR WTF)";
  return q || "(Bluesky OR ATProto OR AT Protocol)";
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

function actorIdentityKeys(actor: any): string[] {
  return [actor?.did, actor?.handle]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

router.get("/api/skywire/share-intent", (req, res) => {
  res.json({ url: buildBskyIntentUrl(String(req.query.text || "")) });
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
  const agent = getPublicAtprotoAgent();
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
  const uri = String(req.query.uri || "");
  if (!uri) return res.status(400).json({ error: "uri is required" });
  const account = await requireLinkedAccount((req.user as any).id);
  const agent = await getAtprotoAgentForDid(account.did);
  const thread = await agent.getPostThread({ uri });
  res.json(thread.data);
});

router.post("/api/skywire/post", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid post payload" });
  const account = await requireLinkedAccount(user.id);
  requireAtprotoCapability(account, "compose", "be-heard");
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.post({
    text: parsed.data.text,
    langs: parsed.data.langs,
  });
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
