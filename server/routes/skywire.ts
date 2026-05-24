import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { atprotoAccounts, atprotoPostClaims, challenges } from "@shared/schema";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import { getAtprotoAgentForDid, getPublicAtprotoAgent } from "../features/atproto/oauth";
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
});

const actorSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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

router.get("/api/skywire/share-intent", (req, res) => {
  res.json({ url: buildBskyIntentUrl(String(req.query.text || "")) });
});

router.get("/api/skywire/feed", isAuthenticated, async (req, res) => {
  const feedType = String(req.query.feedType || "wtf");
  const account = await linkedAccountForUser((req.user as any).id);
  const agent = account ? await getAtprotoAgentForDid(account.did) : getPublicAtprotoAgent();
  if (feedType === "following" && account) {
    const timeline = await agent.getTimeline({ limit: 40 });
    return res.json({ feedType, feed: timeline.data.feed ?? [] });
  }
  const q =
    feedType === "tezos"
      ? "(objkt OR teia OR fxhash OR tezos OR tez OR xtz OR .tez OR WTF)"
      : feedType === "mentions" && account
        ? account.handle
        : "(WTF OR wtfgameshow OR Skywire)";
  const feed = await agent.app.bsky.feed.searchPosts({ q, limit: 40 });
  res.json({ feedType, feed: feed.data.posts ?? [] });
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
  const agent = account ? await getAtprotoAgentForDid(account.did) : getPublicAtprotoAgent();
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
    metadata: { resultCount: actors.length, upstreamAvailable: Boolean(results) },
  });
  res.json({
    actors,
    cursor: results?.data.cursor ?? null,
    upstreamAvailable: Boolean(results),
  });
});

router.get("/api/skywire/actor/:actor/feed", isAuthenticated, async (req, res) => {
  const account = await linkedAccountForUser((req.user as any).id);
  const agent = account ? await getAtprotoAgentForDid(account.did) : getPublicAtprotoAgent();
  const feed = await agent.getAuthorFeed({
    actor: String(req.params.actor),
    limit: 40,
    filter: "posts_no_replies",
  });
  res.json({ actor: req.params.actor, feed: feed.data.feed ?? [], cursor: feed.data.cursor ?? null });
});

router.post("/api/skywire/follow", isAuthenticated, actionLimiter, async (req, res) => {
  const user = req.user as any;
  const parsed = followSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid actor DID is required" });
  const account = await requireLinkedAccount(user.id);
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
  const agent = await getAtprotoAgentForDid(account.did);
  const result = await agent.post({
    text: parsed.data.text || "",
    reply: {
      root: { uri: parsed.data.uri, cid: parsed.data.cid },
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
  const agent = await getAtprotoAgentForDid(account.did);
  const list = await agent.listNotifications({ limit: 50 });
  res.json(list.data);
});

router.get("/api/skywire/signals", isAuthenticated, async (req, res) => {
  const account = await requireLinkedAccount((req.user as any).id);
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
  res.status(Number(err.status) || 500).json({ error: err.message || "Skywire request failed" });
});

export default router;
