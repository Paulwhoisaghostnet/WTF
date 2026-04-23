/**
 * Phase 7 — Mint Portal / tag detection watcher.
 *
 * Scans recent `wallet_events` of type `token_mint` and auto-creates
 * `challenge_submissions` rows when the minted token's metadata matches
 * an active challenge's binding (submissionTag / submissionContract /
 * submissionCuration).
 *
 * The watcher is idempotent: the matching row carries
 * `(mint_token_contract, mint_token_id, challenge_id)` as a partial
 * unique index, so repeated sweeps are safe.
 *
 * Scheduled from `server/lib/background-jobs.ts`; also callable ad-hoc
 * after a manual mint via the Mint Portal.
 */

import { db } from "../db";
import {
  challenges,
  challengeSubmissions,
  walletEvents,
  userWallets,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

const DEFAULT_LOOKBACK_HOURS = 24;

type ChallengeBinding = {
  id: number;
  submissionContract: string | null;
  submissionTag: string | null;
  submissionCuration: string | null;
};

export interface MintMatchStats {
  mintsScanned: number;
  submissionsCreated: number;
  bindingsActive: number;
}

function normalizeTag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase().replace(/^#/, "");
  return trimmed.length ? trimmed : null;
}

function extractMetadataTags(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const token = (raw as any).token;
  const metadata = token?.metadata;
  if (!metadata) return [];
  const out = new Set<string>();
  const tagsField = metadata.tags;
  if (Array.isArray(tagsField)) {
    for (const t of tagsField) {
      const n = normalizeTag(t);
      if (n) out.add(n);
    }
  } else if (typeof tagsField === "string") {
    for (const t of tagsField.split(/[,\s;]+/)) {
      const n = normalizeTag(t);
      if (n) out.add(n);
    }
  }
  const keywords = metadata.keywords;
  if (Array.isArray(keywords)) {
    for (const t of keywords) {
      const n = normalizeTag(t);
      if (n) out.add(n);
    }
  }
  return Array.from(out);
}

function extractCurationSlugs(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const token = (raw as any).token;
  const metadata = token?.metadata;
  if (!metadata) return [];
  const out = new Set<string>();
  const curations = (metadata as any).curations;
  const pushMaybe = (v: unknown) => {
    const n = normalizeTag(v);
    if (n) out.add(n);
  };
  if (Array.isArray(curations)) {
    for (const c of curations) {
      if (typeof c === "string") pushMaybe(c);
      else if (c && typeof c === "object") {
        pushMaybe((c as any).slug);
        pushMaybe((c as any).name);
        pushMaybe((c as any).id);
      }
    }
  } else if (typeof curations === "string") {
    pushMaybe(curations);
  }
  const collectionField = (metadata as any).collection;
  if (typeof collectionField === "string") pushMaybe(collectionField);
  else if (collectionField && typeof collectionField === "object") {
    pushMaybe((collectionField as any).slug);
    pushMaybe((collectionField as any).name);
    pushMaybe((collectionField as any).id);
  }
  return Array.from(out);
}

async function loadActiveBindings(): Promise<ChallengeBinding[]> {
  const rows = await db
    .select({
      id: challenges.id,
      submissionContract: challenges.submissionContract,
      submissionTag: challenges.submissionTag,
      submissionCuration: challenges.submissionCuration,
      status: challenges.status,
    })
    .from(challenges)
    .where(
      sql`(${challenges.submissionTag} IS NOT NULL OR ${challenges.submissionCuration} IS NOT NULL)
          AND ${challenges.status} IN ('active','grading')`
    );
  return rows.map((r) => ({
    id: r.id,
    submissionContract: r.submissionContract,
    submissionTag: r.submissionTag ? normalizeTag(r.submissionTag) : null,
    submissionCuration: r.submissionCuration
      ? normalizeTag(r.submissionCuration)
      : null,
  }));
}

function bindingMatches(
  binding: ChallengeBinding,
  event: {
    tokenContract: string | null;
    tags: string[];
    curations: string[];
  }
): boolean {
  if (
    binding.submissionContract &&
    (!event.tokenContract ||
      event.tokenContract.toLowerCase() !==
        binding.submissionContract.toLowerCase())
  ) {
    return false;
  }
  if (binding.submissionTag) {
    if (!event.tags.some((t) => t === binding.submissionTag)) return false;
  }
  if (binding.submissionCuration) {
    if (!event.curations.some((c) => c === binding.submissionCuration))
      return false;
  }
  return Boolean(
    binding.submissionTag ||
      binding.submissionCuration ||
      binding.submissionContract
  );
}

async function insertSubmissionIfMissing(params: {
  challengeId: number;
  userId: number;
  tokenContract: string;
  tokenId: string;
  opHash: string | null;
  rawUrl: string | null;
}): Promise<boolean> {
  const { challengeId, userId, tokenContract, tokenId, opHash, rawUrl } =
    params;
  const contentUrl =
    rawUrl || `objkt://${tokenContract}/${encodeURIComponent(tokenId)}`;
  try {
    const inserted = await db
      .insert(challengeSubmissions)
      .values({
        challengeId,
        userId,
        contentText: null,
        contentUrl,
        source: "mint_auto",
        mintTokenContract: tokenContract,
        mintTokenId: tokenId,
        mintOpHash: opHash,
      })
      .onConflictDoNothing()
      .returning({ id: challengeSubmissions.id });
    return inserted.length > 0;
  } catch (err) {
    console.warn(
      "[mint-matcher] submission insert failed",
      challengeId,
      tokenContract,
      tokenId,
      (err as Error).message
    );
    return false;
  }
}

export interface RunMintMatcherOptions {
  lookbackHours?: number;
  sinceEventId?: number;
}

export async function runMintChallengeMatcher(
  opts: RunMintMatcherOptions = {}
): Promise<MintMatchStats> {
  const bindings = await loadActiveBindings();
  const stats: MintMatchStats = {
    mintsScanned: 0,
    submissionsCreated: 0,
    bindingsActive: bindings.length,
  };
  if (bindings.length === 0) return stats;

  const since = new Date(
    Date.now() -
      (opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS) * 60 * 60 * 1000
  );

  const filters = [
    eq(walletEvents.eventType, "token_mint"),
    gte(walletEvents.timestamp, since),
    isNotNull(walletEvents.tokenContract),
    isNotNull(walletEvents.tokenId),
  ];
  if (opts.sinceEventId && opts.sinceEventId > 0) {
    filters.push(gte(walletEvents.id, opts.sinceEventId));
  }

  const events = await db
    .select({
      id: walletEvents.id,
      userId: walletEvents.userId,
      tokenContract: walletEvents.tokenContract,
      tokenId: walletEvents.tokenId,
      opHash: walletEvents.opHash,
      raw: walletEvents.raw,
      timestamp: walletEvents.timestamp,
      tokenName: walletEvents.tokenName,
      tokenThumbnail: walletEvents.tokenThumbnail,
    })
    .from(walletEvents)
    .where(and(...filters))
    .orderBy(desc(walletEvents.timestamp))
    .limit(5000);

  stats.mintsScanned = events.length;
  for (const ev of events) {
    if (!ev.tokenContract || !ev.tokenId || ev.userId == null) continue;
    const tags = extractMetadataTags(ev.raw);
    const curations = extractCurationSlugs(ev.raw);
    for (const binding of bindings) {
      const ok = bindingMatches(binding, {
        tokenContract: ev.tokenContract,
        tags,
        curations,
      });
      if (!ok) continue;
      const created = await insertSubmissionIfMissing({
        challengeId: binding.id,
        userId: ev.userId,
        tokenContract: ev.tokenContract,
        tokenId: ev.tokenId,
        opHash: ev.opHash,
        rawUrl:
          (ev.raw as any)?.token?.metadata?.artifactUri ||
          (ev.raw as any)?.token?.metadata?.displayUri ||
          null,
      });
      if (created) stats.submissionsCreated += 1;
    }
  }
  return stats;
}

/**
 * Run the matcher scoped to a single user — called after the Mint Portal
 * detects a mint for them so we don't wait for the next scheduled sweep.
 */
export async function runMintChallengeMatcherForUser(
  userId: number,
  lookbackHours = 2
): Promise<MintMatchStats> {
  const bindings = await loadActiveBindings();
  const stats: MintMatchStats = {
    mintsScanned: 0,
    submissionsCreated: 0,
    bindingsActive: bindings.length,
  };
  if (bindings.length === 0) return stats;

  const wallets = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  if (wallets.length === 0) return stats;

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const events = await db
    .select({
      id: walletEvents.id,
      userId: walletEvents.userId,
      tokenContract: walletEvents.tokenContract,
      tokenId: walletEvents.tokenId,
      opHash: walletEvents.opHash,
      raw: walletEvents.raw,
    })
    .from(walletEvents)
    .where(
      and(
        eq(walletEvents.userId, userId),
        eq(walletEvents.eventType, "token_mint"),
        gte(walletEvents.timestamp, since),
        isNotNull(walletEvents.tokenContract),
        isNotNull(walletEvents.tokenId)
      )
    )
    .orderBy(desc(walletEvents.timestamp))
    .limit(200);

  stats.mintsScanned = events.length;
  for (const ev of events) {
    if (!ev.tokenContract || !ev.tokenId || ev.userId == null) continue;
    const tags = extractMetadataTags(ev.raw);
    const curations = extractCurationSlugs(ev.raw);
    for (const binding of bindings) {
      const ok = bindingMatches(binding, {
        tokenContract: ev.tokenContract,
        tags,
        curations,
      });
      if (!ok) continue;
      const created = await insertSubmissionIfMissing({
        challengeId: binding.id,
        userId: ev.userId,
        tokenContract: ev.tokenContract,
        tokenId: ev.tokenId,
        opHash: ev.opHash,
        rawUrl:
          (ev.raw as any)?.token?.metadata?.artifactUri ||
          (ev.raw as any)?.token?.metadata?.displayUri ||
          null,
      });
      if (created) stats.submissionsCreated += 1;
    }
  }
  return stats;
}

export const __testing = {
  extractMetadataTags,
  extractCurationSlugs,
  bindingMatches,
  normalizeTag,
};
